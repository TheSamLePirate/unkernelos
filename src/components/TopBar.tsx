import { Effect } from "effect";
import {
  Command,
  Cpu,
  Globe,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { appRuntime, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { APP_CATALOG, useWm, wmStore } from "../wm/wm-store.ts";

export const TopBar: React.FC = () => {
  const wm = useWm();
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
    <header className="fixed top-0 left-0 right-0 h-[34px] z-50 glass-bar px-3 flex items-center justify-between text-xs">
      {/* Left: Brand & Active App */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="flex items-center gap-2 font-semibold text-white hover:opacity-90 transition"
        >
          <span className="w-4 h-4 rounded-md bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-[10px] font-bold shadow">
            U
          </span>
          <span className="tracking-tight">unkernelOS</span>
        </button>

        <span className="text-white/20">/</span>
        <span className="font-medium text-zinc-200">{activeTitle}</span>

        {/* Live Detected Ports Pill */}
        {vm.detectedPorts.length > 0 && (
          <div className="hidden md:flex items-center gap-1 ml-2">
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

      {/* Right: Live VM Telemetry Pills + Quick Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => wmStore.openApp("monitor")}
          className="hidden sm:flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] font-mono text-zinc-300 transition"
          title="Open System Monitor"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="capitalize">{vm.distro}</span>
          <span className="text-white/20">·</span>
          <Cpu className="w-3 h-3 text-cyan-400" />
          <span>{vm.cpus}c</span>
          <span className="text-white/20">·</span>
          <span>{vm.memoryMiB}M</span>
        </button>

        <button
          type="button"
          onClick={() => wmStore.openApp("settings", { tab: "network" })}
          className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-400 transition"
          title={`Wisp Relay: ${vm.wispActiveUrl}`}
        >
          <Wifi className={`w-3 h-3 ${vm.wispActiveUrl !== "offline" ? "text-emerald-400" : "text-zinc-500"}`} />
          <span className="max-w-[110px] truncate">
            {vm.wispActiveUrl === "offline" ? "offline" : "wisp"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.toggleMute()))}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="Toggle Audio"
        >
          {vm.audioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {vm.phase === "suspended" ? (
          <button
            type="button"
            onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.resume()).pipe(Effect.ignore))}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px]"
          >
            <Play className="w-3 h-3" />
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.suspend()).pipe(Effect.ignore))}
            className="p-1 rounded-md text-zinc-400 hover:text-amber-300 hover:bg-white/10 transition"
            title="Suspend VM Snapshot"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.reboot()).pipe(Effect.ignore))}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="Reboot Linux Kernel"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => wmStore.toggleCommandPalette()}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/12 border border-white/10 text-[11px] font-mono text-zinc-300 transition"
          title="Command Palette (⌘K)"
        >
          <Command className="w-3 h-3" />K
        </button>

        <span className="font-mono text-[11px] text-zinc-300 pl-1">{clock}</span>
      </div>
    </header>
  );
};
