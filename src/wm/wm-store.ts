import { useSyncExternalStore } from "react";
import type { DynamicAppDef } from "../core/dynamic-apps-store.ts";
import { uiSounds } from "../core/ui-sounds.ts";
import { waylandDesktopManager } from "../core/wayland-host.ts";

export type AppId =
  | "agent-studio"
  | "agent-swarm"
  | "agent-api"
  | "ide"
  | "notebook"
  | "microml"
  | "proof-studio"
  | "terminal"
  | "explorer"
  | "api-client"
  | "network-inspector"
  | "database"
  | "services"
  | "app-store"
  | "automations"
  | "custom-app"
  | "notes"
  | "whiteboard"
  | "media-studio"
  | "dev-utils"
  | "processes"
  | "shader-synth"
  | "preview"
  | "screen"
  | "gl-window"
  | "wayland-surface"
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
  "agent-swarm": {
    id: "agent-swarm",
    title: "Multi-Agent Swarm Ops",
    shortTitle: "Swarm",
    description: "Run parallel Claude Code & Pi agents in a live PTY grid with Kanban & inter-agent bus",
    defaultWidth: 1140,
    defaultHeight: 700,
    minWidth: 700,
    minHeight: 460,
    accent: "from-fuchsia-500 via-purple-600 to-cyan-500",
  },
  "agent-api": {
    id: "agent-api",
    title: "Agent OS API & Bridge",
    shortTitle: "OS API",
    description: "Full Agent-Native OS control bridge (osctl, MCP server, 43+ host APIs & live audit log)",
    defaultWidth: 1020,
    defaultHeight: 650,
    minWidth: 620,
    minHeight: 420,
    accent: "from-emerald-400 via-cyan-500 to-violet-500",
  },
  ide: {
    id: "ide",
    title: "Code IDE",
    shortTitle: "Code",
    description: "Multi-tab code editor (TS, Python, Rust, OCaml) with ripgrep search & integrated terminal",
    defaultWidth: 1100,
    defaultHeight: 680,
    minWidth: 680,
    minHeight: 440,
    accent: "from-sky-500 to-indigo-600",
    shortcut: "⌘9",
  },
  notebook: {
    id: "notebook",
    title: "Polyglot Science Notebook",
    shortTitle: "Notebook",
    description: "Jupyter-style Python (Matplotlib/NumPy), Rust, OCaml, Bun, SQL, Bash & osctl cells + .ipynb",
    defaultWidth: 1080,
    defaultHeight: 690,
    minWidth: 640,
    minHeight: 440,
    accent: "from-orange-500 via-amber-500 to-cyan-500",
  },
  microml: {
    id: "microml",
    title: "microML Compiler Explorer",
    shortTitle: "microML",
    description: "coucou747's mini-OCaml compiler: every pass, types vs real OCaml, generated C & native run",
    defaultWidth: 1180,
    defaultHeight: 720,
    minWidth: 680,
    minHeight: 460,
    accent: "from-amber-400 via-orange-500 to-violet-600",
  },
  "proof-studio": {
    id: "proof-studio",
    title: "Studio de preuves",
    shortTitle: "Preuves",
    description: "Preuves en déduction naturelle avec Poule : vérification en direct, but, arbre de preuve, guide pas à pas",
    defaultWidth: 1280,
    defaultHeight: 780,
    minWidth: 720,
    minHeight: 480,
    accent: "from-violet-500 via-fuchsia-500 to-emerald-500",
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
  "api-client": {
    id: "api-client",
    title: "HTTP / API Client",
    shortTitle: "API",
    description: "Bruno/Insomnia-style REST client for guest VM servers (vsock) & external APIs",
    defaultWidth: 1020,
    defaultHeight: 650,
    minWidth: 620,
    minHeight: 420,
    accent: "from-teal-400 to-cyan-600",
  },
  "network-inspector": {
    id: "network-inspector",
    title: "Live Network & HTTP Inspector",
    shortTitle: "Network",
    description: "Capture guest vsock HTTP traffic, waterfall latency, JSON/headers, cURL export & replay",
    defaultWidth: 1060,
    defaultHeight: 660,
    minWidth: 640,
    minHeight: 420,
    accent: "from-cyan-400 via-sky-500 to-indigo-600",
  },
  database: {
    id: "database",
    title: "SQL & Database Studio",
    shortTitle: "SQL",
    description: "Interactive SQLite3 studio on Linux disk — schema browser, SQL editor & CSV export",
    defaultWidth: 1000,
    defaultHeight: 640,
    minWidth: 620,
    minHeight: 420,
    accent: "from-cyan-500 to-blue-600",
  },
  services: {
    id: "services",
    title: "Service & Daemon Runner",
    shortTitle: "Services",
    description: "Launch, monitor & tail logs for Bun/Python/Rust/OCaml/Vite servers inside Linux",
    defaultWidth: 940,
    defaultHeight: 600,
    minWidth: 580,
    minHeight: 380,
    accent: "from-emerald-500 to-green-600",
  },
  "app-store": {
    id: "app-store",
    title: "App Store & Project Starters",
    shortTitle: "Store",
    description: "1-click WebOS apps, Rust/OCaml/Python/Bun project starters & Linux science toolchains",
    defaultWidth: 1060,
    defaultHeight: 680,
    minWidth: 640,
    minHeight: 440,
    accent: "from-fuchsia-500 via-violet-500 to-sky-500",
  },
  automations: {
    id: "automations",
    title: "Automations & App SDK",
    shortTitle: "Automate",
    description: "OS workflows, shortcuts & Self-Extending Agent-Built WebOS Apps (osctl app.install)",
    defaultWidth: 980,
    defaultHeight: 640,
    minWidth: 580,
    minHeight: 400,
    accent: "from-amber-400 via-orange-500 to-violet-600",
  },
  "custom-app": {
    id: "custom-app",
    title: "Agent WebOS App",
    shortTitle: "App",
    description: "Dynamically installed Agent-Built WebOS application",
    defaultWidth: 720,
    defaultHeight: 540,
    minWidth: 360,
    minHeight: 280,
    accent: "from-violet-500 to-cyan-500",
  },
  notes: {
    id: "notes",
    title: "Notes & Markdown Studio",
    shortTitle: "Notes",
    description: "Split Markdown studio with live preview & checklists persisted in ~/notes",
    defaultWidth: 960,
    defaultHeight: 620,
    minWidth: 580,
    minHeight: 400,
    accent: "from-amber-500 to-rose-500",
  },
  whiteboard: {
    id: "whiteboard",
    title: "Architecture Whiteboard",
    shortTitle: "Sketch",
    description: "Dark glass infinite-feel canvas for diagrams, UI sketches & PNG export",
    defaultWidth: 980,
    defaultHeight: 640,
    minWidth: 580,
    minHeight: 400,
    accent: "from-pink-500 to-violet-600",
  },
  "media-studio": {
    id: "media-studio",
    title: "Media, PDF & Capture Studio",
    shortTitle: "Media",
    description: "Play Video/Audio/PDF/Images from Linux, record screen/webcam to workspace & Focus Timer",
    defaultWidth: 960,
    defaultHeight: 640,
    minWidth: 560,
    minHeight: 400,
    accent: "from-rose-500 via-pink-500 to-fuchsia-600",
  },
  "dev-utils": {
    id: "dev-utils",
    title: "Dev Utilities Suite",
    shortTitle: "Utils",
    description: "JSON, JWT, Base64/URL, Regex, UUID/SHA-256, Color Glass, Diff & Cron",
    defaultWidth: 920,
    defaultHeight: 600,
    minWidth: 560,
    minHeight: 400,
    accent: "from-lime-400 to-emerald-600",
  },
  processes: {
    id: "processes",
    title: "Process & Network Manager",
    shortTitle: "Procs",
    description: "Live Linux processes (SIGTERM/SIGKILL), open vsock ports, df & env inspector",
    defaultWidth: 920,
    defaultHeight: 590,
    minWidth: 560,
    minHeight: 380,
    accent: "from-rose-500 to-orange-600",
  },
  "shader-synth": {
    id: "shader-synth",
    title: "WebGPU Shader & Synth Studio",
    shortTitle: "Shader",
    description: "Live 60fps WGSL shader playground + polyphonic WebAudio synth & oscilloscope",
    defaultWidth: 1000,
    defaultHeight: 640,
    minWidth: 620,
    minHeight: 420,
    accent: "from-fuchsia-500 to-purple-600",
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
    description: "WebGPU /dev/fb0 framebuffer, VirGL 3D (/dev/dri) & Wayland desktop launcher",
    defaultWidth: 980,
    defaultHeight: 680,
    minWidth: 540,
    minHeight: 400,
    accent: "from-pink-500 to-rose-500",
    shortcut: "⌘5",
  },
  "gl-window": {
    id: "gl-window",
    title: "Guest 3D GL / KMS Viewport",
    shortTitle: "3D GL",
    description: "Floating desktop-integrated VirGL 3D & KMS hardware-accelerated window",
    defaultWidth: 860,
    defaultHeight: 580,
    minWidth: 420,
    minHeight: 300,
    accent: "from-emerald-400 to-cyan-500",
  },
  "wayland-surface": {
    id: "wayland-surface",
    title: "Linux Wayland App",
    shortTitle: "Wayland",
    description: "Native Linux Wayland window composited directly onto the unkernelOS desktop",
    defaultWidth: 820,
    defaultHeight: 540,
    minWidth: 320,
    minHeight: 220,
    accent: "from-fuchsia-500 to-cyan-500",
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
  readonly pinned?: boolean;
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

export interface TerminalLaunchRequest {
  readonly id: number;
  readonly cwd: string;
  readonly command?: string;
  readonly title?: string;
}

export interface MicromlDraft {
  readonly id: number;
  readonly source: string;
}

export interface ApiClientDraft {
  readonly id: number;
  readonly method: string;
  readonly url: string;
  readonly target: "vm" | "browser";
  readonly headers: readonly [string, string][];
  readonly body: string;
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
  readonly launcherOpen: boolean;
  readonly notificationCenterOpen: boolean;
  readonly clipboardOpen: boolean;
  readonly locked: boolean;
  readonly contextMenu: ContextMenuState | null;
  readonly previewPort: number;
  readonly previewPath: string;
  readonly activeWorkspaceDir: string;
  readonly recentWorkspaces: readonly string[];
  readonly ideOpenFilePath: string | null;
  readonly mediaOpenFilePath: string | null;
  readonly notebookOpenFilePath: string | null;
  readonly apiClientDraft: ApiClientDraft | null;
  readonly micromlDraft: MicromlDraft | null;
  readonly pouleDraft: MicromlDraft | null;
  readonly explorerTargetDir: string | null;
  readonly terminalLaunchRequest: TerminalLaunchRequest | null;
  readonly toasts: readonly ToastItem[];
  readonly notificationHistory: readonly ToastItem[];
  readonly unreadNotifications: number;
}

const TOP_BAR_H = 36;
const DOCK_RESERVE = 82;
const WORKSPACE_STORAGE_KEY = "unkernelos:workspace:v1";

function normalizeWorkspacePath(dir: string): string {
  const trimmed = dir.trim().replace(/\/+/g, "/");
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const DEFAULT_WORKSPACE_DIR = "/home/user/workspace";

function loadStoredWorkspace(): { active: string; recent: string[]; hadStored: boolean } {
  const fallback = { active: DEFAULT_WORKSPACE_DIR, recent: [DEFAULT_WORKSPACE_DIR], hadStored: false };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { active?: string; recent?: string[] };
    const active = parsed.active ? normalizeWorkspacePath(parsed.active) : fallback.active;
    const recent = Array.isArray(parsed.recent) && parsed.recent.length > 0
      ? Array.from(new Set([active, ...parsed.recent.map(normalizeWorkspacePath), DEFAULT_WORKSPACE_DIR])).slice(0, 8)
      : Array.from(new Set([active, DEFAULT_WORKSPACE_DIR]));
    return { active, recent, hadStored: Boolean(parsed.active) };
  } catch {
    return fallback;
  }
}

function saveStoredWorkspace(active: string, recent: readonly string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ active, recent }));
  } catch {
    // ignore
  }
}

