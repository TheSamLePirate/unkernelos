import {
  Box,
  Check,
  Code2,
  Copy,
  Download,
  Frame,
  Layers,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import React, { useState } from "react";
import {
  HDRI_PRESETS,
  modStore,
  useMods,
  type CustomDesktopWidget,
  type CustomShaderMod,
  type Desktop3dSceneKind,
  type DockStyleKind,
  type HdriPresetId,
  type ModKind,
  type OsMod,
  type TaskbarModeKind,
  type TopBarStyleKind,
  type VariantFamily,
  type WindowDecoratorStyle,
  type WindowOpenAnimKind,
} from "../../core/mod-store.ts";
import { wmStore, type GridLayoutMode } from "../../wm/wm-store.ts";
import { spatial3dBridge, type Spatial3dLayoutKind } from "../../gpu/spatial-3d-bridge.ts";

type ModTab = "variants" | "desktop3d" | "theme-dec" | "shaders" | "widgets" | "mods";

const DECORATOR_STYLES: readonly { id: WindowDecoratorStyle; label: string; desc: string }[] = [
  { id: "macos", label: "macOS Tahoe", desc: "Traffic lights modernes" },
  { id: "macos-classic", label: "Mac OS X Aqua", desc: "Gel Aqua & pinstripes" },
  { id: "windows-95", label: "Windows 95", desc: "Gris 3D biseauté 1995" },
  { id: "windows-xp", label: "Windows XP", desc: "Luna bleu roi brillant" },
  { id: "windows-11", label: "Windows 11", desc: "Fluent Mica translucide" },
  { id: "gnome-adwaita", label: "GNOME 47", desc: "Libadwaita épuré" },
  { id: "kde-breeze", label: "KDE Plasma", desc: "Breeze accent cyan" },
  { id: "xfce-lxde", label: "XFCE / LXDE", desc: "Ultra-léger 28px" },
  { id: "compiz-emerald", label: "Compiz Emerald", desc: "Cristal émeraude 3D" },
  { id: "visionos-glass", label: "VisionOS", desc: "Verre + grab bar basse" },
  { id: "cyber-hud", label: "Cyber HUD", desc: "Crochets néon & laser" },
  { id: "minimal-swiss", label: "Swiss Mono", desc: "Mat & orange #ff4d00" },
  { id: "floating-zen", label: "Floating Zen", desc: "Arrondis ultra-doux" },
  { id: "tiling-i3", label: "Tiling i3", desc: "Powerline monospace" },
];

const TASKBAR_MODES: readonly { id: TaskbarModeKind; label: string }[] = [
  { id: "dock", label: "Dock macOS/Linux" },
  { id: "win95", label: "Windows 95 Taskbar" },
  { id: "winxp", label: "Windows XP Luna" },
  { id: "win11", label: "Windows 11 Centrée" },
  { id: "kde-plasma", label: "KDE Plasma Panel" },
  { id: "xfce-lxde", label: "XFCE / LXDE Panel" },
  { id: "ios-springboard", label: "iOS SpringBoard" },
  { id: "visionos-ornament", label: "VisionOS Rail" },
];

const DOCK_STYLES: readonly { id: DockStyleKind; label: string }[] = [
  { id: "floating-glass", label: "Floating Glass" },
  { id: "full-taskbar", label: "Pleine Largeur" },
  { id: "minimal-pill", label: "Pilule Minimale" },
  { id: "cyber-rail", label: "Rail Cyber HUD" },
  { id: "hidden", label: "Masqué" },
];

const TOPBAR_STYLES: readonly { id: TopBarStyleKind; label: string }[] = [
  { id: "glass", label: "Barre Verre" },
  { id: "floating-pills", label: "Flottante" },
  { id: "gnome", label: "GNOME Noir" },
  { id: "ios", label: "iPadOS Transparente" },
  { id: "retro", label: "Rétro" },
  { id: "minimal", label: "Minimal Mat" },
  { id: "hidden", label: "Masquée" },
];

const SCENES_3D: readonly {
  id: Desktop3dSceneKind;
  name: string;
  emoji: string;
  desc: string;
  gradient: string;
}[] = [
  {
    id: "compiz-cube",
    name: "Compiz / Beryl 3D Cube",
    emoji: "🧊",
    desc: "Véritable Cube 3D translucide 4 faces (Bureaux 1–4) qui pivote automatiquement au changement d'espace !",
    gradient: "from-emerald-950 via-teal-900/70 to-cyan-950",
  },
  {
    id: "vision-horizon",
    name: "VisionOS Horizon Spatial",
    emoji: "🥽",
    desc: "Paysage crépusculaire haute altitude, piliers de lumière verre, halo orbital & atmosphère spatiale",
    gradient: "from-sky-950 via-indigo-950 to-slate-950",
  },
  {
    id: "cyber-observatory",
    name: "Quantum Observatory",
    emoji: "🪐",
    desc: "Nœud torique Liquid Metal PBR, 3 anneaux holographiques orbitaux, satellites & sol obsidienne",
    gradient: "from-indigo-950 via-violet-900/70 to-cyan-900/60",
  },
  {
    id: "liquid-monolith",
    name: "Liquid Chrome Monolith",
    emoji: "💎",
    desc: "Monolithe icosaèdre chrome déformé en temps réel, 16 éclats réfractifs & piédestal studio",
    gradient: "from-slate-900 via-sky-900/60 to-indigo-950",
  },
  {
    id: "cyberpunk-city",
    name: "Night City 2099",
    emoji: "⚡",
    desc: "Mégalopole néon procédurale 64 tours, trafic aérien lumineux, soleil synthwave & grille laser",
    gradient: "from-fuchsia-950 via-rose-900/60 to-cyan-950",
  },
  {
    id: "space-station",
    name: "Orbital Space Station",
    emoji: "🛸",
    desc: "Passerelle orbitale géante avec planète 3D à anneaux en rotation, lune en orbite et arches métalliques",
    gradient: "from-slate-950 via-blue-950/75 to-indigo-950",
  },
  {
    id: "kyoto-sanctuary",
    name: "Kyoto Sanctuary",
    emoji: "🪷",
    desc: "Grand Torii vermillon, lanternes de cristal flottantes jade & sakura, lac miroir et lucioles",
    gradient: "from-teal-950 via-emerald-900/50 to-pink-950/60",
  },
];

const AGENT_API_EXAMPLES: readonly { title: string; cmd: string }[] = [
  {
    title: "Grille 3D + HDRI Sunset 360° + Ombres + Recto-Verso",
    cmd: `osctl call mod.desktop3d.set '{"enabled":true,"layout":"spatial-grid","scene":"space-station","hdriPreset":"sunset","shadowsEnabled":true,"doubleSidedWindows":true}'`,
  },
  {
    title: "Organiser toutes les fenêtres en Grille 2D",
    cmd: `osctl call wm.grid '{"mode":"master-stack"}'`,
  },
  {
    title: "Activer tous les effets de fenêtres (Wobbly, Burn, Genie, Tilt 3D)",
    cmd: `osctl call mod.fx.set '{"openAnimation":"flip3d","wobblyDrag":true,"burnClose":true,"genieMinimize":true,"hoverTilt3d":true,"chromaBorder":true}'`,
  },
  {
    title: "Activer Compiz / Beryl 3D (Cube 4 Bureaux + Wobbly)",
    cmd: `osctl call mod.variant.apply '{"id":"linux-compiz-beryl"}'`,
  },
  {
    title: "Afficher Météo Live + Bourse Crypto + Healthcheck",
    cmd: `osctl call mod.widget.upsert '{"id":"widget-weather-live","enabled":true}'`,
  },
  {
    title: "Passer en Apple VisionOS Spatial 3D ou Windows XP/11",
    cmd: `osctl call mod.variant.apply '{"id":"vision-spatial-3d"}'`,
  },
];

const STARTER_WGSL = `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0);
  let r = length(p);
  let a = atan2(p.y, p.x);
  let wave = 0.5 + 0.5 * sin(r * 18.0 - t * 2.4 + sin(a * 5.0 + t));
  let c1 = vec3<f32>(0.08, 0.04, 0.22);
  let c2 = vec3<f32>(0.12, 0.78, 0.95);
  let c3 = vec3<f32>(0.92, 0.24, 0.58);
  return mix(c1, mix(c2, c3, 0.5 + 0.5 * sin(a * 3.0 - t)), pow(wave, 2.2) * 0.65);
}`;

const STARTER_WIDGET_HTML = `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:14px;background:transparent;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;gap:6px}
.k{font:700 11px/1 ui-monospace,monospace;letter-spacing:.1em;color:#38bdf8;text-transform:uppercase}
.v{font-size:22px;font-weight:700}
</style></head><body>
<div class="k">Custom Widget</div>
<div class="v" id="t">--:--:--</div>
<div style="font-size:11px;color:#94a3b8">Déplacez-moi sur le bureau !</div>
<script>setInterval(()=>{document.getElementById('t').textContent=new Date().toLocaleTimeString();},500);</script>
</body></html>`;

export const ModStudioApp: React.FC = () => {
  const mods = useMods();
  const [tab, setTab] = useState<ModTab>("variants");
  const [familyFilter, setFamilyFilter] = useState<"all" | VariantFamily>("all");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Save Variant form
  const [newVarName, setNewVarName] = useState("");
  const [newVarEmoji, setNewVarEmoji] = useState("✨");

  // Shader Editor state
  const [editingShaderId, setEditingShaderId] = useState<string>(mods.shaders[0]?.id ?? "shader-matrix-rain");
  const activeEditingShader = mods.shaders.find((s) => s.id === editingShaderId) ?? mods.shaders[0];
  const [shaderNameDraft, setShaderNameDraft] = useState(activeEditingShader?.name ?? "Mon Shader WGSL");
  const [shaderCodeDraft, setShaderCodeDraft] = useState(activeEditingShader?.wgsl ?? STARTER_WGSL);

  // Widget Editor state
  const [editingWidgetId, setEditingWidgetId] = useState<string>(mods.widgets[0]?.id ?? "widget-analog-clock");
  const activeEditingWidget = mods.widgets.find((w) => w.id === editingWidgetId) ?? mods.widgets[0];
  const [widgetTitleDraft, setWidgetTitleDraft] = useState(activeEditingWidget?.title ?? "Mon Widget");
  const [widgetEmojiDraft, setWidgetEmojiDraft] = useState(activeEditingWidget?.emoji ?? "⚡");
  const [widgetHtmlDraft, setWidgetHtmlDraft] = useState(activeEditingWidget?.html ?? STARTER_WIDGET_HTML);

  // Mod filter & custom CSS mod creator
  const [modFilter, setModFilter] = useState<"all" | ModKind>("all");
  const [newModName, setNewModName] = useState("");
  const [newModCss, setNewModCss] = useState(".glass-surface-focused {\n  border-color: rgba(34, 211, 238, 0.7) !important;\n}");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const selectShaderForEdit = (sh: CustomShaderMod) => {
    setEditingShaderId(sh.id);
    setShaderNameDraft(sh.name);
    setShaderCodeDraft(sh.wgsl);
  };

  const selectWidgetForEdit = (w: CustomDesktopWidget) => {
    setEditingWidgetId(w.id);
    setWidgetTitleDraft(w.title);
    setWidgetEmojiDraft(w.emoji);
    setWidgetHtmlDraft(w.html);
  };

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt).catch(() => {});
    setCopiedCmd(txt);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const TABS: readonly { id: ModTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "variants", label: "Variantes OS", icon: Sparkles },
    { id: "desktop3d", label: "Bureau 3D WebGPU", icon: Box },
    { id: "theme-dec", label: "Thème & Fenêtres", icon: Frame },
    { id: "shaders", label: "Shaders WGSL", icon: Wand2 },
    { id: "widgets", label: "Widgets Bureau", icon: Layers },
    { id: "mods", label: "Mods, CSS & API", icon: Code2 },
  ];

  const activeModsCount = mods.mods.filter((m) => m.enabled).length;
  const activeWidgetsCount = mods.widgets.filter((w) => w.enabled).length;

  return (
    <div className="flex flex-col w-full h-full bg-[#080b13]/96 text-zinc-100 select-none overflow-hidden">
      {/* Top Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600/18 via-fuchsia-500/12 to-cyan-500/16 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-600/25">
            <Sliders className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate">OS Mod Studio & Spatial 3D</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-mono text-cyan-200">
                {activeModsCount} mods · {activeWidgetsCount} widgets {mods.desktop3d.enabled ? "· 3D ON" : ""}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              Moddez tout en direct : variantes, décorateurs, shaders WGSL, bureau 3D Three.js, widgets & API agents (osctl/MCP).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => modStore.setDesktop3d({ enabled: !mods.desktop3d.enabled })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              mods.desktop3d.enabled
                ? "bg-gradient-to-r from-cyan-500 to-violet-500 border-white/30 text-white shadow-lg shadow-cyan-500/25"
                : "bg-white/[0.06] hover:bg-white/12 border-white/12 text-zinc-200"
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            {mods.desktop3d.enabled ? "3D Actif" : "Activer 3D"}
          </button>

          <button
            type="button"
            onClick={() => {
              const json = modStore.exportBundleJson();
              copyText(json);
              wmStore.pushToast("Mod Pack exporté", "Configuration JSON complète copiée dans le presse-papiers.", "success");
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-white/[0.06] hover:bg-white/12 border border-white/10 text-zinc-200 transition cursor-pointer"
            title="Exporter toute votre config en JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exporter</span>
          </button>

          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-white/[0.06] hover:bg-white/12 border border-white/10 text-zinc-200 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Importer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              modStore.resetAll();
              wmStore.pushToast("OS Réinitialisé", "Retour à la configuration unkernelOS Stock.", "info");
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Stock</span>
          </button>
        </div>
      </div>

      {/* Optional JSON Import Drawer */}
      {showImport && (
        <div className="px-4 py-3 bg-[#0d1120] border-b border-white/10 flex flex-col sm:flex-row gap-2 shrink-0">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={2}
            placeholder="Collez ici un JSON unkernelos-mod-pack/v1 exporté..."
            className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 outline-none select-text"
          />
          <button
            type="button"
            onClick={() => {
              const res = modStore.importBundleJson(importText);
              if (res.ok) {
                setShowImport(false);
                setImportText("");
                wmStore.pushToast("Mod Pack importé", "Tous vos mods et variantes ont été appliqués.", "success");
              } else {
                wmStore.pushToast("Erreur import JSON", res.error ?? "Format invalide", "error");
              }
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-semibold text-white cursor-pointer"
          >
            Appliquer JSON
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#0a0d17] border-b border-white/8 overflow-x-auto no-scrollbar shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                active
                  ? "bg-white/14 text-white border border-white/22 shadow"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {/* ─── TAB 1: OS VARIANTS (16 COMPLETE DESKTOP PARADIGMS) ─────────────── */}
        {tab === "variants" && (
          <div className="space-y-4">
            {/* Family Filter Bar */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", `Tous les OS (${mods.variants.length})`],
                  ["windows", "🪟 Windows (95 → 11)"],
                  ["linux", "🐧 Linux (XFCE · GNOME · KDE · Compiz · Hyprland)"],
                  ["apple", "🍎 Apple (macOS · Aqua · iOS · VisionOS)"],
                  ["creative", "⚡ 3D & Design"],
                ] as const
              ).map(([fid, label]) => (
                <button
                  key={fid}
                  type="button"
                  onClick={() => setFamilyFilter(fid)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                    familyFilter === fid
                      ? "bg-white/16 border-cyan-400/55 text-white shadow"
                      : "bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {mods.variants
                .filter((v) => familyFilter === "all" || v.family === familyFilter)
                .map((v) => {
                const active = mods.activeVariantId === v.id;
                return (
                  <div
                    key={v.id}
                    className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all ${
                      active
                        ? "bg-gradient-to-br from-violet-500/18 via-[#121629] to-cyan-500/16 border-cyan-400/55 shadow-[0_0_30px_rgba(56,189,248,0.18)]"
                        : "bg-white/[0.03] hover:bg-white/[0.055] border-white/10 hover:border-white/22"
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-10 h-10 rounded-2xl bg-white/8 border border-white/12 flex items-center justify-center text-xl shadow">
                            {v.emoji}
                          </span>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-1.5">
                              {v.name}
                              {v.desktop3d?.enabled && (
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/25 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                                  3D GPU
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-400">
                              {v.decorator.style} · {v.shell.dockStyle}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {v.swatches.map((sw, i) => (
                            <span
                              key={i}
                              className="w-3 h-3 rounded-full border border-white/25"
                              style={{ background: sw }}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed">{v.tagline}</p>

                      <div className="flex flex-wrap gap-1">
                        {v.activeShaderModId && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/18 border border-violet-400/30 text-[10px] font-mono text-violet-200">
                            WGSL: {v.activeShaderModId.replace("shader-", "")}
                          </span>
                        )}
                        {v.enabledModIds.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono text-zinc-300">
                            {v.enabledModIds.length} mods
                          </span>
                        )}
                        {v.enabledWidgetIds.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-[10px] font-mono text-emerald-200">
                            {v.enabledWidgetIds.length} widgets
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        modStore.applyVariant(v.id);
                        wmStore.pushToast(`Variante activée : ${v.name}`, v.tagline, "success");
                      }}
                      className={`mt-4 w-full py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        active
                          ? "bg-white/15 text-white border border-white/25"
                          : "bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 shadow"
                      }`}
                    >
                      {active ? "✓ Variante active" : "Appliquer cette variante"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Save Current Custom Setup as New OS Variant */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold text-zinc-200">Sauvegarder votre configuration actuelle comme Variante OS :</span>
              <input
                value={newVarEmoji}
                onChange={(e) => setNewVarEmoji(e.target.value)}
                className="w-12 px-2 py-1.5 rounded-xl bg-black/40 border border-white/15 text-center text-sm outline-none"
                maxLength={2}
              />
              <input
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                placeholder="Ex: Mon OS Perso Noir & Or"
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const name = newVarName.trim();
                  if (!name) return;
                  const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36).slice(-3)}`;
                  modStore.saveCurrentAsVariant(id, name, "Variante personnalisée créée dans Mod Studio", newVarEmoji || "✨");
                  setNewVarName("");
                  wmStore.pushToast("Variante sauvegardée", `${newVarEmoji} ${name} ajoutée à vos variantes OS.`, "success");
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 2: TRUE SPATIAL 3D WEBGPU THREE.JS DESKTOP ─────────────────── */}
        {tab === "desktop3d" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/18 via-violet-600/15 to-fuchsia-500/15 border border-cyan-400/35 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Box className="w-4 h-4 text-cyan-300" />
                  Vrai Bureau Spatial 3D — Fenêtres & Pièce en 3D (Three.js WebGPU)
                </div>
                <p className="text-xs text-zinc-300">
                  Vos vraies fenêtres interactives (Terminal, Code IDE, Rust Rune, Agent Studio…) flottent physiquement dans la scène 3D avec châssis métallique WebGPU synchronisé. Glissez le fond pour orbiter 360°, molette pour zoomer, double-clic titre pour focaliser la caméra !
                </p>
              </div>
              <div className="flex items-center gap-2">
                {mods.desktop3d.enabled && (
                  <button
                    type="button"
                    onClick={() => spatial3dBridge.dispatchCamera({ kind: "overview" })}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white cursor-pointer"
                  >
                    Vue Globale 3D
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => modStore.setDesktop3d({ enabled: !mods.desktop3d.enabled })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    mods.desktop3d.enabled
                      ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/25"
                      : "bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:brightness-110 shadow-lg"
                  }`}
                >
                  {mods.desktop3d.enabled ? "✓ Bureau 3D Activé" : "Activer le Bureau 3D"}
                </button>
              </div>
            </div>

            {/* 5 True 3D Spatial Window Layouts */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Disposition 3D des Fenêtres dans l'Espace
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  Vol libre : <b className="text-cyan-200">ZQSD / WASD</b> · Regard : <b className="text-violet-200">← ↑ ↓ →</b> · Profondeur : <b className="text-emerald-200">Shift + Glisser</b>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {(
                  [
                    {
                      id: "curved-cockpit" as Spatial3dLayoutKind,
                      emoji: "🥽",
                      name: "Arc Spatial",
                      desc: "Arc cylindrique VisionOS ergonomique autour de vous",
                    },
                    {
                      id: "spatial-grid" as Spatial3dLayoutKind,
                      emoji: "⊞",
                      name: "Mur Grille 3D",
                      desc: "Grille multi-lignes courbe zéro chevauchement en 3D !",
                    },
                    {
                      id: "compiz-cube" as Spatial3dLayoutKind,
                      emoji: "🧊",
                      name: "Cube 4 Bureaux",
                      desc: "Bureaux 1–4 montés sur les 4 faces d'un Cube 3D Compiz",
                    },
                    {
                      id: "studio-desk" as Spatial3dLayoutKind,
                      emoji: "🖥️",
                      name: "Bureau Studio 3D",
                      desc: "Poste physique 3D avec écran central & ailes latérales",
                    },
                    {
                      id: "gallery-ring" as Spatial3dLayoutKind,
                      emoji: "🪐",
                      name: "Anneau 360°",
                      desc: "Toutes vos fenêtres en anneau panoramique 360°",
                    },
                  ]
                ).map((lay) => {
                  const active = mods.desktop3d.layout === lay.id;
                  return (
                    <button
                      key={lay.id}
                      type="button"
                      onClick={() => modStore.setDesktop3d({ enabled: true, layout: lay.id })}
                      className={`text-left p-3 rounded-2xl border transition cursor-pointer ${
                        active && mods.desktop3d.enabled
                          ? "bg-gradient-to-br from-cyan-500/22 to-violet-500/22 border-cyan-300 text-white shadow-lg"
                          : "bg-white/[0.04] hover:bg-white/[0.08] border-white/12 text-zinc-200"
                      }`}
                    >
                      <div className="text-xs font-bold">
                        {lay.emoji} {lay.name}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 leading-snug">{lay.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real 360° HDRI Skybox & PBR IBL Reflections Picker */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Skybox 360° HDRI & Reflets PBR (Poly Haven / Drei CDN)
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.desktop3d.hdriBackground}
                    onChange={(e) => modStore.setDesktop3d({ hdriBackground: e.target.checked })}
                    className="accent-amber-400"
                  />
                  Afficher l'HDRI en ciel 360°
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {HDRI_PRESETS.map((h) => {
                  const active = mods.desktop3d.hdriPreset === h.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => modStore.setDesktop3d({ enabled: true, hdriPreset: h.id as HdriPresetId })}
                      className={`px-3 py-2 rounded-xl border text-left text-xs transition cursor-pointer ${
                        active
                          ? "bg-amber-500/20 border-amber-300/70 text-white font-semibold"
                          : "bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-zinc-300"
                      }`}
                    >
                      {h.emoji} {h.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  value={mods.desktop3d.hdriUrl}
                  onChange={(e) => modStore.setDesktop3d({ hdriUrl: e.target.value })}
                  placeholder="URL .hdr personnalisé (ex: https://cdn.jsdelivr.net/.../scene_1k.hdr)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs font-mono text-zinc-200 outline-none select-text"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (mods.desktop3d.hdriUrl.trim()) {
                      modStore.setDesktop3d({ enabled: true, hdriPreset: "custom" });
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/45 text-xs font-semibold text-amber-100 cursor-pointer"
                >
                  Charger HDRI
                </button>
              </div>
            </div>

            <div className="text-xs font-bold uppercase tracking-wider text-violet-300 pt-1">
              Environnement Architectural de la Pièce 3D
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SCENES_3D.map((sc) => {
                const active = mods.desktop3d.scene === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => modStore.setDesktop3d({ enabled: true, scene: sc.id })}
                    className={`text-left p-4 rounded-2xl bg-gradient-to-br ${sc.gradient} border transition-all cursor-pointer ${
                      active && mods.desktop3d.enabled
                        ? "border-cyan-300 ring-1 ring-cyan-300/60 shadow-[0_0_28px_rgba(34,211,238,0.22)]"
                        : "border-white/12 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">
                        {sc.emoji} {sc.name}
                      </span>
                      {active && mods.desktop3d.enabled && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-400/25 text-[10px] font-mono text-cyan-100">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-200/85 mt-1.5 leading-relaxed">{sc.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                <div>
                  <div className="font-semibold text-white">☀️ Lumières & Ombres Dynamiques 3D</div>
                  <div className="text-[11px] text-zinc-400">Ombres portées douces (PCFSoftShadowMap 2048px) sur le sol & bureau</div>
                </div>
                <input
                  type="checkbox"
                  checked={mods.desktop3d.shadowsEnabled}
                  onChange={(e) => modStore.setDesktop3d({ shadowsEnabled: e.target.checked })}
                  className="accent-amber-400 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                <div>
                  <div className="font-semibold text-white">👁️ Fenêtres Visibles des 2 Côtés</div>
                  <div className="text-[11px] text-zinc-400">Cadres métalliques évidés recto/verso pour lire les fenêtres par derrière</div>
                </div>
                <input
                  type="checkbox"
                  checked={mods.desktop3d.doubleSidedWindows}
                  onChange={(e) => modStore.setDesktop3d({ doubleSidedWindows: e.target.checked })}
                  className="accent-emerald-400 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Caméra Orbitale Libre 360°</div>
                  <div className="text-[11px] text-zinc-400">Cliquer-glisser le fond pour orbiter, molette zoom, ZQSD + Flèches pour voler</div>
                </div>
                <input
                  type="checkbox"
                  checked={mods.desktop3d.interactiveOrbit}
                  onChange={(e) => modStore.setDesktop3d({ interactiveOrbit: e.target.checked })}
                  className="accent-violet-400 w-4 h-4"
                />
              </label>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Vitesse de vol ZQSD / WASD</span>
                  <span className="font-mono text-emerald-300">{mods.desktop3d.moveSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.1}
                  value={mods.desktop3d.moveSpeed}
                  onChange={(e) => modStore.setDesktop3d({ moveSpeed: Number(e.target.value) })}
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Vitesse d'animation 3D</span>
                  <span className="font-mono text-cyan-300">{mods.desktop3d.cameraSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={mods.desktop3d.cameraSpeed}
                  onChange={(e) => modStore.setDesktop3d({ cameraSpeed: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Intensité des lumières néon</span>
                  <span className="font-mono text-violet-300">{Math.round(mods.desktop3d.bloomIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2}
                  step={0.05}
                  value={mods.desktop3d.bloomIntensity}
                  onChange={(e) => modStore.setDesktop3d({ bloomIntensity: Number(e.target.value) })}
                  className="w-full accent-violet-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Densité des particules 3D</span>
                  <span className="font-mono text-emerald-300">{Math.round(mods.desktop3d.particleDensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.1}
                  value={mods.desktop3d.particleDensity}
                  onChange={(e) => modStore.setDesktop3d({ particleDensity: Number(e.target.value) })}
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Parallaxe curseur 3D</span>
                  <span className="font-mono text-amber-300">{Math.round(mods.desktop3d.mouseParallax * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={mods.desktop3d.mouseParallax}
                  onChange={(e) => modStore.setDesktop3d({ mouseParallax: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: THEME, WINDOW DECORATOR & SHELL ─────────────────────────── */}
        {tab === "theme-dec" && (
          <div className="space-y-5">
            {/* Window Decorator Picker */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Décorateur de Fenêtres (Window Decorator)
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-zinc-400">Boutons :</span>
                  {(["left", "right"] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => modStore.setDecorator({ buttonPosition: pos })}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                        mods.decorator.buttonPosition === pos
                          ? "bg-cyan-500/25 border-cyan-400/50 text-white"
                          : "bg-white/5 border-white/10 text-zinc-400"
                      }`}
                    >
                      {pos === "left" ? "Gauche" : "Droite"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {DECORATOR_STYLES.map((d) => {
                  const active = mods.decorator.style === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => modStore.setDecorator({ style: d.id })}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        active
                          ? "bg-violet-500/25 border-violet-400 text-white"
                          : "bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-zinc-300"
                      }`}
                    >
                      <div className="text-xs font-semibold">{d.label}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{d.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-300">Rayon coins (Radius)</span>
                    <span className="font-mono text-cyan-300">{mods.decorator.radiusPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={28}
                    value={mods.decorator.radiusPx}
                    onChange={(e) => modStore.setDecorator({ radiusPx: Number(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-300">Hauteur Titlebar</span>
                    <span className="font-mono text-cyan-300">{mods.decorator.titlebarHeightPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={28}
                    max={44}
                    value={mods.decorator.titlebarHeightPx}
                    onChange={(e) => modStore.setDecorator({ titlebarHeightPx: Number(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-300">Halo lumineux actif</span>
                    <span className="font-mono text-cyan-300">{mods.decorator.activeGlowPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={64}
                    value={mods.decorator.activeGlowPx}
                    onChange={(e) => modStore.setDecorator({ activeGlowPx: Number(e.target.value) })}
                    className="w-full accent-violet-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.decorator.titlebarAccentBar}
                    onChange={(e) => modStore.setDecorator({ titlebarAccentBar: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  Ligne laser supérieure active
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.decorator.showWorkspacePills}
                    onChange={(e) => modStore.setDecorator({ showWorkspacePills: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  Boutons bureaux 1–4
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.decorator.showSnapButtons}
                    onChange={(e) => modStore.setDecorator({ showSnapButtons: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  Boutons Snap / Pin
                </label>
              </div>
            </div>

            {/* Shell: Taskbar Paradigm, Dock, TopBar, Compiz Physics & OS Brand */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-violet-300">
                Paradigme Shell, Barre des tâches & Physique Compiz / Spatiale
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] text-zinc-400">Paradigme de Bureau / Barre des tâches</div>
                <div className="flex flex-wrap gap-1.5">
                  {TASKBAR_MODES.map((tm) => (
                    <button
                      key={tm.id}
                      type="button"
                      onClick={() =>
                        modStore.setShell({
                          taskbarMode: tm.id,
                          dockStyle:
                            tm.id === "dock" || tm.id === "ios-springboard" ? "floating-glass" : "hidden",
                          springboardHome: tm.id === "ios-springboard",
                          visionOrnaments: tm.id === "visionos-ornament",
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                        mods.shell.taskbarMode === tm.id
                          ? "bg-cyan-500/25 border-cyan-400 text-white font-semibold"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {tm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compiz / Spatial / Desktop Feature Toggles */}
              <div className="flex flex-wrap gap-4 text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.shell.compizWobbly}
                    onChange={(e) => modStore.setShell({ compizWobbly: e.target.checked })}
                    className="accent-emerald-400"
                  />
                  🧊 Fenêtres Molles (Compiz Wobbly)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.shell.compizCube}
                    onChange={(e) => modStore.setShell({ compizCube: e.target.checked })}
                    className="accent-emerald-400"
                  />
                  🎲 Cube 3D Bureaux (Compiz/Beryl)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.shell.desktopIcons}
                    onChange={(e) => modStore.setShell({ desktopIcons: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  🖥️ Icônes sur le Bureau
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.shell.visionOrnaments}
                    onChange={(e) => modStore.setShell({ visionOrnaments: e.target.checked })}
                    className="accent-sky-400"
                  />
                  🥽 Barre Grab VisionOS
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.shell.springboardHome}
                    onChange={(e) => modStore.setShell({ springboardHome: e.target.checked })}
                    className="accent-fuchsia-400"
                  />
                  📱 Écran d'accueil iOS SpringBoard
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <div className="text-[11px] text-zinc-400">Style du Dock</div>
                  <div className="flex flex-wrap gap-1.5">
                    {DOCK_STYLES.map((ds) => (
                      <button
                        key={ds.id}
                        type="button"
                        onClick={() => modStore.setShell({ dockStyle: ds.id })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                          mods.shell.dockStyle === ds.id
                            ? "bg-violet-500/25 border-violet-400 text-white"
                            : "bg-white/5 border-white/10 text-zinc-400"
                        }`}
                      >
                        {ds.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] text-zinc-400">Style de la TopBar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TOPBAR_STYLES.map((ts) => (
                      <button
                        key={ts.id}
                        type="button"
                        onClick={() => modStore.setShell({ topBarStyle: ts.id })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                          mods.shell.topBarStyle === ts.id
                            ? "bg-cyan-500/25 border-cyan-400 text-white"
                            : "bg-white/5 border-white/10 text-zinc-400"
                        }`}
                      >
                        {ts.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] text-zinc-400">Nom de l'OS (TopBar)</div>
                  <input
                    value={mods.shell.brandLabel}
                    onChange={(e) => modStore.setShell({ brandLabel: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-semibold outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Window Effects Engine (All Window FX!) + 2D Grid Tiling */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                  Moteur d'Effets de Fenêtres (Window FX) & Grille 2D
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["grid", "⊞ Grille 2D"],
                      ["split-2", "◫ Split 50/50"],
                      ["master-stack", "▤ Master+Stack"],
                      ["columns-3", "▥ 3 Col."],
                      ["cascade", "❐ Cascade"],
                    ] as readonly [GridLayoutMode, string][]
                  ).map(([m, lbl]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        modStore.setDesktop3d({ enabled: false });
                        wmStore.tileWorkspace(m);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-cyan-500/25 border border-white/12 text-[10px] font-medium text-zinc-200 hover:text-white cursor-pointer"
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] text-zinc-400">Animation d'ouverture des fenêtres</div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["spring", "🌀 Spring Élastique"],
                      ["genie", "🧞 Effet Génie (macOS)"],
                      ["flip3d", "🃏 Flip 3D (Compiz)"],
                      ["zoom", "🔍 Zoom Rapide"],
                      ["fade", "🌫️ Fondu Doux"],
                    ] as readonly [WindowOpenAnimKind, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => modStore.setFx({ openAnimation: id })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                        mods.fx.openAnimation === id
                          ? "bg-fuchsia-500/25 border-fuchsia-400 text-white font-semibold"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.wobblyDrag || mods.shell.compizWobbly}
                    onChange={(e) => {
                      modStore.setFx({ wobblyDrag: e.target.checked });
                      modStore.setShell({ compizWobbly: e.target.checked });
                    }}
                    className="accent-emerald-400"
                  />
                  <span>🧊 Wobbly Drag (Gélatine Compiz)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.genieMinimize}
                    onChange={(e) => modStore.setFx({ genieMinimize: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  <span>🧞 Genie Minimize (Lampe magique)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.burnClose}
                    onChange={(e) => modStore.setFx({ burnClose: e.target.checked })}
                    className="accent-orange-400"
                  />
                  <span>🔥 Burn Close (Combustion Compiz)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.hoverTilt3d}
                    onChange={(e) => modStore.setFx({ hoverTilt3d: e.target.checked })}
                    className="accent-violet-400"
                  />
                  <span>🧲 Inclinaison 3D Magnétique (Hover)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.dragGhostOpacity}
                    onChange={(e) => modStore.setFx({ dragGhostOpacity: e.target.checked })}
                    className="accent-sky-400"
                  />
                  <span>👻 Transparence fantôme au Drag</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.dimInactive}
                    onChange={(e) => modStore.setFx({ dimInactive: e.target.checked })}
                    className="accent-amber-400"
                  />
                  <span>🎬 Assombrir fenêtres inactives</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.fx.chromaBorder}
                    onChange={(e) => modStore.setFx({ chromaBorder: e.target.checked })}
                    className="accent-fuchsia-400"
                  />
                  <span>🌈 Bordure Prismatique Chroma</span>
                </label>
              </div>
            </div>

            {/* Custom Theme Token Editor */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                  <Palette className="w-4 h-4" />
                  Surcharge Thème & Couleurs Live
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mods.theme.enabled}
                    onChange={(e) => modStore.setTheme({ enabled: e.target.checked })}
                    className="accent-fuchsia-400"
                  />
                  Activer les tokens personnalisés
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[11px] text-zinc-400">Accent Primaire</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={mods.theme.accentPrimary}
                      onChange={(e) => modStore.setTheme({ enabled: true, accentPrimary: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-[11px]">{mods.theme.accentPrimary}</span>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-zinc-400">Accent Secondaire</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={mods.theme.accentSecondary}
                      onChange={(e) => modStore.setTheme({ enabled: true, accentSecondary: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-[11px]">{mods.theme.accentSecondary}</span>
                  </div>
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Flou Verre</span>
                    <span className="font-mono text-cyan-300">{mods.theme.blurPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    value={mods.theme.blurPx}
                    onChange={(e) => modStore.setTheme({ enabled: true, blurPx: Number(e.target.value) })}
                    className="w-full accent-fuchsia-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Opacité Surface</span>
                    <span className="font-mono text-cyan-300">{Math.round(mods.theme.glassOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.45}
                    max={0.98}
                    step={0.02}
                    value={mods.theme.glassOpacity}
                    onChange={(e) => modStore.setTheme({ enabled: true, glassOpacity: Number(e.target.value) })}
                    className="w-full accent-fuchsia-400"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 4: LIVE WGSL WALLPAPER SHADER MOD STUDIO ───────────────────── */}
        {tab === "shaders" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Shaders WGSL Installés
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const id = `shader-custom-${Date.now().toString(36).slice(-4)}`;
                    const sh: CustomShaderMod = {
                      id,
                      name: "Mon Shader WGSL",
                      author: "Vous",
                      description: "Shader fragment WebGPU personnalisé",
                      previewGradient: "linear-gradient(135deg,#0f172a,#7c3aed,#06b6d4)",
                      wgsl: STARTER_WGSL,
                    };
                    modStore.upsertShader(sh, true);
                    selectShaderForEdit(sh);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nouveau WGSL
                </button>
              </div>

              <button
                type="button"
                onClick={() => modStore.setActiveShaderMod(null)}
                className={`w-full p-3 rounded-xl border text-left transition cursor-pointer ${
                  mods.activeShaderModId === null
                    ? "bg-white/12 border-white/35 text-white"
                    : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <div className="text-xs font-semibold">Shader Stock unkernelOS (par défaut)</div>
                <div className="text-[10px] text-zinc-400">Utilise le shader choisi dans les Réglages classiques</div>
              </button>

              {mods.shaders.map((sh) => {
                const active = mods.activeShaderModId === sh.id;
                const selected = editingShaderId === sh.id;
                return (
                  <div
                    key={sh.id}
                    onClick={() => selectShaderForEdit(sh)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      selected
                        ? "bg-violet-500/18 border-violet-400/55"
                        : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-7 h-7 rounded-lg shrink-0 border border-white/20"
                          style={{ background: sh.previewGradient }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{sh.name}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{sh.description}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          modStore.setDesktop3d({ enabled: false });
                          modStore.setActiveShaderMod(sh.id);
                          selectShaderForEdit(sh);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 cursor-pointer ${
                          active
                            ? "bg-emerald-500/25 border border-emerald-400/50 text-emerald-200"
                            : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
                      >
                        {active ? "Actif" : "Appliquer"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live WGSL Code Editor */}
            <div className="lg:col-span-7 flex flex-col gap-2.5 p-3.5 rounded-2xl bg-black/40 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={shaderNameDraft}
                  onChange={(e) => setShaderNameDraft(e.target.value)}
                  className="flex-1 min-w-[160px] px-2.5 py-1 rounded-lg bg-white/6 border border-white/12 text-xs font-semibold text-white outline-none"
                />
                <div className="flex items-center gap-1.5">
                  {activeEditingShader && !activeEditingShader.builtin && (
                    <button
                      type="button"
                      onClick={() => modStore.deleteShader(activeEditingShader.id)}
                      className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      modStore.setDesktop3d({ enabled: false });
                      modStore.upsertShader(
                        {
                          id: editingShaderId,
                          name: shaderNameDraft.trim() || "Custom WGSL",
                          author: activeEditingShader?.author ?? "Vous",
                          description: activeEditingShader?.description ?? "Shader WGSL live",
                          previewGradient:
                            activeEditingShader?.previewGradient ?? "linear-gradient(135deg,#0f172a,#7c3aed,#06b6d4)",
                          wgsl: shaderCodeDraft,
                          builtin: activeEditingShader?.builtin,
                        },
                        true
                      );
                      wmStore.pushToast("Shader WGSL compilé", `${shaderNameDraft} actif sur le bureau WebGPU.`, "success");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Compiler & Appliquer
                  </button>
                </div>
              </div>

              {mods.shaderCompileError && (
                <div className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200 break-words">
                  Erreur WGSL : {mods.shaderCompileError}
                </div>
              )}

              <textarea
                value={shaderCodeDraft}
                onChange={(e) => setShaderCodeDraft(e.target.value)}
                rows={16}
                spellCheck={false}
                className="w-full flex-1 bg-[#060810] border border-white/10 rounded-xl p-3 text-[11px] font-mono text-cyan-100 leading-relaxed outline-none select-text resize-none"
              />
              <div className="text-[10px] font-mono text-zinc-400">
                Signature attendue : <code>fn renderCustom(uv: vec2&lt;f32&gt;, aspect: f32, t: f32, px: vec2&lt;f32&gt;) -&gt; vec3&lt;f32&gt;</code> · helper disponible : <code>hash21(vec2&lt;f32&gt;)</code>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 5: DESKTOP WIDGET CREATOR ──────────────────────────────────── */}
        {tab === "widgets" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Widgets du Bureau (Glissables)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const id = `widget-custom-${Date.now().toString(36).slice(-4)}`;
                    const w: CustomDesktopWidget = {
                      id,
                      title: "Nouveau Widget",
                      emoji: "⚡",
                      description: "Widget HTML/JS personnalisé",
                      x: 64,
                      y: 84,
                      width: 240,
                      height: 140,
                      enabled: true,
                      transparent: false,
                      html: STARTER_WIDGET_HTML,
                    };
                    modStore.upsertWidget(w);
                    selectWidgetForEdit(w);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Créer Widget
                </button>
              </div>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs cursor-pointer">
                <span>Afficher les widgets natifs de droite</span>
                <input
                  type="checkbox"
                  checked={mods.shell.showStockWidgets}
                  onChange={(e) => modStore.setShell({ showStockWidgets: e.target.checked })}
                  className="accent-cyan-400"
                />
              </label>

              {mods.widgets.map((w) => {
                const selected = editingWidgetId === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => selectWidgetForEdit(w)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      selected
                        ? "bg-emerald-500/14 border-emerald-400/50"
                        : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {w.emoji} {w.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {w.width}×{w.height}px @ ({w.x}, {w.y})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          modStore.updateWidget(w.id, { enabled: !w.enabled });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                          w.enabled
                            ? "bg-emerald-500/25 border border-emerald-400/50 text-emerald-200"
                            : "bg-white/8 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {w.enabled ? "Visible" : "Masqué"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-7 flex flex-col gap-2.5 p-3.5 rounded-2xl bg-black/40 border border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={widgetEmojiDraft}
                  onChange={(e) => setWidgetEmojiDraft(e.target.value)}
                  className="w-11 px-2 py-1 rounded-lg bg-white/6 border border-white/12 text-center text-sm outline-none"
                />
                <input
                  value={widgetTitleDraft}
                  onChange={(e) => setWidgetTitleDraft(e.target.value)}
                  className="flex-1 min-w-[140px] px-2.5 py-1 rounded-lg bg-white/6 border border-white/12 text-xs font-semibold text-white outline-none"
                />
                {activeEditingWidget && !activeEditingWidget.builtin && (
                  <button
                    type="button"
                    onClick={() => modStore.removeWidget(activeEditingWidget.id)}
                    className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    modStore.upsertWidget({
                      id: editingWidgetId,
                      title: widgetTitleDraft.trim() || "Widget",
                      emoji: widgetEmojiDraft || "⚡",
                      description: activeEditingWidget?.description ?? "Widget HTML/JS",
                      x: activeEditingWidget?.x ?? 48,
                      y: activeEditingWidget?.y ?? 72,
                      width: activeEditingWidget?.width ?? 240,
                      height: activeEditingWidget?.height ?? 140,
                      enabled: true,
                      transparent: activeEditingWidget?.transparent ?? false,
                      html: widgetHtmlDraft,
                      builtin: activeEditingWidget?.builtin,
                    });
                    wmStore.pushToast("Widget mis à jour", `${widgetEmojiDraft} ${widgetTitleDraft} affiché sur le bureau.`, "success");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-xs font-semibold text-black hover:brightness-110 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Enregistrer & Afficher
                </button>
              </div>

              {activeEditingWidget && (
                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  {(
                    [
                      ["X", "x"],
                      ["Y", "y"],
                      ["Larg.", "width"],
                      ["Haut.", "height"],
                    ] as const
                  ).map(([lbl, key]) => (
                    <label key={key} className="flex items-center gap-1.5 bg-white/[0.04] px-2 py-1 rounded-lg border border-white/10">
                      <span className="text-zinc-400">{lbl}</span>
                      <input
                        type="number"
                        value={activeEditingWidget[key]}
                        onChange={(e) =>
                          modStore.updateWidget(activeEditingWidget.id, { [key]: Number(e.target.value) || 0 })
                        }
                        className="w-full bg-transparent text-white font-mono outline-none"
                      />
                    </label>
                  ))}
                </div>
              )}

              <textarea
                value={widgetHtmlDraft}
                onChange={(e) => setWidgetHtmlDraft(e.target.value)}
                rows={15}
                spellCheck={false}
                className="w-full flex-1 bg-[#060810] border border-white/10 rounded-xl p-3 text-[11px] font-mono text-emerald-100 leading-relaxed outline-none select-text resize-none"
              />
              <div className="text-[10px] text-zinc-400">
                Astuce : écoutez <code className="text-emerald-300">window.addEventListener('message', e =&gt; ...)</code> pour recevoir en direct <code>cpu</code>, <code>gpu</code>, <code>mem</code>, <code>cpus</code> et <code>ports</code> du noyau !
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 6: MOD MANAGER, CUSTOM CSS & AGENT OS API ──────────────────── */}
        {tab === "mods" && (
          <div className="space-y-5">
            {/* Mod Manager List */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wider text-violet-300">
                  Gestionnaire de Mods (Généraux & Spécifiques)
                </div>
                <div className="flex items-center gap-1">
                  {(["all", "css", "theme", "decorator", "shell"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setModFilter(k)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] uppercase font-mono border cursor-pointer ${
                        modFilter === k
                          ? "bg-violet-500/25 border-violet-400 text-white"
                          : "bg-white/5 border-white/10 text-zinc-400"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {mods.mods
                  .filter((m) => modFilter === "all" || m.kind === modFilter)
                  .map((m) => (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-2xl border transition flex items-start justify-between gap-3 ${
                        m.enabled
                          ? "bg-violet-500/14 border-violet-400/45"
                          : "bg-white/[0.03] border-white/10"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white">{m.name}</span>
                          <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] font-mono text-zinc-300">
                            {m.scope}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 text-[9px] font-mono text-cyan-200">
                            {m.kind}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug">{m.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!m.builtin && (
                          <button
                            type="button"
                            onClick={() => modStore.uninstallMod(m.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => modStore.toggleMod(m.id)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
                            m.enabled
                              ? "bg-emerald-500 text-black"
                              : "bg-white/10 hover:bg-white/20 text-zinc-200"
                          }`}
                        >
                          {m.enabled ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Create Custom CSS Mod */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Créer un Mod CSS Global / Spécifique (Hot-Reload)
              </div>
              <div className="flex gap-2">
                <input
                  value={newModName}
                  onChange={(e) => setNewModName(e.target.value)}
                  placeholder="Nom du mod CSS (ex: Bordures Or Néon)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = newModName.trim() || "Custom CSS Mod";
                    const mod: OsMod = {
                      id: `mod-css-${Date.now().toString(36).slice(-4)}`,
                      name,
                      author: "Vous",
                      version: "1.0.0",
                      kind: "css",
                      scope: "specific",
                      description: "Mod CSS injecté en direct",
                      tags: ["custom", "css"],
                      enabled: true,
                      css: newModCss,
                    };
                    modStore.upsertMod(mod);
                    setNewModName("");
                    wmStore.pushToast("Mod CSS installé", `${name} est actif.`, "success");
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-semibold text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Installer & Activer
                </button>
              </div>
              <textarea
                value={newModCss}
                onChange={(e) => setNewModCss(e.target.value)}
                rows={4}
                spellCheck={false}
                className="w-full bg-[#060810] border border-white/10 rounded-xl p-3 text-[11px] font-mono text-violet-100 outline-none select-text"
              />
            </div>

            {/* Agent OS API Cheatsheet */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-[#0c101c] to-cyan-500/10 border border-emerald-400/25 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Terminal className="w-4 h-4" />
                  100 % Pilotable par les Agents IA (osctl & MCP)
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  Claude Code · Pi · window.unkernelOS
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {AGENT_API_EXAMPLES.map((ex) => (
                  <div
                    key={ex.title}
                    className="p-2.5 rounded-xl bg-black/45 border border-white/10 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-zinc-200">{ex.title}</span>
                      <button
                        type="button"
                        onClick={() => copyText(ex.cmd)}
                        className="p-1 rounded bg-white/8 hover:bg-white/16 text-zinc-300 cursor-pointer"
                      >
                        {copiedCmd === ex.cmd ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <code className="block text-[10px] font-mono text-cyan-200 break-all select-text">
                      {ex.cmd}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
