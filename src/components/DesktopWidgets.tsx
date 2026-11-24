import { Effect } from "effect";
import {
  Bot,
  Cpu,
  GitBranch,
  Globe,
  Layers,
  StickyNote,
  Terminal,
  Wifi,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { SettingsService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../core/schema.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

const SCRATCH_KEY = "unkernelos:desktop-scratchpad:v1";

export const DesktopWidgets: React.FC = () => {
  const wm = useWm();
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

  const [now, setNow] = useState(() => new Date());
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem(SCRATCH_KEY) ?? "Welcome to unkernelOS AAA WebOS.\n• ⌘K Command Palette\n• ⌘E Mission Control\n• ⌃1–4 Switch Desktop\n• Drag windows to edges to snap!";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!cfg.desktopWidgets) return null;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const jitCompiled = vm.stats?.jit?.compiled ?? 0;
  const jitActivityPct = Math.min(100, Math.max(14, Math.round(Math.log10(jitCompiled + 10) * 22)));

  return (
    <div className="fixed top-12 right-5 z-[5] w-68 hidden sm:flex flex-col gap-3 select-none">
      {/* Glass Clock Widget */}
      <div className="glass-widget rounded-3xl p-4">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          <span>Desktop {wm.activeWorkspace}</span>
          <span className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                vm.phase === "running" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`}
            />
            {vm.phase}
          </span>
        </div>
        <div className="mt-1 text-4xl font-semibold tracking-tight text-white tabular-nums">
          {timeStr}
        </div>
        <div className="text-xs text-zinc-400 capitalize mt-0.5">{dateStr}</div>
      </div>

      {/* Live Linux VM Telemetry Widget */}
      <div className="glass-widget rounded-3xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            Linux 7.x Kernel
          </span>
          <span className="text-[10px] font-mono text-zinc-400 capitalize">
            {vm.distro} · {vm.cpus} vCPU
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-zinc-400">
            <span>RAM · JIT</span>
            <span>{vm.memoryMiB} MiB · {jitCompiled.toLocaleString()} blks</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-700"
              style={{ width: `${jitActivityPct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300">
            JIT:{cfg.jit ? "ON" : "OFF"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-emerald-300">
            GL:{vm.glStatus?.state === "ready" ? "ON" : vm.glStatus?.state ?? "OFF"}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-cyan-300">
            <Wifi className="w-2.5 h-2.5" />
            {vm.wispActiveUrl === "offline" ? "off" : "wisp"}
          </span>
        </div>

        {vm.detectedPorts.length > 0 && (
          <div className="pt-1.5 border-t border-white/8 flex flex-wrap gap-1">
            {vm.detectedPorts.slice(0, 4).map((p) => (
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

      {/* Quick Launch Widget */}
      <div className="glass-widget rounded-2xl p-2 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => wmStore.openApp("agent-studio")}
          className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          title="Agent Studio"
        >
          <Bot className="w-4 h-4 text-violet-400" />
          <span className="text-[9px]">Studio</span>
        </button>
        <button
          type="button"
          onClick={() => wmStore.openApp("terminal")}
          className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          title="Kitty Terminal"
        >
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-[9px]">Term</span>
        </button>
        <button
          type="button"
          onClick={() => wmStore.openApp("git")}
          className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          title="Git & Pages"
        >
          <GitBranch className="w-4 h-4 text-orange-400" />
          <span className="text-[9px]">Git</span>
        </button>
        <button
          type="button"
          onClick={() => wmStore.toggleMissionControl()}
          className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          title="Mission Control (⌘E)"
        >
          <Layers className="w-4 h-4 text-fuchsia-400" />
          <span className="text-[9px]">Spaces</span>
        </button>
      </div>

      {/* Persistent Desktop Scratchpad */}
      <div className="glass-widget rounded-3xl p-3.5 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300/90">
          <StickyNote className="w-3.5 h-3.5" />
          Quick Scratchpad
        </div>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            try {
              localStorage.setItem(SCRATCH_KEY, e.target.value);
            } catch {
              // ignore quota
            }
          }}
          rows={4}
          placeholder="Jot down commands, prompts, or ideas..."
          className="w-full bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none resize-none leading-relaxed select-text"
        />
      </div>
    </div>
  );
};
