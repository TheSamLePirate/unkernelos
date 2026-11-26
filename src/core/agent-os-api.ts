import { SKILL_MODDING_MD, SKILL_REACTIVE_MD, SKILL_OS_CONTROL_MD } from "./builtin-agent-skills.ts";
import { listAgentSkills, readAgentSkill } from "./agent-skills-service.ts";
import { surfaceRegistry } from './app-surface-registry.tsx';
import { contextStore } from './context-store.ts';
import { Effect } from "effect";
import { useSyncExternalStore } from "react";
import type { HostCommandContext, KernelHandle } from "unkernel";
import { clipboardStore } from "./clipboard-store.ts";
import { dynamicAppsStore } from "./dynamic-apps-store.ts";
import { hostMountManager } from "./host-mount.ts";
import {
  modStore,
  type CustomDesktopWidget,
  type CustomShaderMod,
  type CustomThemeTokens,
  type DecoratorModConfig,
  type Desktop3dModConfig,
  type EyeCandyConfig,
  type ModKind,
  type OsMod,
  type ShellModConfig,
  type WindowFxConfig,
} from "./mod-store.ts";
import { OS_THEMES, WALLPAPER_SHADERS } from "./os-themes.ts";
import { pwaStore } from "./pwa-service.ts";
import {
  reactiveEngine,
  type BindingTarget,
  type DataSourceKind,
  type ReactiveBinding,
  type ReactiveDataSource,
  type ReactiveScriptMod,
  type ReactiveSurface,
  type SignalPrimitive,
  type SurfaceContentType,
  type SurfaceSlot,
} from "./reactive-mod-engine.ts";
import { swarmStore } from "./swarm-store.ts";
import { t3CodeStore } from "./t3code-store.ts";
import { workflowsStore } from "./workflows-store.ts";
import {
  appRuntime,
  GithubAuthService,
  GitService,
  GuestFsService,
  SettingsService,
  VmService,
} from "./runtime.ts";
import type {
  FbScalingMode,
  KittyThemeId,
  OsThemeId,
  UnkernelConfig,
  WallpaperShaderId,
} from "./schema.ts";
import { uiSounds } from "./ui-sounds.ts";
import { waylandDesktopManager } from "./wayland-host.ts";
import { KITTY_THEMES } from "../gpu/webgpu-terminal.ts";
import { spatial3dBridge } from "../gpu/spatial-3d-bridge.ts";
import {
  APP_CATALOG,
  wmStore,
  type AppId,
  type GridLayoutMode,
  type SnapZone,
  type WorkspaceId,
} from "../wm/wm-store.ts";

export type OsApiCategory =
  | "system"
  | "wm"
  | "workspace"
  | "preview"
  | "theme"
  | "config"
  | "wayland"
  | "github"
  | "browser"
  | "services";

export interface OsApiMethodDef {
  readonly method: string;
  readonly category: OsApiCategory;
  readonly summary: string;
  readonly paramsSchema: Record<string, unknown>;
  readonly example: Record<string, unknown>;
}

export interface AgentApiCallRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly source: "guest-cli" | "mcp" | "ui" | "window-api";
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
  readonly durationMs: number;
  readonly callerPid?: number;
  readonly callerCwd?: string;
}

