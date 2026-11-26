import { WindowSessionContext } from "../core/app-surface-registry.tsx";
import { HorizonWindowFrame } from "./horizon/HorizonWindowFrame.tsx";
import { useLiveWindowContent } from "./LiveWindowContent.tsx";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  PanelRight,
  Pin,
  Square,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useMods } from "../core/mod-store.ts";
import { useViewport } from "../core/use-viewport.ts";
import { spatial3dBridge } from "../gpu/spatial-3d-bridge.ts";
import {
  APP_CATALOG,
  useWm,
  wmStore,
  type SnapZone,
  type WindowInstance,
  type WorkspaceId,
} from "../wm/wm-store.ts";
import { ReactiveSurfaceSlot } from "./ReactiveSurfaceHost.tsx";
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

const LegacyWindowFrame: React.FC<WindowFrameProps> = ({
  win,
  focused,
  visible,
  children,
}) => {
  const wm = useWm();
  const mods = useMods();
  const dec = mods.decorator;
  const fx = mods.fx;
  const {
    isMobile, isTouch, keyboardInset, width: viewportWidth, visualHeight,
  } = useViewport();
  const is3dSpace = mods.desktop3d.enabled && !isMobile;
  const wobblyEnabled =
    (mods.shell.compizWobbly || fx.wobblyDrag) && !is3dSpace;
  const visionOrnament =
    mods.shell.visionOrnaments || dec.style === "visionos-glass";
  const [interacting, setInteracting] = useState(false);
  const [closingFx, setClosingFx] = useState(false);
  const [minimizingFx, setMinimizingFx] = useState(false);
  const [wobble, setWobble] = useState({ skewX: 0, skewY: 0, rot: 0 });
  const [hoverTilt, setHoverTilt] = useState({ rx: 0, ry: 0 });
  const [titleMenuPos, setTitleMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [sheenX, setSheenX] = useState<number | null>(null);
  const frameElRef = useRef<HTMLDivElement>(null);
  const gestureCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => gestureCleanup.current?.(), []);
  const ec = mods.eyeCandy;

  const handleCloseWindow = () => {
    if (fx.burnClose && !is3dSpace && !isMobile) {
      setClosingFx(true);
      setTimeout(() => wmStore.closeWindow(win.id), 245);
    } else {
      wmStore.closeWindow(win.id);
    }
  };

  const handleMinimizeWindow = () => {
    if (fx.genieMinimize && !is3dSpace && !isMobile) {
      setMinimizingFx(true);
      setTimeout(() => {
        setMinimizingFx(false);
        wmStore.minimizeWindow(win.id);
      }, 225);
    } else {
      wmStore.minimizeWindow(win.id);
    }
  };

  useEffect(() => {
    spatial3dBridge.registerWindowEl(win.id, frameElRef.current);
    return () => spatial3dBridge.registerWindowEl(win.id, null);
  }, [win.id]);

  useEffect(() => {
    if (!titleMenuPos) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setTitleMenuPos(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [titleMenuPos]);

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
    if (win.maximized) return;
    gestureCleanup.current?.();

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
    let prevX = e.clientX;
    let prevY = e.clientY;
    let shiftHeld = e.shiftKey;
    const origDepth = spatial3dBridge.getWindowDepth(win.id);

    const flush = () => {
      rafId = 0;
      if (!dragRef.current) return;
      if (is3dSpace && shiftHeld) {
        // Shift + Drag in 3D space pushes/pulls the window smoothly along the Z depth axis!
        const dz = (dragRef.current.startY - lastY) * 2.2;
        spatial3dBridge.setWindowDepth(win.id, origDepth + dz);
        return;
      }
      const nx = dragRef.current.origX + (lastX - dragRef.current.startX);
      const ny = Math.max(
        TOP_BAR_H,
        dragRef.current.origY + (lastY - dragRef.current.startY),
      );
      wmStore.moveResize(win.id, { x: nx, y: ny });
      if (wobblyEnabled) {
        const vx = Math.max(-28, Math.min(28, lastX - prevX));
        const vy = Math.max(-28, Math.min(28, lastY - prevY));
        setWobble({
          skewX: Number((-vx * 0.24).toFixed(2)),
          skewY: Number((vy * 0.12).toFixed(2)),
          rot: Number((vx * 0.08).toFixed(2)),
        });
      }
      prevX = lastX;
      prevY = lastY;
      if (!is3dSpace) {
        activePreview = detectSnapZone(lastX, lastY);
        wmStore.setDragSnapPreview(activePreview);
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current || ev.pointerId !== dragRef.current.pointerId)
        return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      shiftHeld = ev.shiftKey;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = (ev: PointerEvent) => {
      if (!dragRef.current || ev.pointerId !== dragRef.current.pointerId)
        return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        flush();
      }
      dragRef.current = null;
      setInteracting(false);
      if (wobblyEnabled) setWobble({ skewX: 0, skewY: 0, rot: 0 });
      gestureCleanup.current?.();
      if (activePreview && ev.type !== "pointercancel") {
        wmStore.snapWindow(win.id, activePreview);
      } else {
        wmStore.setDragSnapPreview(null);
      }
    };

    gestureCleanup.current = () => {
      cancelAnimationFrame(rafId);
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      wmStore.setDragSnapPreview(null);
      if (headerEl.hasPointerCapture(e.pointerId))
        headerEl.releasePointerCapture(e.pointerId);
      gestureCleanup.current = null;
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
      const wsWins = wm.windows.filter(
        (w) => w.workspace === wm.activeWorkspace,
      );
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
    gestureCleanup.current?.();
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
      const nw = Math.min(
        maxW,
        Math.max(
          def.minWidth,
          resizeRef.current.origW + (lastX - resizeRef.current.startX),
        ),
      );
      const nh = Math.min(
        maxH,
        Math.max(
          def.minHeight,
          resizeRef.current.origH + (lastY - resizeRef.current.startY),
        ),
      );
      wmStore.moveResize(win.id, { width: nw, height: nh });
    };

    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current || ev.pointerId !== resizeRef.current.pointerId)
        return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = (ev: PointerEvent) => {
      if (!resizeRef.current || ev.pointerId !== resizeRef.current.pointerId)
        return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        flush();
      }
      resizeRef.current = null;
      setInteracting(false);
      gestureCleanup.current?.();
    };

    gestureCleanup.current = () => {
      cancelAnimationFrame(rafId);
      resizeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (handleEl.hasPointerCapture(e.pointerId))
        handleEl.releasePointerCapture(e.pointerId);
      gestureCleanup.current = null;
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
    bottom:
      keyboardInset > 0
        ? `${keyboardInset}px`
        : "calc(70px + env(safe-area-inset-bottom))",
  };

  const wobbleTransform =
    wobblyEnabled &&
    (wobble.skewX !== 0 || wobble.skewY !== 0 || wobble.rot !== 0)
      ? `skew(${wobble.skewX}deg, ${wobble.skewY}deg) rotate(${wobble.rot}deg)`
      : fx.hoverTilt3d &&
          !is3dSpace &&
          !interacting &&
          (hoverTilt.rx !== 0 || hoverTilt.ry !== 0)
        ? `perspective(1200px) rotateX(${hoverTilt.rx}deg) rotateY(${hoverTilt.ry}deg)`
        : undefined;

  const userWinOpacity = win.opacity ?? 1;
  const dragOpacityFactor = interacting && fx.dragGhostOpacity ? 0.86 : 1;
  const effectiveOpacity =
    (focused ? 1 : dec.unfocusedOpacity) * dragOpacityFactor * userWinOpacity;
  const shadedHeight =
    dec.titlebarHeightPx + (dec.titlebarAccentBar && focused ? 2 : 0) + 2;
  const inactiveFilter =
    !focused && fx.dimInactive && !is3dSpace
      ? "brightness(0.82) saturate(0.75)"
      : undefined;
  const openAnimClass =
    fx.openAnimation === "genie"
      ? "fx-open-genie"
      : fx.openAnimation === "zoom"
        ? "fx-open-zoom"
        : fx.openAnimation === "flip3d"
          ? "fx-open-flip3d"
          : fx.openAnimation === "fade"
            ? "fx-open-fade"
            : "fx-open-spring";

  const style: React.CSSProperties = win.maximized
    ? {
        position: is3dSpace ? "absolute" : "fixed",
        left: 0,
        top: 0,
        width: viewportWidth,
        height: visualHeight,
        borderRadius: 0,
        borderWidth: 0,
        boxShadow: "none",
        transform: "none",
        zIndex: win.pinned ? win.zIndex + 5000 : win.zIndex,
        display: !visible || win.minimized ? "none" : "flex",
      }
    : is3dSpace
    ? {
        position: "absolute",
        left: 0,
        top: 0,
        width: win.width,
        height: win.shaded ? shadedHeight : win.height,
        borderRadius: `${dec.radiusPx}px`,
        borderWidth: `${dec.borderWidthPx}px`,
        opacity:
          (focused ? 1 : Math.max(0.86, dec.unfocusedOpacity)) *
          dragOpacityFactor *
          userWinOpacity,
        backfaceVisibility: mods.desktop3d.doubleSidedWindows
          ? "visible"
          : "hidden",
        WebkitBackfaceVisibility: mods.desktop3d.doubleSidedWindows
          ? "visible"
          : "hidden",
        pointerEvents: "auto",
      }
    : {
        ...(isMobile
          ? mobileSheetStyle
          : (snapStyle ?? {
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.shaded ? shadedHeight : win.height,
            })),
        zIndex: win.pinned ? win.zIndex + 5000 : win.zIndex,
        display: !visible || win.minimized ? "none" : "flex",
        borderRadius: isMobile ? undefined : `${dec.radiusPx}px`,
        borderWidth: isMobile ? undefined : `${dec.borderWidthPx}px`,
        opacity: effectiveOpacity,
        filter: inactiveFilter,
        boxShadow:
          focused && !isMobile && dec.activeGlowPx > 0
            ? `0 32px 86px -12px rgba(0,0,0,0.86), 0 0 ${dec.activeGlowPx}px -10px var(--window-glow), 0 1px 0 0 rgba(255,255,255,0.22) inset`
            : undefined,
        transform: wobbleTransform,
        transition: interacting
          ? wobblyEnabled
            ? "transform 95ms ease-out, opacity 120ms ease"
            : "opacity 120ms ease"
          : wobblyEnabled
            ? "transform 460ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease, filter 220ms ease, box-shadow 220ms ease"
            : "transform 220ms ease-out, opacity 200ms ease, filter 220ms ease, box-shadow 220ms ease",
        willChange: interacting
          ? "left, top, width, height, transform"
          : undefined,
      };

  const openWsCount = wm.windows.filter(
    (w) => w.workspace === wm.activeWorkspace,
  ).length;

  const isCyber = dec.style === "cyber-hud";
  const isWin95 = dec.style === "windows-95";
  const isWinXp = dec.style === "windows-xp";
  const isWin11 = dec.style === "windows-11";
  const isGnome = dec.style === "gnome-adwaita";
  const isKde = dec.style === "kde-breeze";
  const isXfce = dec.style === "xfce-lxde";
  const isCompiz = dec.style === "compiz-emerald";
  const isVision = dec.style === "visionos-glass";
  const isAqua = dec.style === "macos-classic";
  const isSwiss = dec.style === "minimal-swiss";
  const isZen = dec.style === "floating-zen";
  const isI3 = dec.style === "tiling-i3";

  const renderWindowControls = () => {
    if (isWin95) {
      return (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleMinimizeWindow}
            title="Réduire"
            className="w-5 h-5 flex items-center justify-center bg-[#c0c0c0] border-2 border-white border-r-[#404040] border-b-[#404040] text-[11px] font-bold text-black active:border-[#404040] active:border-r-white active:border-b-white cursor-pointer"
          >
            _
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Agrandir"
            className="w-5 h-5 flex items-center justify-center bg-[#c0c0c0] border-2 border-white border-r-[#404040] border-b-[#404040] text-black cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Fermer"
            className="w-5 h-5 flex items-center justify-center bg-[#c0c0c0] border-2 border-white border-r-[#404040] border-b-[#404040] text-black hover:bg-[#d8d8d8] cursor-pointer"
          >
            <X className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      );
    }

    if (isWinXp) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMinimizeWindow}
            title="Réduire"
            className="w-5 h-5 rounded-[4px] flex items-center justify-center bg-gradient-to-b from-[#4993ff] to-[#1a5cd8] border border-white/75 text-white hover:brightness-110 shadow cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Agrandir"
            className="w-5 h-5 rounded-[4px] flex items-center justify-center bg-gradient-to-b from-[#4993ff] to-[#1a5cd8] border border-white/75 text-white hover:brightness-110 shadow cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Fermer"
            className="w-5 h-5 rounded-[4px] flex items-center justify-center bg-gradient-to-b from-[#f06e58] to-[#c92a14] border border-white/80 text-white hover:brightness-110 shadow cursor-pointer"
          >
            <X className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      );
    }

    if (isGnome) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Agrandir"
            className="w-6 h-6 rounded-full bg-white/8 hover:bg-white/16 flex items-center justify-center text-zinc-200 transition cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Fermer"
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-rose-500/80 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (isKde || isCompiz) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMinimizeWindow}
            title="Réduire"
            className="w-6 h-6 rounded-full hover:bg-white/14 flex items-center justify-center text-zinc-200 transition cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Agrandir"
            className="w-6 h-6 rounded-full hover:bg-white/14 flex items-center justify-center text-zinc-200 transition cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Fermer"
            className={`w-6 h-6 rounded-full flex items-center justify-center text-white transition cursor-pointer ${
              isCompiz
                ? "bg-emerald-500/25 hover:bg-rose-500 border border-emerald-300/40"
                : "hover:bg-rose-500"
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (isCyber || isSwiss || isI3 || isWin11 || isXfce) {
      return (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleMinimizeWindow}
            title="Minimize"
            className={`px-2.5 py-1.5 text-zinc-300 hover:text-white transition cursor-pointer ${
              isCyber
                ? "border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-200"
                : isSwiss
                  ? "hover:bg-white/10 font-mono text-[10px]"
                  : "rounded-md hover:bg-white/10"
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className={`px-2.5 py-1.5 text-zinc-300 hover:text-white transition cursor-pointer ${
              isCyber
                ? "border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-200"
                : isSwiss
                  ? "hover:bg-white/10 font-mono text-[10px]"
                  : "rounded-md hover:bg-white/10"
            }`}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Close"
            className={`px-2.5 py-1.5 transition cursor-pointer ${
              isCyber
                ? "border border-rose-500/55 bg-rose-500/20 hover:bg-rose-500/40 text-rose-200"
                : isSwiss
                  ? "bg-[#ff4d00]/90 hover:bg-[#ff4d00] text-black font-bold"
                  : "rounded-md hover:bg-[#c42b1c] text-zinc-200 hover:text-white"
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (isZen || isVision) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Close"
            className="w-3 h-3 rounded-full bg-white/30 hover:bg-rose-400 transition cursor-pointer"
          />
          <button
            type="button"
            onClick={handleMinimizeWindow}
            title="Minimize"
            className="w-3 h-3 rounded-full bg-white/20 hover:bg-amber-300 transition cursor-pointer"
          />
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className="w-3 h-3 rounded-full bg-white/20 hover:bg-emerald-300 transition cursor-pointer"
          />
        </div>
      );
    }

    // Default macOS / Mac OS X Aqua traffic lights
    return (
      <div
        className={`flex items-center group ${isTabletTouch ? "gap-1.5" : "gap-2"}`}
      >
        <button
          type="button"
          onClick={handleCloseWindow}
          title="Close"
          className={`flex items-center justify-center rounded-full transition cursor-pointer ${
            isTabletTouch ? "w-7 h-7 active:scale-90" : "w-3 h-3"
          }`}
        >
          <span
            className={`${
              isTabletTouch
                ? "w-4 h-4"
                : isAqua
                  ? "w-3.5 h-3.5 ring-1 ring-white/40"
                  : "w-3 h-3"
            } rounded-full bg-gradient-to-b from-rose-400 to-rose-600 flex items-center justify-center shadow-inner`}
          >
            <X
              className={`${
                isTabletTouch
                  ? "w-2.5 h-2.5 opacity-80"
                  : "w-2 h-2 opacity-0 group-hover:opacity-100"
              } text-rose-950`}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={handleMinimizeWindow}
          title="Minimize"
          className={`flex items-center justify-center rounded-full transition cursor-pointer ${
            isTabletTouch ? "w-7 h-7 active:scale-90" : "w-3 h-3"
          }`}
        >
          <span
            className={`${
              isTabletTouch
                ? "w-4 h-4"
                : isAqua
                  ? "w-3.5 h-3.5 ring-1 ring-white/40"
                  : "w-3 h-3"
            } rounded-full bg-gradient-to-b from-amber-300 to-amber-500 flex items-center justify-center shadow-inner`}
          >
            <Minimize2
              className={`${
                isTabletTouch
                  ? "w-2.5 h-2.5 opacity-80"
                  : "w-2 h-2 opacity-0 group-hover:opacity-100"
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
              isTabletTouch
                ? "w-4 h-4"
                : isAqua
                  ? "w-3.5 h-3.5 ring-1 ring-white/40"
                  : "w-3 h-3"
            } rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 flex items-center justify-center shadow-inner`}
          >
            <Maximize2
              className={`${
                isTabletTouch
                  ? "w-2.5 h-2.5 opacity-80"
                  : "w-2 h-2 opacity-0 group-hover:opacity-100"
              } text-emerald-950`}
            />
          </span>
        </button>
      </div>
    );
  };

  const titlebarBg = isWin95
    ? focused
      ? "bg-gradient-to-r from-[#000080] to-[#1084d0] border-b border-[#404040]"
      : "bg-[#808080] border-b border-[#404040]"
    : isWinXp
      ? focused
        ? "bg-gradient-to-b from-[#0a5be0] via-[#2678f5] to-[#0845b8] border-b border-[#003699]"
        : "bg-gradient-to-b from-[#7a96df] to-[#6982c8] border-b border-[#536bb0]"
      : isGnome
        ? "bg-[#242426] border-b border-white/10"
        : isKde
          ? "bg-[#232833]/92 border-b border-sky-400/20"
          : isXfce
            ? "bg-[#252a34] border-b border-slate-600/40"
            : isCompiz
              ? "bg-gradient-to-b from-emerald-400/24 via-cyan-500/12 to-black/35 border-b border-emerald-400/35"
              : isVision
                ? "bg-white/[0.04] border-b border-white/10"
                : isCyber
                  ? "bg-gradient-to-r from-rose-500/18 via-[#0a0816]/90 to-cyan-500/18 border-b border-cyan-400/25"
                  : isSwiss
                    ? "bg-[#111113]/95 border-b border-white/15"
                    : isI3
                      ? "bg-black/75 border-b border-white/12"
                      : "bg-gradient-to-b from-white/[0.075] to-white/[0.015] border-b border-white/10";

  return (
    <div
      ref={frameElRef}
      style={style}
      data-window-surface="true"
      data-maximized={win.maximized}
      onPointerDown={() => {
        if (win.workspace !== wm.activeWorkspace) {
          wmStore.switchWorkspace(win.workspace);
        }
        wmStore.focusWindow(win.id);
      }}
      onPointerMove={(e) => {
        if (
          !fx.hoverTilt3d ||
          is3dSpace ||
          interacting ||
          isMobile ||
          win.maximized
        )
          return;
        const rect = frameElRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        setHoverTilt({
          rx: Number((-ny * 3.4).toFixed(2)),
          ry: Number((nx * 3.8).toFixed(2)),
        });
      }}
      onPointerLeave={() => {
        if (hoverTilt.rx !== 0 || hoverTilt.ry !== 0)
          setHoverTilt({ rx: 0, ry: 0 });
      }}
      data-window-decorator={dec.style}
      className={`${is3dSpace ? "absolute" : `fixed ${openAnimClass}`} pointer-events-auto flex-col ${
        visionOrnament ? "overflow-visible" : "overflow-hidden"
      } ${isMobile ? "rounded-t-[20px] border-x-0" : ""} ${
        focused
          ? `glass-surface-focused ${fx.chromaBorder ? "fx-chroma-active" : ""}`
          : "glass-surface"
      } ${closingFx ? "fx-closing-burn" : ""} ${minimizingFx ? "fx-minimizing-genie" : ""}`}
    >
      {/* Optional Laser Accent Bar (Cyber HUD / Swiss / Spatial Mod) */}
      {dec.titlebarAccentBar && focused && !isMobile && (
        <div
          style={{
            background:
              "linear-gradient(90deg, var(--accent-primary), var(--accent-cyan), var(--accent-primary))",
          }}
          className="h-[2px] w-full shrink-0"
        />
      )}

      {/* Titlebar (supports Right-Click Power Menu, Live Cursor Specular Sheen & Shade!) */}
      <div
        data-unkernel-titlebar="true"
        onPointerDown={onHeaderPointerDown}
        onPointerUp={onHeaderPointerUpMobile}
        onPointerMove={(e) => {
          if (!ec.specularSheen || isMobile) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setSheenX(
            Math.round(
              ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100,
            ),
          );
        }}
        onPointerLeave={() => setSheenX(null)}
        onContextMenu={(e) => {
          if (isMobile) return;
          e.preventDefault();
          e.stopPropagation();
          wmStore.focusWindow(win.id);
          setTitleMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={() => {
          if (isMobile) return;
          if (is3dSpace) {
            spatial3dBridge.dispatchCamera({
              kind: "focus-window",
              windowId: win.id,
            });
          } else {
            wmStore.toggleMaximize(win.id);
          }
        }}
        style={{
          height: isMobile
            ? "44px"
            : isTabletTouch
              ? "44px"
              : `${dec.titlebarHeightPx}px`,
        }}
        className={`relative flex items-center justify-between px-3 shrink-0 select-none touch-none ${titlebarBg} ${
          isMobile ? "" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {/* Dynamic Cursor-Tracking Liquid Glass Specular Glint */}
        {ec.specularSheen && sheenX !== null && !isMobile && (
          <div
            style={{
              background: `radial-gradient(140px circle at ${sheenX}% 50%, rgba(255,255,255,0.18), transparent 70%)`,
            }}
            className="pointer-events-none absolute inset-0"
          />
        )}
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
                onClick={handleMinimizeWindow}
                className="p-2 rounded-xl bg-white/6 active:bg-white/16 active:scale-95 text-zinc-400 transition"
                title="Show Desktop"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100 truncate px-2">
              <span
                className={`w-2 h-2 rounded-full bg-gradient-to-r ${def.accent} shrink-0 shadow`}
              />
              <span className="truncate">{win.title}</span>
            </div>
            <button
              type="button"
              onClick={handleCloseWindow}
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
                dec.titleAlign === "left"
                  ? "flex-1 justify-start"
                  : "justify-center"
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
                  <span
                    className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${def.accent} shrink-0`}
                  />
                  <span className="truncate">{win.title}</span>
                </>
              )}
            </div>

            {/* Workspace, Snap, 3D Camera Focus & Right-Side Controls */}
            <div className="flex items-center gap-1">
              {focused && <ReactiveSurfaceSlot slot="titlebar" />}
              {is3dSpace && (
                <button
                  type="button"
                  onClick={() =>
                    spatial3dBridge.dispatchCamera({
                      kind: "focus-window",
                      windowId: win.id,
                    })
                  }
                  title="Centrer la caméra 3D face à cette fenêtre (1:1)"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/40 text-cyan-200 text-[10px] font-mono transition cursor-pointer"
                >
                  <Crosshair className="w-3 h-3" />
                  3D
                </button>
              )}
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
                    onClick={() => wmStore.toggleShadeWindow(win.id)}
                    title={
                      win.shaded
                        ? "Dérouler la fenêtre"
                        : "Enrouler en barre de titre (Shade)"
                    }
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition cursor-pointer ${
                      win.shaded
                        ? "text-cyan-300 bg-cyan-500/18"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {win.shaded ? (
                      <ChevronDown
                        className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"}
                      />
                    ) : (
                      <ChevronUp
                        className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => wmStore.togglePinWindow(win.id)}
                    title={
                      win.pinned
                        ? "Unpin Always-on-Top (PiP)"
                        : "Pin Always-on-Top (PiP)"
                    }
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.pinned
                        ? "text-amber-300 bg-amber-500/18"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <Pin
                      className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      wmStore.snapWindow(
                        win.id,
                        win.snap === "left" ? "none" : "left",
                      )
                    }
                    title="Snap Left"
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.snap === "left"
                        ? "text-violet-300 bg-violet-500/18"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <PanelLeft
                      className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      wmStore.snapWindow(
                        win.id,
                        win.snap === "right" ? "none" : "right",
                      )
                    }
                    title="Snap Right"
                    className={`${isTabletTouch ? "p-2" : "p-1"} rounded-lg hover:bg-white/10 active:scale-90 transition ${
                      win.snap === "right"
                        ? "text-violet-300 bg-violet-500/18"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    <PanelRight
                      className={isTabletTouch ? "w-4 h-4" : "w-3.5 h-3.5"}
                    />
                  </button>
                </>
              )}
              {dec.buttonPosition === "right" && (
                <div className="ml-1">{renderWindowControls()}</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Rich Titlebar Right-Click Power Menu (Fixed viewport coords so it NEVER clips even when window is Shaded!) */}
      {titleMenuPos && !isMobile && (
        <>
          <div
            className="fixed inset-0 z-[114]"
            onClick={() => setTitleMenuPos(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTitleMenuPos(null);
            }}
          />
          <div
            style={{
              left: `${Math.min(Math.max(8, titleMenuPos.x), Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 1440) - 236))}px`,
              top: `${Math.min(Math.max(40, titleMenuPos.y), Math.max(40, (typeof window !== "undefined" ? window.innerHeight : 900) - 340))}px`,
            }}
            className="fixed z-[116] w-56 p-2 rounded-2xl glass-surface-focused border border-white/20 shadow-2xl text-[11px] text-zinc-100 space-y-1.5 animate-window-in"
          >
            <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
              Options de Fenêtre
            </div>
            <button
              type="button"
              onClick={() => {
                wmStore.toggleShadeWindow(win.id);
                setTitleMenuPos(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-white/12 transition cursor-pointer"
            >
              {win.shaded
                ? "▼ Dérouler la fenêtre"
                : "▲ Enrouler en barre (Shade)"}
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.togglePinWindow(win.id);
                setTitleMenuPos(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-white/12 transition cursor-pointer"
            >
              {win.pinned ? "📌 Détacher (PiP)" : "📌 Toujours au-dessus (PiP)"}
            </button>

            {/* Live Per-Window Opacity Slider */}
            <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-300">Opacité fenêtre</span>
                <span className="font-mono text-cyan-300">
                  {Math.round(userWinOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={35}
                max={100}
                step={5}
                value={Math.round(userWinOpacity * 100)}
                onChange={(e) =>
                  wmStore.setWindowOpacity(win.id, Number(e.target.value) / 100)
                }
                className="w-full accent-cyan-400 h-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-1 pt-0.5">
              {(
                [
                  ["left", "◧ Gauche"],
                  ["right", "◨ Droite"],
                  ["top-left", "◰ Haut-G"],
                  ["top-right", "◳ Haut-D"],
                  ["bottom-left", "◱ Bas-G"],
                  ["bottom-right", "◲ Bas-D"],
                ] as readonly [SnapZone, string][]
              ).map(([zone, lbl]) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => {
                    wmStore.snapWindow(win.id, zone);
                    setTitleMenuPos(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/14 text-[10px] text-left cursor-pointer"
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between px-2 py-1 border-t border-white/10">
              <span className="text-[10px] text-zinc-400">Bureau</span>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => {
                      wmStore.moveWindowToWorkspace(win.id, ws);
                      setTitleMenuPos(null);
                    }}
                    className={`w-5 h-5 rounded-md font-mono text-[10px] cursor-pointer ${
                      win.workspace === ws
                        ? "bg-cyan-400 text-black font-bold"
                        : "bg-white/8 hover:bg-white/18"
                    }`}
                  >
                    {ws}
                  </button>
                ))}
              </div>
            </div>

            {is3dSpace && (
              <button
                type="button"
                onClick={() => {
                  spatial3dBridge.dispatchCamera({
                    kind: "focus-window",
                    windowId: win.id,
                  });
                  setTitleMenuPos(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl bg-cyan-500/18 hover:bg-cyan-500/30 text-cyan-200 cursor-pointer"
              >
                🎯 Focus Caméra 3D (1:1)
              </button>
            )}
          </div>
        </>
      )}

      {/* Window Content (Hidden when Shaded / Rolled-Up!) */}
      {!win.shaded && (
        <div
          style={{
            borderBottomLeftRadius: `${dec.radiusPx}px`,
            borderBottomRightRadius: `${dec.radiusPx}px`,
          }}
          className="relative flex-1 min-h-0 overflow-hidden window-content-contain"
        >
          {children}
        </div>
      )}

      {/* Live Geometry Telemetry Badge while dragging/resizing! */}
      {interacting && ec.geometryHud && !isMobile && (
        <div className="pointer-events-none absolute top-11 right-3 z-40 px-2 py-0.5 rounded-lg bg-black/82 backdrop-blur-xl border border-cyan-400/45 text-[10px] font-mono text-cyan-200 shadow-lg">
          {Math.round(win.width)} × {Math.round(win.height)} · (
          {Math.round(win.x)}, {Math.round(win.y)})
        </div>
      )}

      {/* Apple VisionOS Bottom Glass Grab Bar & Circular Close Pill Ornament */}
      {visionOrnament && !isMobile && !win.maximized && (
        <div
          onPointerDown={onHeaderPointerDown}
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-30 cursor-grab active:cursor-grabbing touch-none"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCloseWindow();
            }}
            title="Fermer la fenêtre spatiale"
            className="w-5 h-5 rounded-full bg-white/25 hover:bg-white/45 backdrop-blur-xl border border-white/40 flex items-center justify-center text-white shadow cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="w-28 h-2 rounded-full bg-white/35 hover:bg-white/65 backdrop-blur-xl border border-white/45 shadow transition" />
        </div>
      )}

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

export const WindowFrame: React.FC<WindowFrameProps> = (props) => {
  const { horizonEnabled } = useWm();
  const live = useLiveWindowContent(props.win.id, props.children);
  return (
    <WindowSessionContext.Provider value={props.win}>
      {live.parking}
      {horizonEnabled
        ? <HorizonWindowFrame {...props}>{live.slot}</HorizonWindowFrame>
        : <LegacyWindowFrame {...props}>{live.slot}</LegacyWindowFrame>}
      {live.content}
    </WindowSessionContext.Provider>
  );
};
