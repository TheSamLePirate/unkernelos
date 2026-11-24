import { Effect } from "effect";
import { Code2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { executeOsAction } from "../../core/agent-os-api.ts";
import { dynamicAppsStore, useDynamicApps } from "../../core/dynamic-apps-store.ts";
import { appRuntime, GuestFsService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

const BRIDGE_PRELUDE = `<script>
(function(){
  const pending = new Map();
  let seq = 1;
  window.addEventListener('message', function(ev) {
    const d = ev.data;
    if (!d || d.__unkernelos_reply !== true) return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.ok) p.resolve(d.result);
    else p.reject(new Error(d.error || 'OS API error'));
  });
  window.unkernelOS = {
    call: function(method, params) {
      return new Promise(function(resolve, reject) {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        window.parent.postMessage({ __unkernelos_call: true, id, method, params: params || {} }, '*');
      });
    }
  };
})();
</script>`;

function injectBridge(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${BRIDGE_PRELUDE}`);
  }
  return `${BRIDGE_PRELUDE}${html}`;
}

export const DynamicAppHost: React.FC<{ dynamicAppId: string }> = ({ dynamicAppId }) => {
  const apps = useDynamicApps();
  const app = apps.find((a) => a.id === dynamicAppId);
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadContent = useCallback(async () => {
    if (!app) return;
    setError(null);
    if (app.guestPath) {
      const res = await appRuntime.runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileText(app.guestPath!)))
      );
      if (res._tag === "Right") {
        setSrcDoc(injectBridge(res.right));
        setReloadKey((k) => k + 1);
      } else {
        setError(`Could not load ${app.guestPath}: ${res.left.message}`);
      }
      return;
    }
    setSrcDoc(injectBridge(app.html || "<html><body style='color:white;background:#0a0c13'>Empty App</body></html>"));
    setReloadKey((k) => k + 1);
  }, [app]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  // Listen for sandboxed iframe -> host OS API bridge calls
  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const d = ev.data as { __unkernelos_call?: boolean; id?: number; method?: string; params?: Record<string, unknown> };
      if (!d?.__unkernelos_call || !d.method) return;
      try {
        const result = await executeOsAction(d.method, d.params ?? {}, { source: "ui" });
        iframeRef.current.contentWindow?.postMessage(
          { __unkernelos_reply: true, id: d.id, ok: true, result },
          "*"
        );
      } catch (err) {
        iframeRef.current.contentWindow?.postMessage(
          {
            __unkernelos_reply: true,
            id: d.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          },
          "*"
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
          sandbox="allow-scripts allow-forms allow-modals"
          title={app.title}
          className="flex-1 w-full h-full border-0 bg-[#090b12]"
        />
      )}
    </div>
  );
};