export const AGENT_OS_SCHEMA: readonly OsApiMethodDef[] = [
  {
    method: "skills.list",
    category: "system",
    summary:
      "Discover built-in unkernelOS skills and SKILL.md files installed in the Linux VM. Returns descriptions and locations without loading instructions into the agent context. Never scans Mac skills.",
    paramsSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        scope: { type: "string", enum: ["all", "builtin", "guest"] },
        roots: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
    },
    example: { query: "desktop" },
  },
  {
    method: "skills.read",
    category: "system",
    summary:
      "Read a discovered skill by its id or unique name. Includes the complete SKILL.md and instructions for using it through the external CLI/MCP transport. Does not execute the skill.",
    paramsSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    example: { id: "builtin:unkernelos-os-control" },
  },
  {
    method: "guest.exec",
    category: "system",
    summary:
      "Run a command inside the browser Linux VM (not on the Mac). Use file+args or script. Bounded output, timeout 1–60 seconds; long jobs should be launched in the background and inspected later.",
    paramsSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        script: { type: "string" },
        cwd: { type: "string" },
        input: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 60000 },
      },
    },
    example: { script: "pwd; uname -a", timeoutMs: 15000 },
  },
  {
    method: "guest.fs.list",
    category: "system",
    summary: "List a directory in the Linux VM (up to 1000 entries).",
    paramsSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    example: { path: "/home/user" },
  },
  {
    method: "guest.fs.read",
    category: "system",
    summary:
      "Read up to 256 KiB of a Linux VM file at a byte offset. UTF-8 text or base64 for binary files.",
    paramsSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer", minimum: 0 },
        length: { type: "integer", minimum: 1, maximum: 262144 },
        encoding: { type: "string", enum: ["utf8", "base64"] },
      },
      required: ["path"],
    },
    example: { path: "/etc/os-release" },
  },
  {
    method: "guest.fs.write",
    category: "system",
    summary:
      "Write a Linux VM file, up to 256 KiB, as UTF-8 or base64. Overwrites the file; parents must exist.",
    paramsSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        encoding: { type: "string", enum: ["utf8", "base64"] },
      },
      required: ["path", "content"],
    },
    example: { path: "/tmp/hello.txt", content: "Hello from the Mac agent" },
  },
  ...(["mkdir", "remove", "rename", "copy"] as const).map((op) => ({
    method: `guest.fs.${op}`,
    category: "system" as const,
    summary: `${op} a Linux VM filesystem entry. remove is recursive.`,
    paramsSchema: {
      type: "object",
      properties: { path: { type: "string" }, to: { type: "string" } },
      required: op === "rename" || op === "copy" ? ["path", "to"] : ["path"],
    },
    example: { path: "/tmp/project" },
  })),
  {method:"horizon.status",category:"wm",summary:"Read Horizon desktop mode, layout and placements. Does not expose drawer content.",paramsSchema:{type:"object",properties:{}},example:{}},
  {method:"horizon.sessions",category:"wm",summary:"Discover session capabilities and current revisions. Context and published actions are shared by default; private sessions require an explicit grant.",paramsSchema:{type:"object",properties:{}},example:{}},
  {method:"horizon.session.read",category:"wm",summary:"Read the shared session state and context. An optional grantId restricts access to a user-selected scope.",paramsSchema:{type:"object",properties:{windowId:{type:"string"},grantId:{type:"string"}},required:["windowId"]},example:{windowId:"notes-abc",grantId:"user-issued-grant"}},
  {method:"horizon.session.action",category:"wm",summary:"Invoke any published action in a shared session, or a restricted action via optional grantId, at the expected revision. Replayed requestIds are deduplicated.",paramsSchema:{type:"object",properties:{windowId:{type:"string"},grantId:{type:"string"},action:{type:"string"},expectedRevision:{type:"string"},requestId:{type:"string"},args:{type:"object"}},required:["windowId","action","expectedRevision","requestId"]},example:{windowId:"notes-abc",grantId:"user-issued-grant",action:"save",expectedRevision:"3",requestId:"unique-action-id",args:{}}},

  // ─── SYSTEM ──────────────────────────────────────────────────────────
  {
    method: "system.info",
    category: "system",
    summary: "Return live OS telemetry: distro, vCPUs, RAM, transport, COI/SAB, WebGPU, GL, active workspace, detected ports & viewport.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "system.notify",
    category: "system",
    summary: "Show a native OS glass toast notification + add to Notification Center (with optional clickable action URL).",
    paramsSchema: {
      type: "object",
      required: ["title", "message"],
      properties: {
        title: { type: "string" },
        message: { type: "string" },
        level: { type: "string", enum: ["info", "success", "warn", "error"] },
        actionLabel: { type: "string" },
        actionUrl: { type: "string" },
      },
    },
    example: { title: "Build Complete", message: "Production bundle passed all checks.", level: "success" },
  },
  {
    method: "system.openUrl",
    category: "system",
    summary: "Open an external URL in the user's host browser (with clickable notification fallback if popups are blocked).",
    paramsSchema: {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    },
    example: { url: "https://github.com" },
  },
  {
    method: "system.clipboard.read",
    category: "system",
    summary: "Read text from the user's host OS clipboard.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "system.clipboard.write",
    category: "system",
    summary: "Write text directly to the user's host OS clipboard and record in Clipboard History.",
    paramsSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
    },
    example: { text: "Hello from unkernelOS Agent!" },
  },
  {
    method: "system.clipboard.history",
    category: "system",
    summary: "Read the persistent Universal Clipboard History shared across host, Linux & agents.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "system.speak",
    category: "system",
    summary: "Speak text aloud via the host browser Web Speech Synthesis API.",
    paramsSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        lang: { type: "string" },
        rate: { type: "number" },
      },
    },
    example: { text: "Deployment finished and verified.", rate: 1.0 },
  },
  {
    method: "system.sound",
    category: "system",
    summary: "Play a subtle WebAudio UI cue on the host OS.",
    paramsSchema: {
      type: "object",
      properties: {
        cue: { type: "string", enum: ["click", "open", "close", "snap", "notify", "workspace", "lock", "unlock"] },
      },
    },
    example: { cue: "notify" },
  },
  {
    method: "system.screenshot",
    category: "system",
    summary: "Capture the live WebGPU / framebuffer canvas or desktop dimensions and optionally save a PNG inside Linux.",
    paramsSchema: {
      type: "object",
      properties: {
        savePath: { type: "string", description: "Optional guest path to save PNG (e.g. /tmp/screen.png)" },
      },
    },
    example: { savePath: "/tmp/unkernel-screen.png" },
  },
  {
    method: "system.syncDisk",
    category: "system",
    summary: "Flush all pending persistent ext4 /data blocks to IndexedDB immediately.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "system.lock",
    category: "system",
    summary: "Lock or unlock the unkernelOS desktop screen.",
    paramsSchema: {
      type: "object",
      properties: { locked: { type: "boolean" } },
    },
    example: { locked: true },
  },
  {
    method: "system.audio",
    category: "system",
    summary: "Mute or unmute guest ALSA audio output.",
    paramsSchema: {
      type: "object",
      properties: { muted: { type: "boolean" } },
    },
    example: { muted: false },
  },
  {
    method: "system.vm",
    category: "system",
    summary: "Control VM lifecycle: suspend snapshot, resume, or reboot.",
    paramsSchema: {
      type: "object",
      required: ["action"],
      properties: { action: { type: "string", enum: ["suspend", "resume", "reboot"] } },
    },
    example: { action: "suspend" },
  },

  // ─── WINDOW MANAGER ──────────────────────────────────────────────────
  {
    method: "wm.apps",
    category: "wm",
    summary: "List all installed WebOS apps with IDs, titles, descriptions and default dimensions.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "wm.windows",
    category: "wm",
    summary: "List all open windows with IDs, appId, workspace, geometry, minimized/maximized/snap & focus state.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "wm.open",
    category: "wm",
    summary: "Open or focus any WebOS app window (e.g. ide, terminal, explorer, preview, agent-studio, git, screen, gl-window, settings, agent-api).",
    paramsSchema: {
      type: "object",
      required: ["appId"],
      properties: {
        appId: { type: "string" },
        props: { type: "object" },
        forceNew: { type: "boolean" },
      },
    },
    example: { appId: "ide" },
  },
  {
    method: "wm.close",
    category: "wm",
    summary: "Close a specific window by windowId or all windows of an appId.",
    paramsSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        appId: { type: "string" },
      },
    },
    example: { appId: "notes" },
  },
  {
    method: "wm.focus",
    category: "wm",
    summary: "Focus and unminimize a window by windowId.",
    paramsSchema: {
      type: "object",
      required: ["windowId"],
      properties: { windowId: { type: "string" } },
    },
    example: { windowId: "ide-abc12" },
  },
  {
    method: "wm.snap",
    category: "wm",
    summary: "Snap a window to left, right, top-left, top-right, bottom-left, bottom-right, maximize, or none.",
    paramsSchema: {
      type: "object",
      required: ["windowId", "zone"],
      properties: {
        windowId: { type: "string" },
        zone: { type: "string", enum: ["left", "right", "top-left", "top-right", "bottom-left", "bottom-right", "maximize", "none"] },
      },
    },
    example: { windowId: "ide-abc12", zone: "left" },
  },
  {
    method: "wm.pin",
    category: "wm",
    summary: "Pin or unpin a window as Always-on-Top Picture-in-Picture (PiP).",
    paramsSchema: {
      type: "object",
      required: ["windowId"],
      properties: {
        windowId: { type: "string" },
        pinned: { type: "boolean" },
      },
    },
    example: { windowId: "preview-abc12", pinned: true },
  },
  {
    method: "wm.moveResize",
    category: "wm",
    summary: "Move and/or resize a window to exact pixel coordinates (x, y, width, height).",
    paramsSchema: {
      type: "object",
      required: ["windowId"],
      properties: {
        windowId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    example: { windowId: "terminal-abc12", x: 80, y: 60, width: 900, height: 560 },
  },
  {
    method: "wm.tile",
    category: "wm",
    summary: "Arrange desktop windows automatically into a smart layout preset.",
    paramsSchema: {
      type: "object",
      required: ["layout"],
      properties: {
        layout: {
          type: "string",
          enum: ["split-2", "grid-4", "focus-ide-preview", "focus-studio-terminal", "minimize-all"],
        },
      },
    },
    example: { layout: "focus-ide-preview" },
  },
  {
    method: "wm.workspace.switch",
    category: "wm",
    summary: "Switch active virtual desktop workspace (1..4).",
    paramsSchema: {
      type: "object",
      required: ["workspace"],
      properties: { workspace: { type: "number", enum: [1, 2, 3, 4] } },
    },
    example: { workspace: 1 },
  },
  {
    method: "wm.workspace.moveWindow",
    category: "wm",
    summary: "Move an open window to another virtual desktop workspace (1..4).",
    paramsSchema: {
      type: "object",
      required: ["windowId", "workspace"],
      properties: {
        windowId: { type: "string" },
        workspace: { type: "number", enum: [1, 2, 3, 4] },
      },
    },
    example: { windowId: "terminal-abc12", workspace: 2 },
  },
  {
    method: "wm.overlay",
    category: "wm",
    summary: "Open or close OS overlays: launcher, missionControl, controlCenter, notifications, commandPalette, githubModal.",
    paramsSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          enum: ["launcher", "missionControl", "controlCenter", "notifications", "commandPalette", "githubModal"],
        },
        open: { type: "boolean" },
      },
    },
    example: { name: "missionControl", open: true },
  },

  // ─── WORKSPACE & CROSS-APP ORCHESTRATION ─────────────────────────────
  {
    method: "workspace.get",
    category: "workspace",
    summary: "Get the global active working directory and recent workspaces.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "workspace.set",
    category: "workspace",
    summary: "Set the global active working directory synced across TopBar, Studio, IDE, Files, Terminal, Git & Services.",
    paramsSchema: {
      type: "object",
      required: ["dir"],
      properties: { dir: { type: "string" } },
    },
    example: { dir: "/home/user/workspace/my-ai-app" },
  },
  {
    method: "workspace.openFile",
    category: "workspace",
    summary: "Open a specific Linux file directly inside Code IDE with syntax highlighting.",
    paramsSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
    example: { path: "/home/user/workspace/my-ai-app/index.html" },
  },
  {
    method: "workspace.openDir",
    category: "workspace",
    summary: "Open a directory directly inside a chosen OS app (explorer, ide, studio, git, terminal).",
    paramsSchema: {
      type: "object",
      required: ["dir", "app"],
      properties: {
        dir: { type: "string" },
        app: { type: "string", enum: ["explorer", "ide", "studio", "git", "terminal"] },
        command: { type: "string", description: "Optional initial shell command when app='terminal'" },
        title: { type: "string", description: "Optional tab title when app='terminal'" },
      },
    },
    example: { dir: "/home/user/workspace/my-ai-app", app: "terminal", command: "ls -la" },
  },

  // ─── PREVIEW & WEB SERVERS ───────────────────────────────────────────
  {
    method: "preview.open",
    category: "preview",
    summary: "Open the live Web Preview window pointed at a guest TCP port and path.",
    paramsSchema: {
      type: "object",
      required: ["port"],
      properties: {
        port: { type: "number" },
        path: { type: "string" },
      },
    },
    example: { port: 3000, path: "/" },
  },
  {
    method: "preview.ports",
    category: "preview",
    summary: "List all currently detected listening TCP ports inside the Linux VM.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "preview.url",
    category: "preview",
    summary: "Get the live browser-accessible Service Worker preview URL for a guest port.",
    paramsSchema: {
      type: "object",
      required: ["port"],
      properties: {
        port: { type: "number" },
        path: { type: "string" },
      },
    },
    example: { port: 3000, path: "/" },
  },

  // ─── THEME & CONFIG ──────────────────────────────────────────────────
  {
    method: "theme.list",
    category: "theme",
    summary: "List all available WebOS themes, WebGPU WGSL live shaders and Kitty terminal themes.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "theme.set",
    category: "theme",
    summary: "Hot-switch WebOS theme, WebGPU shader, Kitty theme, glass blur/opacity, widgets or UI sounds instantaneously.",
    paramsSchema: {
      type: "object",
      properties: {
        osTheme: { type: "string" },
        wallpaperShader: { type: "string" },
        kittyTheme: { type: "string" },
        glassBlur: { type: "number" },
        glassOpacity: { type: "number" },
        desktopWidgets: { type: "boolean" },
        uiSounds: { type: "boolean" },
        dockMagnification: { type: "boolean" },
        webgpuWallpaper: { type: "boolean" },
      },
    },
    example: { osTheme: "cyber-tokyo", wallpaperShader: "neon-grid" },
  },
  {
    method: "config.get",
    category: "config",
    summary: "Read the complete current UnkernelConfig (compute, graphics, network, appearance).",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "config.set",
    category: "config",
    summary: "Patch any subset of UnkernelConfig settings (persisted to browser localStorage).",
    paramsSchema: {
      type: "object",
      required: ["patch"],
      properties: { patch: { type: "object" } },
    },
    example: { patch: { fbScaling: "crisp" } },
  },

  // ─── WAYLAND & 3D GL ─────────────────────────────────────────────────
  {
    method: "wayland.list",
    category: "wayland",
    summary: "List all native Linux Wayland windows composited directly on the unkernelOS Desktop.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "wayland.control",
    category: "wayland",
    summary: "Focus, resize, or close a Desktop-integrated Wayland surface window.",
    paramsSchema: {
      type: "object",
      required: ["key", "action"],
      properties: {
        key: { type: "string" },
        action: { type: "string", enum: ["focus", "resize", "close"] },
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    example: { key: "1:3", action: "focus" },
  },

  // ─── GITHUB & DEPLOY ─────────────────────────────────────────────────
  {
    method: "github.status",
    category: "github",
    summary: "Check current GitHub authentication state and connected username.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "github.deployPages",
    category: "github",
    summary: "Run full 1-click GitHub Pages deployment (git init, .gitignore, pages.yml, create repo, push main, enable Pages).",
    paramsSchema: {
      type: "object",
      properties: {
        dir: { type: "string" },
        repoName: { type: "string" },
        commitMessage: { type: "string" },
        isPrivate: { type: "boolean" },
      },
    },
    example: { dir: "/home/user/workspace/my-ai-app", repoName: "my-ai-app", commitMessage: "Deploy via Agent OS API" },
  },

  // ─── HOST BROWSER INTERACTION ────────────────────────────────────────
  {
    method: "browser.download",
    category: "browser",
    summary: "Download any file from the Linux guest filesystem directly to the user's host computer Downloads folder.",
    paramsSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string" },
        filename: { type: "string" },
      },
    },
    example: { path: "/home/user/workspace/my-ai-app/index.html" },
  },
  {
    method: "browser.prompt",
    category: "browser",
    summary: "Ask the human user a text question via a host browser dialog and return their answer.",
    paramsSchema: {
      type: "object",
      required: ["question"],
      properties: {
        question: { type: "string" },
        defaultValue: { type: "string" },
      },
    },
    example: { question: "What should the app title be?", defaultValue: "Neon Dashboard" },
  },
  {
    method: "browser.confirm",
    category: "browser",
    summary: "Ask the human user a Yes/No confirmation via a host browser dialog and return boolean.",
    paramsSchema: {
      type: "object",
      required: ["question"],
      properties: { question: { type: "string" } },
    },
    example: { question: "Deploy this build to GitHub Pages now?" },
  },
  {
    method: "browser.storage.get",
    category: "browser",
    summary: "Read persistent host-side agent key-value memory (survives Linux VM resets).",
    paramsSchema: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string" } },
    },
    example: { key: "project-notes" },
  },
  {
    method: "browser.storage.set",
    category: "browser",
    summary: "Write persistent host-side agent key-value memory (survives Linux VM resets).",
    paramsSchema: {
      type: "object",
      required: ["key", "value"],
      properties: { key: { type: "string" }, value: {} },
    },
    example: { key: "project-notes", value: { lastPort: 3000 } },
  },

  // ─── BACKGROUND SERVICES REGISTRY ────────────────────────────────────
  {
    method: "services.list",
    category: "services",
    summary: "List all registered background Linux services configured in the Service Runner app.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "services.add",
    category: "services",
    summary: "Register a new background daemon service in Service Runner (and optionally start it immediately).",
    paramsSchema: {
      type: "object",
      required: ["name", "command"],
      properties: {
        name: { type: "string" },
        command: { type: "string" },
        cwd: { type: "string" },
        port: { type: "number" },
        start: { type: "boolean" },
      },
    },
    example: { name: "Vite Dev", command: "bun run dev -- --host 0.0.0.0", port: 5173, start: true },
  },
  {
    method: "mount.list",
    category: "workspace",
    summary: "List all real host PC/Mac folders mounted into Linux /mnt/host via 9P.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "media.open",
    category: "workspace",
    summary: "Open any Linux Image, PDF, Video, or Audio file directly in Media & Capture Studio.",
    paramsSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
    example: { path: "/home/user/workspace/demo.pdf" },
  },
  {method:"app.sdk",category:"wm",summary:"Read the framework-neutral unkernelOS app SDK contract, shared context defaults and example.",paramsSchema:{type:"object",properties:{}},example:{}},
  // ─── SELF-EXTENDING APP SDK & WORKFLOWS ──────────────────────────────
  {
    method: "app.list",
    category: "wm",
    summary: "List all Agent-Built custom WebOS apps installed in Launchpad.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "app.install",
    category: "wm",
    summary: "Dynamically create & install a new native WebOS app into Launchpad (inline html or Linux guestPath) with window.unkernelOS bridge!",
    paramsSchema: {
      type: "object",
      required: ["id", "title"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        shortTitle: { type: "string" },
        description: { type: "string" },
        emoji: { type: "string" },
        accent: { type: "string" },
        html: { type: "string" },
        guestPath: { type: "string" },
        open: { type: "boolean" },
      },
    },
    example: { id: "pulse-hud", title: "Pulse HUD", emoji: "⚡", html: "<html><body style='background:#080a12;color:#22d3ee;display:grid;place-items:center;height:100vh;font-family:monospace'><h1>Agent App Live!</h1></body></html>", open: true },
  },
  {
    method: "app.open",
    category: "wm",
    summary: "Launch an installed Agent-Built custom WebOS app by ID.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "quantum-calc" },
  },
  {
    method: "app.uninstall",
    category: "wm",
    summary: "Uninstall a custom Agent-Built WebOS app by ID.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "pulse-hud" },
  },
  {
    method: "workflow.list",
    category: "services",
    summary: "List all registered OS automation workflows.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "workflow.run",
    category: "services",
    summary: "Execute an OS automation workflow by ID and return full step output.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "wf-env-audit" },
  },
  // ─── MULTI-AGENT SWARM ORCHESTRATION ─────────────────────────────────
  {
    method: "swarm.status",
    category: "system",
    summary: "Inspect active parallel Swarm agents, Kanban tasks, and inter-agent bus messages.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "swarm.spawn",
    category: "system",
    summary: "Spawn a new parallel agent pane inside Multi-Agent Swarm Ops.",
    paramsSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        role: { type: "string" },
        harness: { type: "string", enum: ["claude", "pi", "shell"] },
        cwd: { type: "string" },
        initialCommand: { type: "string" },
      },
    },
    example: { name: "QA Bot", role: "E2E Tests", harness: "shell", initialCommand: "bun test" },
  },
  {
    method: "swarm.post",
    category: "system",
    summary: "Post a message to the shared inter-agent Swarm Message Bus.",
    paramsSchema: {
      type: "object",
      required: ["text"],
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        text: { type: "string" },
      },
    },
    example: { from: "Frontend", to: "Backend", text: "UI is live on :3000, ready for API hookup." },
  },
  {
    method: "swarm.task",
    category: "system",
    summary: "Create or update a task on the shared Multi-Agent Swarm Kanban board.",
    paramsSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "move"] },
        id: { type: "string" },
        title: { type: "string" },
        assignee: { type: "string" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
      },
    },
    example: { action: "add", title: "Verify responsive layout", assignee: "QA Bot" },
  },
  // ─── FULL OS MODDING ENGINE & AAA 3D WEBGPU DESKTOP ──────────────────
  {
    method: "mod.status",
    category: "theme",
    summary: "Inspect full OS Modding state: active variant, custom theme tokens, window decorator, shell/dock/topbar, 3D WebGPU desktop, shaders, widgets & mods.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "mod.variants",
    category: "theme",
    summary: "List all available full OS Variants (stock, macOS Liquid Metal, Night City 2099, Retro 95, Swiss Mono, Kyoto Zen, VisionOS 3D, plus user variants).",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "mod.variant.apply",
    category: "theme",
    summary: "Apply a full 1-click OS Variant by ID (transforms theme, decorator, dock, topbar, shader, widgets, 3D desktop & mods atomically).",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "cyberpunk-2099" },
  },
  {
    method: "mod.variant.create",
    category: "theme",
    summary: "Save the current modded OS configuration as a reusable named OS Variant.",
    paramsSchema: {
      type: "object",
      required: ["id", "name"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        tagline: { type: "string" },
        emoji: { type: "string" },
      },
    },
    example: { id: "agent-edition", name: "Agent Dark Neon", tagline: "Created by Claude Code", emoji: "🤖" },
  },
  {
    method: "mod.list",
    category: "theme",
    summary: "List all installed OS mods (general & specific), optionally filtered by kind.",
    paramsSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["theme", "decorator", "shader", "widget", "css", "shell"] },
      },
    },
    example: {},
  },
  {
    method: "mod.toggle",
    category: "theme",
    summary: "Enable or disable any installed OS mod by ID.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
      },
    },
    example: { id: "mod-crt-scanlines", enabled: true },
  },
  {
    method: "mod.install",
    category: "theme",
    summary: "Install or update a custom OS mod (CSS, theme patch, decorator patch, shell patch, shader or widget link).",
    paramsSchema: {
      type: "object",
      required: ["id", "name", "kind"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["theme", "decorator", "shader", "widget", "css", "shell"] },
        scope: { type: "string", enum: ["general", "specific"] },
        description: { type: "string" },
        enabled: { type: "boolean" },
        css: { type: "string" },
      },
    },
    example: { id: "agent-neon", name: "Agent Cyan Rim", kind: "css", scope: "specific", enabled: true, css: ".glass-surface-focused{border-color:#22d3ee!important}" },
  },
  {
    method: "mod.uninstall",
    category: "theme",
    summary: "Uninstall a custom OS mod by ID.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "agent-neon" },
  },
  {
    method: "mod.theme.set",
    category: "theme",
    summary: "Live-mod any OS theme token (accentPrimary, accentSecondary, glassRgb, blurPx, glassOpacity, borderColor, windowGlow, fontSans, fontMono, enabled).",
    paramsSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        name: { type: "string" },
        accentPrimary: { type: "string" },
        accentSecondary: { type: "string" },
        glassRgb: { type: "string" },
        elevatedRgb: { type: "string" },
        blurPx: { type: "number" },
        glassOpacity: { type: "number" },
        borderColor: { type: "string" },
        activeBorderColor: { type: "string" },
        windowGlow: { type: "string" },
      },
    },
    example: { enabled: true, accentPrimary: "#22d3ee", accentSecondary: "#f43f5e", blurPx: 32 },
  },
  {
    method: "mod.decorator.set",
    category: "theme",
    summary: "Live-mod Window Decorator across 14 styles (macos, macos-classic, windows-95, windows-xp, windows-11, gnome-adwaita, kde-breeze, xfce-lxde, compiz-emerald, visionos-glass, cyber-hud, minimal-swiss, floating-zen, tiling-i3).",
    paramsSchema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["macos", "macos-classic", "windows-95", "windows-xp", "windows-11", "gnome-adwaita", "kde-breeze", "xfce-lxde", "compiz-emerald", "visionos-glass", "cyber-hud", "minimal-swiss", "floating-zen", "tiling-i3"] },
        buttonPosition: { type: "string", enum: ["left", "right"] },
        radiusPx: { type: "number" },
        borderWidthPx: { type: "number" },
        titlebarHeightPx: { type: "number" },
        titleAlign: { type: "string", enum: ["left", "center"] },
        titlebarAccentBar: { type: "boolean" },
        showWorkspacePills: { type: "boolean" },
        showSnapButtons: { type: "boolean" },
        activeGlowPx: { type: "number" },
        unfocusedOpacity: { type: "number" },
      },
    },
    example: { style: "compiz-emerald", buttonPosition: "right", radiusPx: 14, titlebarAccentBar: true },
  },
  {
    method: "mod.shell.set",
    category: "theme",
    summary: "Live-mod OS Shell paradigm: taskbarMode (dock, win95, winxp, win11, kde-plasma, xfce-lxde, ios-springboard, visionos-ornament), dockStyle, topBarStyle, brandLabel, desktopIcons, compizWobbly, compizCube, visionOrnaments, springboardHome.",
    paramsSchema: {
      type: "object",
      properties: {
        taskbarMode: { type: "string", enum: ["dock", "win95", "winxp", "win11", "kde-plasma", "xfce-lxde", "ios-springboard", "visionos-ornament"] },
        dockStyle: { type: "string", enum: ["floating-glass", "full-taskbar", "minimal-pill", "cyber-rail", "hidden"] },
        dockRadiusPx: { type: "number" },
        topBarStyle: { type: "string", enum: ["glass", "floating-pills", "gnome", "ios", "retro", "minimal", "hidden"] },
        brandLabel: { type: "string" },
        showStockWidgets: { type: "boolean" },
        desktopIcons: { type: "boolean" },
        compizWobbly: { type: "boolean" },
        compizCube: { type: "boolean" },
        visionOrnaments: { type: "boolean" },
        springboardHome: { type: "boolean" },
      },
    },
    example: { taskbarMode: "winxp", desktopIcons: true, compizWobbly: true },
  },
  {
    method: "wm.grid",
    category: "wm",
    summary: "Arrange all open windows on the active workspace into a clean 2D Grid layout (grid, split-2, master-stack, columns-3, cascade).",
    paramsSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["grid", "split-2", "master-stack", "columns-3", "cascade"] },
      },
    },
    example: { mode: "master-stack" },
  },
  {
    method: "mod.fx.set",
    category: "theme",
    summary: "Live-mod all Window Effects: openAnimation (spring, genie, zoom, flip3d, fade), wobblyDrag, genieMinimize, burnClose, hoverTilt3d, dragGhostOpacity, dimInactive, chromaBorder.",
    paramsSchema: {
      type: "object",
      properties: {
        openAnimation: { type: "string", enum: ["spring", "genie", "zoom", "flip3d", "fade"] },
        wobblyDrag: { type: "boolean" },
        genieMinimize: { type: "boolean" },
        burnClose: { type: "boolean" },
        hoverTilt3d: { type: "boolean" },
        dragGhostOpacity: { type: "boolean" },
        dimInactive: { type: "boolean" },
        chromaBorder: { type: "boolean" },
      },
    },
    example: { openAnimation: "flip3d", wobblyDrag: true, burnClose: true, hoverTilt3d: true, chromaBorder: true },
  },
  {
    method: "mod.configure",
    category: "theme",
    summary: "Fine-tune any installed OS mod's live parameters (colors, opacity, speed, thickness, blur, glow) by mod ID.",
    paramsSchema: {
      type: "object",
      required: ["id", "params"],
      properties: {
        id: { type: "string" },
        params: { type: "object" },
        enabled: { type: "boolean" },
      },
    },
    example: { id: "mod-rgb-chroma-borders", enabled: true, params: { colorA: "#38bdf8", colorB: "#f43f5e", speed: 3 } },
  },
  {
    method: "mod.eyecandy.set",
    category: "theme",
    summary: "Control all AAA Eye-Candy & OS micro-details: cursorSpotlight, cursorTrail (none|aurora|stardust|neon-ribbon), clickRipples, ambientParticles (none|sakura|snow|fireflies|rain|matrix-sparks|embers), nightShiftWarmth (0..100), colorProfile (neutral|oled-vivid|cinema-warm|nordic-cool|cyber-hdr|monochrome-ink), glassGrain (0..100), vignetteStrength (0..80), edgeBreathGlow, specularSheen, geometryHud, soundProfile (crystal|mechanical|synth-retro|zen-wood|silent), showPerfHud, hotCorners.",
    paramsSchema: {
      type: "object",
      properties: {
        cursorSpotlight: { type: "boolean" },
        cursorTrail: { type: "string", enum: ["none", "aurora", "stardust", "neon-ribbon"] },
        clickRipples: { type: "boolean" },
        ambientParticles: { type: "string", enum: ["none", "sakura", "snow", "fireflies", "rain", "matrix-sparks", "embers"] },
        ambientParticleDensity: { type: "number" },
        nightShiftWarmth: { type: "number" },
        colorProfile: { type: "string", enum: ["neutral", "oled-vivid", "cinema-warm", "nordic-cool", "cyber-hdr", "monochrome-ink"] },
        glassGrain: { type: "number" },
        vignetteStrength: { type: "number" },
        edgeBreathGlow: { type: "boolean" },
        specularSheen: { type: "boolean" },
        geometryHud: { type: "boolean" },
        soundProfile: { type: "string", enum: ["crystal", "mechanical", "synth-retro", "zen-wood", "silent"] },
        showPerfHud: { type: "boolean" },
        hotCorners: { type: "object" },
      },
    },
    example: { ambientParticles: "fireflies", cursorTrail: "aurora", nightShiftWarmth: 20, soundProfile: "zen-wood", showPerfHud: true },
  },
  {
    method: "mod.backdrop.set",
    category: "theme",
    summary: "Set an Ultra-HD 2D NASA Space or 4K Nature Desktop Wallpaper (backdrop-earth-apollo, backdrop-moon-nasa, backdrop-jupiter-hubble, backdrop-saturn-cassini, backdrop-galaxy-hubble, backdrop-venice-sunset, custom URL, or null for WebGPU shaders).",
    paramsSchema: {
      type: "object",
      properties: {
        id: { type: ["string", "null"] },
        url: { type: "string" },
      },
    },
    example: { id: "backdrop-earth-apollo" },
  },
  {
    method: "mod.desktop3d.set",
    category: "theme",
    summary: "Control the True Spatial 3D WebGPU Desktop: enabled, layout (curved-cockpit, spatial-grid, compiz-cube, studio-desk, gallery-ring), scene (ocean-sunset, alpine-fjord, earth-orbit, jupiter-orbit, lunar-horizon, aurora-fjord), hdriPreset (auto, venice-4k, alpine-4k, night-4k, clouds-4k, twilight-4k, clear-sky-4k, space-void, custom), hdriUrl, hdriBackground, shadowsEnabled, doubleSidedWindows, spatialChrome3d, moveSpeed, camera (focus, overview, reset).",
    paramsSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        layout: { type: "string", enum: ["curved-cockpit", "spatial-grid", "compiz-cube", "studio-desk", "gallery-ring"] },
        scene: { type: "string", enum: ["ocean-sunset", "alpine-fjord", "earth-orbit", "jupiter-orbit", "lunar-horizon", "aurora-fjord"] },
        hdriPreset: { type: "string", enum: ["auto", "venice-4k", "alpine-4k", "night-4k", "clouds-4k", "twilight-4k", "clear-sky-4k", "space-void", "custom"] },
        hdriUrl: { type: "string" },
        hdriBackground: { type: "boolean" },
        shadowsEnabled: { type: "boolean" },
        doubleSidedWindows: { type: "boolean" },
        spatialChrome3d: { type: "boolean" },
        showControlsHud: { type: "boolean" },
        moveSpeed: { type: "number" },
        camera: { type: "string", enum: ["focus", "overview", "reset"] },
        cameraSpeed: { type: "number" },
        bloomIntensity: { type: "number" },
        particleDensity: { type: "number" },
      },
    },
    example: { enabled: true, layout: "spatial-grid", scene: "earth-orbit", spatialChrome3d: true, shadowsEnabled: true, doubleSidedWindows: true },
  },
  {
    method: "mod.shader.set",
    category: "theme",
    summary: "Activate a built-in custom WGSL wallpaper shader by ID, OR hot-compile & activate brand-new custom WGSL fragment code live on the desktop! Pass id:null to return to stock.",
    paramsSchema: {
      type: "object",
      properties: {
        id: { type: ["string", "null"] },
        name: { type: "string" },
        wgsl: { type: "string" },
        description: { type: "string" },
      },
    },
    example: { id: "shader-event-horizon" },
  },
  {
    method: "mod.widget.upsert",
    category: "theme",
    summary: "Create, update, reposition, resize, or toggle a live draggable HTML/SVG/JS Desktop Widget (receives live CPU/GPU/RAM/ports telemetry via postMessage).",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        emoji: { type: "string" },
        description: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        enabled: { type: "boolean" },
        transparent: { type: "boolean" },
        html: { type: "string" },
      },
    },
    example: { id: "agent-kpi", title: "Agent Status", emoji: "🤖", x: 32, y: 60, width: 220, height: 100, enabled: true, html: "<body style='margin:0;padding:12px;color:#22d3ee;font-family:monospace'><b>AGENT ACTIVE</b></body>" },
  },
  {
    method: "mod.widget.remove",
    category: "theme",
    summary: "Delete a desktop widget by ID.",
    paramsSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    example: { id: "agent-kpi" },
  },
  {
    method: "mod.css.set",
    category: "theme",
    summary: "Inject or update a live global/specific CSS mod (or update raw userCss).",
    paramsSchema: {
      type: "object",
      required: ["css"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        css: { type: "string" },
        enabled: { type: "boolean" },
      },
    },
    example: { id: "agent-css", name: "Neon Glow", css: ".glass-dock{border-color:#22d3ee!important}", enabled: true },
  },
  {
    method: "mod.signal.list",
    category: "theme",
    summary: "List all live real-time reactive OS signals (CPU, GPU, RAM, disk, procs, AI tokens, weather, daylight, custom signals), active data sources, bindings, scripts & surfaces.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "mod.signal.set",
    category: "theme",
    summary: "Push one or many real-time signal values into the Reactive Mod Engine (drives WGSL shader uniforms, CSS --sig-* vars, bindings, JS scripts & HTML/Canvas/Iframe surfaces immediately!).",
    paramsSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: {},
        signals: { type: "object" },
        unit: { type: "string" },
        label: { type: "string" },
      },
    },
    example: { key: "custom.energy", value: 0.92, unit: "" },
  },
  {
    method: "mod.source.upsert",
    category: "theme",
    summary: "Create or update a live programmable Data Source (shell / python / bun / node inside unkernel VM, or http / js) that periodically feeds real-time signals into the OS.",
    paramsSchema: {
      type: "object",
      required: ["id", "kind", "code"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        emoji: { type: "string" },
        kind: { type: "string", enum: ["shell", "python", "bun", "node", "http", "js"] },
        enabled: { type: "boolean" },
        intervalMs: { type: "number" },
        outputPrefix: { type: "string" },
        code: { type: "string" },
        parser: { type: "string" },
      },
    },
    example: { id: "src-my-metric", name: "Git Commits", kind: "shell", enabled: true, intervalMs: 10000, outputPrefix: "git", code: "echo '{\"commits\": 12}'" },
  },
  {
    method: "mod.source.run",
    category: "theme",
    summary: "Execute a Reactive Data Source immediately and return its output.",
    paramsSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    example: { id: "src-linux-proc-python" },
  },
  {
    method: "mod.source.remove",
    category: "theme",
    summary: "Remove a Reactive Data Source by ID.",
    paramsSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    example: { id: "src-my-metric" },
  },
  {
    method: "mod.binding.upsert",
    category: "theme",
    summary: "Bind any live OS signal expression to any OS theme, eye-candy, 3D, dock, decorator, CSS variable or WGSL shader custom0..3 uniform.",
    paramsSchema: {
      type: "object",
      required: ["id", "target", "expression"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
        target: { type: "string" },
        cssVarName: { type: "string" },
        expression: { type: "string" },
      },
    },
    example: { id: "bind-cpu-color", name: "CPU Color", enabled: true, target: "theme.accentPrimary", expression: "lerpColor('#22d3ee','#f43f5e',clamp(sig('sys.cpu')/100,0,1))" },
  },
  {
    method: "mod.binding.remove",
    category: "theme",
    summary: "Remove a Reactive Binding by ID.",
    paramsSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    example: { id: "bind-cpu-color" },
  },
  {
    method: "mod.script.upsert",
    category: "theme",
    summary: "Install or update an unrestricted live JavaScript Reactive Mod Controller with full access to signals, DOM, modStore, wmStore, unkernel execShell & fetch.",
    paramsSchema: {
      type: "object",
      required: ["id", "code"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
        intervalMs: { type: "number" },
        code: { type: "string" },
      },
    },
    example: { id: "script-agent-pulse", name: "Agent Pulse", enabled: true, intervalMs: 1500, code: "os.reactiveEngine.setCustomUniform(1, clamp(sig('agent.tokens')/20000,0,1));" },
  },
  {
    method: "mod.script.remove",
    category: "theme",
    summary: "Remove a Reactive JS Script Mod by ID.",
    paramsSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    example: { id: "script-agent-pulse" },
  },
  {
    method: "mod.surface.upsert",
    category: "theme",
    summary: "Mount or update a custom HTML, Iframe, or 60fps Canvas surface anywhere in the OS (slots: wallpaper, desktop, overlay, topbar, dock, titlebar, 3d-panel).",
    paramsSchema: {
      type: "object",
      required: ["id", "contentType", "slot"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
        contentType: { type: "string", enum: ["html", "iframe", "canvas"] },
        slot: { type: "string", enum: ["wallpaper", "desktop", "overlay", "topbar", "dock", "titlebar", "3d-panel"] },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        html: { type: "string" },
        iframeUrl: { type: "string" },
        script: { type: "string" },
        canvasScript: { type: "string" },
        pose3d: { type: "object" },
      },
    },
    example: { id: "surf-agent-pill", name: "Agent Pill", enabled: true, contentType: "html", slot: "topbar", html: "<span style='color:#38bdf8;font-family:monospace;font-size:10px'>AI {{agent.tokens}}t</span>" },
  },
  {
    method: "mod.surface.remove",
    category: "theme",
    summary: "Remove a custom Reactive Surface by ID.",
    paramsSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    example: { id: "surf-agent-pill" },
  },
  {
    method: "t3.status",
    category: "services",
    summary: "Inspect T3 Code Agent Harness status, connection mode (vm/remote), active threads, subagents, token usage, cost USD & provider limits.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "t3.start",
    category: "services",
    summary: "Start the T3 Code server inside the unkernel Linux VM and open the T3 Code OS window.",
    paramsSchema: {
      type: "object",
      properties: { cwd: { type: "string" }, openWindow: { type: "boolean" } },
    },
    example: { cwd: "/home/user/workspace", openWindow: true },
  },
  {
    method: "t3.stop",
    category: "services",
    summary: "Stop the T3 Code daemon inside the Linux VM.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
  {
    method: "t3.project.add",
    category: "services",
    summary: "Register a workspace folder as a T3 Code project.",
    paramsSchema: { type: "object", required: ["dir"], properties: { dir: { type: "string" } } },
    example: { dir: "/home/user/workspace" },
  },
  {
    method: "mod.reset",
    category: "theme",
    summary: "Reset all OS mods, custom theme tokens, decorator, 3D desktop, widgets & CSS back to stock unkernelOS.",
    paramsSchema: { type: "object", properties: {} },
    example: {},
  },
];

