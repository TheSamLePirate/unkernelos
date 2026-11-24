import { Effect } from "effect";
import {
  Bell,
  Command,
  Cpu,
  Download,
  GitBranch,
  Globe,
  Layers,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { INITIAL_GITHUB_AUTH } from "../core/github-auth-service.ts";
import { pwaStore, usePwa } from "../core/pwa-service.ts";
import { appRuntime, GithubAuthService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { APP_CATALOG, useWm, wmStore, type WorkspaceId } from "../wm/wm-store.ts";

const WORKSPACES: readonly WorkspaceId[] = [1, 2, 3, 4];

export const TopBar: React.FC = () => {
  const wm = useWm();
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
      ? "bg-emerald-400"
      : vm.phase === "booting"
      ? "bg-amber-400 animate-pulse"
      : vm.phase === "suspended"
      ? "bg-sky-400"
      : "bg-rose-400";

  return (
    <header
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      className="fixed top-0 left-0 right-0 min-h-[36px] z-50 glass-bar px-2.5 sm:px-3 flex items-center justify-between text-xs select-none"
    >
      {/* Left: Brand, Active App & Workspaces */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="flex items-center gap-1.5 sm:gap-2 font-semibold text-white hover:opacity-90 transition shrink-0"
        >
          <span className="w-4.5 h-4.5 rounded-md bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-[10px] font-bold shadow">
            U
          </span>
          <span className="tracking-tight hidden xs:inline sm:inline">unkernelOS</span>
        </button>

        <span className="text-white/20 hidden sm:inline">/</span>
        <span className="font-medium text-zinc-200 max-w-[100px] sm:max-w-[110px] truncate">{activeTitle}</span>

        {/* Workspaces 1–4 Switcher */}
        <div className="hidden sm:flex items-center gap-0.5 ml-1 p-0.5 rounded-full bg-white/[0.05] border border-white/10">
          {WORKSPACES.map((ws) => {
            const active = wm.activeWorkspace === ws;
            const hasWins = wm.windows.some((w) => w.workspace === ws);
            return (
              <button
                key={ws}
                type="button"
                onClick={() => wmStore.switchWorkspace(ws)}
                title={`Desktop ${ws} (⌃${ws})`}
                className={`relative px-2 py-0.5 rounded-full text-[10px] font-mono transition ${
                  active
                    ? "bg-white/18 text-white font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/8"
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
          className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] transition ${
            wm.missionControlOpen
              ? "bg-violet-500/25 border-violet-400/45 text-white"
              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Layers className="w-3 h-3" />
        </button>

        {/* Live Detected Ports Pill */}
        {vm.detectedPorts.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 ml-1">
            {vm.detectedPorts.slice(0, 3).map((p) => (
              <button
                key={p.port}
                type="button"
                onClick={() => wmStore.openPreview(p.port, "/")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/25 transition"
              >
                <Globe className="w-2.5 h-2.5" />
                :{p.port}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Live VM Telemetry Pills + Quick Controls + Control Center */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Compact Mobile VM Telemetry Pill */}
        <button
          type="button"
          onClick={() => wmStore.openApp("monitor")}
          className="flex md:hidden items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-mono text-zinc-200"
          title={`Linux ${vm.distro} · ${vm.cpus} vCPU · ${vm.transport}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span>{vm.cpus}c</span>
          {vm.transport === "shared" && (
            <span className="text-[8px] px-1 rounded bg-emerald-500/20 text-emerald-300">SAB</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => wmStore.openApp("monitor")}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] font-mono text-zinc-300 transition"
          title={`Transport: ${vm.transport} · COI: ${vm.crossOriginIsolated ? "ON" : "OFF"} · Click for System Monitor`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="capitalize">{vm.distro}</span>
          <span className="text-white/20">·</span>
          <Cpu className="w-3 h-3 text-cyan-400" />
          <span>{vm.cpus}c</span>
          {vm.transport === "shared" && (
            <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">SAB</span>
          )}
          <span className="text-white/20">·</span>
          <span>{vm.memoryMiB}M</span>
          {vm.glStatus && (
            <>
              <span className="text-white/20">·</span>
              <span className={vm.glStatus.state === "ready" ? "text-emerald-300" : "text-cyan-300"}>
                GL:{vm.glStatus.state === "ready" ? "ON" : vm.glStatus.state}
              </span>
            </>
          )}
        </button>

        {pwa.installable && !pwa.installed && (
          <button
            type="button"
            onClick={() => void pwaStore.promptInstall()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-600/80 to-cyan-500/80 text-[10px] font-medium text-white hover:brightness-110 transition"
            title="Install unkernelOS as a native Desktop/Mobile PWA"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}

        <button
          type="button"
          onClick={() => wmStore.setGithubModal(true)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] transition ${
            ghAuth.status === "authenticated" && ghAuth.user
              ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20"
              : "bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/12"
          }`}
          title="Connect GitHub Account"
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
          <span className="hidden sm:inline max-w-[96px] truncate font-mono">
            {ghAuth.status === "authenticated" && ghAuth.user ? `@${ghAuth.user.login}` : "GitHub"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => wmStore.openApp("settings", { tab: "network" })}
          className="hidden xl:flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-400 transition"
          title={`Wisp Relay: ${vm.wispActiveUrl}`}
        >
          <Wifi className={`w-3 h-3 ${vm.wispActiveUrl !== "offline" ? "text-emerald-400" : "text-zinc-500"}`} />
          <span>{vm.wispActiveUrl === "offline" ? "off" : "wisp"}</span>
        </button>

        <button
          type="button"
          onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.toggleMute()))}
          className="hidden sm:inline-flex p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="Toggle Guest Audio"
        >
          {vm.audioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => wmStore.toggleNotificationCenter()}
          className={`relative p-1 rounded-md transition ${
            wm.notificationCenterOpen
              ? "bg-violet-500/30 text-white"
              : "text-zinc-300 hover:text-white hover:bg-white/10"
          }`}
          title="Notification Center"
        >
          <Bell className="w-3.5 h-3.5" />
          {wm.unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-rose-500 text-[8px] font-mono font-bold text-white flex items-center justify-center">
              {wm.unreadNotifications > 9 ? "9+" : wm.unreadNotifications}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => wmStore.toggleControlCenter()}
          className={`p-1 rounded-md transition ${
            wm.controlCenterOpen
              ? "bg-violet-500/30 text-white"
              : "text-zinc-300 hover:text-white hover:bg-white/10"
          }`}
          title="Control Center (Themes, Shaders, Widgets, Lock)"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/12 border border-white/10 text-[11px] font-mono text-zinc-300 transition"
          title="Command Palette (⌘K)"
        >
          <Command className="w-3 h-3" />K
        </button>

        <button
          type="button"
          onClick={() => wmStore.setLocked(true)}
          title="Lock Screen (⌘L)"
          className="font-mono text-[11px] text-zinc-200 hover:text-white pl-1 tabular-nums transition"
        >
          {clock}
        </button>
      </div>
    </header>
  );
};
