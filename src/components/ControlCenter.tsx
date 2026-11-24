import { Effect } from "effect";
import {
  Download,
  LayoutGrid,
  Lock,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  ZoomIn,
} from "lucide-react";
import React from "react";
import { OS_THEMES, WALLPAPER_SHADERS } from "../core/os-themes.ts";
import { pwaStore, usePwa } from "../core/pwa-service.ts";
import { appRuntime, SettingsService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import {
  DEFAULT_UNKERNEL_CONFIG,
  type OsThemeId,
  type WallpaperShaderId,
} from "../core/schema.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

export const ControlCenter: React.FC = () => {
  const wm = useWm();
  const pwa = usePwa();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const vm = useSubscriptionRef(
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

  if (!wm.controlCenterOpen) return null;

  const patchCfg = (patch: Partial<typeof cfg>) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig(patch)));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[78]"
        onClick={() => wmStore.setControlCenter(false)}
      />
      <aside
        style={{ top: "calc(42px + env(safe-area-inset-top))" }}
        className="fixed left-2 right-2 sm:left-auto sm:right-3 z-[80] sm:w-80 max-h-[calc(100dvh-120px)] overflow-y-auto rounded-3xl glass-surface-focused p-4 space-y-3.5 animate-window-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white tracking-tight">Control Center</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => wmStore.setLocked(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-[11px] text-zinc-200 transition"
              title="Lock Screen (⌘L)"
            >
              <Lock className="w-3 h-3 text-cyan-400" />
              Lock
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setControlCenter(false);
                wmStore.openApp("settings", { tab: "appearance" });
              }}
              className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-zinc-300 transition"
              title="Appearance Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Feature Toggles */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => patchCfg({ desktopWidgets: !cfg.desktopWidgets })}
            className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition ${
              cfg.desktopWidgets
                ? "bg-violet-500/22 border-violet-400/40 text-white"
                : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-[11px] font-semibold leading-tight">Widgets</div>
              <div className="text-[10px] opacity-70">{cfg.desktopWidgets ? "Shown" : "Hidden"}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => patchCfg({ uiSounds: !cfg.uiSounds })}
            className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition ${
              cfg.uiSounds
                ? "bg-cyan-500/20 border-cyan-400/40 text-white"
                : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {cfg.uiSounds ? <Volume2 className="w-4 h-4 shrink-0" /> : <VolumeX className="w-4 h-4 shrink-0" />}
            <div>
              <div className="text-[11px] font-semibold leading-tight">UI Sounds</div>
              <div className="text-[10px] opacity-70">{cfg.uiSounds ? "Subtle" : "Muted"}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => patchCfg({ dockMagnification: !cfg.dockMagnification })}
            className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition ${
              cfg.dockMagnification
                ? "bg-fuchsia-500/20 border-fuchsia-400/40 text-white"
                : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ZoomIn className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-[11px] font-semibold leading-tight">Dock Zoom</div>
              <div className="text-[10px] opacity-70">{cfg.dockMagnification ? "Spring" : "Flat"}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => patchCfg({ webgpuWallpaper: !cfg.webgpuWallpaper })}
            className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition ${
              cfg.webgpuWallpaper
                ? "bg-emerald-500/20 border-emerald-400/40 text-white"
                : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-[11px] font-semibold leading-tight">WebGPU BG</div>
              <div className="text-[10px] opacity-70">{cfg.webgpuWallpaper ? "Live GPU" : "Static"}</div>
            </div>
          </button>
        </div>

        {/* 5 WebOS Themes */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Palette className="w-3.5 h-3.5 text-violet-400" />
            WebOS Theme
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(OS_THEMES) as OsThemeId[]).map((id) => {
              const t = OS_THEMES[id];
              const active = cfg.osTheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={t.name}
                  onClick={() => patchCfg({ osTheme: id, wallpaperShader: t.defaultShader })}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition ${
                    active
                      ? "bg-white/14 border-white/40 scale-105"
                      : "bg-white/[0.02] border-white/8 hover:bg-white/8"
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full border border-white/25 shadow-inner"
                    style={{
                      background: `linear-gradient(135deg, ${t.swatches[0]}, ${t.swatches[1]})`,
                    }}
                  />
                  <span className="text-[9px] text-zinc-300 truncate w-full text-center">
                    {t.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5 Live WebGPU Shaders */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
            WebGPU Live Shader
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(WALLPAPER_SHADERS) as WallpaperShaderId[]).map((id) => {
              const s = WALLPAPER_SHADERS[id];
              const active = cfg.wallpaperShader === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => patchCfg({ wallpaperShader: id, webgpuWallpaper: true })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition ${
                    active
                      ? "bg-white/16 border-white/35 text-white"
                      : "bg-white/[0.03] border-white/8 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Glass Blur & Opacity Sliders */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2.5">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">Glass Blur</span>
              <span className="font-mono text-zinc-400">{cfg.glassBlur}px</span>
            </div>
            <input
              type="range"
              min={8}
              max={48}
              step={2}
              value={cfg.glassBlur}
              onChange={(e) => patchCfg({ glassBlur: Number(e.target.value) })}
              className="w-full accent-violet-500 h-1.5"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">Surface Opacity</span>
              <span className="font-mono text-zinc-400">{Math.round(cfg.glassOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={45}
              max={95}
              step={2}
              value={Math.round(cfg.glassOpacity * 100)}
              onChange={(e) => patchCfg({ glassOpacity: Number(e.target.value) / 100 })}
              className="w-full accent-cyan-400 h-1.5"
            />
          </div>
        </div>

        {/* Runtime Isolation & PWA Install */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/8 text-[10px] font-mono">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                vm.crossOriginIsolated ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span>
              {vm.cpus} vCPU · {vm.transport} · {vm.crossOriginIsolated ? "COI" : "Std"}
            </span>
          </div>
          {pwa.installable && !pwa.installed ? (
            <button
              type="button"
              onClick={() => void pwaStore.promptInstall()}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/30 border border-violet-400/40 text-white hover:bg-violet-500/45 transition"
            >
              <Download className="w-2.5 h-2.5" />
              Install PWA
            </button>
          ) : (
            <span className="text-zinc-500">{pwa.installed ? "PWA Installed" : "PWA Ready"}</span>
          )}
        </div>

        {/* VM Power Controls */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {vm.phase === "suspended" ? (
            <button
              type="button"
              onClick={() => {
                wmStore.setControlCenter(false);
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.resume()).pipe(Effect.ignore));
              }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Resume VM
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                wmStore.setControlCenter(false);
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.suspend()).pipe(Effect.ignore));
              }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-200 transition"
            >
              <Pause className="w-3.5 h-3.5" />
              Suspend VM
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              wmStore.setControlCenter(false);
              appRuntime.runFork(Effect.flatMap(VmService, (v) => v.reboot()).pipe(Effect.ignore));
            }}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reboot
          </button>
        </div>
      </aside>
    </>
  );
};
