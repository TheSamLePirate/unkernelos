import { Effect } from "effect";
import {
  Bot,
  Box,
  Layers,
  LayoutGrid,
  Lock,
  Minimize2,
  Palette,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import React, { useEffect } from "react";
import { modStore } from "../core/mod-store.ts";
import { OS_THEMES, WALLPAPER_SHADERS } from "../core/os-themes.ts";
import { appRuntime, SettingsService, useSubscriptionRef } from "../core/runtime.ts";
import {
  DEFAULT_UNKERNEL_CONFIG,
  type OsThemeId,
  type WallpaperShaderId,
} from "../core/schema.ts";
import { APP_CATALOG, useWm, wmStore, type WorkspaceId } from "../wm/wm-store.ts";

export const ContextMenu: React.FC = () => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  useEffect(() => {
    if (!wm.contextMenu) return;
    const close = () => wmStore.setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wm.contextMenu]);

  if (!wm.contextMenu) return null;

  const menu = wm.contextMenu;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const x = Math.min(menu.x, vw - 240);
  const y = Math.min(menu.y, vh - 310);

  const patchCfg = (patch: Partial<typeof cfg>) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig(patch)));
  };

  const cycleShader = () => {
    const ids = Object.keys(WALLPAPER_SHADERS) as WallpaperShaderId[];
    const idx = ids.indexOf(cfg.wallpaperShader);
    const next = ids[(idx + 1) % ids.length]!;
    modStore.setBackdropImage(null);
    modStore.setActiveShaderMod(null);
    patchCfg({ wallpaperShader: next, webgpuWallpaper: true });
    wmStore.setContextMenu(null);
  };

  const cycleTheme = () => {
    const ids = Object.keys(OS_THEMES) as OsThemeId[];
    const idx = ids.indexOf(cfg.osTheme);
    const next = ids[(idx + 1) % ids.length]!;
    modStore.setTheme({ enabled: false });
    modStore.setBackdropImage(null);
    modStore.setActiveShaderMod(null);
    patchCfg({ osTheme: next, wallpaperShader: OS_THEMES[next].defaultShader });
    wmStore.setContextMenu(null);
  };

  const dockApp = menu.kind === "dock" && menu.appId ? APP_CATALOG[menu.appId] : null;
  const dockWins = menu.kind === "dock" && menu.appId
    ? wm.windows.filter((w) => w.appId === menu.appId)
    : [];

  return (
    <>
      <div
        className="fixed inset-0 z-[110]"
        onClick={() => wmStore.setContextMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          wmStore.setContextMenu(null);
        }}
      />
      <div
        style={{ left: x, top: y }}
        className="fixed z-[115] w-56 rounded-2xl glass-surface-focused p-1.5 text-xs shadow-2xl animate-window-in"
      >
        {dockApp && menu.appId ? (
          <>
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 border-b border-white/8 mb-1">
              {dockApp.title}
            </div>
            <button
              type="button"
              onClick={() => wmStore.openApp(menu.appId!)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Open / Focus
            </button>
            <button
              type="button"
              onClick={() => wmStore.openApp(menu.appId!, undefined, true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              New Window
            </button>
            {dockWins.length > 0 && (
              <>
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] text-zinc-500 flex items-center justify-between">
                  <span>Move to Desktop</span>
                  <div className="flex gap-1">
                    {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                      <button
                        key={ws}
                        type="button"
                        onClick={() => {
                          wmStore.moveWindowToWorkspace(dockWins[0]!.id, ws);
                          wmStore.setContextMenu(null);
                        }}
                        className="w-5 h-5 rounded bg-white/8 hover:bg-violet-500/35 text-[10px] font-mono text-zinc-200"
                      >
                        {ws}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="my-1 border-t border-white/8" />
                <button
                  type="button"
                  onClick={() => wmStore.closeAppWindows(menu.appId!)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-rose-500/20 text-rose-300 transition"
                >
                  <X className="w-3.5 h-3.5" />
                  Quit {dockApp.shortTitle}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => wmStore.openApp("terminal", undefined, true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              New Kitty Terminal
            </button>
            <button
              type="button"
              onClick={() => wmStore.openApp("agent-studio")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Bot className="w-3.5 h-3.5 text-violet-400" />
              Open Agent Studio
            </button>
            <button
              type="button"
              onClick={() => wmStore.openApp("gl-window")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              Open 3D GL / KMS Window
            </button>
            <button
              type="button"
              onClick={() => wmStore.toggleMissionControl()}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
              Mission Control (⌘E)
            </button>
            <button
              type="button"
              onClick={() => wmStore.minimizeAllInWorkspace()}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Minimize2 className="w-3.5 h-3.5 text-zinc-400" />
              Show Desktop
            </button>

            <div className="my-1 border-t border-white/8" />

            <button
              type="button"
              onClick={cycleTheme}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <span className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                Next Theme
              </span>
              <span className="text-[10px] text-zinc-500">{OS_THEMES[cfg.osTheme].name.split(" ")[0]}</span>
            </button>
            <button
              type="button"
              onClick={cycleShader}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Next WebGPU Shader
              </span>
              <span className="text-[10px] text-zinc-500">{WALLPAPER_SHADERS[cfg.wallpaperShader].name.split(" ")[0]}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                patchCfg({ desktopWidgets: !cfg.desktopWidgets });
                wmStore.setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
              {cfg.desktopWidgets ? "Hide Desktop Widgets" : "Show Desktop Widgets"}
            </button>

            <div className="my-1 border-t border-white/8" />

            <button
              type="button"
              onClick={() => wmStore.setLocked(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Lock Screen (⌘⇧L)
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setContextMenu(null);
                wmStore.openApp("settings", { tab: "appearance" });
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-zinc-200 transition"
            >
              <Settings className="w-3.5 h-3.5 text-zinc-400" />
              Personalize WebOS...
            </button>
          </>
        )}
      </div>
    </>
  );
};