const AGENT_KV_PREFIX = "unkernelos:agent-kv:";
const SERVICES_STORAGE_KEY = "unkernelos:services:v1";
const PERM_MODE_STORAGE_KEY = "unkernelos:agent-perm-mode:v1";

export type AgentPermissionMode = "auto" | "supervised" | "read-only";

const READ_ONLY_METHODS = new Set([
  "skills.list",
  "skills.read",
  "guest.fs.list",
  "guest.fs.read",
  "horizon.status",
  "horizon.sessions",
  "horizon.session.read",
  "system.info",
  "system.clipboard.read",
  "system.clipboard.history",
  "system.screenshot",
  "wm.apps",
  "wm.windows",
  "workspace.get",
  "preview.ports",
  "preview.url",
  "theme.list",
  "config.get",
  "wayland.list",
  "github.status",
  "browser.storage.get",
  "services.list",
  "mount.list",
  "app.list",
  "app.sdk",
  "workflow.list",
  "swarm.status",
]);

const SENSITIVE_METHODS = new Set([
  "guest.exec",
  "guest.fs.write",
  "guest.fs.mkdir",
  "guest.fs.remove",
  "guest.fs.rename",
  "guest.fs.copy",
  "github.deployPages",
  "system.vm",
  "app.install",
  "app.uninstall",
  "config.set",
  "browser.download",
  "wm.close",
  "system.lock",
]);

function loadPermMode(): AgentPermissionMode {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(PERM_MODE_STORAGE_KEY);
  return v === "supervised" || v === "read-only" ? v : "auto";
}

interface AgentApiState {
  readonly bridgeAttached: boolean;
  readonly registeredCommands: readonly string[];
  readonly permissionMode: AgentPermissionMode;
  readonly logs: readonly AgentApiCallRecord[];
  readonly totalCalls: number;
}

class AgentApiStore {
  private state: AgentApiState = {
    bridgeAttached: false,
    registeredCommands: [],
    permissionMode: loadPermMode(),
    logs: [],
    totalCalls: 0,
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): AgentApiState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  public setBridgeState(attached: boolean, commands: readonly string[]): void {
    this.state = { ...this.state, bridgeAttached: attached, registeredCommands: commands };
    this.emit();
  }

