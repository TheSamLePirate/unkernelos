import { Box, Layers, LayoutGrid, Plus, Save, Trash2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useViewport } from "../core/use-viewport.ts";
import { APP_CATALOG, useWm, wmStore, type AppId, type SnapZone, type WorkspaceId } from "../wm/wm-store.ts";

const WORKSPACES: readonly WorkspaceId[] = [1, 2, 3, 4];
const PROFILES_KEY = "unkernelos:desktop-profiles:v1";

interface DesktopProfile {
  readonly id: string;
  readonly name: string;
  readonly apps: readonly { appId: AppId; snap: SnapZone }[];
  readonly custom?: boolean;
}

const BUILTIN_PROFILES: readonly DesktopProfile[] = [
  {
    id: "prof-dev-split",
    name: "Dev Split (IDE + Preview)",
    apps: [
      { appId: "ide", snap: "left" },
      { appId: "preview", snap: "right" },
    ],
  },
  {
    id: "prof-ai-studio",
    name: "AI Studio + Terminal",
    apps: [
      { appId: "agent-studio", snap: "left" },
      { appId: "terminal", snap: "right" },
    ],
  },
  {
    id: "prof-swarm-ops",
    name: "Swarm Ops + OS API",
    apps: [
      { appId: "agent-swarm", snap: "left" },
      { appId: "agent-api", snap: "right" },
    ],
  },
  {
    id: "prof-creative",
    name: "Creative GPU + Media",
    apps: [
      { appId: "shader-synth", snap: "left" },
      { appId: "media-studio", snap: "right" },
    ],
  },
];

function loadCustomProfiles(): DesktopProfile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const MissionControlOverlay: React.FC = () => {
  const wm = useWm();
  const { isTouch } = useViewport();
  const [spatial3d, setSpatial3d] = useState(true);
  const [tilt, setTilt] = useState({ rx: 4, ry: 0 });
  const [customProfiles, setCustomProfiles] = useState<DesktopProfile[]>(loadCustomProfiles);

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

  const applyProfile = (prof: DesktopProfile) => {
    wmStore.minimizeAllInWorkspace();
    for (const item of prof.apps) {
      const id = wmStore.openApp(item.appId);
      if (item.snap !== "none") wmStore.snapWindow(id, item.snap);
    }
    wmStore.setMissionControl(false);
    wmStore.pushToast("Desktop Profile Applied", prof.name, "success");
  };

  const saveCurrentProfile = () => {
    const visible = activeWins.filter((w) => !w.minimized && w.appId !== "wayland-surface" && w.appId !== "custom-app");
    if (visible.length === 0) return;
    const name = window.prompt("Save current window layout as profile:", "My Workspace");
    if (!name?.trim()) return;
    const prof: DesktopProfile = {
      id: `prof-${Date.now().toString(36)}`,
      name: name.trim(),
      apps: visible.map((w) => ({ appId: w.appId, snap: w.maximized ? "maximize" : w.snap })),
      custom: true,
    };
    const next = [prof, ...customProfiles].slice(0, 6);
    setCustomProfiles(next);
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    wmStore.pushToast("Profile Saved", prof.name, "success");
  };

  const deleteProfile = (id: string) => {
    const next = customProfiles.filter((p) => p.id !== id);
    setCustomProfiles(next);
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <div
      onClick={() => wmStore.setMissionControl(false)}
      onMouseMove={(e) => {
        if (!spatial3d || isTouch) return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        setTilt({ rx: 4 - ny * 5, ry: nx * 6 });
      }}
      className="fixed inset-0 z-[92] bg-black/58 backdrop-blur-2xl flex flex-col pt-12 pb-24 px-4 sm:px-6 animate-overlay-fade"
    >
      {/* Workspace Strip + Spatial 3D & Profiles Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-5xl flex flex-col items-center gap-3 mb-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <Layers className="w-4 h-4 text-violet-400" />
            <span>Spatial Mission Control</span>
            <span className="text-zinc-500 font-mono text-[11px]">· Desktop {wm.activeWorkspace}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSpatial3d((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition ${
                spatial3d
                  ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                  : "bg-white/5 border-white/10 text-zinc-400"
              }`}
            >
              <Box className="w-3 h-3" />
              3D Spatial
            </button>
            <button
              type="button"
              onClick={saveCurrentProfile}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 transition"
            >
              <Save className="w-3 h-3" />
              Save Layout
            </button>
          </div>
        </div>

        {/* 1-Click Desktop Layout Profiles */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <LayoutGrid className="w-3.5 h-3.5 text-zinc-500" />
          {[...BUILTIN_PROFILES, ...customProfiles].map((prof) => (
            <div
              key={prof.id}
              className="flex items-center rounded-full bg-white/[0.05] hover:bg-white/12 border border-white/10 overflow-hidden transition"
            >
              <button
                type="button"
                onClick={() => applyProfile(prof)}
                className="px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white"
              >
                {prof.name}
              </button>
              {prof.custom && (
                <button
                  type="button"
                  onClick={() => deleteProfile(prof.id)}
                  className="pr-2 text-zinc-500 hover:text-rose-400"
                  title="Delete saved profile"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 w-full max-w-2xl">
          {WORKSPACES.map((ws) => {
            const count = wm.windows.filter((w) => w.workspace === ws).length;
            const active = wm.activeWorkspace === ws;
            return (
              <button
                key={ws}
                type="button"
                onClick={() => wmStore.switchWorkspace(ws)}
                className={`group relative h-18 sm:h-20 rounded-2xl p-2.5 sm:p-3 text-left transition flex flex-col justify-between overflow-hidden ${
                  active
                    ? "glass-surface-focused ring-2 ring-violet-400/70"
                    : "glass-surface opacity-75 hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-semibold text-white">Desktop {ws}</span>
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

      {/* Spatial 3D Exposé Window Cards Grid */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={spatial3d ? { perspective: "1200px" } : undefined}
        className="flex-1 min-h-0 mx-auto w-full max-w-5xl overflow-y-auto px-1"
      >
        {activeWins.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3">
            <p className="text-sm text-zinc-400">No windows open on Desktop {wm.activeWorkspace}.</p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
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
                onClick={() => wmStore.openApp("agent-swarm")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/35 text-fuchsia-200 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Open Agent Swarm
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
          <div
            style={
              spatial3d
                ? {
                    transform: `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
                    transformStyle: "preserve-3d",
                    transition: "transform 120ms ease-out",
                  }
                : undefined
            }
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6 pt-2"
          >
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
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.03] hover:-translate-y-1 ${
                    isFocused
                      ? "glass-surface-focused ring-2 ring-violet-400/60"
                      : "glass-surface hover:border-white/25"
                  }`}
                >
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

                  <div className="p-4 h-36 flex flex-col justify-between bg-gradient-to-br from-white/[0.02] to-black/30">
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                      {def.description}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/8">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {win.pinned
                          ? "Pinned PiP"
                          : win.minimized
                          ? "Minimized"
                          : win.maximized
                          ? "Maximized"
                          : win.snap !== "none"
                          ? `Snap: ${win.snap}`
                          : `${Math.round(win.width)}×${Math.round(win.height)}`}
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
        Click a window to focus · ESC to close · ⌘E Spatial Mission Control · ⌘⇧V Clipboard · ⌃1–4 Switch Desktop
      </div>
    </div>
  );
};
