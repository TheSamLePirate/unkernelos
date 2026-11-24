import { Effect } from "effect";
import {
  Activity,
  Bot,
  Code2,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Layers,
  Monitor,
  Package,
  Send,
  Settings,
  Terminal,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { SettingsService, useSubscriptionRef } from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

const DOCK_ITEMS: readonly { id: AppId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "agent-studio", icon: Bot },
  { id: "ide", icon: Code2 },
  { id: "terminal", icon: Terminal },
  { id: "explorer", icon: FolderOpen },
  { id: "api-client", icon: Send },
  { id: "notes", icon: FileText },
  { id: "preview", icon: Globe },
  { id: "screen", icon: Monitor },
  { id: "git", icon: GitBranch },
  { id: "toolchain", icon: Package },
  { id: "monitor", icon: Activity },
  { id: "settings", icon: Settings },
];

export const Dock: React.FC = () => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const navRef = useRef<HTMLElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);

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
    const radius = 120;
    if (dist >= radius) return { scale: 1, lift: 0 };
    const factor = Math.cos((dist / radius) * (Math.PI / 2));
    const smooth = factor * factor;
    return {
      scale: 1 + smooth * 0.38,
      lift: smooth * 10,
    };
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <nav
        ref={navRef}
        onMouseMove={(e) => setMouseX(e.clientX)}
        onMouseLeave={() => setMouseX(null)}
        className="glass-dock px-3 py-2 rounded-2xl flex items-end gap-2"
      >
        {DOCK_ITEMS.map(({ id, icon: Icon }, idx) => {
          const def = APP_CATALOG[id];
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
              className="group relative flex flex-col items-center justify-end"
            >
              {/* Floating Tooltip */}
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

              {/* Running / Active / Minimized indicator */}
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
        <div className="h-9 w-px bg-white/12 mx-0.5 self-center" />
        <button
          data-dock-idx={DOCK_ITEMS.length}
          type="button"
          onClick={() => wmStore.toggleMissionControl()}
          className="group relative flex flex-col items-center justify-end"
        >
          <span className="pointer-events-none absolute -top-11 px-2.5 py-1 rounded-lg bg-[#0d1018]/95 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl z-20">
            Mission Control <span className="ml-1 text-zinc-500 font-mono">⌘E</span>
          </span>
          <div
            style={{
              transform: `translateY(${-getScale(DOCK_ITEMS.length).lift.toFixed(1)}px) scale(${getScale(DOCK_ITEMS.length).scale.toFixed(3)})`,
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
