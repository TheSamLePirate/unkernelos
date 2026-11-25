import { Effect } from "effect";
import {
  AlertTriangle,
  Check,
  Cpu,
  HardDrive,
  Loader2,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { appRuntime, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

const BOOT_MILESTONES = [
  { id: "wasm", label: "WASM", min: 14 },
  { id: "jit", label: "Compile", min: 48 },
  { id: "mem", label: "RAM", min: 66 },
  { id: "linux", label: "Linux", min: 84 },
  { id: "desktop", label: "Desktop", min: 97 },
] as const;

/**
 * Futuristic 60fps Canvas Orbital Quantum Core animation for the boot splash screen.
 * Scales rotational energy & aura intensity smoothly with live boot progress.
 */
const BootOrbitalCore: React.FC<{ progress: number; isError: boolean; done: boolean }> = ({
  progress,
  isError,
  done,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 152;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const draw = (now: number) => {
      const t = now * 0.001;
      const pct = Math.max(0, Math.min(1, progressRef.current / 100));
      const cx = size / 2;
      const cy = size / 2;

      ctx.clearRect(0, 0, size, size);

      // Ambient pulsing plasma halo
      const haloR = 54 + Math.sin(t * 2.4) * 4 + pct * 10;
      const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, haloR);
      if (isError) {
        halo.addColorStop(0, "rgba(244, 63, 94, 0.36)");
        halo.addColorStop(0.55, "rgba(244, 63, 94, 0.12)");
        halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (done) {
        halo.addColorStop(0, "rgba(16, 185, 129, 0.42)");
        halo.addColorStop(0.55, "rgba(34, 211, 238, 0.16)");
        halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        halo.addColorStop(0, "rgba(139, 92, 246, 0.38)");
        halo.addColorStop(0.5, "rgba(34, 211, 238, 0.16)");
        halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Background subtle track ring
      ctx.beginPath();
      ctx.arc(cx, cy, 56, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crisp live progress arc (top 12 o'clock clockwise)
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * Math.max(0.03, pct);
      const arcGrad = ctx.createLinearGradient(cx - 56, cy - 56, cx + 56, cy + 56);
      if (isError) {
        arcGrad.addColorStop(0, "#fb7185");
        arcGrad.addColorStop(1, "#f43f5e");
      } else if (done) {
        arcGrad.addColorStop(0, "#34d399");
        arcGrad.addColorStop(1, "#22d3ee");
      } else {
        arcGrad.addColorStop(0, "#a78bfa");
        arcGrad.addColorStop(0.5, "#e879f9");
        arcGrad.addColorStop(1, "#22d3ee");
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 56, startAngle, endAngle);
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();

      // Glowing tip comet on progress arc
      if (!isError) {
        const tx = cx + Math.cos(endAngle) * 56;
        const ty = cy + Math.sin(endAngle) * 56;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = done ? "#6ee7b7" : "#67e8f9";
        ctx.shadowColor = done ? "#34d399" : "#22d3ee";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Two counter-rotating elliptical orbital rings with glowing particles
      const rings = [
        { rx: 45, ry: 22, tilt: 0.45 + t * 0.55, speed: 1.8 + pct * 1.4, color: "rgba(167, 139, 250, 0.55)", dot: "#c4b5fd" },
        { rx: 45, ry: 22, tilt: -0.65 - t * 0.42, speed: -1.5 - pct * 1.2, color: "rgba(34, 211, 238, 0.5)", dot: "#67e8f9" },
      ];

      for (const r of rings) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(r.tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isError ? "rgba(244,63,94,0.3)" : r.color;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Orbiting particle
        const a = t * r.speed;
        const px = Math.cos(a) * r.rx;
        const py = Math.sin(a) * r.ry;
        ctx.beginPath();
        ctx.arc(px, py, 2.3, 0, Math.PI * 2);
        ctx.fillStyle = isError ? "#fda4af" : r.dot;
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isError, done]);

  return (
    <div className="relative w-[152px] h-[152px] flex items-center justify-center mx-auto">
      <canvas ref={canvasRef} className="w-[152px] h-[152px]" />
      <div
        className={`absolute w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-2xl border border-white/25 transition-all duration-300 ${
          isError
            ? "bg-gradient-to-br from-rose-500 to-red-700 shadow-rose-600/40"
            : done
            ? "bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-emerald-500/40 scale-105"
            : "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-violet-500/40"
        }`}
      >
        {done ? <Check className="w-7 h-7 stroke-[2.6]" /> : "U"}
      </div>
    </div>
  );
};

export const BootOverlay: React.FC = () => {
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "Initialisation…",
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

  // Smoothly interpolated progress with gentle forward micro-creep during long single milestones
  const [displayPct, setDisplayPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const targetRef = useRef(0);
  const phaseRef = useRef(vm.phase);
  phaseRef.current = vm.phase;
  targetRef.current = vm.phase === "running" ? 100 : vm.bootProgress;

  // Reset splash visibility when rebooting
  useEffect(() => {
    if (vm.phase === "booting" || vm.phase === "error" || vm.phase === "idle") {
      setDismissed(false);
      setFadingOut(false);
    }
  }, [vm.phase]);

  // Silky 60fps easing + subtle forward creep so the bar never appears frozen
  useEffect(() => {
    if (dismissed) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setDisplayPct((prev) => {
        const target = targetRef.current;
        if (phaseRef.current === "running") {
          const next = prev + (100 - prev) * Math.min(1, dt * 11);
          return next > 99.4 ? 100 : next;
        }
        if (phaseRef.current === "error") return prev;

        // If real progress is ahead, glide smoothly toward it
        if (target > prev + 0.05) {
          return prev + (target - prev) * Math.min(1, dt * 6.5);
        }
        // Otherwise, gently creep up to +7% ahead of the current milestone (capped at 96%)
        const creepCeiling = Math.min(96, Math.max(prev, target + 7));
        if (prev < creepCeiling) {
          const remaining = creepCeiling - prev;
          return prev + remaining * dt * 0.42;
        }
        return prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dismissed]);

  // Smooth fade-out once VM is running and bar reaches 100%
  useEffect(() => {
    if (vm.phase === "running" && displayPct >= 99.5 && !fadingOut) {
      const hold = window.setTimeout(() => {
        setFadingOut(true);
        window.setTimeout(() => setDismissed(true), 320);
      }, 220);
      return () => window.clearTimeout(hold);
    }
    if (vm.phase === "suspended") {
      setDismissed(true);
    }
  }, [vm.phase, displayPct, fadingOut]);

  if (dismissed || vm.phase === "suspended") return null;

  const isError = vm.phase === "error";
  const isDone = vm.phase === "running";
  const roundedPct = Math.round(displayPct);
  const latestLog = vm.kernelLogs[vm.kernelLogs.length - 1] ?? "";

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-[#05060b]/82 backdrop-blur-2xl px-4 transition-all duration-300 ${
        fadingOut ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <div className="relative w-full max-w-md rounded-[28px] glass-surface-focused p-6 sm:p-7 space-y-5 overflow-hidden">
        {/* Subtle top chromatic aurora highlight */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-44 rounded-full bg-gradient-to-r from-violet-500/25 via-fuchsia-500/20 to-cyan-400/25 blur-3xl" />

        {/* Orbital Quantum Core + Title */}
        <div className="relative flex flex-col items-center text-center space-y-2">
          <BootOrbitalCore progress={displayPct} isError={isError} done={isDone} />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-100 to-cyan-200">
              unkernelOS
            </h1>
            <p className="text-[11.5px] text-zinc-400">
              Linux 7.x WASM · aarch64 JIT · Agent-Native Desktop
            </p>
          </div>
        </div>

        {isError ? (
          <div className="relative p-4 rounded-2xl bg-rose-500/12 border border-rose-400/30 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <AlertTriangle className="w-4 h-4" />
              Démarrage du noyau interrompu
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono break-words select-text">
              {vm.error}
            </p>
            <div className="flex flex-wrap gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => appRuntime.runFork(Effect.flatMap(VmService, (v) => v.boot()).pipe(Effect.ignore))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réessayer
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Mode sans échec (1 CPU)
              </button>
              <button
                type="button"
                onClick={() => wmStore.openApp("settings")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200 transition"
              >
                <Settings className="w-3.5 h-3.5" />
                Réglages
              </button>
            </div>
          </div>
        ) : (
          <div className="relative space-y-4">
            {/* Stage label + numeric percentage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-200 flex items-center gap-2 min-w-0 truncate">
                  {isDone ? (
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                  )}
                  <span className="truncate">{vm.bootStage}</span>
                </span>
                <span className="font-mono font-semibold text-violet-200 tabular-nums shrink-0">
                  {roundedPct}%
                </span>
              </div>

              {/* Luminous Shimmer Progress Track */}
              <div className="relative h-2 w-full rounded-full bg-white/[0.08] overflow-hidden border border-white/10">
                <div
                  style={{ width: `${Math.max(4, displayPct)}%` }}
                  className={`relative h-full rounded-full transition-[background] duration-300 ${
                    isDone
                      ? "bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]"
                      : "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_14px_rgba(139,92,246,0.7)]"
                  }`}
                >
                  {!isDone && <div className="absolute inset-0 boot-shimmer" />}
                </div>
              </div>
            </div>

            {/* 5-Stage Progressive Milestone Pills */}
            <div className="grid grid-cols-5 gap-1.5">
              {BOOT_MILESTONES.map((m, idx) => {
                const nextMin = BOOT_MILESTONES[idx + 1]?.min ?? 100;
                const completed = isDone || displayPct >= nextMin;
                const active = !completed && displayPct >= m.min;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-xl border text-[10px] font-mono transition-all duration-300 ${
                      completed
                        ? "bg-emerald-500/12 border-emerald-400/35 text-emerald-200"
                        : active
                        ? "bg-violet-500/18 border-violet-400/45 text-white shadow-[0_0_16px_rgba(139,92,246,0.22)]"
                        : "bg-white/[0.025] border-white/6 text-zinc-500"
                    }`}
                  >
                    <span className="flex items-center justify-center w-3.5 h-3.5">
                      {completed ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : active ? (
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                      )}
                    </span>
                    <span className="leading-none">{m.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Hardware / Runtime Telemetry Cards */}
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-zinc-400">
              <div className="px-2.5 py-2 rounded-xl bg-white/[0.035] border border-white/8">
                <span className="text-zinc-500 flex items-center gap-1 text-[9px] uppercase">
                  <HardDrive className="w-2.5 h-2.5" /> Distro
                </span>
                <span className="text-zinc-100 capitalize font-medium">{vm.distro}</span>
              </div>
              <div className="px-2.5 py-2 rounded-xl bg-white/[0.035] border border-white/8">
                <span className="text-zinc-500 flex items-center gap-1 text-[9px] uppercase">
                  <Cpu className="w-2.5 h-2.5" /> Compute
                </span>
                <span className="text-zinc-100 font-medium">
                  {vm.cpus}c · {vm.memoryMiB}M
                </span>
              </div>
              <div className="px-2.5 py-2 rounded-xl bg-white/[0.035] border border-white/8">
                <span className="text-zinc-500 flex items-center gap-1 text-[9px] uppercase">
                  <Sparkles className="w-2.5 h-2.5" /> Graphics
                </span>
                <span className="text-cyan-300 font-medium">
                  {vm.webgpuAvailable ? "WebGPU" : "Canvas2D"}
                </span>
              </div>
            </div>

            {/* Live Kernel Boot Ticker */}
            {latestLog && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/45 border border-white/8 text-[10px] font-mono text-zinc-400">
                <Terminal className="w-3 h-3 text-violet-400 shrink-0" />
                <span className="truncate">{latestLog}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
