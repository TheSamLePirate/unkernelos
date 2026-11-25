import {
  Activity,
  Code2,
  Database,
  Globe,
  Layers,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { modStore } from "../../core/mod-store.ts";
import {
  reactiveEngine,
  useReactiveMod,
  type BindingTarget,
  type DataSourceKind,
  type ReactiveBinding,
  type ReactiveDataSource,
  type ReactiveScriptMod,
  type ReactiveSurface,
  type SurfaceContentType,
  type SurfaceSlot,
} from "../../core/reactive-mod-engine.ts";
import { wmStore } from "../../wm/wm-store.ts";

type ReactiveSubTab = "signals" | "bindings" | "scripts" | "surfaces";

const BINDING_TARGETS: readonly { id: BindingTarget; label: string }[] = [
  { id: "theme.accentPrimary", label: "Thème · Couleur Accent 1" },
  { id: "theme.accentSecondary", label: "Thème · Couleur Accent 2" },
  { id: "theme.blurPx", label: "Thème · Flou Verre (px)" },
  { id: "theme.glassOpacity", label: "Thème · Opacité Verre (0.45..0.95)" },
  { id: "eyecandy.nightShiftWarmth", label: "Optique · Night Shift (0..100)" },
  { id: "eyecandy.ambientParticles", label: "Particules · Mode (rain/snow/sakura/fireflies/none)" },
  { id: "eyecandy.ambientParticleDensity", label: "Particules · Densité (0.3..2.0)" },
  { id: "eyecandy.vignetteStrength", label: "Optique · Vignette (0..80)" },
  { id: "eyecandy.motionSpeed", label: "Animations · Vitesse (0.3..2.0)" },
  { id: "desktop3d.bloomIntensity", label: "3D · Intensité Bloom (0..2.0)" },
  { id: "desktop3d.cameraSpeed", label: "3D · Vitesse Caméra/Scène (0..2.0)" },
  { id: "desktop3d.particleDensity", label: "3D · Particules Scène (0.25..2.0)" },
  { id: "shell.dockMagStrength", label: "Dock · Force Zoom (0..1.0)" },
  { id: "shell.dockIconScale", label: "Dock · Taille Icônes (0.8..1.25)" },
  { id: "decorator.activeGlowPx", label: "Fenêtres · Halo Actif (0..64px)" },
  { id: "shader.custom0", label: "Shader WGSL · u.custom0" },
  { id: "shader.custom1", label: "Shader WGSL · u.custom1" },
  { id: "shader.custom2", label: "Shader WGSL · u.custom2" },
  { id: "shader.custom3", label: "Shader WGSL · u.custom3" },
  { id: "cssVar", label: "Variable CSS Globale (--custom)" },
];

const SURFACE_SLOTS: readonly { id: SurfaceSlot; label: string; desc: string }[] = [
  { id: "wallpaper", label: "Fond d'Écran (Wallpaper)", desc: "Plein écran derrière toutes les fenêtres" },
  { id: "desktop", label: "Bureau (Desktop)", desc: "Positionné sur le bureau" },
  { id: "overlay", label: "Overlay HUD", desc: "Flottant par-dessus les fenêtres" },
  { id: "topbar", label: "TopBar (Barre Supérieure)", desc: "Capsule inline dans la barre système" },
  { id: "dock", label: "Dock", desc: "Mini-widget intégré dans le Dock" },
  { id: "titlebar", label: "Barre de Titre", desc: "Badge dans la fenêtre active" },
  { id: "3d-panel", label: "Panneau Spatial 3D", desc: "Flottant dans l'espace Three.js 3D" },
];

const KIND_BADGE: Record<DataSourceKind, string> = {
  shell: "bg-emerald-500/20 text-emerald-200 border-emerald-400/35",
  python: "bg-amber-500/20 text-amber-200 border-amber-400/35",
  bun: "bg-pink-500/20 text-pink-200 border-pink-400/35",
  node: "bg-lime-500/20 text-lime-200 border-lime-400/35",
  http: "bg-cyan-500/20 text-cyan-200 border-cyan-400/35",
  js: "bg-violet-500/20 text-violet-200 border-violet-400/35",
};

export const ReactiveModStudioPane: React.FC = () => {
  const reactive = useReactiveMod();
  const [subTab, setSubTab] = useState<ReactiveSubTab>("signals");

  // Push custom signal quick tester
  const [testKey, setTestKey] = useState("custom.energy");
  const [testVal, setTestVal] = useState("0.85");

  // Source editor state
  const [editSrcId, setEditSrcId] = useState<string>(reactive.sources[0]?.id ?? "");
  const selectedSrc = reactive.sources.find((s) => s.id === editSrcId) ?? reactive.sources[0];

  // New Binding form
  const [newBindName, setNewBindName] = useState("");
  const [newBindTarget, setNewBindTarget] = useState<BindingTarget>("theme.accentPrimary");
  const [newBindCssVar, setNewBindCssVar] = useState("--my-reactive-var");
  const [newBindExpr, setNewBindExpr] = useState(
    "lerpColor('#38bdf8', '#f43f5e', clamp(sig('sys.cpu') / 100, 0, 1))"
  );

  // Script editor state
  const [editScriptId, setEditScriptId] = useState<string>(reactive.scripts[0]?.id ?? "");
  const selectedScript = reactive.scripts.find((s) => s.id === editScriptId) ?? reactive.scripts[0];

  // Surface editor state
  const [editSurfId, setEditSurfId] = useState<string>(reactive.surfaces[0]?.id ?? "");
  const selectedSurf = reactive.surfaces.find((s) => s.id === editSurfId) ?? reactive.surfaces[0];

  const signalList = Object.values(reactive.signals).sort((a, b) => a.key.localeCompare(b.key));
  const activeBindingsCount = reactive.bindings.filter((b) => b.enabled).length;
  const activeScriptsCount = reactive.scripts.filter((s) => s.enabled).length;
  const activeSurfacesCount = reactive.surfaces.filter((s) => s.enabled).length;
  const activeSourcesCount = reactive.sources.filter((s) => s.enabled).length;

  const activateCircadianPack = () => {
    reactiveEngine.setEngineEnabled(true);
    const wSrc = reactive.sources.find((s) => s.id === "src-weather-live");
    if (wSrc) reactiveEngine.upsertSource({ ...wSrc, enabled: true });
    const cScript = reactive.scripts.find((s) => s.id === "script-circadian-weather");
    if (cScript) reactiveEngine.upsertScript({ ...cScript, enabled: true });
    modStore.setBackdropImage(null);
    modStore.setActiveShaderMod("shader-circadian-sky");
    wmStore.pushToast(
      "Pack Circadien & Météo Actif",
      "Shader ciel solaire/météo, Night Shift, particules et couleurs synchronisés !",
      "success"
    );
  };

  const activateTelemetryReactorPack = () => {
    reactiveEngine.setEngineEnabled(true);
    const pSrc = reactive.sources.find((s) => s.id === "src-linux-proc-python");
    if (pSrc) reactiveEngine.upsertSource({ ...pSrc, enabled: true });
    const tScript = reactive.scripts.find((s) => s.id === "script-telemetry-reactor");
    if (tScript) reactiveEngine.upsertScript({ ...tScript, enabled: true });
    modStore.setBackdropImage(null);
    modStore.setActiveShaderMod("shader-telemetry-reactor");
    wmStore.pushToast(
      "Pack Réacteur Télémétrie & IA Actif",
      "Shader WGSL, thème, halo fenêtres & Dock pulsent avec CPU/RAM/Tokens !",
      "success"
    );
  };

  const activateSurfacesShowcasePack = () => {
    reactiveEngine.setEngineEnabled(true);
    for (const id of [
      "surf-topbar-weather-pulse",
      "surf-dock-meter",
      "surf-hud-telemetry",
      "surf-titlebar-badge",
      "surf-3d-holo-board",
    ]) {
      const s = reactive.surfaces.find((x) => x.id === id);
      if (s) reactiveEngine.upsertSurface({ ...s, enabled: true });
    }
    wmStore.pushToast(
      "Pack Surfaces HTML / Canvas / 3D Actif",
      "Capsule TopBar, Vu-Mètre Dock, HUD Overlay, Badge Titre & Panneau 3D montés !",
      "success"
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Hero Banner + 1-Click AAA Presets */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/15 via-violet-500/15 to-fuchsia-500/15 border border-cyan-400/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-300" />
              <h2 className="text-sm font-bold text-white">
                Moteur de Modding Réactif Temps Réel &amp; Surfaces HTML / Iframe / Canvas
              </h2>
            </div>
            <p className="text-[11px] text-zinc-300 mt-0.5">
              Connectez commandes Linux (<code>sh</code>, <code>python3</code>, <code>bun</code>, <code>node</code>), APIs Internet, télémétrie CPU/RAM/Procs/Tokens IA et scripts JS libres aux shaders WGSL, thèmes, 3D, TopBar, Dock et surfaces HTML/Iframe/Canvas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reactiveEngine.setEngineEnabled(!reactive.engineEnabled)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                reactive.engineEnabled
                  ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-100"
                  : "bg-white/8 border-white/15 text-zinc-400"
              }`}
            >
              Moteur : {reactive.engineEnabled ? "ACTIF" : "PAUSE"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Réinitialiser toutes les sources, liaisons, scripts et surfaces réactives ?")) return;
                reactiveEngine.resetAll();
                wmStore.pushToast("Moteur Réactif Réinitialisé", "Exemples d'usine restaurés.", "info");
              }}
              className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-300 cursor-pointer"
              title="Réinitialiser les presets réactifs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 1-Click AAA Demo Packs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={activateCircadianPack}
            className="text-left p-2.5 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-400/30 transition cursor-pointer"
          >
            <div className="text-xs font-semibold text-amber-200">🌅 Pack Circadien &amp; Météo Live</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Open-Meteo + Shader Ciel Solaire + Particules + Night Shift auto
            </div>
          </button>
          <button
            type="button"
            onClick={activateTelemetryReactorPack}
            className="text-left p-2.5 rounded-xl bg-black/40 hover:bg-black/55 border border-cyan-400/30 transition cursor-pointer"
          >
            <div className="text-xs font-semibold text-cyan-200">⚛️ Pack Réacteur CPU/RAM/Tokens IA</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Python3 /proc + Shader WGSL Réacteur + Glow &amp; Dock pulsants
            </div>
          </button>
          <button
            type="button"
            onClick={activateSurfacesShowcasePack}
            className="text-left p-2.5 rounded-xl bg-black/40 hover:bg-black/55 border border-fuchsia-400/30 transition cursor-pointer"
          >
            <div className="text-xs font-semibold text-fuchsia-200">🧩 Pack Surfaces TopBar / Dock / HUD / 3D</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Active capsule TopBar, vu-mètre Canvas Dock, HUD, badge titre &amp; panneau 3D
            </div>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["signals", `Signaux & Sources (${activeSourcesCount})`, Radio],
            ["bindings", `Liaisons Expressions (${activeBindingsCount})`, Activity],
            ["scripts", `Scripts JS Libres (${activeScriptsCount})`, Code2],
            ["surfaces", `Surfaces HTML / Iframe / Canvas (${activeSurfacesCount})`, Layers],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
              subTab === id
                ? "bg-cyan-500/22 border-cyan-400/55 text-white shadow"
                : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SUB-TAB 1: LIVE SIGNALS & DATA SOURCES (sh / python / bun / node / http / js)
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === "signals" && (
        <div className="space-y-4">
          {/* Live Telemetry Signals Grid */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                Bus de Signaux Temps Réel ({signalList.length} signaux · CSS <code>--sig-*</code> &amp; WGSL <code>u.*</code>)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    reactiveEngine.recordAgentActivity(4200, 1);
                    wmStore.pushToast("Pic Tokens IA", "+4 200 tokens injectés dans agent.tokens", "info");
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10.5px] bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 cursor-pointer"
                >
                  +4.2k Tokens IA (Test)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {signalList.map((s) => (
                <div
                  key={s.key}
                  className="px-2.5 py-1.5 rounded-xl bg-black/45 border border-white/[0.08] flex flex-col justify-between"
                >
                  <div className="text-[9.5px] font-mono text-zinc-400 truncate" title={s.key}>
                    {s.key}
                  </div>
                  <div className="text-xs font-mono font-bold text-cyan-200 truncate mt-0.5">
                    {String(s.value)}
                    {s.unit ? <span className="text-[9.5px] text-zinc-400 ml-0.5">{s.unit}</span> : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Push Custom Signal Bar */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.07]">
              <input
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                placeholder="clé (ex: custom.mood)"
                className="w-44 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none select-text"
              />
              <input
                value={testVal}
                onChange={(e) => setTestVal(e.target.value)}
                placeholder="valeur (nombre ou texte)"
                className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none select-text"
              />
              <button
                type="button"
                onClick={() => {
                  const num = Number(testVal);
                  reactiveEngine.pushSignal(
                    testKey.trim() || "custom.val",
                    testVal.trim() !== "" && Number.isFinite(num) ? num : testVal
                  );
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/45 text-cyan-100 cursor-pointer"
              >
                Pousser Signal
              </button>
            </div>
          </div>

          {/* Data Sources List + Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  Sources de Données ({reactive.sources.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const id = `src-custom-${Date.now().toString(36).slice(-4)}`;
                    const created: ReactiveDataSource = {
                      id,
                      name: "Nouvelle Source Linux / Web",
                      emoji: "⚡",
                      description: "Commande sh / python / bun / node ou URL HTTP JSON",
                      kind: "shell",
                      enabled: false,
                      intervalMs: 5000,
                      outputPrefix: "custom",
                      code: `echo '{"value": 42, "status": "ok"}'`,
                    };
                    reactiveEngine.upsertSource(created);
                    setEditSrcId(id);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/25 hover:bg-violet-500/35 border border-violet-400/45 text-violet-100 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Nouvelle Source
                </button>
              </div>

              <div className="space-y-1.5">
                {reactive.sources.map((src) => {
                  const selected = selectedSrc?.id === src.id;
                  return (
                    <div
                      key={src.id}
                      onClick={() => setEditSrcId(src.id)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer ${
                        selected
                          ? "bg-cyan-500/15 border-cyan-400/50"
                          : "bg-white/[0.025] border-white/[0.08] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{src.emoji}</span>
                          <span className="text-xs font-semibold text-white truncate">{src.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${KIND_BADGE[src.kind]}`}
                          >
                            {src.kind}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reactiveEngine.upsertSource({ ...src, enabled: !src.enabled });
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer ${
                              src.enabled
                                ? "bg-emerald-500/25 border-emerald-400/45 text-emerald-200"
                                : "bg-white/6 border-white/12 text-zinc-400"
                            }`}
                          >
                            {src.enabled ? "ON" : "OFF"}
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1 flex items-center justify-between gap-2">
                        <span className="truncate font-mono">
                          préfixe: {src.outputPrefix || "(racine)"} · {(src.intervalMs / 1000).toFixed(1)}s
                        </span>
                        {src.lastDurationMs !== undefined && (
                          <span className={src.lastError ? "text-rose-400" : "text-emerald-300"}>
                            {src.lastError ? "erreur" : `${src.lastDurationMs}ms`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Source Detail Editor */}
            {selectedSrc && (
              <div className="lg:col-span-7 p-3.5 rounded-2xl bg-black/40 border border-white/12 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={selectedSrc.name}
                    onChange={(e) => reactiveEngine.upsertSource({ ...selectedSrc, name: e.target.value })}
                    className="flex-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-semibold text-white outline-none select-text"
                  />
                  <button
                    type="button"
                    onClick={() => void reactiveEngine.runSource(selectedSrc.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/45 text-emerald-100 cursor-pointer"
                  >
                    <Play className="w-3 h-3" /> Exécuter
                  </button>
                  {!selectedSrc.builtin && (
                    <button
                      type="button"
                      onClick={() => reactiveEngine.removeSource(selectedSrc.id)}
                      className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">Type d&apos;exécuteur</label>
                    <select
                      value={selectedSrc.kind}
                      onChange={(e) =>
                        reactiveEngine.upsertSource({
                          ...selectedSrc,
                          kind: e.target.value as DataSourceKind,
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs text-white outline-none"
                    >
                      <option value="shell">Shell (sh unkernel)</option>
                      <option value="python">Python 3 (unkernel)</option>
                      <option value="bun">Bun (unkernel)</option>
                      <option value="node">Node.js (unkernel)</option>
                      <option value="http">HTTP Fetch (Internet)</option>
                      <option value="js">JavaScript (Navigateur)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">Préfixe des signaux</label>
                    <input
                      value={selectedSrc.outputPrefix}
                      onChange={(e) =>
                        reactiveEngine.upsertSource({ ...selectedSrc, outputPrefix: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs font-mono text-cyan-200 outline-none select-text"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">Intervalle (ms)</label>
                    <input
                      type="number"
                      min={500}
                      step={500}
                      value={selectedSrc.intervalMs}
                      onChange={(e) =>
                        reactiveEngine.upsertSource({
                          ...selectedSrc,
                          intervalMs: Math.max(500, Number(e.target.value) || 5000),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs font-mono text-white outline-none select-text"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">
                    {selectedSrc.kind === "http"
                      ? "URL HTTP JSON / API"
                      : `Code / Commande (${selectedSrc.kind}) — imprimez un JSON ou une valeur`}
                  </label>
                  <textarea
                    value={selectedSrc.code}
                    onChange={(e) => reactiveEngine.upsertSource({ ...selectedSrc, code: e.target.value })}
                    rows={5}
                    spellCheck={false}
                    className="w-full p-2.5 rounded-xl bg-[#05070e] border border-white/12 text-[11px] font-mono text-cyan-100 outline-none select-text"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">
                    Transformateur JS optionnel (reçoit <code>raw</code>, <code>json</code>, <code>signals</code>)
                  </label>
                  <textarea
                    value={selectedSrc.parser ?? ""}
                    onChange={(e) => reactiveEngine.upsertSource({ ...selectedSrc, parser: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    placeholder="Laisser vide si la commande imprime déjà un objet JSON { clé: valeur }"
                    className="w-full p-2 rounded-xl bg-[#05070e] border border-white/10 text-[11px] font-mono text-violet-200 outline-none select-text"
                  />
                </div>

                {(selectedSrc.lastOutput || selectedSrc.lastError) && (
                  <div
                    className={`p-2 rounded-xl text-[10.5px] font-mono break-all border ${
                      selectedSrc.lastError
                        ? "bg-rose-500/15 border-rose-400/35 text-rose-200"
                        : "bg-emerald-500/12 border-emerald-400/30 text-emerald-200"
                    }`}
                  >
                    {selectedSrc.lastError ? `Erreur : ${selectedSrc.lastError}` : `Sortie : ${selectedSrc.lastOutput}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-TAB 2: VISUAL REACTIVE BINDINGS (EXPRESSION ENGINE)
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === "bindings" && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-zinc-300">
            Helpers disponibles dans chaque expression :{" "}
            <code className="text-cyan-300">sig(&apos;sys.cpu&apos;)</code>,{" "}
            <code className="text-cyan-300">lerpColor(&apos;#22d3ee&apos;, &apos;#f43f5e&apos;, t)</code>,{" "}
            <code className="text-cyan-300">hsl(h, s, l)</code>,{" "}
            <code className="text-cyan-300">clamp(v, a, b)</code>,{" "}
            <code className="text-cyan-300">mapRange(v, i0, i1, o0, o1)</code>,{" "}
            <code className="text-cyan-300">smoothstep(a, b, x)</code>.
          </div>

          <div className="space-y-2">
            {reactive.bindings.map((b) => (
              <div
                key={b.id}
                className={`p-3 rounded-2xl border space-y-2 transition ${
                  b.enabled
                    ? "bg-violet-500/12 border-violet-400/40"
                    : "bg-white/[0.025] border-white/[0.08]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{b.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[10px] font-mono text-cyan-300">
                        {b.target === "cssVar" ? b.cssVarName || "--var" : b.target}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-zinc-400">{b.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.enabled && b.lastValue !== undefined && (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/18 border border-emerald-400/35 text-[10.5px] font-mono text-emerald-200 flex items-center gap-1.5">
                        {b.lastValue.startsWith("#") && (
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/40"
                            style={{ background: b.lastValue }}
                          />
                        )}
                        {b.lastValue}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => reactiveEngine.upsertBinding({ ...b, enabled: !b.enabled })}
                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border cursor-pointer ${
                        b.enabled
                          ? "bg-violet-500/30 border-violet-400/55 text-white"
                          : "bg-white/6 border-white/12 text-zinc-400"
                      }`}
                    >
                      {b.enabled ? "ACTIF" : "OFF"}
                    </button>
                    {!b.builtin && (
                      <button
                        type="button"
                        onClick={() => reactiveEngine.removeBinding(b.id)}
                        className="p-1 rounded-lg bg-rose-500/18 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={b.expression}
                  onChange={(e) => reactiveEngine.upsertBinding({ ...b, expression: e.target.value })}
                  spellCheck={false}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/55 border border-white/12 text-[11px] font-mono text-cyan-100 outline-none select-text"
                />
                {b.lastError && (
                  <div className="text-[10.5px] font-mono text-rose-300">Erreur : {b.lastError}</div>
                )}
              </div>
            ))}
          </div>

          {/* Add New Binding */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/12 space-y-2.5">
            <div className="text-xs font-semibold text-cyan-300">+ Nouvelle Liaison Réactive</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={newBindName}
                onChange={(e) => setNewBindName(e.target.value)}
                placeholder="Nom (ex: Opacité selon heure)"
                className="px-3 py-1.5 rounded-xl bg-black/55 border border-white/12 text-xs text-white outline-none select-text"
              />
              <select
                value={newBindTarget}
                onChange={(e) => setNewBindTarget(e.target.value as BindingTarget)}
                className="px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/12 text-xs text-white outline-none"
              >
                {BINDING_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {newBindTarget === "cssVar" && (
              <input
                value={newBindCssVar}
                onChange={(e) => setNewBindCssVar(e.target.value)}
                placeholder="--ma-variable-css"
                className="w-full px-3 py-1.5 rounded-xl bg-black/55 border border-white/12 text-xs font-mono text-cyan-200 outline-none select-text"
              />
            )}
            <div className="flex gap-2">
              <input
                value={newBindExpr}
                onChange={(e) => setNewBindExpr(e.target.value)}
                spellCheck={false}
                className="flex-1 px-3 py-1.5 rounded-xl bg-black/55 border border-white/12 text-xs font-mono text-cyan-100 outline-none select-text"
              />
              <button
                type="button"
                onClick={() => {
                  const created: ReactiveBinding = {
                    id: `bind-${Date.now().toString(36).slice(-4)}`,
                    name: newBindName.trim() || "Liaison Personnalisée",
                    description: `Expression live → ${newBindTarget}`,
                    enabled: true,
                    target: newBindTarget,
                    cssVarName: newBindTarget === "cssVar" ? newBindCssVar : undefined,
                    expression: newBindExpr,
                  };
                  reactiveEngine.upsertBinding(created);
                  setNewBindName("");
                  wmStore.pushToast("Liaison Créée", created.name, "success");
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white cursor-pointer"
              >
                Ajouter &amp; Activer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-TAB 3: UNRESTRICTED JS REACTIVE SCRIPTS
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === "scripts" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                Scripts JS Réactifs ({reactive.scripts.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  const id = `script-${Date.now().toString(36).slice(-4)}`;
                  const created: ReactiveScriptMod = {
                    id,
                    name: "Nouveau Script OS",
                    emoji: "⚡",
                    description: "Contrôleur JS libre avec accès DOM, Linux & API OS",
                    enabled: false,
                    intervalMs: 2000,
                    code: `// Accès libre : signals, sig(), os.modStore, os.wmStore, os.execShell(), os.call(), document, fetch\nconst cpu = sig("sys.cpu", 10);\nos.reactiveEngine.pushSignal("custom.status", cpu > 60 ? "HOT" : "COOL");`,
                  };
                  reactiveEngine.upsertScript(created);
                  setEditScriptId(id);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/25 hover:bg-violet-500/35 border border-violet-400/45 text-violet-100 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Nouveau Script
              </button>
            </div>

            {reactive.scripts.map((scr) => {
              const selected = selectedScript?.id === scr.id;
              return (
                <div
                  key={scr.id}
                  onClick={() => setEditScriptId(scr.id)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    selected
                      ? "bg-violet-500/18 border-violet-400/50"
                      : "bg-white/[0.025] border-white/[0.08] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {scr.emoji} {scr.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reactiveEngine.upsertScript({ ...scr, enabled: !scr.enabled });
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer ${
                        scr.enabled
                          ? "bg-emerald-500/25 border-emerald-400/45 text-emerald-200"
                          : "bg-white/6 border-white/12 text-zinc-400"
                      }`}
                    >
                      {scr.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{scr.description}</p>
                </div>
              );
            })}
          </div>

          {selectedScript && (
            <div className="lg:col-span-7 p-3.5 rounded-2xl bg-black/40 border border-white/12 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={selectedScript.name}
                  onChange={(e) =>
                    reactiveEngine.upsertScript({ ...selectedScript, name: e.target.value })
                  }
                  className="flex-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-semibold text-white outline-none select-text"
                />
                <input
                  type="number"
                  min={250}
                  step={250}
                  value={selectedScript.intervalMs}
                  onChange={(e) =>
                    reactiveEngine.upsertScript({
                      ...selectedScript,
                      intervalMs: Math.max(250, Number(e.target.value) || 1000),
                    })
                  }
                  className="w-24 px-2 py-1 rounded-lg bg-black/60 border border-white/12 text-xs font-mono text-cyan-200 outline-none select-text"
                  title="Intervalle d'exécution (ms)"
                />
                <button
                  type="button"
                  onClick={() => {
                    const r = reactiveEngine.runScript(selectedScript.id);
                    if (r.ok) wmStore.pushToast("Script Exécuté", selectedScript.name, "success");
                    else wmStore.pushToast("Erreur Script", r.error ?? "Erreur", "error");
                  }}
                  className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/45 text-emerald-100 cursor-pointer"
                >
                  <Play className="w-3 h-3" /> Run
                </button>
                {!selectedScript.builtin && (
                  <button
                    type="button"
                    onClick={() => reactiveEngine.removeScript(selectedScript.id)}
                    className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-[10px] font-mono text-zinc-400">
                Variables injectées : <code>signals</code>, <code>sig(key)</code>, <code>os.modStore</code>,{" "}
                <code>os.wmStore</code>, <code>os.execShell(cmd)</code>, <code>os.call(method, params)</code>,{" "}
                <code>document</code>, <code>window</code>, <code>fetch</code>, <code>state</code>
              </div>

              <textarea
                value={selectedScript.code}
                onChange={(e) =>
                  reactiveEngine.upsertScript({ ...selectedScript, code: e.target.value })
                }
                rows={12}
                spellCheck={false}
                className="w-full p-3 rounded-xl bg-[#05070e] border border-white/12 text-[11px] font-mono text-emerald-100 outline-none select-text"
              />

              {selectedScript.lastError && (
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-400/35 text-[11px] font-mono text-rose-200">
                  Erreur : {selectedScript.lastError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-TAB 4: INJECTABLE SURFACES (HTML / IFRAME / CANVAS EVERYWHERE)
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === "surfaces" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                Surfaces Injectables ({reactive.surfaces.length})
              </span>
              <div className="flex gap-1">
                {(["html", "iframe", "canvas"] as SurfaceContentType[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => {
                      const id = `surf-${ct}-${Date.now().toString(36).slice(-4)}`;
                      const created: ReactiveSurface = {
                        id,
                        name: `Surface ${ct.toUpperCase()}`,
                        emoji: ct === "canvas" ? "🎨" : ct === "iframe" ? "🌐" : "🧩",
                        description: `Élément ${ct} injecté dans l'OS`,
                        enabled: true,
                        contentType: ct,
                        slot: ct === "canvas" ? "wallpaper" : "overlay",
                        x: 24,
                        y: 64,
                        width: 280,
                        height: 140,
                        pointerEvents: ct === "iframe" ? "auto" : "none",
                        html:
                          ct === "html"
                            ? `<div style="padding:10px 14px;border-radius:14px;background:rgba(10,14,26,0.82);border:1px solid rgba(56,189,248,0.4);color:#fff;font-family:var(--font-mono);font-size:11px;">CPU {{sys.cpu}}% · {{weather.temp}}°C</div>`
                            : ct === "iframe"
                            ? `<!doctype html><body style="margin:0;padding:12px;background:#0b1020;color:#38bdf8;font-family:monospace;">Iframe Custom Live</body>`
                            : undefined,
                        canvasScript:
                          ct === "canvas"
                            ? `const w=canvas.clientWidth,h=canvas.clientHeight;\nctx.clearRect(0,0,w,h);\nconst cpu=sig("sys.cpu",20)/100;\nctx.fillStyle=\`hsla(\${190+cpu*140},90%,60%,0.25)\`;\nctx.beginPath();ctx.arc(w/2,h/2,60+cpu*140+Math.sin(t*3)*15,0,Math.PI*2);ctx.fill();`
                            : undefined,
                      };
                      reactiveEngine.upsertSurface(created);
                      setEditSurfId(id);
                    }}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 uppercase cursor-pointer"
                  >
                    + {ct}
                  </button>
                ))}
              </div>
            </div>

            {reactive.surfaces.map((s) => {
              const selected = selectedSurf?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setEditSurfId(s.id)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    selected
                      ? "bg-fuchsia-500/16 border-fuchsia-400/50"
                      : "bg-white/[0.025] border-white/[0.08] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {s.emoji} {s.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono uppercase text-cyan-200">
                        {s.contentType}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-[9px] font-mono text-violet-200">
                        {s.slot}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          reactiveEngine.upsertSurface({ ...s, enabled: !s.enabled });
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer ${
                          s.enabled
                            ? "bg-emerald-500/25 border-emerald-400/45 text-emerald-200"
                            : "bg-white/6 border-white/12 text-zinc-400"
                        }`}
                      >
                        {s.enabled ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{s.description}</p>
                </div>
              );
            })}
          </div>

          {selectedSurf && (
            <div className="lg:col-span-7 p-3.5 rounded-2xl bg-black/40 border border-white/12 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={selectedSurf.name}
                  onChange={(e) =>
                    reactiveEngine.upsertSurface({ ...selectedSurf, name: e.target.value })
                  }
                  className="flex-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-semibold text-white outline-none select-text"
                />
                {!selectedSurf.builtin && (
                  <button
                    type="button"
                    onClick={() => reactiveEngine.removeSurface(selectedSurf.id)}
                    className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Type de Surface</label>
                  <select
                    value={selectedSurf.contentType}
                    onChange={(e) =>
                      reactiveEngine.upsertSurface({
                        ...selectedSurf,
                        contentType: e.target.value as SurfaceContentType,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs text-white outline-none"
                  >
                    <option value="html">HTML + DOM Script</option>
                    <option value="iframe">Iframe (URL ou srcDoc)</option>
                    <option value="canvas">Canvas 2D 60fps</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Emplacement (Slot OS)</label>
                  <select
                    value={selectedSurf.slot}
                    onChange={(e) =>
                      reactiveEngine.upsertSurface({
                        ...selectedSurf,
                        slot: e.target.value as SurfaceSlot,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs text-white outline-none"
                  >
                    {SURFACE_SLOTS.map((sl) => (
                      <option key={sl.id} value={sl.id}>
                        {sl.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Interactions Souris</label>
                  <select
                    value={selectedSurf.pointerEvents ?? "auto"}
                    onChange={(e) =>
                      reactiveEngine.upsertSurface({
                        ...selectedSurf,
                        pointerEvents: e.target.value as "none" | "auto",
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-black/60 border border-white/12 text-xs text-white outline-none"
                  >
                    <option value="auto">Interactif (cliquable)</option>
                    <option value="none">Pass-through (transparent aux clics)</option>
                  </select>
                </div>
              </div>

              {(selectedSurf.slot === "desktop" ||
                selectedSurf.slot === "overlay" ||
                selectedSurf.slot === "dock" ||
                selectedSurf.slot === "3d-panel") && (
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["x", "X", selectedSurf.x ?? 20],
                      ["y", "Y", selectedSurf.y ?? 60],
                      ["width", "Largeur", selectedSurf.width ?? 280],
                      ["height", "Hauteur", selectedSurf.height ?? 160],
                    ] as const
                  ).map(([field, lbl, val]) => (
                    <div key={field} className="space-y-0.5">
                      <label className="text-[10px] text-zinc-400">{lbl} (px)</label>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) =>
                          reactiveEngine.upsertSurface({
                            ...selectedSurf,
                            [field]: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-1 rounded-lg bg-black/60 border border-white/12 text-xs font-mono text-white outline-none select-text"
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedSurf.slot === "3d-panel" && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/25">
                  {(["x", "y", "z", "rx", "ry", "rz"] as const).map((axis) => (
                    <div key={axis} className="space-y-0.5">
                      <label className="text-[9.5px] font-mono text-cyan-300 uppercase">3D {axis}</label>
                      <input
                        type="number"
                        step={axis.startsWith("r") ? 0.05 : 25}
                        value={selectedSurf.pose3d?.[axis] ?? 0}
                        onChange={(e) =>
                          reactiveEngine.upsertSurface({
                            ...selectedSurf,
                            pose3d: {
                              x: selectedSurf.pose3d?.x ?? -1050,
                              y: selectedSurf.pose3d?.y ?? 160,
                              z: selectedSurf.pose3d?.z ?? 150,
                              rx: selectedSurf.pose3d?.rx ?? 0,
                              ry: selectedSurf.pose3d?.ry ?? 0.35,
                              rz: selectedSurf.pose3d?.rz ?? 0,
                              [axis]: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-1.5 py-1 rounded bg-black/60 border border-white/12 text-[11px] font-mono text-white outline-none select-text"
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedSurf.contentType === "iframe" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    URL externe Iframe (laisser vide pour utiliser le HTML srcDoc ci-dessous)
                  </label>
                  <input
                    value={selectedSurf.iframeUrl ?? ""}
                    onChange={(e) =>
                      reactiveEngine.upsertSurface({ ...selectedSurf, iframeUrl: e.target.value })
                    }
                    placeholder="https://... (optionnel)"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-black/60 border border-white/12 text-xs font-mono text-cyan-200 outline-none select-text"
                  />
                </div>
              )}

              {selectedSurf.contentType === "canvas" ? (
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">
                    Script Canvas 2D 60fps — variables : <code>ctx</code>, <code>canvas</code>,{" "}
                    <code>t</code>, <code>signals</code>, <code>sig(key)</code>, <code>os</code>
                  </label>
                  <textarea
                    value={selectedSurf.canvasScript ?? ""}
                    onChange={(e) =>
                      reactiveEngine.upsertSurface({ ...selectedSurf, canvasScript: e.target.value })
                    }
                    rows={10}
                    spellCheck={false}
                    className="w-full p-2.5 rounded-xl bg-[#05070e] border border-white/12 text-[11px] font-mono text-cyan-100 outline-none select-text"
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">
                      HTML (supporte <code>{"{{sys.cpu}}"}</code>, <code>{"{{weather.temp}}"}</code>,{" "}
                      <code>{"{{agent.tokens}}"}</code>…)
                    </label>
                    <textarea
                      value={selectedSurf.html ?? ""}
                      onChange={(e) =>
                        reactiveEngine.upsertSurface({ ...selectedSurf, html: e.target.value })
                      }
                      rows={8}
                      spellCheck={false}
                      className="w-full p-2.5 rounded-xl bg-[#05070e] border border-white/12 text-[11px] font-mono text-amber-100 outline-none select-text"
                    />
                  </div>
                  {selectedSurf.contentType === "html" && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400">
                        Script DOM JS optionnel : <code>(root, signals, os, helpers, sig)</code>
                      </label>
                      <textarea
                        value={selectedSurf.script ?? ""}
                        onChange={(e) =>
                          reactiveEngine.upsertSurface({ ...selectedSurf, script: e.target.value })
                        }
                        rows={3}
                        spellCheck={false}
                        placeholder="// ex: root.style.transform = `scale(${1 + sig('sys.cpu')/400})`"
                        className="w-full p-2 rounded-xl bg-[#05070e] border border-white/10 text-[11px] font-mono text-emerald-200 outline-none select-text"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Agent API Quick Reference */}
      <div className="p-3 rounded-2xl bg-emerald-500/[0.07] border border-emerald-400/25 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-emerald-200">
        <span className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" />
          Pilotable par agents &amp; scripts Linux :
        </span>
        <span className="text-cyan-200">
          osctl call mod.signal.set · mod.source.upsert · mod.binding.upsert · mod.script.upsert · mod.surface.upsert
        </span>
        <Sparkles className="w-3.5 h-3.5 text-amber-300 hidden sm:block" />
      </div>
    </div>
  );
};
