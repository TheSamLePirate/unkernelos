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
  Sliders,
  Sparkles,
  Store,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useMods } from "../core/mod-store.ts";
import { SettingsService, useSubscriptionRef } from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { useViewport } from "../core/use-viewport.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

const APP_ICONS: Record<AppId, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
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
  "mod-studio": Sliders,
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
  "mod-studio",
  "rune-settings",
  "settings",
];

interface DockSlot {
  readonly key: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly accent?: string;
  readonly icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  readonly isActive: boolean;
  readonly isOpen: boolean;
  readonly isMinimizedOnly: boolean;
  readonly badgeCount: number;
  readonly isSystem?: boolean;
  readonly appId?: AppId;
  readonly onClick: () => void;
}

const SLOT_GAP = 7; // px between items
const DIVIDER_SLOT_W = 11; // 1px line + 5px margin on each side
const TRAY_PAD_Y = 10; // exact top & bottom symmetry inside glass tray

/**
 * AAA macOS Sequoia / VisionOS Liquid Glass Dock:
 * - Pixel-exact vertical centering: squircles sit dead-center inside the frosted tray
 *   (TRAY_PAD_Y above and below), while glowing indicator pills float inside the lower
 *   10px band so running & idle icons ALWAYS share the exact same baseline.
 * - Center-invariant magnification math: computes resting icon centers analytically from
 *   the row's midpoint (which never moves), eliminating horizontal drift & jitter.
 * - Proportional glyph scaling: icons scale smoothly inside their growing squircles.
 * - Zero vertical clipping: overflow-visible row floats over the background glass tray.
 */
