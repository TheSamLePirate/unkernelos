import { Effect } from "effect";
import {
  Activity,
  AppWindow,
  BookOpen,
  Bot,
  Box,
  Code2,
  Cpu,
  Database,
  FileText,
  Film,
  FolderOpen,
  Gem,
  GitBranch,
  Globe,
  Grid2x2,
  Layers,
  Monitor,
  Network,
  Package,
  PenTool,
  PlayCircle,
  Radar,
  Send,
  Settings,
  Sigma,
  Sparkles,
  Store,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SettingsService, useSubscriptionRef } from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { useViewport } from "../core/use-viewport.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

const APP_ICONS: Record<AppId, React.ComponentType<{ className?: string }>> = {
  "agent-studio": Bot,
  "agent-swarm": Network,
  "agent-api": Workflow,
  ide: Code2,
  notebook: BookOpen,
  microml: Layers,
  "proof-studio": Sigma,
  terminal: Terminal,
  explorer: FolderOpen,
  "api-client": Send,
  "network-inspector": Radar,
  database: Database,
  services: PlayCircle,
  "app-store": Store,
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
  "rune-settings": Gem,
  settings: Settings,
};

const PINNED_DOCK_IDS: readonly AppId[] = [
  "agent-studio",
  "agent-swarm",
  "ide",
  "notebook",
  "proof-studio",
  "terminal",
  "explorer",
  "network-inspector",
  "app-store",
  "preview",
  "git",
  "agent-api",
  "rune-settings",
  "settings",
];

interface DockSlot {
  readonly key: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly accent?: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly isActive: boolean;
  readonly isOpen: boolean;
  readonly isMinimizedOnly: boolean;
  readonly badgeCount: number;
  readonly isSystem?: boolean;
  readonly appId?: AppId;
  readonly onClick: () => void;
}

/**
 * AAA macOS / VisionOS Liquid Glass Dock:
 * - Zero vertical clipping: frosted glass tray sits behind an overflow-visible icon strip
 *   so magnified icons & tooltips soar freely above the tray.
 * - True neighbor-displacing spring magnification (icons expand their slot width smoothly).
 * - Touch-first iPad adaptation: larger tactile squircles, zero hover glitches, safe-area inset.
 */
