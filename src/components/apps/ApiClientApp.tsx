import { Effect } from "effect";
import {
  BookmarkPlus,
  Clock,
  Copy,
  Globe,
  Plus,
  Send,
  Server,
  Trash2,
  Wand2,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { networkStore } from "../../core/network-store.ts";
import { appRuntime, SettingsService, useSubscriptionRef, VmService } from "../../core/runtime.ts";
import { DEFAULT_CREDENTIALS } from "../../core/schema.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface KvPair {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
}

interface SavedRequest {
  readonly id: string;
  readonly name: string;
  readonly method: HttpMethod;
  readonly url: string;
  readonly target: "vm" | "browser";
  readonly headers: readonly KvPair[];
  readonly body: string;
}

interface ApiResponse {
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
  readonly sizeBytes: number;
  readonly headers: readonly [string, string][];
  readonly body: string;
  readonly contentType: string;
}

const STORAGE_KEY = "unkernelos:api-client:v1";

const DEFAULT_SAVED: SavedRequest[] = [
  {
    id: "preset-local",
    name: "Guest Localhost :3000",
    method: "GET",
    url: "http://127.0.0.1:3000/",
    target: "vm",
    headers: [{ id: "h1", key: "Accept", value: "application/json, text/html", enabled: true }],
    body: "",
  },
  {
    id: "preset-gh",
    name: "GitHub User API",
    method: "GET",
    url: "https://api.github.com/user",
    target: "browser",
    headers: [{ id: "h1", key: "Accept", value: "application/vnd.github+json", enabled: true }],
    body: "",
  },
  {
    id: "preset-echo",
    name: "JSONPlaceholder Todo",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/todos/1",
    target: "browser",
    headers: [],
    body: "",
  },
];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "text-emerald-300 bg-emerald-500/15 border-emerald-400/35",
  POST: "text-amber-300 bg-amber-500/15 border-amber-400/35",
  PUT: "text-sky-300 bg-sky-500/15 border-sky-400/35",
  PATCH: "text-violet-300 bg-violet-500/15 border-violet-400/35",
  DELETE: "text-rose-300 bg-rose-500/15 border-rose-400/35",
  HEAD: "text-zinc-300 bg-white/10 border-white/20",
  OPTIONS: "text-cyan-300 bg-cyan-500/15 border-cyan-400/35",
};

function loadSaved(): SavedRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVED;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SAVED;
  } catch {
    return DEFAULT_SAVED;
  }
}

