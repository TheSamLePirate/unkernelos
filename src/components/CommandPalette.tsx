import { Effect } from "effect";
import { Globe, Pause, RotateCcw, Search, Sparkles } from "lucide-react";
import React, { useEffect, useState } from "react";
import { appRuntime, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

export const CommandPalette: React.FC = () => {
  const wm = useWm();
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

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (wm.commandPaletteOpen) setQuery("");
  }, [wm.commandPaletteOpen]);

  if (!wm.commandPaletteOpen) return null;

  const q = query.trim().toLowerCase();
  const apps = (Object.keys(APP_CATALOG) as AppId[])
    .map((id) => APP_CATALOG[id])
    .filter(
      (a) =>
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.id.includes(q)
    );

  return (
    <div
      onClick={() => wmStore.setCommandPalette(false)}
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl glass-surface-focused overflow-hidden animate-window-in"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-4 h-4 text-violet-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") wmStore.setCommandPalette(false);
              if (e.key === "Enter" && apps[0]) {
                wmStore.openApp(apps[0].id);
                wmStore.setCommandPalette(false);
              }
            }}
            placeholder="Launch app, open guest port, or run VM command..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {vm.detectedPorts.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Live Guest Web Servers
              </div>
              {vm.detectedPorts.map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => {
                    wmStore.openPreview(p.port, "/");
                    wmStore.setCommandPalette(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-emerald-500/15 text-xs text-zinc-200 transition"
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Preview <code className="text-emerald-300">http://localhost:{p.port}/</code>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">vsock</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Applications
          </div>
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                wmStore.openApp(a.id);
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-white/10 text-left transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${a.accent} shrink-0`} />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white">{a.title}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{a.description}</div>
                </div>
              </div>
              {a.shortcut && (
                <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400 shrink-0">
                  {a.shortcut}
                </kbd>
              )}
            </button>
          ))}

          <div className="pt-1 mt-1 border-t border-white/8">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Kernel Actions
            </div>
            <button
              type="button"
              onClick={() => {
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.suspend()).pipe(Effect.ignore));
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              Suspend Linux VM Snapshot
            </button>
            <button
              type="button"
              onClick={() => {
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.reboot()).pipe(Effect.ignore));
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              Reboot Linux Kernel
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.openApp("settings", { tab: "network" });
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Configure Wisp Server &amp; API Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
