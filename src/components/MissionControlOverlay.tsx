import { Layers, Plus, X } from "lucide-react";
import React, { useEffect } from "react";
import { APP_CATALOG, useWm, wmStore, type WorkspaceId } from "../wm/wm-store.ts";

const WORKSPACES: readonly WorkspaceId[] = [1, 2, 3, 4];

export const MissionControlOverlay: React.FC = () => {
  const wm = useWm();

  useEffect(() => {
    if (!wm.missionControlOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        wmStore.setMissionControl(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wm.missionControlOpen]);

  if (!wm.missionControlOpen) return null;

  const activeWins = wm.windows.filter((w) => w.workspace === wm.activeWorkspace);

  return (
    <div
      onClick={() => wmStore.setMissionControl(false)}
      className="fixed inset-0 z-[92] bg-black/55 backdrop-blur-xl flex flex-col pt-12 pb-24 px-6 animate-overlay-fade"
    >
      {/* Workspace Strip */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-4xl flex flex-col items-center gap-3 mb-8"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Layers className="w-4 h-4 text-violet-400" />
          <span>Mission Control</span>
          <span className="text-zinc-500 font-mono text-[11px]">· Workspace {wm.activeWorkspace}</span>
        </div>

        <div className="grid grid-cols-4 gap-3 w-full max-w-2xl">
          {WORKSPACES.map((ws) => {
            const count = wm.windows.filter((w) => w.workspace === ws).length;
            const active = wm.activeWorkspace === ws;
            return (
              <button
                key={ws}
                type="button"
                onClick={() => wmStore.switchWorkspace(ws)}
                className={`group relative h-20 rounded-2xl p-3 text-left transition flex flex-col justify-between overflow-hidden ${
                  active
                    ? "glass-surface-focused ring-2 ring-violet-400/70"
                    : "glass-surface opacity-75 hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Desktop {ws}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                    {count}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {wm.windows
                    .filter((w) => w.workspace === ws)
                    .slice(0, 5)
                    .map((w) => (
                      <span
                        key={w.id}
                        className={`h-2 flex-1 max-w-[26px] rounded-full bg-gradient-to-r ${APP_CATALOG[w.appId].accent}`}
                      />
                    ))}
                  {count === 0 && <span className="text-[10px] text-zinc-500">Empty</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Exposé Window Cards Grid */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 min-h-0 mx-auto w-full max-w-5xl overflow-y-auto"
      >
        {activeWins.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3">
            <p className="text-sm text-zinc-400">No windows open on Desktop {wm.activeWorkspace}.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => wmStore.openApp("agent-studio", undefined, true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Open Agent Studio
              </button>
              <button
                type="button"
                onClick={() => wmStore.openApp("terminal", undefined, true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 border border-white/15 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New Kitty Terminal
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {activeWins.map((win) => {
              const def = APP_CATALOG[win.appId];
              const isFocused = win.id === wm.activeWindowId;
              return (
                <div
                  key={win.id}
                  onClick={() => {
                    wmStore.focusWindow(win.id);
                    wmStore.setMissionControl(false);
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] ${
                    isFocused
                      ? "glass-surface-focused ring-2 ring-violet-400/60"
                      : "glass-surface hover:border-white/25"
                  }`}
                >
                  {/* Simulated Window Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white/[0.04] border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${def.accent} shrink-0`} />
                      <span className="text-xs font-medium text-white truncate">{win.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        wmStore.closeWindow(win.id);
                      }}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-rose-500/20 transition"
                      title="Close window"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Preview Card Body */}
                  <div className="p-4 h-36 flex flex-col justify-between bg-gradient-to-br from-white/[0.02] to-black/30">
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                      {def.description}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/8">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {win.minimized ? "Minimized" : win.maximized ? "Maximized" : win.snap !== "none" ? `Snap: ${win.snap}` : `${Math.round(win.width)}×${Math.round(win.height)}`}
                      </span>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1"
                      >
                        <span className="text-[10px] text-zinc-500 mr-0.5">Move:</span>
                        {WORKSPACES.map((targetWs) => (
                          <button
                            key={targetWs}
                            type="button"
                            onClick={() => wmStore.moveWindowToWorkspace(win.id, targetWs)}
                            className={`w-5 h-5 rounded-md text-[10px] font-mono transition ${
                              win.workspace === targetWs
                                ? "bg-violet-500/40 text-white border border-violet-300/40"
                                : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-white"
                            }`}
                          >
                            {targetWs}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-zinc-500 font-mono">
        Click a window to focus · Press ESC to close · Shortcuts: ⌘E Mission Control · ⌃1–4 Switch Desktop
      </div>
    </div>
  );
};
