import { useSyncExternalStore } from "react";

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
    description: "Distro, RAM, vCPUs, Wisp URL, GL/FB0, WebGPU, Disk & API Credentials",
    defaultWidth: 900,
    defaultHeight: 640,
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
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly minimized: boolean;
  readonly maximized: boolean;
  readonly snap: "none" | "left" | "right";
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

interface WmState {
  readonly windows: readonly WindowInstance[];
  readonly activeWindowId: string | null;
  readonly commandPaletteOpen: boolean;
  readonly githubModalOpen: boolean;
  readonly previewPort: number;
  readonly previewPath: string;
  readonly activeWorkspaceDir: string;
  readonly toasts: readonly ToastItem[];
}

const TOP_BAR_H = 34;
const DOCK_RESERVE = 78;

class WindowManagerStore {
  private state: WmState = {
    windows: [],
    activeWindowId: null,
    commandPaletteOpen: false,
    githubModalOpen: false,
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
    const existing = !forceNew ? this.state.windows.find((w) => w.appId === appId) : undefined;
    if (existing) {
      this.focusWindow(existing.id);
      if (props) {
        this.setState((s) => ({
          ...s,
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
    const offset = (this.state.windows.length % 6) * 26;
    const x = Math.max(20, Math.round((vw - w) / 2) + offset - 40);
    const y = Math.max(TOP_BAR_H + 12, Math.round((vh - DOCK_RESERVE - h) / 2) + offset - 20);
    const id = `${appId}-${Math.random().toString(36).slice(2, 7)}`;
    const zIndex = ++this.zCounter;

    const win: WindowInstance = {
      id,
      appId,
      title: def.title,
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

    this.setState((s) => ({
      ...s,
      windows: [...s.windows, win],
      activeWindowId: id,
    }));
    return id;
  }

  public closeWindow(id: string): void {
    this.setState((s) => {
      const remaining = s.windows.filter((w) => w.id !== id);
      const top = remaining
        .filter((w) => !w.minimized)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        windows: remaining,
        activeWindowId: s.activeWindowId === id ? (top?.id ?? null) : s.activeWindowId,
      };
    });
  }

  public focusWindow(id: string): void {
    const zIndex = ++this.zCounter;
    this.setState((s) => ({
      ...s,
      activeWindowId: id,
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false, zIndex } : w)),
    }));
  }

  public minimizeWindow(id: string): void {
    this.setState((s) => {
      const next = s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w));
      const top = next.filter((w) => !w.minimized).sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...s,
        windows: next,
        activeWindowId: s.activeWindowId === id ? (top?.id ?? null) : s.activeWindowId,
      };
    });
  }

  public toggleMaximize(id: string): void {
    const zIndex = ++this.zCounter;
    this.setState((s) => ({
      ...s,
      activeWindowId: id,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, maximized: !w.maximized, snap: "none", zIndex } : w
      ),
    }));
  }

  public snapWindow(id: string, snap: "left" | "right" | "none"): void {
    const zIndex = ++this.zCounter;
    this.setState((s) => ({
      ...s,
      activeWindowId: id,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, snap, maximized: false, zIndex } : w
      ),
    }));
  }

  public moveResize(id: string, rect: Partial<Pick<WindowInstance, "x" | "y" | "width" | "height">>): void {
    this.setState((s) => ({
      ...s,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, ...rect, maximized: false, snap: "none" } : w
      ),
    }));
  }

  public setCommandPalette(open: boolean): void {
    this.setState((s) => ({ ...s, commandPaletteOpen: open }));
  }

  public setGithubModal(open: boolean): void {
    this.setState((s) => ({ ...s, githubModalOpen: open }));
  }

  public toggleCommandPalette(): void {
    this.setState((s) => ({ ...s, commandPaletteOpen: !s.commandPaletteOpen }));
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