  public setPermissionMode(mode: AgentPermissionMode): void {
    try {
      localStorage.setItem(PERM_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    this.state = { ...this.state, permissionMode: mode };
    this.emit();
  }

  public recordCall(rec: AgentApiCallRecord): void {
    this.state = {
      ...this.state,
      totalCalls: this.state.totalCalls + 1,
      logs: [rec, ...this.state.logs].slice(0, 100),
    };
    this.emit();
  }

  public clearLogs(): void {
    this.state = { ...this.state, logs: [] };
    this.emit();
  }
}

export const agentApiStore = new AgentApiStore();

// Connect workflows & reactive mod engines to OS API executor cleanly without circular imports
workflowsStore.setOsExecutor((method, params, meta) => executeOsAction(method, params, meta));
reactiveEngine.attachOsCallBridge((method, params) =>
  executeOsAction(method, params ?? {}, { source: "window-api" })
);

export function useAgentApi(): AgentApiState {
  return useSyncExternalStore(agentApiStore.subscribe, agentApiStore.getSnapshot);
}

/**
 * Execute any host WebOS action directly and return structured JSON.
 * Used by: native `osctl` Linux host command, MCP stdio server (`osctl mcp`),
 * Agent OS API UI app, and `window.unkernelOS`.
 */
export async function executeOsAction(
  method: string,
  params: Record<string, unknown> = {},
  meta: { source: AgentApiCallRecord["source"]; callerPid?: number; callerCwd?: string } = { source: "ui" }
): Promise<unknown> {
  const t0 = performance.now();
  try {
    // Enforce Agent Permission Firewall for external guest/MCP callers
    if (meta.source === "guest-cli" || meta.source === "mcp") {
      const mode = agentApiStore.getSnapshot().permissionMode;
      if (mode === "read-only" && !READ_ONLY_METHODS.has(method)) {
        throw new Error(`Blocked by Agent OS Firewall (Read-Only mode): '${method}' is disabled.`);
      }
      if (mode === "supervised" && SENSITIVE_METHODS.has(method)) {
        const ok = window.confirm(
          `unkernelOS Agent Firewall\n\nAllow agent (${meta.source}) to run:\n${method}\n\nParams:\n${JSON.stringify(params, null, 2).slice(0, 400)}`
        );
        if (!ok) {
          throw new Error(`User denied agent action '${method}'`);
        }
      }
    }

    const result = await dispatchOsAction(method, params);
    // Feed real-time AI agent activity & estimated token usage into the Reactive Signal Bus
    if (method !== "mod.signal.list" && method !== "mod.signal.set") {
      const payloadChars = JSON.stringify(params).length + (result ? JSON.stringify(result).length : 0);
      const estTokens = Math.max(12, Math.round(payloadChars / 4));
      reactiveEngine.recordAgentActivity(estTokens, 1);
    }
    agentApiStore.recordCall({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      source: meta.source,
      method,
      params,
      ok: true,
      result,
      durationMs: Math.round(performance.now() - t0),
      callerPid: meta.callerPid,
      callerCwd: meta.callerCwd,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    agentApiStore.recordCall({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      source: meta.source,
      method,
      params,
      ok: false,
      error: message,
      durationMs: Math.round(performance.now() - t0),
      callerPid: meta.callerPid,
      callerCwd: meta.callerCwd,
    });
    throw err;
  }
}

function requiredGuestPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("\0") ||
    value.length > 4096
  )
    throw new Error("An absolute Linux path is required");
  return value;
}

async function dispatchOsAction(method: string, p: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "skills.list":
      return listAgentSkills(p);
    case "skills.read":
      return readAgentSkill(String(p.id ?? ""));
    case "guest.exec": {
      const script = typeof p.script === "string" ? p.script : undefined;
      if ((script !== undefined) === (typeof p.file === "string"))
        throw new Error("Supply either script or file+args");
      if (
        p.args !== undefined &&
        (!Array.isArray(p.args) || !p.args.every((a) => typeof a === "string"))
      )
        throw new Error("args must be strings");
      const ms = Number(p.timeoutMs ?? 15000);
      if (!Number.isInteger(ms) || ms < 1000 || ms > 60000)
        throw new Error("timeoutMs must be 1000–60000");
      const options = {
        cwd: typeof p.cwd === "string" ? p.cwd : undefined,
        input: typeof p.input === "string" ? p.input : undefined,
        maxBuffer: 131072,
        signal: AbortSignal.timeout(ms),
      };
      return appRuntime.runPromise(
        Effect.flatMap(VmService, (v) =>
          script !== undefined
            ? v.execShell(script, options)
            : v.exec(String(p.file), p.args as string[] | undefined, options),
        ),
      );
    }
    case "guest.fs.list": {
      const entries = await appRuntime.runPromise(
        Effect.flatMap(GuestFsService, (f) =>
          f.listDir(requiredGuestPath(p.path)),
        ),
      );
      return {
        entries: entries.slice(0, 1000),
        truncated: entries.length > 1000,
      };
    }
    case "guest.fs.read": {
      const path = requiredGuestPath(p.path),
        offset = Number(p.offset ?? 0),
        length = Number(p.length ?? 65536);
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(length) ||
        length < 1 ||
        length > 262144
      )
        throw new Error("Invalid byte range");
      if (
        p.encoding !== undefined &&
        p.encoding !== "utf8" &&
        p.encoding !== "base64"
      )
        throw new Error("Invalid encoding");
      const q = "'" + path.replace(/'/g, "'\\''") + "'";
      const r = await appRuntime.runPromise(
        Effect.flatMap(VmService, (v) =>
          v.execShell(
            `test -f ${q} && test -r ${q} && tail -c +${offset + 1} ${q} | head -c ${length} | base64`,
            { maxBuffer: 400000, signal: AbortSignal.timeout(15000) },
          ),
        ),
      );
      if (r.exitCode !== 0) throw new Error(r.stderr || "Cannot read file");
      const base64 = r.stdout.replace(/\s/g, ""),
        bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return {
        path,
        offset,
        bytes: bytes.length,
        nextOffset: offset + bytes.length,
        encoding: p.encoding ?? "utf8",
        content:
          p.encoding === "base64" ? base64 : new TextDecoder().decode(bytes),
      };
    }
    case "guest.fs.write": {
      const path = requiredGuestPath(p.path);
      if (typeof p.content !== "string")
        throw new Error("content must be a string");
      if (
        p.encoding !== undefined &&
        p.encoding !== "utf8" &&
        p.encoding !== "base64"
      )
        throw new Error("Invalid encoding");
      if (p.content.length > 400000)
        throw new Error("File write exceeds 256 KiB");
      const bytes =
        p.encoding === "base64"
          ? Uint8Array.from(atob(p.content), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(p.content);
      if (bytes.length > 262144) throw new Error("File write exceeds 256 KiB");
      await appRuntime.runPromise(
        Effect.flatMap(GuestFsService, (f) => f.writeFileBytes(path, bytes)),
      );
      return { path, bytes: bytes.length };
    }
    case "guest.fs.mkdir":
    case "guest.fs.remove":
    case "guest.fs.rename":
    case "guest.fs.copy": {
      const path = requiredGuestPath(p.path);
      await appRuntime.runPromise(
        Effect.flatMap(GuestFsService, (f) =>
          method === "guest.fs.mkdir"
            ? f.mkdir(path)
            : method === "guest.fs.remove"
              ? f.remove(path)
              : method === "guest.fs.rename"
                ? f.rename(path, requiredGuestPath(p.to))
                : f.copy(path, requiredGuestPath(p.to)),
        ),
      );
      return { ok: true, path };
    }

    case "horizon.status": {const w=wmStore.getSnapshot();return {enabled:w.horizonEnabled,layout:w.horizonLayout,flat:w.horizonFlat,workspace:w.activeWorkspace,windows:w.windows.map(x=>({id:x.id,sessionId:x.sessionId,contextId:x.contextId,placement:x.placement??"center",minimized:x.minimized}))};}
    case "horizon.sessions": return surfaceRegistry.list();
    case "horizon.session.read": return surfaceRegistry.read(String(p.windowId??""),String(p.grantId??""));
    case "horizon.session.action": {
      if(!p.requestId||!p.expectedRevision)throw new Error("requestId and expectedRevision are required");
      return surfaceRegistry.act({windowId:String(p.windowId??""),grantId:String(p.grantId??""),action:String(p.action??""),expectedRevision:String(p.expectedRevision),requestId:String(p.requestId),args:p.args&&typeof p.args==="object"&&!Array.isArray(p.args)?p.args as Record<string,unknown>:{}});
    }

    // ─── SYSTEM ────────────────────────────────────────────────────────
    case "system.info": {
      const vmState = await appRuntime.runPromise(Effect.flatMap(VmService, (v) => v.stateRef.get));
      const cfg = await appRuntime.runPromise(Effect.flatMap(SettingsService, (s) => s.getConfig));
      const wm = wmStore.getSnapshot();
      const pwa = pwaStore.getSnapshot();
      return {
        os: "unkernelOS",
        phase: vmState.phase,
        distro: vmState.distro,
        cpus: vmState.cpus,
        memoryMiB: vmState.memoryMiB,
        transport: vmState.transport,
        crossOriginIsolated: vmState.crossOriginIsolated,
        webgpuAvailable: vmState.webgpuAvailable,
        glStatus: vmState.glStatus,
        wispActiveUrl: vmState.wispActiveUrl,
        detectedPorts: vmState.detectedPorts,
        activeWorkspaceDir: wm.activeWorkspaceDir,
        activeWorkspace: wm.activeWorkspace,
        openWindows: wm.windows.length,
        waylandWindows: waylandDesktopManager.getSnapshot().windows.length,
        theme: cfg.osTheme,
        shader: cfg.wallpaperShader,
        pwaInstalled: pwa.installed,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }

    case "system.notify": {
      const title = String(p.title ?? "unkernelOS Agent");
      const message = String(p.message ?? "");
      const level = (["info", "success", "warn", "error"].includes(String(p.level))
        ? String(p.level)
        : "info") as "info" | "success" | "warn" | "error";
      const action =
        typeof p.actionUrl === "string" && p.actionUrl
          ? { label: String(p.actionLabel || "Open"), url: p.actionUrl }
          : undefined;
      wmStore.pushToast(title, message, level, action);
      return { sent: true, title, message, level };
    }

    case "system.openUrl": {
      const url = String(p.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
      const win = window.open(url, "_blank", "noopener,noreferrer");
      wmStore.pushToast("Opened URL", url, "info", { label: "Open Link", url });
      return { opened: Boolean(win), url };
    }

    case "system.clipboard.read": {
      const text = await navigator.clipboard.readText();
      return { text };
    }

    case "system.clipboard.write": {
      const text = String(p.text ?? "");
      clipboardStore.record(text, "agent");
      await navigator.clipboard.writeText(text).catch(() => {});
      return { written: true, length: text.length };
    }

    case "system.clipboard.history": {
      return { entries: clipboardStore.getSnapshot() };
    }

    case "system.speak": {
      const text = String(p.text ?? "").trim();
      if (!text) throw new Error("text is required");
      if (typeof speechSynthesis === "undefined") throw new Error("Web Speech API unavailable");
      const utter = new SpeechSynthesisUtterance(text);
      if (typeof p.lang === "string") utter.lang = p.lang;
      if (typeof p.rate === "number") utter.rate = Math.max(0.5, Math.min(2, p.rate));
      speechSynthesis.speak(utter);
      return { speaking: true, text };
    }

    case "system.sound": {
      const cue = String(p.cue ?? "notify");
      if (cue === "click") uiSounds.playClick();
      else if (cue === "open") uiSounds.playWindowOpen();
      else if (cue === "close") uiSounds.playWindowClose();
      else if (cue === "snap") uiSounds.playSnap();
      else if (cue === "workspace") uiSounds.playWorkspaceSwitch();
      else if (cue === "lock") uiSounds.playLock();
      else if (cue === "unlock") uiSounds.playUnlock();
      else uiSounds.playNotify();
      return { played: cue };
    }

    case "system.screenshot": {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const target =
        canvases.find((c) => c.width > 100 && c.height > 100 && c.offsetParent !== null) ?? canvases[0];
      const info: Record<string, unknown> = {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        canvasesFound: canvases.length,
      };
      if (target) {
        try {
          const dataUrl = target.toDataURL("image/png");
          info.width = target.width;
          info.height = target.height;
          if (typeof p.savePath === "string" && p.savePath.trim()) {
            const b64 = dataUrl.split(",")[1] ?? "";
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await appRuntime.runPromise(
              Effect.flatMap(GuestFsService, (fs) => fs.writeFileBytes(p.savePath as string, bytes))
            );
            info.savedPath = p.savePath;
            info.bytes = bytes.byteLength;
          } else {
            info.dataUrlPreview = `${dataUrl.slice(0, 96)}... (${dataUrl.length} chars)`;
          }
        } catch (err) {
          info.note = `Canvas readback restricted (${err instanceof Error ? err.message : String(err)})`;
        }
      }
      return info;
    }

    case "system.syncDisk": {
      const ok = await appRuntime.runPromise(Effect.flatMap(VmService, (v) => v.syncDisk()));
      return { synced: ok };
    }

    case "system.lock": {
      const locked = p.locked !== undefined ? Boolean(p.locked) : true;
      wmStore.setLocked(locked);
      return { locked };
    }

    case "system.audio": {
      const vmState = await appRuntime.runPromise(Effect.flatMap(VmService, (v) => v.stateRef.get));
      const wantMuted = p.muted !== undefined ? Boolean(p.muted) : !vmState.audioMuted;
      if (wantMuted !== vmState.audioMuted) {
        await appRuntime.runPromise(Effect.flatMap(VmService, (v) => v.toggleMute()));
      }
      return { muted: wantMuted };
    }

    case "system.vm": {
      const action = String(p.action ?? "");
      if (action === "suspend") {
        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.suspend()).pipe(Effect.ignore));
        return { scheduled: "suspend" };
      }
      if (action === "resume") {
        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.resume()).pipe(Effect.ignore));
        return { scheduled: "resume" };
      }
      if (action === "reboot") {
        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.reboot()).pipe(Effect.ignore));
        return { scheduled: "reboot" };
      }
      throw new Error("action must be suspend, resume, or reboot");
    }

    // ─── WINDOW MANAGER ────────────────────────────────────────────────
    case "wm.apps": {
      return Object.values(APP_CATALOG).map((a) => ({
        id: a.id,
        title: a.title,
        shortTitle: a.shortTitle,
        description: a.description,
        shortcut: a.shortcut ?? null,
      }));
    }

    case "wm.windows": {
      const wm = wmStore.getSnapshot();
      return {
        activeWorkspace: wm.activeWorkspace,
        activeWindowId: wm.activeWindowId,
        windows: wm.windows.map((w) => ({
          id: w.id,
          appId: w.appId,
          title: w.title,
          workspace: w.workspace,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
          minimized: w.minimized,
          maximized: w.maximized,
          snap: w.snap,
          focused: w.id === wm.activeWindowId,
        })),
      };
    }

    case "wm.open": {
      const appId = String(p.appId ?? "") as AppId;
      if (!(appId in APP_CATALOG)) {
        throw new Error(`Unknown appId '${appId}'. Available: ${Object.keys(APP_CATALOG).join(", ")}`);
      }
      const id = wmStore.openApp(
        appId,
        typeof p.props === "object" && p.props ? (p.props as Record<string, unknown>) : undefined,
        Boolean(p.forceNew)
      );
      return { windowId: id, appId };
    }

    case "wm.close": {
      if (typeof p.windowId === "string" && p.windowId) {
        wmStore.closeWindow(p.windowId);
        return { closed: p.windowId };
      }
      if (typeof p.appId === "string" && p.appId in APP_CATALOG) {
        wmStore.closeAppWindows(p.appId as AppId);
        return { closedApp: p.appId };
      }
      throw new Error("Provide windowId or appId");
    }

    case "wm.focus": {
      const windowId = String(p.windowId ?? "");
      if (!windowId) throw new Error("windowId is required");
      wmStore.focusWindow(windowId);
      return { focused: windowId };
    }

    case "wm.snap": {
      const windowId = String(p.windowId ?? "");
      const zone = String(p.zone ?? "maximize") as SnapZone;
      if (!windowId) throw new Error("windowId is required");
      wmStore.snapWindow(windowId, zone);
      return { windowId, zone };
    }

    case "wm.pin": {
      const windowId = String(p.windowId ?? "");
      if (!windowId) throw new Error("windowId is required");
      wmStore.togglePinWindow(windowId, typeof p.pinned === "boolean" ? p.pinned : undefined);
      return { windowId, pinned: p.pinned ?? true };
    }

    case "wm.moveResize": {
      const windowId = String(p.windowId ?? "");
      if (!windowId) throw new Error("windowId is required");
      const rect: Partial<{ x: number; y: number; width: number; height: number }> = {};
      if (typeof p.x === "number") rect.x = p.x;
      if (typeof p.y === "number") rect.y = p.y;
      if (typeof p.width === "number") rect.width = p.width;
      if (typeof p.height === "number") rect.height = p.height;
      wmStore.moveResize(windowId, rect);
      return { windowId, ...rect };
    }

    case "wm.tile": {
      const layout = String(p.layout ?? "split-2");
      const wm = wmStore.getSnapshot();
      const wsWins = wm.windows.filter((w) => w.workspace === wm.activeWorkspace && !w.minimized);
      if (layout === "minimize-all") {
        wmStore.minimizeAllInWorkspace();
        return { layout, count: wsWins.length };
      }
      if (layout === "focus-ide-preview") {
        const ideId = wmStore.openApp("ide");
        const prevId = wmStore.openApp("preview");
        wmStore.snapWindow(ideId, "left");
        wmStore.snapWindow(prevId, "right");
        return { layout, left: ideId, right: prevId };
      }
      if (layout === "focus-studio-terminal") {
        const stId = wmStore.openApp("agent-studio");
        const termId = wmStore.openApp("terminal");
        wmStore.snapWindow(stId, "left");
        wmStore.snapWindow(termId, "right");
        return { layout, left: stId, right: termId };
      }
      if (layout === "grid-4") {
        const zones: SnapZone[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
        wsWins.slice(0, 4).forEach((w, i) => wmStore.snapWindow(w.id, zones[i]!));
        return { layout, tiled: wsWins.slice(0, 4).map((w) => w.id) };
      }
      if (wsWins[0]) wmStore.snapWindow(wsWins[0].id, "left");
      if (wsWins[1]) wmStore.snapWindow(wsWins[1].id, "right");
      return { layout: "split-2", tiled: wsWins.slice(0, 2).map((w) => w.id) };
    }

    case "wm.workspace.switch": {
      const ws = Number(p.workspace) as WorkspaceId;
      if (![1, 2, 3, 4].includes(ws)) throw new Error("workspace must be 1, 2, 3, or 4");
      wmStore.switchWorkspace(ws);
      return { activeWorkspace: ws };
    }

    case "wm.workspace.moveWindow": {
      const windowId = String(p.windowId ?? "");
      const ws = Number(p.workspace) as WorkspaceId;
      if (!windowId || ![1, 2, 3, 4].includes(ws)) throw new Error("windowId and workspace (1..4) required");
      wmStore.moveWindowToWorkspace(windowId, ws);
      return { windowId, workspace: ws };
    }

    case "wm.overlay": {
      const name = String(p.name ?? "");
      const open = p.open !== undefined ? Boolean(p.open) : true;
      if (name === "launcher") wmStore.setLauncher(open);
      else if (name === "missionControl") wmStore.setMissionControl(open);
      else if (name === "controlCenter") wmStore.setControlCenter(open);
      else if (name === "notifications") wmStore.setNotificationCenter(open);
      else if (name === "commandPalette") wmStore.setCommandPalette(open);
      else if (name === "githubModal") wmStore.setGithubModal(open);
      else throw new Error(`Unknown overlay '${name}'`);
      return { name, open };
    }

    // ─── WORKSPACE ─────────────────────────────────────────────────────
    case "workspace.get": {
      const wm = wmStore.getSnapshot();
      return {
        activeWorkspaceDir: wm.activeWorkspaceDir,
        recentWorkspaces: wm.recentWorkspaces,
      };
    }

    case "workspace.set": {
      const dir = String(p.dir ?? "").trim();
      if (!dir) throw new Error("dir is required");
      wmStore.setWorkspaceDir(dir);
      return { activeWorkspaceDir: wmStore.getSnapshot().activeWorkspaceDir };
    }

    case "workspace.openFile": {
      const filePath = String(p.path ?? "").trim();
      if (!filePath) throw new Error("path is required");
      wmStore.openFileInIde(filePath);
      return { openedInIde: filePath };
    }

    case "workspace.openDir": {
      const dir = String(p.dir ?? wmStore.getSnapshot().activeWorkspaceDir).trim();
      const app = String(p.app ?? "explorer");
      if (app === "explorer") wmStore.openDirInExplorer(dir);
      else if (app === "ide") wmStore.openDirInIde(dir);
      else if (app === "studio") wmStore.openDirInStudio(dir);
      else if (app === "git") wmStore.openDirInGit(dir);
      else if (app === "terminal") {
        wmStore.openTerminalInDir(
          dir,
          typeof p.command === "string" ? p.command : undefined,
          typeof p.title === "string" ? p.title : undefined
        );
      } else {
        throw new Error("app must be explorer, ide, studio, git, or terminal");
      }
      return { dir, app };
    }

    // ─── PREVIEW ───────────────────────────────────────────────────────
    case "preview.open": {
      const port = Number(p.port);
      if (!port || port < 1 || port > 65535) throw new Error("Valid port (1..65535) is required");
      const path = typeof p.path === "string" && p.path ? p.path : "/";
      wmStore.openPreview(port, path);
      return { port, path };
    }

    case "preview.ports": {
      const vmState = await appRuntime.runPromise(Effect.flatMap(VmService, (v) => v.stateRef.get));
      return { ports: vmState.detectedPorts };
    }

    case "preview.url": {
      const port = Number(p.port);
      const path = typeof p.path === "string" && p.path ? p.path : "/";
      const url = await appRuntime.runPromise(
        Effect.gen(function* () {
          const vm = yield* VmService;
          yield* Effect.promise(() => vm.previewRelay.ready());
          return vm.previewRelay.previewUrl(port, path);
        })
      );
      return { port, path, url };
    }

    // ─── THEME & CONFIG ────────────────────────────────────────────────
    case "theme.list": {
      return {
        osThemes: Object.keys(OS_THEMES),
        wallpaperShaders: Object.keys(WALLPAPER_SHADERS),
        kittyThemes: Object.keys(KITTY_THEMES),
      };
    }

    case "theme.set": {
      const patch: { -readonly [K in keyof UnkernelConfig]?: UnkernelConfig[K] } = {};
      if (typeof p.osTheme === "string" && p.osTheme in OS_THEMES) {
        patch.osTheme = p.osTheme as OsThemeId;
      }
      if (typeof p.wallpaperShader === "string" && p.wallpaperShader in WALLPAPER_SHADERS) {
        patch.wallpaperShader = p.wallpaperShader as WallpaperShaderId;
        patch.webgpuWallpaper = true;
      }
      if (typeof p.kittyTheme === "string" && p.kittyTheme in KITTY_THEMES) {
        patch.kittyTheme = p.kittyTheme as KittyThemeId;
      }
      if (typeof p.glassBlur === "number") patch.glassBlur = Math.max(4, Math.min(48, p.glassBlur));
      if (typeof p.glassOpacity === "number") patch.glassOpacity = Math.max(0.4, Math.min(0.98, p.glassOpacity));
      if (typeof p.desktopWidgets === "boolean") patch.desktopWidgets = p.desktopWidgets;
      if (typeof p.uiSounds === "boolean") patch.uiSounds = p.uiSounds;
      if (typeof p.dockMagnification === "boolean") patch.dockMagnification = p.dockMagnification;
      if (typeof p.webgpuWallpaper === "boolean") patch.webgpuWallpaper = p.webgpuWallpaper;
      const updated = await appRuntime.runPromise(
        Effect.flatMap(SettingsService, (s) => s.updateConfig(patch))
      );
      return { updated: patch, osTheme: updated.osTheme, wallpaperShader: updated.wallpaperShader };
    }

    case "config.get": {
      return await appRuntime.runPromise(Effect.flatMap(SettingsService, (s) => s.getConfig));
    }

    case "config.set": {
      const patch = (p.patch && typeof p.patch === "object" ? p.patch : p) as Partial<UnkernelConfig>;
      if (patch.fbScaling && !["crisp", "smooth", "crt"].includes(patch.fbScaling)) {
        throw new Error("fbScaling must be crisp, smooth, or crt");
      }
      const next = await appRuntime.runPromise(
        Effect.flatMap(SettingsService, (s) => s.updateConfig(patch as Partial<UnkernelConfig & { fbScaling: FbScalingMode }>))
      );
      return { ok: true, config: next };
    }

    // ─── WAYLAND ───────────────────────────────────────────────────────
    case "wayland.list": {
      return waylandDesktopManager.getSnapshot();
    }

    case "wayland.control": {
      const key = String(p.key ?? "");
      const action = String(p.action ?? "focus");
      if (!key) throw new Error("key is required");
      if (action === "focus") {
        waylandDesktopManager.focusWindow(key);
        const info = waylandDesktopManager.getSnapshot().windows.find((w) => w.key === key);
        if (info) wmStore.openWaylandWindow(info.key, info.title, info.appId);
      } else if (action === "resize") {
        waylandDesktopManager.resizeWindow(key, Number(p.width) || 800, Number(p.height) || 540);
      } else if (action === "close") {
        waylandDesktopManager.closeWindow(key);
      } else {
        throw new Error("action must be focus, resize, or close");
      }
      return { key, action };
    }

    // ─── GITHUB & PAGES ────────────────────────────────────────────────
    case "github.status": {
      const gh = await appRuntime.runPromise(Effect.flatMap(GithubAuthService, (g) => g.stateRef.get));
      const creds = await appRuntime.runPromise(Effect.flatMap(SettingsService, (s) => s.getCredentials));
      return {
        status: gh.status,
        user: gh.user,
        hasToken: Boolean(creds.githubToken),
      };
    }

    case "github.deployPages": {
      const dir = String(p.dir || wmStore.getSnapshot().activeWorkspaceDir);
      const repoName = String(p.repoName || dir.split("/").filter(Boolean).pop() || "unkernelos-app");
      const commitMessage = String(p.commitMessage || "Deploy via unkernelOS Agent API");
      const isPrivate = Boolean(p.isPrivate);
      const res = await appRuntime.runPromise(
        Effect.flatMap(GitService, (g) => g.deployToGitHubPages(dir, repoName, commitMessage, isPrivate))
      );
      return res;
    }

    // ─── HOST BROWSER ──────────────────────────────────────────────────
    case "browser.download": {
      const filePath = String(p.path ?? "").trim();
      if (!filePath) throw new Error("path is required");
      const bytes = await appRuntime.runPromise(
        Effect.flatMap(GuestFsService, (fs) => fs.readFileBytes(filePath))
      );
      const copy = new Uint8Array(bytes);
      const blob = new Blob([copy.buffer]);
      const url = URL.createObjectURL(blob);
      const filename = String(p.filename || filePath.split("/").pop() || "download.bin");
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      wmStore.pushToast("File Downloaded", filename, "success");
      return { downloaded: true, filename, bytes: copy.byteLength };
    }

    case "browser.prompt": {
      const question = String(p.question ?? "Agent asks:");
      const def = typeof p.defaultValue === "string" ? p.defaultValue : "";
      const answer = window.prompt(question, def);
      return { answered: answer !== null, value: answer };
    }

    case "browser.confirm": {
      const question = String(p.question ?? "Confirm agent action?");
      const confirmed = window.confirm(question);
      return { confirmed };
    }

    case "browser.storage.get": {
      const key = String(p.key ?? "").trim();
      if (!key) throw new Error("key is required");
      const raw = localStorage.getItem(`${AGENT_KV_PREFIX}${key}`);
      if (raw === null) return { key, found: false, value: null };
      try {
        return { key, found: true, value: JSON.parse(raw) };
      } catch {
        return { key, found: true, value: raw };
      }
    }

    case "browser.storage.set": {
      const key = String(p.key ?? "").trim();
      if (!key) throw new Error("key is required");
      localStorage.setItem(`${AGENT_KV_PREFIX}${key}`, JSON.stringify(p.value));
      return { key, saved: true };
    }

    // ─── SERVICES REGISTRY ─────────────────────────────────────────────
    case "services.list": {
      try {
        const raw = localStorage.getItem(SERVICES_STORAGE_KEY);
        return { services: raw ? JSON.parse(raw) : [] };
      } catch {
        return { services: [] };
      }
    }

    case "services.add": {
      const name = String(p.name ?? "").trim();
      const command = String(p.command ?? "").trim();
      if (!name || !command) throw new Error("name and command are required");
      const cwd = String(p.cwd || wmStore.getSnapshot().activeWorkspaceDir);
      const port = typeof p.port === "number" && p.port > 0 ? p.port : undefined;
      const id = `svc-${Math.random().toString(36).slice(2, 8)}`;
      const entry = { id, name, cwd, command, port };
      let list: unknown[] = [];
      try {
        const raw = localStorage.getItem(SERVICES_STORAGE_KEY);
        list = raw ? JSON.parse(raw) : [];
      } catch {
        list = [];
      }
      list.push(entry);
      localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(list));
      if (p.start) {
        const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
        await appRuntime.runPromise(
          Effect.flatMap(VmService, (vm) =>
            vm.execShell(
              `mkdir -p ${sq(cwd)} && cd ${sq(cwd)} && nohup /bin/sh -c ${sq(command)} > /tmp/unkernel-svc-${id}.log 2>&1 < /dev/null & echo $! > /tmp/unkernel-svc-${id}.pid`
            )
          )
        );
      }
      return { added: entry, started: Boolean(p.start) };
    }

    case "mount.list": {
      return {
        supported: hostMountManager.isSupported(),
        mounts: hostMountManager.getSnapshot(),
      };
    }

    case "media.open": {
      const filePath = String(p.path ?? "").trim();
      if (!filePath) throw new Error("path is required");
      wmStore.openFileInMedia(filePath);
      return { openedInMedia: filePath };
    }

    case "app.sdk": return {version:1,install:"app.install with inline html or Linux guestPath",frontend:"HTML/JavaScript, with optional WebAssembly. Generate or build it using Bun, Node, Rust or another toolchain.",sharedByDefault:true,discovery:"horizon.sessions",read:"horizon.session.read {windowId}",action:"horizon.session.action {windowId,action,expectedRevision,requestId,args}",controls:["ui.activate","ui.input","ui.scroll"],contract:{define:"unkernelOS.app.define({title,document,getState,getDock,getStatus,actions})",publish:"app.publish() after external state changes",invoke:"app.invoke(name,args) for every UI command",action:"{label,paramsSchema,run:async args=>result}",dock:"{label,glyph,value,detail,progress,primaryAction}",privacy:"Shared by default; the user can make a session private in its drawer."},example:"let playing=false; const app=unkernelOS.app.define({title:'My app',getState:()=>({playing}),getDock:()=>({label:playing?'Pause':'Play',glyph:playing?'pause':'play',primaryAction:'toggle'}),actions:{toggle:{label:'Toggle',run:()=>{playing=!playing;return{playing}}}}}); document.querySelector('button').onclick=()=>app.invoke('toggle');"};
    case "app.list": {
      return { apps: dynamicAppsStore.getSnapshot() };
    }

    case "app.install": {
      const id = String(p.id ?? "").trim();
      const title = String(p.title ?? "").trim();
      if (!id || !title) throw new Error("id and title are required");
      const installed = dynamicAppsStore.install({
        id,
        title,
        shortTitle: String(p.shortTitle || title.slice(0, 12)),
        description: String(p.description || "Agent-built WebOS application"),
        emoji: String(p.emoji || "✨"),
        accent: String(p.accent || "from-violet-500 to-cyan-500"),
        html: typeof p.html === "string" ? p.html : undefined,
        guestPath: typeof p.guestPath === "string" ? p.guestPath : undefined,
        createdBy: "Agent OS API",
      });
      wmStore.pushToast("New WebOS App Installed", `${installed.emoji} ${installed.title}`, "success");
      if (p.open !== false) {
        wmStore.openDynamicApp(installed);
      }
      return { installed };
    }

    case "app.open": {
      const id = String(p.id ?? "").trim();
      const app = dynamicAppsStore.getById(id);
      if (!app) throw new Error(`Custom app '${id}' not found`);
      const windowId = wmStore.openDynamicApp(app);
      return { windowId, id };
    }

    case "app.uninstall": {
      const id = String(p.id ?? "").trim();
      return { id, removed: dynamicAppsStore.uninstall(id) };
    }

    case "workflow.list": {
      return { workflows: workflowsStore.getSnapshot() };
    }

    case "workflow.run": {
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id is required");
      return await workflowsStore.run(id);
    }

    case "swarm.status": {
      return swarmStore.getSnapshot();
    }

    case "swarm.spawn": {
      const name = String(p.name ?? "Worker").trim();
      const harness = (["claude", "pi", "shell"].includes(String(p.harness))
        ? String(p.harness)
        : "claude") as "claude" | "pi" | "shell";
      const worker = swarmStore.addWorker({
        name,
        role: String(p.role || "Specialist"),
        harness,
        cwd: String(p.cwd || wmStore.getSnapshot().activeWorkspaceDir),
        initialCommand: typeof p.initialCommand === "string" ? p.initialCommand : undefined,
      });
      wmStore.openApp("agent-swarm");
      return { spawned: worker };
    }

    case "swarm.post": {
      const text = String(p.text ?? "").trim();
      if (!text) throw new Error("text is required");
      const msg = swarmStore.postMessage(String(p.from || "agent"), String(p.to || "all"), text);
      return { posted: msg };
    }

    case "swarm.task": {
      const action = String(p.action ?? "add");
      if (action === "move") {
        const id = String(p.id ?? "");
        const status = (["todo", "doing", "done"].includes(String(p.status))
          ? String(p.status)
          : "done") as "todo" | "doing" | "done";
        if (!id) throw new Error("id is required for move");
        swarmStore.moveTask(id, status);
        return { moved: id, status };
      }
      const title = String(p.title ?? "").trim();
      if (!title) throw new Error("title is required");
      const task = swarmStore.addTask(title, String(p.assignee || "all"));
      return { created: task };
    }

    // ─── OS MODDING ENGINE & 3D WEBGPU DESKTOP ─────────────────────────
    case "mod.status": {
      const s = modStore.getSnapshot();
      return {
        activeVariantId: s.activeVariantId,
        theme: s.theme,
        decorator: s.decorator,
        shell: s.shell,
        desktop3d: s.desktop3d,
        activeShaderModId: s.activeShaderModId,
        shaderCompileError: s.shaderCompileError,
        enabledMods: s.mods.filter((m) => m.enabled).map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
        enabledWidgets: s.widgets.filter((w) => w.enabled).map((w) => ({ id: w.id, title: w.title, x: w.x, y: w.y })),
        counts: {
          variants: s.variants.length,
          mods: s.mods.length,
          shaders: s.shaders.length,
          widgets: s.widgets.length,
        },
      };
    }

    case "mod.variants": {
      return {
        activeVariantId: modStore.getSnapshot().activeVariantId,
        variants: modStore.getSnapshot().variants.map((v) => ({
          id: v.id,
          name: v.name,
          emoji: v.emoji,
          tagline: v.tagline,
          decorator: v.decorator.style,
          dockStyle: v.shell.dockStyle,
          desktop3d: Boolean(v.desktop3d?.enabled),
          builtin: Boolean(v.builtin),
        })),
      };
    }

    case "mod.variant.apply": {
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id is required");
      const applied = modStore.applyVariant(id);
      if (!applied) throw new Error(`Unknown OS variant '${id}'`);
      wmStore.pushToast("OS Variant Applied", `${applied.emoji} ${applied.name}`, "success");
      return { applied: { id: applied.id, name: applied.name, desktop3d: applied.desktop3d ?? null } };
    }

    case "mod.variant.create": {
      const id = String(p.id ?? "").trim();
      const name = String(p.name ?? "").trim();
      if (!id || !name) throw new Error("id and name are required");
      const created = modStore.saveCurrentAsVariant(
        id,
        name,
        String(p.tagline || "Custom OS Variant"),
        String(p.emoji || "✨")
      );
      return { created: { id: created.id, name: created.name } };
    }

    case "mod.list": {
      const kind = typeof p.kind === "string" ? p.kind : null;
      const all = modStore.getSnapshot().mods;
      return { mods: kind ? all.filter((m) => m.kind === kind) : all };
    }

    case "mod.toggle": {
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id is required");
      const force = typeof p.enabled === "boolean" ? p.enabled : undefined;
      const res = modStore.toggleMod(id, force);
      if (!res) throw new Error(`Mod '${id}' not found`);
      return { mod: res };
    }

    case "mod.install": {
      const id = String(p.id ?? "").trim();
      const name = String(p.name ?? "").trim();
      const kind = String(p.kind ?? "css") as ModKind;
      if (!id || !name) throw new Error("id and name are required");
      const mod: OsMod = {
        id,
        name,
        author: String(p.author || "Agent OS API"),
        version: String(p.version || "1.0.0"),
        kind,
        scope: p.scope === "general" ? "general" : "specific",
        description: String(p.description || "Agent-installed OS mod"),
        tags: Array.isArray(p.tags) ? p.tags.map(String) : ["agent"],
        enabled: p.enabled !== false,
        css: typeof p.css === "string" ? p.css : undefined,
      };
      return { installed: modStore.upsertMod(mod) };
    }

    case "mod.uninstall": {
      const id = String(p.id ?? "").trim();
      return { id, removed: modStore.uninstallMod(id) };
    }

    case "mod.theme.set": {
      const patch: Partial<CustomThemeTokens> = {};
      if (typeof p.enabled === "boolean") (patch as Record<string, unknown>).enabled = p.enabled;
      else (patch as Record<string, unknown>).enabled = true;
      for (const k of [
        "name",
        "glassRgb",
        "elevatedRgb",
        "barRgb",
        "dockRgb",
        "borderColor",
        "activeBorderColor",
        "accentPrimary",
        "accentSecondary",
        "windowGlow",
        "fontSans",
        "fontMono",
        "fallbackBg",
      ] as const) {
        if (typeof p[k] === "string") (patch as Record<string, unknown>)[k] = p[k];
      }
      if (typeof p.blurPx === "number") (patch as Record<string, unknown>).blurPx = p.blurPx;
      if (typeof p.glassOpacity === "number") (patch as Record<string, unknown>).glassOpacity = p.glassOpacity;
      modStore.setTheme(patch);
      return { theme: modStore.getSnapshot().theme };
    }

    case "mod.decorator.set": {
      const patch: Record<string, unknown> = {};
      for (const k of [
        "style",
        "buttonPosition",
        "radiusPx",
        "borderWidthPx",
        "titlebarHeightPx",
        "titleAlign",
        "titlebarAccentBar",
        "showWorkspacePills",
        "showSnapButtons",
        "activeGlowPx",
        "unfocusedOpacity",
      ]) {
        if (p[k] !== undefined) patch[k] = p[k];
      }
      modStore.setDecorator(patch as Partial<DecoratorModConfig>);
      return { decorator: modStore.getSnapshot().decorator };
    }

    case "mod.shell.set": {
      const patch: Record<string, unknown> = {};
      for (const k of [
        "taskbarMode",
        "dockStyle",
        "dockRadiusPx",
        "dockAutoHide",
        "dockMagStrength",
        "dockIconScale",
        "dockReflection",
        "topBarStyle",
        "brandLabel",
        "showStockWidgets",
        "desktopIcons",
        "compizWobbly",
        "compizCube",
        "visionOrnaments",
        "springboardHome",
      ]) {
        if (p[k] !== undefined) patch[k] = p[k];
      }
      modStore.setShell(patch as Partial<ShellModConfig>);
      return { shell: modStore.getSnapshot().shell };
    }

    case "wm.grid": {
      const mode = (
        ["grid", "split-2", "master-stack", "columns-3", "cascade"].includes(String(p.mode))
          ? String(p.mode)
          : "grid"
      ) as GridLayoutMode;
      const arranged = wmStore.tileWorkspace(mode);
      return { mode, arranged };
    }

    case "mod.fx.set": {
      const patch: Record<string, unknown> = {};
      for (const k of [
        "openAnimation",
        "wobblyDrag",
        "genieMinimize",
        "burnClose",
        "hoverTilt3d",
        "dragGhostOpacity",
        "dimInactive",
        "chromaBorder",
      ]) {
        if (p[k] !== undefined) patch[k] = p[k];
      }
      modStore.setFx(patch as Partial<WindowFxConfig>);
      if (typeof p.wobblyDrag === "boolean") {
        modStore.setShell({ compizWobbly: p.wobblyDrag });
      }
      return { fx: modStore.getSnapshot().fx };
    }

    case "mod.configure": {
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id is required");
      if (typeof p.enabled === "boolean") modStore.toggleMod(id, p.enabled);
      const paramPatch =
        p.params && typeof p.params === "object"
          ? (p.params as Record<string, number | string>)
          : {};
      const updated = modStore.configureMod(id, paramPatch);
      if (!updated) throw new Error(`Mod '${id}' not found`);
      return { mod: updated };
    }

    case "mod.eyecandy.set": {
      modStore.setEyeCandy(p as Partial<EyeCandyConfig>);
      return { eyeCandy: modStore.getSnapshot().eyeCandy };
    }

    case "mod.backdrop.set": {
      if (p.id === null) {
        modStore.setBackdropImage(null);
        return { activeBackdropImageId: null };
      }
      if (typeof p.url === "string" && p.url.trim()) {
        modStore.setBackdropImage("custom", p.url.trim());
        return { activeBackdropImageId: "custom", customBackdropImageUrl: p.url.trim() };
      }
      const id = String(p.id ?? "").trim() || null;
      modStore.setBackdropImage(id);
      return { activeBackdropImageId: id };
    }

    case "mod.desktop3d.set": {
      const patch: Record<string, unknown> = {};
      for (const k of [
        "enabled",
        "layout",
        "scene",
        "hdriPreset",
        "hdriUrl",
        "hdriBackground",
        "shadowsEnabled",
        "doubleSidedWindows",
        "spatialChrome3d",
        "showControlsHud",
        "moveSpeed",
        "spatialWindows",
        "interactiveOrbit",
        "cameraSpeed",
        "bloomIntensity",
        "particleDensity",
        "mouseParallax",
      ]) {
        if (p[k] !== undefined) patch[k] = p[k];
      }
      modStore.setDesktop3d(patch as Partial<Desktop3dModConfig>);
      const next = modStore.getSnapshot().desktop3d;
      if (p.camera === "overview") {
        spatial3dBridge.dispatchCamera({ kind: "overview" });
      } else if (p.camera === "reset") {
        spatial3dBridge.dispatchCamera({ kind: "reset" });
      } else if (p.camera === "focus") {
        const activeId = wmStore.getSnapshot().activeWindowId;
        if (activeId) spatial3dBridge.dispatchCamera({ kind: "focus-window", windowId: activeId });
      }
      if (typeof p.enabled === "boolean") {
        wmStore.pushToast(
          next.enabled ? "Bureau Spatial 3D Activé" : "Bureau 2D Restauré",
          next.enabled ? `Layout 3D : ${next.layout} · Pièce : ${next.scene}` : "Retour au bureau 2D.",
          "info"
        );
      }
      return { desktop3d: next };
    }

    case "mod.shader.set": {
      if (p.id === null) {
        modStore.setActiveShaderMod(null);
        return { activeShaderModId: null };
      }
      if (typeof p.wgsl === "string" && p.wgsl.trim()) {
        const id = String(p.id || `shader-agent-${Date.now().toString(36).slice(-4)}`);
        const sh: CustomShaderMod = {
          id,
          name: String(p.name || "Agent WGSL Shader"),
          author: "Agent OS API",
          description: String(p.description || "Hot-compiled custom WGSL shader"),
          wgsl: p.wgsl,
          previewGradient: "linear-gradient(135deg,#0f172a,#7c3aed,#06b6d4)",
        };
        modStore.setDesktop3d({ enabled: false });
        modStore.upsertShader(sh, true);
        return { shader: sh, activeShaderModId: id };
      }
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id or wgsl is required");
      if (!modStore.getSnapshot().shaders.some((s) => s.id === id)) {
        throw new Error(`Shader '${id}' not found`);
      }
      modStore.setDesktop3d({ enabled: false });
      modStore.setActiveShaderMod(id);
      return { activeShaderModId: id };
    }

    case "mod.widget.upsert": {
      const id = String(p.id ?? "").trim();
      if (!id) throw new Error("id is required");
      const existing = modStore.getSnapshot().widgets.find((w) => w.id === id);
      const widget: CustomDesktopWidget = {
        id,
        title: String(p.title ?? existing?.title ?? "Agent Widget"),
        emoji: String(p.emoji ?? existing?.emoji ?? "✨"),
        description: String(p.description ?? existing?.description ?? "Custom desktop widget"),
        x: typeof p.x === "number" ? p.x : (existing?.x ?? 48),
        y: typeof p.y === "number" ? p.y : (existing?.y ?? 64),
        width: typeof p.width === "number" ? p.width : (existing?.width ?? 240),
        height: typeof p.height === "number" ? p.height : (existing?.height ?? 140),
        enabled: typeof p.enabled === "boolean" ? p.enabled : (existing?.enabled ?? true),
        transparent: typeof p.transparent === "boolean" ? p.transparent : (existing?.transparent ?? false),
        html: typeof p.html === "string" ? p.html : (existing?.html ?? "<body style='color:#fff;font-family:sans-serif;padding:12px'>Widget</body>"),
        builtin: existing?.builtin,
      };
      return { widget: modStore.upsertWidget(widget) };
    }

    case "mod.widget.remove": {
      const id = String(p.id ?? "").trim();
      return { id, removed: modStore.removeWidget(id) };
    }

    case "mod.css.set": {
      const css = String(p.css ?? "");
      if (typeof p.id === "string" && p.id.trim()) {
        const mod: OsMod = {
          id: p.id.trim(),
          name: String(p.name || p.id.trim()),
          author: "Agent OS API",
          version: "1.0.0",
          kind: "css",
          scope: "specific",
          description: "Agent-injected live CSS mod",
          tags: ["agent", "css"],
          enabled: p.enabled !== false,
          css,
        };
        return { mod: modStore.upsertMod(mod) };
      }
      modStore.setUserCss(css);
      return { userCssLength: css.length };
    }

    case "mod.signal.list": {
      const st = reactiveEngine.getSnapshot();
      return {
        engineEnabled: st.engineEnabled,
        signals: st.signals,
        customShaderUniforms: st.customShaderUniforms,
        sources: st.sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, outputPrefix: s.outputPrefix, lastError: s.lastError })),
        bindings: st.bindings.map((b) => ({ id: b.id, name: b.name, target: b.target, enabled: b.enabled, lastValue: b.lastValue })),
        scripts: st.scripts.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled, intervalMs: s.intervalMs, lastError: s.lastError })),
        surfaces: st.surfaces.map((s) => ({ id: s.id, name: s.name, contentType: s.contentType, slot: s.slot, enabled: s.enabled })),
      };
    }

    case "mod.signal.set": {
      if (p.signals && typeof p.signals === "object") {
        const clean: Record<string, SignalPrimitive> = {};
        for (const [k, v] of Object.entries(p.signals as Record<string, unknown>)) {
          if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
            clean[k] = v;
          }
        }
        reactiveEngine.pushSignals(clean, "agent-api");
        return { updated: Object.keys(clean) };
      }
      const key = String(p.key || "").trim();
      if (!key) throw new Error("Provide 'key' + 'value' or 'signals' object.");
      const val = p.value as SignalPrimitive;
      if (typeof val !== "number" && typeof val !== "string" && typeof val !== "boolean") {
        throw new Error("'value' must be a number, string, or boolean.");
      }
      reactiveEngine.pushSignal(key, val, {
        unit: typeof p.unit === "string" ? p.unit : undefined,
        label: typeof p.label === "string" ? p.label : undefined,
        sourceId: "agent-api",
      });
      return { key, value: val };
    }

    case "mod.source.upsert": {
      const id = String(p.id || `src-agent-${Date.now().toString(36).slice(-4)}`);
      const existing = reactiveEngine.getSnapshot().sources.find((s) => s.id === id);
      const next: ReactiveDataSource = {
        id,
        name: String(p.name ?? existing?.name ?? id),
        emoji: String(p.emoji ?? existing?.emoji ?? "⚡"),
        description: String(p.description ?? existing?.description ?? "Agent-managed data source"),
        kind: (p.kind as DataSourceKind) ?? existing?.kind ?? "shell",
        enabled: typeof p.enabled === "boolean" ? p.enabled : existing?.enabled ?? true,
        intervalMs: Math.max(500, Number(p.intervalMs ?? existing?.intervalMs ?? 5000)),
        outputPrefix: String(p.outputPrefix ?? existing?.outputPrefix ?? "custom"),
        code: String(p.code ?? existing?.code ?? ""),
        parser: typeof p.parser === "string" ? p.parser : existing?.parser,
      };
      return { source: reactiveEngine.upsertSource(next) };
    }

    case "mod.source.run": {
      const id = String(p.id || "");
      return await reactiveEngine.runSource(id);
    }

    case "mod.source.remove": {
      return { removed: reactiveEngine.removeSource(String(p.id || "")) };
    }

    case "mod.binding.upsert": {
      const id = String(p.id || `bind-agent-${Date.now().toString(36).slice(-4)}`);
      const existing = reactiveEngine.getSnapshot().bindings.find((b) => b.id === id);
      const next: ReactiveBinding = {
        id,
        name: String(p.name ?? existing?.name ?? id),
        description: String(p.description ?? existing?.description ?? "Agent-managed reactive binding"),
        enabled: typeof p.enabled === "boolean" ? p.enabled : existing?.enabled ?? true,
        target: (p.target as BindingTarget) ?? existing?.target ?? "theme.accentPrimary",
        cssVarName: typeof p.cssVarName === "string" ? p.cssVarName : existing?.cssVarName,
        expression: String(p.expression ?? existing?.expression ?? "0"),
      };
      return { binding: reactiveEngine.upsertBinding(next) };
    }

    case "mod.binding.remove": {
      return { removed: reactiveEngine.removeBinding(String(p.id || "")) };
    }

    case "mod.script.upsert": {
      const id = String(p.id || `script-agent-${Date.now().toString(36).slice(-4)}`);
      const existing = reactiveEngine.getSnapshot().scripts.find((s) => s.id === id);
      const next: ReactiveScriptMod = {
        id,
        name: String(p.name ?? existing?.name ?? id),
        emoji: String(p.emoji ?? existing?.emoji ?? "⚡"),
        description: String(p.description ?? existing?.description ?? "Agent-managed JS reactive script"),
        enabled: typeof p.enabled === "boolean" ? p.enabled : existing?.enabled ?? true,
        intervalMs: Math.max(250, Number(p.intervalMs ?? existing?.intervalMs ?? 1500)),
        code: String(p.code ?? existing?.code ?? ""),
      };
      return { script: reactiveEngine.upsertScript(next) };
    }

    case "mod.script.remove": {
      return { removed: reactiveEngine.removeScript(String(p.id || "")) };
    }

    case "mod.surface.upsert": {
      const id = String(p.id || `surf-agent-${Date.now().toString(36).slice(-4)}`);
      const existing = reactiveEngine.getSnapshot().surfaces.find((s) => s.id === id);
      const next: ReactiveSurface = {
        id,
        name: String(p.name ?? existing?.name ?? id),
        emoji: String(p.emoji ?? existing?.emoji ?? "🧩"),
        description: String(p.description ?? existing?.description ?? "Agent-injected visual surface"),
        enabled: typeof p.enabled === "boolean" ? p.enabled : existing?.enabled ?? true,
        contentType: (p.contentType as SurfaceContentType) ?? existing?.contentType ?? "html",
        slot: (p.slot as SurfaceSlot) ?? existing?.slot ?? "overlay",
        x: typeof p.x === "number" ? p.x : existing?.x,
        y: typeof p.y === "number" ? p.y : existing?.y,
        width: typeof p.width === "number" ? p.width : existing?.width,
        height: typeof p.height === "number" ? p.height : existing?.height,
        zIndex: typeof p.zIndex === "number" ? p.zIndex : existing?.zIndex,
        pointerEvents:
          p.pointerEvents === "none" || p.pointerEvents === "auto"
            ? p.pointerEvents
            : existing?.pointerEvents,
        html: typeof p.html === "string" ? p.html : existing?.html,
        iframeUrl: typeof p.iframeUrl === "string" ? p.iframeUrl : existing?.iframeUrl,
        script: typeof p.script === "string" ? p.script : existing?.script,
        canvasScript: typeof p.canvasScript === "string" ? p.canvasScript : existing?.canvasScript,
        pose3d:
          p.pose3d && typeof p.pose3d === "object"
            ? (p.pose3d as ReactiveSurface["pose3d"])
            : existing?.pose3d,
      };
      return { surface: reactiveEngine.upsertSurface(next) };
    }

    case "mod.surface.remove": {
      return { removed: reactiveEngine.removeSurface(String(p.id || "")) };
    }

    case "t3.status": {
      await t3CodeStore.refreshProbe();
      const s = t3CodeStore.getSnapshot();
      return {
        mode: s.mode,
        status: s.status,
        port: s.port,
        version: s.version,
        pid: s.pid,
        embedUrl: s.embedUrl,
        metrics: s.metrics,
      };
    }

    case "t3.start": {
      const cwd = typeof p.cwd === "string" && p.cwd.trim() ? p.cwd.trim() : undefined;
      const res = await t3CodeStore.startVmDaemon(cwd);
      if (p.openWindow !== false) wmStore.openApp("t3-code");
      return res;
    }

    case "t3.stop": {
      await t3CodeStore.stopVmDaemon();
      return { stopped: true };
    }

    case "t3.project.add": {
      const dir = String(p.dir || wmStore.getSnapshot().activeWorkspaceDir);
      return await t3CodeStore.addProject(dir);
    }

    case "mod.reset": {
      modStore.resetAll();
      reactiveEngine.resetAll();
      wmStore.pushToast("OS Mods Reset", "All mods & reactive bindings restored to unkernelOS Stock.", "info");
      return { reset: true };
    }

    default:
      throw new Error(`Unknown OS API method '${method}'. Run 'osctl schema' to list all methods.`);
  }
}

