import {
  Music2,
  Activity,
  AppWindow,
  ArrowUpRight,
  Bot,
  Cloud,
  CloudRain,
  Code2,
  FileText,
  FolderOpen,
  Globe,
  PanelRight,
  Pause,
  Play,
  Snowflake,
  Sun,
  Terminal,
} from "lucide-react";
import type React from "react";
import {
  surfaceRegistry,
  useSurfaces,
} from "../../core/app-surface-registry.tsx";
import { wmStore, type WindowInstance } from "../../wm/wm-store.ts";
const glyphs = {
  play: Play,
  pause: Pause,
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: Snowflake,
  activity: Activity,
};
const icons: Record<string, typeof AppWindow> = {
  music: Music2,
  notes: FileText,
  terminal: Terminal,
  explorer: FolderOpen,
  ide: Code2,
  preview: Globe,
  "agent-studio": Bot,
};
export function HorizonDockFace({
  win,
  scale,
  onGrab,
  suppressClick,
  onMenu,
}: {
  win: WindowInstance;
  scale: number;
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
  suppressClick: React.RefObject<boolean>;
  onMenu: (x: number, y: number) => void;
}) {
  useSurfaces();
  const adapter = surfaceRegistry.peek(win.id),
    dock = adapter?.dock;
  const Icon =
    (dock?.glyph ? glyphs[dock.glyph] : undefined) ??
    icons[win.appId] ??
    AppWindow;
  const action = dock?.primaryAction
    ? adapter?.actions?.[dock.primaryAction]
    : undefined;
  const activate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClick.current && event.detail > 0) return;
    if (!action) {
      wmStore.focusWindow(win.id);
      return;
    }
    Promise.resolve()
      .then(() => action.run({}))
      .catch((error) =>
        wmStore.pushToast("Action du dock impossible", String(error), "error"),
      );
  };
  return (
    <div
      className="horizon-dock-face"
      data-dock-window={win.id}
      style={{ transform: `scale(${1 / scale})` }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <button
        className="horizon-dock-primary"
        onPointerDown={onGrab}
        onClick={activate}
        aria-label={dock?.label ?? "Rappeler " + win.title}
        title={dock?.detail ?? win.title}
      >
        <Icon size={26} strokeWidth={1.5} />
        {dock?.value && <span>{dock.value}</span>}
        <i data-status={adapter?.status ?? "opaque"} />
      </button>
      <div className="horizon-dock-face-tools">
        <button
          aria-label={"Rappeler " + win.title + " au centre"}
          title="Ramener au centre"
          onClick={() => wmStore.focusWindow(win.id)}
        >
          <ArrowUpRight size={13} />
        </button>
        <button
          data-drawer-toggle
          aria-label={"Tiroir de " + win.title}
          aria-expanded={!!win.horizonDrawerOpen}
          aria-controls={"horizon-drawer-" + win.id}
          title="Tiroir de cette session"
          onClick={() => wmStore.toggleHorizonDrawer(win.id)}
        >
          <PanelRight size={13} />
        </button>
      </div>
      {dock?.progress !== undefined && (
        <progress
          aria-label="Progression"
          max={1}
          value={Math.max(0, Math.min(1, dock.progress))}
        />
      )}
      <span className="horizon-dock-face-title">
        {adapter?.title ?? win.title}
      </span>
    </div>
  );
}
