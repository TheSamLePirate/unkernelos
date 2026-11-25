import { Effect } from "effect";
import {
  Box,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  KeyRound,
  LayoutGrid,
  Monitor,
  Network,
  Palette,
  Pause,
  Play,
  Puzzle,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  Wifi,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  HDRI_PRESETS,
  modStore,
  ULTRA_HD_BACKDROPS,
  useMods,
  type AmbientParticlesKind,
  type ColorProfileKind,
  type CursorTrailKind,
  type Desktop3dSceneKind,
  type DockStyleKind,
  type HdriPresetId,
  type HotCornerAction,
  type TaskbarModeKind,
  type TopBarStyleKind,
  type WindowDecoratorStyle,
  type WindowOpenAnimKind,
} from "../../core/mod-store.ts";
import { OS_THEMES, WALLPAPER_SHADERS } from "../../core/os-themes.ts";
import { reactiveEngine, useReactiveMod } from "../../core/reactive-mod-engine.ts";
import {
  appRuntime,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_CREDENTIALS,
  DEFAULT_UNKERNEL_CONFIG,
  type AgentKind,
  type ClaudeEffort,
  type ClaudePermissionMode,
  type DistroKind,
  type FbScalingMode,
  type KittyThemeId,
  type OsThemeId,
  type PiThinking,
  type WallpaperShaderId,
} from "../../core/schema.ts";
import { uiSounds, type SoundProfileId } from "../../core/ui-sounds.ts";
import { spatial3dBridge, type Spatial3dLayoutKind } from "../../gpu/spatial-3d-bridge.ts";
import { KITTY_THEMES } from "../../gpu/webgpu-terminal.ts";
import { wmStore, type GridLayoutMode } from "../../wm/wm-store.ts";

export type SettingsTab =
  | "appearance"
  | "desktop3d"
  | "windows-dock"
  | "eyecandy"
  | "mods-widgets"
  | "compute"
  | "graphics"
  | "network"
  | "storage"
  | "credentials";

const RESOLUTIONS = [
  { label: "640 × 480", tag: "VGA", w: 640, h: 480 },
  { label: "800 × 600", tag: "SVGA", w: 800, h: 600 },
  { label: "1024 × 640", tag: "HD Glass", w: 1024, h: 640 },
  { label: "1280 × 720", tag: "720p", w: 1280, h: 720 },
];

const SCENES_3D: readonly {
  id: Desktop3dSceneKind;
  name: string;
  emoji: string;
  desc: string;
  gradient: string;
}[] = [
  {
    id: "ocean-sunset",
    name: "Océan & Coucher de Soleil",
    emoji: "🌅",
    desc: "Vagues océaniques WebGPU, reflets dorés et horizon 4K",
    gradient: "linear-gradient(135deg, #0b1630 0%, #4b234e 48%, #f59e0b 100%)",
  },
  {
    id: "alpine-fjord",
    name: "Fjord Alpin & Lac Miroir",
    emoji: "🏔️",
    desc: "Sommets enneigés, brume volumétrique et eau calme",
    gradient: "linear-gradient(135deg, #0c1f2e 0%, #1d4e68 55%, #7dd3fc 100%)",
  },
  {
    id: "earth-orbit",
    name: "Orbite Terrestre (NASA 4K)",
    emoji: "🌍",
    desc: "Blue Marble 4K, atmosphère Rayleigh+Mie et Lune en orbite",
    gradient: "linear-gradient(135deg, #030712 0%, #0d3b66 55%, #38bdf8 100%)",
  },
  {
    id: "jupiter-orbit",
    name: "Orbite de Jupiter & Europe",
    emoji: "🪐",
    desc: "Géante gazeuse NASA, atmosphère ambrée et lunes glacées",
    gradient: "linear-gradient(135deg, #09060d 0%, #7c3a1d 55%, #f5b971 100%)",
  },
  {
    id: "lunar-horizon",
    name: "Horizon Lunaire & Earthrise",
    emoji: "🌕",
    desc: "Surface lunaire cratérisée et lever de Terre haute définition",
    gradient: "linear-gradient(135deg, #05070c 0%, #374151 55%, #93c5fd 100%)",
  },
  {
    id: "aurora-fjord",
    name: "Aurores Boréales & Mer Arctique",
    emoji: "🌌",
    desc: "Rideaux auroraux animés, banquise et ciel étoilé polaire",
    gradient: "linear-gradient(135deg, #030a16 0%, #0f5132 52%, #a855f7 100%)",
  },
];

const LAYOUTS_3D: readonly { id: Spatial3dLayoutKind; label: string; emoji: string; desc: string }[] = [
  { id: "curved-cockpit", label: "Arc VisionOS", emoji: "🥽", desc: "Cockpit panoramique incurvé" },
  { id: "spatial-grid", label: "Grille 3D", emoji: "⊞", desc: "Mur matriciel multi-fenêtres" },
  { id: "compiz-cube", label: "Cube Compiz", emoji: "🧊", desc: "Cube 4 faces (4 bureaux)" },
  { id: "studio-desk", label: "Ailes Studio", emoji: "🖥️", desc: "Écran central + ailes inclinées" },
  { id: "gallery-ring", label: "Anneau 360°", emoji: "🪐", desc: "Carrousel spatial complet" },
];

const DECORATOR_STYLES: readonly { id: WindowDecoratorStyle; label: string; group: string }[] = [
  { id: "macos", label: "macOS Sequoia", group: "Apple" },
  { id: "macos-classic", label: "macOS Aqua", group: "Apple" },
  { id: "visionos-glass", label: "visionOS Glass", group: "Apple" },
  { id: "windows-11", label: "Windows 11 Mica", group: "Windows" },
  { id: "windows-xp", label: "Windows XP Luna", group: "Windows" },
  { id: "windows-95", label: "Windows 95 Classic", group: "Windows" },
  { id: "gnome-adwaita", label: "GNOME Adwaita", group: "Linux" },
  { id: "kde-breeze", label: "KDE Plasma Breeze", group: "Linux" },
  { id: "xfce-lxde", label: "XFCE / LXDE", group: "Linux" },
  { id: "compiz-emerald", label: "Compiz Emerald", group: "Linux" },
  { id: "tiling-i3", label: "i3 / Hyprland Tiling", group: "Linux" },
  { id: "cyber-hud", label: "Cyberpunk HUD", group: "Créatif" },
  { id: "minimal-swiss", label: "Minimal Swiss", group: "Créatif" },
  { id: "floating-zen", label: "Floating Zen", group: "Créatif" },
];

const TASKBAR_MODES: readonly { id: TaskbarModeKind; label: string }[] = [
  { id: "dock", label: "macOS Dock Flottant" },
  { id: "win11", label: "Windows 11 Centré" },
  { id: "winxp", label: "Windows XP Luna" },
  { id: "win95", label: "Windows 95 Démarrer" },
  { id: "kde-plasma", label: "KDE Plasma Panel" },
  { id: "xfce-lxde", label: "XFCE / LXDE Panel" },
  { id: "ios-springboard", label: "iOS / iPadOS Dock" },
  { id: "visionos-ornament", label: "visionOS Ornament" },
];

const DOCK_STYLES: readonly { id: DockStyleKind; label: string }[] = [
  { id: "floating-glass", label: "Liquid Glass" },
  { id: "full-taskbar", label: "Barre Complète" },
  { id: "minimal-pill", label: "Pilule Minimale" },
  { id: "cyber-rail", label: "Rail Néon Cyber" },
  { id: "hidden", label: "Masqué" },
];

const TOPBAR_STYLES: readonly { id: TopBarStyleKind; label: string }[] = [
  { id: "glass", label: "macOS Liquid Glass" },
  { id: "floating-pills", label: "Pilules Flottantes" },
  { id: "gnome", label: "GNOME Top Panel" },
  { id: "ios", label: "iOS Dynamic Island" },
  { id: "retro", label: "Rétro Classic" },
  { id: "minimal", label: "Minimal Ultra-Fin" },
  { id: "hidden", label: "Masquée" },
];

const HOT_CORNER_OPTIONS: readonly { id: HotCornerAction; label: string }[] = [
  { id: "none", label: "Désactivé" },
  { id: "mission-control", label: "Mission Control (Exposé)" },
  { id: "launcher", label: "Lanceur d'Applications" },
  { id: "command-palette", label: "Palette de Commandes (⌘K)" },
  { id: "desktop-3d", label: "Basculer Bureau 3D Spatial" },
  { id: "grid-tile", label: "Ranger en Grille 2D" },
  { id: "minimize-all", label: "Afficher le Bureau" },
  { id: "lock-screen", label: "Verrouiller l'écran" },
];

const COLOR_PROFILES: readonly { id: ColorProfileKind; label: string; swatch: string }[] = [
  { id: "neutral", label: "Studio Neutre", swatch: "linear-gradient(135deg,#6366f1,#38bdf8)" },
  { id: "oled-vivid", label: "OLED Vivid", swatch: "linear-gradient(135deg,#a855f7,#ec4899)" },
  { id: "cinema-warm", label: "Cinéma Chaud", swatch: "linear-gradient(135deg,#f59e0b,#ef4444)" },
  { id: "nordic-cool", label: "Nordique Froid", swatch: "linear-gradient(135deg,#0ea5e9,#94a3b8)" },
  { id: "cyber-hdr", label: "Cyber HDR", swatch: "linear-gradient(135deg,#22d3ee,#f43f5e)" },
  { id: "monochrome-ink", label: "Encre Monochrome", swatch: "linear-gradient(135deg,#e4e4e7,#27272a)" },
];

const SOUND_PROFILES: readonly { id: SoundProfileId; label: string; desc: string }[] = [
  { id: "crystal", label: "Crystal Glass", desc: "Carillons cristallins subtils" },
  { id: "mechanical", label: "Mechanical Tactile", desc: "Clics précis type clavier méca" },
  { id: "synth-retro", label: "Synth Rétro", desc: "Impulsions analogiques 80s" },
  { id: "zen-wood", label: "Zen Wood", desc: "Résonances organiques douces" },
  { id: "silent", label: "Silencieux", desc: "Aucun son d'interface" },
];