async function readAllStdin(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Built-in Model Context Protocol (MCP) JSON-RPC 2.0 stdio server running directly inside `osctl mcp`!
 * Lets Claude Code, Pi Agent, or any MCP client discover and invoke every host WebOS capability natively.
 */
async function runMcpStdioServer(ctx: HostCommandContext): Promise<number> {
  const reader = ctx.stdin.getReader();
  const writer = ctx.stdout.getWriter();
  const decoder = new TextDecoder();
  let buffer = "";

  const send = async (msg: Record<string, unknown>) => {
    await writer.write(`${JSON.stringify(msg)}\n`);
  };

  const handleMessage = async (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    let req: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (req.id === undefined) return; // JSON-RPC notification

    if (req.method === "initialize") {
      await send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "unkernelos", version: "1.0.0" },
        },
      });
      return;
    }

    if (req.method === "tools/list") {
      await send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: AGENT_OS_SCHEMA.map((m) => ({
            name: m.method.replace(/\./g, "_"),
            description: `[unkernelOS Host API: ${m.method}] ${m.summary}`,
            inputSchema: m.paramsSchema,
          })),
        },
      });
      return;
    }

    if (req.method === "tools/call") {
      const toolName = String(req.params?.name ?? "");
      const args =
        req.params?.arguments && typeof req.params.arguments === "object"
          ? (req.params.arguments as Record<string, unknown>)
          : {};
      const matched = AGENT_OS_SCHEMA.find(
        (m) => m.method === toolName || m.method.replace(/\./g, "_") === toolName
      );
      const methodName = matched?.method ?? toolName.replace(/_/g, ".");
      try {
        const result = await executeOsAction(methodName, args, {
          source: "mcp",
          callerPid: ctx.pid,
          callerCwd: ctx.cwd,
        });
        await send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        await send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            isError: true,
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          },
        });
      }
      return;
    }

    await send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    });
  };

  try {
    while (!ctx.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        await handleMessage(line);
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) await handleMessage(buffer);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
  return 0;
}

