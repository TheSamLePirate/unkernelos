import { Effect } from "effect";
import {
  Activity,
  AppWindow,
  Bot,
  Box,
  Code2,
  Cpu,
  Database,
  FileText,
  Film,
  FolderOpen,
  GitBranch,
  Globe,
  Grid2x2,
  Layers,
  Monitor,
  Package,
  PenTool,
  PlayCircle,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { SettingsService, useSubscriptionRef } from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

const APP_ICONS: Record<AppId, React.ComponentType<{ className?: string }>> = {
  "agent-studio": Bot,
  "agent-api": Workflow,
  ide: Code2,
  terminal: Terminal,
  explorer: FolderOpen,
  "api-client": Send,
  database: Database,
  services: PlayCircle,
  automations: Zap,
  "custom-app": Sparkles,
  notes: FileText,
  whiteboard: PenTool,
  "media-studio": Film,
  "dev-utils": Wrench,
  processes: Cpu,
  "shader-synth": Sparkles,
  preview: Globe,
  screen: Monitor,
  "gl-window": Box,
  "wayland-surface": AppWindow,
  git: GitBranch,
  toolchain: Package,
  monitor: Activity,
  settings: Settings,
};

const PINNED_DOCK_IDS: readonly AppId[] = [
  "agent-studio",
  "agent-api",
  "ide",
  "terminal",
  "explorer",
  "api-client",
  "database",
  "services",
  "notes",
  "preview",
  "screen",
  "git",
  "shader-synth",
  "settings",
];

export const Dock: React.FC = () => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const navRef = useRef<HTMLElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);

  // Include any running non-pinned app dynamically in the Dock (macOS-style)
  const extraRunningIds = Array.from(
    new Set(
      wm.windows
        .map((w) => w.appId)
        .filter((id) => !PINNED_DOCK_IDS.includes(id))
    )
  );
  const visibleIds: readonly AppId[] = [...PINNED_DOCK_IDS, ...extraRunningIds];

  const getScale = (idx: number): { scale: number; lift: number } => {
    if (!cfg.dockMagnification || mouseX === null || !navRef.current) {
      return { scale: 1, lift: 0 };
    }
    const items = navRef.current.querySelectorAll<HTMLElement>("[data-dock-idx]");
    const el = items[idx];
    if (!el) return { scale: 1, lift: 0 };
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(mouseX - center);
    const radius = 116;
    if (dist >= radius) return { scale: 1, lift: 0 };
    const factor = Math.cos((dist / radius) * (Math.PI / 2));
    const smooth = factor * factor;
    return {
      scale: 1 + smooth * 0.36,
      lift: smooth * 9,
    };
  };

  return (
    <div className="hidden md:block fixed bottom-3 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
      <nav
        ref={navRef}
        onMouseMove={(e) => setMouseX(e.clientX)}
        onMouseLeave={() => setMouseX(null)}
        className="glass-dock px-2.5 py-2 rounded-2xl flex items-end gap-1.5 overflow-x-auto no-scrollbar"
      >
        {/* App Launcher / Launchpad (All 18 Apps) */}
        <button
          data-dock-idx={0}
          type="button"
          onClick={() => wmStore.toggleLauncher()}
          className="group relative flex flex-col items-center justify-end shrink-0"
        >
          <span className="pointer-events-none absolute -top-11 px-2.5 py-1 rounded-lg bg-[#0d1018]/95 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl z-20">
            All Apps (22) <span className="ml-1 text-zinc-500 font-mono">F4</span>
          </span>
          <div
            style={{
              transform: `translateY(${-getScale(0).lift.toFixed(1)}px) scale(${getScale(0).scale.toFixed(3)})`,
              transformOrigin: "bottom center",
            }}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-100 ease-out border ${
              wm.launcherOpen
                ? "bg-gradient-to-br from-violet-500 to-cyan-500 border-white/50 text-white shadow-lg"
                : "bg-white/10 hover:bg-white/18 border-white/15 text-zinc-100"
            }`}
          >
            <Grid2x2 className="w-5 h-5" />
          </div>
          <span
            className={`mt-1 h-1 rounded-full transition-all ${
              wm.launcherOpen ? "w-3.5 bg-cyan-400 opacity-100" : "w-1 opacity-0"
            }`}
          />
        </button>

        <div className="h-9 w-px bg-white/12 mx-0.5 self-center shrink-0" />

        {visibleIds.map((id, i) => {
          const idx = i + 1;
          const def = APP_CATALOG[id];
          const Icon = APP_ICONS[id] ?? Sparkles;
          const appWins = wm.windows.filter((w) => w.appId === id);
          const isOpen = appWins.length > 0;
          const isMinimizedOnly = isOpen && appWins.every((w) => w.minimized);
          const isActive = appWins.some((w) => w.id === wm.activeWindowId && !w.minimized);
          const { scale, lift } = getScale(idx);

          return (
            <button
              key={id}
              data-dock-idx={idx}
              type="button"
              onClick={() => wmStore.openApp(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                wmStore.setContextMenu({ x: e.clientX, y: e.clientY, kind: "dock", appId: id });
              }}
              className="group relative flex flex-col items-center justify-end shrink-0"
            >
              <span className="pointer-events-none absolute -top-11 px-2.5 py-1 rounded-lg bg-[#0d1018]/95 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl z-20">
                {def.shortTitle}
                {def.shortcut && <span className="ml-1.5 text-zinc-500 font-mono">{def.shortcut}</span>}
              </span>

              <div
                style={{
                  transform: `translateY(${-lift.toFixed(1)}px) scale(${scale.toFixed(3)})`,
                  transformOrigin: "bottom center",
                }}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-100 ease-out bg-gradient-to-br ${def.accent} ${
                  isActive
                    ? "ring-2 ring-white/60 shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
                    : "opacity-90 group-hover:opacity-100 shadow-md"
                }`}
              >
                <Icon className="w-5 h-5 text-white drop-shadow" />
                {appWins.length > 1 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/80 border border-white/30 text-[9px] font-mono text-white flex items-center justify-center">
                    {appWins.length}
                  </span>
                )}
              </div>

              <span
                className={`mt-1 h-1 rounded-full transition-all ${
                  isActive
                    ? "w-3.5 bg-white opacity-100"
                    : isMinimizedOnly
                    ? "w-1.5 bg-amber-400 opacity-90"
                    : isOpen
                    ? "w-1.5 bg-zinc-400 opacity-85"
                    : "w-1 opacity-0"
                }`}
              />
            </button>
          );
        })}

        {/* Divider + Mission Control trigger */}
        <div className="h-9 w-px bg-white/12 mx-0.5 self-center shrink-0" />
        <button
          data-dock-idx={visibleIds.length + 1}
          type="button"
          onClick={() => wmStore.toggleMissionControl()}
          className="group relative flex flex-col items-center justify-end shrink-0"
        >
          <span className="pointer-events-none absolute -top-11 px-2.5 py-1 rounded-lg bg-[#0d1018]/95 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl z-20">
            Mission Control <span className="ml-1 text-zinc-500 font-mono">⌘E</span>
          </span>
          <div
            style={{
              transform: `translateY(${-getScale(visibleIds.length + 1).lift.toFixed(1)}px) scale(${getScale(visibleIds.length + 1).scale.toFixed(3)})`,
              transformOrigin: "bottom center",
            }}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-100 ease-out border ${
              wm.missionControlOpen
                ? "bg-violet-500/40 border-violet-300/60 text-white"
                : "bg-white/10 hover:bg-white/18 border-white/15 text-zinc-200"
            }`}
          >
            <Layers className="w-5 h-5" />
          </div>
          <span
            className={`mt-1 h-1 rounded-full transition-all ${
              wm.missionControlOpen ? "w-3.5 bg-violet-400 opacity-100" : "w-1 opacity-0"
            }`}
          />
        </button>
      </nav>
    </div>
  );
};