interface NavItem {
  id: SettingsTab;
  label: string;
  subtitle: string;
  group: "Visuel & Spatial" | "Interface & Mods" | "Système Linux" | "Cloud & IA";
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  keywords: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "appearance",
    label: "Apparence & Fonds 4K",
    subtitle: "Thèmes, NASA 4K, Shaders, Terminal",
    group: "Visuel & Spatial",
    icon: Palette,
    iconBg: "from-violet-500 to-fuchsia-500",
    keywords: "theme apparence wallpaper shader webgpu nasa terre lune jupiter saturne 4k backdrop glass blur opacity kitty terminal font variant macos windows linux",
  },
  {
    id: "desktop3d",
    label: "Bureau Spatial 3D",
    subtitle: "Mondes 3D, HDRI 4K, Caméra, Dock 3D",
    group: "Visuel & Spatial",
    icon: Box,
    iconBg: "from-cyan-500 to-blue-600",
    keywords: "3d spatial webgpu threejs hdri skybox ocean fjord earth jupiter moon aurora orbit compiz cube arc grille ailes dock 3d ombres shadow camera zqsd bloom",
  },
  {
    id: "windows-dock",
    label: "Fenêtres, Dock & Barre",
    subtitle: "14 Décorateurs, FX, Grille 2D, Dock Pro",
    group: "Interface & Mods",
    icon: LayoutGrid,
    iconBg: "from-indigo-500 to-sky-500",
    keywords: "fenetre window decorator macos win95 win11 gnome kde xfce compiz visionos wobbly genie burn flip3d hover tilt chroma grid tiling dock autohide reflection topbar taskbar",
  },
  {
    id: "eyecandy",
    label: "Eye Candy, Optique & Sons",
    subtitle: "Curseur, Particules, Night Shift, Coins",
    group: "Interface & Mods",
    icon: Sparkles,
    iconBg: "from-pink-500 to-rose-500",
    keywords: "eye candy spotlight cursor trail ripple particles sakura snow rain fireflies embers night shift color profile oled grain vignette motion speed perf hud audio sound pack hot corners coins actifs",
  },
  {
    id: "mods-widgets",
    label: "Mods, Widgets & Backup",
    subtitle: "16 Mods paramétrables, Widgets, CSS",
    group: "Interface & Mods",
    icon: Puzzle,
    iconBg: "from-amber-500 to-orange-600",
    keywords: "mod mods plugin widget meteo bourse json healthcheck bookmarks css custom export import backup reset studio",
  },
  {
    id: "compute",
    label: "Linux & Compute",
    subtitle: "Debian/Alpine, RAM, vCPU, JIT, Kernel",
    group: "Système Linux",
    icon: Cpu,
    iconBg: "from-emerald-500 to-teal-600",
    keywords: "linux debian alpine busybox distro ram memory cpu vcpu smp worker jit sharedarraybuffer wasi safe mode verbose kernel cmdline autosuspend",
  },
  {
    id: "graphics",
    label: "Écran, FB0, GL & WebGPU",
    subtitle: "Résolution, CRT/Crisp, VirGL, Wayland",
    group: "Système Linux",
    icon: Monitor,
    iconBg: "from-fuchsia-500 to-purple-600",
    keywords: "fb0 framebuffer resolution display scaling crisp smooth crt gpu virtio virgl gl wayland wland alsa sound webgpu terminal",
  },
  {
    id: "network",
    label: "Réseau (Wisp Relay)",
    subtitle: "TCP/IP eth0, WSS Relay, Ping",
    group: "Système Linux",
    icon: Network,
    iconBg: "from-sky-500 to-cyan-600",
    keywords: "network reseau wisp wss relay eth0 tcp ip ping latency fetch routes internet",
  },
  {
    id: "storage",
    label: "Disque & Snapshots VM",
    subtitle: "ext4 IndexedDB, Export, Suspend",
    group: "Système Linux",
    icon: HardDrive,
    iconBg: "from-blue-500 to-indigo-600",
    keywords: "storage disque disk ext4 indexeddb kwsparse export import reset snapshot suspend resume memory",
  },
  {
    id: "credentials",
    label: "Clés API, Agents IA & GitHub",
    subtitle: "OAuth, Claude, Pi, OpenAI, Gemini",
    group: "Cloud & IA",
    icon: KeyRound,
    iconBg: "from-rose-500 to-amber-500",
    keywords: "api key anthropic openai gemini openrouter github oauth token git author claude pi agent effort thinking permission mode mcp",
  },
];

/* ─── Reusable AAA UI Primitives ─────────────────────────────────────────── */

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "pink";
}> = ({ checked, onChange, accent = "violet" }) => {
  const onBg =
    accent === "cyan"
      ? "bg-cyan-500"
      : accent === "emerald"
      ? "bg-emerald-500"
      : accent === "amber"
      ? "bg-amber-500"
      : accent === "pink"
      ? "bg-pink-500"
      : "bg-violet-500";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        uiSounds.playClick();
        onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
        checked
          ? `${onBg} border-white/25 shadow-[0_0_12px_rgba(139,92,246,0.35)]`
          : "bg-white/10 border-white/15 hover:bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
};

const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, badge, action, children }) => (
  <div className="rounded-2xl bg-white/[0.032] border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
    <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[12.5px] font-semibold text-white tracking-tight">{title}</h3>
          {badge && (
            <span className="px-1.5 py-0.5 rounded-md bg-violet-500/20 border border-violet-400/30 text-[9.5px] font-mono text-violet-200">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="p-4 space-y-3.5">{children}</div>
  </div>
);

const ToggleRow: React.FC<{
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  badge?: string;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "pink";
}> = ({ title, desc, checked, onChange, badge, accent }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-zinc-100">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-400/25 text-[9px] text-amber-200 font-mono">
            {badge}
          </span>
        )}
      </div>
      {desc && <div className="text-[11px] text-zinc-400 leading-snug mt-0.5">{desc}</div>}
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} accent={accent} />
  </div>
);

const SliderControl: React.FC<{
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  accentClass?: string;
}> = ({ label, valueLabel, min, max, step, value, onChange, hint, accentClass = "accent-violet-500" }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-zinc-200">{label}</span>
      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-cyan-300">
        {valueLabel}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`w-full cursor-pointer ${accentClass}`}
    />
    {hint && <p className="text-[10.5px] text-zinc-500 leading-snug">{hint}</p>}
  </div>
);

/* ─── Main AAA Settings Panel ────────────────────────────────────────────── */