export const ApiClientApp: React.FC = () => {
  const wm = useWm();
  const creds = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.credsRef),
    DEFAULT_CREDENTIALS
  );
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "",
      bootProgress: 0,
      error: null,
      support: null,
      crossOriginIsolated: false,
      webgpuAvailable: false,
      distro: "debian",
      cpus: 1,
      memoryMiB: 2048,
      transport: "inline",
      stats: null,
      glStatus: null,
      displayMode: null,
      inputState: { keyboard: false, mouse: false, tablet: false },
      detectedPorts: [],
      kernelLogs: [],
      hasSnapshot: false,
      audioMuted: false,
      wispActiveUrl: "",
    }
  );

  const [saved, setSaved] = useState<SavedRequest[]>(loadSaved);
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("http://127.0.0.1:3000/");
  const [target, setTarget] = useState<"vm" | "browser">("vm");
  const [headers, setHeaders] = useState<KvPair[]>([
    { id: "h1", key: "Accept", value: "application/json", enabled: true },
  ]);
  const [bearerToken, setBearerToken] = useState("");
  const [body, setBody] = useState('{\n  "hello": "unkernelOS"\n}');
  const [reqTab, setReqTab] = useState<"headers" | "body" | "auth">("headers");
  const [resTab, setResTab] = useState<"pretty" | "raw" | "headers" | "preview">("pretty");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Accept handoff from Live Network Inspector ("Open in API Client")
  useEffect(() => {
    const draft = wm.apiClientDraft;
    if (!draft) return;
    const validMethods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    const m = draft.method.toUpperCase() as HttpMethod;
    setMethod(validMethods.includes(m) ? m : "GET");
    setUrl(draft.url);
    setTarget(draft.target);
    if (draft.headers.length > 0) {
      setHeaders(
        draft.headers.map(([k, v], i) => ({
          id: `draft-${draft.id}-${i}`,
          key: k,
          value: v,
          enabled: true,
        }))
      );
    }
    if (draft.body) setBody(draft.body);
    wmStore.clearApiClientDraft(draft.id);
  }, [wm.apiClientDraft]);

  const persistSaved = (next: SavedRequest[]) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const buildHeadersMap = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      if (h.enabled && h.key.trim()) out[h.key.trim()] = h.value;
    }
    if (bearerToken.trim() && !out.Authorization) {
      out.Authorization = `Bearer ${bearerToken.trim()}`;
    }
    return out;
  };

  const sendRequest = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    setLoading(true);
    setError(null);
    const hdrs = buildHeadersMap();
    const hasBody = method !== "GET" && method !== "HEAD" && body.trim().length > 0;
    const t0 = performance.now();

    try {
      const isLocalVmUrl = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i.test(cleanUrl);
      const useVm = target === "vm" || isLocalVmUrl;

      if (useVm) {
        const res = await appRuntime.runPromise(
          Effect.gen(function* () {
            const vmSvc = yield* VmService;
            const handle = vmSvc.getHandle();
            if (!handle) {
              throw new Error("Linux VM is not running.");
            }
            if (isLocalVmUrl) {
              // Fast native vsock fetch!
              const r = yield* Effect.promise(() =>
                handle.fetch(cleanUrl.replace(/localhost|0\.0\.0\.0/i, "127.0.0.1"), {
                  method,
                  headers: hasBody ? { "Content-Type": "application/json", ...hdrs } : hdrs,
                  body: hasBody ? body : undefined,
                })
              );
              const txt = yield* Effect.promise(() => r.text());
              const resHeaders: [string, string][] = [];
              r.headers.forEach((v, k) => resHeaders.push([k, v]));
              return {
                status: r.status,
                statusText: r.statusText,
                headers: resHeaders,
                body: txt,
                contentType: r.headers.get("content-type") || "",
              };
            }

            // External request via guest curl over Wisp
            const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
            const hdrArgs = Object.entries(hdrs)
              .map(([k, v]) => `-H ${sq(`${k}: ${v}`)}`)
              .join(" ");
            const bodyArg = hasBody ? `-H 'Content-Type: application/json' --data ${sq(body)}` : "";
            const script = `TMPH=$(mktemp); TMPB=$(mktemp); CODE=$(curl -sS -X ${method} ${hdrArgs} ${bodyArg} -D "$TMPH" -o "$TMPB" -w '%{http_code}' ${sq(cleanUrl)}); echo "STATUS:$CODE"; cat "$TMPH"; echo "__UNKERNEL_BODY_SEP__"; cat "$TMPB"; rm -f "$TMPH" "$TMPB"`;
            const out = yield* vmSvc.execShell(script);
            if (out.exitCode !== 0 && !out.stdout.includes("STATUS:")) {
              throw new Error(out.stderr || "Guest curl failed");
            }
            const [headPart = "", bodyPart = ""] = out.stdout.split("__UNKERNEL_BODY_SEP__\n");
            const lines = headPart.split(/\r?\n/);
            const statusLine = lines.find((l) => l.startsWith("STATUS:"));
            const status = Number(statusLine?.slice(7) || 0);
            const parsedHeaders: [string, string][] = [];
            for (const l of lines) {
              if (l.startsWith("STATUS:") || l.startsWith("HTTP/") || !l.includes(":")) continue;
              const idx = l.indexOf(":");
              parsedHeaders.push([l.slice(0, idx).trim(), l.slice(idx + 1).trim()]);
            }
            const ct = parsedHeaders.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
            return { status, statusText: "", headers: parsedHeaders, body: bodyPart, contentType: ct };
          })
        );

        const durationMs = Math.round(performance.now() - t0);
        const sizeBytes = new TextEncoder().encode(res.body).byteLength;
        setResponse({
          ...res,
          durationMs,
          sizeBytes,
        });
        let parsedPath = cleanUrl;
        let parsedPort: number | undefined;
        try {
          const u = new URL(cleanUrl);
          parsedPath = `${u.pathname}${u.search}`;
          if (u.port) parsedPort = Number(u.port);
        } catch {
          // ignore
        }
        networkStore.recordComplete({
          source: "api-client",
          method,
          url: cleanUrl,
          port: parsedPort,
          path: parsedPath,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          reqSize: hasBody ? new TextEncoder().encode(body).byteLength : 0,
          resSize: sizeBytes,
          reqHeaders: Object.entries(hdrs),
          resHeaders: res.headers,
          reqBody: hasBody ? body : "",
          resBody: res.body,
          contentType: res.contentType,
        });
      } else {
        const r = await fetch(cleanUrl, {
          method,
          headers: hasBody ? { "Content-Type": "application/json", ...hdrs } : hdrs,
          body: hasBody ? body : undefined,
        });
        const txt = await r.text();
        const resHeaders: [string, string][] = [];
        r.headers.forEach((v, k) => resHeaders.push([k, v]));
        const durationMs = Math.round(performance.now() - t0);
        const sizeBytes = new TextEncoder().encode(txt).byteLength;
        const ct = r.headers.get("content-type") || "";
        setResponse({
          status: r.status,
          statusText: r.statusText,
          durationMs,
          sizeBytes,
          headers: resHeaders,
          body: txt,
          contentType: ct,
        });
        let parsedPath = cleanUrl;
        try {
          const u = new URL(cleanUrl);
          parsedPath = `${u.pathname}${u.search}`;
        } catch {
          // ignore
        }
        networkStore.recordComplete({
          source: "api-client",
          method,
          url: cleanUrl,
          path: parsedPath,
          status: r.status,
          statusText: r.statusText,
          durationMs,
          reqSize: hasBody ? new TextEncoder().encode(body).byteLength : 0,
          resSize: sizeBytes,
          reqHeaders: Object.entries(hdrs),
          resHeaders,
          reqBody: hasBody ? body : "",
          resBody: txt,
          contentType: ct,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setResponse(null);
      networkStore.recordComplete({
        source: "api-client",
        method,
        url: cleanUrl,
        path: cleanUrl,
        status: 0,
        statusText: "Error",
        durationMs: Math.round(performance.now() - t0),
        reqSize: hasBody ? new TextEncoder().encode(body).byteLength : 0,
        resSize: 0,
        reqHeaders: Object.entries(hdrs),
        resHeaders: [],
        reqBody: hasBody ? body : "",
        resBody: "",
        contentType: "",
        error: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveCurrent = () => {
    const name = window.prompt("Save request as:", `${method} ${url.replace(/^https?:\/\//, "").slice(0, 26)}`);
    if (!name?.trim()) return;
    const item: SavedRequest = {
      id: Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      method,
      url,
      target,
      headers,
      body,
    };
    persistSaved([item, ...saved]);
    wmStore.pushToast("Request Saved", item.name, "success");
  };

  const copyCurl = () => {
    const hdrs = buildHeadersMap();
    const parts = [`curl -X ${method}`];
    for (const [k, v] of Object.entries(hdrs)) {
      parts.push(`-H '${k}: ${v}'`);
    }
    if (method !== "GET" && method !== "HEAD" && body.trim()) {
      parts.push(`-H 'Content-Type: application/json' -d '${body.replace(/'/g, `'\\''`)}'`);
    }
    parts.push(`'${url}'`);
    navigator.clipboard.writeText(parts.join(" \\\n  ")).catch(() => {});
    wmStore.pushToast("Copied", "cURL command copied to clipboard", "info");
  };

  const prettyBody = (() => {
    if (!response) return "";
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2);
    } catch {
      return response.body;
    }
  })();

  const statusTone = !response
    ? ""
    : response.status >= 200 && response.status < 300
    ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
    : response.status >= 300 && response.status < 400
    ? "bg-sky-500/20 border-sky-400/40 text-sky-300"
    : response.status >= 400 && response.status < 500
    ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
    : "bg-rose-500/20 border-rose-400/40 text-rose-300";

  return (
    <div className="flex w-full h-full bg-[#090b12]/96 overflow-hidden">
      {/* Left: Saved Collection & Guest Ports */}
      <aside className="w-56 shrink-0 bg-black/35 border-r border-white/10 p-3 flex flex-col gap-3 overflow-y-auto">
        {vm.detectedPorts.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Live Guest Servers
            </div>
            {vm.detectedPorts.map((p) => (
              <button
                key={p.port}
                type="button"
                onClick={() => {
                  setMethod("GET");
                  setTarget("vm");
                  setUrl(`http://127.0.0.1:${p.port}/`);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-400/25 text-xs font-mono text-emerald-200 transition"
              >
                <span className="flex items-center gap-1.5">
                  <Server className="w-3 h-3" />
                  127.0.0.1:{p.port}
                </span>
                <span className="text-[9px] text-emerald-400">vsock</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Collections
            </span>
            <button
              type="button"
              onClick={saveCurrent}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Save current request"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {saved.map((req) => (
              <div
                key={req.id}
                onClick={() => {
                  setMethod(req.method);
                  setUrl(req.url);
                  setTarget(req.target);
                  setHeaders([...req.headers]);
                  setBody(req.body);
                }}
                className="group flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/10 cursor-pointer transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-mono px-1 rounded border ${METHOD_COLORS[req.method]}`}>
                      {req.method}
                    </span>
                    <span className="text-xs text-zinc-200 truncate">{req.name}</span>
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">{req.url}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    persistSaved(saved.filter((s) => s.id !== req.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right: Request Builder + Response Viewer */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* URL Bar */}
        <div className="flex items-center gap-2 p-3 bg-black/40 border-b border-white/10 shrink-0">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className={`px-2.5 py-2 rounded-xl border text-xs font-mono font-semibold outline-none cursor-pointer ${METHOD_COLORS[method]}`}
          >
            {(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as HttpMethod[]).map((m) => (
              <option key={m} value={m} className="bg-[#12141f] text-white">
                {m}
              </option>
            ))}
          </select>

          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendRequest()}
            placeholder="http://127.0.0.1:3000/api/health or https://api.github.com/user"
            className="flex-1 px-3 py-2 rounded-xl bg-black/55 border border-white/12 focus:border-cyan-400/60 text-xs font-mono text-zinc-100 outline-none"
          />

          <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setTarget("vm")}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition ${
                target === "vm" ? "bg-cyan-500/25 text-cyan-200" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Execute inside Linux VM (vsock localhost / Wisp curl)"
            >
              <Server className="w-3 h-3" />
              VM
            </button>
            <button
              type="button"
              onClick={() => setTarget("browser")}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition ${
                target === "browser" ? "bg-violet-500/25 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Execute directly via Host Browser fetch()"
            >
              <Globe className="w-3 h-3" />
              Host
            </button>
          </div>

          <button
            type="button"
            onClick={copyCurl}
            className="p-2 rounded-xl bg-white/8 hover:bg-white/14 text-zinc-300"
            title="Copy as cURL"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void sendRequest()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:brightness-110 disabled:opacity-50 shadow-lg transition"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? "Sending..." : "Send"}
          </button>
        </div>

        {/* Request Config (Top Half) */}
        <div className="h-44 shrink-0 border-b border-white/10 flex flex-col bg-black/20">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8 text-xs">
            <div className="flex items-center gap-1">
              {(["headers", "body", "auth"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReqTab(t)}
                  className={`px-2.5 py-1 rounded-lg capitalize text-[11px] font-medium transition ${
                    reqTab === t ? "bg-white/12 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {reqTab === "body" && (
              <button
                type="button"
                onClick={() => {
                  try {
                    setBody(JSON.stringify(JSON.parse(body), null, 2));
                  } catch {
                    // ignore invalid json
                  }
                }}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
              >
                <Wand2 className="w-3 h-3" />
                Prettify JSON
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {reqTab === "headers" && (
              <div className="space-y-1.5">
                {headers.map((h, i) => (
                  <div key={h.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) =>
                        setHeaders((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, enabled: e.target.checked } : x))
                        )
                      }
                      className="accent-cyan-400"
                    />
                    <input
                      value={h.key}
                      onChange={(e) =>
                        setHeaders((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x))
                        )
                      }
                      placeholder="Header name"
                      className="w-44 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
                    />
                    <input
                      value={h.value}
                      onChange={(e) =>
                        setHeaders((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x))
                        )
                      }
                      placeholder="Value"
                      className="flex-1 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setHeaders((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setHeaders((prev) => [
                      ...prev,
                      { id: Math.random().toString(36).slice(2, 7), key: "", value: "", enabled: true },
                    ])
                  }
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline pt-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Header
                </button>
              </div>
            )}

            {reqTab === "body" && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                placeholder='{"key": "value"}'
                className="w-full h-full bg-black/45 border border-white/10 rounded-xl p-2.5 text-xs font-mono text-zinc-100 outline-none resize-none"
              />
            )}

            {reqTab === "auth" && (
              <div className="space-y-2 max-w-lg">
                <label className="text-xs text-zinc-300">Bearer Token (Authorization Header)</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Paste Bearer token..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                  />
                  {creds.githubToken && (
                    <button
                      type="button"
                      onClick={() => setBearerToken(creds.githubToken)}
                      className="px-2.5 py-1.5 rounded-xl bg-violet-500/20 border border-violet-400/35 text-[11px] text-violet-200 hover:bg-violet-500/30 transition"
                    >
                      Use GitHub Token
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Response Inspector (Bottom Half) */}
        <div className="flex-1 min-h-0 flex flex-col bg-[#070910]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-1">
              {(["pretty", "raw", "headers", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setResTab(t)}
                  className={`px-2.5 py-1 rounded-lg capitalize text-[11px] font-medium transition ${
                    resTab === t ? "bg-white/12 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {response && (
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className={`px-2 py-0.5 rounded-full border ${statusTone}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="flex items-center gap-1 text-zinc-400">
                  <Clock className="w-3 h-3" />
                  {response.durationMs} ms
                </span>
                <span className="text-zinc-500">
                  {(response.sizeBytes / 1024).toFixed(2)} KB
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-3">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/30 text-xs font-mono text-rose-200">
                {error}
              </div>
            )}

            {!response && !error && (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                Send a request to inspect status, headers, JSON &amp; HTML preview.
              </div>
            )}

            {response && resTab === "pretty" && (
              <pre className="text-xs font-mono text-emerald-200/90 whitespace-pre-wrap break-words select-text leading-relaxed">
                {prettyBody}
              </pre>
            )}

            {response && resTab === "raw" && (
              <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all select-text">
                {response.body}
              </pre>
            )}

            {response && resTab === "headers" && (
              <div className="space-y-1 font-mono text-xs select-text">
                {response.headers.map(([k, v], i) => (
                  <div
                    key={`${k}-${i}`}
                    className="grid grid-cols-3 gap-2 py-1 border-b border-white/6"
                  >
                    <span className="text-cyan-300 truncate">{k}</span>
                    <span className="col-span-2 text-zinc-300 break-all">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {response && resTab === "preview" && (
              <iframe
                title="HTTP HTML Preview"
                sandbox=""
                srcDoc={response.body}
                className="w-full h-full rounded-xl bg-white border-0"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
