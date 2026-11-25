import { Effect } from "effect";
import {
  Activity,
  ClipboardList,
  Cpu,
  Globe,
  LayoutPanelLeft,
  Lock,
  Mic,
  MicOff,
  Sparkles,
  Workflow,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { executeOsAction, useAgentApi } from "../core/agent-os-api.ts";
import { useSubscriptionRef, VmService } from "../core/runtime.ts";
import { useT3Code } from "../core/t3code-store.ts";
import { useVoiceOs, voiceOsEngine } from "../core/voice-os.ts";
import { wmStore } from "../wm/wm-store.ts";

/**
 * Visionary Dynamic Island / Live Activity Pill centered in TopBar.
 * Morphs seamlessly with Voice OS, Agent OS API bursts, Live Guest Ports & VM status.
 */
export const DynamicIsland: React.FC = () => {
  const voice = useVoiceOs();
  const api = useAgentApi();
  const t3 = useT3Code();
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

  const [expanded, setExpanded] = useState(false);
  const [recentApiFlash, setRecentApiFlash] = useState<string | null>(null);

  const latestCall = api.logs[0];
  useEffect(() => {
    if (!latestCall) return;
    if (Date.now() - latestCall.timestamp > 4000) return;
    setRecentApiFlash(`${latestCall.method} · ${latestCall.durationMs}ms`);
    const t = setTimeout(() => setRecentApiFlash(null), 3200);
    return () => clearTimeout(t);
  }, [latestCall?.id]);

  const activePort = vm.detectedPorts[0]?.port;

  return (
    <div className="hidden md:flex items-center justify-center relative">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`group flex items-center gap-2 px-3 h-[26px] rounded-full border transition-all duration-300 active:scale-95 ${
          voice.listening
            ? "bg-gradient-to-r from-violet-600/80 via-fuchsia-600/80 to-cyan-500/80 border-white/40 text-white shadow-[0_0_24px_rgba(139,92,246,0.65)] scale-105"
            : recentApiFlash
            ? "bg-emerald-500/20 border-emerald-400/45 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
            : expanded
            ? "bg-white/14 border-white/30 text-white"
            : "bg-black/65 hover:bg-black/80 border-white/14 text-zinc-200 shadow-inner"
        }`}
        title="unkernelOS Dynamic Island — Click for Live Controls"
      >
        {voice.listening ? (
          <>
            <span className="flex items-end gap-0.5 h-3">
              {[0.5, 1, 0.7, 0.9].map((k, i) => (
                <span
                  key={i}
                  style={{ height: `${Math.max(4, Math.round(4 + voice.audioLevel * 10 * k))}px` }}
                  className="w-0.5 rounded-full bg-white transition-all duration-75"
                />
              ))}
            </span>
            <span className="text-[11px] font-medium max-w-[160px] truncate">
              {voice.transcript || "Listening..."}
            </span>
          </>
        ) : recentApiFlash ? (
          <>
            <Workflow className="w-3 h-3 text-emerald-300 animate-pulse" />
            <span className="text-[10px] font-mono truncate max-w-[180px]">{recentApiFlash}</span>
          </>
        ) : t3.status === "running" && (t3.metrics.threadsActive > 0 || t3.metrics.threadsWaiting > 0) ? (
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                t3.metrics.threadsWaiting > 0 ? "bg-amber-400" : "bg-violet-400"
              }`}
            />
            <span className="text-[10px] font-mono text-violet-200">
              T3 · {t3.metrics.threadsActive} act
              {t3.metrics.threadsWaiting > 0 ? ` · ${t3.metrics.threadsWaiting} wait` : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-mono text-emerald-300">
              ${t3.metrics.costTodayUsd.toFixed(2)}
            </span>
          </>
        ) : activePort ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-200">LIVE :{activePort}</span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-mono text-zinc-400">{vm.cpus} vCPU</span>
          </>
        ) : vm.phase === "booting" ? (
          <>
            <Sparkles className="w-3 h-3 text-amber-300 animate-spin" />
            <span className="text-[10px] font-mono text-amber-200">
              Booting {Math.round(vm.bootProgress)}%
            </span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-[10px] font-mono text-zinc-300">
              {api.bridgeAttached ? "Agent OS Ready" : "unkernelOS"}
            </span>
            {api.totalCalls > 0 && (
              <span className="text-[9px] font-mono px-1 rounded bg-white/10 text-cyan-300">
                {api.totalCalls}
              </span>
            )}
          </>
        )}
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-[78]" onClick={() => setExpanded(false)} />
          <div
            style={{ top: "calc(42px + env(safe-area-inset-top))" }}
            className="fixed left-1/2 -translate-x-1/2 z-[86] w-[360px] rounded-3xl glass-surface-focused p-3.5 space-y-3 shadow-2xl animate-window-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Live OS Hub
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {vm.distro} · {vm.cpus}c · {vm.transport}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.openApp("t3-code");
                }}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-gradient-to-r from-violet-500/20 to-cyan-500/18 hover:from-violet-500/30 hover:to-cyan-500/28 border border-violet-400/35 text-left text-zinc-100 transition col-span-2"
              >
                <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold flex items-center justify-between">
                    <span>T3 Code Harness</span>
                    <span className="text-[9.5px] font-mono text-emerald-300">
                      ${t3.metrics.costTodayUsd.toFixed(3)} · {t3.metrics.tokensTotal.toLocaleString()} tok
                    </span>
                  </div>
                  <div className="text-[9px] text-zinc-300">
                    {t3.status === "running"
                      ? `${t3.metrics.threadsActive} threads actifs · ${t3.metrics.subagentsActive} sous-agents`
                      : "Claude, Pi, Codex & Antigravity · Cliquer pour ouvrir"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  voiceOsEngine.toggleOpen();
                }}
                className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition ${
                  voice.listening
                    ? "bg-violet-500/30 border-violet-300/50 text-white"
                    : "bg-white/[0.04] hover:bg-white/10 border-white/10 text-zinc-200"
                }`}
              >
                {voice.listening ? (
                  <MicOff className="w-4 h-4 text-rose-300 shrink-0" />
                ) : (
                  <Mic className="w-4 h-4 text-violet-400 shrink-0" />
                )}
                <div>
                  <div className="text-[11px] font-semibold">Voice OS</div>
                  <div className="text-[9px] text-zinc-400">Speak commands</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.toggleClipboard();
                }}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-left text-zinc-200 transition"
              >
                <ClipboardList className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold">Clipboard</div>
                  <div className="text-[9px] text-zinc-400">History ⌘⇧V</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  void executeOsAction("wm.tile", { layout: "focus-ide-preview" }, { source: "ui" });
                }}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-left text-zinc-200 transition"
              >
                <LayoutPanelLeft className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold">Dev Split</div>
                  <div className="text-[9px] text-zinc-400">IDE + Preview</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.openApp("agent-api");
                }}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-left text-zinc-200 transition"
              >
                <Workflow className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold">Agent API</div>
                  <div className="text-[9px] text-zinc-400">{api.totalCalls} calls</div>
                </div>
              </button>
            </div>

            {vm.detectedPorts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/8">
                <span className="text-[10px] text-zinc-500">Live Servers:</span>
                {vm.detectedPorts.map((p) => (
                  <button
                    key={p.port}
                    type="button"
                    onClick={() => {
                      setExpanded(false);
                      wmStore.openPreview(p.port, "/");
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/18 border border-emerald-400/35 text-[10px] font-mono text-emerald-200 hover:bg-emerald-500/30"
                  >
                    <Globe className="w-2.5 h-2.5" />
                    :{p.port}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-white/8 text-[10px] text-zinc-400">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.openApp("monitor");
                }}
                className="flex items-center gap-1 hover:text-white"
              >
                <Activity className="w-3 h-3 text-cyan-400" />
                Monitor
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.openApp("processes");
                }}
                className="flex items-center gap-1 hover:text-white"
              >
                <Cpu className="w-3 h-3 text-rose-400" />
                Processes
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  wmStore.setLocked(true);
                }}
                className="flex items-center gap-1 hover:text-white"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                Lock
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