const OSCTL_HELP = `unkernelOS Full Agent OS CLI (osctl) — Direct Guest <-> Host WebOS Bridge

Usage:
  osctl info                                   Full live OS/VM/GPU/workspace JSON state
  osctl schema                                 Machine-readable JSON schema of all 42+ OS API methods
  osctl call <method> [json]                   Call any OS API method (reads JSON from stdin if omitted)
  osctl mcp                                    Start MCP JSON-RPC 2.0 stdio server exposing all OS tools

Ergonomic Shortcuts:
  osctl apps                                   List all WebOS apps
  osctl windows                                List all open windows & geometry
  osctl open <appId> [jsonProps]               Open/focus any WebOS app (ide, preview, explorer, git, ...)
  osctl close <windowId|appId>                 Close a window or app
  osctl tile <layout>                          split-2 | grid-4 | focus-ide-preview | focus-studio-terminal | minimize-all
  osctl workspace [dir]                        Get or set global active OS working directory
  osctl edit <filePath>                        Open a Linux file directly in Code IDE
  osctl preview <port> [path]                  Open Web Preview for a running guest server
  osctl notify <title> <msg> [level]           Show native OS notification (info|success|warn|error)
  osctl theme <osTheme> [shader]               Switch OS theme & live WebGPU WGSL shader
  osctl download <guestFilePath>               Download a file to the user's host computer
  osctl clip-get / osctl clip-set [text]       Read/write host OS clipboard (also: pbcopy / pbpaste)
  osctl ask <question> [default]               Prompt human user on host UI and return answer
  osctl confirm <question>                     Ask human user Yes/No confirmation
  osctl speak <text>                           Speak aloud via host Web Speech API
  osctl url <https://...>                      Open external URL in host browser
  osctl deploy-pages [dir] [repoName]          1-click deploy project to GitHub Pages

Additional host commands in PATH: pbcopy, pbpaste, os-open, os-notify, os-download
`;

