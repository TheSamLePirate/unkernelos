import { Maximize2, Minimize2, PanelLeft, PanelRight, X } from "lucide-react";
import React, { useRef } from "react";
import { APP_CATALOG, wmStore, type WindowInstance } from "../wm/wm-store.ts";

interface WindowFrameProps {
  win: WindowInstance;
  focused: boolean;
  children: React.ReactNode;
}

const TOP_BAR_H = 34;
const DOCK_H = 74;

export const WindowFrame: React.FC<WindowFrameProps> = ({ win, focused, children }) => {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  if (win.minimized) return null;

  const def = APP_CATALOG[win.appId];

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    wmStore.focusWindow(win.id);
    if (win.maximized || win.snap !== "none") return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = dragRef.current.origX + (ev.clientX - dragRef.current.startX);
      const ny = Math.max(TOP_BAR_H, dragRef.current.origY + (ev.clientY - dragRef.current.startY));
      wmStore.moveResize(win.id, { x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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

  const style: React.CSSProperties = win.maximized
    ? {
        left: 8,
        top: TOP_BAR_H + 6,
        width: "calc(100vw - 16px)",
        height: `calc(100vh - ${TOP_BAR_H + DOCK_H + 12}px)`,
        zIndex: win.zIndex,
      }
    : win.snap === "left"
    ? {
        left: 8,
        top: TOP_BAR_H + 6,
        width: "calc(50vw - 12px)",
        height: `calc(100vh - ${TOP_BAR_H + DOCK_H + 12}px)`,
        zIndex: win.zIndex,
      }
    : win.snap === "right"
    ? {
        left: "calc(50vw + 4px)",
        top: TOP_BAR_H + 6,
        width: "calc(50vw - 12px)",
        height: `calc(100vh - ${TOP_BAR_H + DOCK_H + 12}px)`,
        zIndex: win.zIndex,
      }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      style={style}
      onMouseDown={() => wmStore.focusWindow(win.id)}
      className={`fixed flex flex-col rounded-2xl overflow-hidden animate-window-in transition-shadow ${
        focused ? "glass-surface-focused" : "glass-surface opacity-95"
      }`}
    >
      {/* Titlebar */}
      <div
        onMouseDown={onHeaderMouseDown}
        onDoubleClick={() => wmStore.toggleMaximize(win.id)}
        className="flex items-center justify-between h-9 px-3 bg-white/[0.03] border-b border-white/8 shrink-0 cursor-grab active:cursor-grabbing"
      >
        {/* macOS-inspired traffic lights */}
        <div className="flex items-center gap-2 group">
          <button
            type="button"
            onClick={() => wmStore.closeWindow(win.id)}
            title="Close"
            className="w-3 h-3 rounded-full bg-rose-500/85 hover:bg-rose-400 flex items-center justify-center transition"
          >
            <X className="w-2 h-2 text-rose-950 opacity-0 group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.minimizeWindow(win.id)}
            title="Minimize"
            className="w-3 h-3 rounded-full bg-amber-400/85 hover:bg-amber-300 flex items-center justify-center transition"
          >
            <Minimize2 className="w-2 h-2 text-amber-950 opacity-0 group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.toggleMaximize(win.id)}
            title="Maximize"
            className="w-3 h-3 rounded-full bg-emerald-500/85 hover:bg-emerald-400 flex items-center justify-center transition"
          >
            <Maximize2 className="w-2 h-2 text-emerald-950 opacity-0 group-hover:opacity-100" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200 truncate px-3">
          <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${def.accent}`} />
          <span className="truncate">{win.title}</span>
        </div>

        {/* Snap controls */}
        <div className="flex items-center gap-0.5">
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
      </div>

      {/* Window Content */}
      <div className="relative flex-1 min-h-0 overflow-hidden">{children}</div>

      {/* Bottom-right resize handle */}
      {!win.maximized && win.snap === "none" && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20"
        />
      )}
    </div>
  );
};
