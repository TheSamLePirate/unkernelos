import { Effect } from "effect";
import { X } from "lucide-react";
import React, { useCallback, useEffect, useRef } from "react";
import {
  appRuntime,
  SettingsService,
  useOsEvents,
  useSubscriptionRef,
  VmService,
} from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { WebGpuBackdrop } from "../gpu/webgpu-backdrop.ts";
import { useWm, wmStore, type AppId, type WindowInstance } from "../wm/wm-store.ts";
import { BootOverlay } from "./BootOverlay.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { Dock } from "./Dock.tsx";
import { TopBar } from "./TopBar.tsx";
import { WindowFrame } from "./WindowFrame.tsx";
import { AgentStudioApp } from "./apps/AgentStudioApp.tsx";
import { FileExplorerApp } from "./apps/FileExplorerApp.tsx";
import { GitApp } from "./apps/GitApp.tsx";
import { KittyTerminalApp } from "./apps/KittyTerminalApp.tsx";
import { PreviewBrowserApp } from "./apps/PreviewBrowserApp.tsx";
import { ScreenDisplayApp } from "./apps/ScreenDisplayApp.tsx";
import { SettingsApp } from "./apps/SettingsApp.tsx";
import { SystemMonitorApp } from "./apps/SystemMonitorApp.tsx";
import { ToolchainInstallerApp } from "./apps/ToolchainInstallerApp.tsx";

const renderWindowApp = (win: WindowInstance, focused: boolean): React.ReactNode => {
  switch (win.appId) {
    case "agent-studio":
      return <AgentStudioApp windowFocused={focused} />;
    case "terminal":
      return <KittyTerminalApp windowFocused={focused} />;
    case "explorer":
      return <FileExplorerApp />;
    case "preview":
      return <PreviewBrowserApp />;
    case "screen":
      return <ScreenDisplayApp windowFocused={focused} />;
    case "git":
      return <GitApp />;
    case "toolchain":
      return <ToolchainInstallerApp />;
    case "monitor":
      return <SystemMonitorApp />;
    case "settings":
      return (
        <SettingsApp
          initialTab={
            win.props?.tab as "compute" | "network" | "graphics" | "storage" | "credentials" | undefined
          }
        />
      );
  }
};

export const Desktop: React.FC = () => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const wallpaperRef = useRef<HTMLCanvasElement>(null);

  // WebGPU Animated Aurora Wallpaper
  useEffect(() => {
    const canvas = wallpaperRef.current;
    if (!canvas || !cfg.webgpuWallpaper) return;
    const bg = new WebGpuBackdrop(canvas);
    const onResize = () => bg.resize(window.innerWidth, window.innerHeight);
    onResize();
    void bg.init();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      bg.dispose();
    };
  }, [cfg.webgpuWallpaper]);

  // Boot unkernel automatically on first mount & open Agent Studio
  useEffect(() => {
    appRuntime.runFork(
      Effect.gen(function* () {
        const vm = yield* VmService;
        yield* vm.boot();
        yield* Effect.sync(() => {
          wmStore.openApp("agent-studio");
        });
      }).pipe(Effect.ignore)
    );
  }, []);

  // Bridge Effect OS events to Window Manager & Toasts
  const handleOsEvent = useCallback((ev: { _tag: string; payload: unknown }) => {
    if (ev._tag === "OpenPreview") {
      const p = ev.payload as { port: number; path?: string };
      wmStore.openPreview(p.port, p.path || "/");
    } else if (ev._tag === "Notify") {
      const n = ev.payload as {
        title: string;
        message: string;
        level?: "info" | "success" | "warn" | "error";
      };
      wmStore.pushToast(n.title, n.message, n.level ?? "info");
    } else if (ev._tag === "DisplayMode" && ev.payload) {
      wmStore.openApp("screen");
    }
  }, []);
  useOsEvents(handleOsEvent);

  // Global OS Keyboard Shortcuts (⌘K, ⌘1..8, ⌘,)
  useEffect(() => {
    const shortcutMap: Record<string, AppId> = {
      "1": "agent-studio",
      "2": "terminal",
      "3": "explorer",
      "4": "preview",
      "5": "screen",
      "6": "git",
      "7": "toolchain",
      "8": "monitor",
      ",": "settings",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        wmStore.toggleCommandPalette();
        return;
      }
      const appId = shortcutMap[k];
      if (appId && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        wmStore.openApp(appId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden wallpaper-fallback">
      {/* WebGPU Ambient Dark Glass Shader */}
      {cfg.webgpuWallpaper && (
        <canvas
          ref={wallpaperRef}
          className="fixed inset-0 w-full h-full pointer-events-none z-0"
        />
      )}

      {/* Top Glass Menu Bar */}
      <TopBar />

      {/* Floating Glass Window Layer */}
      <main className="relative z-10 w-full h-full">
        {wm.windows.map((win) => {
          const focused = win.id === wm.activeWindowId;
          return (
            <WindowFrame key={win.id} win={win} focused={focused}>
              {renderWindowApp(win, focused)}
            </WindowFrame>
          );
        })}
      </main>

      {/* Bottom Floating Glass Dock */}
      <Dock />

      {/* Raycast-style ⌘K Command Palette */}
      <CommandPalette />

      {/* Boot / Recovery Overlay */}
      <BootOverlay />

      {/* Toast Notification Stack */}
      <div className="fixed top-11 right-3 z-[95] flex flex-col gap-2 w-80 pointer-events-none">
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
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white">{t.title}</div>
              <div className="text-[11px] text-zinc-300 mt-0.5 break-words">{t.message}</div>
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