async function handleOsctl(ctx: HostCommandContext): Promise<string | number> {
  const [sub = "help", ...rest] = ctx.args;
  const meta = { source: "guest-cli" as const, callerPid: ctx.pid, callerCwd: ctx.cwd };

  if (sub === "help" || sub === "--help" || sub === "-h") {
    return OSCTL_HELP;
  }
  if (sub === "schema") {
    return `${JSON.stringify(AGENT_OS_SCHEMA, null, 2)}\n`;
  }
  if (sub === "mcp") {
    return await runMcpStdioServer(ctx);
  }

  let method = "";
  let params: Record<string, unknown> = {};

  if (sub === "call") {
    method = rest[0] ?? "";
    if (!method) throw new Error("Usage: osctl call <method> [json]");
    const rawJson = rest.slice(1).join(" ").trim() || (!ctx.isTTY.stdin ? (await readAllStdin(ctx.stdin)).trim() : "");
    if (rawJson) {
      params = JSON.parse(rawJson) as Record<string, unknown>;
    }
  } else if (sub === "info") {
    method = "system.info";
  } else if (sub === "apps") {
    method = "wm.apps";
  } else if (sub === "windows") {
    method = "wm.windows";
  } else if (sub === "open") {
    method = "wm.open";
    params = { appId: rest[0], props: rest[1] ? JSON.parse(rest[1]) : undefined };
  } else if (sub === "close") {
    method = "wm.close";
    const target = rest[0] ?? "";
    params = target in APP_CATALOG ? { appId: target } : { windowId: target };
  } else if (sub === "tile") {
    method = "wm.tile";
    params = { layout: rest[0] || "split-2" };
  } else if (sub === "workspace") {
    if (rest[0]) {
      method = "workspace.set";
      params = { dir: rest[0] };
    } else {
      method = "workspace.get";
    }
  } else if (sub === "edit") {
    method = "workspace.openFile";
    const p = rest[0] ?? "";
    params = { path: p.startsWith("/") ? p : `${ctx.cwd}/${p}`.replace(/\/+/g, "/") };
  } else if (sub === "preview") {
    method = "preview.open";
    params = { port: Number(rest[0] || 3000), path: rest[1] || "/" };
  } else if (sub === "notify") {
    method = "system.notify";
    params = { title: rest[0] || "Agent", message: rest[1] || "", level: rest[2] || "info" };
  } else if (sub === "theme") {
    method = "theme.set";
    params = { osTheme: rest[0], wallpaperShader: rest[1] };
  } else if (sub === "download") {
    method = "browser.download";
    const p = rest[0] ?? "";
    params = { path: p.startsWith("/") ? p : `${ctx.cwd}/${p}`.replace(/\/+/g, "/") };
  } else if (sub === "clip-get") {
    method = "system.clipboard.read";
  } else if (sub === "clip-set") {
    method = "system.clipboard.write";
    const txt = rest.length > 0 ? rest.join(" ") : await readAllStdin(ctx.stdin);
    params = { text: txt };
  } else if (sub === "ask") {
    method = "browser.prompt";
    params = { question: rest[0] || "Input:", defaultValue: rest[1] || "" };
  } else if (sub === "confirm") {
    method = "browser.confirm";
    params = { question: rest.join(" ") || "Confirm?" };
  } else if (sub === "speak") {
    method = "system.speak";
    params = { text: rest.join(" ") };
  } else if (sub === "url") {
    method = "system.openUrl";
    params = { url: rest[0] };
  } else if (sub === "deploy-pages") {
    method = "github.deployPages";
    params = { dir: rest[0] || ctx.cwd, repoName: rest[1] };
  } else if (sub.includes(".")) {
    // Allow shorthand `osctl wm.open '{"appId":"ide"}'`
    method = sub;
    const rawJson = rest.join(" ").trim() || (!ctx.isTTY.stdin ? (await readAllStdin(ctx.stdin)).trim() : "");
    if (rawJson) params = JSON.parse(rawJson) as Record<string, unknown>;
  } else {
    throw new Error(`Unknown osctl subcommand '${sub}'. Run 'osctl help'.`);
  }

  const res = await executeOsAction(method, params, meta);
  return `${JSON.stringify(res, null, 2)}\n`;
}