export const SettingsApp: React.FC<{ initialTab?: SettingsTab }> = ({ initialTab }) => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const creds = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.credsRef),
    DEFAULT_CREDENTIALS
  );
  const vmState = useSubscriptionRef(
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
  const mods = useMods();
  const reactive = useReactiveMod();

  const [tab, setTab] = useState<SettingsTab>(initialTab ?? "appearance");
  const [search, setSearch] = useState("");
  const [wispPing, setWispPing] = useState<string | null>(null);
  const [needsReboot, setNeedsReboot] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [customBackdropInput, setCustomBackdropInput] = useState(mods.customBackdropImageUrl);
  const [customHdriInput, setCustomHdriInput] = useState(mods.desktop3d.hdriUrl);
  const importDiskRef = useRef<HTMLInputElement>(null);
  const importPackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setCustomBackdropInput(mods.customBackdropImageUrl);
  }, [mods.customBackdropImageUrl]);

  useEffect(() => {
    setCustomHdriInput(mods.desktop3d.hdriUrl);
  }, [mods.desktop3d.hdriUrl]);

  const maxHostCores =
    typeof navigator !== "undefined" ? Math.min(16, navigator.hardwareConcurrency || 8) : 8;

  const activeVariant = useMemo(
    () => mods.variants.find((v) => v.id === mods.activeVariantId) ?? mods.variants[0],
    [mods.variants, mods.activeVariantId]
  );

  const enabledModCount = useMemo(() => mods.mods.filter((m) => m.enabled).length, [mods.mods]);
  const enabledWidgetCount = useMemo(
    () => mods.widgets.filter((w) => w.enabled).length,
    [mods.widgets]
  );

  const searchQuery = search.trim().toLowerCase();
  const filteredNav = useMemo(() => {
    if (!searchQuery) return NAV_ITEMS;
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(searchQuery) ||
        item.subtitle.toLowerCase().includes(searchQuery) ||
        item.keywords.toLowerCase().includes(searchQuery)
    );
  }, [searchQuery]);

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === tab) ?? NAV_ITEMS[0]!;

  const patchCfg = (patch: Partial<typeof cfg>, requiresReboot = true) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig(patch)));
    if (requiresReboot) setNeedsReboot(true);
  };

  const patchCreds = (patch: Partial<typeof creds>) => {
    appRuntime.runFork(
      Effect.gen(function* () {
        const s = yield* SettingsService;
        const next = yield* s.updateCredentials(patch);
        const vm = yield* VmService;
        yield* vm.syncCredentials(next);
      })
    );
  };

  const applyAndReboot = () => {
    setNeedsReboot(false);
    appRuntime.runFork(
      Effect.flatMap(VmService, (v) => v.reboot()).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => wmStore.pushToast("Reboot Failed", err.message, "error"))
        )
      )
    );
  };

  const testWisp = async () => {
    const url = cfg.wispUrl.trim();
    if (!url) {
      setWispPing("Entrez une URL wss:// Wisp d'abord");
      return;
    }
    setWispPing("Test de connexion WSS...");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.testWispLatency(url)))
    );
    if (res._tag === "Right") setWispPing(`Connecté en ${res.right} ms`);
    else setWispPing(`Échec : ${res.left.message}`);
  };

  const handleExportDisk = async () => {
    wmStore.pushToast("Export Disque", "Compression des blocs ext4 persistants...", "info");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.exportDataDiskImage()))
    );
    if (res._tag === "Right") {
      const bytes = new Uint8Array(res.right);
      const blob = new Blob([bytes.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unkernelos-data-${new Date().toISOString().slice(0, 10)}.kwsparse`;
      a.click();
      URL.revokeObjectURL(url);
      wmStore.pushToast("Disque Exporté", `${(bytes.byteLength / 1e6).toFixed(2)} MB`, "success");
    } else {
      wmStore.pushToast("Échec Export", res.left.message, "error");
    }
  };

  const handleImportDisk = async (file: File | undefined) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.importDataDiskImage(bytes)))
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Disque Importé", `${res.right.blocks} blocs restaurés. Redémarrage...`, "success");
      applyAndReboot();
    } else {
      wmStore.pushToast("Échec Import", res.left.message, "error");
    }
  };

  const handleResetDisk = async () => {
    if (
      !window.confirm(
        "Effacer entièrement le disque persistant /data dans IndexedDB ? Tous vos paquets et fichiers installés seront supprimés."
      )
    ) {
      return;
    }
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.resetDataDiskStorage()))
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Disque Réinitialisé", "Redémarrage à neuf...", "info");
      applyAndReboot();
    }
  };

  const handleExportModPack = () => {
    const json = modStore.exportBundleJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unkernelos-modpack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    wmStore.pushToast("Mod Pack Exporté", "Configuration complète sauvegardée en JSON.", "success");
  };

  const handleImportModPack = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = modStore.importBundleJson(text);
    if (res.ok) {
      wmStore.pushToast("Mod Pack Importé", "Thème, 3D, mods & widgets appliqués.", "success");
    } else {
      wmStore.pushToast("Import invalide", res.error ?? "JSON corrompu", "error");
    }
  };

  const navGroups: readonly NavItem["group"][] = [
    "Visuel & Spatial",
    "Interface & Mods",
    "Système Linux",
    "Cloud & IA",
  ];

  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-[#090b12]/96 text-zinc-100 overflow-hidden select-none">
      {/* ─── LEFT SIDEBAR (macOS Sequoia / VisionOS Style) ─────────────── */}
      <aside className="w-full md:w-64 shrink-0 bg-black/45 border-b md:border-b-0 md:border-r border-white/[0.09] flex flex-col overflow-hidden">
        {/* Search + Identity Header */}
        <div className="p-2.5 md:p-3 space-y-2.5 border-b border-white/[0.07]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un réglage…"
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.09] focus:border-violet-400/50 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Live OS Profile Card (Desktop) */}
          <div className="hidden md:flex items-center gap-2.5 p-2 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.08]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/35 to-cyan-500/30 border border-white/15 flex items-center justify-center text-base shrink-0">
              {activeVariant?.emoji ?? "✨"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold text-white truncate">
                {mods.shell.brandLabel || "unkernelOS"}
              </div>
              <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    vmState.phase === "running"
                      ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                      : "bg-amber-400"
                  }`}
                />
                <span>
                  {cfg.distro.toUpperCase()} · {cfg.cpus}c · {cfg.memoryMiB}M
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ enabled: !mods.desktop3d.enabled })}
              title="Basculer Bureau 3D Spatial"
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                mods.desktop3d.enabled
                  ? "bg-cyan-500/25 border-cyan-400/50 text-cyan-200"
                  : "bg-white/[0.05] border-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              3D
            </button>
          </div>
        </div>

        {/* Category Navigation */}
        <nav className="flex-1 overflow-x-auto md:overflow-y-auto p-2 flex flex-row md:flex-col gap-1 md:gap-3 no-scrollbar">
          {searchQuery ? (
            <div className="flex flex-row md:flex-col gap-1 w-full">
              {filteredNav.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-zinc-500 text-center">
                  Aucun réglage trouvé pour « {search} »
                </div>
              ) : (
                filteredNav.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        uiSounds.playClick();
                        setTab(item.id);
                      }}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition whitespace-nowrap md:whitespace-normal shrink-0 md:shrink ${
                        active
                          ? "bg-violet-500/22 text-white border border-violet-400/40 shadow-sm"
                          : "text-zinc-300 hover:bg-white/[0.06] border border-transparent"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-lg bg-gradient-to-br ${item.iconBg} flex items-center justify-center text-white shadow-sm shrink-0`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11.5px] font-medium leading-tight truncate">{item.label}</div>
                        <div className="hidden md:block text-[9.5px] text-zinc-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            navGroups.map((group) => {
              const items = NAV_ITEMS.filter((n) => n.group === group);
              return (
                <div key={group} className="flex flex-row md:flex-col gap-1 shrink-0 md:shrink">
                  <div className="hidden md:block px-2.5 pb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-500">
                    {group}
                  </div>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    const badgeText =
                      item.id === "desktop3d" && mods.desktop3d.enabled
                        ? "ON"
                        : item.id === "mods-widgets"
                        ? `${enabledModCount}`
                        : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          uiSounds.playClick();
                          setTab(item.id);
                        }}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 md:py-2 rounded-xl text-left transition whitespace-nowrap md:whitespace-normal shrink-0 md:shrink ${
                          active
                            ? "bg-violet-500/22 text-white border border-violet-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "text-zinc-300 hover:bg-white/[0.055] border border-transparent"
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg bg-gradient-to-br ${item.iconBg} flex items-center justify-center text-white shadow-sm shrink-0`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] font-medium leading-tight truncate">{item.label}</div>
                          <div className="hidden md:block text-[9.5px] text-zinc-400 truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        </div>
                        {badgeText && (
                          <span className="hidden md:inline-flex px-1.5 py-0.5 rounded-md bg-white/10 text-[9.5px] font-mono text-cyan-200">
                            {badgeText}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="p-2.5 border-t border-white/[0.08] bg-black/30 flex md:flex-col gap-2 shrink-0">
          {needsReboot && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[10.5px] text-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              Config noyau modifiée — redémarrez la VM.
            </div>
          )}
          <button
            type="button"
            onClick={applyAndReboot}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 shadow-lg shadow-violet-900/30 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Appliquer &amp; Redémarrer VM</span>
          </button>
          <div className="hidden md:grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => wmStore.openApp("mod-studio")}
              className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-zinc-200 transition"
            >
              <Wand2 className="w-3 h-3 text-violet-300" />
              Mod Studio
            </button>
            <button
              type="button"
              onClick={() => wmStore.openApp("rune-settings")}
              className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-zinc-200 transition"
            >
              <Sliders className="w-3 h-3 text-cyan-300" />
              Liquid Metal
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MAIN SETTINGS CONTENT PANE ────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Sticky Pane Header */}
        <header className="px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl bg-gradient-to-br ${activeNavMeta.iconBg} flex items-center justify-center text-white shadow-md shrink-0`}
            >
              <activeNavMeta.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white tracking-tight truncate">
                {activeNavMeta.label}
              </h1>
              <p className="text-[11px] text-zinc-400 truncate">{activeNavMeta.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[10.5px] font-mono text-zinc-300">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  vmState.webgpuAvailable ? "bg-cyan-400" : "bg-zinc-500"
                }`}
              />
              {vmState.webgpuAvailable ? "WebGPU Actif" : "Canvas2D"}
            </span>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="max-w-3xl space-y-4 pb-6">
            {/* ═══════════════════════════════════════════════════════════
                TAB 1: APPARENCE, THÈMES, FONDS 4K & TERMINAL
               ═══════════════════════════════════════════════════════════ */}
            {tab === "appearance" && (
              <>
                <SectionCard
                  title="Variantes Complètes de l'OS"
                  subtitle="Transforme instantanément l'interface (Windows 95→11, Linux GNOME/KDE/Compiz, macOS→visionOS, Cyber…)"
                  badge={`${mods.variants.length} profils`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {mods.variants.map((v) => {
                      const active = mods.activeVariantId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            uiSounds.playSnap();
                            modStore.applyVariant(v.id);
                          }}
                          className={`text-left p-2.5 rounded-xl border transition ${
                            active
                              ? "bg-violet-500/20 border-violet-400/60 text-white shadow-md"
                              : "bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.07]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm">{v.emoji}</span>
                            <span className="flex items-center gap-0.5">
                              {v.swatches.map((hex, i) => (
                                <span
                                  key={`${v.id}-${i}`}
                                  className="w-2 h-2 rounded-full border border-white/25"
                                  style={{ background: hex }}
                                />
                              ))}
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold truncate mt-1">{v.name}</div>
                          <div className="text-[9.5px] text-zinc-400 truncate">{v.tagline}</div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Thèmes Système & Palette Personnalisée"
                  subtitle="Préréglages Liquid Glass + surcouche de tokens CSS en temps réel"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(Object.keys(OS_THEMES) as OsThemeId[]).map((id) => {
                      const t = OS_THEMES[id];
                      const active = cfg.osTheme === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            uiSounds.playClick();
                            modStore.setTheme({ enabled: false });
                            modStore.setBackdropImage(null);
                            modStore.setActiveShaderMod(null);
                            patchCfg({ osTheme: id, wallpaperShader: t.defaultShader }, false);
                          }}
                          className={`text-left p-3 rounded-xl border transition ${
                            active
                              ? "bg-violet-500/20 border-violet-400/55 text-white"
                              : "bg-white/[0.025] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold">{t.name}</span>
                            <span className="flex items-center gap-1">
                              {t.swatches.map((hex) => (
                                <span
                                  key={hex}
                                  className="w-2.5 h-2.5 rounded-full border border-white/25"
                                  style={{ background: hex }}
                                />
                              ))}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-zinc-400 leading-snug">{t.tagline}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-white/[0.07] space-y-3">
                    <ToggleRow
                      title="Activer les Tokens de Thème Personnalisés"
                      desc="Surcharge les couleurs d'accent, le flou et la transparence sur tout l'OS"
                      checked={mods.theme.enabled}
                      onChange={(enabled) => modStore.setTheme({ enabled })}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <label className="p-2.5 rounded-xl bg-black/35 border border-white/10 flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-[11px] text-zinc-300">Accent 1</span>
                        <input
                          type="color"
                          value={mods.theme.accentPrimary}
                          onChange={(e) =>
                            modStore.setTheme({ enabled: true, accentPrimary: e.target.value })
                          }
                          className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                        />
                      </label>
                      <label className="p-2.5 rounded-xl bg-black/35 border border-white/10 flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-[11px] text-zinc-300">Accent 2</span>
                        <input
                          type="color"
                          value={mods.theme.accentSecondary}
                          onChange={(e) =>
                            modStore.setTheme({ enabled: true, accentSecondary: e.target.value })
                          }
                          className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                        />
                      </label>
                      <div className="col-span-2 grid grid-cols-2 gap-2.5">
                        <SliderControl
                          label="Flou Verre"
                          valueLabel={`${cfg.glassBlur} px`}
                          min={8}
                          max={48}
                          step={2}
                          value={cfg.glassBlur}
                          onChange={(v) => {
                            patchCfg({ glassBlur: v }, false);
                            if (mods.theme.enabled) modStore.setTheme({ blurPx: v });
                          }}
                        />
                        <SliderControl
                          label="Opacité Verre"
                          valueLabel={`${Math.round(cfg.glassOpacity * 100)}%`}
                          min={45}
                          max={95}
                          step={2}
                          value={Math.round(cfg.glassOpacity * 100)}
                          onChange={(v) => {
                            patchCfg({ glassOpacity: v / 100 }, false);
                            if (mods.theme.enabled) modStore.setTheme({ glassOpacity: v / 100 });
                          }}
                          accentClass="accent-cyan-400"
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Fonds Ultra-HD NASA & 4K (Bureau 2D & 3D)"
                  subtitle="Terre, Lune, Jupiter, Saturne, Galaxie & Océan en ultra haute définition"
                  action={
                    mods.activeBackdropImageId && (
                      <button
                        type="button"
                        onClick={() => modStore.setBackdropImage(null)}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] bg-white/8 hover:bg-white/14 text-zinc-200 border border-white/10"
                      >
                        Revenir au Shader
                      </button>
                    )
                  }
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {ULTRA_HD_BACKDROPS.map((b) => {
                      const active = mods.activeBackdropImageId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            uiSounds.playClick();
                            modStore.setBackdropImage(b.id);
                          }}
                          className={`group text-left rounded-xl overflow-hidden border transition ${
                            active
                              ? "border-cyan-400/75 ring-1 ring-cyan-400/40"
                              : "border-white/10 hover:border-white/25"
                          }`}
                        >
                          <div className="h-20 w-full relative overflow-hidden bg-black">
                            <img
                              src={b.url}
                              alt={b.name}
                              crossOrigin="anonymous"
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur text-[10px]">
                              {b.emoji}
                            </span>
                          </div>
                          <div className="p-2 bg-black/55">
                            <div className="text-[11px] font-medium text-white truncate">{b.name}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={customBackdropInput}
                      onChange={(e) => setCustomBackdropInput(e.target.value)}
                      placeholder="URL d'image 4K personnalisée (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-xl bg-black/45 border border-white/10 text-xs font-mono text-zinc-200 outline-none focus:border-cyan-400/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customBackdropInput.trim()) return;
                        modStore.setBackdropImage("custom", customBackdropInput.trim());
                        wmStore.pushToast("Fond 4K Appliqué", "Image personnalisée active.", "success");
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 text-cyan-200"
                    >
                      Appliquer
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Shaders WebGPU Temps Réel"
                  subtitle="Fonds d'écran WGSL natifs et shaders communautaires"
                >
                  <ToggleRow
                    title="Moteur de Shaders WebGPU Live"
                    desc="Rendu procédural 60/120fps sur le GPU"
                    checked={cfg.webgpuWallpaper}
                    onChange={(v) => patchCfg({ webgpuWallpaper: v }, false)}
                    accent="cyan"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {(Object.keys(WALLPAPER_SHADERS) as WallpaperShaderId[]).map((id) => {
                      const s = WALLPAPER_SHADERS[id];
                      const active =
                        cfg.wallpaperShader === id &&
                        !mods.activeShaderModId &&
                        !mods.activeBackdropImageId;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            modStore.setBackdropImage(null);
                            modStore.setActiveShaderMod(null);
                            patchCfg({ wallpaperShader: id, webgpuWallpaper: true }, false);
                          }}
                          className={`text-left rounded-xl overflow-hidden border transition ${
                            active
                              ? "border-cyan-400/75 ring-1 ring-cyan-400/40"
                              : "border-white/10 hover:border-white/25"
                          }`}
                        >
                          <div className="h-11 w-full" style={{ background: s.previewGradient }} />
                          <div className="p-2 bg-black/50">
                            <div className="text-[11px] font-semibold text-white truncate">{s.name}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {mods.shaders.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.07] space-y-2">
                      <div className="text-[11px] font-medium text-zinc-400">
                        Shaders Mods WGSL ({mods.shaders.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {mods.shaders.map((sh) => {
                          const active =
                            mods.activeShaderModId === sh.id && !mods.activeBackdropImageId;
                          return (
                            <button
                              key={sh.id}
                              type="button"
                              onClick={() => {
                                modStore.setBackdropImage(null);
                                modStore.setActiveShaderMod(active ? null : sh.id);
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition ${
                                active
                                  ? "bg-fuchsia-500/25 border-fuchsia-400/55 text-white"
                                  : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]"
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ background: sh.previewGradient }}
                              />
                              {sh.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Terminal WebGPU Kitty"
                  subtitle="Palette de couleurs ANSI, taille de police et transparence du terminal"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(Object.keys(KITTY_THEMES) as KittyThemeId[]).map((id) => {
                      const kt = KITTY_THEMES[id];
                      const active = cfg.kittyTheme === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => patchCfg({ kittyTheme: id }, false)}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            active
                              ? "border-violet-400/70 ring-1 ring-violet-400/40"
                              : "border-white/10 hover:border-white/25"
                          }`}
                          style={{ background: kt.bg }}
                        >
                          <div className="text-[11px] font-semibold truncate" style={{ color: kt.fg }}>
                            {kt.name}
                          </div>
                          <div className="flex items-center gap-1 mt-2">
                            {kt.ansi.slice(1, 7).map((c, idx) => (
                              <span
                                key={idx}
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <SliderControl
                      label="Taille de Police"
                      valueLabel={`${cfg.terminalFontSize} px`}
                      min={10}
                      max={22}
                      step={0.5}
                      value={cfg.terminalFontSize}
                      onChange={(v) => patchCfg({ terminalFontSize: v }, false)}
                    />
                    <SliderControl
                      label="Opacité du Terminal"
                      valueLabel={`${Math.round(cfg.terminalOpacity * 100)}%`}
                      min={50}
                      max={100}
                      step={2}
                      value={Math.round(cfg.terminalOpacity * 100)}
                      onChange={(v) => patchCfg({ terminalOpacity: v / 100 }, false)}
                      accentClass="accent-cyan-400"
                    />
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 2: BUREAU SPATIAL 3D & HDRI 4K
               ═══════════════════════════════════════════════════════════ */}
            {tab === "desktop3d" && (
              <>
                <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/18 via-violet-500/16 to-fuchsia-500/18 border border-cyan-400/35 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Bureau Spatial 3D WebGPU (Three.js TSL)</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                          mods.desktop3d.enabled
                            ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                            : "bg-white/10 text-zinc-400"
                        }`}
                      >
                        {mods.desktop3d.enabled ? "ACTIF" : "2D"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 mt-0.5">
                      Fenêtres réelles interactives 2 faces dans un monde 3D, ZQSD + Souris/Trackpad/Touch, HDRI 4K.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={mods.desktop3d.enabled}
                    onChange={(enabled) => modStore.setDesktop3d({ enabled })}
                    accent="cyan"
                  />
                </div>

                <SectionCard
                  title="Mondes 3D Cinématographiques"
                  subtitle="Environnements AAA avec atmosphères volumétriques Rayleigh+Mie et océan WebGPU"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {SCENES_3D.map((s) => {
                      const active = mods.desktop3d.scene === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            uiSounds.playSnap();
                            modStore.setDesktop3d({ scene: s.id, enabled: true });
                          }}
                          className={`text-left rounded-xl overflow-hidden border transition ${
                            active
                              ? "border-cyan-400/75 ring-1 ring-cyan-400/40"
                              : "border-white/10 hover:border-white/25"
                          }`}
                        >
                          <div
                            className="h-14 w-full px-3 flex items-center justify-between"
                            style={{ background: s.gradient }}
                          >
                            <span className="text-xl drop-shadow">{s.emoji}</span>
                            {active && (
                              <span className="px-1.5 py-0.5 rounded bg-black/55 text-[9.5px] font-mono text-cyan-200">
                                ACTIF
                              </span>
                            )}
                          </div>
                          <div className="p-2.5 bg-black/50">
                            <div className="text-xs font-semibold text-white">{s.name}</div>
                            <p className="text-[10.5px] text-zinc-400 mt-0.5 leading-snug">{s.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Disposition Spatiale des Fenêtres"
                  subtitle="Organisation géométrique des fenêtres dans la scène 3D"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {LAYOUTS_3D.map((l) => {
                      const active = mods.desktop3d.layout === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            uiSounds.playClick();
                            modStore.setDesktop3d({ layout: l.id, enabled: true });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            active
                              ? "bg-cyan-500/20 border-cyan-400/60 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="text-base">{l.emoji}</div>
                          <div className="text-[11px] font-semibold mt-1">{l.label}</div>
                          <div className="text-[9.5px] text-zinc-400 leading-tight mt-0.5">{l.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Skybox HDRI 4K Ultra-Nette"
                  subtitle="Éclairage IBL réaliste et panorama haute définition Poly Haven 4K"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {HDRI_PRESETS.map((h) => {
                      const active = mods.desktop3d.hdriPreset === h.id;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() =>
                            modStore.setDesktop3d({ hdriPreset: h.id as HdriPresetId, enabled: true })
                          }
                          className={`p-2 rounded-xl border text-left transition ${
                            active
                              ? "bg-violet-500/20 border-violet-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{h.emoji}</span>
                            <span className="text-[9.5px] font-mono text-zinc-400">{h.resolution}</span>
                          </div>
                          <div className="text-[11px] font-medium truncate mt-1">{h.name}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={customHdriInput}
                      onChange={(e) => setCustomHdriInput(e.target.value)}
                      placeholder="URL .hdr personnalisé (https://...4k.hdr)"
                      className="flex-1 px-3 py-1.5 rounded-xl bg-black/45 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customHdriInput.trim()) return;
                        modStore.setDesktop3d({
                          hdriPreset: "custom",
                          hdriUrl: customHdriInput.trim(),
                          enabled: true,
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200"
                    >
                      Charger HDRI
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Chrome 3D, Rendu & Navigation"
                  subtitle="Super Dock 3D, barre HUD, ombres dynamiques, double-face et paramètres caméra"
                >
                  <div className="divide-y divide-white/[0.06]">
                    <ToggleRow
                      title="Super Dock & Menu Global en 3D"
                      desc="Affiche le Dock et la Barre de menu directement flottants dans la scène 3D"
                      checked={mods.desktop3d.spatialChrome3d}
                      onChange={(spatialChrome3d) => modStore.setDesktop3d({ spatialChrome3d })}
                      accent="cyan"
                    />
                    <ToggleRow
                      title="Afficher la Barre Flottante de Contrôles 3D"
                      desc="Masquée par défaut (accessible aussi depuis la Top Bar de l'OS)"
                      checked={mods.desktop3d.showControlsHud}
                      onChange={(showControlsHud) => modStore.setDesktop3d({ showControlsHud })}
                    />
                    <ToggleRow
                      title="Ombres Dynamiques 3D (PCFSoft)"
                      desc="Éclairage directionnel et ombres douces portées dans la scène"
                      checked={mods.desktop3d.shadowsEnabled}
                      onChange={(shadowsEnabled) => modStore.setDesktop3d({ shadowsEnabled })}
                    />
                    <ToggleRow
                      title="Fenêtres Visibles des 2 Côtés"
                      desc="Permet de contourner les fenêtres et voir leur dos translucide en 3D"
                      checked={mods.desktop3d.doubleSidedWindows}
                      onChange={(doubleSidedWindows) => modStore.setDesktop3d({ doubleSidedWindows })}
                    />
                    <ToggleRow
                      title="Afficher le Skybox HDRI en Arrière-Plan"
                      desc="Utilise la texture HDRI directement comme fond visible"
                      checked={mods.desktop3d.hdriBackground}
                      onChange={(hdriBackground) => modStore.setDesktop3d({ hdriBackground })}
                    />
                    <ToggleRow
                      title="Contrôles Souris, Trackpad & Touch Libres"
                      desc="Orbite, zoom et panoramique libre hors des fenêtres"
                      checked={mods.desktop3d.interactiveOrbit}
                      onChange={(interactiveOrbit) => modStore.setDesktop3d({ interactiveOrbit })}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.07]">
                    <SliderControl
                      label="Vitesse ZQSD / Caméra"
                      valueLabel={`${mods.desktop3d.moveSpeed.toFixed(1)}×`}
                      min={0.3}
                      max={3}
                      step={0.1}
                      value={mods.desktop3d.moveSpeed}
                      onChange={(moveSpeed) => modStore.setDesktop3d({ moveSpeed })}
                      accentClass="accent-cyan-400"
                    />
                    <SliderControl
                      label="Animation Caméra & Scène"
                      valueLabel={`${mods.desktop3d.cameraSpeed.toFixed(1)}×`}
                      min={0}
                      max={2}
                      step={0.1}
                      value={mods.desktop3d.cameraSpeed}
                      onChange={(cameraSpeed) => modStore.setDesktop3d({ cameraSpeed })}
                    />
                    <SliderControl
                      label="Intensité Bloom / Lumière"
                      valueLabel={`${Math.round(mods.desktop3d.bloomIntensity * 100)}%`}
                      min={0}
                      max={2}
                      step={0.1}
                      value={mods.desktop3d.bloomIntensity}
                      onChange={(bloomIntensity) => modStore.setDesktop3d({ bloomIntensity })}
                    />
                    <SliderControl
                      label="Densité Particules 3D"
                      valueLabel={`${Math.round(mods.desktop3d.particleDensity * 100)}%`}
                      min={0.25}
                      max={2}
                      step={0.05}
                      value={mods.desktop3d.particleDensity}
                      onChange={(particleDensity) => modStore.setDesktop3d({ particleDensity })}
                      accentClass="accent-cyan-400"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => spatial3dBridge.dispatchCamera({ kind: "overview" })}
                      className="px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      Vue Globale Panoramique
                    </button>
                    <button
                      type="button"
                      onClick={() => spatial3dBridge.dispatchCamera({ kind: "reset" })}
                      className="px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      Réinitialiser Caméra (R)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        spatial3dBridge.resetDepthOffsets();
                        wmStore.pushToast("Profondeurs Z", "Toutes les fenêtres réalignées.", "info");
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      Réaligner Profondeurs Z
                    </button>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 3: FENÊTRES, DÉCORATEURS, FX, GRILLE & DOCK PRO
               ═══════════════════════════════════════════════════════════ */}
            {tab === "windows-dock" && (
              <>
                <SectionCard
                  title="Décorateur de Fenêtres"
                  subtitle="14 moteurs de bordures et barres de titre authentiques"
                  badge={mods.decorator.style}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                    {DECORATOR_STYLES.map((d) => {
                      const active = mods.decorator.style === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            uiSounds.playClick();
                            modStore.setDecorator({ style: d.id });
                          }}
                          className={`px-2.5 py-2 rounded-xl border text-left transition ${
                            active
                              ? "bg-violet-500/22 border-violet-400/60 text-white"
                              : "bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.07]"
                          }`}
                        >
                          <div className="text-[11px] font-medium truncate">{d.label}</div>
                          <div className="text-[9.5px] text-zinc-500">{d.group}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/[0.07]">
                    <div className="space-y-1">
                      <span className="text-[11px] text-zinc-400">Position des boutons</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["left", "right"] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => modStore.setDecorator({ buttonPosition: pos })}
                            className={`py-1.5 rounded-lg text-xs border ${
                              mods.decorator.buttonPosition === pos
                                ? "bg-violet-500/20 border-violet-400/50 text-white"
                                : "bg-white/[0.03] border-white/10 text-zinc-400"
                            }`}
                          >
                            {pos === "left" ? "Gauche (macOS)" : "Droite (Win/Linux)"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-zinc-400">Alignement du titre</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["left", "center"] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => modStore.setDecorator({ titleAlign: al })}
                            className={`py-1.5 rounded-lg text-xs border ${
                              mods.decorator.titleAlign === al
                                ? "bg-violet-500/20 border-violet-400/50 text-white"
                                : "bg-white/[0.03] border-white/10 text-zinc-400"
                            }`}
                          >
                            {al === "left" ? "À gauche" : "Centré"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <SliderControl
                      label="Arrondi des Angles"
                      valueLabel={`${mods.decorator.radiusPx} px`}
                      min={0}
                      max={32}
                      step={1}
                      value={mods.decorator.radiusPx}
                      onChange={(radiusPx) => modStore.setDecorator({ radiusPx })}
                    />
                    <SliderControl
                      label="Hauteur Barre de Titre"
                      valueLabel={`${mods.decorator.titlebarHeightPx} px`}
                      min={26}
                      max={44}
                      step={1}
                      value={mods.decorator.titlebarHeightPx}
                      onChange={(titlebarHeightPx) => modStore.setDecorator({ titlebarHeightPx })}
                    />
                    <SliderControl
                      label="Halo Fenêtre Active"
                      valueLabel={`${mods.decorator.activeGlowPx} px`}
                      min={0}
                      max={64}
                      step={2}
                      value={mods.decorator.activeGlowPx}
                      onChange={(activeGlowPx) => modStore.setDecorator({ activeGlowPx })}
                      accentClass="accent-cyan-400"
                    />
                    <SliderControl
                      label="Opacité Fenêtres Inactives"
                      valueLabel={`${Math.round(mods.decorator.unfocusedOpacity * 100)}%`}
                      min={65}
                      max={100}
                      step={1}
                      value={Math.round(mods.decorator.unfocusedOpacity * 100)}
                      onChange={(v) => modStore.setDecorator({ unfocusedOpacity: v / 100 })}
                    />
                  </div>

                  <div className="divide-y divide-white/[0.06] pt-1">
                    <ToggleRow
                      title="Barre d'Accent sur la Barre de Titre"
                      checked={mods.decorator.titlebarAccentBar}
                      onChange={(titlebarAccentBar) => modStore.setDecorator({ titlebarAccentBar })}
                    />
                    <ToggleRow
                      title="Pilules de Bureaux (1–4) sur les Fenêtres"
                      checked={mods.decorator.showWorkspacePills}
                      onChange={(showWorkspacePills) => modStore.setDecorator({ showWorkspacePills })}
                    />
                    <ToggleRow
                      title="Boutons Snap Rapides (Gauche / Droite / Plein écran)"
                      checked={mods.decorator.showSnapButtons}
                      onChange={(showSnapButtons) => modStore.setDecorator({ showSnapButtons })}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Effets de Fenêtres (Compiz / macOS FX) & Grille 2D"
                  subtitle="Animations d'ouverture, physique Wobbly, Genie, Burn et rangement instantané"
                >
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-zinc-300">Animation d&apos;Ouverture</span>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {(
                        [
                          ["spring", "Spring"],
                          ["genie", "Genie"],
                          ["zoom", "Zoom"],
                          ["flip3d", "Flip 3D"],
                          ["fade", "Fade"],
                        ] as [WindowOpenAnimKind, string][]
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => modStore.setFx({ openAnimation: id })}
                          className={`py-1.5 rounded-lg text-xs border transition ${
                            mods.fx.openAnimation === id
                              ? "bg-pink-500/20 border-pink-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 divide-y sm:divide-y-0 divide-white/[0.06]">
                    <ToggleRow
                      title="Wobbly Windows (Compiz)"
                      desc="Déformation élastique pendant le déplacement"
                      checked={mods.fx.wobblyDrag}
                      onChange={(wobblyDrag) => modStore.setFx({ wobblyDrag })}
                      accent="pink"
                    />
                    <ToggleRow
                      title="Minimisation Genie"
                      desc="Aspiration fluide vers le Dock"
                      checked={mods.fx.genieMinimize}
                      onChange={(genieMinimize) => modStore.setFx({ genieMinimize })}
                    />
                    <ToggleRow
                      title="Fermeture Burn / Flammes"
                      desc="Effet incandescent lors de la fermeture"
                      checked={mods.fx.burnClose}
                      onChange={(burnClose) => modStore.setFx({ burnClose })}
                      accent="amber"
                    />
                    <ToggleRow
                      title="Inclinaison 3D au Survol"
                      desc="Parallaxe tactile légère sur les fenêtres"
                      checked={mods.fx.hoverTilt3d}
                      onChange={(hoverTilt3d) => modStore.setFx({ hoverTilt3d })}
                    />
                    <ToggleRow
                      title="Translucidité au Déplacement"
                      desc="Rend la fenêtre semi-transparente pendant le drag"
                      checked={mods.fx.dragGhostOpacity}
                      onChange={(dragGhostOpacity) => modStore.setFx({ dragGhostOpacity })}
                    />
                    <ToggleRow
                      title="Atténuer Fenêtres Inactives"
                      desc="Assombrit subtilement les fenêtres en arrière-plan"
                      checked={mods.fx.dimInactive}
                      onChange={(dimInactive) => modStore.setFx({ dimInactive })}
                    />
                    <ToggleRow
                      title="Bordure RGB Chroma Animée"
                      desc="Contour lumineux irisé sur la fenêtre active"
                      checked={mods.fx.chromaBorder}
                      onChange={(chromaBorder) => modStore.setFx({ chromaBorder })}
                      accent="cyan"
                    />
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.07] space-y-1.5">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Ranger les Fenêtres Ouvertes (Grille 2D Instantanée)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["grid", "⊞ Grille"],
                          ["split-2", "◧ Split 50/50"],
                          ["master-stack", "◫ Master + Stack"],
                          ["columns-3", "⫴ 3 Colonnes"],
                          ["cascade", "⧉ Cascade"],
                        ] as [GridLayoutMode, string][]
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            uiSounds.playSnap();
                            wmStore.tileWorkspace(mode);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 transition"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Shell, Dock Pro & Barre Supérieure"
                  subtitle="Personnalisation complète du Dock, de la Taskbar et de la Top Bar"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Mode Barre des Tâches</label>
                      <select
                        value={mods.shell.taskbarMode}
                        onChange={(e) =>
                          modStore.setShell({ taskbarMode: e.target.value as TaskbarModeKind })
                        }
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        {TASKBAR_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Style du Dock</label>
                      <select
                        value={mods.shell.dockStyle}
                        onChange={(e) =>
                          modStore.setShell({ dockStyle: e.target.value as DockStyleKind })
                        }
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        {DOCK_STYLES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Style Top Bar</label>
                      <select
                        value={mods.shell.topBarStyle}
                        onChange={(e) =>
                          modStore.setShell({ topBarStyle: e.target.value as TopBarStyleKind })
                        }
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        {TOPBAR_STYLES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">Nom de Marque de l&apos;OS (Top Bar)</label>
                    <input
                      value={mods.shell.brandLabel}
                      onChange={(e) => modStore.setShell({ brandLabel: e.target.value })}
                      placeholder="unkernelOS"
                      className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs text-zinc-100 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SliderControl
                      label="Arrondi Dock"
                      valueLabel={`${mods.shell.dockRadiusPx} px`}
                      min={0}
                      max={32}
                      step={2}
                      value={mods.shell.dockRadiusPx}
                      onChange={(dockRadiusPx) => modStore.setShell({ dockRadiusPx })}
                    />
                    <SliderControl
                      label="Force Zoom Dock"
                      valueLabel={`${Math.round((mods.shell.dockMagStrength ?? 0.45) * 100)}%`}
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round((mods.shell.dockMagStrength ?? 0.45) * 100)}
                      onChange={(v) => modStore.setShell({ dockMagStrength: v / 100 })}
                      accentClass="accent-cyan-400"
                    />
                    <SliderControl
                      label="Taille Icônes Dock"
                      valueLabel={`${Math.round((mods.shell.dockIconScale ?? 1) * 100)}%`}
                      min={80}
                      max={125}
                      step={5}
                      value={Math.round((mods.shell.dockIconScale ?? 1) * 100)}
                      onChange={(v) => modStore.setShell({ dockIconScale: v / 100 })}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 divide-y sm:divide-y-0 divide-white/[0.06] pt-1">
                    <ToggleRow
                      title="Zoom Magnétique du Dock"
                      checked={cfg.dockMagnification}
                      onChange={(dockMagnification) => patchCfg({ dockMagnification }, false)}
                    />
                    <ToggleRow
                      title="Masquage Automatique du Dock"
                      checked={Boolean(mods.shell.dockAutoHide)}
                      onChange={(dockAutoHide) => modStore.setShell({ dockAutoHide })}
                    />
                    <ToggleRow
                      title="Reflet Miroir sous le Dock"
                      checked={Boolean(mods.shell.dockReflection)}
                      onChange={(dockReflection) => modStore.setShell({ dockReflection })}
                      accent="cyan"
                    />
                    <ToggleRow
                      title="Widgets d'Ambiance du Bureau"
                      checked={cfg.desktopWidgets}
                      onChange={(desktopWidgets) => patchCfg({ desktopWidgets }, false)}
                    />
                    <ToggleRow
                      title="Icônes sur le Bureau"
                      checked={mods.shell.desktopIcons}
                      onChange={(desktopIcons) => modStore.setShell({ desktopIcons })}
                    />
                    <ToggleRow
                      title="Ornements visionOS"
                      checked={mods.shell.visionOrnaments}
                      onChange={(visionOrnaments) => modStore.setShell({ visionOrnaments })}
                    />
                    <ToggleRow
                      title="Accueil Springboard (iOS)"
                      checked={mods.shell.springboardHome}
                      onChange={(springboardHome) => modStore.setShell({ springboardHome })}
                    />
                    <ToggleRow
                      title="Widgets Horloge & Notes Natifs"
                      checked={mods.shell.showStockWidgets}
                      onChange={(showStockWidgets) => modStore.setShell({ showStockWidgets })}
                    />
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 4: EYE CANDY, OPTIQUE, AUDIO & COINS ACTIFS
               ═══════════════════════════════════════════════════════════ */}
            {tab === "eyecandy" && (
              <>
                <SectionCard
                  title="Curseur, Lumière & Micro-Interactions"
                  subtitle="Effets de surface GPU, traînée lumineuse, ondes de clic et HUD de précision"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                    <ToggleRow
                      title="Halo Spotlight du Curseur"
                      desc="Éclairage radial fluide suivant la souris"
                      checked={mods.eyeCandy.cursorSpotlight}
                      onChange={(cursorSpotlight) => modStore.setEyeCandy({ cursorSpotlight })}
                      accent="cyan"
                    />
                    <ToggleRow
                      title="Ondes de Clic (Click Ripples)"
                      desc="Anneau lumineux subtil à chaque clic"
                      checked={mods.eyeCandy.clickRipples}
                      onChange={(clickRipples) => modStore.setEyeCandy({ clickRipples })}
                    />
                    <ToggleRow
                      title="Reflet Spéculaire sur le Verre"
                      desc="Éclat liquide dynamique sur les fenêtres"
                      checked={mods.eyeCandy.specularSheen}
                      onChange={(specularSheen) => modStore.setEyeCandy({ specularSheen })}
                    />
                    <ToggleRow
                      title="HUD Géométrie Fenêtre (X/Y/W/H)"
                      desc="Affiche les dimensions exactes pendant drag/resize"
                      checked={mods.eyeCandy.geometryHud}
                      onChange={(geometryHud) => modStore.setEyeCandy({ geometryHud })}
                    />
                    <ToggleRow
                      title="Respiration Lumineuse des Bords"
                      desc="Aura ambient sur le pourtour de l'écran"
                      checked={mods.eyeCandy.edgeBreathGlow}
                      onChange={(edgeBreathGlow) => modStore.setEyeCandy({ edgeBreathGlow })}
                      accent="pink"
                    />
                    <ToggleRow
                      title="Compteur Performance FPS / Mémoire"
                      desc="Badge télémétrie GPU temps réel discret"
                      checked={mods.eyeCandy.showPerfHud}
                      onChange={(showPerfHud) => modStore.setEyeCandy({ showPerfHud })}
                      accent="emerald"
                    />
                  </div>

                  {mods.eyeCandy.cursorSpotlight && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.07]">
                      <SliderControl
                        label="Diamètre du Spotlight"
                        valueLabel={`${mods.eyeCandy.cursorSpotlightSize} px`}
                        min={180}
                        max={620}
                        step={20}
                        value={mods.eyeCandy.cursorSpotlightSize}
                        onChange={(cursorSpotlightSize) =>
                          modStore.setEyeCandy({ cursorSpotlightSize })
                        }
                        accentClass="accent-cyan-400"
                      />
                      <SliderControl
                        label="Intensité du Spotlight"
                        valueLabel={`${Math.round(mods.eyeCandy.cursorSpotlightOpacity * 100)}%`}
                        min={0}
                        max={45}
                        step={2}
                        value={Math.round(mods.eyeCandy.cursorSpotlightOpacity * 100)}
                        onChange={(v) => modStore.setEyeCandy({ cursorSpotlightOpacity: v / 100 })}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                    <span className="text-xs font-medium text-zinc-300">Traînée du Curseur</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(
                        [
                          ["none", "Aucune"],
                          ["aurora", "Aurore"],
                          ["stardust", "Poussière d'Étoiles"],
                          ["neon-ribbon", "Ruban Néon"],
                        ] as [CursorTrailKind, string][]
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => modStore.setEyeCandy({ cursorTrail: id })}
                          className={`py-1.5 px-2 rounded-lg text-xs border transition ${
                            mods.eyeCandy.cursorTrail === id
                              ? "bg-violet-500/22 border-violet-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Particules Ambiantes 60fps"
                  subtitle="Effets atmosphériques légers sur le bureau"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                    {(
                      [
                        ["none", "Off", "○"],
                        ["sakura", "Sakura", "🌸"],
                        ["snow", "Neige", "❄️"],
                        ["fireflies", "Lucioles", "✨"],
                        ["rain", "Pluie", "🌧️"],
                        ["matrix-sparks", "Matrix", "💚"],
                        ["embers", "Braises", "🔥"],
                      ] as [AmbientParticlesKind, string, string][]
                    ).map(([id, label, emoji]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => modStore.setEyeCandy({ ambientParticles: id })}
                        className={`p-2 rounded-xl border text-center transition ${
                          mods.eyeCandy.ambientParticles === id
                            ? "bg-pink-500/20 border-pink-400/60 text-white"
                            : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.07]"
                        }`}
                      >
                        <div className="text-sm">{emoji}</div>
                        <div className="text-[10.5px] font-medium mt-0.5">{label}</div>
                      </button>
                    ))}
                  </div>
                  <SliderControl
                    label="Densité des Particules"
                    valueLabel={`${Math.round(mods.eyeCandy.ambientParticleDensity * 100)}%`}
                    min={0.3}
                    max={2}
                    step={0.1}
                    value={mods.eyeCandy.ambientParticleDensity}
                    onChange={(ambientParticleDensity) =>
                      modStore.setEyeCandy({ ambientParticleDensity })
                    }
                    accentClass="accent-pink-500"
                  />
                </SectionCard>

                <SectionCard
                  title="Optique, Étalonnage Couleur & Night Shift"
                  subtitle="Filtres cinéma, chaleur nocturne, grain argentique et vitesse des animations"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {COLOR_PROFILES.map((cp) => {
                      const active = mods.eyeCandy.colorProfile === cp.id;
                      return (
                        <button
                          key={cp.id}
                          type="button"
                          onClick={() => modStore.setEyeCandy({ colorProfile: cp.id })}
                          className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition ${
                            active
                              ? "bg-violet-500/20 border-violet-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-lg shrink-0 border border-white/20"
                            style={{ background: cp.swatch }}
                          />
                          <span className="text-xs font-medium truncate">{cp.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <SliderControl
                      label="Night Shift (Chaleur Nocturne)"
                      valueLabel={`${mods.eyeCandy.nightShiftWarmth}%`}
                      min={0}
                      max={100}
                      step={5}
                      value={mods.eyeCandy.nightShiftWarmth}
                      onChange={(nightShiftWarmth) => modStore.setEyeCandy({ nightShiftWarmth })}
                      accentClass="accent-amber-500"
                    />
                    <SliderControl
                      label="Vitesse Globale des Animations"
                      valueLabel={`${mods.eyeCandy.motionSpeed.toFixed(1)}×`}
                      min={0.3}
                      max={2}
                      step={0.1}
                      value={mods.eyeCandy.motionSpeed}
                      onChange={(motionSpeed) => modStore.setEyeCandy({ motionSpeed })}
                    />
                    <SliderControl
                      label="Grain Argentique sur le Verre"
                      valueLabel={`${mods.eyeCandy.glassGrain}%`}
                      min={0}
                      max={100}
                      step={5}
                      value={mods.eyeCandy.glassGrain}
                      onChange={(glassGrain) => modStore.setEyeCandy({ glassGrain })}
                    />
                    <SliderControl
                      label="Vignette Cinématique"
                      valueLabel={`${mods.eyeCandy.vignetteStrength}%`}
                      min={0}
                      max={80}
                      step={5}
                      value={mods.eyeCandy.vignetteStrength}
                      onChange={(vignetteStrength) => modStore.setEyeCandy({ vignetteStrength })}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Audio & Packs Sonores WebAudio"
                  subtitle="Retour acoustique synthétisé haute précision sans latence"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        uiSounds.setEnabled(true);
                        uiSounds.setProfile(mods.eyeCandy.soundProfile);
                        uiSounds.playNotify();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-200"
                    >
                      <Volume2 className="w-3 h-3" />
                      Tester
                    </button>
                  }
                >
                  <ToggleRow
                    title="Sons d'Interface (WebAudio)"
                    desc="Activer les retours tactiles à l'ouverture, snap, notifications et clics"
                    checked={cfg.uiSounds}
                    onChange={(v) => {
                      uiSounds.setEnabled(v);
                      patchCfg({ uiSounds: v }, false);
                    }}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {SOUND_PROFILES.map((sp) => {
                      const active = mods.eyeCandy.soundProfile === sp.id;
                      return (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => {
                            modStore.setEyeCandy({ soundProfile: sp.id });
                            uiSounds.setProfile(sp.id);
                            if (sp.id !== "silent") {
                              uiSounds.setEnabled(true);
                              uiSounds.playSnap();
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            active
                              ? "bg-cyan-500/20 border-cyan-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="text-[11px] font-semibold">{sp.label}</div>
                          <div className="text-[9.5px] text-zinc-400 mt-0.5 leading-tight">{sp.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Coins Actifs (Hot Corners)"
                  subtitle="Déclenchez une action instantanée en touchant un coin de l'écran avec la souris"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        ["topLeft", "↖ Coin Haut-Gauche"],
                        ["topRight", "↗ Coin Haut-Droit"],
                        ["bottomLeft", "↙ Coin Bas-Gauche"],
                        ["bottomRight", "↘ Coin Bas-Droit"],
                      ] as const
                    ).map(([corner, label]) => (
                      <div key={corner} className="space-y-1">
                        <label className="text-[11px] font-medium text-zinc-300">{label}</label>
                        <select
                          value={mods.eyeCandy.hotCorners[corner]}
                          onChange={(e) =>
                            modStore.setEyeCandy({
                              hotCorners: {
                                ...mods.eyeCandy.hotCorners,
                                [corner]: e.target.value as HotCornerAction,
                              },
                            })
                          }
                          className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                        >
                          {HOT_CORNER_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 5: MODS PARAMÉTRABLES, WIDGETS LIVE & BACKUP
               ═══════════════════════════════════════════════════════════ */}
            {tab === "mods-widgets" && (
              <>
                <SectionCard
                  title="Moteur Réactif Temps Réel & Surfaces (HTML / Iframe / Canvas)"
                  subtitle="Connectez sh / python3 / bun / node / APIs Internet aux shaders WGSL, thèmes, 3D, TopBar & Dock"
                  badge={reactive.engineEnabled ? "ACTIF" : "PAUSE"}
                  action={
                    <button
                      type="button"
                      onClick={() => wmStore.openApp("mod-studio")}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200"
                    >
                      Ouvrir Studio Réactif
                    </button>
                  }
                >
                  <ToggleRow
                    title="Activer le Moteur de Données Réactives"
                    desc="Exécute les sources Linux/HTTP, les liaisons d'expressions, les scripts JS et les surfaces HTML/Iframe/Canvas"
                    checked={reactive.engineEnabled}
                    onChange={(enabled) => reactiveEngine.setEngineEnabled(enabled)}
                    accent="cyan"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                      <div className="text-[10px] text-zinc-400">Sources Actives</div>
                      <div className="text-sm font-mono font-bold text-cyan-300">
                        {reactive.sources.filter((s) => s.enabled).length} / {reactive.sources.length}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                      <div className="text-[10px] text-zinc-400">Liaisons Live</div>
                      <div className="text-sm font-mono font-bold text-violet-300">
                        {reactive.bindings.filter((b) => b.enabled).length} / {reactive.bindings.length}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                      <div className="text-[10px] text-zinc-400">Scripts JS</div>
                      <div className="text-sm font-mono font-bold text-emerald-300">
                        {reactive.scripts.filter((s) => s.enabled).length} / {reactive.scripts.length}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                      <div className="text-[10px] text-zinc-400">Surfaces Montées</div>
                      <div className="text-sm font-mono font-bold text-fuchsia-300">
                        {reactive.surfaces.filter((s) => s.enabled).length} / {reactive.surfaces.length}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                    <div className="text-[11px] font-medium text-zinc-300">
                      Surfaces Rapides (HTML / Iframe / Canvas)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reactive.surfaces.map((s) => (
                        <div
                          key={s.id}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                            s.enabled
                              ? "bg-fuchsia-500/12 border-fuchsia-400/35"
                              : "bg-white/[0.02] border-white/[0.08]"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-white truncate">
                              {s.emoji} {s.name}
                            </div>
                            <div className="text-[9.5px] font-mono text-zinc-400">
                              {s.contentType} · {s.slot}
                            </div>
                          </div>
                          <ToggleSwitch
                            checked={s.enabled}
                            onChange={(enabled) => reactiveEngine.upsertSurface({ ...s, enabled })}
                            accent="pink"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Mods Système & Visuels Actifs"
                  subtitle="Activez et calibrez en direct les paramètres de chaque mod installé"
                  badge={`${enabledModCount} / ${mods.mods.length} actifs`}
                  action={
                    <button
                      type="button"
                      onClick={() => wmStore.openApp("mod-studio")}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-200"
                    >
                      Créer un Mod
                    </button>
                  }
                >
                  <div className="space-y-2.5">
                    {mods.mods.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl border transition ${
                          m.enabled
                            ? "bg-violet-500/[0.08] border-violet-400/35"
                            : "bg-white/[0.02] border-white/[0.07]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-white">{m.name}</span>
                              <span className="px-1.5 py-0.5 rounded bg-white/8 text-[9.5px] font-mono text-zinc-300">
                                {m.kind}
                              </span>
                              <span className="text-[10px] text-zinc-500">v{m.version}</span>
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              {m.description}
                            </p>
                          </div>
                          <ToggleSwitch
                            checked={m.enabled}
                            onChange={(v) => modStore.toggleMod(m.id, v)}
                          />
                        </div>

                        {m.enabled && m.params && m.params.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {m.params.map((spec) => {
                              const current = m.paramValues?.[spec.key] ?? spec.defaultValue;
                              if (spec.type === "color") {
                                return (
                                  <label
                                    key={spec.key}
                                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/35 border border-white/10 cursor-pointer"
                                  >
                                    <span className="text-[11px] text-zinc-300">{spec.label}</span>
                                    <input
                                      type="color"
                                      value={String(current)}
                                      onChange={(e) =>
                                        modStore.configureMod(m.id, { [spec.key]: e.target.value })
                                      }
                                      className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                                    />
                                  </label>
                                );
                              }
                              return (
                                <SliderControl
                                  key={spec.key}
                                  label={spec.label}
                                  valueLabel={`${current}${spec.unit ?? ""}`}
                                  min={spec.min ?? 0}
                                  max={spec.max ?? 100}
                                  step={spec.step ?? 1}
                                  value={Number(current)}
                                  onChange={(val) => modStore.configureMod(m.id, { [spec.key]: val })}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Widgets Interactifs & Données Temps Réel"
                  subtitle="Météo Live, Bourse/Crypto, Flux JSON, Healthcheck serveurs, Favoris visuels…"
                  badge={`${enabledWidgetCount} / ${mods.widgets.length} visibles`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mods.widgets.map((w) => (
                      <div
                        key={w.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${
                          w.enabled
                            ? "bg-cyan-500/[0.08] border-cyan-400/35"
                            : "bg-white/[0.02] border-white/[0.08]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{w.emoji}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-white truncate">{w.title}</div>
                            <div className="text-[10px] text-zinc-400 truncate">{w.description}</div>
                          </div>
                        </div>
                        <ToggleSwitch
                          checked={w.enabled}
                          onChange={(enabled) => modStore.updateWidget(w.id, { enabled })}
                          accent="cyan"
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title="CSS Global Personnalisé & Sauvegarde Mod Pack"
                  subtitle="Injectez vos propres règles CSS dans l'OS ou exportez toute votre configuration"
                >
                  <textarea
                    value={mods.userCss}
                    onChange={(e) => modStore.setUserCss(e.target.value)}
                    rows={4}
                    placeholder="/* CSS personnalisé injecté en direct dans unkernelOS */"
                    className="w-full p-3 rounded-xl bg-black/55 border border-white/12 text-[11.5px] font-mono text-cyan-200 outline-none focus:border-violet-400/50"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleExportModPack}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      Exporter Mod Pack (.json)
                    </button>
                    <button
                      type="button"
                      onClick={() => importPackRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      <Upload className="w-3.5 h-3.5 text-violet-400" />
                      Importer Mod Pack
                    </button>
                    <input
                      ref={importPackRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => void handleImportModPack(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("Réinitialiser tous les mods, thèmes, 3D et widgets par défaut ?")) return;
                        modStore.resetAll();
                        wmStore.pushToast("Mods Réinitialisés", "Apparence d'usine restaurée.", "info");
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Reset Mods d&apos;Usine
                    </button>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 6: LINUX & COMPUTE
               ═══════════════════════════════════════════════════════════ */}
            {tab === "compute" && (
              <>
                <SectionCard
                  title="Distribution Linux Invitée"
                  subtitle="Image rootfs montée par le noyau Linux aarch64 dans le navigateur"
                  badge="Reboot requis"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        ["debian", "Debian 13", "Full glibc, Mesa VirGL 3D, Wayland wland, idéal pour Claude & Pi"],
                        ["alpine", "Alpine 3.24", "Image musl ultra-rapide ~4 Mo, démarrage éclair, CLI léger"],
                        ["none", "Base Shell", "BusyBox initramfs minimal (zéro téléchargement)"],
                      ] as [DistroKind, string, string][]
                    ).map(([id, name, desc]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patchCfg({ distro: id })}
                        className={`text-left p-3 rounded-xl border transition ${
                          cfg.distro === id
                            ? "bg-emerald-500/18 border-emerald-400/55 text-white"
                            : "bg-white/[0.025] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{name}</div>
                        <p className="text-[10.5px] text-zinc-400 mt-1 leading-snug">{desc}</p>
                      </button>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Mémoire Vive (RAM), Processeurs (SMP) & Veille"
                  subtitle={`Isolation Cross-Origin : ${vmState.crossOriginIsolated ? "Active (SAB)" : "Inactive"}`}
                >
                  <SliderControl
                    label="Mémoire Invitée (RAM)"
                    valueLabel={`${cfg.memoryMiB} MiB`}
                    min={256}
                    max={3072}
                    step={128}
                    value={cfg.memoryMiB}
                    onChange={(memoryMiB) => patchCfg({ memoryMiB })}
                    hint="Recommandé : 2048 MiB pour Claude Code, Bun, Pi & Debian."
                  />
                  <SliderControl
                    label="Processeurs Virtuels (vCPUs SMP Web Workers)"
                    valueLabel={`${cfg.cpus} / ${maxHostCores} cœurs`}
                    min={1}
                    max={maxHostCores}
                    step={1}
                    value={Math.min(cfg.cpus, maxHostCores)}
                    onChange={(cpus) => patchCfg({ cpus })}
                    accentClass="accent-cyan-400"
                    hint="Le multi-vCPU requiert Cross-Origin Isolation et le mode Web Worker."
                  />
                  <SliderControl
                    label="Auto-Suspend VM après Inactivité"
                    valueLabel={cfg.autosuspendSec === 0 ? "Désactivé" : `${cfg.autosuspendSec} s`}
                    min={0}
                    max={300}
                    step={15}
                    value={cfg.autosuspendSec}
                    onChange={(autosuspendSec) => patchCfg({ autosuspendSec }, false)}
                    accentClass="accent-emerald-500"
                  />
                </SectionCard>

                <SectionCard
                  title="Moteur d'Exécution & Paramètres Noyau"
                  subtitle="JIT WebAssembly, transport SharedArrayBuffer et arguments de boot"
                >
                  <div className="divide-y divide-white/[0.06]">
                    {(
                      [
                        ["jit", "kwemu WASM JIT", "Compile les blocs aarch64 chauds en WASM (1.6×–2.3× plus rapide)"],
                        ["worker", "Mode Web Worker", "Exécute le noyau hors du thread UI principal (requis pour SMP)"],
                        ["shared", "Transport SharedArrayBuffer", "Tampons circulaires partagés zéro-latence pour I/O & frames"],
                        ["wasi", "Offloader WASI Natif", "Exécute les binaires .wasm invités nativement sur l'hôte"],
                        ["safeMode", "Safe Mode (kw.root=initramfs)", "Contourne un overlay root cassé tout en gardant /data monté"],
                        ["verbose", "Logs Noyau Verbose", "Enregistre tous les messages du noyau Linux dans la console"],
                      ] as const
                    ).map(([key, title, desc]) => (
                      <ToggleRow
                        key={key}
                        title={title}
                        desc={desc}
                        checked={cfg[key]}
                        onChange={(v) => patchCfg({ [key]: v })}
                        accent="emerald"
                      />
                    ))}
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                    <label className="text-xs font-medium text-zinc-300">
                      Ligne de Commande Noyau Additionnelle (<code>append</code>)
                    </label>
                    <input
                      value={cfg.cmdlineAppend}
                      onChange={(e) => patchCfg({ cmdlineAppend: e.target.value })}
                      placeholder="ex: loglevel=7"
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                    />
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 7: ÉCRAN, FB0, VIRGL 3D, WAYLAND & WEBGPU
               ═══════════════════════════════════════════════════════════ */}
            {tab === "graphics" && (
              <>
                <SectionCard
                  title="Framebuffer (/dev/fb0) & Mise à l'Échelle"
                  subtitle="Résolution native de l'écran Linux virtuel et shader d'affichage"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RESOLUTIONS.map((r) => {
                      const active = cfg.displayWidth === r.w && cfg.displayHeight === r.h;
                      return (
                        <button
                          key={r.label}
                          type="button"
                          onClick={() => patchCfg({ displayWidth: r.w, displayHeight: r.h })}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            active
                              ? "bg-fuchsia-500/20 border-fuchsia-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="text-xs font-mono font-semibold">{r.label}</div>
                          <div className="text-[10px] text-zinc-400">{r.tag}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                    <span className="text-xs font-medium text-zinc-300">
                      Mode de Rendu /dev/fb0 (WebGPU Presenter)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["crisp", "Crisp Pixel-Perfect", "Pixels nets sans flou"],
                          ["smooth", "Smooth Bilinéaire", "Lissage doux haute qualité"],
                          ["crt", "CRT Scanlines", "Rendu tube cathodique rétro"],
                        ] as [FbScalingMode, string, string][]
                      ).map(([mode, title, desc]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patchCfg({ fbScaling: mode }, false)}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            cfg.fbScaling === mode
                              ? "bg-cyan-500/20 border-cyan-400/55 text-white"
                              : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="text-[11.5px] font-semibold">{title}</div>
                          <div className="text-[10px] text-zinc-400">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Accélération GPU, VirGL, Wayland & Audio Invité"
                  subtitle="Périphériques virtuels Linux et pipelines WebGPU de l'hôte"
                >
                  <div className="divide-y divide-white/[0.06]">
                    {(
                      [
                        ["display", "/dev/fb0 + evdev Input", "Framebuffer Linux et périphériques clavier/souris", true],
                        ["gpu", "VirtIO-GPU (/dev/dri)", "Nœud de rendu KMS & DRM (Debian)", true],
                        ["gl", "Guest 3D GL (virgl.wasm)", "Mesa VirGL accéléré sur WebGL2 du navigateur", true],
                        ["glEager", "Initialisation GL Immédiate", "Charge virgl.wasm au démarrage au lieu du premier appel GL", true],
                        ["glStrictWaits", "Attentes GL Strictes", "Synchronisation stricte des fences VirGL (stabilité accrue)", true],
                        ["wayland", "Compositeur Wayland (wland)", "Lance les apps GTK/Qt/SDL natives via /dev/kwshm", true],
                        ["sound", "Audio ALSA (/dev/dsp)", "Sortie PCM Linux vers Web Audio API", true],
                        ["webgpuTerminal", "Terminal WebGPU Kitty", "Atlas de glyphes WGSL instancié (fallback Canvas2D)", false],
                        ["webgpuFb0", "Présenteur WebGPU FB0", "Upload direct de texture GPU + shaders CRT/Crisp", false],
                        ["webgpuWallpaper", "WebGPU Live Wallpaper", "Rendu shader animé sur le GPU", false],
                      ] as const
                    ).map(([key, title, desc, reboot]) => (
                      <ToggleRow
                        key={key}
                        title={title}
                        desc={desc}
                        badge={reboot ? "Reboot" : undefined}
                        checked={cfg[key]}
                        onChange={(v) => patchCfg({ [key]: v }, reboot)}
                        accent={reboot ? "violet" : "cyan"}
                      />
                    ))}
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 8: RÉSEAU (WISP RELAY)
               ═══════════════════════════════════════════════════════════ */}
            {tab === "network" && (
              <>
                <SectionCard
                  title="Connectivité Réseau Linux (eth0 & Wisp)"
                  subtitle="Trafic TCP/IP complet (apt, apk, git, gh, Claude, Pi) via WebSocket Wisp"
                  badge={vmState.wispActiveUrl ? "Connecté" : "Par défaut"}
                >
                  <div className="divide-y divide-white/[0.06]">
                    <ToggleRow
                      title="Activer le Réseau Invité TCP/IP (eth0)"
                      desc="Achemine le trafic internet de la VM Linux via Wisp"
                      checked={cfg.net}
                      onChange={(net) => patchCfg({ net })}
                      accent="emerald"
                    />
                    <ToggleRow
                      title="Proxy HTTP Fetch Routes"
                      desc="Accélère les téléchargements HTTP/HTTPS compatibles CORS depuis l'hôte"
                      checked={cfg.fetchRoutes}
                      onChange={(fetchRoutes) => patchCfg({ fetchRoutes })}
                      accent="cyan"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Relais Wisp Personnalisé (wss://)"
                  subtitle="Laissez vide pour le relais par défaut, ou séparez plusieurs URLs par des virgules"
                >
                  <div className="flex gap-2">
                    <input
                      value={cfg.wispUrl}
                      onChange={(e) => patchCfg({ wispUrl: e.target.value })}
                      placeholder="wss://your-wisp-server.example.com/"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none focus:border-emerald-400/50"
                    />
                    <button
                      type="button"
                      onClick={testWisp}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      Ping
                    </button>
                  </div>
                  {wispPing && <p className="text-xs font-mono text-cyan-300">{wispPing}</p>}
                  {vmState.wispActiveUrl && (
                    <div className="flex items-center gap-2 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-3 py-2">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-mono">Actif : {vmState.wispActiveUrl}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-500">
                    Configurable également via le paramètre d&apos;URL <code>?wisp=wss://...</code>.
                  </p>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 9: DISQUE PERSISTANT & SNAPSHOTS VM
               ═══════════════════════════════════════════════════════════ */}
            {tab === "storage" && (
              <>
                <SectionCard
                  title="Disque Persistant /data (ext4 dans IndexedDB)"
                  subtitle="Conserve tous vos paquets (bun, claude, pi, git), projets et configurations entre sessions"
                >
                  <ToggleRow
                    title="Activer le Disque Persistant /data"
                    checked={cfg.dataDisk}
                    onChange={(dataDisk) => patchCfg({ dataDisk })}
                  />
                  <SliderControl
                    label="Capacité Virtuelle (Thin-Provisioned)"
                    valueLabel={`${cfg.dataSizeGiB} GiB`}
                    min={4}
                    max={64}
                    step={4}
                    value={Math.min(64, cfg.dataSizeGiB)}
                    onChange={(dataSizeGiB) => patchCfg({ dataSizeGiB })}
                    hint="L'espace IndexedDB n'est consommé qu'au fur et à mesure des écritures."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleExportDisk}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      Export .kwsparse
                    </button>
                    <button
                      type="button"
                      onClick={() => importDiskRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-100"
                    >
                      <Upload className="w-3.5 h-3.5 text-violet-400" />
                      Importer Image
                    </button>
                    <input
                      ref={importDiskRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => void handleImportDisk(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={handleResetDisk}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Réinitialiser Disque
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Snapshot Mémoire de la VM (Suspend / Resume)"
                  subtitle="Capture instantanée de la RAM et des registres CPU pour reprise immédiate"
                  badge={vmState.hasSnapshot ? "Snapshot prêt" : "Aucun"}
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={vmState.phase !== "running"}
                      onClick={() =>
                        appRuntime.runFork(
                          Effect.flatMap(VmService, (v) => v.suspend()).pipe(
                            Effect.tap(() =>
                              Effect.sync(() =>
                                wmStore.pushToast("VM Suspendue", "Snapshot mémoire capturé.", "info")
                              )
                            ),
                            Effect.catchAll((e) =>
                              Effect.sync(() =>
                                wmStore.pushToast("Échec Suspend", String(e), "error")
                              )
                            )
                          )
                        )
                      }
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 disabled:opacity-40"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Suspendre la VM
                    </button>
                    <button
                      type="button"
                      disabled={!vmState.hasSnapshot}
                      onClick={() =>
                        appRuntime.runFork(
                          Effect.flatMap(VmService, (v) => v.resume()).pipe(
                            Effect.tap(() =>
                              Effect.sync(() =>
                                wmStore.pushToast("VM Reprise", "État exact du noyau restauré.", "success")
                              )
                            ),
                            Effect.catchAll((e) =>
                              Effect.sync(() => wmStore.pushToast("Échec Resume", String(e), "error"))
                            )
                          )
                        )
                      }
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 disabled:opacity-40"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Reprendre le Snapshot
                    </button>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 10: CLÉS API, AGENTS IA & GITHUB
               ═══════════════════════════════════════════════════════════ */}
            {tab === "credentials" && (
              <>
                <SectionCard
                  title="Authentification GitHub & Clés API"
                  subtitle="100% local dans votre navigateur — synchronisé dans ~/.unkernelos_env et gh CLI"
                  action={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSecrets((s) => !s)}
                        className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-zinc-300"
                        title={showSecrets ? "Masquer les clés" : "Afficher les clés"}
                      >
                        {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => wmStore.setGithubModal(true)}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 transition"
                      >
                        Connexion GitHub 1-Clic
                      </button>
                    </div>
                  }
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Jamais envoyé à aucun serveur tiers — stocké localement et injecté dans votre VM Linux.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        ["anthropicApiKey", "Anthropic API Key (Claude / Pi)", "sk-ant-...", true],
                        ["openaiApiKey", "OpenAI API Key (Pi)", "sk-...", true],
                        ["geminiApiKey", "Gemini API Key (Pi)", "AIza...", true],
                        ["openrouterApiKey", "OpenRouter API Key (Pi)", "sk-or-...", true],
                        ["githubToken", "GitHub Token (repo + workflow + pages)", "ghp_... / github_pat_...", true],
                        ["gitUserName", "Nom Auteur Git", "Jane Developer", false],
                        ["gitUserEmail", "Email Auteur Git", "jane@example.com", false],
                      ] as const
                    ).map(([key, label, placeholder, secret]) => (
                      <div key={key} className={`space-y-1 ${key === "githubToken" ? "sm:col-span-2" : ""}`}>
                        <label className="text-[11px] font-medium text-zinc-300">{label}</label>
                        <input
                          type={secret && !showSecrets ? "password" : "text"}
                          value={creds[key]}
                          onChange={(e) => patchCreds({ [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 focus:border-violet-400/60 text-xs font-mono text-zinc-100 outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => {
                        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.syncCredentials()));
                        wmStore.pushToast(
                          "Clés Synchronisées",
                          "Exportées dans ~/.unkernelos_env & git config.",
                          "success"
                        );
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Synchroniser dans la VM Maintenant
                    </button>
                    <button
                      type="button"
                      onClick={() => wmStore.openApp("agent-api")}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200 transition"
                    >
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                      Inspecteur Agent OS API &amp; MCP
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Préférences des Agents IA (Claude Code & Pi)"
                  subtitle="Modèles, effort de raisonnement et permissions par défaut au lancement"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Agent par Défaut</label>
                      <select
                        value={creds.defaultAgent}
                        onChange={(e) => patchCreds({ defaultAgent: e.target.value as AgentKind })}
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        <option value="claude">Claude Code</option>
                        <option value="pi">Pi Coding Agent</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Modèle Claude (optionnel)</label>
                      <input
                        value={creds.claudeModel}
                        onChange={(e) => patchCreds({ claudeModel: e.target.value })}
                        placeholder="ex: claude-opus-4-6"
                        className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Effort Claude</label>
                      <select
                        value={creds.claudeEffort}
                        onChange={(e) => patchCreds({ claudeEffort: e.target.value as ClaudeEffort })}
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        {(["default", "low", "medium", "high", "xhigh", "max"] as ClaudeEffort[]).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Mode Permissions Claude</label>
                      <select
                        value={creds.claudePermissionMode}
                        onChange={(e) =>
                          patchCreds({
                            claudePermissionMode: e.target.value as ClaudePermissionMode,
                          })
                        }
                        className="w-full px-2.5 py-2 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                      >
                        {(
                          [
                            "default",
                            "auto",
                            "acceptEdits",
                            "plan",
                            "dontAsk",
                            "bypassPermissions",
                          ] as ClaudePermissionMode[]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Provider Pi (optionnel)</label>
                      <input
                        value={creds.piProvider}
                        onChange={(e) => patchCreds({ piProvider: e.target.value })}
                        placeholder="ex: anthropic / openrouter / openai"
                        className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Modèle Pi &amp; Thinking</label>
                      <div className="flex gap-1.5">
                        <input
                          value={creds.piModel}
                          onChange={(e) => patchCreds({ piModel: e.target.value })}
                          placeholder="Modèle Pi"
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                        />
                        <select
                          value={creds.piThinking}
                          onChange={(e) => patchCreds({ piThinking: e.target.value as PiThinking })}
                          className="px-2 py-1.5 rounded-xl bg-black/55 border border-white/12 text-xs text-zinc-100 outline-none"
                        >
                          {(
                            ["default", "off", "minimal", "low", "medium", "high", "xhigh", "max"] as PiThinking[]
                          ).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 pt-1 border-t border-white/[0.07]">
                    <ToggleRow
                      title="Claude --continue"
                      checked={creds.claudeContinue}
                      onChange={(claudeContinue) => patchCreds({ claudeContinue })}
                    />
                    <ToggleRow
                      title="Pi --continue"
                      checked={creds.piContinue}
                      onChange={(piContinue) => patchCreds({ piContinue })}
                    />
                    <ToggleRow
                      title="Pi Auto-Approve"
                      checked={creds.piApprove}
                      onChange={(piApprove) => patchCreds({ piApprove })}
                      accent="amber"
                    />
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