export const Dock: React.FC<{ embedded3d?: boolean }> = ({ embedded3d = false }) => {
  const wm = useWm();
  const mods = useMods();
  const { isTouch, width: viewportWidth, keyboardInset } = useViewport();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [pointerRelX, setPointerRelX] = useState<number | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [bouncingKey, setBouncingKey] = useState<string | null>(null);

  const extraRunningIds = Array.from(
    new Set(wm.windows.map((w) => w.appId).filter((id) => !PINNED_DOCK_IDS.includes(id)))
  );
  const visibleIds: readonly AppId[] = [...PINNED_DOCK_IDS, ...extraRunningIds];

  // Fit all icons cleanly with balanced spacing across desktop & iPad widths
  const totalSlots = visibleIds.length + 2;
  const maxAvailablePerSlot = Math.floor((viewportWidth - 88 - 2 * DIVIDER_SLOT_W) / Math.max(1, totalSlots)) - SLOT_GAP;
  const baseSize = Math.max(36, Math.min(46, maxAvailablePerSlot));
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

  // Analytically compute each slot's exact resting horizontal center relative to row midpoint.
  // Because the dock is centered at viewport 50%, midpoint X is invariant during magnification!
  const restingOffsets = useMemo(() => {
    const centers: number[] = [];
    let cursor = 0;
    for (let i = 0; i < slots.length; i++) {
      centers.push(cursor + baseSize / 2);
      cursor += baseSize;
      if (i < slots.length - 1) {
        cursor += SLOT_GAP;
        if (i === 0 || i === slots.length - 2) {
          cursor += DIVIDER_SLOT_W + SLOT_GAP;
        }
      }
    }
    const mid = cursor / 2;
    return centers.map((c) => c - mid);
  }, [slots.length, baseSize]);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!magEnabled || e.pointerType === "touch") return;
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - (rect.left + rect.width / 2);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPointerRelX(relX);
    });
  };

  const handlePointerLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPointerRelX(null);
    setHoveredKey(null);
  };

  const getScaleAndLift = (idx: number): { scale: number; lift: number } => {
    if (!magEnabled || pointerRelX === null) return { scale: 1, lift: 0 };
    const center = restingOffsets[idx];
    if (center === undefined) return { scale: 1, lift: 0 };
    const dist = Math.abs(pointerRelX - center);
    const radius = baseSize * 3.1;
    if (dist >= radius) return { scale: 1, lift: 0 };
    const t = Math.cos((dist / radius) * (Math.PI / 2));
    const smooth = t * t;
    return {
      scale: 1 + smooth * 0.48,
      lift: smooth * 13,
    };
  };

  const hiddenForKeyboard = isTouch && keyboardInset > 100;
  const dockStyle = mods.shell.dockStyle;
  if (dockStyle === "hidden") return null;

  const isTaskbar = dockStyle === "full-taskbar" && !embedded3d;
  const isCyberRail = dockStyle === "cyber-rail";
  const isMinimalPill = dockStyle === "minimal-pill";

  const trayHeight = baseSize + TRAY_PAD_Y * 2;
  const dividerHeight = Math.round(baseSize * 0.56);
  const dividerOffsetBottom = Math.round((baseSize - dividerHeight) / 2);

  return (
    <div
      style={
        embedded3d
          ? undefined
          : {
              bottom: isTaskbar ? "0px" : "max(0.75rem, env(safe-area-inset-bottom))",
            }
      }
      className={
        embedded3d
          ? "flex justify-center pointer-events-none"
          : `hidden md:flex fixed ${
              isTaskbar ? "inset-x-0" : "left-1/2 -translate-x-1/2"
            } z-50 justify-center pointer-events-none transition-all duration-200 ${
              hiddenForKeyboard ? "translate-y-28 opacity-0" : "translate-y-0 opacity-100"
            }`
      }
    >
      <nav
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          paddingLeft: "12px",
          paddingRight: "12px",
          paddingBottom: `${TRAY_PAD_Y}px`,
          paddingTop: `${TRAY_PAD_Y}px`,
        }}
        className={`relative pointer-events-auto flex items-end overflow-visible ${
          isTaskbar ? "w-full justify-center" : ""
        }`}
      >
        {/* Frosted Liquid Glass Tray (adapts to modded dockStyle & dockRadiusPx!) */}
        <div
          style={{
            height: `${trayHeight}px`,
            borderRadius: isTaskbar ? "0px" : `${mods.shell.dockRadiusPx}px`,
          }}
          className={`glass-dock pointer-events-none absolute inset-x-0 bottom-0 transition-all duration-150 ${
            isCyberRail
              ? "!border-cyan-400/45 shadow-[0_0_28px_rgba(34,211,238,0.28)]"
              : isMinimalPill
              ? "!bg-black/45 !border-white/12"
              : ""
          }`}
        />

        {/* Icons Row — overflow-visible & pixel-aligned baseline! */}
        <div
          ref={rowRef}
          style={{ gap: `${SLOT_GAP}px` }}
          className="relative z-10 flex items-end overflow-visible"
        >
          {slots.map((slot, idx) => {
            const Icon = slot.icon;
            const { scale, lift } = getScaleAndLift(idx);
            const size = Math.round(baseSize * scale);
            const glyphPx = Math.round(size * 0.48);
            const showDividerAfter = idx === 0 || idx === slots.length - 2;
            const isHovered = hoveredKey === slot.key && !isTouch;
            const isBouncing = bouncingKey === slot.key;

            return (
              <React.Fragment key={slot.key}>
                <button
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
                    height: `${baseSize}px`,
                    transition:
                      pointerRelX !== null
                        ? "width 70ms ease-out"
                        : "width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                  className="group relative flex items-end justify-center shrink-0 outline-none cursor-pointer touch-manipulation"
                >
                  {/* Floating Unclipped Glass Tooltip Pill with Caret */}
                  <span
                    style={{
                      bottom: `${size + lift + 10}px`,
                      transform: `scale(${isHovered ? 1 : 0.94})`,
                    }}
                    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-[#0d101c]/95 backdrop-blur-xl border border-white/18 text-[11px] font-medium text-white whitespace-nowrap shadow-[0_12px_30px_rgba(0,0,0,0.7)] transition-opacity duration-150 z-30 ${
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

                  {/* Glossy Squircle App Icon (anchored cleanly to baseline, grows upward) */}
                  <div
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      transform: `translateY(${-lift.toFixed(1)}px)`,
                      transition:
                        pointerRelX !== null
                          ? "width 70ms ease-out, height 70ms ease-out, transform 70ms ease-out"
                          : "width 220ms cubic-bezier(0.22, 1, 0.36, 1), height 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className={`dock-squircle rounded-[26%] flex items-center justify-center active:scale-90 ${
                      isBouncing ? "animate-dock-bounce" : ""
                    } ${
                      slot.isSystem
                        ? slot.isActive
                          ? "bg-gradient-to-br from-violet-500 to-cyan-500 border border-white/45 text-white shadow-[0_10px_28px_rgba(139,92,246,0.45)]"
                          : "bg-white/12 hover:bg-white/22 border border-white/18 text-zinc-100"
                        : `bg-gradient-to-br ${slot.accent} border border-white/20 ${
                            slot.isActive
                              ? "ring-[1.5px] ring-white/80 shadow-[0_14px_32px_rgba(0,0,0,0.65)]"
                              : "opacity-95 group-hover:opacity-100"
                          }`
                    }`}
                  >
                    <Icon
                      style={{ width: `${glyphPx}px`, height: `${glyphPx}px` }}
                      className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.42)] shrink-0"
                    />
                    {slot.badgeCount > 1 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-black/85 border border-white/35 text-[9px] font-mono font-bold text-white flex items-center justify-center z-10 shadow">
                        {slot.badgeCount}
                      </span>
                    )}
                  </div>

                  {/* Absolute Indicator Dot inside the bottom 10px tray band (never offsets icons!) */}
                  <span
                    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-[7px] h-[3px] rounded-full transition-all duration-200 ${
                      slot.isActive
                        ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] opacity-100"
                        : slot.isMinimizedOnly
                        ? "w-2 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)] opacity-95"
                        : slot.isOpen
                        ? "w-1.5 bg-zinc-300 opacity-85"
                        : "w-1 opacity-0"
                    }`}
                  />
                </button>

                {showDividerAfter && (
                  <div
                    style={{
                      width: `${DIVIDER_SLOT_W}px`,
                      height: `${baseSize}px`,
                    }}
                    className="flex items-end justify-center shrink-0"
                  >
                    <div
                      style={{
                        height: `${dividerHeight}px`,
                        marginBottom: `${dividerOffsetBottom}px`,
                      }}
                      className="w-px bg-gradient-to-b from-transparent via-white/26 to-transparent"
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
