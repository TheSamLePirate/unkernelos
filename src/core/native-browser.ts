import { getCompanionConfig, bootstrapCompanion } from "./companion-config.ts";
export interface NativePageState {
  url: string;
  title: string;
  canBack: boolean;
  canForward: boolean;
}
export type NativeBrowserEvent = { type: string; [key: string]: unknown };
/** One authenticated socket and one isolated Chromium page per browser surface. */
export class NativeBrowserClient {
  private socket: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private connecting: Promise<void> | null = null;
  private closed = false;
  private frameListener:
    ((frame: NativeBrowserEvent, ack: boolean) => void) | null = null;
  private lastFrame: NativeBrowserEvent | null = null;
  frames(listener: (frame: NativeBrowserEvent, ack: boolean) => void) {
    this.frameListener = listener;
    if (this.lastFrame) listener(this.lastFrame, false);
    return () => {
      this.frameListener = null;
    };
  }
  private hide = () => this.socket?.close();
  constructor(private event: (event: NativeBrowserEvent) => void) {
    window.addEventListener("pagehide", this.hide);
  }
  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    const config = getCompanionConfig();
    if (!config)
      return Promise.reject(
        new Error(
          "La navigation Internet intégrée nécessite unkernelOS Companion. Ouvrez l’OS depuis son app native.",
        ),
      );
    this.connecting = bootstrapCompanion().then(
      () =>
        new Promise<void>((resolve, reject) => {
          const url = new URL("/__companion/browser", config.origin);
          url.protocol = "ws:";
          const socket = new WebSocket(url);
          this.socket = socket;
          const timer = setTimeout(() => {
            reject(new Error("Le moteur web ne répond pas."));
            socket.close();
          }, 20000);
          socket.onmessage = (event) => {
            const value = JSON.parse(String(event.data)) as NativeBrowserEvent;
            if (value.type === "frame") {
              this.lastFrame = value;
              if (this.frameListener) this.frameListener(value, true);
              else this.send("ack", { sessionId: value.sessionId });
              return;
            }
            if (value.type === "ready") {
              clearTimeout(timer);
              resolve();
            }
            if (value.type === "error") {
              clearTimeout(timer);
              reject(new Error(String(value.error)));
            }
            if (value.type === "result") {
              const p = this.pending.get(String(value.id));
              if (p) {
                this.pending.delete(String(value.id));
                clearTimeout(p.timer);
                value.ok
                  ? p.resolve(value.result)
                  : p.reject(new Error(String(value.error)));
              }
            } else this.event(value);
          };
          socket.onclose = () => {
            clearTimeout(timer);
            const error = new Error(
              "Le moteur web est déconnecté. Rechargez cette vue pour vous reconnecter.",
            );
            reject(error);
            for (const p of this.pending.values()) {
              clearTimeout(p.timer);
              p.reject(error);
            }
            this.pending.clear();
            this.connecting = null;
            if (!this.closed)
              this.event({ type: "error", error: error.message });
          };
          socket.onerror = () => socket.close();
        }),
    );
    return this.connecting;
  }
  async call(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.connect();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Action navigateur expirée ; vérifiez la page avant de réessayer.",
          ),
        );
      }, 35000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ id, action, ...params }));
    });
  }
  send(action: string, params: Record<string, unknown> = {}) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ action, ...params }));
  }
  close() {
    this.closed = true;
    window.removeEventListener("pagehide", this.hide);
    this.socket?.close();
  }
}
