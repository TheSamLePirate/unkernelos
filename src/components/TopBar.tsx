import { Effect } from "effect";
import {
  Bell,
  Box,
  Command,
  Cpu,
  Download,
  GitBranch,
  Globe,
  Grid2x2,
  Layers,
  Mic,
  Search,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { INITIAL_GITHUB_AUTH } from "../core/github-auth-service.ts";
import { modStore, useMods } from "../core/mod-store.ts";
import { pwaStore, usePwa } from "../core/pwa-service.ts";
import { appRuntime, GithubAuthService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { voiceOsEngine } from "../core/voice-os.ts";
import { APP_CATALOG, useWm, wmStore, type GridLayoutMode, type WorkspaceId } from "../wm/wm-store.ts";
import { DynamicIsland } from "./DynamicIsland.tsx";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";

const WORKSPACES: readonly WorkspaceId[] = [1, 2, 3, 4];

/**
 * AAA Liquid Glass OS Top Bar (True 3-Zone Architecture):
 * - Left: Brand, Active App, Project Switcher, Workspaces 1–4, Mission Control & Live Ports
 * - Dead-Center (pixel-exact `left-1/2 -translate-x-1/2`): Visionary Dynamic Island
 * - Right: 2D/3D Grid, Segmented 3D + 3D HUD Toggle, Mods, Compact Kernel Telemetry, GitHub, Unified Utility Capsule & Clock
 */
export const TopBar: React.FC = () => {
  const wm = useWm();
  const mods = useMods();
  const pwa = usePwa();
  const ghAuth = useSubscriptionRef(
    Effect.map(GithubAuthService, (g) => g.stateRef),
    INITIAL_GITHUB_AUTH
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

  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const activeWin = wm.windows.find((w) => w.id === wm.activeWindowId);
  const activeTitle = activeWin ? APP_CATALOG[activeWin.appId].shortTitle : "Desktop";

  const statusColor =
    vm.phase === "running"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]"
      : vm.phase === "booting"
      ? "bg-amber-400 animate-pulse"
      : vm.phase === "suspended"
      ? "bg-sky-400"
      : "bg-rose-400";

  if (mods.shell.topBarStyle === "hidden") return null;

  const isFloatingBar = mods.shell.topBarStyle === "floating-pills";
  const isRetroBar = mods.shell.topBarStyle === "retro";
  const isMinimalBar = mods.shell.topBarStyle === "minimal";
  const isGnomeBar = mods.shell.topBarStyle === "gnome";
  const isIosBar = mods.shell.topBarStyle === "ios";

  return (
    <header
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      className={`fixed z-50 glass-bar px-2.5 sm:px-3.5 flex items-center justify-between text-xs select-none transition-all ${
        isFloatingBar
          ? "top-2 left-3 right-3 min-h-[38px] rounded-2xl border border-white/15 shadow-2xl"
          : isGnomeBar
          ? "top-0 left-0 right-0 min-h-[34px] !bg-black/92 border-b border-white/8"
          : isIosBar
          ? "top-0 left-0 right-0 min-h-[36px] !bg-transparent !border-b-0 !shadow-none !backdrop-blur-none"
          : isRetroBar
          ? "top-0 left-0 right-0 min-h-[36px] !bg-[#1a1f36] border-b-2 border-white/35"
          : isMinimalBar
          ? "top-0 left-0 right-0 min-h-[36px] !bg-[#0c0c0e]/92 border-b border-white/15"
          : "top-0 left-0 right-0 min-h-[36px]"
      }`}
    >
      {/* ─── LEFT ZONE: Brand, Active App, Project, Workspaces & Mission Control ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 z-10 max-w-[42vw]">
        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="flex items-center gap-1.5 font-semibold text-white hover:opacity-90 active:scale-95 transition shrink-0 cursor-pointer"
          title="unkernelOS · Spotlight (⌘K)"
        >
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-[10px] font-extrabold shadow-[0_0_12px_rgba(139,92,246,0.45)]">
            U
          </span>
          <span className="tracking-tight hidden sm:inline text-[12px]">
            {mods.shell.brandLabel || "unkernelOS"}
          </span>
        </button>

        <span className="text-white/18 hidden md:inline">/</span>
        <span className="hidden md:inline font-medium text-zinc-200 max-w-[96px] truncate text-[11.5px]">
          {activeTitle}
        </span>

        {/* Global Active Workspace / Project Switcher */}
        <WorkspaceSwitcher />

        {/* Workspaces 1–4 Capsule */}
        <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-full bg-white/[0.045] border border-white/10">
          {WORKSPACES.map((ws) => {
            const active = wm.activeWorkspace === ws;
            const hasWins = wm.windows.some((w) => w.workspace === ws);
            return (
              <button
                key={ws}
                type="button"
                onClick={() => wmStore.switchWorkspace(ws)}
                title={`Bureau ${ws} (⌃${ws})`}
                className={`relative w-5 h-4.5 flex items-center justify-center rounded-full text-[10px] font-mono transition cursor-pointer ${
                  active
                    ? "bg-white/20 text-white font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/8"
                }`}
              >
                {ws}
                {hasWins && !active && (
                  <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-cyan-400" />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => wmStore.toggleMissionControl()}
          title="Mission Control (⌘E)"
          className={`hidden sm:flex items-center justify-center w-6 h-5.5 rounded-full border transition cursor-pointer ${
            wm.missionControlOpen
              ? "bg-violet-500/30 border-violet-400/50 text-white"
              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Layers className="w-3 h-3" />
        </button>

        {/* Live Detected Ports Pill */}
        {vm.detectedPorts.length > 0 && (
          <div className="hidden xl:flex items-center gap-1">
            {vm.detectedPorts.slice(0, 2).map((p) => (
              <button
                key={p.port}
                type="button"
                onClick={() => wmStore.openPreview(p.port, "/")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
              >
                <Globe className="w-2.5 h-2.5" />
                :{p.port}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── DEAD-CENTER ZONE: Pixel-Exact Centered Dynamic Island ─── */}
      <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-30 pointer-events-auto">
        <DynamicIsland />
      </div>

      {/* ─── RIGHT ZONE: Grid, Segmented 3D + HUD Toggle, Mods, Compact Telemetry & Utility Capsule ─── */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 z-10">
        {/* 2D & 3D Grid Placement Quick Menu */}
        <div className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setGridMenuOpen((v) => !v)}
            className={`flex items-center gap-1 px-2 h-6 rounded-full border text-[10px] font-medium transition cursor-pointer ${
              gridMenuOpen
                ? "bg-violet-500/30 border-violet-300/60 text-white"
                : "bg-white/[0.05] hover:bg-white/12 border-white/10 text-zinc-300 hover:text-white"
            }`}
            title="Organiser les fenêtres en Grille 2D ou Grille 3D"
          >
            <Grid2x2 className="w-3 h-3" />
            <span className="hidden lg:inline">Grid</span>
          </button>
          {gridMenuOpen && (
            <div
              onMouseLeave={() => setGridMenuOpen(false)}
              className="absolute right-0 top-8 w-48 p-1.5 rounded-2xl glass-surface-focused border border-white/15 shadow-2xl z-[90] space-y-0.5"
            >
              <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                Placement Grille 2D
              </div>
              {(
                [
                  ["grid", "⊞ Grille Auto (N×M)"],
                  ["split-2", "◫ Split 50 / 50"],
                  ["master-stack", "▤ Master + Stack (i3)"],
                  ["columns-3", "▥ 3 Colonnes"],
                  ["cascade", "❐ Cascade"],
                ] as readonly [GridLayoutMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    modStore.setDesktop3d({ enabled: false });
                    const n = wmStore.tileWorkspace(mode);
                    setGridMenuOpen(false);
                    if (n > 0) wmStore.pushToast("Grille 2D appliquée", `${n} fenêtres organisées (${mode}).`, "info");
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-[11px] text-zinc-200 hover:bg-white/12 hover:text-white transition cursor-pointer"
                >
                  {label}
                </button>
              ))}
              <div className="my-1 border-t border-white/10" />
              <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-cyan-300">
                Placement Spatial 3D
              </div>
              <button
                type="button"
                onClick={() => {
                  modStore.setDesktop3d({ enabled: true, layout: "spatial-grid" });
                  setGridMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition cursor-pointer"
              >
                ⊞ Mur Grille 3D Courbe
              </button>
              <button
                type="button"
                onClick={() => {
                  modStore.setDesktop3d({ enabled: true, layout: "compiz-cube" });
                  setGridMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-[11px] text-emerald-200 hover:bg-emerald-500/20 transition cursor-pointer"
              >
                🧊 Cube 4 Bureaux 3D
              </button>
            </div>
          )}
        </div>

        {/* Segmented 3D Toggle + Optional 3D Controls Bar Toggle (hidden by default!) */}
        <div
          className={`hidden sm:flex items-center h-6 rounded-full border overflow-hidden transition ${
            mods.desktop3d.enabled
              ? "bg-gradient-to-r from-cyan-500/28 to-violet-500/28 border-cyan-300/55 shadow-[0_0_14px_rgba(34,211,238,0.28)]"
              : "bg-white/[0.05] border-white/10"
          }`}
        >
          <button
            type="button"
            onClick={() => modStore.setDesktop3d({ enabled: !mods.desktop3d.enabled })}
            className={`flex items-center gap-1 px-2 h-full text-[10px] font-mono font-semibold transition cursor-pointer ${
              mods.desktop3d.enabled ? "text-cyan-100 hover:bg-white/10" : "text-zinc-300 hover:text-white hover:bg-white/10"
            }`}
            title="Basculer le Bureau Spatial 3D WebGPU"
          >
            <Box className="w-3 h-3" />
            3D
          </button>
          {mods.desktop3d.enabled && (
            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ showControlsHud: !mods.desktop3d.showControlsHud })}
              className={`flex items-center gap-1 px-1.5 h-full border-l border-white/15 text-[10px] font-medium transition cursor-pointer ${
                mods.desktop3d.showControlsHud
                  ? "bg-cyan-400/30 text-white"
                  : "text-cyan-200/80 hover:text-white hover:bg-white/10"
              }`}
              title={
                mods.desktop3d.showControlsHud
                  ? "Masquer la barre de contrôle 3D"
                  : "Afficher la barre de contrôle 3D (Mondes, HDRI 4K, Caméra, Dock 3D)"
              }
            >
              <Sparkles className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Quick Mod Studio Shortcut */}
        <button
          type="button"
          onClick={() => wmStore.openApp("mod-studio")}
          className="hidden lg:flex items-center gap-1 px-2 h-6 rounded-full bg-white/[0.05] hover:bg-white/12 border border-white/10 text-[10px] font-medium text-fuchsia-200 transition cursor-pointer"
          title="Ouvrir OS Mod Studio (Thèmes, Mondes 3D, Fonds 4K, Widgets)"
        >
          <Sliders className="w-3 h-3" />
          Mods
        </button>

        {/* Mobile Spotlight & Voice */}
        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="flex sm:hidden p-1.5 rounded-lg text-zinc-300 active:bg-white/15 transition"
          title="Spotlight Search"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => voiceOsEngine.toggleOpen()}
          className="hidden sm:flex md:hidden p-1.5 rounded-lg text-violet-300 hover:text-white hover:bg-white/10 active:scale-95 transition"
          title="Voice OS"
        >
          <Mic className="w-3.5 h-3.5" />
        </button>

        {/* Sleek Compact Kernel Telemetry Pill (never crowds Dynamic Island!) */}
        <button
          type="button"
          onClick={() => wmStore.openApp("monitor")}
          className="flex items-center gap-1.5 px-2 h-6 rounded-full bg-white/[0.045] hover:bg-white/10 border border-white/10 text-[10.5px] font-mono text-zinc-200 transition cursor-pointer"
          title={`Linux ${vm.distro} · ${vm.cpus} vCPU · ${vm.memoryMiB} MiB · Transport: ${vm.transport} · COI: ${vm.crossOriginIsolated ? "ON" : "OFF"} · GL: ${vm.glStatus?.state ?? "idle"}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
          <Cpu className="w-3 h-3 text-cyan-400 hidden sm:block" />
          <span>{vm.cpus}c</span>
          <span className="hidden xl:inline text-white/20">·</span>
          <span className="hidden xl:inline text-zinc-300">{Math.round(vm.memoryMiB / 1024)}G</span>
          {vm.transport === "shared" && (
            <span className="hidden 2xl:inline text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">SAB</span>
          )}
        </button>

        {pwa.installable && !pwa.installed && (
          <button
            type="button"
            onClick={() => void pwaStore.promptInstall()}
            className="flex items-center gap-1 px-2 h-6 rounded-full bg-gradient-to-r from-violet-600/80 to-cyan-500/80 text-[10px] font-medium text-white hover:brightness-110 transition cursor-pointer"
            title="Installer unkernelOS en PWA native"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}

        {/* Compact GitHub Badge */}
        <button
          type="button"
          onClick={() => wmStore.setGithubModal(true)}
          className={`hidden md:flex items-center gap-1.5 px-2 h-6 rounded-full border text-[10.5px] transition cursor-pointer ${
            ghAuth.status === "authenticated" && ghAuth.user
              ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20"
              : "bg-white/[0.045] border-white/10 text-zinc-300 hover:bg-white/12"
          }`}
          title={ghAuth.user ? `GitHub: @${ghAuth.user.login}` : "Connecter GitHub"}
        >
          {ghAuth.status === "authenticated" && ghAuth.user?.avatarUrl ? (
            <img
              src={ghAuth.user.avatarUrl}
              crossOrigin="anonymous"
              alt=""
              className="w-3.5 h-3.5 rounded-full"
            />
          ) : (
            <GitBranch className="w-3 h-3 text-violet-300" />
          )}
          <span className="hidden 2xl:inline max-w-[92px] truncate font-mono">
            {ghAuth.status === "authenticated" && ghAuth.user ? `@${ghAuth.user.login}` : "GitHub"}
          </span>
        </button>

        {/* Unified macOS-Exceeding System Utility Capsule */}
        <div className="flex items-center gap-0.5 px-1 h-6 rounded-full bg-white/[0.045] border border-white/10">
          <button
            type="button"
            onClick={() => wmStore.openApp("settings", { tab: "network" })}
            className="hidden xl:flex items-center justify-center w-5.5 h-5 rounded-full hover:bg-white/12 transition cursor-pointer"
            title={`Réseau Wisp : ${vm.wispActiveUrl}`}
          >
            <Wifi className={`w-3 h-3 ${vm.wispActiveUrl !== "offline" ? "text-emerald-400" : "text-zinc-500"}`} />
          </button>

          <button
            type="button"
            onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.toggleMute()))}
            className="hidden sm:flex items-center justify-center w-5.5 h-5 rounded-full text-zinc-300 hover:text-white hover:bg-white/12 transition cursor-pointer"
            title="Son Linux"
          >
            {vm.audioMuted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => wmStore.toggleNotificationCenter()}
            className={`relative flex items-center justify-center w-5.5 h-5 rounded-full transition cursor-pointer ${
              wm.notificationCenterOpen
                ? "bg-violet-500/35 text-white"
                : "text-zinc-300 hover:text-white hover:bg-white/12"
            }`}
            title="Centre de notifications"
          >
            <Bell className="w-3 h-3" />
            {wm.unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-[12px] px-0.5 rounded-full bg-rose-500 text-[8px] font-mono font-bold text-white flex items-center justify-center">
                {wm.unreadNotifications > 9 ? "9+" : wm.unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => wmStore.toggleControlCenter()}
            className={`flex items-center justify-center w-5.5 h-5 rounded-full transition cursor-pointer ${
              wm.controlCenterOpen
                ? "bg-violet-500/35 text-white"
                : "text-zinc-300 hover:text-white hover:bg-white/12"
            }`}
            title="Centre de contrôle"
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => wmStore.toggleCommandPalette()}
            className="hidden sm:flex items-center gap-0.5 px-1.5 h-4.5 rounded-full hover:bg-white/12 text-[10px] font-mono text-zinc-300 hover:text-white transition cursor-pointer"
            title="Palette de commandes (⌘K)"
          >
            <Command className="w-2.5 h-2.5" />K
          </button>
        </div>

        {/* Crisp Tabular Clock & Lock Trigger */}
        <button
          type="button"
          onClick={() => wmStore.setLocked(true)}
          title="Verrouiller l'écran (⌘⇧L)"
          className="font-mono text-[11.5px] font-semibold text-zinc-100 hover:text-white px-1.5 h-6 rounded-full hover:bg-white/10 tabular-nums transition cursor-pointer"
        >
          {clock}
        </button>
      </div>
    </header>
  );
};
