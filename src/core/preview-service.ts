import type { GuestSocket, KernelHandle } from "unkernel";
import { networkStore } from "./network-store.ts";

interface RelayRequest {
  t: "kw-vm-fetch";
  vmId: string;
  port: number;
  method: string;
  path: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
}

const SKIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
]);

const MAX_ACTIVE = 8;
const CREDITS = 4;

/**
 * Bridges guest HTTP & WebSocket traffic (through /vm-sw.js & /vm-ws.js)
 * directly to the running unkernel VM over vsock (vm.fetch & vm.connect).
 */
export class GuestPreviewRelay {
  public readonly vmId: string;
  private vm: KernelHandle | null = null;
  private swReady: Promise<void> | null = null;
  private active = 0;
  private waiting: Array<() => void> = [];
  private wsChan: BroadcastChannel | null = null;
  private wsSockets = new Map<string, { sock: GuestSocket | null; closed: boolean }>();
  private lockRelease: (() => void) | null = null;
  private attachedListener = false;

  constructor() {
    this.vmId = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }

  public static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator && window.isSecureContext;
  }

  private baseUrl(): string {
    return (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  }

  public previewUrl(port: number, path = "/"): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl()}vm/${this.vmId}/${port}${clean}`;
  }

  public attach(vm: KernelHandle | null): void {
    this.vm = vm;
    if (!vm) {
      this.closeAllSockets();
      return;
    }
    this.ensureServiceWorker();
    this.ensureWsBridge();
  }

  public async ready(): Promise<void> {
    if (!GuestPreviewRelay.isSupported()) {
      throw new Error("Guest preview requires a secure context (https or localhost) for Service Workers.");
    }
    this.ensureServiceWorker();
    if (this.swReady) await this.swReady;
  }

  private ensureServiceWorker(): void {
    if (!GuestPreviewRelay.isSupported()) return;
    if (!this.attachedListener) {
      this.attachedListener = true;
      navigator.serviceWorker.addEventListener("message", this.onSwMessage);
      navigator.serviceWorker.startMessages();
    }
    if (!this.swReady) {
      this.swReady = (async () => {
        const base = this.baseUrl();
        const reg = await navigator.serviceWorker.register(`${base}vm-sw.js`, {
          scope: `${base}vm/`,
          updateViaCache: "none",
        });
        if (reg.active) {
          reg.update().catch(() => {});
          return;
        }
        const worker = reg.installing ?? reg.waiting;
        if (!worker) return;
        await new Promise<void>((resolve, reject) => {
          const onChange = () => {
            if (worker.state === "activated") resolve();
            else if (worker.state === "redundant") reject(new Error("Service worker failed to activate"));
          };
          worker.addEventListener("statechange", onChange);
          onChange();
        });
      })();
    }
  }

  private onSwMessage = (e: MessageEvent) => {
    const d = e.data as Partial<RelayRequest> | null;
    const port = e.ports[0];
    if (!port || d?.t !== "kw-vm-fetch" || d.vmId !== this.vmId) return;
    port.postMessage({ t: "accept" });
    void this.serveFetch(d as RelayRequest, port);
  };

  private acquireSlot(): Promise<void> {
    if (this.active < MAX_ACTIVE) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiting.shift()?.();
  }

  private async serveFetch(req: RelayRequest, port: MessagePort): Promise<void> {
    const abort = new AbortController();
    let cancelled = false;
    let credits = CREDITS;
    let wake: (() => void) | null = null;

    port.onmessage = (e: MessageEvent<{ t?: string }>) => {
      if (e.data?.t === "more") {
        credits++;
        wake?.();
        wake = null;
      } else if (e.data?.t === "cancel") {
        cancelled = true;
        abort.abort();
        wake?.();
        wake = null;
      }
    };

    const t0 = performance.now();
    let reqBodyPreview = "";
    let reqSize = 0;
    if (req.body) {
      reqSize = req.body.byteLength;
      try {
        reqBodyPreview = new TextDecoder().decode(req.body.slice(0, 16_384));
      } catch {
        reqBodyPreview = `<binary ${reqSize} bytes>`;
      }
    }
    const netId = networkStore.startRequest({
      source: "preview-sw",
      method: req.method,
      url: `http://127.0.0.1:${req.port}${req.path}`,
      port: req.port,
      path: req.path,
      reqHeaders: req.headers,
      reqBody: reqBodyPreview,
      reqSize,
    });

    const fail = (status: number, message: string) => {
      networkStore.finishRequest(netId, {
        status,
        statusText: "Error",
        durationMs: performance.now() - t0,
        error: message,
      });
      try {
        port.postMessage({ t: "error", status, message });
      } catch {
        // ignore closed port
      }
    };

    if (!this.vm) {
      fail(503, "unkernelOS VM is not running.");
      return;
    }

    await this.acquireSlot();
    try {
      if (cancelled || !this.vm) return;
      const headers = new Headers();
      for (const [k, v] of req.headers) {
        if (!SKIP_HEADERS.has(k.toLowerCase())) {
          try {
            headers.append(k, v);
          } catch {
            // ignore forbidden headers
          }
        }
      }
      headers.set("accept-encoding", "identity");

      const init: RequestInit = {
        method: req.method,
        headers,
        signal: abort.signal,
      };
      if (req.body && req.method !== "GET" && req.method !== "HEAD") {
        init.body = req.body;
      }

      const res = await this.vm.fetch(`http://127.0.0.1:${req.port}${req.path}`, init);
      if (cancelled) {
        res.body?.cancel().catch(() => {});
        return;
      }

      const resHeaders: [string, string][] = [];
      res.headers.forEach((v, k) => resHeaders.push([k, v]));
      const ct = res.headers.get("content-type") || "";
      port.postMessage({
        t: "head",
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
      });

      if (!res.body || req.method === "HEAD") {
        networkStore.finishRequest(netId, {
          status: res.status,
          statusText: res.statusText,
          durationMs: performance.now() - t0,
          resHeaders,
          contentType: ct,
          resSize: 0,
        });
        port.postMessage({ t: "end" });
        return;
      }

      const reader = res.body.getReader();
      let totalResBytes = 0;
      const textChunks: Uint8Array[] = [];
      let capturedBytes = 0;
      const isTextLike = /text|json|javascript|xml|svg|html|css|urlencoded/i.test(ct) || !ct;
      try {
        while (!cancelled) {
          if (credits <= 0) {
            await new Promise<void>((r) => {
              wake = r;
            });
            if (cancelled) break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            credits--;
            totalResBytes += value.byteLength;
            if (netId && isTextLike && capturedBytes < 32_768) {
              const take = value.subarray(0, Math.min(value.byteLength, 32_768 - capturedBytes));
              textChunks.push(take.slice());
              capturedBytes += take.byteLength;
            }
            const copy = value.slice();
            port.postMessage({ t: "chunk", data: copy.buffer }, [copy.buffer]);
          }
        }
        if (!cancelled) {
          let resBody = "";
          if (netId && isTextLike && textChunks.length > 0) {
            const merged = new Uint8Array(capturedBytes);
            let off = 0;
            for (const c of textChunks) {
              merged.set(c, off);
              off += c.byteLength;
            }
            resBody = new TextDecoder().decode(merged);
          } else if (netId && !isTextLike) {
            resBody = `<binary ${ct || "stream"} — ${totalResBytes} bytes>`;
          }
          networkStore.finishRequest(netId, {
            status: res.status,
            statusText: res.statusText,
            durationMs: performance.now() - t0,
            resHeaders,
            resBody,
            resSize: totalResBytes,
            contentType: ct,
          });
          port.postMessage({ t: "end" });
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    } catch (err) {
      if (!cancelled) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = /ECONNREFUSED|refused/i.test(msg) ? 502 : 504;
        fail(status, `Guest port ${req.port} unreachable: ${msg}`);
      }
    } finally {
      this.releaseSlot();
      port.close();
    }
  }

  private ensureWsBridge(): void {
    if (typeof BroadcastChannel === "undefined" || this.wsChan) return;
    this.wsChan = new BroadcastChannel(`kw-vm-${this.vmId}`);
    if (navigator.locks) {
      navigator.locks
        .request(`kw-vm-${this.vmId}`, () => new Promise<void>((r) => { this.lockRelease = r; }))
        .catch(() => {});
    }
    this.wsChan.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d.t !== "string") return;
      if (d.t === "ws-open") {
        void this.handleWsOpen(d.id, d.port, d.path, d.protocols || []);
      } else if (d.t === "ws-close") {
        const entry = this.wsSockets.get(d.id);
        if (entry) {
          entry.closed = true;
          entry.sock?.close();
          this.wsSockets.delete(d.id);
        }
      }
    };
  }

  private async handleWsOpen(id: string, port: number, path: string, protocols: string[]) {
    if (!this.wsChan || !this.vm) return;
    this.wsChan.postMessage({ t: "ws-accept", id });
    const entry = { sock: null as GuestSocket | null, closed: false };
    this.wsSockets.set(id, entry);

    try {
      const sock = await this.vm.connect(port);
      if (entry.closed) {
        sock.close();
        return;
      }
      entry.sock = sock;

      // Minimal RFC 6455 HTTP Upgrade over vsock TCP stream for HMR / dev server WebSockets
      const keyBytes = crypto.getRandomValues(new Uint8Array(16));
      const wsKey = btoa(String.fromCharCode(...keyBytes));
      const reqLines = [
        `GET ${path || "/"} HTTP/1.1`,
        `Host: localhost:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${wsKey}`,
        "Sec-WebSocket-Version: 13",
        ...(protocols.length ? [`Sec-WebSocket-Protocol: ${protocols.join(", ")}`] : []),
        "",
        "",
      ];
      const writer = sock.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(reqLines.join("\r\n")));

      const reader = sock.readable.getReader();
      let buf = new Uint8Array(0);
      let upgraded = false;

      const sendFrame = async (opcode: number, payload: Uint8Array) => {
        const mask = crypto.getRandomValues(new Uint8Array(4));
        const len = payload.byteLength;
        let headerLen = 2 + 4;
        if (len >= 126 && len < 65536) headerLen += 2;
        else if (len >= 65536) headerLen += 8;
        const frame = new Uint8Array(headerLen + len);
        frame[0] = 0x80 | opcode;
        let off = 2;
        if (len < 126) {
          frame[1] = 0x80 | len;
        } else if (len < 65536) {
          frame[1] = 0x80 | 126;
          frame[2] = (len >> 8) & 0xff;
          frame[3] = len & 0xff;
          off += 2;
        } else {
          frame[1] = 0x80 | 127;
          const dv = new DataView(frame.buffer);
          dv.setBigUint64(2, BigInt(len), false);
          off += 8;
        }
        frame.set(mask, off);
        off += 4;
        for (let i = 0; i < len; i++) {
          frame[off + i] = payload[i]! ^ mask[i & 3]!;
        }
        await writer.write(frame);
      };

      // Listen for outgoing client messages on BroadcastChannel
      const onOut = (ev: MessageEvent) => {
        const m = ev.data;
        if (!m || m.id !== id || entry.closed) return;
        if (m.t === "ws-send") {
          const isStr = typeof m.data === "string";
          const bytes = isStr ? encoder.encode(m.data) : new Uint8Array(m.data);
          sendFrame(isStr ? 0x1 : 0x2, bytes)
            .then(() => this.wsChan?.postMessage({ t: "ws-sent", id, n: bytes.byteLength }))
            .catch(() => {});
        } else if (m.t === "ws-close") {
          entry.closed = true;
          sendFrame(0x8, new Uint8Array(0)).finally(() => sock.close());
        }
      };
      this.wsChan.addEventListener("message", onOut);

      try {
        while (!entry.closed) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;
          const next = new Uint8Array(buf.length + value.length);
          next.set(buf);
          next.set(value, buf.length);
          buf = next;

          if (!upgraded) {
            const text = new TextDecoder().decode(buf);
            const sep = text.indexOf("\r\n\r\n");
            if (sep === -1) continue;
            const headStr = text.slice(0, sep);
            if (!headStr.includes("101")) {
              this.wsChan?.postMessage({ t: "ws-error", id, message: "WebSocket upgrade rejected" });
              break;
            }
            const protoMatch = /^sec-websocket-protocol:\s*(.+)$/im.exec(headStr);
            upgraded = true;
            buf = buf.subarray(sep + 4);
            this.wsChan?.postMessage({
              t: "ws-opened",
              id,
              protocol: protoMatch ? protoMatch[1]!.trim() : "",
            });
          }

          // Parse WS frames
          while (upgraded && buf.length >= 2) {
            const b0 = buf[0]!;
            const b1 = buf[1]!;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f;
            let pos = 2;
            if (len === 126) {
              if (buf.length < 4) break;
              len = (buf[2]! << 8) | buf[3]!;
              pos = 4;
            } else if (len === 127) {
              if (buf.length < 10) break;
              len = Number(new DataView(buf.buffer, buf.byteOffset + 2, 8).getBigUint64(0, false));
              pos = 10;
            }
            const total = pos + (masked ? 4 : 0) + len;
            if (buf.length < total) break;
            let payload = buf.slice(pos + (masked ? 4 : 0), total);
            if (masked) {
              const mask = buf.subarray(pos, pos + 4);
              for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i & 3]!;
            }
            buf = buf.subarray(total);

            if (opcode === 0x1) {
              this.wsChan?.postMessage({ t: "ws-msg", id, data: new TextDecoder().decode(payload) });
            } else if (opcode === 0x2) {
              this.wsChan?.postMessage({ t: "ws-msg", id, data: payload.buffer });
            } else if (opcode === 0x9) {
              await sendFrame(0xA, payload);
            } else if (opcode === 0x8) {
              this.wsChan?.postMessage({ t: "ws-closed", id, code: 1000, reason: "", wasClean: true });
              entry.closed = true;
              break;
            }
          }
        }
      } finally {
        this.wsChan?.removeEventListener("message", onOut);
        reader.cancel().catch(() => {});
        writer.releaseLock();
      }
    } catch (err) {
      this.wsChan?.postMessage({
        t: "ws-error",
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.wsSockets.delete(id);
      if (!entry.closed) {
        this.wsChan?.postMessage({ t: "ws-closed", id, code: 1006, reason: "", wasClean: false });
      }
    }
  }

  private closeAllSockets(): void {
    for (const [, entry] of this.wsSockets) {
      entry.closed = true;
      entry.sock?.close();
    }
    this.wsSockets.clear();
  }

  public dispose(): void {
    this.closeAllSockets();
    this.wsChan?.close();
    this.wsChan = null;
    this.lockRelease?.();
    this.lockRelease = null;
    if (this.attachedListener && GuestPreviewRelay.isSupported()) {
      navigator.serviceWorker.removeEventListener("message", this.onSwMessage);
      this.attachedListener = false;
    }
  }
}
