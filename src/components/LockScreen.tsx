import { Effect } from "effect";
import { Cpu, LockOpen } from "lucide-react";
import React, { useEffect, useState } from "react";
import { INITIAL_GITHUB_AUTH } from "../core/github-auth-service.ts";
import { GithubAuthService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

export const LockScreen: React.FC = () => {
  const wm = useWm();
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

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!wm.locked) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        wmStore.setLocked(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [wm.locked]);

  if (!wm.locked) return null;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      onClick={() => wmStore.setLocked(false)}
      className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-2xl flex flex-col items-center justify-between py-16 px-6 cursor-pointer animate-overlay-fade select-none"
    >
      {/* Top Clock */}
      <div className="text-center space-y-2 mt-6">
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-white/60">
          {dateStr}
        </div>
        <div className="text-7xl sm:text-8xl font-semibold tracking-tight text-white drop-shadow-[0_12px_40px_rgba(0,0,0,0.6)] tabular-nums">
          {timeStr}
        </div>
      </div>

      {/* Center User + Live Kernel Pill */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-20 h-20 rounded-full p-0.5 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-2xl">
          {ghAuth.user?.avatarUrl ? (
            <img
              src={ghAuth.user.avatarUrl}
              alt={ghAuth.user.login}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-[#0d1018] flex items-center justify-center text-2xl font-bold text-white">
              U
            </div>
          )}
        </div>

        <div className="text-center">
          <div className="text-base font-semibold text-white">
            {ghAuth.user ? ghAuth.user.name : "unkernelOS"}
          </div>
          <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-mono text-zinc-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="capitalize">{vm.distro}</span>
            <span>·</span>
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span>{vm.cpus}c / {vm.memoryMiB}M</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => wmStore.setLocked(false)}
          className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-full glass-surface-focused text-xs font-semibold text-white hover:scale-105 transition cursor-pointer"
        >
          <LockOpen className="w-3.5 h-3.5 text-cyan-400" />
          Unlock Desktop
        </button>
      </div>

      <div className="text-[11px] font-mono text-white/45">
        Click anywhere or press Enter / Space to resume session
      </div>
    </div>
  );
};
