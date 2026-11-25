import { Effect } from "effect";
import { Loader2, X } from "lucide-react";
import React, { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { attachAgentOsBridge, detachAgentOsBridge } from "../core/agent-os-api.ts";
import { clipboardStore } from "../core/clipboard-store.ts";
import { modStore, ULTRA_HD_BACKDROPS, useMods } from "../core/mod-store.ts";
import { applyOsThemeToDocument } from "../core/os-themes.ts";
import { reactiveEngine } from "../core/reactive-mod-engine.ts";
import { t3CodeStore } from "../core/t3code-store.ts";
import {
  appRuntime,
  GithubAuthService,
  GuestFsService,
  SettingsService,
  useOsEvents,
  useSubscriptionRef,
  VmService,
} from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { uiSounds } from "../core/ui-sounds.ts";
import { waylandDesktopManager } from "../core/wayland-host.ts";
import { workflowsStore } from "../core/workflows-store.ts";
import { WebGpuBackdrop } from "../gpu/webgpu-backdrop.ts";
import { spatial3dBridge } from "../gpu/spatial-3d-bridge.ts";
import { APP_CATALOG, useWm, wmStore, type AppId, type WindowInstance, type WorkspaceId } from "../wm/wm-store.ts";
import { AppLauncherOverlay } from "./AppLauncherOverlay.tsx";
import { BootOverlay } from "./BootOverlay.tsx";
import { ClipboardOverlay } from "./ClipboardOverlay.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { ControlCenter } from "./ControlCenter.tsx";
import { DesktopWidgets } from "./DesktopWidgets.tsx";
import { Dock } from "./Dock.tsx";
import { GithubConnectModal } from "./GithubConnectModal.tsx";
import { LockScreen } from "./LockScreen.tsx";
import { MissionControlOverlay } from "./MissionControlOverlay.tsx";
import { MobileNavBar } from "./MobileNavBar.tsx";
import { NotificationCenter } from "./NotificationCenter.tsx";
import { OsEyeCandyLayer } from "./OsEyeCandyLayer.tsx";
import { Reactive3dPanels, ReactiveSurfaceSlot } from "./ReactiveSurfaceHost.tsx";
import { ShellTaskbarAndMenu } from "./ShellTaskbarAndMenu.tsx";
import { SnapPreviewOverlay } from "./SnapPreviewOverlay.tsx";
import { TopBar } from "./TopBar.tsx";
import { VoiceOrbOverlay } from "./VoiceOrbOverlay.tsx";
import { WindowErrorBoundary } from "./WindowErrorBoundary.tsx";
import { WindowFrame } from "./WindowFrame.tsx";
import { WindowSwitcherHud } from "./WindowSwitcherHud.tsx";
import type { SettingsTab } from "./apps/SettingsApp.tsx";

// Code-split all 23+ WebOS apps via React.lazy for ultra-fast initial boot & PWA load!
const AgentApiApp = lazy(() => import("./apps/AgentApiApp.tsx").then((m) => ({ default: m.AgentApiApp })));
const AgentStudioApp = lazy(() => import("./apps/AgentStudioApp.tsx").then((m) => ({ default: m.AgentStudioApp })));
const AgentSwarmApp = lazy(() => import("./apps/AgentSwarmApp.tsx").then((m) => ({ default: m.AgentSwarmApp })));
const ApiClientApp = lazy(() => import("./apps/ApiClientApp.tsx").then((m) => ({ default: m.ApiClientApp })));
const AutomationsApp = lazy(() => import("./apps/AutomationsApp.tsx").then((m) => ({ default: m.AutomationsApp })));
const CodeIdeApp = lazy(() => import("./apps/CodeIdeApp.tsx").then((m) => ({ default: m.CodeIdeApp })));
const DatabaseStudioApp = lazy(() => import("./apps/DatabaseStudioApp.tsx").then((m) => ({ default: m.DatabaseStudioApp })));
const DevUtilitiesApp = lazy(() => import("./apps/DevUtilitiesApp.tsx").then((m) => ({ default: m.DevUtilitiesApp })));
const DynamicAppHost = lazy(() => import("./apps/DynamicAppHost.tsx").then((m) => ({ default: m.DynamicAppHost })));
const FileExplorerApp = lazy(() => import("./apps/FileExplorerApp.tsx").then((m) => ({ default: m.FileExplorerApp })));
const GitApp = lazy(() => import("./apps/GitApp.tsx").then((m) => ({ default: m.GitApp })));
const GlViewportWindow = lazy(() => import("./apps/GlViewportWindow.tsx").then((m) => ({ default: m.GlViewportWindow })));
const KittyTerminalApp = lazy(() => import("./apps/KittyTerminalApp.tsx").then((m) => ({ default: m.KittyTerminalApp })));
const MediaStudioApp = lazy(() => import("./apps/MediaStudioApp.tsx").then((m) => ({ default: m.MediaStudioApp })));
const ModStudioApp = lazy(() => import("./apps/ModStudioApp.tsx").then((m) => ({ default: m.ModStudioApp })));
const ThreeDesktop3d = lazy(() => import("../gpu/ThreeDesktop3d.tsx").then((m) => ({ default: m.ThreeDesktop3d })));
const ProofStudioApp = lazy(() => import("./apps/ProofStudioApp.tsx").then((m) => ({ default: m.ProofStudioApp })));
const MicromlExplorerApp = lazy(() => import("./apps/MicromlExplorerApp.tsx").then((m) => ({ default: m.MicromlExplorerApp })));
const NetworkInspectorApp = lazy(() => import("./apps/NetworkInspectorApp.tsx").then((m) => ({ default: m.NetworkInspectorApp })));
const NotebookApp = lazy(() => import("./apps/NotebookApp.tsx").then((m) => ({ default: m.NotebookApp })));
const NotesStudioApp = lazy(() => import("./apps/NotesStudioApp.tsx").then((m) => ({ default: m.NotesStudioApp })));
const PreviewBrowserApp = lazy(() => import("./apps/PreviewBrowserApp.tsx").then((m) => ({ default: m.PreviewBrowserApp })));
const ProcessManagerApp = lazy(() => import("./apps/ProcessManagerApp.tsx").then((m) => ({ default: m.ProcessManagerApp })));
const RuneLiquidSettingsApp = lazy(() => import("./apps/RuneLiquidSettingsApp.tsx").then((m) => ({ default: m.RuneLiquidSettingsApp })));
const ScreenDisplayApp = lazy(() => import("./apps/ScreenDisplayApp.tsx").then((m) => ({ default: m.ScreenDisplayApp })));
const ServiceRunnerApp = lazy(() => import("./apps/ServiceRunnerApp.tsx").then((m) => ({ default: m.ServiceRunnerApp })));
const SettingsApp = lazy(() => import("./apps/SettingsApp.tsx").then((m) => ({ default: m.SettingsApp })));
const ShaderSynthApp = lazy(() => import("./apps/ShaderSynthApp.tsx").then((m) => ({ default: m.ShaderSynthApp })));
const StoreApp = lazy(() => import("./apps/StoreApp.tsx").then((m) => ({ default: m.StoreApp })));
const SystemMonitorApp = lazy(() => import("./apps/SystemMonitorApp.tsx").then((m) => ({ default: m.SystemMonitorApp })));
const T3CodeApp = lazy(() => import("./apps/T3CodeApp.tsx").then((m) => ({ default: m.T3CodeApp })));
const ToolchainInstallerApp = lazy(() => import("./apps/ToolchainInstallerApp.tsx").then((m) => ({ default: m.ToolchainInstallerApp })));
const WaylandSurfaceWindow = lazy(() => import("./apps/WaylandSurfaceWindow.tsx").then((m) => ({ default: m.WaylandSurfaceWindow })));
const WhiteboardApp = lazy(() => import("./apps/WhiteboardApp.tsx").then((m) => ({ default: m.WhiteboardApp })));

const AppLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center w-full h-full bg-[#090b12]/90 text-xs text-zinc-400 gap-2">
    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
    <span>Loading app...</span>
  </div>
);

const LiveClock: React.FC = () => {
  const [time, setTime] = React.useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="font-mono text-xs text-zinc-200 pl-1 tabular-nums">{time}</span>;
};

const renderWindowApp = (win: WindowInstance, focused: boolean, visible: boolean): React.ReactNode => {
  switch (win.appId) {
    case "t3-code":
      return <T3CodeApp />;
    case "agent-studio":
      return <AgentStudioApp windowFocused={focused} />;
    case "agent-swarm":
      return <AgentSwarmApp windowFocused={focused} />;
    case "agent-api":
      return <AgentApiApp />;
    case "ide":
      return <CodeIdeApp windowFocused={focused} />;
    case "notebook":
      return <NotebookApp />;
    case "microml":
      return <MicromlExplorerApp />;
    case "proof-studio":
      return <ProofStudioApp />;
    case "terminal":
      return <KittyTerminalApp windowFocused={focused} />;
    case "explorer":
      return <FileExplorerApp />;
    case "api-client":
      return <ApiClientApp />;
    case "network-inspector":
      return <NetworkInspectorApp />;
    case "database":
      return <DatabaseStudioApp />;
    case "services":
      return <ServiceRunnerApp />;
    case "app-store":
      return <StoreApp />;
    case "automations":
      return <AutomationsApp />;
    case "custom-app":
      return <DynamicAppHost dynamicAppId={String(win.props?.dynamicAppId || "")} />;
    case "notes":
      return <NotesStudioApp />;
    case "whiteboard":
      return <WhiteboardApp />;
    case "media-studio":
      return <MediaStudioApp />;
    case "dev-utils":
      return <DevUtilitiesApp />;
    case "processes":
      return <ProcessManagerApp />;
    case "shader-synth":
      return <ShaderSynthApp />;
    case "preview":
      return <PreviewBrowserApp />;
    case "screen":
      return <ScreenDisplayApp windowFocused={focused} />;
    case "gl-window":
      return <GlViewportWindow windowFocused={focused} />;
    case "wayland-surface":
      return (
        <WaylandSurfaceWindow
          surfaceKey={String(win.props?.surfaceKey || "")}
          windowFocused={focused}
          visible={visible && !win.minimized}
        />
      );
    case "git":
      return <GitApp />;
    case "toolchain":
      return <ToolchainInstallerApp />;
    case "monitor":
      return <SystemMonitorApp />;
    case "mod-studio":
      return <ModStudioApp />;
    case "rune-settings":
      return <RuneLiquidSettingsApp />;
    case "settings":
      return <SettingsApp initialTab={win.props?.tab as SettingsTab | undefined} />;
  }
};

export const Desktop: React.FC = () => {
  const wm = useWm();
  const mods = useMods();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const vmState = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "",
      bootProgress: 0,
      error: null,
      support: null,
      crossOriginIsolated: false,
      webgpuAvailable: false,
      distro: "debian",
      cpus: 1,
      memoryMiB: 2048,
      transport: "inline",
      stats: null,
      glStatus: null,
      displayMode: null,
      inputState: { keyboard: false, mouse: false, tablet: false },
      detectedPorts: [],
      kernelLogs: [],
      hasSnapshot: false,
      audioMuted: false,
      wispActiveUrl: "",
    }
  );

  const wallpaperRef = useRef<HTMLCanvasElement>(null);
  const backdropInstanceRef = useRef<WebGpuBackdrop | null>(null);
  const waylandRootRef = useRef<HTMLDivElement>(null);
  const glAutoOpenedRef = useRef(false);
  const prevWsRef = useRef(wm.activeWorkspace);
  const [cubeFlip, setCubeFlip] = React.useState<-1 | 0 | 1>(0);

  // Trigger genuine Compiz/Beryl 3D Cube workspace spin transition when switching Desktop 1..4
  useEffect(() => {
    if (prevWsRef.current !== wm.activeWorkspace) {
      const dir: -1 | 1 = wm.activeWorkspace > prevWsRef.current ? 1 : -1;
      prevWsRef.current = wm.activeWorkspace;
      if (mods.shell.compizCube) {
        setCubeFlip(dir);
        const timer = window.setTimeout(() => setCubeFlip(0), 340);
        return () => window.clearTimeout(timer);
      }
    }
  }, [wm.activeWorkspace, mods.shell.compizCube]);

  // Start the Reactive Data & Modding Engine + T3 Code live metrics bridge
  useEffect(() => {
    reactiveEngine.start();
    t3CodeStore.startPolling();
    return () => {
      reactiveEngine.stop();
      t3CodeStore.stopPolling();
    };
  }, []);

  // Sync live OS theme, blur, opacity, UI sound preference & active OS Mod overrides
  useEffect(() => {
    applyOsThemeToDocument(cfg.osTheme, cfg.glassBlur, cfg.glassOpacity);
    modStore.applyDomOverrides();
    uiSounds.setEnabled(cfg.uiSounds);
  }, [cfg.osTheme, cfg.glassBlur, cfg.glassOpacity, cfg.uiSounds, mods.theme, mods.mods, mods.userCss, mods.decorator.style, mods.shell, mods.eyeCandy]);

  const activeBackdropUrl =
    mods.activeBackdropImageId === "custom"
      ? mods.customBackdropImageUrl.trim()
      : mods.activeBackdropImageId
      ? ULTRA_HD_BACKDROPS.find((b) => b.id === mods.activeBackdropImageId)?.url ?? ""
      : "";
  const hasBackdropImage = Boolean(activeBackdropUrl);

  // WebGPU Animated Live Shader Wallpaper (5 stock shaders + custom WGSL shader mods; paused when 3D Desktop or 4K Image is active)
  useEffect(() => {
    const canvas = wallpaperRef.current;
    if (!canvas || !cfg.webgpuWallpaper || mods.desktop3d.enabled || hasBackdropImage) return;
    const bg = new WebGpuBackdrop(canvas, cfg.wallpaperShader);
    backdropInstanceRef.current = bg;
    const onResize = () => bg.resize(window.innerWidth, window.innerHeight);
    onResize();
    void bg.init();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      backdropInstanceRef.current = null;
      bg.dispose();
    };
  }, [cfg.webgpuWallpaper, mods.desktop3d.enabled, hasBackdropImage]);

  // Hot-switch WebGPU shader mode without recreating GPUDevice
  useEffect(() => {
    backdropInstanceRef.current?.setShader(cfg.wallpaperShader);
  }, [cfg.wallpaperShader]);

  // Hot-compile custom WGSL wallpaper shader mod whenever activeShaderModId or its WGSL source changes
  const activeShaderMod = mods.activeShaderModId
    ? mods.shaders.find((s) => s.id === mods.activeShaderModId) ?? null
    : null;
  const activeShaderWgsl = activeShaderMod?.wgsl ?? null;

  useEffect(() => {
    if (mods.desktop3d.enabled || hasBackdropImage) return;
    const bg = backdropInstanceRef.current;
    if (!bg) return;
    void bg.setCustomWgsl(activeShaderWgsl).then((res) => {
      modStore.setShaderCompileError(res.ok ? null : (res.error ?? "WGSL compilation error"));
    });
  }, [activeShaderWgsl, mods.desktop3d.enabled, cfg.webgpuWallpaper, hasBackdropImage]);

  // Boot unkernel automatically on first mount, reconcile startup workspace, & open requested app (or Agent Studio)
  useEffect(() => {
    appRuntime.runFork(
      Effect.gen(function* () {
        const vm = yield* VmService;
        const fs = yield* GuestFsService;
        yield* vm.boot();

        // Ensure ~/workspace exists and check whether any projects exist before opening the initial app
        const curWs = wmStore.getSnapshot().activeWorkspaceDir;
        const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
        const checkRes = yield* vm
          .execShell(`mkdir -p /home/user/workspace && [ -d ${sq(curWs)} ] && echo "EXISTS" || echo "MISSING"`)
          .pipe(Effect.either);
        const activeExists = checkRes._tag === "Right" && checkRes.right.stdout.trim() === "EXISTS";
        const projectsRes = yield* fs.listProjects("/home/user/workspace").pipe(Effect.either);
        const projects = projectsRes._tag === "Right" ? projectsRes.right : [];

        yield* Effect.sync(() => {
          wmStore.reconcileStartupWorkspace(projects, activeExists);
          const requestedApp = new URLSearchParams(window.location.search).get("app") as AppId | null;
          wmStore.openApp(requestedApp && requestedApp in APP_CATALOG ? requestedApp : "agent-studio");
        });
        const ghAuth = yield* GithubAuthService;
        yield* ghAuth.checkAuth();
      }).pipe(Effect.ignore)
    );
  }, []);

  // Attach Full Agent OS API host bridge (`osctl`, `pbcopy`, `pbpaste`, `os-open`, `os-notify`, `os-download` + MCP)
  useEffect(() => {
    if (vmState.phase !== "running") {
      detachAgentOsBridge();
      return;
    }
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    if (!vm) return;

    let cancelled = false;
    void attachAgentOsBridge(vm).then((cmds) => {
      if (!cancelled && cmds.length > 0) {
        wmStore.pushToast(
          "Agent OS API Online",
          `Native host bridge ready (${cmds.join(", ")}) + MCP server (osctl mcp)`,
          "success"
        );
      }
    });

    return () => {
      cancelled = true;
      detachAgentOsBridge();
    };
  }, [vmState.phase]);

  // Attach Desktop-level Wayland compositor (wland) so Linux GUI apps open directly as OS windows!
  useEffect(() => {
    const container = waylandRootRef.current;
    if (!container || vmState.phase !== "running" || !cfg.wayland || cfg.distro !== "debian") {
      return;
    }
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    if (!vm) return;

    let cancelled = false;
    void waylandDesktopManager
      .attach(vm, container, {
        onMountWindow: (info) => {
          if (cancelled) return;
          wmStore.openWaylandWindow(info.key, info.title, info.appId);
        },
        onUnmountWindow: (key) => {
          if (cancelled) return;
          wmStore.closeWaylandWindowByKey(key);
        },
        onUpdateWindow: (info) => {
          if (cancelled) return;
          wmStore.updateWaylandWindowTitle(info.key, info.title);
        },
      })
      .then((ok) => {
        if (ok && !cancelled) {
          wmStore.pushToast(
            "Wayland Desktop Compositor Ready",
            "Linux GUI apps (e.g. wland foot) now open directly as floating unkernelOS desktop windows.",
            "info"
          );
        }
      });

    return () => {
      cancelled = true;
      waylandDesktopManager.dispose();
    };
  }, [vmState.phase, cfg.wayland, cfg.distro]);

  // Auto-pop a floating 3D GL / KMS desktop window whenever a guest VirGL 3D scanout becomes active
  useEffect(() => {
    if (vmState.phase !== "running") {
      glAutoOpenedRef.current = false;
      return;
    }
    const timer = window.setInterval(() => {
      const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
      const scanout = vm?.gl?.gpu?.scanout;
      const active = Boolean(scanout && scanout.width > 0 && scanout.height > 0);
      if (active && !glAutoOpenedRef.current) {
        glAutoOpenedRef.current = true;
        const wins = wmStore.getSnapshot().windows;
        const hasDisplayWin = wins.some(
          (w) => (w.appId === "gl-window" || w.appId === "screen") && !w.minimized
        );
        if (!hasDisplayWin) {
          wmStore.openApp("gl-window");
        }
      } else if (!active) {
        glAutoOpenedRef.current = false;
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [vmState.phase]);

  // Start live background Workflows scheduler (interval / cron triggers) while VM is running
  useEffect(() => {
    if (vmState.phase !== "running") return;
    return workflowsStore.startScheduler();
  }, [vmState.phase]);

  // Bridge Effect OS events to Window Manager, Workflows & Toasts
  const handleOsEvent = useCallback((ev: { _tag: string; payload: unknown }) => {
    if (ev._tag === "OpenPreview") {
      const p = ev.payload as { port: number; path?: string };
      wmStore.openPreview(p.port, p.path || "/");
    } else if (ev._tag === "PortsChanged" && Array.isArray(ev.payload)) {
      workflowsStore.handlePortsChanged(ev.payload as { port: number }[]);
    } else if (ev._tag === "Notify") {
      const n = ev.payload as {
        title: string;
        message: string;
        level?: "info" | "success" | "warn" | "error";
      };
      wmStore.pushToast(n.title, n.message, n.level ?? "info");
    } else if (ev._tag === "DisplayMode" && ev.payload) {
      const wins = wmStore.getSnapshot().windows;
      if (!wins.some((w) => w.appId === "gl-window" || w.appId === "screen")) {
        wmStore.openApp("gl-window");
      }
    }
  }, []);
  useOsEvents(handleOsEvent);

  // Global OS Keyboard Shortcuts (⌘K, ⌘E, ⌘L, ⌃1..4, ⌘1..8, ⌘,)
  useEffect(() => {
    const shortcutMap: Record<string, AppId> = {
      "0": "t3-code",
      "1": "agent-studio",
      "2": "terminal",
      "3": "explorer",
      "4": "preview",
      "5": "screen",
      "6": "git",
      "7": "toolchain",
      "8": "monitor",
      "9": "ide",
      ",": "settings",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        wmStore.toggleLauncher();
        return;
      }
      // Ctrl+1..4 switches virtual desktop workspaces
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        wmStore.switchWorkspace(Number(e.key) as WorkspaceId);
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        wmStore.toggleCommandPalette();
        return;
      }
      if (k === "e" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        wmStore.toggleMissionControl();
        return;
      }
      if (k === "l" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        wmStore.setLocked(true);
        return;
      }
      if (k === "v" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        wmStore.toggleClipboard();
        return;
      }
      const appId = shortcutMap[k];
      if (appId && !e.shiftKey && !e.altKey && e.metaKey) {
        e.preventDefault();
        wmStore.openApp(appId);
      }
    };
    const onCopy = () => {
      const sel = window.getSelection()?.toString();
      if (sel && sel.trim()) clipboardStore.record(sel, "host");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopy);
    };
  }, []);

  const spatialChromeActive = mods.desktop3d.enabled && mods.desktop3d.spatialChrome3d;
  const activeWin = wm.windows.find((w) => w.id === wm.activeWindowId);

  return (
    <div
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-window-surface], nav, header, aside")) return;
        e.preventDefault();
        wmStore.setContextMenu({ x: e.clientX, y: e.clientY, kind: "desktop" });
      }}
      className="relative w-screen h-[100dvh] overflow-hidden wallpaper-fallback"
    >
      {/* AAA 3D WebGPU Three.js Spatial Desktop OR Ultra-HD 2D NASA/4K Image OR 2D WebGPU Live Shader Backdrop */}
      {mods.desktop3d.enabled ? (
        <Suspense fallback={null}>
          <ThreeDesktop3d />
        </Suspense>
      ) : activeBackdropUrl ? (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
          <img
            src={activeBackdropUrl}
            crossOrigin="anonymous"
            alt=""
            className="w-full h-full object-cover object-center scale-[1.01] transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />
        </div>
      ) : (
        cfg.webgpuWallpaper && (
          <canvas
            ref={wallpaperRef}
            className="fixed inset-0 w-full h-full pointer-events-none z-0"
          />
        )
      )}

      {/* Injectable Full-Screen Reactive Wallpaper Surfaces (HTML / Iframe / Canvas 60fps behind windows) */}
      <ReactiveSurfaceSlot slot="wallpaper" />

      {/* Desktop Wayland Host Root (output geometry + popups/dnd; top-level surfaces mount in WindowFrame) */}
      <div ref={waylandRootRef} className="fixed inset-0 pointer-events-none z-[1] overflow-hidden" />

      {/* Desktop Ambient Widgets (Behind Windows, Toggleable) */}
      <DesktopWidgets />

      {/* Injectable Desktop-Layer Reactive Surfaces (HTML / Iframe / Canvas) */}
      <ReactiveSurfaceSlot slot="desktop" />

      {/* AAA Eye-Candy, Cursor Spotlight/Trail, Ambient Particles, Night Shift, Hot Corners & Perf HUD */}
      <OsEyeCandyLayer />

      {/* Injectable Overlay HUD Reactive Surfaces (above windows) */}
      <ReactiveSurfaceSlot slot="overlay" />

      {/* Top Glass Menu Bar */}
      <TopBar />

      {/* Magnetic Drag Snap Zone Preview Overlay */}
      <SnapPreviewOverlay />

      {/* Floating Glass Window Layer (in 3D mode, windows live inside the exact Three.js CSS3D camera stage with ZERO unmounting!) */}
      <main
        style={
          !mods.desktop3d.enabled && mods.shell.compizCube
            ? {
                perspective: "1600px",
                transformStyle: "preserve-3d",
                transform:
                  cubeFlip !== 0
                    ? `rotateY(${cubeFlip * 24}deg) scale(0.92)`
                    : "rotateY(0deg) scale(1)",
                transition: "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
              }
            : undefined
        }
        className="relative z-10 w-full h-full pointer-events-none overflow-hidden"
      >
        <div
          ref={(el) => {
            spatial3dBridge.cameraStageEl = el;
          }}
          style={
            mods.desktop3d.enabled
              ? {
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  pointerEvents: "none",
                }
              : {
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }
          }
        >
          {wm.windows.map((win) => {
            const visible =
              mods.desktop3d.enabled &&
              (mods.desktop3d.layout === "compiz-cube" || mods.desktop3d.layout === "gallery-ring")
                ? true
                : win.workspace === wm.activeWorkspace;
            const focused =
              win.workspace === wm.activeWorkspace &&
              win.id === wm.activeWindowId &&
              !wm.missionControlOpen &&
              !wm.locked;
            return (
              <WindowFrame key={win.id} win={win} focused={focused} visible={visible}>
                <WindowErrorBoundary appTitle={win.title}>
                  <Suspense fallback={<AppLoadingFallback />}>
                    {renderWindowApp(win, focused, visible)}
                  </Suspense>
                </WindowErrorBoundary>
              </WindowFrame>
            );
          })}

          {/* FULL 3D SPATIAL GLOBAL MENU BAR (Floating above the 3D windows inside the 3D scene!) */}
          {spatialChromeActive && (
            <div
              ref={(el) => {
                spatial3dBridge.globalMenu3dEl = el;
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                backfaceVisibility: mods.desktop3d.doubleSidedWindows ? "visible" : "hidden",
                WebkitBackfaceVisibility: mods.desktop3d.doubleSidedWindows ? "visible" : "hidden",
              }}
              className="pointer-events-auto flex items-center justify-between gap-4 px-5 py-2.5 min-w-[920px] rounded-full glass-dock border border-white/25 shadow-[0_24px_60px_rgba(0,0,0,0.7)] text-xs text-white select-none"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => wmStore.toggleCommandPalette()}
                  className="flex items-center gap-2 font-bold text-white hover:text-cyan-200 transition cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-xs font-extrabold shadow">
                    U
                  </span>
                  <span>{mods.shell.brandLabel || "unkernelOS"} 3D</span>
                </button>
                <span className="text-white/25">|</span>
                <span className="font-semibold text-cyan-200 max-w-[180px] truncate">
                  {activeWin ? APP_CATALOG[activeWin.appId].title : "Espace Spatial 3D"}
                </span>
                <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-white/8 border border-white/12">
                  {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                    <button
                      key={ws}
                      type="button"
                      onClick={() => wmStore.switchWorkspace(ws)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition cursor-pointer ${
                        wm.activeWorkspace === ws
                          ? "bg-cyan-400 text-black font-bold shadow"
                          : "text-zinc-300 hover:bg-white/12 hover:text-white"
                      }`}
                    >
                      B{ws}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => wmStore.toggleLauncher()}
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-medium cursor-pointer"
                >
                  Apps
                </button>
                <button
                  type="button"
                  onClick={() => wmStore.toggleMissionControl()}
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-medium cursor-pointer"
                >
                  Mission Control
                </button>
                <button
                  type="button"
                  onClick={() => wmStore.openApp("mod-studio")}
                  className="px-3 py-1 rounded-full bg-fuchsia-500/25 hover:bg-fuchsia-500/40 border border-fuchsia-300/45 text-[11px] font-semibold text-fuchsia-100 cursor-pointer"
                >
                  Mod Studio
                </button>
                <button
                  type="button"
                  onClick={() => wmStore.toggleCommandPalette()}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 font-mono text-[11px] cursor-pointer"
                >
                  ⌘K
                </button>
                <LiveClock />
              </div>
            </div>
          )}

          {/* FULL 3D SUPER DOCK & TASKBAR (Floating ergonomically below the 3D windows with full magnification & Start Menu!) */}
          {spatialChromeActive && (
            <div
              ref={(el) => {
                spatial3dBridge.dock3dEl = el;
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                backfaceVisibility: mods.desktop3d.doubleSidedWindows ? "visible" : "hidden",
                WebkitBackfaceVisibility: mods.desktop3d.doubleSidedWindows ? "visible" : "hidden",
              }}
              className="pointer-events-auto flex flex-col items-center justify-center overflow-visible"
            >
              <Dock embedded3d />
              <ShellTaskbarAndMenu embedded3d />
            </div>
          )}

          {/* Injectable 3D Spatial Mod Panels (HTML / Iframe / Canvas floating in 3D space!) */}
          {mods.desktop3d.enabled && (
            <Reactive3dPanels doubleSided={mods.desktop3d.doubleSidedWindows} />
          )}
        </div>
      </main>

      {/* Bottom Floating AAA Magnification Dock (2D HUD mode when 3D Spatial Chrome is off) */}
      {!spatialChromeActive && <Dock />}

      {/* Universal Structural Shell Layer (2D Taskbars/Icons/SpringBoard/VisionOS Rail; Taskbar hidden here when mounted in 3D!) */}
      {!spatialChromeActive && <ShellTaskbarAndMenu />}

      {/* AAA Mobile Bottom Navigation Bar (< 768px) */}
      <MobileNavBar />

      {/* Control Center Popover */}
      <ControlCenter />

      {/* Notification Center Drawer */}
      <NotificationCenter />

      {/* Full-Screen App Launcher / Launchpad */}
      <AppLauncherOverlay />

      {/* Alt+Tab Window Switcher HUD */}
      <WindowSwitcherHud />

      {/* Mission Control / Exposé */}
      <MissionControlOverlay />

      {/* Desktop & Dock Right-Click Context Menu */}
      <ContextMenu />

      {/* Raycast-style ⌘K Command Palette */}
      <CommandPalette />

      {/* Universal Clipboard History (⌘⇧V) */}
      <ClipboardOverlay />

      {/* Futuristic Voice OS Reactive Orb */}
      <VoiceOrbOverlay />

      {/* 1-Click GitHub OAuth Device Flow Modal */}
      <GithubConnectModal />

      {/* Animated WebGPU Lock Screen */}
      <LockScreen />

      {/* Boot / Recovery Overlay */}
      <BootOverlay />

      {/* Toast Notification Stack */}
      <div
        style={{ top: "calc(44px + env(safe-area-inset-top))" }}
        className="fixed left-3 right-3 sm:left-auto sm:right-3 z-[95] flex flex-col gap-2 sm:w-80 pointer-events-none"
      >
        {wm.toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-2xl glass-surface-focused border flex items-start justify-between gap-2 animate-window-in ${
              t.level === "error"
                ? "border-rose-400/40"
                : t.level === "success"
                ? "border-emerald-400/40"
                : t.level === "warn"
                ? "border-amber-400/40"
                : "border-white/15"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white">{t.title}</div>
              <div className="text-[11px] text-zinc-300 mt-0.5 break-words">{t.message}</div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    if (t.action?.copyText) {
                      navigator.clipboard.writeText(t.action.copyText).catch(() => {});
                    }
                    window.open(t.action!.url, "_blank", "noopener,noreferrer");
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 transition cursor-pointer"
                >
                  {t.action.label} ↗
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => wmStore.dismissToast(t.id)}
              className="p-0.5 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
