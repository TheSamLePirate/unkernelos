import { Effect } from "effect";
import {
  Activity,
  Bot,
  Box,
  CheckCircle2,
  Cpu,
  DollarSign,
  Download,
  ExternalLink,
  FolderPlus,
  Gauge,
  Globe,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  Square,
  Terminal,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { modStore } from "../../core/mod-store.ts";
import { reactiveEngine, useReactiveMod } from "../../core/reactive-mod-engine.ts";
import { appRuntime, VmService } from "../../core/runtime.ts";
import { t3CodeStore, useT3Code } from "../../core/t3code-store.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

type T3ViewTab = "harness" | "metrics" | "logs";

export const T3CodeApp: React.FC = () => {
  const t3 = useT3Code();
  const wm = useWm();
  const reactive = useReactiveMod();
  const [view, setView] = useState<T3ViewTab>("harness");
  const [remoteDraft, setRemoteDraft] = useState(t3.remoteUrl);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    t3CodeStore.startPolling();
    void t3CodeStore.refreshProbe();
  }, []);

  useEffect(() => {
    setRemoteDraft(t3.remoteUrl);
  }, [t3.remoteUrl]);

  const m = t3.metrics;
  const isLive = t3.status === "running" && Boolean(t3.embedUrl);
  const isBusy = t3.status === "starting" || t3.status === "installing";

  const topbarSurf = reactive.surfaces.find((s) => s.id === "surf-t3-topbar-metrics");
  const panel3dSurf = reactive.surfaces.find((s) => s.id === "surf-t3-3d-command-deck");
  const hudSurf = reactive.surfaces.find((s) => s.id === "surf-hud-telemetry");

  const toggleSurface = (id: string) => {
    const s = reactive.surfaces.find((x) => x.id === id);
    if (!s) return;
    reactiveEngine.upsertSurface({ ...s, enabled: !s.enabled });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#080a11] text-zinc-100 overflow-hidden select-none">
      {/* ─── AAA CONTROL HEADER BAR ─────────────────────────────────────── */}
      <header className="px-3 py-2 bg-gradient-to-r from-[#101426] via-[#0c1020] to-[#131126] border-b border-white/[0.09] flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: Brand, Mode Switcher & View Tabs */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 pr-1">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-violet-600/30">
              T3
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                T3 Code Harness
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive
                      ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                      : isBusy
                      ? "bg-amber-400 animate-pulse"
                      : "bg-zinc-500"
                  }`}
                />
              </div>
              <div className="text-[9.5px] font-mono text-zinc-400">
                {t3.mode === "remote"
                  ? "Serveur Distant / Hôte"
                  : t3.version
                  ? `${t3.version} · :${t3.port}`
                  : `VM Linux · :${t3.port}`}
              </div>
            </div>
          </div>

          {/* Segmented Mode Toggle: VM vs Remote */}
          <div className="flex items-center p-0.5 rounded-xl bg-black/50 border border-white/10 text-[10.5px]">
            <button
              type="button"
              onClick={() => t3CodeStore.setMode("vm")}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition cursor-pointer ${
                t3.mode === "vm"
                  ? "bg-violet-500/30 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Cpu className="w-3 h-3" />
              VM Linux
            </button>
            <button
              type="button"
              onClick={() => t3CodeStore.setMode("remote")}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition cursor-pointer ${
                t3.mode === "remote"
                  ? "bg-cyan-500/30 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Globe className="w-3 h-3" />
              Distant / Hôte
            </button>
          </div>

          {/* Sub-Views */}
          <div className="flex items-center gap-1">
            {(
              [
                ["harness", "Harnais", Bot],
                ["metrics", "Metrics & Surfaces", Gauge],
                ["logs", "Logs", Terminal],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition cursor-pointer ${
                  view === id
                    ? "bg-white/14 border-white/25 text-white"
                    : "bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Live Mini Telemetry + Daemon Controls */}
        <div className="flex items-center gap-1.5">
          {/* Live Metrics Micro-Pill */}
          <button
            type="button"
            onClick={() => setView("metrics")}
            className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/45 border border-white/10 text-[10px] font-mono text-zinc-300 hover:border-cyan-400/40 transition cursor-pointer"
            title="Voir les métriques détaillées, coûts & quotas T3 Code"
          >
            <span className="text-cyan-300">{m.threadsActive} actifs</span>
            <span className="text-white/20">·</span>
            <span className="text-violet-300">{m.tokensTotal.toLocaleString()} tok</span>
            <span className="text-white/20">·</span>
            <span className="text-emerald-300">${m.costTodayUsd.toFixed(3)}</span>
          </button>

          {t3.mode === "vm" ? (
            <>
              {isLive ? (
                <button
                  type="button"
                  onClick={() => void t3CodeStore.stopVmDaemon()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 text-rose-200 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void t3CodeStore.startVmDaemon(wm.activeWorkspaceDir)}
                  className="flex items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {t3.status === "installing"
                    ? "Installation…"
                    : t3.status === "starting"
                    ? "Démarrage…"
                    : "Démarrer T3"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void t3CodeStore.addProject(wm.activeWorkspaceDir)}
                title={`Ajouter le workspace actif (${wm.activeWorkspaceDir}) à T3 Code`}
                className="p-1.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/10 text-zinc-200 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-cyan-300" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={remoteDraft}
                onChange={(e) => setRemoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    t3CodeStore.setRemoteUrl(remoteDraft);
                    setIframeKey((k) => k + 1);
                  }
                }}
                placeholder="http://127.0.0.1:3773 ou https://..."
                className="w-48 px-2.5 py-1 rounded-xl bg-black/55 border border-white/12 text-[11px] font-mono text-cyan-200 outline-none select-text"
              />
              <button
                type="button"
                onClick={() => {
                  t3CodeStore.setRemoteUrl(remoteDraft);
                  setIframeKey((k) => k + 1);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/45 text-cyan-100 cursor-pointer"
              >
                Connecter
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void t3CodeStore.refreshProbe();
              setIframeKey((k) => k + 1);
            }}
            title="Rafraîchir la vue et les métriques"
            className="p-1.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/10 text-zinc-300 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {t3.embedUrl && (
            <button
              type="button"
              onClick={() => window.open(t3.embedUrl!, "_blank", "noopener,noreferrer")}
              title="Ouvrir T3 Code dans un nouvel onglet"
              className="p-1.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/10 text-zinc-300 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ─── VIEW 1: LIVE T3 CODE HARNESS WEBVIEW / LAUNCHER ────────────── */}
      {view === "harness" && (
        <div className="flex-1 min-h-0 relative flex flex-col">
          {isLive && t3.embedUrl ? (
            <iframe
              key={`${t3.embedUrl}-${iframeKey}`}
              src={t3.embedUrl}
              title="T3 Code Agent Harness"
              allow="clipboard-read; clipboard-write; microphone"
              className="w-full h-full border-0 bg-[#090b12]"
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
              <div className="max-w-2xl w-full space-y-5">
                <div className="p-6 rounded-3xl bg-gradient-to-br from-violet-500/14 via-[#0f1324] to-cyan-500/12 border border-white/12 shadow-2xl space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-mono text-cyan-200">
                        <Sparkles className="w-3 h-3" />
                        pingdotgg/t3code · Multi-Agent Control Plane
                      </div>
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        Harnais unifié Claude, Pi, Codex &amp; Antigravity dans unkernelOS
                      </h2>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Pilotez threads, sous-agents, worktrees Git isolés, approbations et métriques réelles (tokens, cache, coûts USD, limites) — connectés en direct au <strong>Moteur Réactif</strong>, aux <strong>shaders WebGPU</strong>, à la <strong>Dynamic Island</strong> et aux <strong>panneaux 3D</strong> de l&apos;OS.
                      </p>
                    </div>
                  </div>

                  {/* Provider Readiness Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {m.providers.map((p) => (
                      <div
                        key={p.id}
                        className={`p-2.5 rounded-2xl border ${
                          p.installed
                            ? "bg-emerald-500/10 border-emerald-400/30"
                            : "bg-white/[0.03] border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-white">{p.name}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              p.installed ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate mt-1">
                          {p.installed ? p.version || "Installé" : p.statusLabel}
                        </div>
                      </div>
                    ))}
                  </div>

                  {t3.error && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/35 text-xs font-mono text-rose-200 break-words">
                      {t3.error}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void t3CodeStore.startVmDaemon(wm.activeWorkspaceDir)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white hover:brightness-110 shadow-lg shadow-violet-700/30 disabled:opacity-50 cursor-pointer transition"
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {t3.binaryInstalled
                        ? `Démarrer T3 Code sur Linux (:${t3.port})`
                        : "Installer & Démarrer T3 Code dans Linux"}
                    </button>

                    <button
                      type="button"
                      onClick={() => t3CodeStore.setMode("remote")}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium bg-white/[0.07] hover:bg-white/14 border border-white/12 text-zinc-100 cursor-pointer transition"
                    >
                      <Server className="w-3.5 h-3.5 text-cyan-300" />
                      Connecter un Serveur T3 Hôte / Distant
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.syncCredentials()));
                        wmStore.pushToast("Clés API Synchronisées", "Injectées dans la VM pour T3 Code / Claude / Pi.", "success");
                      }}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Sync Clés API
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── VIEW 2: METRICS, USAGE, COST, LIMITS & EXPOSED OS SURFACES ─── */}
      {view === "metrics" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="max-w-4xl space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Threads / Sous-Agents
                </div>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {m.threadsActive} <span className="text-xs text-zinc-400">/ {m.threadsTotal}</span>
                </div>
                <div className="text-[10px] text-cyan-300 mt-0.5">
                  {m.subagentsActive} sous-agent(s) · {m.threadsWaiting} en attente
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  Tokens Totaux
                </div>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {m.tokensTotal.toLocaleString()}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  In {m.tokensInput.toLocaleString()} · Out {m.tokensOutput.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Coût Estimé
                </div>
                <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                  ${m.costTodayUsd.toFixed(4)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Cache read : {m.tokensCacheRead.toLocaleString()} tok
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  Daemon T3 Code
                </div>
                <div className="text-xl font-bold font-mono text-amber-200 mt-1 capitalize">
                  {t3.mode === "remote" ? "Remote" : t3.status}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                  {t3.pid ? `PID ${t3.pid} · :${t3.port}` : `Port :${t3.port}`}
                </div>
              </div>
            </div>

            {/* Providers & Limits */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="text-xs font-semibold text-white">
                Harnais Connectés &amp; Fenêtres de Limites (BYOS)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {m.providers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{p.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                          p.installed
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                            : "bg-white/8 text-zinc-400"
                        }`}
                      >
                        {p.installed ? p.version || "Connecté" : p.statusLabel}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Utilisation fenêtre</span>
                        <span className="text-cyan-300">{p.limitPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 transition-all duration-500"
                          style={{ width: `${Math.max(4, p.limitPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exposed OS Surfaces powered by T3 Code live signals */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 border border-cyan-400/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-300" />
                    Surfaces OS Exposées par T3 Code (Temps Réel)
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Tous les compteurs T3 sont publiés dans le Bus Réactif (<code>t3.threads.*</code>,{" "}
                    <code>t3.tokens.*</code>, <code>t3.cost.*</code>, <code>t3.limits.*</code>) pour vos thèmes, shaders WGSL &amp; surfaces.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    modStore.setBackdropImage(null);
                    modStore.setActiveShaderMod("shader-telemetry-reactor");
                    wmStore.pushToast("Shader Réacteur Activé", "Réagit en direct aux tokens T3 Code !", "success");
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 cursor-pointer shrink-0"
                >
                  ⚡ Lier au Shader WGSL
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => toggleSurface("surf-t3-topbar-metrics")}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    topbarSurf?.enabled
                      ? "bg-emerald-500/18 border-emerald-400/50 text-white"
                      : "bg-black/40 border-white/10 text-zinc-300 hover:bg-black/55"
                  }`}
                >
                  <div className="text-xs font-semibold">📊 Capsule TopBar T3</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Threads, tokens &amp; $coût dans la barre supérieure
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSurface("surf-t3-3d-command-deck")}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    panel3dSurf?.enabled
                      ? "bg-cyan-500/18 border-cyan-400/50 text-white"
                      : "bg-black/40 border-white/10 text-zinc-300 hover:bg-black/55"
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Box className="w-3 h-3 text-cyan-300" />
                    Panneau 3D T3 Metrics
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Tableau de bord spatial flottant en 3D Three.js
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSurface("surf-hud-telemetry")}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    hudSurf?.enabled
                      ? "bg-violet-500/18 border-violet-400/50 text-white"
                      : "bg-black/40 border-white/10 text-zinc-300 hover:bg-black/55"
                  }`}
                >
                  <div className="text-xs font-semibold">🛰️ HUD Overlay Télémétrie</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    CPU, RAM, Procs, Météo &amp; Tokens par-dessus le bureau
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Threads Table */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
              <div className="text-xs font-semibold text-white">
                Threads &amp; Sous-Agents Récents ({m.recentThreads.length})
              </div>
              {m.recentThreads.length === 0 ? (
                <div className="text-xs text-zinc-500 py-3">
                  Aucun thread détecté pour le moment. Démarrez T3 Code et lancez votre premier thread Claude ou Pi !
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {m.recentThreads.map((th) => (
                    <div key={th.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-100 truncate">
                          {th.isSubagent ? "↳ " : ""}
                          {th.title}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {th.provider} · {th.id}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-white/8 text-[10px] font-mono text-cyan-200 capitalize shrink-0">
                        {th.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW 3: DAEMON LOGS & INSTALLER DIAGNOSTICS ────────────────── */}
      {view === "logs" && (
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono text-zinc-300">
              Binaire :{" "}
              <span className={t3.binaryInstalled ? "text-emerald-300" : "text-amber-300"}>
                {t3.binaryInstalled ? `/usr/local/bin/t3 (${t3.version ?? "ok"})` : "Non installé"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void t3CodeStore.installInVm()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-100 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Installer / Mettre à jour T3 Code
              </button>
            </div>
          </div>
          <pre className="flex-1 min-h-0 overflow-auto p-3.5 rounded-2xl bg-black/70 border border-white/10 text-[11px] font-mono text-emerald-200 whitespace-pre-wrap select-text">
            {t3.logs || "Aucun log pour l'instant. Cliquez sur « Démarrer T3 » pour lancer le daemon sur :3773."}
          </pre>
        </div>
      )}
    </div>
  );
};
