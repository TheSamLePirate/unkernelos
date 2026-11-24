import { Layers, Maximize2, Minimize2, Minus, PanelLeft, PanelRight, X } from "lucide-react";
import React, { useRef } from "react";
import { useViewport } from "../core/use-viewport.ts";
import { APP_CATALOG, wmStore, type SnapZone, type WindowInstance, type WorkspaceId } from "../wm/wm-store.ts";
import { getSnapZoneStyle } from "./SnapPreviewOverlay.tsx";

interface WindowFrameProps {
  win: WindowInstance;
  focused: boolean;
  visible: boolean;
  children: React.ReactNode;
}

const TOP_BAR_H = 36;
const DOCK_H = 78;

function detectSnapZone(clientX: number, clientY: number): SnapZone | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const edge = 20;
  const cornerH = vh * 0.28;

  if (clientY <= TOP_BAR_H + 14) {
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
  const { isMobile } = useViewport();
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const def = APP_CATALOG[win.appId];

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMobile || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    wmStore.focusWindow(win.id);

    // If maximized or snapped, unsnap smoothly centered under cursor
    let origX = win.x;
    let origY = win.y;
    if (win.maximized || win.snap !== "none") {
      origX = Math.max(12, Math.round(e.clientX - win.width / 2));
      origY = Math.max(TOP_BAR_H + 4, e.clientY - 18);
      wmStore.moveResize(win.id, { x: origX, y: origY });
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };

    let activePreview: SnapZone | null = null;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = dragRef.current.origX + (ev.clientX - dragRef.current.startX);
      const ny = Math.max(TOP_BAR_H, dragRef.current.origY + (ev.clientY - dragRef.current.startY));
      wmStore.moveResize(win.id, { x: nx, y: ny });

      activePreview = detectSnapZone(ev.clientX, ev.clientY);
      wmStore.setDragSnapPreview(activePreview);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (activePreview) {
        wmStore.snapWindow(win.id, activePreview);
      } else {
        wmStore.setDragSnapPreview(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Tablet touch-drag support on titlebar
  const onHeaderTouchStart = (e: React.TouchEvent) => {
    if (isMobile || (e.target as HTMLElement).closest("button")) return;
    const t = e.touches[0];
    if (!t) return;
    wmStore.focusWindow(win.id);
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      origX: win.x,
      origY: win.y,
    };
    const onTouchMove = (ev: TouchEvent) => {
      const pt = ev.touches[0];
      if (!pt || !dragRef.current) return;
      const nx = dragRef.current.origX + (pt.clientX - dragRef.current.startX);
      const ny = Math.max(TOP_BAR_H, dragRef.current.origY + (pt.clientY - dragRef.current.startY));
      wmStore.moveResize(win.id, { x: nx, y: ny });
    };
    const onTouchEnd = () => {
      dragRef.current = null;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    wmStore.focusWindow(win.id);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: win.width,
      origH: win.height,
    };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const nw = Math.max(def.minWidth, resizeRef.current.origW + (ev.clientX - resizeRef.current.startX));
      const nh = Math.max(def.minHeight, resizeRef.current.origH + (ev.clientY - resizeRef.current.startY));
      wmStore.moveResize(win.id, { width: nw, height: nh });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
    bottom: "calc(68px + env(safe-area-inset-bottom))",
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
    zIndex: win.zIndex,
    display: !visible || win.minimized ? "none" : "flex",
  };

  return (
    <div
      style={style}
      onMouseDown={() => wmStore.focusWindow(win.id)}
      className={`fixed flex-col overflow-hidden animate-window-in transition-shadow ${
        isMobile ? "rounded-t-2xl border-x-0" : "rounded-2xl"
      } ${focused ? "glass-surface-focused" : "glass-surface opacity-95"}`}
    >
      {/* Titlebar */}
      <div
        onMouseDown={onHeaderMouseDown}
        onTouchStart={onHeaderTouchStart}
        onDoubleClick={() => !isMobile && wmStore.toggleMaximize(win.id)}
        className={`flex items-center justify-between px-3 bg-gradient-to-b from-white/[0.06] to-white/[0.015] border-b border-white/8 shrink-0 select-none ${
          isMobile ? "h-10" : "h-9 cursor-grab active:cursor-grabbing"
        }`}
      >
        {isMobile ? (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => wmStore.toggleMissionControl()}
                className="p-1.5 rounded-lg bg-white/8 active:bg-white/16 text-zinc-200"
                title="Switch App"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => wmStore.minimizeWindow(win.id)}
                className="p-1.5 rounded-lg bg-white/6 active:bg-white/14 text-zinc-400"
                title="Show Desktop"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100 truncate px-2">
              <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${def.accent} shrink-0`} />
              <span className="truncate">{win.title}</span>
            </div>
            <button
              type="button"
              onClick={() => wmStore.closeWindow(win.id)}
              className="p-1.5 rounded-lg bg-rose-500/20 active:bg-rose-500/35 text-rose-200"
              title="Close App"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            {/* macOS-inspired traffic lights */}
            <div className="flex items-center gap-2 group">
              <button
                type="button"
                onClick={() => wmStore.closeWindow(win.id)}
                title="Close"
                className="w-3 h-3 rounded-full bg-rose-500/90 hover:bg-rose-400 flex items-center justify-center transition shadow-inner"
              >
                <X className="w-2 h-2 text-rose-950 opacity-0 group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => wmStore.minimizeWindow(win.id)}
                title="Minimize"
                className="w-3 h-3 rounded-full bg-amber-400/90 hover:bg-amber-300 flex items-center justify-center transition shadow-inner"
              >
                <Minimize2 className="w-2 h-2 text-amber-950 opacity-0 group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => wmStore.toggleMaximize(win.id)}
                title="Maximize"
                className="w-3 h-3 rounded-full bg-emerald-500/90 hover:bg-emerald-400 flex items-center justify-center transition shadow-inner"
              >
                <Maximize2 className="w-2 h-2 text-emerald-950 opacity-0 group-hover:opacity-100" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-200 truncate px-3">
              <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${def.accent}`} />
              <span className="truncate">{win.title}</span>
            </div>

            {/* Workspace & Snap controls */}
            <div className="flex items-center gap-1">
              <div className="hidden sm:flex items-center gap-0.5 mr-1 px-1 py-0.5 rounded-md bg-white/[0.03] border border-white/6">
                {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    title={`Move to Desktop ${ws}`}
                    onClick={() => wmStore.moveWindowToWorkspace(win.id, ws)}
                    className={`w-4 h-4 rounded text-[9px] font-mono transition ${
                      win.workspace === ws
                        ? "bg-white/16 text-white font-semibold"
                        : "text-zinc-500 hover:text-zinc-200 hover:bg-white/8"
                    }`}
                  >
                    {ws}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => wmStore.snapWindow(win.id, win.snap === "left" ? "none" : "left")}
                title="Snap Left"
                className={`p-1 rounded hover:bg-white/10 transition ${
                  win.snap === "left" ? "text-violet-300" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => wmStore.snapWindow(win.id, win.snap === "right" ? "none" : "right")}
                title="Snap Right"
                className={`p-1 rounded hover:bg-white/10 transition ${
                  win.snap === "right" ? "text-violet-300" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Window Content */}
      <div className="relative flex-1 min-h-0 overflow-hidden">{children}</div>

      {/* Bottom-right resize handle */}
      {!isMobile && !win.maximized && win.snap === "none" && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20"
        />
      )}
    </div>
  );
};
