import { useSyncExternalStore } from "react";
import { uiSounds } from "../core/ui-sounds.ts";

export type AppId =
  | "agent-studio"
  | "terminal"
  | "explorer"
  | "preview"
  | "screen"
  | "git"
  | "toolchain"
  | "monitor"
  | "settings";

export type WorkspaceId = 1 | 2 | 3 | 4;

export type SnapZone =
  | "none"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "maximize";

export interface AppDefinition {
  readonly id: AppId;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly accent: string;
  readonly shortcut?: string;
}

export const APP_CATALOG: Record<AppId, AppDefinition> = {
  "agent-studio": {
    id: "agent-studio",
    title: "Agent Studio",
    shortTitle: "Studio",
    description: "Prompt an app → Claude Code / Pi builds, tests, previews & deploys to GitHub Pages",
    defaultWidth: 1120,
    defaultHeight: 700,
    minWidth: 740,
    minHeight: 460,
    accent: "from-violet-500 to-fuchsia-500",
    shortcut: "⌘1",
  },
  terminal: {
    id: "terminal",
    title: "Kitty Terminal (WebGPU)",
    shortTitle: "Terminal",
    description: "GPU-accelerated Kitty-style terminal with tabs, splits & truecolor",
    defaultWidth: 920,
    defaultHeight: 580,
    minWidth: 460,
    minHeight: 300,
    accent: "from-cyan-400 to-blue-500",
    shortcut: "⌘2",
  },
  explorer: {
    id: "explorer",
    title: "File Explorer",
    shortTitle: "Files",
    description: "Browse, edit, upload & download files on the live Linux filesystem",
    defaultWidth: 960,
    defaultHeight: 620,
    minWidth: 560,
    minHeight: 380,
    accent: "from-amber-400 to-orange-500",
    shortcut: "⌘3",
  },
  preview: {
    id: "preview",
    title: "Web Preview",
    shortTitle: "Preview",
    description: "Live browser preview for guest dev servers over vsock + WebSocket HMR",
    defaultWidth: 980,
    defaultHeight: 640,
    minWidth: 440,
    minHeight: 360,
    accent: "from-emerald-400 to-teal-500",
    shortcut: "⌘4",
  },
  screen: {
    id: "screen",
    title: "Graphical Display (FB0 / GL / Wayland)",
    shortTitle: "Screen",
    description: "WebGPU /dev/fb0 framebuffer, VirGL 3D (/dev/dri) & Wayland desktop apps",
    defaultWidth: 980,
    defaultHeight: 680,
    minWidth: 540,
    minHeight: 400,
    accent: "from-pink-500 to-rose-500",
    shortcut: "⌘5",
  },
  git: {
    id: "git",
    title: "Git & GitHub Pages",
    shortTitle: "Git",
    description: "Diff, commit, push & 1-click GitHub Pages hosting via git + gh",
    defaultWidth: 940,
    defaultHeight: 620,
    minWidth: 560,
    minHeight: 400,
    accent: "from-orange-500 to-red-500",
    shortcut: "⌘6",
  },
  toolchain: {
    id: "toolchain",
    title: "Toolchain Installer",
    shortTitle: "Installer",
    description: "Install git, gh, python, pip, node, bun, claude code, pi & Mesa GL",
    defaultWidth: 880,
    defaultHeight: 620,
    minWidth: 540,
    minHeight: 400,
    accent: "from-indigo-400 to-violet-500",
    shortcut: "⌘7",
  },
  monitor: {
    id: "monitor",
    title: "System Monitor",
    shortTitle: "Monitor",
    description: "Live vCPUs, RAM, JIT compiler, IndexedDB disk, Wisp net & kernel dmesg",
    defaultWidth: 860,
    defaultHeight: 580,
    minWidth: 500,
    minHeight: 360,
    accent: "from-sky-400 to-cyan-500",
    shortcut: "⌘8",
  },
  settings: {
    id: "settings",
    title: "unkernelOS Settings",
    shortTitle: "Settings",
    description: "Themes, WebGPU Shaders, Distro, RAM, vCPUs, Wisp URL, GL/FB0 & API Keys",
    defaultWidth: 920,
    defaultHeight: 650,
    minWidth: 580,
    minHeight: 440,
    accent: "from-zinc-400 to-zinc-600",
    shortcut: "⌘,",
  },
};

export interface WindowInstance {
  readonly id: string;
  readonly appId: AppId;
  readonly title: string;
  readonly workspace: WorkspaceId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly minimized: boolean;
  readonly maximized: boolean;
  readonly snap: SnapZone;
  readonly props?: Record<string, unknown>;
}

export interface ToastAction {
  readonly label: string;
  readonly url: string;
  readonly copyText?: string;
}

export interface ToastItem {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly level: "info" | "success" | "warn" | "error";
  readonly createdAt: number;
  readonly action?: ToastAction;
}

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly kind: "desktop" | "dock";
  readonly appId?: AppId;
}

