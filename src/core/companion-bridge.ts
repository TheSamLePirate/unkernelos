import { Effect } from "effect";
import { AGENT_OS_SCHEMA, executeOsAction } from "./agent-os-api.ts";
import { appRuntime, VmService } from "./runtime.ts";
import { getCompanionConfig, bootstrapCompanion } from "./companion-config.ts";

/** External agents use the existing MCP firewall, never the privileged UI/window bridge. */
export function startCompanionBridge(): () => void {
  const config = getCompanionConfig();
  if (!config) return () => {};
  let closed = false,
    suspended = false,
    socket: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const connect = () => {
    if (closed || suspended) return;
    const ws = new WebSocket(config.bridgeUrl);
    socket = ws;
    const state = async (type: "hello" | "state") => {
      try {
        const vm = await appRuntime.runPromise(
          Effect.flatMap(VmService, (v) => v.stateRef.get),
        );
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type,
              info: {
                phase: vm.phase,
                distro: vm.distro,
                title: document.title,
                browser: navigator.userAgent,
                crossOriginIsolated,
              },
              ...(type === "hello" ? { schema: AGENT_OS_SCHEMA } : {}),
            }),
          );
      } catch {
        /* Runtime may be shutting down. */
      }
    };
    const heartbeat = setInterval(() => void state("state"), 10_000);
    ws.onopen = () => {
      attempts = 0;
      void state("hello");
    };
    ws.onmessage = async (event) => {
      let request: {
        type?: string;
        id?: string;
        method?: string;
        params?: Record<string, unknown>;
      };
      try {
        request = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (
        request.type !== "call" ||
        typeof request.id !== "string" ||
        typeof request.method !== "string"
      )
        return;
      let reply;
      try {
        if (!AGENT_OS_SCHEMA.some((m) => m.method === request.method))
          throw new Error("Unknown OS method");
        const result = await executeOsAction(
          request.method,
          request.params ?? {},
          { source: "mcp" },
        );
        reply = {
          type: "result",
          id: request.id,
          ok: true,
          result: result ?? null,
        };
      } catch (error) {
        reply = {
          type: "result",
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (ws.readyState === WebSocket.OPEN) {
        const text = JSON.stringify(reply);
        ws.send(
          new TextEncoder().encode(text).byteLength <= 1_500_000
            ? text
            : JSON.stringify({
                type: "result",
                id: request.id,
                ok: false,
                error: "Result exceeds bridge limit; request a smaller range.",
              }),
        );
      }
    };
    ws.onclose = () => {
      clearInterval(heartbeat);
      if (!closed && !suspended)
        retry = setTimeout(
          async () => {
            try {
              await bootstrapCompanion();
            } catch {
              /* Retry after daemon restarts. */
            }
            connect();
          },
          Math.min(15_000, 750 * 2 ** attempts++),
        );
    };
    ws.onerror = () => ws.close();
  };
  const hide = () => {
    suspended = true;
    clearTimeout(retry);
    socket?.close();
  };
  const show = () => {
    if (suspended && !closed) {
      suspended = false;
      void bootstrapCompanion().then(connect).catch(connect);
    }
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  connect();
  return () => {
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    closed = true;
    clearTimeout(retry);
    socket?.close();
  };
}