export const Dock: React.FC = () => {
  const wm = useWm();
  const { isTouch, width: viewportWidth, keyboardInset } = useViewport();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const [pointerX, setPointerX] = useState<number | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [bouncingKey, setBouncingKey] = useState<string | null>(null);
  const [centers, setCenters] = useState<number[]>([]);

  const extraRunningIds = Array.from(
    new Set(wm.windows.map((w) => w.appId).filter((id) => !PINNED_DOCK_IDS.includes(id)))
  );
  const visibleIds: readonly AppId[] = [...PINNED_DOCK_IDS, ...extraRunningIds];

  // Compact icon sizing on tighter iPad portrait widths so all icons fit effortlessly without overflow clipping
  const totalSlots = visibleIds.length + 2;
  const maxAvailablePerSlot = Math.floor((viewportWidth - 72) / Math.max(1, totalSlots)) - 6;
  const baseSize = isTouch
    ? Math.max(36, Math.min(46, maxAvailablePerSlot))
    : Math.max(38, Math.min(46, maxAvailablePerSlot));
  const iconGlyphSize = baseSize >= 44 ? "w-[22px] h-[22px]" : "w-[19px] h-[19px]";
  const magEnabled = cfg.dockMagnification && !isTouch && viewportWidth >= 900;

  const triggerBounce = useCallback((key: string) => {
    setBouncingKey(key);
    window.setTimeout(() => {
      setBouncingKey((cur) => (cur === key ? null : cur));
    }, 440);
  }, []);

  const slots: DockSlot[] = [
    {
      key: "__launcher__",
      label: `All Apps (${Object.keys(APP_CATALOG).length - 2})`,
      shortcut: "F4",
      icon: Grid2x2,
      isActive: wm.launcherOpen,
      isOpen: wm.launcherOpen,
      isMinimizedOnly: false,
      badgeCount: 0,
      isSystem: true,
      onClick: () => wmStore.toggleLauncher(),
    },
    ...visibleIds.map((id): DockSlot => {
      const def = APP_CATALOG[id];
      const appWins = wm.windows.filter((w) => w.appId === id);
      const isOpen = appWins.length > 0;
      const isMinimizedOnly = isOpen && appWins.every((w) => w.minimized);
      const isActive = appWins.some((w) => w.id === wm.activeWindowId && !w.minimized);
      return {
        key: id,
        appId: id,
        label: def.shortTitle,
        shortcut: def.shortcut,
        accent: def.accent,
        icon: APP_ICONS[id] ?? Sparkles,
        isActive,
        isOpen,
        isMinimizedOnly,
        badgeCount: appWins.length,
        onClick: () => {
          triggerBounce(id);
          wmStore.openApp(id);
        },
      };
    }),
    {
      key: "__mission__",
      label: "Mission Control",
      shortcut: "⌘E",
      icon: Layers,
      isActive: wm.missionControlOpen,
      isOpen: wm.missionControlOpen,
      isMinimizedOnly: false,
      badgeCount: 0,
      isSystem: true,
      onClick: () => wmStore.toggleMissionControl(),
    },
  ];

  // Snapshot resting icon centers once per layout change (zero layout thrash on mousemove!)
  const measureCenters = useCallback(() => {
    const next = slotRefs.current.slice(0, slots.length).map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    setCenters(next);
  }, [slots.length]);

  useEffect(() => {
    measureCenters();
  }, [measureCenters, viewportWidth, baseSize]);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!magEnabled || e.pointerType === "touch") return;
    if (centers.length !== slots.length) measureCenters();
    const x = e.clientX;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPointerX(x);
    });
  };

  const handlePointerLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPointerX(null);
    setHoveredKey(null);
  };

  const getScaleAndLift = (idx: number): { scale: number; lift: number } => {
    if (!magEnabled || pointerX === null) return { scale: 1, lift: 0 };
    const center = centers[idx];
    if (!center) return { scale: 1, lift: 0 };
    const dist = Math.abs(pointerX - center);
    const radius = 148;
    if (dist >= radius) return { scale: 1, lift: 0 };
    const t = Math.cos((dist / radius) * (Math.PI / 2));
    const smooth = t * t;
    return {
      scale: 1 + smooth * 0.52,
      lift: smooth * 14,
    };
  };

  // Hide dock gracefully on iPad if software keyboard is covering the bottom
  const hiddenForKeyboard = isTouch && keyboardInset > 100;

  return (
    <div
      style={{
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      className={`hidden md:flex fixed left-1/2 -translate-x-1/2 z-50 justify-center pointer-events-none transition-all duration-200 ${
        hiddenForKeyboard ? "translate-y-28 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <nav
        onPointerEnter={() => {
          if (magEnabled) measureCenters();
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="relative pointer-events-auto flex items-end px-3 pb-2 pt-1 overflow-visible"
      >
        {/* Frosted Liquid Glass Tray (sits strictly behind icons so zoom & tooltips are NEVER clipped!) */}
        <div
          style={{ height: `${baseSize + 20}px` }}
          className="glass-dock pointer-events-none absolute inset-x-0 bottom-0 rounded-[22px] transition-all duration-150"
        />

        {/* Icons Row — overflow-visible! */}
        <div
          ref={rowRef}
          className="relative z-10 flex items-end gap-1.5 overflow-visible"
        >
          {slots.map((slot, idx) => {
            const Icon = slot.icon;
            const { scale, lift } = getScaleAndLift(idx);
            const size = Math.round(baseSize * scale);
            const showDividerAfter = idx === 0 || idx === slots.length - 2;
            const isHovered = hoveredKey === slot.key && !isTouch;
            const isBouncing = bouncingKey === slot.key;

            return (
              <React.Fragment key={slot.key}>
                <button
                  ref={(el) => {
                    slotRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={slot.onClick}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch") setHoveredKey(slot.key);
                  }}
                  onPointerLeave={() => {
                    setHoveredKey((cur) => (cur === slot.key ? null : cur));
                  }}
                  onContextMenu={(e) => {
                    if (!slot.appId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    wmStore.setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      kind: "dock",
                      appId: slot.appId,
                    });
                  }}
                  style={{
                    width: `${size}px`,
                    transition: pointerX !== null ? "width 75ms ease-out" : "width 210ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                  className="group relative flex flex-col items-center justify-end shrink-0 outline-none cursor-pointer touch-manipulation"
                >
                  {/* Floating Unclipped Glass Tooltip Pill with Caret */}
                  <span
                    style={{
                      transform: `translateY(${isHovered ? -(lift + 8) : -(lift + 2)}px) scale(${isHovered ? 1 : 0.94})`,
                    }}
                    className={`pointer-events-none absolute bottom-full mb-2 px-2.5 py-1 rounded-xl bg-[#0d101c]/95 backdrop-blur-xl border border-white/18 text-[11px] font-medium text-white whitespace-nowrap shadow-[0_12px_30px_rgba(0,0,0,0.7)] transition-all duration-150 z-30 ${
                      isHovered ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {slot.label}
                    {slot.shortcut && (
                      <span className="ml-1.5 px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-mono text-[10px]">
                        {slot.shortcut}
                      </span>
                    )}
                    <span className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#0d101c] border-r border-b border-white/18" />
                  </span>

                  {/* Glossy Squircle App Icon */}
                  <div
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      transform: `translateY(${-lift.toFixed(1)}px)`,
                      transition:
                        pointerX !== null
                          ? "width 75ms ease-out, height 75ms ease-out, transform 75ms ease-out"
                          : "width 210ms cubic-bezier(0.22, 1, 0.36, 1), height 210ms cubic-bezier(0.22, 1, 0.36, 1), transform 210ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className={`dock-squircle rounded-[26%] flex items-center justify-center active:scale-90 ${
                      isBouncing ? "animate-dock-bounce" : ""
                    } ${
                      slot.isSystem
                        ? slot.isActive
                          ? "bg-gradient-to-br from-violet-500 to-cyan-500 border border-white/45 text-white shadow-[0_10px_28px_rgba(139,92,246,0.45)]"
                          : "bg-white/12 hover:bg-white/20 border border-white/18 text-zinc-100"
                        : `bg-gradient-to-br ${slot.accent} ${
                            slot.isActive
                              ? "ring-[1.5px] ring-white/75 shadow-[0_14px_32px_rgba(0,0,0,0.65)]"
                              : "opacity-95 group-hover:opacity-100"
                          }`
                    }`}
                  >
                    <Icon
                      className={`${iconGlyphSize} text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] transition-transform duration-100`}
                    />
                    {slot.badgeCount > 1 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-black/85 border border-white/35 text-[9px] font-mono font-bold text-white flex items-center justify-center z-10 shadow">
                        {slot.badgeCount}
                      </span>
                    )}
                  </div>

                  {/* Glowing Active / Minimized Indicator Dot */}
                  <span
                    className={`mt-1.5 h-[3.5px] rounded-full transition-all duration-200 ${
                      slot.isActive
                        ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] opacity-100"
                        : slot.isMinimizedOnly
                        ? "w-2 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] opacity-95"
                        : slot.isOpen
                        ? "w-1.5 bg-zinc-300 opacity-85"
                        : "w-1 opacity-0"
                    }`}
                  />
                </button>

                {showDividerAfter && (
                  <div
                    style={{ height: `${Math.round(baseSize * 0.72)}px` }}
                    className="w-px bg-gradient-to-b from-transparent via-white/22 to-transparent mx-1 mb-2.5 shrink-0"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