interface WmState {
  readonly windows: readonly WindowInstance[];
  readonly activeWindowId: string | null;
  readonly activeWorkspace: WorkspaceId;
  readonly dragSnapPreview: SnapZone | null;
  readonly commandPaletteOpen: boolean;
  readonly githubModalOpen: boolean;
  readonly missionControlOpen: boolean;
  readonly controlCenterOpen: boolean;
  readonly locked: boolean;
  readonly contextMenu: ContextMenuState | null;
  readonly previewPort: number;
  readonly previewPath: string;
  readonly activeWorkspaceDir: string;
  readonly toasts: readonly ToastItem[];
}

const TOP_BAR_H = 36;
const DOCK_RESERVE = 82;

class WindowManagerStore {
  private state: WmState = {
    windows: [],
    activeWindowId: null,
    activeWorkspace: 1,
    dragSnapPreview: null,
    commandPaletteOpen: false,
    githubModalOpen: false,
    missionControlOpen: false,
    controlCenterOpen: false,
    locked: false,
    contextMenu: null,
    previewPort: 3000,
    previewPath: "/",
    activeWorkspaceDir: "/home/user/workspace",
    toasts: [],
  };

  private zCounter = 10;
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): WmState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setState(updater: (prev: WmState) => WmState): void {
    this.state = updater(this.state);
    this.emit();
  }

  public openApp(appId: AppId, props?: Record<string, unknown>, forceNew = false): string {
    const existing = !forceNew
      ? this.state.windows.find(
          (w) => w.appId === appId && w.workspace === this.state.activeWorkspace
        ) ?? this.state.windows.find((w) => w.appId === appId)
      : undefined;

    if (existing) {
      if (existing.workspace !== this.state.activeWorkspace) {
        this.switchWorkspace(existing.workspace);
      }
      this.focusWindow(existing.id);
      if (props) {
        this.setState((s) => ({
          ...s,
          missionControlOpen: false,
          contextMenu: null,
          windows: s.windows.map((w) =>
            w.id === existing.id ? { ...w, minimized: false, props: { ...w.props, ...props } } : w
          ),
        }));
      }
      return existing.id;
    }

    const def = APP_CATALOG[appId];
    const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
    const vh = typeof window !== "undefined" ? window.innerHeight : 900;
    const w = Math.min(def.defaultWidth, vw - 40);
    const h = Math.min(def.defaultHeight, vh - TOP_BAR_H - DOCK_RESERVE - 24);
    const wsWins = this.state.windows.filter((win) => win.workspace === this.state.activeWorkspace);
    const offset = (wsWins.length % 6) * 26;
    const x = Math.max(20, Math.round((vw - w) / 2) + offset - 40);
    const y = Math.max(TOP_BAR_H + 12, Math.round((vh - DOCK_RESERVE - h) / 2) + offset - 20);
    const id = `${appId}-${Math.random().toString(36).slice(2, 7)}`;
    const zIndex = ++this.zCounter;

    const win: WindowInstance = {
      id,
      appId,
      title: def.title,
      workspace: this.state.activeWorkspace,
      x,
      y,
      width: w,
      height: h,
      zIndex,
      minimized: false,
      maximized: false,
      snap: "none",
      props,
    };

    uiSounds.playWindowOpen();
    this.setState((s) => ({
      ...s,
      missionControlOpen: false,
      controlCenterOpen: false,
      contextMenu: null,
      windows: [...s.windows, win],
      activeWindowId: id,
    }));
    return id;
  }

  public closeWindow(id: string): void {
    uiSounds.playWindowClose();
    this.setState((s) => {
      const remaining = s.windows.filter((w) => w.id !== id);
      const top = remaining
        .filter((w) => w.workspace === s.activeWorkspace && !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        windows: remaining,
        activeWindowId: s.activeWindowId === id ? (top?.id ?? null) : s.activeWindowId,
      };
    });
  }

  public closeAppWindows(appId: AppId): void {
    uiSounds.playWindowClose();
    this.setState((s) => {
      const remaining = s.windows.filter((w) => w.appId !== appId);
      const top = remaining
        .filter((w) => w.workspace === s.activeWorkspace && !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        contextMenu: null,
        windows: remaining,
        activeWindowId: remaining.some((w) => w.id === s.activeWindowId)
          ? s.activeWindowId
          : (top?.id ?? null),
      };
    });
  }

  public focusWindow(id: string): void {
    const zIndex = ++this.zCounter;
    this.setState((s) => {
      const target = s.windows.find((w) => w.id === id);
      const activeWorkspace = target ? target.workspace : s.activeWorkspace;
      return {
        ...s,
        activeWorkspace,
        activeWindowId: id,
        contextMenu: null,
        controlCenterOpen: false,
        windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false, zIndex } : w)),
      };
    });
  }

  public minimizeWindow(id: string): void {
    uiSounds.playClick();
    this.setState((s) => {
      const next = s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w));
      const top = next
        .filter((w) => w.workspace === s.activeWorkspace && !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        windows: next,
        activeWindowId: s.activeWindowId === id ? (top?.id ?? null) : s.activeWindowId,
      };
    });
  }

  public minimizeAllInWorkspace(): void {
    uiSounds.playClick();
    this.setState((s) => ({
      ...s,
      activeWindowId: null,
      contextMenu: null,
      windows: s.windows.map((w) =>
        w.workspace === s.activeWorkspace ? { ...w, minimized: true } : w
      ),
    }));
  }

  public toggleMaximize(id: string): void {
    uiSounds.playSnap();
    const zIndex = ++this.zCounter;
    this.setState((s) => ({
      ...s,
      activeWindowId: id,
      windows: s.windows.map((w) =>
        w.id === id
          ? { ...w, maximized: !w.maximized, snap: "none", zIndex }
          : w
      ),
    }));
  }

  public snapWindow(id: string, snap: SnapZone): void {
    uiSounds.playSnap();
    const zIndex = ++this.zCounter;
    const isMax = snap === "maximize";
    this.setState((s) => ({
      ...s,
      activeWindowId: id,
      dragSnapPreview: null,
      windows: s.windows.map((w) =>
        w.id === id
          ? { ...w, snap: isMax ? "none" : snap, maximized: isMax, zIndex }
          : w
      ),
    }));
  }

  public setDragSnapPreview(zone: SnapZone | null): void {
    if (this.state.dragSnapPreview === zone) return;
    this.setState((s) => ({ ...s, dragSnapPreview: zone }));
  }

  public moveResize(
    id: string,
    rect: Partial<Pick<WindowInstance, "x" | "y" | "width" | "height">>
  ): void {
    this.setState((s) => ({
      ...s,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, ...rect, maximized: false, snap: "none" } : w
      ),
    }));
  }

  public switchWorkspace(ws: WorkspaceId): void {
    if (this.state.activeWorkspace === ws) return;
    uiSounds.playWorkspaceSwitch();
    this.setState((s) => {
      const top = s.windows
        .filter((w) => w.workspace === ws && !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        activeWorkspace: ws,
        activeWindowId: top?.id ?? null,
        contextMenu: null,
      };
    });
  }

  public moveWindowToWorkspace(id: string, ws: WorkspaceId): void {
    uiSounds.playWorkspaceSwitch();
    this.setState((s) => {
      const updated = s.windows.map((w) => (w.id === id ? { ...w, workspace: ws } : w));
      const top = updated
        .filter((w) => w.workspace === s.activeWorkspace && !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        windows: updated,
        activeWindowId:
          s.activeWindowId === id && ws !== s.activeWorkspace
            ? (top?.id ?? null)
            : s.activeWindowId,
      };
    });
  }

  public setCommandPalette(open: boolean): void {
    if (open) uiSounds.playClick();
    this.setState((s) => ({
      ...s,
      commandPaletteOpen: open,
      controlCenterOpen: false,
      contextMenu: null,
    }));
  }

  public toggleCommandPalette(): void {
    this.setCommandPalette(!this.state.commandPaletteOpen);
  }

  public setGithubModal(open: boolean): void {
    if (open) uiSounds.playClick();
    this.setState((s) => ({ ...s, githubModalOpen: open, controlCenterOpen: false, contextMenu: null }));
  }

  public setMissionControl(open: boolean): void {
    if (open) uiSounds.playWorkspaceSwitch();
    this.setState((s) => ({
      ...s,
      missionControlOpen: open,
      controlCenterOpen: false,
      contextMenu: null,
    }));
  }

  public toggleMissionControl(): void {
    this.setMissionControl(!this.state.missionControlOpen);
  }

  public setControlCenter(open: boolean): void {
    if (open) uiSounds.playClick();
    this.setState((s) => ({ ...s, controlCenterOpen: open, contextMenu: null }));
  }

  public toggleControlCenter(): void {
    this.setControlCenter(!this.state.controlCenterOpen);
  }

  public setLocked(locked: boolean): void {
    if (locked) uiSounds.playLock();
    else uiSounds.playUnlock();
    this.setState((s) => ({
      ...s,
      locked,
      controlCenterOpen: false,
      missionControlOpen: false,
      commandPaletteOpen: false,
      contextMenu: null,
    }));
  }

  public setContextMenu(menu: ContextMenuState | null): void {
    this.setState((s) => ({ ...s, contextMenu: menu, controlCenterOpen: false }));
  }

  public openPreview(port: number, path = "/"): void {
    this.setState((s) => ({ ...s, previewPort: port, previewPath: path }));
    this.openApp("preview", { port, path });
  }

  public setWorkspaceDir(dir: string): void {
    this.setState((s) => ({ ...s, activeWorkspaceDir: dir }));
  }

  public pushToast(
    title: string,
    message: string,
    level: ToastItem["level"] = "info",
    action?: ToastAction
  ): void {
    uiSounds.playNotify();
    const id = Math.random().toString(36).slice(2, 9);
    const toast: ToastItem = { id, title, message, level, createdAt: Date.now(), action };
    this.setState((s) => ({ ...s, toasts: [...s.toasts.slice(-4), toast] }));
    setTimeout(() => this.dismissToast(id), action ? 15000 : 5200);
  }

  public dismissToast(id: string): void {
    this.setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
  }
}

export const wmStore = new WindowManagerStore();

export function useWm(): WmState {
  return useSyncExternalStore(wmStore.subscribe, wmStore.getSnapshot);
}