const initialWorkspace = loadStoredWorkspace();

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
    launcherOpen: false,
    notificationCenterOpen: false,
    clipboardOpen: false,
    locked: false,
    contextMenu: null,
    previewPort: 3000,
    previewPath: "/",
    activeWorkspaceDir: initialWorkspace.active,
    recentWorkspaces: initialWorkspace.recent,
    ideOpenFilePath: null,
    mediaOpenFilePath: null,
    notebookOpenFilePath: null,
    apiClientDraft: null,
    micromlDraft: null,
    pouleDraft: null,
    explorerTargetDir: null,
    terminalLaunchRequest: null,
    toasts: [],
    notificationHistory: [],
    unreadNotifications: 0,
  };

  private terminalReqCounter = 1;

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

  public openWaylandWindow(surfaceKey: string, title: string, wlAppId: string): string {
    const existing = this.state.windows.find(
      (w) => w.appId === "wayland-surface" && w.props?.surfaceKey === surfaceKey
    );
    if (existing) {
      this.focusWindow(existing.id);
      return existing.id;
    }

    const def = APP_CATALOG["wayland-surface"];
    const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
    const vh = typeof window !== "undefined" ? window.innerHeight : 900;
    const w = Math.min(def.defaultWidth, vw - 40);
    const h = Math.min(def.defaultHeight, vh - TOP_BAR_H - DOCK_RESERVE - 24);
    const wsWins = this.state.windows.filter((win) => win.workspace === this.state.activeWorkspace);
    const offset = (wsWins.length % 6) * 28;
    const x = Math.max(20, Math.round((vw - w) / 2) + offset - 30);
    const y = Math.max(TOP_BAR_H + 12, Math.round((vh - DOCK_RESERVE - h) / 2) + offset - 15);
    const id = `wl-${surfaceKey}`;
    const zIndex = ++this.zCounter;

    const win: WindowInstance = {
      id,
      appId: "wayland-surface",
      title: title || wlAppId || "Linux Wayland App",
      workspace: this.state.activeWorkspace,
      x,
      y,
      width: w,
      height: h,
      zIndex,
      minimized: false,
      maximized: false,
      snap: "none",
      props: { surfaceKey, wlAppId },
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

  public updateWaylandWindowTitle(surfaceKey: string, title: string): void {
    this.setState((s) => ({
      ...s,
      windows: s.windows.map((w) =>
        w.appId === "wayland-surface" && w.props?.surfaceKey === surfaceKey && title && w.title !== title
          ? { ...w, title }
          : w
      ),
    }));
  }

  public closeWaylandWindowByKey(surfaceKey: string): void {
    const win = this.state.windows.find(
      (w) => w.appId === "wayland-surface" && w.props?.surfaceKey === surfaceKey
    );
    if (!win) return;
    this.closeWindow(win.id, false);
  }

  public openDynamicApp(app: DynamicAppDef): string {
    const existing = this.state.windows.find(
      (w) => w.appId === "custom-app" && w.props?.dynamicAppId === app.id
    );
    if (existing) {
      this.focusWindow(existing.id);
      return existing.id;
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
    const vh = typeof window !== "undefined" ? window.innerHeight : 900;
    const w = Math.min(760, vw - 40);
    const h = Math.min(560, vh - TOP_BAR_H - DOCK_RESERVE - 24);
    const wsWins = this.state.windows.filter((win) => win.workspace === this.state.activeWorkspace);
    const offset = (wsWins.length % 6) * 24;
    const x = Math.max(20, Math.round((vw - w) / 2) + offset - 30);
    const y = Math.max(TOP_BAR_H + 12, Math.round((vh - DOCK_RESERVE - h) / 2) + offset - 15);
    const id = `dyn-${app.id}`;
    const zIndex = ++this.zCounter;
    const win: WindowInstance = {
      id,
      appId: "custom-app",
      title: `${app.emoji} ${app.title}`,
      workspace: this.state.activeWorkspace,
      x,
      y,
      width: w,
      height: h,
      zIndex,
      minimized: false,
      maximized: false,
      snap: "none",
      props: { dynamicAppId: app.id },
    };
    uiSounds.playWindowOpen();
    this.setState((s) => ({
      ...s,
      launcherOpen: false,
      missionControlOpen: false,
      controlCenterOpen: false,
      contextMenu: null,
      windows: [...s.windows, win],
      activeWindowId: id,
    }));
    return id;
  }

  public closeWindow(id: string, notifyWayland = true): void {
    const target = this.state.windows.find((w) => w.id === id);
    if (notifyWayland && target?.appId === "wayland-surface" && typeof target.props?.surfaceKey === "string") {
      waylandDesktopManager.closeWindow(target.props.surfaceKey);
    }
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

  public togglePinWindow(id: string, pinned?: boolean): void {
    uiSounds.playClick();
    const zIndex = ++this.zCounter;
    this.setState((s) => ({
      ...s,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, pinned: pinned ?? !w.pinned, zIndex } : w
      ),
    }));
  }

  public setClipboardOpen(open: boolean): void {
    if (open) uiSounds.playClick();
    this.setState((s) => ({
      ...s,
      clipboardOpen: open,
      commandPaletteOpen: false,
      controlCenterOpen: false,
      contextMenu: null,
    }));
  }

  public toggleClipboard(): void {
    this.setClipboardOpen(!this.state.clipboardOpen);
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
    this.setState((s) => ({
      ...s,
      controlCenterOpen: open,
      notificationCenterOpen: false,
      contextMenu: null,
    }));
  }

  public toggleControlCenter(): void {
    this.setControlCenter(!this.state.controlCenterOpen);
  }

  public setLauncher(open: boolean): void {
    if (open) uiSounds.playWorkspaceSwitch();
    this.setState((s) => ({
      ...s,
      launcherOpen: open,
      missionControlOpen: false,
      controlCenterOpen: false,
      notificationCenterOpen: false,
      contextMenu: null,
    }));
  }

  public toggleLauncher(): void {
    this.setLauncher(!this.state.launcherOpen);
  }

  public setNotificationCenter(open: boolean): void {
    if (open) uiSounds.playClick();
    this.setState((s) => ({
      ...s,
      notificationCenterOpen: open,
      controlCenterOpen: false,
      contextMenu: null,
      unreadNotifications: open ? 0 : s.unreadNotifications,
    }));
  }

  public toggleNotificationCenter(): void {
    this.setNotificationCenter(!this.state.notificationCenterOpen);
  }

  public clearNotifications(): void {
    this.setState((s) => ({ ...s, notificationHistory: [], unreadNotifications: 0 }));
  }

  public openFileInIde(filePath: string): void {
    const parent = filePath.split("/").slice(0, -1).join("/") || "/home/user";
    const normParent = normalizeWorkspacePath(parent);
    const nextRecent = Array.from(new Set([normParent, ...this.state.recentWorkspaces])).slice(0, 8);
    saveStoredWorkspace(normParent, nextRecent);
    this.setState((s) => ({
      ...s,
      activeWorkspaceDir: normParent,
      recentWorkspaces: nextRecent,
      ideOpenFilePath: filePath,
    }));
    this.openApp("ide", { filePath });
  }

  public clearIdeOpenFile(): void {
    this.setState((s) => ({ ...s, ideOpenFilePath: null }));
  }

  public openFileInMedia(filePath: string): void {
    this.setState((s) => ({ ...s, mediaOpenFilePath: filePath }));
    this.openApp("media-studio", { filePath });
  }

  public clearMediaOpenFile(): void {
    this.setState((s) => ({ ...s, mediaOpenFilePath: null }));
  }

  public openFileInNotebook(filePath: string): void {
    this.setState((s) => ({ ...s, notebookOpenFilePath: filePath }));
    this.openApp("notebook", { filePath });
  }

  public clearNotebookOpenFile(): void {
    this.setState((s) => ({ ...s, notebookOpenFilePath: null }));
  }

  public openRequestInApiClient(draft: Omit<ApiClientDraft, "id">): void {
    this.setState((s) => ({
      ...s,
      apiClientDraft: { ...draft, id: ++this.terminalReqCounter },
    }));
    this.openApp("api-client");
  }

  public clearApiClientDraft(id: number): void {
    if (this.state.apiClientDraft?.id !== id) return;
    this.setState((s) => ({ ...s, apiClientDraft: null }));
  }

  public openInMicroml(source: string): void {
    this.setState((s) => ({ ...s, micromlDraft: { id: ++this.terminalReqCounter, source } }));
    this.openApp("microml");
  }

  public openInProofStudio(source: string): void {
    this.setState((s) => ({ ...s, pouleDraft: { id: ++this.terminalReqCounter, source } }));
    this.openApp("proof-studio");
  }

  public clearPouleDraft(id: number): void {
    if (this.state.pouleDraft?.id !== id) return;
    this.setState((s) => ({ ...s, pouleDraft: null }));
  }

  public clearMicromlDraft(id: number): void {
    if (this.state.micromlDraft?.id !== id) return;
    this.setState((s) => ({ ...s, micromlDraft: null }));
  }

  public openDirInIde(dir: string): void {
    this.setWorkspaceDir(dir);
    this.openApp("ide");
  }

  public openDirInStudio(dir: string): void {
    this.setWorkspaceDir(dir);
    this.openApp("agent-studio");
  }

  public openDirInGit(dir: string): void {
    this.setWorkspaceDir(dir);
    this.openApp("git");
  }

  public openDirInExplorer(dir: string): void {
    const clean = normalizeWorkspacePath(dir);
    this.setState((s) => ({ ...s, explorerTargetDir: clean }));
    this.openApp("explorer");
  }

  public clearExplorerTargetDir(): void {
    this.setState((s) => ({ ...s, explorerTargetDir: null }));
  }

  public openTerminalInDir(dir: string, command?: string, title?: string): void {
    const clean = normalizeWorkspacePath(dir);
    const req: TerminalLaunchRequest = {
      id: ++this.terminalReqCounter,
      cwd: clean,
      command,
      title,
    };
    this.setState((s) => ({ ...s, terminalLaunchRequest: req }));
    this.openApp("terminal");
  }

  public clearTerminalLaunchRequest(id: number): void {
    if (this.state.terminalLaunchRequest?.id !== id) return;
    this.setState((s) => ({ ...s, terminalLaunchRequest: null }));
  }

  public setLocked(locked: boolean): void {
    if (locked) uiSounds.playLock();
    else uiSounds.playUnlock();
    this.setState((s) => ({
      ...s,
      locked,
      controlCenterOpen: false,
      notificationCenterOpen: false,
      launcherOpen: false,
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
    const clean = normalizeWorkspacePath(dir);
    if (!clean) return;
    const nextRecent = Array.from(new Set([clean, ...this.state.recentWorkspaces])).slice(0, 8);
    saveStoredWorkspace(clean, nextRecent);
    this.setState((s) => ({
      ...s,
      activeWorkspaceDir: clean,
      recentWorkspaces: nextRecent,
    }));
  }

  /**
   * Reconciles the initial workspace on session boot:
   * - If no saved/created projects exist, start cleanly in /home/user/workspace.
   * - If the saved workspace no longer exists on disk, fall back to the first created project or /home/user/workspace.
   */
  public reconcileStartupWorkspace(existingProjects: readonly string[], activeExists: boolean): void {
    const cur = this.state.activeWorkspaceDir;
    const normalizedProjects = existingProjects.map(normalizeWorkspacePath);
    const projectSet = new Set(normalizedProjects);

    let nextActive = cur;
    if (cur !== DEFAULT_WORKSPACE_DIR && !activeExists) {
      nextActive = normalizedProjects[0] ?? DEFAULT_WORKSPACE_DIR;
    } else if (cur === DEFAULT_WORKSPACE_DIR && !initialWorkspace.hadStored && normalizedProjects.length > 0) {
      nextActive = normalizedProjects[0]!;
    }

    const prunedRecent = this.state.recentWorkspaces.filter(
      (p) => p === DEFAULT_WORKSPACE_DIR || !p.startsWith(`${DEFAULT_WORKSPACE_DIR}/`) || projectSet.has(p) || (p === cur && activeExists)
    );
    const nextRecent = Array.from(new Set([nextActive, ...normalizedProjects, ...prunedRecent, DEFAULT_WORKSPACE_DIR])).slice(0, 8);

    if (nextActive !== cur || nextRecent.join("|") !== this.state.recentWorkspaces.join("|")) {
      if (nextActive !== DEFAULT_WORKSPACE_DIR || initialWorkspace.hadStored) {
        saveStoredWorkspace(nextActive, nextRecent);
      }
      this.setState((s) => ({
        ...s,
        activeWorkspaceDir: nextActive,
        recentWorkspaces: nextRecent,
      }));
    }
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
    this.setState((s) => ({
      ...s,
      toasts: [...s.toasts.slice(-4), toast],
      notificationHistory: [toast, ...s.notificationHistory].slice(0, 40),
      unreadNotifications: s.notificationCenterOpen ? 0 : s.unreadNotifications + 1,
    }));
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
