import { Effect } from "effect";
import { Activity, Cpu, HardDrive, Network, Terminal, Zap } from "lucide-react";
import React from "react";
import { useSubscriptionRef, VmService } from "../../core/runtime.ts";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export const SystemMonitorApp: React.FC = () => {
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

  const st = vm.stats;

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0c13]/94 overflow-hidden">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-white/10 shrink-0">
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            Compute (SMP)
          </div>
          <div className="text-lg font-semibold font-mono text-white">
            {vm.cpus} vCPU{vm.cpus > 1 ? "s" : ""}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            {vm.memoryMiB} MiB RAM · {vm.transport}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            kwemu WASM JIT
          </div>
          <div className="text-lg font-semibold font-mono text-white">
            {st?.jit ? `${st.jit.compiled.toLocaleString()} blks` : "—"}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            {st?.jit ? `Live: ${st.jit.live.toLocaleString()} · ${Math.round(st.jit.compileMs)} ms` : "Standby"}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <HardDrive className="w-3.5 h-3.5 text-violet-400" />
            Block I/O (kwblk)
          </div>
          <div className="text-lg font-semibold font-mono text-white">
            {st?.block ? fmtBytes(st.block.bytesRead + st.block.bytesWritten) : "0 B"}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            R: {st?.block ? fmtBytes(st.block.bytesRead) : "0"} · W: {st?.block ? fmtBytes(st.block.bytesWritten) : "0"}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            Wisp Net
          </div>
          <div className="text-lg font-semibold font-mono text-white">
            {st?.net ? fmtBytes(st.net.rx + st.net.tx) : "0 B"}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 truncate">
            {vm.wispActiveUrl || "Offline"}
          </div>
        </div>
      </div>

      {/* Environment Facts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-white/8 text-[11px] font-mono shrink-0">
        <div>
          <span className="text-zinc-500">Uptime: </span>
          <span className="text-zinc-200">{st ? fmtUptime(st.uptimeMs) : "0s"}</span>
        </div>
        <div>
          <span className="text-zinc-500">COI / SAB: </span>
          <span className={vm.crossOriginIsolated ? "text-emerald-300" : "text-amber-300"}>
            {vm.crossOriginIsolated ? "Active" : "No"}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">WebGPU: </span>
          <span className={vm.webgpuAvailable ? "text-violet-300" : "text-zinc-400"}>
            {vm.webgpuAvailable ? "Available" : "Fallback 2D"}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Guest GL: </span>
          <span className="text-cyan-300">{vm.glStatus?.state ?? "off"}</span>
        </div>
      </div>

      {/* Live Kernel Console / dmesg */}
      <div className="flex-1 min-h-0 flex flex-col bg-black/60">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/8 text-xs text-zinc-400">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-mono">Linux Kernel Ring Buffer (dmesg / hvc0)</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
            <Activity className="w-3 h-3" />
            {vm.kernelLogs.length} lines
          </span>
        </div>
        <pre className="flex-1 overflow-y-auto p-4 text-[11px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
          {vm.kernelLogs.join("\n") || "Waiting for kernel output..."}
        </pre>
      </div>
    </div>
  );
};
