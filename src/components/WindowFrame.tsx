import { Layers, Maximize2, Minimize2, Minus, PanelLeft, PanelRight, Pin, Square, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { useMods } from "../core/mod-store.ts";
import { useViewport } from "../core/use-viewport.ts";
import { APP_CATALOG, useWm, wmStore, type SnapZone, type WindowInstance, type WorkspaceId } from "../wm/wm-store.ts";
import { getSnapZoneStyle } from "./SnapPreviewOverlay.tsx";

interface WindowFrameProps {
  win: WindowInstance;
  focused: boolean;
  visible: boolean;
  children: React.ReactNode;
}

const TOP_BAR_H = 38;
const DOCK_H = 82;

function detectSnapZone(clientX: number, clientY: number): SnapZone | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const edge = 24;
  const cornerH = vh * 0.28;

  if (clientY <= TOP_BAR_H + 16) {
    if (clientX <= edge * 3) return "top-left";
    if (clientX >= vw - edge * 3) return "top-right";
    return "maximize";
  }
  if (clientX <= edge) {
    if (clientY <= TOP_BAR_H + cornerH) return "top-left";
    if (clientY >= vh - DOCK_H - cornerH) return "bottom-left";
    return "left";
  }
  if (clientX >= vw - edge) {
    if (clientY <= TOP_BAR_H + cornerH) return "top-right";
    if (clientY >= vh - DOCK_H - cornerH) return "bottom-right";
    return "right";
  }
  return null;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({ win, focused, visible, children }) => {
  const wm = useWm();
  const mods = useMods();
  const dec = mods.decorator;
  const spatial3d = mods.desktop3d.enabled && mods.desktop3d.spatialWindows;
  const { isMobile, isTouch, keyboardInset } = useViewport();
  const [interacting, setInteracting] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const swipeRef = useRef<{ startX: number; startY: number } | null>(null);

  const def = APP_CATALOG[win.appId];
  const isTabletTouch = isTouch && !isMobile;

  // Unified Pointer Events for Mouse, iPad Touch & Apple Pencil dragging (with RAF throttle & magnetic snap!)
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;

    // On Mobile: track horizontal swipe on titlebar to cycle open windows smoothly!
    if (isMobile) {
      swipeRef.current = { startX: e.clientX, startY: e.clientY };
      return;
    }

    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    wmStore.focusWindow(win.id);

    let origX = win.x;
    let origY = win.y;
    if (win.maximized || win.snap !== "none") {
      origX = Math.max(12, Math.round(e.clientX - win.width / 2));
      origY = Math.max(TOP_BAR_H + 4, e.clientY - 20);
      wmStore.moveResize(win.id, { x: origX, y: origY });
    }

    const headerEl = e.currentTarget;
    try {
      headerEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unavailable
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
    setInteracting(true);

    let activePreview: SnapZone | null = null;
    let rafId = 0;
    let lastX = e.clientX;
    let lastY = e.clientY;

    const flush = () => {
      rafId = 0;
      if (!dragRef.current) return;
      const nx = dragRef.current.origX + (lastX - dragRef.current.startX);
      const ny = Math.max(TOP_BAR_H, dragRef.current.origY + (lastY - dragRef.current.startY));
      wmStore.moveResize(win.id, { x: nx, y: ny });
      activePreview = detectSnapZone(lastX, lastY);
      wmStore.setDragSnapPreview(activePreview);
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current || ev.pointerId !== dragRef.current.pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = (ev: PointerEvent) => {
      if (!dragRef.current || ev.pointerId !== dragRef.current.pointerId) return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        flush();
      }
      dragRef.current = null;
      setInteracting(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        headerEl.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      if (activePreview) {
        wmStore.snapWindow(win.id, activePreview);
      } else {
        wmStore.setDragSnapPreview(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onHeaderPointerUpMobile = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || !swipeRef.current) return;
    const dx = e.clientX - swipeRef.current.startX;
    const dy = Math.abs(e.clientY - swipeRef.current.startY);
    swipeRef.current = null;
    if (Math.abs(dx) > 52 && dy < 44) {
      const wsWins = wm.windows.filter((w) => w.workspace === wm.activeWorkspace);
      if (wsWins.length > 1) {
        const idx = wsWins.findIndex((w) => w.id === win.id);
        const dir = dx < 0 ? 1 : -1;
        const next = wsWins[(idx + dir + wsWins.length) % wsWins.length];
        if (next) wmStore.focusWindow(next.id);
      }
    }
  };

  // Unified Pointer Events for Mouse, iPad Touch & Apple Pencil bottom-right resizing!
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    wmStore.focusWindow(win.id);

    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origW: win.width,
      origH: win.height,
    };
    setInteracting(true);

    let rafId = 0;
    let lastX = e.clientX;
    let lastY = e.clientY;

    const flush = () => {
      rafId = 0;
      if (!resizeRef.current) return;
      const maxW = Math.max(def.minWidth, window.innerWidth - 16);
      const maxH = Math.max(def.minHeight, window.innerHeight - TOP_BAR_H - 24);
      const nw = Math.min(maxW, Math.max(def.minWidth, resizeRef.current.origW + (lastX - resizeRef.current.startX)));
      const nh = Math.min(maxH, Math.max(def.minHeight, resizeRef.current.origH + (lastY - resizeRef.current.startY)));
      wmStore.moveResize(win.id, { width: nw, height: nh });
    };

    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current || ev.pointerId !== resizeRef.current.pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = (ev: PointerEvent) => {
      if (!resizeRef.current || ev.pointerId !== resizeRef.current.pointerId) return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        flush();
      }
      resizeRef.current = null;
      setInteracting(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const snapStyle = win.maximized
    ? getSnapZoneStyle("maximize")
    : win.snap !== "none"
    ? getSnapZoneStyle(win.snap)
    : null;

  const mobileSheetStyle: React.CSSProperties = {
    left: 0,
    right: 0,
    top: "calc(38px + env(safe-area-inset-top))",
    bottom: keyboardInset > 0 ? `${keyboardInset}px` : "calc(70px + env(safe-area-inset-bottom))",
  };

  const style: React.CSSProperties = {
    ...(isMobile
      ? mobileSheetStyle
      : snapStyle ?? {
          left: win.x,
          top: win.y,
          width: win.width,
          height: win.height,
        }),
    zIndex: win.pinned ? win.zIndex + 5000 : win.zIndex,
    display: !visible || win.minimized ? "none" : "flex",
    borderRadius: isMobile ? undefined : `${dec.radiusPx}px`,
    borderWidth: isMobile ? undefined : `${dec.borderWidthPx}px`,
    opacity: focused ? 1 : dec.unfocusedOpacity,
    boxShadow:
      focused && !isMobile && dec.activeGlowPx > 0
        ? `0 32px 86px -12px rgba(0,0,0,0.86), 0 0 ${dec.activeGlowPx}px -10px var(--window-glow), 0 1px 0 0 rgba(255,255,255,0.22) inset`
        : undefined,
    transform:
      !isMobile && spatial3d && !interacting
        ? focused
          ? "translate3d(0, 0, 18px) scale(1)"
          : "translate3d(0, 4px, -36px) scale(0.985)"
        : undefined,
    transition: interacting ? "none" : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease, box-shadow 220ms ease",
    willChange: interacting ? "left, top, width, height" : undefined,
  };

  const openWsCount = wm.windows.filter((w) => w.workspace === wm.activeWorkspace).length;

  const isCyber = dec.style === "cyber-hud";
  const isRetro = dec.style === "retro-95";
  const isSwiss = dec.style === "minimal-swiss";
  const isZen = dec.style === "floating-zen";
  const isI3 = dec.style === "tiling-i3";
  const isWin = dec.style === "windows";

  const renderWindowControls = () => {
    if (isRetro) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => wmStore.minimizeWindow(win.id)}
            title="Minimize"
            className="w-5 h-5 flex items-center justify-center bg-[#272f4a] border border-white/40 border-b-black/70 border-r-black/70 text-[10px] font-bold text-white hover:bg-[#354066] active:scale-95 cursor-pointer"
          >
            _
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className="w-5 h-5 flex items-center justify-center bg-[#272f4a] border border-white/40 border-b-black/70 border-r-black/70 text-white hover:bg-[#354066] active:scale-95 cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.closeWindow(win.id)}
            title="Close"
            className="w-5 h-5 flex items-center justify-center bg-rose-600/90 border border-white/45 border-b-black/70 border-r-black/70 text-white hover:bg-rose-500 active:scale-95 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (isCyber || isSwiss || isI3 || isWin) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => wmStore.minimizeWindow(win.id)}
            title="Minimize"
            className={`px-2 py-1 text-zinc-300 hover:text-white transition cursor-pointer ${
              isCyber
                ? "border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-200"
                : isSwiss
                ? "hover:bg-white/10 font-mono text-[10px]"
                : "rounded-md hover:bg-white/12"
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className={`px-2 py-1 text-zinc-300 hover:text-white transition cursor-pointer ${
              isCyber
                ? "border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-200"
                : isSwiss
                ? "hover:bg-white/10 font-mono text-[10px]"
                : "rounded-md hover:bg-white/12"
            }`}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.closeWindow(win.id)}
            title="Close"
            className={`px-2 py-1 transition cursor-pointer ${
              isCyber
                ? "border border-rose-500/55 bg-rose-500/20 hover:bg-rose-500/40 text-rose-200"
                : isSwiss
                ? "bg-[#ff4d00]/85 hover:bg-[#ff4d00] text-black font-bold"
                : "rounded-md hover:bg-rose-500/80 text-zinc-200 hover:text-white"
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (isZen) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => wmStore.closeWindow(win.id)}
            title="Close"
            className="w-2.5 h-2.5 rounded-full bg-white/30 hover:bg-rose-400 transition cursor-pointer"
          />
          <button
            type="button"
            onClick={() => wmStore.minimizeWindow(win.id)}
            title="Minimize"
            className="w-2.5 h-2.5 rounded-full bg-white/22 hover:bg-amber-300 transition cursor-pointer"
          />
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className="w-2.5 h-2.5 rounded-full bg-white/22 hover:bg-emerald-300 transition cursor-pointer"
          />
        </div>
      );
    }

    // Default macOS / iPadOS traffic lights
    return (
      <div className={`flex items-center group ${isTabletTouch ? "gap-1.5" : "gap-2"}`}>
        <button
          type="button"
          onClick={() => wmStore.closeWindow(win.id)}
          title="Close"
          className={`flex items-center justify-center rounded-full transition cursor-pointer ${
            isTabletTouch ? "w-7 h-7 active:scale-90" : "w-3 h-3"
          }`}
        >
          <span
            className={`${
              isTabletTouch ? "w-4 h-4" : "w-3 h-3"
            } rounded-full bg-rose-500/90 hover:bg-rose-400 flex items-center justify-center shadow-inner`}
          >
            <X
              className={`${
                isTabletTouch ? "w-2.5 h-2.5 opacity-80" : "w-2 h-2 opacity-0 group-hover:opacity-100"
              } text-rose-950`}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={() => wmStore.minimizeWindow(win.id)}
          title="Minimize"
          className={`flex items-center justify-center rounded-full transition cursor-pointer ${
            isTabletTouch ? "w-7 h-7 active:scale-90" : "w-3 h-3"
          }`}
        >
          <span
            className={`${
              isTabletTouch ? "w-4 h-4" : "w-3 h-3"
            } rounded-full bg-amber-400/90 hover:bg-amber-300 flex items-center justify-center shadow-inner`}
          >
            <Minimize2
              className={`${
                isTabletTouch ? "w-2.5 h-2.5 opacity-80" : "w-2 h-2 opacity-0 group-hover:opacity-100"
              } text-amber-950`}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={() => wmStore.toggleMaximize(win.id)}
          title="Maximize"
          className={`flex items-center justify-center rounded-full transition cursor-pointer ${
            isTabletTouch ? "w-7 h-7 active:scale-90" : "w-3 h-3"
          }`}
        >
          <span
            className={`${
              isTabletTouch ? "w-4 h-4" : "w-3 h-3"
            } rounded-full bg-emerald-500/90 hover:bg-emerald-400 flex items-center justify-center shadow-inner`}
          >
            <Maximize2
              className={`${
                isTabletTouch ? "w-2.5 h-2.5 opacity-80" : "w-2 h-2 opacity-0 group-hover:opacity-100"
              } text-emerald-950`}
            />
          </span>
        </button>
      </div>
    );
  };

  const titlebarBg = isRetro
    ? focused
      ? "bg-gradient-to-r from-[#0c4a6e] via-[#4f46e5] to-[#be185d] border-b border-white/30"
      : "bg-gradient-to-r from-[#1e293b] to-[#334155] border-b border-white/15"
    : isCyber
    ? "bg-gradient-to-r from-rose-500/18 via-[#0a0816]/90 to-cyan-500/18 border-b border-cyan-400/25"
    : isSwiss
    ? "bg-[#111113]/95 border-b border-white/15"
    : isI3
    ? "bg-black/75 border-b border-white/12"
    : "bg-gradient-to-b from-white/[0.075] to-white/[0.015] border-b border-white/10";

  return (
    <div
      style={style}
      onPointerDown={() => wmStore.focusWindow(win.id)}
      data-window-decorator={dec.style}
      className={`fixed flex-col overflow-hidden animate-window-in ${
        isMobile ? "rounded-t-[20px] border-x-0" : ""
      } ${focused ? "glass-surface-focused" : "glass-surface"}`}
    >
      {/* Optional Laser Accent Bar (Cyber HUD / Swiss / Spatial Mod) */}
      {dec.titlebarAccentBar && focused && !isMobile && (
        <div
          style={{
            background: "linear-gradient(90deg, var(--accent-primary), var(--accent-cyan), var(--accent-primary))",
          }}
          className="h-[2px] w-full shrink-0"
        />
      )}

      {/* Titlebar */}
      <div
        data-unkernel-titlebar="true"
        onPointerDown={onHeaderPointerDown}
        onPointerUp={onHeaderPointerUpMobile}
        onDoubleClick={() => !isMobile && wmStore.toggleMaximize(win.id)}
        style={{
          height: isMobile ? "44px" : isTabletTouch ? "44px" : `${dec.titlebarHeightPx}px`,
        }}
        className={`relative flex items-center justify-between px-3 shrink-0 select-none touch-none ${titlebarBg} ${
          isMobile ? "" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {isMobile ? (
          <>
            {/* Subtle iOS swipe-pill indicator */}
            {openWsCount > 1 && (
              <span className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-white/20" />
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => wmStore.toggleMissionControl()}
                className="p-2 rounded-xl bg-white/8 active:bg-white/18 active:scale-95 text-zinc-200 transition"
                title="Switch App"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => wmStore.minimizeWindow(win.id)}
                className="p-2 rounded-xl bg-white/6 active:bg-white/16 active:scale-95 text-zinc-400 transition"
                title="Show Desktop"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100 truncate px-2">
              <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${def.accent} shrink-0 shadow`} />
              <span className="truncate">{win.title}</span>
            </div>
            <button
              type="button"
              onClick={() => wmStore.closeWindow(win.id)}
              className="p-2 rounded-xl bg-rose-500/20 active:bg-rose-500/35 active:scale-95 text-rose-200 transition"
              title="Close App"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            {dec.buttonPosition === "left" && renderWindowControls()}

            <div
              className={`flex items-center gap-2 text-xs font-medium text-zinc-100 truncate px-2 ${
                dec.titleAlign === "left" ? "flex-1 justify-start" : "justify-center"
              }`}
            >
              {isCyber ? (
                <span className="font-mono text-[11px] tracking-wider text-cyan-200 truncate">
                  [ {win.title} ]
                </span>
              ) : isI3 ? (
                <span className="font-mono text-[11px] text-emerald-300 truncate">
                  ws:{win.workspace} :: {win.title}
                </span>
              ) : (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${def.accent} shrink-0`} />
                  <span className="truncate">{win.title}</span>
                </>
              )}
            </div>

            {/* Workspace, Snap & Right-Side Controls */}
            <div className="flex items-center gap-1">
              {dec.showWorkspacePills && (
                <div className="hidden lg:flex items-center gap-0.5 mr-1 px-1 py-0.5 rounded-md bg-white/[0.04] border border-white/8">
                  {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                    <button
                      key={ws}
                      type="button"
                      title={`Move to Desktop ${ws}`}
                      onClick={() => wmStore.moveWindowToWorkspace(win.id, ws)}
                      className={`w-4 h-4 rounded text-[9px] font-mono transition ${
                        win.workspace === ws
                          ? "bg-white/18 text-white font-semibold"
                          : "text-zinc-500 hover:text-zinc-200 hover:bg-white/8"
                      }`}
                    >
                      {ws}
                    </button>
                  ))}
                </div>
              )}
              {dec.showSnapButtons && (
                <>
                  <button
                    type="button"
                    onClick={() => wmStore.togglePinWindow(win.id)}
                    title={win.pinned ? "Unpin Always-on-Top (PiP)" : "Pin Always-on-Top (PiP)"}
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.pinned ? "text-amber-300 bg-amber-500/18" : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <Pin className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => wmStore.snapWindow(win.id, win.snap === "left" ? "none" : "left")}
                    title="Snap Left"
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.snap === "left" ? "text-violet-300 bg-violet-500/18" : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <PanelLeft className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => wmStore.snapWindow(win.id, win.snap === "right" ? "none" : "right")}
                    title="Snap Right"
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.snap === "right" ? "text-violet-300 bg-violet-500/18" : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <PanelRight className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"} />
                  </button>
                </>
              )}
              {dec.buttonPosition === "right" && <div className="ml-1">{renderWindowControls()}</div>}
            </div>
          </>
        )}
      </div>

      {/* Window Content */}
      <div className="relative flex-1 min-h-0 overflow-hidden window-content-contain">{children}</div>

      {/* Bottom-right resize handle (Mouse + iPad Touch + Apple Pencil!) */}
      {!isMobile && !win.maximized && win.snap === "none" && (
        <div
          onPointerDown={onResizePointerDown}
          title="Drag to resize"
          className={`absolute bottom-0 right-0 z-20 cursor-nwse-resize touch-none flex items-end justify-end p-1 ${
            isTabletTouch ? "w-9 h-9" : "w-5 h-5"
          }`}
        >
          <span
            className={`block rounded-br-md border-r-2 border-b-2 transition-colors ${
              isTabletTouch
                ? "w-3 h-3 border-white/35"
                : "w-2 h-2 border-white/20 hover:border-white/50"
            }`}
          />
        </div>
      )}
    </div>
  );
};
