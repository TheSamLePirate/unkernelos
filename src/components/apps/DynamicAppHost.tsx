import { Effect } from "effect";
import { Code2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { executeOsAction } from "../../core/agent-os-api.ts";
import {
  dynamicAppsStore,
  useDynamicApps,
} from "../../core/dynamic-apps-store.ts";
import { appRuntime, GuestFsService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

import { sdkPrelude } from "../../core/app-sdk.ts";
import {
  WindowSessionContext,
  useAppSurface,
  type SurfaceAdapter,
} from "../../core/app-surface-registry.tsx";
function injectBridge(html: string, token: string) {
  const prelude = sdkPrelude(token);
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${prelude}`)
    : prelude + html;
}
export const DynamicAppHost: React.FC<{ dynamicAppId: string }> = ({
  dynamicAppId,
}) => {
  const win = useContext(WindowSessionContext);
  const apps = useDynamicApps();
  const app = apps.find((a) => a.id === dynamicAppId);
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const token = useRef(crypto.randomUUID()),
    pending = useRef(
      new Map<
        string,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    );
  const [surface, setSurface] = useState<SurfaceAdapter>({
    revision: "boot",
    state: { appId: dynamicAppId },
    status: "loading",
  });
  useAppSurface(surface);
  const cancel = () => {
    for (const item of pending.current.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("Application rechargée ou fermée"));
    }
    pending.current.clear();
  };
  const invoke = (action: string, args: Record<string, unknown>) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new Error("Délai de réponse de l’application dépassé"));
      }, 20000);
      pending.current.set(id, { resolve, reject, timer });
      iframeRef.current?.contentWindow?.postMessage(
        { __unkernelos_action: true, token: token.current, id, action, args },
        "*",
      );
    });
  const loadContent = useCallback(async () => {
    if (!app) return;
    setError(null);
    cancel();
    token.current = crypto.randomUUID();
    const loadingToken = token.current;
    setSurface({
      revision: token.current,
      state: { appId: dynamicAppId },
      status: "loading",
    });
    if (app.guestPath) {
      const res = await appRuntime.runPromise(
        Effect.either(
          Effect.flatMap(GuestFsService, (fs) =>
            fs.readFileText(app.guestPath!),
          ),
        ),
      );
      if (loadingToken !== token.current) return;
      if (res._tag === "Right") {
        setSrcDoc(injectBridge(res.right, token.current));
        setReloadKey((k) => k + 1);
      } else {
        setError(`Could not load ${app.guestPath}: ${res.left.message}`);
      }
      return;
    }
    setSrcDoc(
      injectBridge(
        app.html ||
          "<html><body style='color:white;background:#0a0c13'>Empty App</body></html>",
        token.current,
      ),
    );
    setReloadKey((k) => k + 1);
  }, [app]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  // Listen for sandboxed iframe -> host OS API bridge calls
  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow)
        return;
      const d = ev.data;
      if (!d || d.token !== token.current) return;
      if (d.__unkernelos_surface) {
        const value = d.surface;
        let size = 0;
        try {
          size = JSON.stringify(value).length;
        } catch {
          return;
        }
        if (
          !value ||
          typeof value.state !== "object" ||
          value.state === null ||
          Array.isArray(value.state) ||
          size > 262144 ||
          !Array.isArray(value.actions)
        )
          return;
        const actions = Object.fromEntries(
          value.actions
            .slice(0, 100)
            .filter(
              (a: any) =>
                a &&
                typeof a.name === "string" &&
                /^[a-z][a-z0-9_.-]{0,63}$/i.test(a.name) &&
                !["constructor", "prototype"].includes(a.name),
            )
            .map((a: any) => [
              a.name,
              {
                label: String(a.label ?? a.name).slice(0, 120),
                paramsSchema:
                  a.paramsSchema && typeof a.paramsSchema === "object"
                    ? a.paramsSchema
                    : undefined,
                run: (args: Record<string, unknown>) => invoke(a.name, args),
              },
            ]),
        );
        const glyphs = [
          "play",
          "pause",
          "sun",
          "cloud",
          "rain",
          "snow",
          "activity",
        ];
        const dock =
          value.dock && typeof value.dock.label === "string"
            ? {
                label: value.dock.label.slice(0, 120),
                value:
                  typeof value.dock.value === "string"
                    ? value.dock.value.slice(0, 100)
                    : undefined,
                detail:
                  typeof value.dock.detail === "string"
                    ? value.dock.detail.slice(0, 200)
                    : undefined,
                glyph: glyphs.includes(value.dock.glyph)
                  ? value.dock.glyph
                  : undefined,
                primaryAction:
                  typeof value.dock.primaryAction === "string"
                    ? value.dock.primaryAction
                    : undefined,
                progress:
                  typeof value.dock.progress === "number"
                    ? value.dock.progress
                    : undefined,
              }
            : undefined;
        setSurface({
          revision: token.current + ":" + String(value.revision),
          state: value.state,
          title: typeof value.title === "string" ? value.title : undefined,
          document:
            typeof value.document === "string" ? value.document : undefined,
          status: [
            "live",
            "paused",
            "loading",
            "disconnected",
            "opaque",
          ].includes(value.status)
            ? value.status
            : "live",
          actions,
          dock,
        });
        return;
      }
      if (d.__unkernelos_action_reply) {
        const item = pending.current.get(d.id);
        if (item) {
          pending.current.delete(d.id);
          clearTimeout(item.timer);
          d.ok
            ? item.resolve(d.result)
            : item.reject(new Error(String(d.error)));
        }
        return;
      }

      if (!d?.__unkernelos_call || !d.method) return;
      const documentToken = d.token,
        sender = ev.source;
      try {
        const result = await executeOsAction(d.method, d.params ?? {}, {
          source: "window-api",
        });
        if (
          token.current !== documentToken ||
          iframeRef.current?.contentWindow !== sender
        )
          return;
        iframeRef.current.contentWindow?.postMessage(
          {
            __unkernelos_reply: true,
            token: token.current,
            id: d.id,
            ok: true,
            result,
          },
          "*",
        );
      } catch (err) {
        iframeRef.current.contentWindow?.postMessage(
          {
            __unkernelos_reply: true,
            token: token.current,
            id: d.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          },
          "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      cancel();
    };
  }, []);

  if (!app) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[#090b12] text-xs text-zinc-400">
        Custom app <code>{dynamicAppId}</code> is no longer installed.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/50 border-b border-white/10 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span>{app.emoji}</span>
          <span className="font-medium text-white truncate">{app.title}</span>
          <span className="px-1.5 py-0.2 rounded-full bg-violet-500/20 border border-violet-400/30 text-[9px] font-mono text-violet-200">
            AGENT APP
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {app.guestPath && (
            <button
              type="button"
              onClick={() => wmStore.openFileInIde(app.guestPath!)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/8 hover:bg-white/14 text-[11px] text-sky-300"
            >
              <Code2 className="w-3 h-3" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadContent()}
            className="p-1 rounded bg-white/8 hover:bg-white/14 text-zinc-300"
            title="Reload App"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Uninstall ${app.title}?`)) return;
              dynamicAppsStore.uninstall(app.id);
              wmStore.pushToast("App Uninstalled", app.title, "info");
            }}
            className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"
            title="Uninstall Custom App"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
          <Sparkles className="w-7 h-7 text-rose-400" />
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          key={reloadKey}
          srcDoc={srcDoc}
          onLoad={() =>
            setSurface((previous) =>
              previous.revision === token.current
                ? { ...previous, status: "opaque" }
                : previous,
            )
          }
          sandbox="allow-scripts allow-forms allow-modals"
          allow="autoplay"
          title={app.title}
          className="flex-1 w-full h-full border-0 bg-[#090b12]"
        />
      )}
    </div>
  );
};