export const AGENT_DOCS_MARKDOWN = `<!-- UNKERNELOS_AGENT_DOCS_START -->
# unkernelOS — Full Agent-Native & Moddable OS API

You are running inside **unkernelOS**, a full Agent-Native, 100% Moddable WebGPU Linux OS.
Beyond standard Linux commands, you have **direct, zero-latency programmatic control** over the entire host OS, window manager, 3D Spatial Desktop, Reactive Data Modding Engine, Injectable HTML/Iframe/Canvas Surfaces, WebGPU Shaders, Code IDE, File Explorer, Web Preview, Wayland/3D GL windows, host clipboard, downloads, notifications, speech, human prompts, and 1-click GitHub Pages deployment via \`osctl\` (and MCP server \`osctl mcp\`).

## Installed Agent Skills (read before advanced OS work)
Discover descriptions: \`osctl call skills.list '{"query":"desktop"}'\`. Load one skill only when relevant: \`osctl call skills.read '{"id":"builtin:unkernelos-os-control"}'\`. External Mac agents can use \`unkernelos-companion skills list\`, \`skills search <query>\`, \`skills read <id-or-name>\`. These discover OS and guest skills, never Mac skill directories.
- \`~/.claude/skills/unkernelos-modding/SKILL.md\` (also in \`~/.pi/agent/skills/\` & \`~/.agents/skills/\`) — Themes, 16 OS variants, 14 decorators, Window FX, Eye-Candy, 3D WebGPU worlds & 4K HDRI, widgets & CSS mods.
- \`~/.claude/skills/unkernelos-reactive-mods/SKILL.md\` — Real-time reactive signals, \`sh\`/\`python3\`/\`bun\`/\`node\`/\`http\`/\`js\` data sources, visual bindings, unrestricted JS controllers, 20-float WGSL live uniforms, and injectable HTML/Iframe/Canvas surfaces on 7 OS slots (\`wallpaper\`, \`desktop\`, \`overlay\`, \`topbar\`, \`dock\`, \`titlebar\`, \`3d-panel\`).
- \`~/.claude/skills/unkernelos-os-control/SKILL.md\` — Window management, 2D/3D grids, workspaces, IDE, live preview, Wayland/VirGL, clipboard & GitHub Pages deploy.

## Essential Commands
- \`osctl schema\` — Print full JSON schema of all 60+ OS API methods.
- \`osctl info\` — Inspect live OS state (vCPUs, RAM, WebGPU, active workspace, detected listening ports).
- \`osctl call <method> '<json>'\` — Invoke any OS API method and receive JSON on stdout.
- \`osctl preview <port> [path]\` — Open the live Web Preview window for a server you just started.
- \`osctl edit <filePath>\` — Open any file directly inside Code IDE for the user.
- Apps unkernelOS : installer un HTML avec \`osctl call app.install '{"id":"my-app","title":"Mon app","guestPath":"/tmp/app.html","open":true}'\`. Bun, Node, Rust ou tout langage peut produire ce frontend HTML/JS (ou WASM). Le bridge est injecté automatiquement.
- Dans le frontend, \`const app = unkernelOS.app.define({title, document, getState:()=>state, getDock:()=>({label:"Lire",glyph:"play",primaryAction:"play"}), actions:{play:{label:"Lire",paramsSchema:{type:"object"},run:async args=>{/* même commande que le bouton */}}}})\`. Tous les boutons de l’app doivent appeler \`app.invoke(name,args)\` ; chaque fonctionnalité doit avoir une action. Appeler \`app.publish()\` après les changements externes (réseau, timers, backend). Publier uniquement l’état utile, jamais des tokens.
- Le contexte et toutes les actions sont partagés par défaut. Découvrir avec \`horizon.sessions\`, lire \`horizon.session.read {windowId}\`, agir via \`horizon.session.action {windowId,action,expectedRevision,requestId,args}\`. Relire la révision avant d’agir. Une session peut être rendue privée depuis son tiroir. Les iframes externes et clients Wayland sans bridge ne publient pas automatiquement leur état interne.
- \`osctl workspace [dir]\` — Get or set the global active working directory across all OS apps.
- \`osctl open <appId>\` / \`osctl tile focus-ide-preview\` — Open and arrange desktop windows automatically.
- \`osctl notify "<title>" "<message>" [info|success|warn|error]\` — Send a native OS notification.
- \`osctl download <filePath>\` (or \`os-download <file>\`) — Save a file to the user's host Downloads folder.
- \`pbcopy\` / \`pbpaste\` — Pipe directly to/from the user's host clipboard.
- \`os-open <file|dir|:port|https://url>\` — Smart-open anything in the appropriate WebOS app or host browser.
- \`osctl ask "<question>"\` / \`osctl confirm "<question>"\` — Ask the human user interactively on the host UI.
- \`osctl deploy-pages [dir] [repoName]\` — 1-click commit, push & publish to GitHub Pages.
- \`osctl theme <obsidian-aurora|liquid-glass|cyberpunk-neon|nordic-frost|warm-amber> [aurora|liquid-prism|cyber-grid|nordic-borealis|solar-ember]\` — Change live OS theme & WebGPU shader.

## Quick Modding & Reactive Engine Commands
- \`osctl call mod.status\` / \`osctl call mod.signal.list\` — Inspect full mod state & all live real-time signals.
- \`osctl call mod.signal.set '{"key":"custom.energy","value":0.9}'\` — Push real-time values into WGSL shaders, CSS \`--sig-*\`, bindings & surfaces.
- \`osctl call mod.source.upsert '{"id":"src-git","kind":"shell","enabled":true,"intervalMs":8000,"outputPrefix":"git","code":"..."}'\` — Run \`sh\`/\`python3\`/\`bun\`/\`node\`/\`http\`/\`js\` data providers live.
- \`osctl call mod.binding.upsert '{"id":"bind-cpu","target":"theme.accentPrimary","expression":"lerpColor(\\"#22d3ee\\",\\"#f43f5e\\",clamp(sig(\\"sys.cpu\\")/100,0,1))"}'\` — Bind live signals to any OS property or WGSL \`shader.custom0..3\`.
- \`osctl call mod.script.upsert '{"id":"script-live","enabled":true,"intervalMs":1500,"code":"..."}'\` — Install unrestricted JS controller (\`signals\`, \`os.modStore\`, \`os.wmStore\`, \`os.execShell\`, \`document\`).
- \`osctl call mod.surface.upsert '{"id":"surf-hud","contentType":"html|iframe|canvas","slot":"wallpaper|desktop|overlay|topbar|dock|titlebar|3d-panel","enabled":true,"html":"..."}'\` — Inject live HTML/Iframe/Canvas anywhere in the OS (including 3D space!).
- \`osctl call mod.desktop3d.set '{"enabled":true,"scene":"earth-orbit","layout":"curved-cockpit","spatialChrome3d":true}'\` — Control the 3D WebGPU Spatial Desktop.
<!-- UNKERNELOS_AGENT_DOCS_END -->
`;

/**
 * Write AGENT_OS_API.md, update ~/CLAUDE.md & ~/AGENTS.md non-destructively with versioned markers,
 * install up-to-date unkernelOS Agent Skills into ~/.claude/skills, ~/.pi/agent/skills & ~/.agents/skills,
 * and register `unkernelos` MCP server (`osctl mcp`) in ~/.claude.json!
 */
export async function syncAgentOsDocsToGuest(): Promise<void> {
  const script = `
mkdir -p "$HOME/.unkernelos"
cat <<'AGENT_API_DOC_EOF' > "$HOME/.unkernelos/AGENT_OS_API.md"
${AGENT_DOCS_MARKDOWN}AGENT_API_DOC_EOF

# Install/refresh Agent Skills for Claude Code, Pi, Codex & Antigravity
for base in "$HOME/.claude/skills" "$HOME/.pi/agent/skills" "$HOME/.agents/skills"; do
  mkdir -p "$base/unkernelos-modding" "$base/unkernelos-reactive-mods" "$base/unkernelos-os-control"
  cat <<'SKILL_MOD_EOF' > "$base/unkernelos-modding/SKILL.md"
${SKILL_MODDING_MD}SKILL_MOD_EOF
  cat <<'SKILL_REACT_EOF' > "$base/unkernelos-reactive-mods/SKILL.md"
${SKILL_REACTIVE_MD}SKILL_REACT_EOF
  cat <<'SKILL_CTRL_EOF' > "$base/unkernelos-os-control/SKILL.md"
${SKILL_OS_CONTROL_MD}SKILL_CTRL_EOF
done

# Update ~/CLAUDE.md and ~/AGENTS.md cleanly (replaces old unkernelOS block if present, keeps user content)
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const home = process.env.HOME;
    const doc = fs.readFileSync(home + "/.unkernelos/AGENT_OS_API.md", "utf8").trim();
    const startTag = "<!-- UNKERNELOS_AGENT_DOCS_START -->";
    const endTag = "<!-- UNKERNELOS_AGENT_DOCS_END -->";
    for (const file of [home + "/CLAUDE.md", home + "/AGENTS.md"]) {
      let cur = "";
      try { cur = fs.readFileSync(file, "utf8"); } catch {}
      if (cur.includes(startTag) && cur.includes(endTag)) {
        const next = cur.replace(new RegExp(startTag + "[\\\\s\\\\S]*?" + endTag), doc);
        fs.writeFileSync(file, next);
      } else if (cur.includes("# unkernelOS — Full Agent-Native OS API")) {
        const idx = cur.indexOf("# unkernelOS — Full Agent-Native OS API");
        fs.writeFileSync(file, cur.slice(0, idx).trimEnd() + (idx > 0 ? "\\n\\n" : "") + doc + "\\n");
      } else {
        fs.writeFileSync(file, (cur.trimEnd() ? cur.trimEnd() + "\\n\\n" : "") + doc + "\\n");
      }
    }
    const cfgPath = home + "/.claude.json";
    let data = {};
    try { data = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch {}
    data.mcpServers = data.mcpServers || {};
    if (!data.mcpServers.unkernelos) {
      data.mcpServers.unkernelos = { command: "osctl", args: ["mcp"] };
      fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2));
    }
  ' 2>/dev/null || true
else
  for md in "$HOME/CLAUDE.md" "$HOME/AGENTS.md"; do
    touch "$md"
    if ! grep -q "UNKERNELOS_AGENT_DOCS_START" "$md" 2>/dev/null; then
      printf '\\n%s\\n' "$(cat "$HOME/.unkernelos/AGENT_OS_API.md")" >> "$md"
    fi
  done
fi
`.trim();

  await appRuntime.runPromise(
    Effect.flatMap(VmService, (vm) => vm.execShell(script)).pipe(Effect.ignore)
  );
}

/**
 * Register all native unkernel host commands (`kwcmd` vsock:1020) and `window.unkernelOS`.
 */
export async function attachAgentOsBridge(vm: KernelHandle): Promise<string[]> {
  const registered: string[] = [];

  const commands: Record<string, (ctx: HostCommandContext) => Promise<string | number>> = {
    osctl: handleOsctl,

    pbcopy: async (ctx) => {
      const text = ctx.args.length > 0 ? ctx.args.join(" ") : await readAllStdin(ctx.stdin);
      await executeOsAction(
        "system.clipboard.write",
        { text },
        { source: "guest-cli", callerPid: ctx.pid, callerCwd: ctx.cwd }
      );
      return 0;
    },

    pbpaste: async (ctx) => {
      const res = (await executeOsAction(
        "system.clipboard.read",
        {},
        { source: "guest-cli", callerPid: ctx.pid, callerCwd: ctx.cwd }
      )) as { text: string };
      return res.text ?? "";
    },

    "os-notify": async (ctx) => {
      const [title = "unkernelOS", message = "", level = "info"] = ctx.args;
      await executeOsAction(
        "system.notify",
        { title, message, level },
        { source: "guest-cli", callerPid: ctx.pid, callerCwd: ctx.cwd }
      );
      return 0;
    },

    "os-download": async (ctx) => {
      const raw = ctx.args[0];
      if (!raw) throw new Error("Usage: os-download <filePath>");
      const path = raw.startsWith("/") ? raw : `${ctx.cwd}/${raw}`.replace(/\/+/g, "/");
      const res = await executeOsAction(
        "browser.download",
        { path },
        { source: "guest-cli", callerPid: ctx.pid, callerCwd: ctx.cwd }
      );
      return `${JSON.stringify(res)}\n`;
    },

    "os-open": async (ctx) => {
      const target = (ctx.args[0] ?? ctx.cwd).trim();
      const meta = { source: "guest-cli" as const, callerPid: ctx.pid, callerCwd: ctx.cwd };
      if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)(\/.*)?$/i.test(target)) {
        const m = /^https?:\/\/[^:]+:(\d+)(\/.*)?$/i.exec(target)!;
        await executeOsAction("preview.open", { port: Number(m[1]), path: m[2] || "/" }, meta);
        return 0;
      }
      if (/^:\d+/.test(target)) {
        const [pPart, ...rest] = target.slice(1).split("/");
        await executeOsAction("preview.open", { port: Number(pPart), path: `/${rest.join("/")}` }, meta);
        return 0;
      }
      if (/^https?:\/\//i.test(target)) {
        await executeOsAction("system.openUrl", { url: target }, meta);
        return 0;
      }
      const abs = target.startsWith("/") ? target : `${ctx.cwd}/${target}`.replace(/\/+/g, "/");
      // Check if directory or file
      const isDirRes = await appRuntime.runPromise(
        Effect.either(Effect.flatMap(VmService, (v) => v.execShell(`[ -d '${abs.replace(/'/g, `'\\''`)}' ] && echo DIR || echo FILE`)))
      );
      if (isDirRes._tag === "Right" && isDirRes.right.stdout.trim() === "DIR") {
        await executeOsAction("workspace.openDir", { dir: abs, app: "explorer" }, meta);
      } else {
        await executeOsAction("workspace.openFile", { path: abs }, meta);
      }
      return 0;
    },
  };

  for (const [name, handler] of Object.entries(commands)) {
    try {
      await vm.addCommand(name, handler);
      registered.push(name);
    } catch (err) {
      console.warn(`[unkernelOS] Failed to register host command '${name}':`, err);
    }
  }

  agentApiStore.setBridgeState(registered.length > 0, registered);

  // Expose host browser JS API on window.unkernelOS
  (window as unknown as Record<string, unknown>).unkernelOS = {
    call: (method: string, params: Record<string, unknown> = {}) =>
      executeOsAction(method, params, { source: "window-api" }),
    schema: () => AGENT_OS_SCHEMA,
    methods: () => AGENT_OS_SCHEMA.map((m) => m.method),
    history: () => agentApiStore.getSnapshot().logs,
  };

  // Auto-inject CLAUDE.md, AGENTS.md & MCP config inside Linux
  void syncAgentOsDocsToGuest();

  return registered;
}

export function detachAgentOsBridge(): void {
  agentApiStore.setBridgeState(false, []);
}
