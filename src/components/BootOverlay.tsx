import { Effect } from "effect";
import { AlertTriangle, Cpu, RotateCcw, Settings, ShieldAlert } from "lucide-react";
import React from "react";
import { appRuntime, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

export const BootOverlay: React.FC = () => {
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "Initializing...",
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

  if (vm.phase === "running" || vm.phase === "suspended") return null;

  const isError = vm.phase === "error";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#06070c]/80 backdrop-blur-xl px-4">
      <div className="w-full max-w-md rounded-3xl glass-surface-focused p-6 space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-violet-500/30">
            U
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">unkernelOS</h1>
            <p className="text-xs text-zinc-400">
              Linux 7.x WASM · aarch64 JIT · WebGPU Desktop
            </p>
          </div>
        </div>

        {isError ? (
          <div className="p-4 rounded-2xl bg-rose-500/12 border border-rose-400/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <AlertTriangle className="w-4 h-4" />
              Kernel Boot Interrupted
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono break-words">
              {vm.error}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.boot()).pipe(Effect.ignore))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Boot
              </button>
              <button
                type="button"
                onClick={() =>
                  appRuntime.runFork(
                    Effect.flatMap(VmService, (v) => v.boot({ safeMode: true, cpus: 1, worker: false })).pipe(
                      Effect.ignore
                    )
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-amber-500/20 border border-amber-400/30 text-amber-200"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Safe Mode (1 CPU)
              </button>
              <button
                type="button"
                onClick={() => wmStore.openApp("settings")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200"
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-200 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                {vm.bootStage}
              </span>
              <span className="font-mono text-violet-300">{vm.bootProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                style={{ width: `${Math.max(6, vm.bootProgress)}%` }}
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-300"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-zinc-400">
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/8">
                <span className="text-zinc-500 block text-[9px]">DISTRO</span>
                <span className="text-zinc-200 capitalize">{vm.distro}</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/8">
                <span className="text-zinc-500 block text-[9px]">COMPUTE</span>
                <span className="text-zinc-200">{vm.cpus}c / {vm.memoryMiB}M</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/8">
                <span className="text-zinc-500 block text-[9px]">GPU</span>
                <span className="text-violet-300">{vm.webgpuAvailable ? "WebGPU" : "Canvas2D"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
