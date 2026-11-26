import { useSyncExternalStore } from "react";
import type { Spatial3dLayoutKind } from "../gpu/spatial-3d-bridge.ts";
import type { OsThemeId, WallpaperShaderId } from "./schema.ts";
import { wmStore } from "../wm/wm-store.ts";
import type { SoundProfileId } from "./ui-sounds.ts";

export type WindowDecoratorStyle =
  | "macos"
  | "macos-classic"
  | "windows-95"
  | "windows-xp"
  | "windows-11"
  | "gnome-adwaita"
  | "kde-breeze"
  | "xfce-lxde"
  | "compiz-emerald"
  | "visionos-glass"
  | "cyber-hud"
  | "minimal-swiss"
  | "floating-zen"
  | "tiling-i3";

export type DockStyleKind =
  | "floating-glass"
  | "full-taskbar"
  | "minimal-pill"
  | "cyber-rail"
  | "hidden";

export type TaskbarModeKind =
  | "dock"
  | "win95"
  | "winxp"
  | "win11"
  | "kde-plasma"
  | "xfce-lxde"
  | "ios-springboard"
  | "visionos-ornament";

export type TopBarStyleKind =
  | "glass"
  | "floating-pills"
  | "retro"
  | "minimal"
  | "gnome"
  | "ios"
  | "hidden";

export type Desktop3dSceneKind =
  | "ocean-sunset"
  | "alpine-fjord"
  | "earth-orbit"
  | "jupiter-orbit"
  | "lunar-horizon"
  | "aurora-fjord";

export type HdriPresetId =
  | "auto"
  | "venice-4k"
  | "alpine-4k"
  | "night-4k"
  | "clouds-4k"
  | "twilight-4k"
  | "clear-sky-4k"
  | "space-void"
  | "custom";

export interface HdriPresetMeta {
  readonly id: HdriPresetId;
  readonly name: string;
  readonly emoji: string;
  readonly url: string;
  readonly resolution: string;
}

export const HDRI_PRESETS: readonly HdriPresetMeta[] = [
  {
    id: "auto",
    name: "Auto (Lié au Monde 3D)",
    emoji: "🎬",
    url: "",
    resolution: "4K",
  },
  {
    id: "venice-4k",
    name: "Venice Sunset 4K Ultra",
    emoji: "🌅",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/venice_sunset_4k.hdr",
    resolution: "4K",
  },
  {
    id: "alpine-4k",
    name: "Drakensberg Alpine 4K",
    emoji: "🏔️",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/drakensberg_solitary_mountain_4k.hdr",
    resolution: "4K",
  },
  {
    id: "night-4k",
    name: "Voie Lactée Nocturne 4K",
    emoji: "🌌",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/rogland_clear_night_4k.hdr",
    resolution: "4K",
  },
  {
    id: "clouds-4k",
    name: "Ciel Nuageux Cinéma 4K",
    emoji: "⛅",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/kloofendal_48d_partly_cloudy_puresky_4k.hdr",
    resolution: "4K",
  },
  {
    id: "twilight-4k",
    name: "Crépuscule Doré 4K",
    emoji: "🌇",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/kloppenheim_02_puresky_4k.hdr",
    resolution: "4K",
  },
  {
    id: "clear-sky-4k",
    name: "Zénith Azur 4K",
    emoji: "☀️",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/syferfontein_0d_clear_puresky_4k.hdr",
    resolution: "4K",
  },
  {
    id: "space-void",
    name: "Espace Profond Étoilé",
    emoji: "🪐",
    url: "",
    resolution: "∞",
  },
];

export interface UltraHdBackdropPreset {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly category: "space" | "nature";
  readonly url: string;
  readonly scene3dHint: Desktop3dSceneKind;
  readonly hdriHint: HdriPresetId;
}

/**
 * Verified Ultra-HD NASA Space & 4K Landscape Backdrops (CORS-safe under COEP for BOTH 2D & 3D!).
 */
export const ULTRA_HD_BACKDROPS: readonly UltraHdBackdropPreset[] = [
  {
    id: "backdrop-earth-apollo",
    name: "Terre — NASA Apollo 17 (Blue Marble)",
    emoji: "🌍",
    category: "space",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1920px-The_Earth_seen_from_Apollo_17.jpg",
    scene3dHint: "earth-orbit",
    hdriHint: "space-void",
  },
  {
    id: "backdrop-moon-nasa",
    name: "Pleine Lune — Ultra-HD NASA",
    emoji: "🌕",
    category: "space",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/1920px-FullMoon2010.jpg",
    scene3dHint: "lunar-horizon",
    hdriHint: "space-void",
  },
  {
    id: "backdrop-jupiter-hubble",
    name: "Jupiter & Grande Tache Rouge — Hubble",
    emoji: "🪐",
    category: "space",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/1920px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg",
    scene3dHint: "jupiter-orbit",
    hdriHint: "space-void",
  },
  {
    id: "backdrop-saturn-cassini",
    name: "Saturne Équinoxe — NASA Cassini",
    emoji: "💫",
    category: "space",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/1920px-Saturn_during_Equinox.jpg",
    scene3dHint: "jupiter-orbit",
    hdriHint: "space-void",
  },
  {
    id: "backdrop-galaxy-hubble",
    name: "Galaxie Spirale NGC 4414 — Hubble",
    emoji: "🌌",
    category: "space",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/NGC_4414_%28NASA-med%29.jpg/1920px-NGC_4414_%28NASA-med%29.jpg",
    scene3dHint: "aurora-fjord",
    hdriHint: "night-4k",
  },
  {
    id: "backdrop-venice-sunset",
    name: "Océan & Coucher de Soleil — 4K",
    emoji: "🌅",
    category: "nature",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/venice_sunset.jpg",
    scene3dHint: "ocean-sunset",
    hdriHint: "venice-4k",
  },
];

export type VariantFamily = "windows" | "linux" | "apple" | "creative";

export interface Desktop3dModConfig {
  readonly enabled: boolean;
  readonly layout: Spatial3dLayoutKind;
  readonly scene: Desktop3dSceneKind;
  readonly hdriPreset: HdriPresetId;
  readonly hdriUrl: string;
  readonly hdriBackground: boolean;
  readonly shadowsEnabled: boolean;
  readonly doubleSidedWindows: boolean;
  readonly spatialChrome3d: boolean; // Full 3D Super Dock / Taskbar / Global Menu inside the 3D scene!
  readonly showControlsHud: boolean; // Optional floating 3D controls bar (hidden by default, toggled from OS TopBar!)
  readonly moveSpeed: number; // 0.3..3
  readonly spatialWindows: boolean;
  readonly interactiveOrbit: boolean;
  readonly cameraSpeed: number; // 0..2
  readonly bloomIntensity: number; // 0..2
  readonly particleDensity: number; // 0.25..2
  readonly mouseParallax: number; // 0..2
}

export type WindowOpenAnimKind = "spring" | "genie" | "zoom" | "flip3d" | "fade";

export interface WindowFxConfig {
  readonly openAnimation: WindowOpenAnimKind;
  readonly wobblyDrag: boolean;
  readonly genieMinimize: boolean;
  readonly burnClose: boolean;
  readonly hoverTilt3d: boolean;
  readonly dragGhostOpacity: boolean;
  readonly dimInactive: boolean;
  readonly chromaBorder: boolean;
}

export interface DecoratorModConfig {
  readonly style: WindowDecoratorStyle;
  readonly buttonPosition: "left" | "right";
  readonly radiusPx: number; // 0..32
  readonly borderWidthPx: number; // 0..3
  readonly titlebarHeightPx: number; // 26..44
  readonly titleAlign: "left" | "center";
  readonly titlebarAccentBar: boolean;
  readonly showWorkspacePills: boolean;
  readonly showSnapButtons: boolean;
  readonly activeGlowPx: number; // 0..64
  readonly unfocusedOpacity: number; // 0.65..1
}

export type CursorTrailKind = "none" | "aurora" | "stardust" | "neon-ribbon";
export type AmbientParticlesKind =
  | "none"
  | "sakura"
  | "snow"
  | "fireflies"
  | "rain"
  | "matrix-sparks"
  | "embers";
export type ColorProfileKind =
  | "neutral"
  | "oled-vivid"
  | "cinema-warm"
  | "nordic-cool"
  | "cyber-hdr"
  | "monochrome-ink";
export type HotCornerAction =
  | "none"
  | "mission-control"
  | "launcher"
  | "command-palette"
  | "desktop-3d"
  | "grid-tile"
  | "lock-screen"
  | "minimize-all";

export interface HotCornersConfig {
  readonly topLeft: HotCornerAction;
  readonly topRight: HotCornerAction;
  readonly bottomLeft: HotCornerAction;
  readonly bottomRight: HotCornerAction;
}

export interface EyeCandyConfig {
  readonly cursorSpotlight: boolean;
  readonly cursorSpotlightSize: number; // 180..620
  readonly cursorSpotlightOpacity: number; // 0..0.45
  readonly cursorTrail: CursorTrailKind;
  readonly clickRipples: boolean;
  readonly ambientParticles: AmbientParticlesKind;
  readonly ambientParticleDensity: number; // 0.3..2.0
  readonly nightShiftWarmth: number; // 0..100
  readonly colorProfile: ColorProfileKind;
  readonly glassGrain: number; // 0..100
  readonly vignetteStrength: number; // 0..80
  readonly edgeBreathGlow: boolean;
  readonly specularSheen: boolean;
  readonly geometryHud: boolean;
  readonly soundProfile: SoundProfileId;
  readonly motionSpeed: number; // 0.3..2.0
  readonly showPerfHud: boolean;
  readonly hotCorners: HotCornersConfig;
}

export interface ShellModConfig {
  readonly taskbarMode: TaskbarModeKind;
  readonly dockStyle: DockStyleKind;
  readonly dockRadiusPx: number;
  readonly dockAutoHide?: boolean;
  readonly dockMagStrength?: number; // 0..1.0
  readonly dockIconScale?: number; // 0.8..1.25
  readonly dockReflection?: boolean;
  readonly topBarStyle: TopBarStyleKind;
  readonly brandLabel: string;
  readonly showStockWidgets: boolean;
  readonly desktopIcons: boolean;
  readonly compizWobbly: boolean;
  readonly compizCube: boolean;
  readonly visionOrnaments: boolean;
  readonly springboardHome: boolean;
}

export interface CustomThemeTokens {
  readonly enabled: boolean;
  readonly name: string;
  readonly glassRgb: string;
  readonly elevatedRgb: string;
  readonly barRgb: string;
  readonly dockRgb: string;
  readonly glassOpacity: number;
  readonly blurPx: number;
  readonly borderColor: string;
  readonly activeBorderColor: string;
  readonly accentPrimary: string;
  readonly accentSecondary: string;
  readonly windowGlow: string;
  readonly fontSans: string;
  readonly fontMono: string;
  readonly fallbackBg: string;
}

export interface CustomShaderMod {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly wgsl: string;
  readonly previewGradient: string;
  readonly builtin?: boolean;
}

export interface CustomDesktopWidget {
  readonly id: string;
  readonly title: string;
  readonly emoji: string;
  readonly description: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly enabled: boolean;
  readonly transparent: boolean;
  readonly html: string;
  readonly builtin?: boolean;
}

export type ModKind = "theme" | "decorator" | "shader" | "widget" | "css" | "shell";

export interface ModParamSpec {
  readonly key: string;
  readonly label: string;
  readonly type: "range" | "color";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly defaultValue: number | string;
}

export interface OsMod {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly version: string;
  readonly kind: ModKind;
  readonly scope: "general" | "specific";
  readonly description: string;
  readonly tags: readonly string[];
  readonly enabled: boolean;
  readonly builtin?: boolean;
  readonly css?: string;
  readonly params?: readonly ModParamSpec[];
  readonly paramValues?: Record<string, number | string>;
  readonly themePatch?: Partial<CustomThemeTokens>;
  readonly decoratorPatch?: Partial<DecoratorModConfig>;
  readonly shellPatch?: Partial<ShellModConfig>;
  readonly shaderId?: string;
  readonly widgetId?: string;
}

export interface OsVariant {
  readonly desktopMode?: "horizon" | "classic";
  readonly wallpaperMode?: "horizon" | "system";
  readonly activeBackdropImageId?: string | null;
  readonly customBackdropImageUrl?: string;
  readonly id: string;
  readonly name: string;
  readonly family: VariantFamily;
  readonly tagline: string;
  readonly emoji: string;
  readonly swatches: readonly [string, string, string];
  readonly baseOsTheme?: OsThemeId;
  readonly baseShader?: WallpaperShaderId;
  readonly activeShaderModId: string | null;
  readonly theme: CustomThemeTokens;
  readonly decorator: DecoratorModConfig;
  readonly shell: ShellModConfig;
  readonly desktop3d?: Partial<Desktop3dModConfig>;
  readonly fx?: Partial<WindowFxConfig>;
  readonly enabledModIds: readonly string[];
  readonly enabledWidgetIds: readonly string[];
  readonly builtin?: boolean;
}

export interface ModState {
  readonly wallpaperMode: "horizon" | "system";
  readonly activeVariantId: string;
  readonly theme: CustomThemeTokens;
  readonly decorator: DecoratorModConfig;
  readonly shell: ShellModConfig;
  readonly desktop3d: Desktop3dModConfig;
  readonly fx: WindowFxConfig;
  readonly eyeCandy: EyeCandyConfig;
  readonly activeBackdropImageId: string | null; // Ultra-HD 2D NASA/4K backdrop (Earth, Moon, Jupiter, etc.)
  readonly customBackdropImageUrl: string;
  readonly activeShaderModId: string | null;
  readonly shaderCompileError: string | null;
  readonly mods: readonly OsMod[];
  readonly shaders: readonly CustomShaderMod[];
  readonly widgets: readonly CustomDesktopWidget[];
  readonly variants: readonly OsVariant[];
  readonly userCss: string;
}

const STORAGE_KEY = "unkernelos:mods:v2";

export const DEFAULT_DESKTOP_3D: Desktop3dModConfig = {
  enabled: false,
  layout: "curved-cockpit",
  scene: "ocean-sunset",
  hdriPreset: "auto",
  hdriUrl: "",
  hdriBackground: true,
  shadowsEnabled: true,
  doubleSidedWindows: true,
  spatialChrome3d: true,
  showControlsHud: false,
  moveSpeed: 1.0,
  spatialWindows: true,
  interactiveOrbit: true,
  cameraSpeed: 0.7,
  bloomIntensity: 1.0,
  particleDensity: 1.0,
  mouseParallax: 1.0,
};

export const DEFAULT_WINDOW_FX: WindowFxConfig = {
  openAnimation: "spring",
  wobblyDrag: false,
  genieMinimize: true,
  burnClose: false,
  hoverTilt3d: false,
  dragGhostOpacity: true,
  dimInactive: false,
  chromaBorder: false,
};

export const DEFAULT_EYE_CANDY: EyeCandyConfig = {
  cursorSpotlight: true,
  cursorSpotlightSize: 360,
  cursorSpotlightOpacity: 0.14,
  cursorTrail: "none",
  clickRipples: true,
  ambientParticles: "none",
  ambientParticleDensity: 1.0,
  nightShiftWarmth: 0,
  colorProfile: "neutral",
  glassGrain: 14,
  vignetteStrength: 16,
  edgeBreathGlow: false,
  specularSheen: true,
  geometryHud: true,
  soundProfile: "crystal",
  motionSpeed: 1.0,
  showPerfHud: false,
  hotCorners: {
    topLeft: "mission-control",
    topRight: "none",
    bottomLeft: "launcher",
    bottomRight: "none",
  },
};

export const DEFAULT_DECORATOR: DecoratorModConfig = {
  style: "macos",
  buttonPosition: "left",
  radiusPx: 16,
  borderWidthPx: 1,
  titlebarHeightPx: 36,
  titleAlign: "center",
  titlebarAccentBar: false,
  showWorkspacePills: true,
  showSnapButtons: true,
  activeGlowPx: 48,
  unfocusedOpacity: 0.95,
};

export const DEFAULT_SHELL: ShellModConfig = {
  taskbarMode: "dock",
  dockStyle: "floating-glass",
  dockRadiusPx: 22,
  dockAutoHide: false,
  dockMagStrength: 0.48,
  dockIconScale: 1.0,
  dockReflection: true,
  topBarStyle: "glass",
  brandLabel: "unkernelOS",
  showStockWidgets: true,
  desktopIcons: false,
  compizWobbly: false,
  compizCube: false,
  visionOrnaments: false,
  springboardHome: false,
};

export const DEFAULT_CUSTOM_THEME: CustomThemeTokens = {
  enabled: false,
  name: "Stock Obsidian Aurora",
  glassRgb: "12, 14, 22",
  elevatedRgb: "17, 20, 31",
  barRgb: "9, 11, 18",
  dockRgb: "14, 17, 27",
  glassOpacity: 0.74,
  blurPx: 28,
  borderColor: "rgba(255, 255, 255, 0.11)",
  activeBorderColor: "rgba(255, 255, 255, 0.24)",
  accentPrimary: "#8b5cf6",
  accentSecondary: "#22d3ee",
  windowGlow: "rgba(139, 92, 246, 0.28)",
  fontSans: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace',
  fallbackBg:
    "radial-gradient(ellipse 80% 60% at 15% 15%, rgba(99,102,241,0.28), transparent 55%), linear-gradient(160deg, #06070c 0%, #0b0e18 48%, #070911 100%)",
};

// ---------------------------------------------------------------------------
// Built-in Custom WGSL Wallpaper Shaders (8 Iconic Procedural Shaders!)
// ---------------------------------------------------------------------------

export const BUILTIN_SHADERS: readonly CustomShaderMod[] = [
  {
    id: "shader-telemetry-reactor",
    name: "⚡ Réacteur Télémétrie Live (CPU/RAM/IA)",
    description: "Shader WGSL 100% réactif : plasma, ondes et couleur pilotés en direct par u.cpu, u.ram, u.tokens, u.mouseX/Y et u.custom0 !",
    author: "unkernelOS Reactive Lab",
    previewGradient: "linear-gradient(135deg, #04091a 0%, #0ea5e9 45%, #ec4899 100%)",
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let energy = clamp(u.cpu * 0.65 + u.ram * 0.25 + u.tokens * 0.55 + u.custom0 * 0.35, 0.05, 1.4);
  let center = vec2<f32>(0.5 + (u.mouseX - 0.5) * 0.16, 0.5 + (u.mouseY - 0.5) * 0.16);
  let p = (uv - center) * vec2<f32>(aspect, 1.0);
  let r = length(p);
  let a = atan2(p.y, p.x);

  let speed = 1.0 + energy * 2.6;
  let pulse = 0.5 + 0.5 * sin(r * (14.0 + u.cpu * 18.0) - t * speed * 2.4 + sin(a * 6.0 + t * 1.4));
  let ring = exp(-abs(r - (0.24 + u.ram * 0.18 + 0.03 * sin(t * 2.0))) * (18.0 - u.tokens * 6.0));
  let core = exp(-r * r * (6.5 - energy * 1.8));

  let coolCol = vec3<f32>(0.06, 0.72, 0.96);
  let hotCol  = vec3<f32>(0.96, 0.22, 0.54);
  let aiCol   = vec3<f32>(0.98, 0.76, 0.18);
  let baseCol = mix(coolCol, hotCol, clamp(energy, 0.0, 1.0));
  let accent  = mix(baseCol, aiCol, clamp(u.tokens + u.agentActive * 0.6, 0.0, 1.0));

  var col = vec3<f32>(0.016, 0.022, 0.048);
  col += baseCol * pow(pulse, 2.6) * (0.28 + energy * 0.34);
  col += accent * ring * (0.55 + u.agentActive * 0.45);
  col += vec3<f32>(0.45, 0.28, 0.95) * core * (0.35 + u.gpu * 0.35);

  let gx = abs(fract(px.x / 56.0) - 0.5);
  let gy = abs(fract(px.y / 56.0) - 0.5);
  let grid = smoothstep(0.49, 0.5, max(gx, gy));
  col += accent * grid * (0.04 + u.cpu * 0.08);
  return col;
}`,
    builtin: true,
  },
  {
    id: "shader-circadian-sky",
    name: "🌅 Ciel Circadien & Météo Live",
    description: "Ciel atmosphérique vivant piloté par l'heure solaire (u.daylight), la température (u.temp) et la pluie réelle (u.rain).",
    author: "unkernelOS Reactive Lab",
    previewGradient: "linear-gradient(135deg, #060b1e 0%, #1d4ed8 45%, #f59e0b 100%)",
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let day = clamp(u.daylight, 0.0, 1.0);
  let rain = clamp(u.rain, 0.0, 1.0);
  let warm = clamp(u.temp, 0.0, 1.0);

  let nightTop = vec3<f32>(0.018, 0.024, 0.068);
  let nightBot = vec3<f32>(0.045, 0.065, 0.145);
  let dawnBot  = vec3<f32>(0.68, 0.28, 0.22);
  let dayTop   = vec3<f32>(0.05, 0.18, 0.44);
  let dayBot   = mix(vec3<f32>(0.14, 0.44, 0.68), vec3<f32>(0.55, 0.46, 0.28), warm * 0.5);

  let twilight = smoothstep(0.02, 0.25, day) * (1.0 - smoothstep(0.35, 0.7, day));
  let skyTop = mix(nightTop, dayTop, day);
  let skyBot = mix(mix(nightBot, dayBot, day), dawnBot, twilight * 0.72);
  var col = mix(skyBot, skyTop, clamp(uv.y, 0.0, 1.0));

  // Solar / Lunar orb following real daylight height
  let sunPos = vec2<f32>(0.22 + day * 0.56, 0.18 + day * 0.58);
  let sd = length((uv - sunPos) * vec2<f32>(aspect, 1.0));
  let orbCol = mix(vec3<f32>(0.78, 0.88, 1.0), vec3<f32>(1.0, 0.84, 0.48), smoothstep(0.08, 0.45, day));
  col += orbCol * exp(-sd * 5.2) * (0.45 + day * 0.45) * (1.0 - rain * 0.65);

  // Volumetric clouds & rain veil
  let c1 = sin(uv.x * 5.2 + t * 0.18 + sin(uv.y * 4.0)) * cos(uv.y * 3.4 - t * 0.12);
  let cloud = smoothstep(0.15, 0.85, 0.5 + 0.5 * c1);
  col = mix(col, vec3<f32>(0.18, 0.23, 0.32) * (0.4 + 0.6 * day), cloud * (0.14 + rain * 0.42));

  // Twinkling night stars when daylight is low
  let cell = floor(uv * vec2<f32>(140.0 * aspect, 140.0));
  let star = step(0.994, hash21(cell)) * (0.5 + 0.5 * sin(t * 2.6 + hash21(cell + 13.0) * 6.28));
  col += vec3<f32>(0.9, 0.95, 1.0) * star * (1.0 - day) * (1.0 - rain) * 0.55;

  // Rain streaks when u.rain > 0
  if (rain > 0.05) {
    let rx = floor(px.x / 16.0);
    let streak = step(0.92, hash21(vec2<f32>(rx, floor((px.y - t * 900.0) / 36.0))));
    col += vec3<f32>(0.55, 0.78, 0.98) * streak * rain * 0.28;
  }
  return col;
}`,
    builtin: true,
  },
  {
    id: "shader-xp-bliss",
    name: "Windows XP Bliss Hills",
    author: "unkernelOS Labs",
    description: "Collines verdoyantes animées sous ciel azur & nuages doux façon Windows XP (WGSL).",
    previewGradient: "linear-gradient(180deg, #2563eb 0%, #60a5fa 48%, #4ade80 58%, #15803d 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  // Flip Y so sky is at top
  let y = 1.0 - uv.y;
  let sky = mix(vec3<f32>(0.11, 0.36, 0.86), vec3<f32>(0.52, 0.78, 0.98), clamp(y * 1.45, 0.0, 1.0));
  // Soft drifting clouds
  let c1 = sin(uv.x * 5.2 + t * 0.15) * cos(y * 9.0 + uv.x * 2.0);
  let c2 = sin(uv.x * 9.5 - t * 0.09 + 1.5) * cos(y * 14.0);
  let cloud = smoothstep(0.28, 0.85, 0.5 + 0.35 * c1 + 0.2 * c2) * smoothstep(0.62, 0.12, y);
  var col = mix(sky, vec3<f32>(0.98, 0.99, 1.0), cloud * 0.72);

  // Rolling lush green hills
  let hillFar = 0.52 + 0.055 * sin(uv.x * 4.2 + 0.6) + 0.025 * cos(uv.x * 8.5);
  let hillNear = 0.62 + 0.075 * sin(uv.x * 3.1 - 0.8) + 0.02 * sin(uv.x * 7.0 + t * 0.12);
  if (y > hillFar) {
    let gFar = mix(vec3<f32>(0.24, 0.62, 0.16), vec3<f32>(0.12, 0.42, 0.10), clamp((y - hillFar) * 4.0, 0.0, 1.0));
    col = gFar;
  }
  if (y > hillNear) {
    let sun = 0.5 + 0.5 * sin(uv.x * 3.0 + 0.5);
    let grass = mix(vec3<f32>(0.18, 0.58, 0.12), vec3<f32>(0.42, 0.78, 0.18), sun * 0.65);
    let depth = clamp((y - hillNear) * 2.8, 0.0, 1.0);
    col = mix(grass, vec3<f32>(0.10, 0.36, 0.08), depth * 0.55);
  }
  return col;
}`,
  },
  {
    id: "shader-win11-bloom",
    name: "Windows 11 Fluent Bloom",
    author: "unkernelOS Labs",
    description: "Pétales de soie bleus & indigo réfractifs façon Windows 11 Dark Bloom (WGSL).",
    previewGradient: "linear-gradient(135deg, #071126 0%, #1d4ed8 48%, #38bdf8 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - vec2<f32>(0.5, 0.52)) * vec2<f32>(aspect, 1.0);
  var col = mix(vec3<f32>(0.02, 0.04, 0.09), vec3<f32>(0.04, 0.09, 0.20), uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);
  for (var i = 0; i < 4; i++) {
    let fi = f32(i);
    let petal = 0.36 + 0.09 * sin(a * 3.0 + fi * 1.45 + t * (0.28 + fi * 0.06));
    let fold = exp(-abs(r - petal * (0.55 + fi * 0.18)) * 9.5);
    let shade = mix(vec3<f32>(0.06, 0.32, 0.88), vec3<f32>(0.24, 0.72, 1.0), fi / 3.0);
    col += shade * fold * (0.48 - fi * 0.07);
  }
  col += vec3<f32>(0.18, 0.56, 0.98) * exp(-r * r * 5.2) * 0.45;
  return col;
}`,
  },
  {
    id: "shader-gnome-adwaita",
    name: "GNOME 47 Geometric Adwaita",
    author: "unkernelOS Labs",
    description: "Rubans géométriques abstraits bleu/indigo/corail inspirés de GNOME 47.",
    previewGradient: "linear-gradient(135deg, #1a1f36 0%, #3584e4 52%, #e01b24 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0);
  var col = mix(vec3<f32>(0.08, 0.10, 0.16), vec3<f32>(0.14, 0.20, 0.34), uv.x);
  let band1 = smoothstep(0.02, -0.02, p.y - 0.18 * sin(p.x * 2.4 + t * 0.25) - 0.08);
  let band2 = smoothstep(0.02, -0.02, p.y + 0.22 * cos(p.x * 1.9 - t * 0.2) + 0.12);
  let disc = smoothstep(0.32, 0.31, length(p - vec2<f32>(0.28, 0.06 + 0.04 * sin(t * 0.4))));
  col = mix(col, vec3<f32>(0.21, 0.52, 0.89), band1 * 0.55);
  col = mix(col, vec3<f32>(0.11, 0.28, 0.58), band2 * 0.48);
  col = mix(col, vec3<f32>(0.90, 0.38, 0.22), disc * 0.62);
  return col;
}`,
  },
  {
    id: "shader-matrix-rain",
    name: "Matrix Digital Rain",
    author: "unkernelOS Labs",
    description: "Colonnes de pluie néon émeraude & cyan à profondeur stéréoscopique (WGSL 60fps).",
    previewGradient: "linear-gradient(135deg, #020c06 0%, #064e3b 55%, #10b981 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  var col = vec3<f32>(0.012, 0.025, 0.020);
  let cols = floor(uv.x * 58.0 * aspect);
  let seed = hash21(vec2<f32>(cols, 3.17));
  let speed = 0.35 + seed * 1.15;
  let y = fract(1.0 - uv.y - t * speed + seed * 17.0);
  let head = exp(-y * 14.0);
  let tail = exp(-y * 3.8) * (0.45 + 0.55 * sin(uv.y * 110.0 + seed * 40.0));
  let cell = step(0.18, fract(uv.x * 58.0 * aspect)) * step(0.16, fract(uv.y * 46.0));
  col += vec3<f32>(0.04, 0.85, 0.45) * tail * cell * 0.52;
  col += vec3<f32>(0.55, 1.0, 0.82) * head * cell * 0.85;
  let cols2 = floor(uv.x * 28.0 * aspect + 7.0);
  let seed2 = hash21(vec2<f32>(cols2, 11.4));
  let y2 = fract(1.0 - uv.y - t * (0.2 + seed2 * 0.6) + seed2 * 9.0);
  col += vec3<f32>(0.05, 0.65, 0.88) * exp(-y2 * 6.5) * 0.24;
  return col;
}`,
  },
  {
    id: "shader-liquid-mercury",
    name: "Liquid Mercury Chrome",
    author: "unkernelOS Labs",
    description: "Vagues de mercure liquide chrome avec reflets spéculaires et iridescence studio.",
    previewGradient: "linear-gradient(135deg, #0f172a 0%, #64748b 50%, #e2e8f0 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0) * 2.4;
  var q = p;
  for (var i = 0; i < 3; i++) {
    let fi = f32(i) + 1.0;
    q = q + vec2<f32>(
      sin(q.y * 1.9 * fi + t * 0.8 * fi) * 0.28 / fi,
      cos(q.x * 1.7 * fi - t * 0.7 * fi) * 0.28 / fi
    );
  }
  let h = 0.5 + 0.5 * sin(q.x * 3.1 + q.y * 2.7 + t);
  let spec = pow(clamp(h, 0.0, 1.0), 3.4);
  let base = mix(vec3<f32>(0.04, 0.05, 0.09), vec3<f32>(0.36, 0.42, 0.54), h);
  let irid = vec3<f32>(
    0.5 + 0.5 * sin(q.x * 4.0 + t + 0.0),
    0.5 + 0.5 * sin(q.x * 4.0 + t + 2.1),
    0.5 + 0.5 * sin(q.x * 4.0 + t + 4.2)
  );
  return base + vec3<f32>(0.78, 0.86, 1.0) * spec * 0.55 + irid * spec * 0.22;
}`,
  },
  {
    id: "shader-event-horizon",
    name: "Black Hole Event Horizon",
    author: "unkernelOS Labs",
    description: "Trou noir relativiste avec disque d'accrétion doré/violet et champ d'étoiles.",
    previewGradient: "linear-gradient(135deg, #05020b 0%, #581c87 50%, #f59e0b 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - vec2<f32>(0.5, 0.5)) * vec2<f32>(aspect, 1.0);
  let r = length(p);
  let ang = atan2(p.y, p.x);
  var col = vec3<f32>(0.015, 0.012, 0.032);
  let warp = p * (1.0 + 0.14 / max(r, 0.16));
  let cell = floor((warp + 2.0) * 75.0);
  let star = step(0.994, hash21(cell)) * (0.5 + 0.5 * sin(t * 2.0 + hash21(cell + 7.0) * 6.28));
  col += vec3<f32>(0.82, 0.88, 1.0) * star * smoothstep(0.18, 0.35, r) * 0.6;
  let diskY = p.y * 4.2 + 0.06 * sin(ang * 3.0 - t * 2.4);
  let diskR = length(vec2<f32>(p.x, diskY));
  let swirl = 0.65 + 0.35 * sin(ang * 6.0 - t * 3.6 + 8.0 / max(r, 0.15));
  let disk = exp(-abs(diskR - 0.34) * 14.0) * swirl;
  let photonRing = exp(-abs(r - 0.19) * 38.0);
  col += mix(vec3<f32>(0.98, 0.55, 0.12), vec3<f32>(0.65, 0.22, 0.95), clamp(r * 2.0, 0.0, 1.0)) * disk * 0.85;
  col += vec3<f32>(1.0, 0.86, 0.62) * photonRing * 0.95;
  return col * smoothstep(0.165, 0.19, r);
}`,
  },
  {
    id: "shader-zen-ocean",
    name: "Kyoto Bioluminescent Ripples",
    author: "unkernelOS Labs",
    description: "Ondes d'eau zen et filaments bioluminescents jade, indigo et sakura.",
    previewGradient: "linear-gradient(135deg, #061318 0%, #115e59 52%, #f472b6 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0);
  var col = mix(vec3<f32>(0.025, 0.042, 0.055), vec3<f32>(0.045, 0.062, 0.088), 1.0 - uv.y);
  let r1 = length(p - vec2<f32>(-0.28, 0.10));
  let r2 = length(p - vec2<f32>(0.30, -0.14));
  let rip1 = sin(r1 * 26.0 - t * 2.2) * exp(-r1 * 2.8);
  let rip2 = sin(r2 * 22.0 - t * 1.8) * exp(-r2 * 2.5);
  let ring = smoothstep(0.25, 0.98, 0.5 + 0.5 * (rip1 + rip2));
  col += vec3<f32>(0.12, 0.68, 0.62) * ring * 0.34;
  col += vec3<f32>(0.88, 0.42, 0.62) * exp(-r2 * r2 * 4.5) * 0.24;
  col += vec3<f32>(0.30, 0.45, 0.85) * exp(-r1 * r1 * 3.8) * 0.22;
  return col;
}`,
  },
  {
    id: "shader-swiss-matrix",
    name: "Swiss Precision Dot Grid",
    author: "unkernelOS Labs",
    description: "Matrice d'ingénierie suisse ultra-propre avec onde radar orange signal.",
    previewGradient: "linear-gradient(135deg, #0c0c0e 0%, #27272a 60%, #ff4d00 100%)",
    builtin: true,
    wgsl: `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  var col = vec3<f32>(0.052, 0.054, 0.058);
  let cell = fract(px / 28.0) - 0.5;
  let dotMask = smoothstep(0.11, 0.05, length(cell));
  let wave = exp(-abs(uv.x - fract(t * 0.18)) * 9.0);
  col += vec3<f32>(0.24, 0.25, 0.28) * dotMask * 0.55;
  col += vec3<f32>(1.0, 0.30, 0.0) * dotMask * wave * 0.95;
  let crossX = smoothstep(0.495, 0.5, abs(fract(px.x / 140.0) - 0.5));
  let crossY = smoothstep(0.495, 0.5, abs(fract(px.y / 140.0) - 0.5));
  col += vec3<f32>(0.22, 0.22, 0.24) * max(crossX, crossY) * 0.18;
  return col;
}`,
  },
];

// ---------------------------------------------------------------------------
// Built-in Custom Desktop Widgets (Live Draggable HTML/SVG/JS Widgets!)
// ---------------------------------------------------------------------------

export const BUILTIN_WIDGETS: readonly CustomDesktopWidget[] = [
  {
    id: "widget-analog-clock",
    title: "Horloge Analogique Studio",
    emoji: "🕰️",
    description: "Horloge suisse / Braun à trotteuse fluide 60fps et date.",
    x: 26,
    y: 54,
    width: 196,
    height: 214,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:transparent;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;user-select:none}
svg{width:146px;height:146px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.date{font:600 10px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#a1a1aa}
</style></head><body>
<svg viewBox="0 0 120 120">
  <defs><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".45"/><stop offset="100%" stop-color="#38bdf8" stop-opacity=".18"/></linearGradient></defs>
  <circle cx="60" cy="60" r="56" fill="rgba(9,12,20,.72)" stroke="url(#rim)" stroke-width="2"/>
  <g id="ticks"></g>
  <line id="h" x1="60" y1="60" x2="60" y2="30" stroke="#f4f4f5" stroke-width="3.6" stroke-linecap="round"/>
  <line id="m" x1="60" y1="60" x2="60" y2="18" stroke="#e4e4e7" stroke-width="2.4" stroke-linecap="round"/>
  <line id="s" x1="60" y1="68" x2="60" y2="15" stroke="#ff4d00" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="60" cy="60" r="3.4" fill="#ff4d00"/>
</svg>
<div class="date" id="d"></div>
<script>
const g=document.getElementById('ticks');
for(let i=0;i<60;i++){
  const a=i*6*Math.PI/180,maj=i%5===0;
  const r1=maj?45:49,r2=52;
  const l=document.createElementNS('http://www.w3.org/2000/svg','line');
  l.setAttribute('x1',60+Math.sin(a)*r1);l.setAttribute('y1',60-Math.cos(a)*r1);
  l.setAttribute('x2',60+Math.sin(a)*r2);l.setAttribute('y2',60-Math.cos(a)*r2);
  l.setAttribute('stroke',maj?'rgba(255,255,255,.75)':'rgba(255,255,255,.22)');
  l.setAttribute('stroke-width',maj?'1.8':'0.8');
  g.appendChild(l);
}
function tick(){
  const n=new Date();
  const ms=n.getSeconds()+n.getMilliseconds()/1000;
  const m=n.getMinutes()+ms/60;
  const h=(n.getHours()%12)+m/60;
  document.getElementById('h').setAttribute('transform','rotate('+h*30+' 60 60)');
  document.getElementById('m').setAttribute('transform','rotate('+m*6+' 60 60)');
  document.getElementById('s').setAttribute('transform','rotate('+ms*6+' 60 60)');
  document.getElementById('d').textContent=n.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'});
  requestAnimationFrame(tick);
}
tick();
</script></body></html>`,
  },
  {
    id: "widget-live-radar",
    title: "Radar CPU / GPU / RAM",
    emoji: "📡",
    description: "Sparklines temps réel connectées directement à la télémétrie du noyau Linux.",
    x: 26,
    y: 282,
    width: 264,
    height: 162,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px;background:transparent;color:#f4f4f5;font-family:ui-monospace,SFMono-Regular,monospace;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
.dot{width:7px;height:7px;border-radius:99px;background:#22d3ee;box-shadow:0 0 8px #22d3ee;display:inline-block;margin-right:6px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.k{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px 8px}
.k small{display:block;font-size:9px;color:#94a3b8}.k b{font-size:14px}
canvas{width:100%;flex:1;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.07)}
</style></head><body>
<div class="top"><span><i class="dot"></i>Telemetry HUD</span><span id="meta">Linux 7.x</span></div>
<div class="kpis">
  <div class="k"><small>CPU</small><b id="c" style="color:#22d3ee">18%</b></div>
  <div class="k"><small>GPU</small><b id="g" style="color:#c084fc">32%</b></div>
  <div class="k"><small>RAM</small><b id="m" style="color:#34d399">36%</b></div>
</div>
<canvas id="cv" width="240" height="58"></canvas>
<script>
const hC=Array(40).fill(18),hG=Array(40).fill(30),hM=Array(40).fill(35);
let tel={cpu:18,gpu:30,mem:35,meta:'Linux 7.x'};
window.addEventListener('message',e=>{
  if(e.data&&e.data.source==='unkernelos-widget-telemetry'){
    tel=e.data;
    document.getElementById('meta').textContent=(tel.cpus||2)+'vCPU · '+(tel.phase||'online');
  }
});
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
setInterval(()=>{
  hC.push(tel.cpu);hC.shift();hG.push(tel.gpu);hG.shift();hM.push(tel.mem);hM.shift();
  document.getElementById('c').textContent=Math.round(tel.cpu)+'%';
  document.getElementById('g').textContent=Math.round(tel.gpu)+'%';
  document.getElementById('m').textContent=Math.round(tel.mem)+'%';
  ctx.clearRect(0,0,cv.width,cv.height);
  const draw=(arr,col)=>{ctx.beginPath();arr.forEach((v,i)=>{const x=i/(arr.length-1)*cv.width,y=cv.height-4-(v/100)*(cv.height-8);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.stroke();};
  draw(hM,'#34d399');draw(hG,'#c084fc');draw(hC,'#22d3ee');
},420);
</script></body></html>`,
  },
  {
    id: "widget-cyber-eq",
    title: "Spectre Audio / Pulse EQ",
    emoji: "🎚️",
    description: "Égaliseur néon 20 bandes façon Winamp / Night City animé à 60fps.",
    x: 26,
    y: 458,
    width: 264,
    height: 112,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:10px 12px;background:transparent;color:#f4f4f5;font-family:ui-monospace,monospace;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.hdr{display:flex;justify-content:space-between;font-size:10px;color:#f472b6;letter-spacing:.1em}
.bars{flex:1;display:flex;align-items:flex-end;gap:4px}
.b{flex:1;border-radius:3px 3px 1px 1px;background:linear-gradient(180deg,#22d3ee,#a855f7 55%,#f43f5e);transition:height 90ms linear;min-height:4px}
</style></head><body>
<div class="hdr"><span>PULSE SPECTRUM</span><span id="hz">48.0 kHz</span></div>
<div class="bars" id="bars"></div>
<script>
const wrap=document.getElementById('bars'),bs=[];
for(let i=0;i<20;i++){const d=document.createElement('div');d.className='b';wrap.appendChild(d);bs.push(d);}
let t=0;
setInterval(()=>{
  t+=0.28;
  bs.forEach((b,i)=>{
    const v=18+Math.abs(Math.sin(t+i*0.42)*48+Math.cos(t*1.7-i*0.25)*26);
    b.style.height=Math.min(100,Math.max(8,v))+'%';
  });
},85);
</script></body></html>`,
  },
  {
    id: "widget-pomodoro",
    title: "Focus Timer Pomodoro",
    emoji: "⏱️",
    description: "Minuteur de concentration 25 min avec contrôles Start / Pause / Reset.",
    x: 240,
    y: 54,
    width: 224,
    height: 132,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px 14px;background:transparent;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.t{font:700 32px/1 ui-monospace,monospace;letter-spacing:-.02em;color:#fff}
.row{display:flex;gap:6px}
button{flex:1;padding:6px 8px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:600;cursor:pointer}
button:hover{background:rgba(255,255,255,.18)}
.pri{background:linear-gradient(90deg,#f97316,#ef4444);border:0}
</style></head><body>
<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#fb923c;font-weight:700">Deep Work · Pomodoro</div>
<div class="t" id="tm">25:00</div>
<div class="row"><button class="pri" id="go">Start</button><button id="rst">Reset</button></div>
<script>
let sec=25*60,run=false;
const tm=document.getElementById('tm'),go=document.getElementById('go');
const fmt=()=>{const m=String(Math.floor(sec/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');tm.textContent=m+':'+s;};
go.onclick=()=>{run=!run;go.textContent=run?'Pause':'Start';};
document.getElementById('rst').onclick=()=>{run=false;sec=25*60;go.textContent='Start';fmt();};
setInterval(()=>{if(run&&sec>0){sec--;fmt();}},1000);
</script></body></html>`,
  },
  {
    id: "widget-zen-orb",
    title: "Orbe Zen & Respiration",
    emoji: "🪷",
    description: "Guide de respiration ambiant apaisant pour Kyoto Zen & VisionOS.",
    x: 26,
    y: 54,
    width: 196,
    height: 196,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:transparent;color:#e2e8f0;font-family:system-ui,sans-serif;overflow:hidden}
.orb{width:84px;height:84px;border-radius:999px;background:radial-gradient(circle at 35% 30%,#5eead4,#0f766e 55%,#1e1b4b);box-shadow:0 0 36px rgba(94,234,212,.45);animation:br 8s ease-in-out infinite}
@keyframes br{0%,100%{transform:scale(.76);opacity:.78}50%{transform:scale(1.16);opacity:1}}
.lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#99f6e4}
</style></head><body>
<div class="orb"></div><div class="lbl" id="l">Inspirez…</div>
<script>
let k=0;const m=['Inspirez…','Retenez…','Expirez…','Calme…'];
setInterval(()=>{k=(k+1)%4;document.getElementById('l').textContent=m[k];},2000);
</script></body></html>`,
  },
  {
    id: "widget-matrix-ticker",
    title: "Kernel Status Ticker",
    emoji: "📟",
    description: "Bandeau HUD terminal affichant le statut live du noyau Linux, ports & agents.",
    x: 240,
    y: 54,
    width: 280,
    height: 108,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px;background:transparent;color:#34d399;font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;overflow:hidden}
.hdr{color:#22d3ee;font-size:10px;letter-spacing:.12em;margin-bottom:4px}
.blink{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:0}}
</style></head><body>
<div class="hdr">[ UNKERNEL://SYS.NODE ]</div>
<div id="lines">BOOT: Linux 7.x aarch64 OK<br>BRIDGE: osctl + MCP online<br>STATUS: awaiting agent cmd<span class="blink">_</span></div>
<script>
window.addEventListener('message',e=>{
  if(e.data&&e.data.source==='unkernelos-widget-telemetry'){
    const d=e.data;
    document.getElementById('lines').innerHTML=
      'KERNEL: '+d.distro+' · '+d.cpus+' vCPU · '+d.memoryMiB+'M<br>'+
      'LOAD  : CPU '+Math.round(d.cpu)+'% · GPU '+Math.round(d.gpu)+'%<br>'+
      'PORTS : '+(d.ports&&d.ports.length?d.ports.map(p=>':'+p).join(' '):'none')+'<span class="blink">_</span>';
  }
});
</script></body></html>`,
  },
  // ─── 5 REAL-TIME INTERACTIVE LIVE-DATA WIDGETS ────────────────────────────
  {
    id: "widget-weather-live",
    title: "Météo Live (Open-Meteo / OpenWeather)",
    emoji: "🌤️",
    description: "Météo temps réel mondiale par ville (sans clé via Open-Meteo + support clé OpenWeatherMap) avec vent, humidité & prévisions 3 jours.",
    x: 26,
    y: 54,
    width: 288,
    height: 224,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px 14px;background:transparent;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.row{display:flex;align-items:center;gap:6px}
input{flex:1;min-width:0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:4px 8px;color:#fff;font-size:11px;outline:none}
button{background:rgba(56,189,248,.22);border:1px solid rgba(56,189,248,.4);color:#e0f2fe;border-radius:8px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer}
button:hover{background:rgba(56,189,248,.38)}
.hero{display:flex;align-items:center;justify-content:space-between}
.temp{font:700 34px/1 system-ui;letter-spacing:-.03em}
.meta{font-size:11px;color:#94a3b8;display:flex;gap:10px}
.days{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:auto}
.d{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:6px;text-align:center;font-size:10px}
.d b{display:block;font-size:12px;color:#fff;margin-top:2px}
#owRow{display:none}
</style></head><body>
<div class="row">
  <input id="city" value="Paris" placeholder="Ville (Paris, Tokyo, NYC…)"/>
  <button id="go">OK</button>
  <button id="cfg" title="Clé OpenWeatherMap (optionnel)">⚙️</button>
</div>
<div class="row" id="owRow">
  <input id="owKey" placeholder="Clé API OpenWeatherMap (optionnel)"/>
</div>
<div class="hero">
  <div>
    <div style="font-size:12px;font-weight:700" id="loc">Paris</div>
    <div style="font-size:10px;color:#7dd3fc" id="desc">Chargement météo live…</div>
  </div>
  <div style="display:flex;align-items:center;gap:6px">
    <span id="ico" style="font-size:28px">⛅</span>
    <span class="temp" id="tmp">--°</span>
  </div>
</div>
<div class="meta"><span id="wind">💨 -- km/h</span><span id="hum">💧 --%</span><span id="src" style="margin-left:auto;opacity:.7">Open-Meteo</span></div>
<div class="days" id="days"></div>
<script>
const WMO={0:['☀️','Dégagé'],1:['🌤️','Peu nuageux'],2:['⛅','Partiellement nuageux'],3:['☁️','Couvert'],45:['🌫️','Brouillard'],51:['🌦️','Bruine'],61:['🌧️','Pluie'],63:['🌧️','Pluie modérée'],71:['❄️','Neige'],80:['🌦️','Averses'],95:['⛈️','Orage']};
const wmo=c=>WMO[c]||WMO[Math.floor(c/10)*10]||['⛅','Variable'];
const cityEl=document.getElementById('city'),owEl=document.getElementById('owKey'),owRow=document.getElementById('owRow');
document.getElementById('cfg').onclick=()=>{owRow.style.display=owRow.style.display==='flex'?'none':'flex';};
async function load(){
  const q=cityEl.value.trim()||'Paris', key=owEl.value.trim();
  document.getElementById('desc').textContent='Synchronisation…';
  try{
    if(key){
      const r=await fetch('https://api.openweathermap.org/data/2.5/weather?q='+encodeURIComponent(q)+'&units=metric&lang=fr&appid='+encodeURIComponent(key));
      const d=await r.json();
      if(!r.ok) throw new Error(d.message||'OWM error');
      document.getElementById('loc').textContent=d.name+(d.sys?.country?', '+d.sys.country:'');
      document.getElementById('desc').textContent=d.weather?.[0]?.description||'OK';
      document.getElementById('tmp').textContent=Math.round(d.main.temp)+'°';
      document.getElementById('ico').textContent=d.main.temp>22?'☀️':d.weather?.[0]?.main==='Rain'?'🌧️':'⛅';
      document.getElementById('wind').textContent='💨 '+Math.round((d.wind?.speed||0)*3.6)+' km/h';
      document.getElementById('hum').textContent='💧 '+d.main.humidity+'%';
      document.getElementById('src').textContent='OpenWeather';
      document.getElementById('days').innerHTML='<div class="d">Ressenti<b>'+Math.round(d.main.feels_like)+'°</b></div><div class="d">Min<b>'+Math.round(d.main.temp_min)+'°</b></div><div class="d">Max<b>'+Math.round(d.main.temp_max)+'°</b></div>';
      return;
    }
    const g=await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name='+encodeURIComponent(q))).json();
    const hit=g.results?.[0];
    if(!hit) throw new Error('Ville introuvable');
    const w=await (await fetch('https://api.open-meteo.com/v1/forecast?latitude='+hit.latitude+'&longitude='+hit.longitude+'&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4')).json();
    const [ic,tx]=wmo(w.current.weather_code);
    document.getElementById('loc').textContent=hit.name+(hit.country_code?', '+hit.country_code:'');
    document.getElementById('desc').textContent=tx;
    document.getElementById('ico').textContent=ic;
    document.getElementById('tmp').textContent=Math.round(w.current.temperature_2m)+'°';
    document.getElementById('wind').textContent='💨 '+Math.round(w.current.wind_speed_10m)+' km/h';
    document.getElementById('hum').textContent='💧 '+w.current.relative_humidity_2m+'%';
    document.getElementById('src').textContent='Open-Meteo';
    const dn=w.daily;
    document.getElementById('days').innerHTML=[1,2,3].map(i=>{
      const day=new Date(dn.time[i]+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short'});
      return '<div class="d">'+day+' '+wmo(dn.weather_code[i])[0]+'<b>'+Math.round(dn.temperature_2m_max[i])+'° / '+Math.round(dn.temperature_2m_min[i])+'°</b></div>';
    }).join('');
  }catch(e){
    document.getElementById('desc').textContent='Hors-ligne ('+e.message+')';
  }
}
document.getElementById('go').onclick=load;
cityEl.onkeydown=e=>{if(e.key==='Enter')load();};
load();setInterval(load,300000);
</script></body></html>`,
  },
  {
    id: "widget-markets-live",
    title: "Bourse & Crypto Live",
    emoji: "📈",
    description: "Cours temps réel BTC, ETH, SOL, PAXG (Or) & indices via API Binance/CoinGecko avec sparklines & variation 24h.",
    x: 326,
    y: 54,
    width: 300,
    height: 230,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px 14px;background:transparent;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,system-ui,monospace;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.hdr{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}
.btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#e2e8f0;border-radius:7px;padding:2px 7px;font-size:10px;cursor:pointer}
.list{display:flex;flex-direction:column;gap:5px;flex:1;overflow-y:auto}
.item{display:grid;grid-template-columns:68px 1fr auto;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.sym{font-weight:700;font-size:12px;color:#fff}.sub{font-size:9px;color:#94a3b8}
.px{text-align:right;font-size:12px;font-weight:700}
.up{color:#34d399;font-size:10px}.dn{color:#fb7185;font-size:10px}
</style></head><body>
<div class="hdr"><span>📈 Live Markets</span><span><span id="ts">--:--</span> <button class="btn" id="ref">↻</button></span></div>
<div class="list" id="list"><div style="font-size:11px;color:#94a3b8">Connexion flux marchés…</div></div>
<script>
const PAIRS=[
  {s:'BTCUSDT',n:'Bitcoin',t:'BTC'},
  {s:'ETHUSDT',n:'Ethereum',t:'ETH'},
  {s:'SOLUSDT',n:'Solana',t:'SOL'},
  {s:'PAXGUSDT',n:'Gold Oz',t:'XAU'},
];
function spark(up){
  const col=up?'#34d399':'#fb7185';
  let d='M0 14';
  for(let i=1;i<=10;i++){const y=4+Math.random()*14+(up?(10-i)*0.4:i*0.4);d+=' L'+(i*7)+' '+Math.min(20,Math.max(2,y)).toFixed(1);}
  return '<svg width="70" height="22" viewBox="0 0 70 22"><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.7" stroke-linecap="round"/></svg>';
}
async function load(){
  try{
    const syms=encodeURIComponent(JSON.stringify(PAIRS.map(p=>p.s)));
    const r=await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols='+syms);
    const data=await r.json();
    const map=Object.fromEntries(data.map(x=>[x.symbol,x]));
    document.getElementById('list').innerHTML=PAIRS.map(p=>{
      const d=map[p.s]; if(!d) return '';
      const price=Number(d.lastPrice), chg=Number(d.priceChangePercent), up=chg>=0;
      const fmt=price>=1000?price.toLocaleString('en-US',{maximumFractionDigits:0}):price.toLocaleString('en-US',{maximumFractionDigits:2});
      return '<div class="item"><div><div class="sym">'+p.t+'</div><div class="sub">'+p.n+'</div></div><div>'+spark(up)+'</div><div class="px">$'+fmt+'<div class="'+(up?'up':'dn')+'">'+(up?'+':'')+chg.toFixed(2)+'%</div></div></div>';
    }).join('');
    document.getElementById('ts').textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch{
    try{
      const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,pax-gold&vs_currencies=usd&include_24hr_change=true');
      const d=await r.json();
      const rows=[['BTC','Bitcoin',d.bitcoin],['ETH','Ethereum',d.ethereum],['SOL','Solana',d.solana],['XAU','Gold Oz',d['pax-gold']]];
      document.getElementById('list').innerHTML=rows.map(([t,n,v])=>{
        if(!v)return '';const up=v.usd_24h_change>=0;
        return '<div class="item"><div><div class="sym">'+t+'</div><div class="sub">'+n+'</div></div><div>'+spark(up)+'</div><div class="px">$'+Number(v.usd).toLocaleString('en-US',{maximumFractionDigits:2})+'<div class="'+(up?'up':'dn')+'">'+(up?'+':'')+Number(v.usd_24h_change||0).toFixed(2)+'%</div></div></div>';
      }).join('');
      document.getElementById('ts').textContent='CoinGecko';
    }catch(e){
      document.getElementById('list').innerHTML='<div style="font-size:11px;color:#fb7185">Flux indisponible ('+e.message+')</div>';
    }
  }
}
document.getElementById('ref').onclick=load;
load();setInterval(load,20000);
</script></body></html>`,
  },
  {
    id: "widget-json-inspector",
    title: "Live JSON Server Feed",
    emoji: "🔌",
    description: "Interroge n'importe quelle API JSON distante avec rafraîchissement auto, temps de réponse ms et extraction de clé.",
    x: 26,
    y: 292,
    width: 312,
    height: 236,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px;background:transparent;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,monospace;display:flex;flex-direction:column;gap:7px;overflow:hidden}
.row{display:flex;gap:5px}
input,select{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:4px 7px;color:#fff;font-size:10px;outline:none;font-family:inherit}
input{flex:1;min-width:0}
button{background:rgba(168,85,247,.28);border:1px solid rgba(192,132,252,.45);color:#f3e8ff;border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer}
.meta{display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
.ok{color:#34d399}.err{color:#fb7185}
pre{flex:1;overflow:auto;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;font-size:10px;line-height:1.45;color:#7dd3fc;white-space:pre-wrap;word-break:break-word}
</style></head><body>
<div class="row">
  <input id="url" value="https://api.github.com/repos/TheSamLePirate/unkernelos" placeholder="https://api.example.com/data.json"/>
  <button id="go">Fetch</button>
</div>
<div class="row">
  <input id="path" placeholder="Clé (ex: stargazers_count ou vide=tout)"/>
  <select id="iv"><option value="0">Manuel</option><option value="15000" selected>15s</option><option value="60000">60s</option></select>
</div>
<div class="meta"><span id="st">Prêt</span><span id="lat">-- ms</span></div>
<pre id="out">{}</pre>
<script>
let timer=null;
const urlEl=document.getElementById('url'),pathEl=document.getElementById('path'),ivEl=document.getElementById('iv'),st=document.getElementById('st'),lat=document.getElementById('lat'),out=document.getElementById('out');
function pick(obj,p){if(!p)return obj;return p.split('.').reduce((a,k)=>a&&a[k],obj);}
async function run(){
  const u=urlEl.value.trim();if(!u)return;
  const t0=performance.now();st.textContent='GET…';st.className='';
  try{
    const r=await fetch(u);
    const ms=Math.round(performance.now()-t0);
    lat.textContent=ms+' ms';
    st.textContent='HTTP '+r.status;
    st.className=r.ok?'ok':'err';
    const data=await r.json();
    const val=pick(data,pathEl.value.trim());
    const compact=val&&typeof val==='object'&&!Array.isArray(val)&&!pathEl.value.trim()
      ? Object.fromEntries(Object.entries(val).filter(([,v])=>typeof v!=='object'||v===null).slice(0,14))
      : val;
    out.textContent=JSON.stringify(compact,null,2);
  }catch(e){
    st.textContent='Erreur';st.className='err';out.textContent=String(e.message||e);
  }
}
function resetTimer(){if(timer)clearInterval(timer);const ms=Number(ivEl.value);if(ms>0)timer=setInterval(run,ms);}
document.getElementById('go').onclick=run;
urlEl.onkeydown=e=>{if(e.key==='Enter')run();};
pathEl.onkeydown=e=>{if(e.key==='Enter')run();};
ivEl.onchange=resetTimer;
run();resetTimer();
</script></body></html>`,
  },
  {
    id: "widget-server-health",
    title: "Server Healthcheck & Heartbeat",
    emoji: "💓",
    description: "Surveillance continue multi-serveurs avec historique heartbeat 18 barres, latence ms, uptime % et ajout d'URL live.",
    x: 350,
    y: 292,
    width: 312,
    height: 236,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px;background:transparent;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,monospace;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.hdr{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#34d399;letter-spacing:.08em}
.add{display:flex;gap:5px}
input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:4px 7px;color:#fff;font-size:10px;outline:none}
button{background:rgba(16,185,129,.25);border:1px solid rgba(52,211,153,.45);color:#d1fae5;border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer}
.list{display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto}
.srv{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:5px}
.top{display:flex;justify-content:space-between;align-items:center;font-size:10px}
.dot{width:7px;height:7px;border-radius:99px;display:inline-block;margin-right:6px}
.bars{display:flex;gap:2px;height:12px;align-items:flex-end}
.b{flex:1;border-radius:2px;height:100%;background:rgba(255,255,255,.1)}
.b.ok{background:#10b981}.b.slow{background:#f59e0b}.b.err{background:#f43f5e}
</style></head><body>
<div class="hdr"><span>💓 HEARTBEAT MONITOR</span><button id="ping">Ping</button></div>
<div class="add"><input id="nu" placeholder="https://mon-serveur.com/health"/><button id="addBtn">+</button></div>
<div class="list" id="list"></div>
<script>
const servers=[
  {name:'unkernelOS Pages',url:'https://thesamlepirate.github.io/unkernelos/',hist:[]},
  {name:'GitHub API',url:'https://api.github.com',hist:[]},
  {name:'Cloudflare Edge',url:'https://1.1.1.1',hist:[]},
];
function render(){
  document.getElementById('list').innerHTML=servers.map((s,idx)=>{
    const last=s.hist[s.hist.length-1];
    const upCount=s.hist.filter(x=>x.ok).length;
    const pct=s.hist.length?Math.round((upCount/s.hist.length)*100):100;
    const col=!last?'#94a3b8':last.ok?(last.ms>650?'#f59e0b':'#10b981'):'#f43f5e';
    const slots=Array.from({length:18},(_,i)=>{
      const h=s.hist[s.hist.length-18+i];
      if(!h) return '<span class="b"></span>';
      return '<span class="b '+(h.ok?(h.ms>650?'slow':'ok'):'err')+'" title="'+h.ms+'ms"></span>';
    }).join('');
    return '<div class="srv"><div class="top"><span><i class="dot" style="background:'+col+';box-shadow:0 0 8px '+col+'"></i><b>'+s.name+'</b></span><span style="color:#94a3b8">'+(last?last.ms+'ms':'…')+' · '+pct+'% <a href="#" data-del="'+idx+'" style="color:#fb7185;text-decoration:none;margin-left:4px">×</a></span></div><div class="bars">'+slots+'</div></div>';
  }).join('');
  document.querySelectorAll('[data-del]').forEach(a=>a.onclick=e=>{e.preventDefault();servers.splice(Number(a.dataset.del),1);render();});
}
async function checkAll(){
  await Promise.all(servers.map(async s=>{
    const t0=performance.now();
    try{
      await fetch(s.url,{mode:'no-cors',cache:'no-store'});
      s.hist.push({ok:true,ms:Math.max(1,Math.round(performance.now()-t0))});
    }catch{
      s.hist.push({ok:false,ms:Math.round(performance.now()-t0)});
    }
    if(s.hist.length>24) s.hist.shift();
  }));
  render();
}
document.getElementById('addBtn').onclick=()=>{
  const v=document.getElementById('nu').value.trim();if(!v)return;
  const u=/^https?:\/\//i.test(v)?v:'https://'+v;
  let name=u;try{name=new URL(u).hostname;}catch{}
  servers.unshift({name,url:u,hist:[]});
  document.getElementById('nu').value='';
  checkAll();
};
document.getElementById('ping').onclick=checkAll;
render();checkAll();setInterval(checkAll,12000);
</script></body></html>`,
  },
  {
    id: "widget-bookmarks-cards",
    title: "Portail Sites & Aperçus Visuels",
    emoji: "🌐",
    description: "Raccourcis visuels vers vos sites favoris avec miniature aperçu du site, favicon HD et ajout rapide en un clic.",
    x: 640,
    y: 54,
    width: 318,
    height: 256,
    enabled: false,
    transparent: false,
    builtin: true,
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;padding:12px;background:transparent;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.add{display:flex;gap:5px}
input{flex:1;min-width:0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:4px 8px;color:#fff;font-size:10px;outline:none}
button{background:rgba(56,189,248,.24);border:1px solid rgba(56,189,248,.45);color:#e0f2fe;border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;flex:1;overflow-y:auto}
.card{position:relative;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.12);text-decoration:none;color:#fff;transition:transform .16s ease,border-color .16s ease}
.card:hover{transform:translateY(-2px);border-color:rgba(56,189,248,.6)}
.thumb{height:64px;width:100%;background:linear-gradient(135deg,#1e1b4b,#0f172a);position:relative;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.foot{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:11px;font-weight:600}
.foot img{width:14px;height:14px;border-radius:4px;flex-shrink:0}
.foot span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.del{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:99px;background:rgba(0,0,0,.65);color:#fda4af;border:0;font-size:11px;line-height:1;display:none;align-items:center;justify-content:center;cursor:pointer}
.card:hover .del{display:flex}
</style></head><body>
<div class="add"><input id="nu" placeholder="Ajouter un site (ex: github.com)"/><button id="ab">+ Site</button></div>
<div class="grid" id="g"></div>
<script>
const sites=[
  {title:'GitHub',url:'https://github.com'},
  {title:'Hacker News',url:'https://news.ycombinator.com'},
  {title:'MDN Docs',url:'https://developer.mozilla.org'},
  {title:'Three.js',url:'https://threejs.org'},
];
function host(u){try{return new URL(u).hostname;}catch{return u;}}
function render(){
  document.getElementById('g').innerHTML=sites.map((s,i)=>{
    const h=host(s.url);
    const shot='https://image.thum.io/get/width/320/crop/180/noanimate/'+s.url;
    const fav='https://icons.duckduckgo.com/ip3/'+h+'.ico';
    return '<a class="card" href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+
      '<button class="del" data-i="'+i+'" title="Retirer">×</button>'+
      '<div class="thumb"><img src="'+shot+'" crossorigin="anonymous" loading="lazy" onerror="this.style.display=\\'none\\'"/></div>'+
      '<div class="foot"><img src="'+fav+'" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"/><span>'+s.title+'</span></div></a>';
  }).join('');
  document.querySelectorAll('.del').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();sites.splice(Number(b.dataset.i),1);render();});
}
document.getElementById('ab').onclick=()=>{
  const v=document.getElementById('nu').value.trim();if(!v)return;
  const u=/^https?:\/\//i.test(v)?v:'https://'+v;
  sites.unshift({title:host(u).replace(/^www\./,''),url:u});
  document.getElementById('nu').value='';
  render();
};
document.getElementById('nu').onkeydown=e=>{if(e.key==='Enter')document.getElementById('ab').click();};
render();
</script></body></html>`,
  },
];

// ---------------------------------------------------------------------------
// Built-in General & Specific OS Mods (Toggleable & Stackable!)
// ---------------------------------------------------------------------------

export const BUILTIN_MODS: readonly OsMod[] = [
  {
    id: "mod-crt-scanlines",
    name: "CRT Scanlines & Phosphore",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "general",
    description: "Superpose des lignes de balayage CRT rétro réglables et un vignettage cathodique sur tout le bureau.",
    tags: ["retro", "cyberpunk", "overlay"],
    enabled: false,
    builtin: true,
    params: [
      { key: "opacity", label: "Intensité scanlines", type: "range", min: 0.04, max: 0.45, step: 0.01, defaultValue: 0.14 },
      { key: "pitch", label: "Espacement lignes", type: "range", min: 2, max: 6, step: 1, unit: "px", defaultValue: 3 },
      { key: "vignette", label: "Vignettage CRT", type: "range", min: 0, max: 0.7, step: 0.05, defaultValue: 0.36 },
    ],
    css: `body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,{{opacity}}) 0px, rgba(0,0,0,{{opacity}}) 1px, transparent 1px, transparent {{pitch}}px),
    radial-gradient(circle at center, transparent 58%, rgba(0,0,0,{{vignette}}) 100%);
}`,
  },
  {
    id: "mod-rgb-chroma-borders",
    name: "Bordures Prismatiques RGB Actives",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Halo prismatique animé bi-couleur autour de la fenêtre active et du Dock (couleurs, vitesse & rayon réglables).",
    tags: ["glow", "windows", "rgb", "hyprland"],
    enabled: false,
    builtin: true,
    params: [
      { key: "colorA", label: "Couleur 1", type: "color", defaultValue: "#22d3ee" },
      { key: "colorB", label: "Couleur 2", type: "color", defaultValue: "#e879f9" },
      { key: "speed", label: "Cycle animation", type: "range", min: 1, max: 12, step: 0.5, unit: "s", defaultValue: 4.5 },
      { key: "spread", label: "Rayon du halo", type: "range", min: 14, max: 72, step: 2, unit: "px", defaultValue: 38 },
    ],
    css: `@keyframes unkernel-chroma-border {
  0% { border-color: {{colorA}}; box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 {{spread}}px -6px {{colorA}}; }
  50% { border-color: {{colorB}}; box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 {{spread}}px -6px {{colorB}}; }
  100% { border-color: {{colorA}}; box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 {{spread}}px -6px {{colorA}}; }
}
.glass-surface-focused {
  animation: unkernel-chroma-border {{speed}}s ease-in-out infinite;
}`,
  },
  {
    id: "mod-liquid-chrome-rim",
    name: "Reflets Liquid Chrome / VisionOS",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "general",
    description: "Intensifie les arêtes spéculaires cristallines façon macOS Tahoe / VisionOS sur fenêtres et dock.",
    tags: ["liquid-glass", "specular", "macos", "visionos"],
    enabled: false,
    builtin: true,
    params: [
      { key: "topSheen", label: "Brillance arête haute", type: "range", min: 0.1, max: 0.75, step: 0.05, defaultValue: 0.38 },
      { key: "tint", label: "Reflet secondaire", type: "color", defaultValue: "#7dd3fc" },
    ],
    css: `.glass-surface, .glass-surface-focused, .glass-dock, .glass-widget {
  box-shadow:
    0 28px 72px -12px rgba(0, 0, 0, 0.72),
    0 1.5px 0 0 rgba(255, 255, 255, {{topSheen}}) inset,
    0 -1px 0 0 {{tint}} inset,
    1px 0 0 0 rgba(255, 255, 255, 0.16) inset;
}`,
  },
  {
    id: "mod-win95-bevel",
    name: "Windows 95 Classic 3D Bevel",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Châssis gris classique biseauté 3D authentique, zéro flou, ombres nettes 1995.",
    tags: ["windows", "win95", "retro"],
    enabled: false,
    builtin: true,
    params: [
      { key: "shadowPx", label: "Ombre portée", type: "range", min: 0, max: 10, step: 1, unit: "px", defaultValue: 4 },
    ],
    css: `.glass-surface, .glass-surface-focused {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 2px solid #dfdfdf !important;
  border-right-color: #404040 !important;
  border-bottom-color: #404040 !important;
  box-shadow:
    inset 1px 1px 0 #ffffff,
    inset -1px -1px 0 #808080,
    {{shadowPx}}px {{shadowPx}}px 0 rgba(0, 0, 0, 0.38) !important;
}`,
  },
  {
    id: "mod-winxp-luna",
    name: "Windows XP Luna Glossy Frame",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Bordures bleu roi Luna brillant (ou Olive/Argent !) et coins supérieurs arrondis emblématiques.",
    tags: ["windows", "winxp", "luna"],
    enabled: false,
    builtin: true,
    params: [
      { key: "frameColor", label: "Teinte Luna", type: "color", defaultValue: "#0054e3" },
      { key: "borderPx", label: "Épaisseur cadre", type: "range", min: 2, max: 5, step: 1, unit: "px", defaultValue: 3 },
    ],
    css: `.glass-surface, .glass-surface-focused {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: {{borderPx}}px solid {{frameColor}} !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.5),
    0 14px 36px rgba(0, 24, 96, 0.55) !important;
}`,
  },
  {
    id: "mod-compiz-emerald-glow",
    name: "Compiz / Beryl Emerald Crystal Glow",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Halo cristal transparent façon Emerald Theme Manager de Compiz Fusion.",
    tags: ["linux", "compiz", "beryl", "3d"],
    enabled: false,
    builtin: true,
    params: [
      { key: "glowColor", label: "Couleur cristal", type: "color", defaultValue: "#10b981" },
      { key: "glowPx", label: "Halo néon", type: "range", min: 16, max: 80, step: 4, unit: "px", defaultValue: 44 },
    ],
    css: `.glass-surface-focused {
  border-color: {{glowColor}} !important;
  box-shadow:
    0 32px 90px -10px rgba(0, 0, 0, 0.85),
    0 0 {{glowPx}}px -4px {{glowColor}},
    inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
}`,
  },
  {
    id: "mod-aqua-pinstripes",
    name: "Mac OS X Aqua Pinstripes",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Rayures fines métallisées et barres de titre brillantes inspirées de Mac OS X Tiger.",
    tags: ["apple", "macos", "aqua"],
    enabled: false,
    builtin: true,
    params: [
      { key: "stripeOp", label: "Contraste rayures", type: "range", min: 0.03, max: 0.22, step: 0.01, defaultValue: 0.07 },
      { key: "gloss", label: "Reflet gel Aqua", type: "range", min: 0.1, max: 0.45, step: 0.03, defaultValue: 0.26 },
    ],
    css: `[data-unkernel-titlebar] {
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,{{stripeOp}}) 0px, rgba(255,255,255,{{stripeOp}}) 1px, transparent 1px, transparent 3px),
    linear-gradient(180deg, rgba(255,255,255,{{gloss}}) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.18) 100%) !important;
}`,
  },
  {
    id: "mod-neon-hud-type",
    name: "Typographie HUD Cybernétique",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "specific",
    description: "Titres de fenêtres & barres système en monospace lumineux majuscule.",
    tags: ["typography", "hud", "cyberpunk"],
    enabled: false,
    builtin: true,
    params: [
      { key: "glowColor", label: "Lueur texte", type: "color", defaultValue: "#22d3ee" },
      { key: "tracking", label: "Espacement lettres", type: "range", min: 0.02, max: 0.18, step: 0.01, unit: "em", defaultValue: 0.07 },
    ],
    css: `[data-unkernel-titlebar] {
  font-family: var(--font-mono) !important;
  letter-spacing: {{tracking}}em;
  text-transform: uppercase;
  text-shadow: 0 0 12px {{glowColor}};
}`,
  },
  {
    id: "mod-compact-tiling",
    name: "Performance Feather (Zero-Blur)",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "general",
    description: "Désactive le backdrop-blur pour une réactivité instantanée façon LXDE / XFCE / i3.",
    tags: ["linux", "xfce", "lxde", "performance"],
    enabled: false,
    builtin: true,
    params: [
      { key: "scrollPx", label: "Largeur scrollbar", type: "range", min: 2, max: 8, step: 1, unit: "px", defaultValue: 4 },
    ],
    css: `.glass-surface, .glass-surface-focused, .glass-dock, .glass-bar {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
::-webkit-scrollbar { width: {{scrollPx}}px; height: {{scrollPx}}px; }`,
  },
  {
    id: "mod-cinematic-vignette",
    name: "Vignettage Cinéma & Profondeur",
    author: "unkernelOS Labs",
    version: "2.0.0",
    kind: "css",
    scope: "general",
    description: "Vignettage studio réglable sur les bords pour sublimer le contraste des fenêtres.",
    tags: ["cinema", "zen", "ambient"],
    enabled: false,
    builtin: true,
    params: [
      { key: "depth", label: "Intensité ombre", type: "range", min: 0.1, max: 0.75, step: 0.05, defaultValue: 0.42 },
      { key: "inner", label: "Zone claire centrale", type: "range", min: 35, max: 75, step: 5, unit: "%", defaultValue: 55 },
    ],
    css: `body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 4;
  background: radial-gradient(ellipse 85% 85% at 50% 50%, transparent {{inner}}%, rgba(0, 0, 0, {{depth}}) 100%);
}`,
  },
  // ─── 6 BRAND-NEW LUXURY EYE-CANDY & POWER-USER MODS ────────────────────────
  {
    id: "mod-neon-dock-underlight",
    name: "Neon Underlight (Dock & Fenêtre Active)",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "specific",
    description: "Projette un rétro-éclairage néon diffus sous le Dock et la fenêtre active façon cockpit OLED.",
    tags: ["eye-candy", "neon", "dock", "oled"],
    enabled: false,
    builtin: true,
    params: [
      { key: "color", label: "Couleur néon", type: "color", defaultValue: "#38bdf8" },
      { key: "blur", label: "Diffusion", type: "range", min: 20, max: 90, step: 5, unit: "px", defaultValue: 48 },
    ],
    css: `.glass-dock {
  box-shadow: 0 18px {{blur}}px -4px {{color}}, 0 1px 0 rgba(255,255,255,0.28) inset !important;
}
.glass-surface-focused {
  box-shadow: 0 26px {{blur}}px -10px {{color}}, 0 28px 80px -12px rgba(0,0,0,0.85) !important;
}`,
  },
  {
    id: "mod-sequoia-elevation",
    name: "macOS Sequoia Multi-Layer Elevation",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Ombres physiques multi-couches ultra-douces et fin liséré cristal 0.5px sur chaque surface.",
    tags: ["macos", "luxury", "shadows"],
    enabled: false,
    builtin: true,
    params: [
      { key: "depth", label: "Profondeur ombre", type: "range", min: 30, max: 120, step: 5, unit: "px", defaultValue: 85 },
      { key: "rimOp", label: "Liséré cristal", type: "range", min: 0.08, max: 0.45, step: 0.02, defaultValue: 0.24 },
    ],
    css: `.glass-surface-focused {
  box-shadow:
    0 4px 12px rgba(0,0,0,0.35),
    0 24px 48px -12px rgba(0,0,0,0.6),
    0 48px {{depth}}px -16px rgba(0,0,0,0.85),
    0 0 0 0.5px rgba(255,255,255,{{rimOp}}) inset,
    0 1px 0 rgba(255,255,255,{{rimOp}}) inset !important;
}`,
  },
  {
    id: "mod-amber-phosphor",
    name: "Terminal Ambre Phosphore (IBM / Fallout)",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Halo ambre chaleureux rétro-futuriste sur les bordures, barres de titre et textes systèmes.",
    tags: ["retro", "amber", "phosphor"],
    enabled: false,
    builtin: true,
    params: [
      { key: "amber", label: "Couleur phosphore", type: "color", defaultValue: "#f59e0b" },
      { key: "bloom", label: "Intensité bloom", type: "range", min: 8, max: 44, step: 2, unit: "px", defaultValue: 22 },
    ],
    css: `.glass-surface-focused, .glass-dock {
  border-color: {{amber}} !important;
  box-shadow: 0 0 {{bloom}}px -4px {{amber}}, 0 24px 70px rgba(0,0,0,0.85) !important;
}
[data-unkernel-titlebar] {
  color: {{amber}} !important;
  text-shadow: 0 0 10px {{amber}};
}`,
  },
  {
    id: "mod-frosted-prism-glass",
    name: "Verre Dépoli Prismatique (VisionOS Ultra)",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Amplifie la saturation optique du flou de verre (saturate 240%) et ajoute un reflet diagonal irisé.",
    tags: ["visionos", "glass", "eye-candy"],
    enabled: false,
    builtin: true,
    params: [
      { key: "sat", label: "Saturation optique", type: "range", min: 140, max: 300, step: 10, unit: "%", defaultValue: 240 },
      { key: "sheenOp", label: "Reflet diagonal", type: "range", min: 0.04, max: 0.24, step: 0.02, defaultValue: 0.11 },
    ],
    css: `.glass-surface, .glass-surface-focused, .glass-dock, .glass-widget {
  backdrop-filter: blur(var(--glass-blur-effective)) saturate({{sat}}%) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur-effective)) saturate({{sat}}%) !important;
  background-image: linear-gradient(135deg, rgba(255,255,255,{{sheenOp}}) 0%, transparent 44%, rgba(56,189,248,0.05) 100%) !important;
}`,
  },
  {
    id: "mod-zen-focus-dim",
    name: "Mode Focus Zen (Auto-Atténuation Chrome)",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Atténue doucement la TopBar, le Dock et les fenêtres inactives tant qu'ils ne sont pas survolés.",
    tags: ["focus", "zen", "minimal"],
    enabled: false,
    builtin: true,
    params: [
      { key: "idleOp", label: "Opacité au repos", type: "range", min: 0.25, max: 0.9, step: 0.05, defaultValue: 0.55 },
    ],
    css: `header.glass-bar, .glass-dock {
  opacity: {{idleOp}};
  transition: opacity 220ms ease;
}
header.glass-bar:hover, .glass-dock:hover {
  opacity: 1;
}`,
  },
  {
    id: "mod-swiss-editorial-type",
    name: "Typographie Éditoriale Ultra-Raffinée",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Ajuste le crénage optique, les chiffres tabulaires et la finesse des titres façon design suisse.",
    tags: ["typography", "swiss", "luxury"],
    enabled: false,
    builtin: true,
    params: [
      { key: "tracking", label: "Crénage optique", type: "range", min: -0.04, max: 0.06, step: 0.005, unit: "em", defaultValue: -0.015 },
    ],
    css: `body {
  letter-spacing: {{tracking}}em;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum";
}`,
  },
];

// ---------------------------------------------------------------------------
// 16 Complete AAA OS Variants (Windows 95→11 · Linux LXDE→Compiz 3D · macOS→iOS→VisionOS · Creative)
// ---------------------------------------------------------------------------

export const BUILTIN_VARIANTS: readonly OsVariant[] = [
  {
    id: "horizon",
    desktopMode: "horizon",
    name: "Horizon",
    family: "creative",
    tagline: "Bureau spatial par défaut · Profondeur continue, docks vivants et tiroirs de contexte",
    emoji: "🌅",
    swatches: ["#d9c39a", "#539394", "#10191f"],
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Horizon",
      glassRgb: "16, 25, 31",
      elevatedRgb: "23, 34, 41",
      barRgb: "16, 25, 31",
      dockRgb: "23, 34, 41",
      accentPrimary: "#d9c39a",
      accentSecondary: "#539394",
      fallbackBg: "linear-gradient(160deg, #1e3b49, #182d37 45%, #0b1722)",
    },
    decorator: { ...DEFAULT_DECORATOR },
    shell: { ...DEFAULT_SHELL, showStockWidgets: false },
    desktop3d: { ...DEFAULT_DESKTOP_3D, enabled: false },
    enabledModIds: [],
    enabledWidgetIds: [],
    builtin: true,
  },
  // ─── STOCK ──────────────────────────────────────────────────────────
  {
    id: "unkernel-default",
    name: "unkernelOS Stock",
    family: "creative",
    tagline: "Obsidian Aurora natif · Verre fumé, macOS traffic lights & Dock Liquid Glass",
    emoji: "🌌",
    swatches: ["#8b5cf6", "#22d3ee", "#ec4899"],
    baseOsTheme: "obsidian-aurora",
    baseShader: "aurora",
    activeShaderModId: null,
    theme: { ...DEFAULT_CUSTOM_THEME, enabled: false },
    decorator: { ...DEFAULT_DECORATOR },
    shell: { ...DEFAULT_SHELL },
    enabledModIds: [],
    enabledWidgetIds: [],
    builtin: true,
  },

  // ─── WINDOWS FAMILY (95 · XP · 11) ──────────────────────────────────
  {
    id: "windows-95",
    name: "Windows 95 Classic",
    family: "windows",
    tagline: "Bureau Sarcelle #008080, fenêtres grises biseautées 3D, bouton Démarrer, Menu & Icônes Bureau",
    emoji: "🪟",
    swatches: ["#008080", "#000080", "#c0c0c0"],
    baseOsTheme: "obsidian-aurora",
    baseShader: "aurora",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Windows 95 Classic",
      glassRgb: "24, 28, 36",
      elevatedRgb: "28, 32, 42",
      barRgb: "192, 192, 192",
      dockRgb: "192, 192, 192",
      glassOpacity: 0.98,
      blurPx: 0,
      borderColor: "#808080",
      activeBorderColor: "#dfdfdf",
      accentPrimary: "#000080",
      accentSecondary: "#008080",
      windowGlow: "rgba(0, 0, 0, 0)",
      fallbackBg: "linear-gradient(180deg, #008080 0%, #006d6d 100%)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "windows-95",
      buttonPosition: "right",
      radiusPx: 0,
      borderWidthPx: 2,
      titlebarHeightPx: 30,
      titleAlign: "left",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 0,
      unfocusedOpacity: 0.98,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "win95",
      dockStyle: "hidden",
      topBarStyle: "hidden",
      brandLabel: "Windows 95",
      showStockWidgets: false,
      desktopIcons: true,
    },
    enabledModIds: ["mod-win95-bevel"],
    enabledWidgetIds: [],
    builtin: true,
  },
  {
    id: "windows-xp",
    name: "Windows XP · Luna Bliss",
    family: "windows",
    tagline: "Collines Bliss WGSL en direct, barre bleue Luna brillante, bouton Démarrer vert & Menu 2 colonnes",
    emoji: "🌄",
    swatches: ["#245edb", "#3c9f38", "#60a5fa"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: "shader-xp-bliss",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Windows XP Luna",
      glassRgb: "18, 26, 46",
      elevatedRgb: "22, 32, 56",
      barRgb: "36, 94, 219",
      dockRgb: "36, 94, 219",
      glassOpacity: 0.96,
      blurPx: 0,
      borderColor: "#0054e3",
      activeBorderColor: "#3a93ff",
      accentPrimary: "#245edb",
      accentSecondary: "#3c9f38",
      windowGlow: "rgba(36, 94, 219, 0.32)",
      fallbackBg: "linear-gradient(180deg, #2563eb 0%, #60a5fa 48%, #4ade80 58%, #15803d 100%)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "windows-xp",
      buttonPosition: "right",
      radiusPx: 9,
      borderWidthPx: 3,
      titlebarHeightPx: 34,
      titleAlign: "left",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 22,
      unfocusedOpacity: 0.96,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "winxp",
      dockStyle: "hidden",
      topBarStyle: "hidden",
      brandLabel: "Windows XP",
      showStockWidgets: false,
      desktopIcons: true,
    },
    enabledModIds: ["mod-winxp-luna"],
    enabledWidgetIds: [],
    builtin: true,
  },
  {
    id: "windows-11",
    name: "Windows 11 · Fluent Mica",
    family: "windows",
    tagline: "Bloom WGSL 60fps, Taskbar centrée Acrylic, Menu Démarrer moderne, fenêtres Fluent Mica & Icônes",
    emoji: "💠",
    swatches: ["#0078d4", "#38bdf8", "#1e293b"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: "shader-win11-bloom",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Windows 11 Dark Mica",
      glassRgb: "24, 28, 38",
      elevatedRgb: "30, 35, 48",
      barRgb: "20, 24, 34",
      dockRgb: "24, 29, 40",
      glassOpacity: 0.82,
      blurPx: 34,
      borderColor: "rgba(255, 255, 255, 0.12)",
      activeBorderColor: "rgba(96, 205, 255, 0.42)",
      accentPrimary: "#60cdff",
      accentSecondary: "#0078d4",
      windowGlow: "rgba(0, 120, 212, 0.28)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "windows-11",
      buttonPosition: "right",
      radiusPx: 10,
      borderWidthPx: 1,
      titlebarHeightPx: 36,
      titleAlign: "left",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: true,
      activeGlowPx: 34,
      unfocusedOpacity: 0.94,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "win11",
      dockStyle: "hidden",
      topBarStyle: "hidden",
      brandLabel: "Windows 11",
      showStockWidgets: false,
      desktopIcons: true,
    },
    enabledModIds: [],
    enabledWidgetIds: ["widget-live-radar"],
    builtin: true,
  },

  // ─── LINUX DESKTOP FAMILY (LXDE/XFCE · GNOME · KDE · HYPRLAND · COMPIZ 3D) ───
  {
    id: "linux-xfce-lxde",
    name: "Linux LXDE / XFCE Feather",
    family: "linux",
    tagline: "Ultra-léger 0 flou, panel classique Whisker Menu, sélecteur 4 bureaux, fenêtres 28px & icônes",
    emoji: "🐭",
    swatches: ["#0ea5e9", "#334155", "#94a3b8"],
    baseOsTheme: "nordic-frost",
    baseShader: "nordic-borealis",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "XFCE Greybird Dark",
      glassRgb: "28, 32, 40",
      elevatedRgb: "34, 39, 49",
      barRgb: "22, 26, 33",
      dockRgb: "22, 26, 33",
      glassOpacity: 0.98,
      blurPx: 0,
      borderColor: "rgba(148, 163, 184, 0.25)",
      activeBorderColor: "rgba(56, 189, 248, 0.7)",
      accentPrimary: "#38bdf8",
      accentSecondary: "#64748b",
      windowGlow: "rgba(0,0,0,0)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "xfce-lxde",
      buttonPosition: "right",
      radiusPx: 4,
      borderWidthPx: 1,
      titlebarHeightPx: 28,
      titleAlign: "left",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 0,
      unfocusedOpacity: 0.96,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "xfce-lxde",
      dockStyle: "hidden",
      topBarStyle: "hidden",
      brandLabel: "XFCE 4.20",
      showStockWidgets: false,
      desktopIcons: true,
    },
    enabledModIds: ["mod-compact-tiling"],
    enabledWidgetIds: [],
    builtin: true,
  },
  {
    id: "linux-gnome-47",
    name: "Linux GNOME 47 · Adwaita",
    family: "linux",
    tagline: "Barre supérieure noire minimaliste, fenêtres Libadwaita épurées, Dash inférieur & shader Adwaita",
    emoji: "👣",
    swatches: ["#3584e4", "#242424", "#e01b24"],
    baseOsTheme: "nordic-frost",
    baseShader: "aurora",
    activeShaderModId: "shader-gnome-adwaita",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "GNOME Adwaita Dark",
      glassRgb: "36, 36, 38",
      elevatedRgb: "44, 44, 48",
      barRgb: "16, 16, 18",
      dockRgb: "28, 28, 32",
      glassOpacity: 0.94,
      blurPx: 18,
      borderColor: "rgba(255, 255, 255, 0.1)",
      activeBorderColor: "rgba(255, 255, 255, 0.22)",
      accentPrimary: "#3584e4",
      accentSecondary: "#62a0ea",
      windowGlow: "rgba(53, 132, 228, 0.18)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "gnome-adwaita",
      buttonPosition: "right",
      radiusPx: 14,
      borderWidthPx: 1,
      titlebarHeightPx: 40,
      titleAlign: "center",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 20,
      unfocusedOpacity: 0.95,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "minimal-pill",
      dockRadiusPx: 20,
      topBarStyle: "gnome",
      brandLabel: "Activities",
      showStockWidgets: false,
      desktopIcons: false,
    },
    enabledModIds: [],
    enabledWidgetIds: [],
    builtin: true,
  },
  {
    id: "linux-kde-plasma",
    name: "Linux KDE Plasma 6 · Breeze",
    family: "linux",
    tagline: "Panel flottant Breeze verre, menu Kickoff, décorateur Plasma accent bleu & widgets bureau",
    emoji: "⚙️",
    swatches: ["#3daee9", "#1d99f3", "#232629"],
    baseOsTheme: "nordic-frost",
    baseShader: "nordic-borealis",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "KDE Breeze Dark",
      glassRgb: "27, 31, 38",
      elevatedRgb: "35, 40, 49",
      barRgb: "24, 28, 34",
      dockRgb: "26, 30, 38",
      glassOpacity: 0.84,
      blurPx: 28,
      borderColor: "rgba(61, 174, 233, 0.22)",
      activeBorderColor: "rgba(61, 174, 233, 0.68)",
      accentPrimary: "#3daee9",
      accentSecondary: "#2ecc71",
      windowGlow: "rgba(61, 174, 233, 0.3)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "kde-breeze",
      buttonPosition: "right",
      radiusPx: 8,
      borderWidthPx: 1,
      titlebarHeightPx: 34,
      titleAlign: "center",
      titlebarAccentBar: true,
      showWorkspacePills: true,
      showSnapButtons: true,
      activeGlowPx: 36,
      unfocusedOpacity: 0.93,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "kde-plasma",
      dockStyle: "hidden",
      topBarStyle: "hidden",
      brandLabel: "KDE Plasma 6",
      showStockWidgets: true,
      desktopIcons: true,
    },
    enabledModIds: [],
    enabledWidgetIds: ["widget-analog-clock", "widget-live-radar"],
    builtin: true,
  },
  {
    id: "linux-compiz-beryl",
    name: "Compiz / Beryl 3D Fusion",
    family: "linux",
    tagline: "CUBE 3D WebGPU interactif, Fenêtres Molles (Wobbly Physics!), décorateur Emerald cristal & transition Cube",
    emoji: "🧊",
    swatches: ["#10b981", "#22d3ee", "#a855f7"],
    baseOsTheme: "obsidian-aurora",
    baseShader: "aurora",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Compiz Emerald Crystal",
      glassRgb: "10, 20, 26",
      elevatedRgb: "14, 28, 36",
      barRgb: "8, 16, 22",
      dockRgb: "10, 22, 30",
      glassOpacity: 0.72,
      blurPx: 26,
      borderColor: "rgba(52, 211, 153, 0.34)",
      activeBorderColor: "rgba(34, 211, 238, 0.75)",
      accentPrimary: "#10b981",
      accentSecondary: "#22d3ee",
      windowGlow: "rgba(16, 185, 129, 0.44)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "compiz-emerald",
      buttonPosition: "right",
      radiusPx: 14,
      borderWidthPx: 1,
      titlebarHeightPx: 36,
      titleAlign: "center",
      titlebarAccentBar: true,
      showWorkspacePills: true,
      showSnapButtons: true,
      activeGlowPx: 54,
      unfocusedOpacity: 0.88,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "floating-glass",
      dockRadiusPx: 22,
      topBarStyle: "glass",
      brandLabel: "Compiz//Beryl 3D",
      showStockWidgets: false,
      desktopIcons: false,
      compizWobbly: true,
      compizCube: true,
    },
    desktop3d: {
      enabled: true,
      layout: "compiz-cube",
      scene: "aurora-fjord",
      spatialWindows: true,
      interactiveOrbit: true,
      cameraSpeed: 0.75,
      bloomIntensity: 1.25,
      particleDensity: 1.2,
      mouseParallax: 1.2,
    },
    enabledModIds: ["mod-compiz-emerald-glow"],
    enabledWidgetIds: ["widget-live-radar", "widget-cyber-eq"],
    builtin: true,
  },
  {
    id: "linux-hyprland-i3",
    name: "Linux Hyprland · Wayland Rice",
    family: "linux",
    tagline: "Waybar flottante, fenêtres tiling-i3 powerline, bordures RGB animées & shader Event Horizon",
    emoji: "❄️",
    swatches: ["#22d3ee", "#e879f9", "#0f172a"],
    baseOsTheme: "obsidian-aurora",
    baseShader: "aurora",
    activeShaderModId: "shader-event-horizon",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Hyprland Catppuccin Glow",
      glassRgb: "14, 15, 24",
      elevatedRgb: "19, 21, 34",
      barRgb: "12, 13, 22",
      dockRgb: "14, 16, 26",
      glassOpacity: 0.78,
      blurPx: 24,
      borderColor: "rgba(148, 163, 184, 0.22)",
      activeBorderColor: "rgba(34, 211, 238, 0.8)",
      accentPrimary: "#22d3ee",
      accentSecondary: "#e879f9",
      windowGlow: "rgba(34, 211, 238, 0.36)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "tiling-i3",
      buttonPosition: "right",
      radiusPx: 12,
      borderWidthPx: 2,
      titlebarHeightPx: 28,
      titleAlign: "left",
      titlebarAccentBar: true,
      showWorkspacePills: true,
      showSnapButtons: true,
      activeGlowPx: 44,
      unfocusedOpacity: 0.86,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "minimal-pill",
      dockRadiusPx: 16,
      topBarStyle: "floating-pills",
      brandLabel: "Hyprland",
      showStockWidgets: false,
      compizWobbly: false,
      compizCube: true,
    },
    enabledModIds: ["mod-rgb-chroma-borders"],
    enabledWidgetIds: ["widget-matrix-ticker"],
    builtin: true,
  },

  // ─── APPLE & SPATIAL FAMILY (macOS · Aqua · iOS SpringBoard · VisionOS 3D) ───
  {
    id: "macos-tahoe-liquid",
    name: "macOS Tahoe · Liquid Metal",
    family: "apple",
    tagline: "Verre saphir réfractif, reflets chrome spéculaires, Mercure WGSL, traffic lights & Horloge Studio",
    emoji: "💎",
    swatches: ["#38bdf8", "#e2e8f0", "#818cf8"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: "shader-liquid-mercury",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Liquid Metal Sapphire",
      glassRgb: "16, 24, 42",
      elevatedRgb: "22, 33, 56",
      barRgb: "12, 18, 34",
      dockRgb: "20, 30, 52",
      glassOpacity: 0.66,
      blurPx: 36,
      borderColor: "rgba(224, 242, 254, 0.22)",
      activeBorderColor: "rgba(255, 255, 255, 0.42)",
      accentPrimary: "#38bdf8",
      accentSecondary: "#c4b5fd",
      windowGlow: "rgba(56, 189, 248, 0.34)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "macos",
      buttonPosition: "left",
      radiusPx: 20,
      borderWidthPx: 1,
      titlebarHeightPx: 38,
      titleAlign: "center",
      titlebarAccentBar: false,
      activeGlowPx: 54,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "floating-glass",
      dockRadiusPx: 26,
      topBarStyle: "floating-pills",
      brandLabel: "macOS Liquid",
      showStockWidgets: true,
    },
    enabledModIds: ["mod-liquid-chrome-rim"],
    enabledWidgetIds: ["widget-analog-clock", "widget-live-radar"],
    builtin: true,
  },
  {
    id: "macos-aqua-classic",
    name: "Mac OS X · Aqua Tiger",
    family: "apple",
    tagline: "Pinstripes métallisées, boutons gel Aqua lumineux, Dock verre brillant & vagues bleues",
    emoji: "🍎",
    swatches: ["#3b82f6", "#e2e8f0", "#22c55e"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Mac OS X Aqua",
      glassRgb: "30, 36, 48",
      elevatedRgb: "38, 46, 62",
      barRgb: "22, 28, 40",
      dockRgb: "28, 36, 52",
      glassOpacity: 0.86,
      blurPx: 20,
      borderColor: "rgba(255, 255, 255, 0.28)",
      activeBorderColor: "rgba(147, 197, 253, 0.65)",
      accentPrimary: "#3b82f6",
      accentSecondary: "#60a5fa",
      windowGlow: "rgba(59, 130, 246, 0.32)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "macos-classic",
      buttonPosition: "left",
      radiusPx: 12,
      borderWidthPx: 1,
      titlebarHeightPx: 34,
      titleAlign: "center",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      activeGlowPx: 34,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "floating-glass",
      dockRadiusPx: 18,
      topBarStyle: "glass",
      brandLabel: "Mac OS X",
      showStockWidgets: false,
      desktopIcons: true,
    },
    enabledModIds: ["mod-aqua-pinstripes"],
    enabledWidgetIds: ["widget-analog-clock"],
    builtin: true,
  },
  {
    id: "ios-ipados-springboard",
    name: "iOS / iPadOS · SpringBoard",
    family: "apple",
    tagline: "Vrai écran d'accueil SpringBoard à icônes squircles + Widgets + Dynamic Island + barre Home",
    emoji: "📱",
    swatches: ["#38bdf8", "#a855f7", "#f472b6"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "iPadOS Glass",
      glassRgb: "18, 22, 34",
      elevatedRgb: "24, 29, 44",
      barRgb: "10, 12, 20",
      dockRgb: "28, 34, 52",
      glassOpacity: 0.76,
      blurPx: 38,
      borderColor: "rgba(255, 255, 255, 0.2)",
      activeBorderColor: "rgba(255, 255, 255, 0.38)",
      accentPrimary: "#38bdf8",
      accentSecondary: "#f472b6",
      windowGlow: "rgba(56, 189, 248, 0.28)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "floating-zen",
      buttonPosition: "left",
      radiusPx: 26,
      borderWidthPx: 1,
      titlebarHeightPx: 38,
      titleAlign: "center",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 48,
      unfocusedOpacity: 0.92,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "ios-springboard",
      dockStyle: "floating-glass",
      dockRadiusPx: 28,
      topBarStyle: "ios",
      brandLabel: "iPadOS",
      showStockWidgets: false,
      springboardHome: true,
    },
    enabledModIds: ["mod-liquid-chrome-rim"],
    enabledWidgetIds: [],
    builtin: true,
  },
  {
    id: "vision-spatial-3d",
    name: "Apple VisionOS · Spatial 3D",
    family: "apple",
    tagline: "Bureau 3D WebGPU Horizon Spatial, fenêtres verre sans bordure + barre grab inférieure + rail Ornament",
    emoji: "🥽",
    swatches: ["#e0f2fe", "#38bdf8", "#a855f7"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "VisionOS Spatial Glass",
      glassRgb: "22, 30, 48",
      elevatedRgb: "30, 40, 64",
      barRgb: "16, 22, 38",
      dockRgb: "24, 34, 54",
      glassOpacity: 0.56,
      blurPx: 42,
      borderColor: "rgba(255, 255, 255, 0.28)",
      activeBorderColor: "rgba(255, 255, 255, 0.52)",
      accentPrimary: "#38bdf8",
      accentSecondary: "#e0f2fe",
      windowGlow: "rgba(186, 230, 253, 0.34)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "visionos-glass",
      buttonPosition: "left",
      radiusPx: 28,
      borderWidthPx: 1,
      titlebarHeightPx: 34,
      titleAlign: "center",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      showSnapButtons: false,
      activeGlowPx: 58,
      unfocusedOpacity: 0.86,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "visionos-ornament",
      dockStyle: "hidden",
      topBarStyle: "floating-pills",
      brandLabel: "visionOS",
      showStockWidgets: false,
      visionOrnaments: true,
    },
    desktop3d: {
      enabled: true,
      layout: "curved-cockpit",
      scene: "alpine-fjord",
      spatialWindows: true,
      interactiveOrbit: true,
      cameraSpeed: 0.65,
      bloomIntensity: 1.05,
      particleDensity: 1.0,
      mouseParallax: 1.25,
    },
    enabledModIds: ["mod-liquid-chrome-rim"],
    enabledWidgetIds: ["widget-analog-clock"],
    builtin: true,
  },

  // ─── CREATIVE & FUTURISTIC VARIANTS ─────────────────────────────────
  {
    id: "cyberpunk-2099",
    name: "Night City 2099 · 3D HUD",
    family: "creative",
    tagline: "Mégalopole 3D WebGPU, décorateur Cyber HUD laser, CRT scanlines, bordures RGB & EQ néon",
    emoji: "⚡",
    swatches: ["#f43f5e", "#22d3ee", "#10b981"],
    baseOsTheme: "cyberpunk-neon",
    baseShader: "cyber-grid",
    activeShaderModId: "shader-matrix-rain",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Night City 2099",
      glassRgb: "10, 8, 22",
      elevatedRgb: "16, 10, 32",
      barRgb: "8, 6, 18",
      dockRgb: "12, 9, 26",
      glassOpacity: 0.82,
      blurPx: 18,
      borderColor: "rgba(34, 211, 238, 0.32)",
      activeBorderColor: "rgba(244, 63, 94, 0.78)",
      accentPrimary: "#f43f5e",
      accentSecondary: "#22d3ee",
      windowGlow: "rgba(244, 63, 94, 0.44)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "cyber-hud",
      buttonPosition: "right",
      radiusPx: 6,
      borderWidthPx: 1,
      titlebarHeightPx: 34,
      titleAlign: "left",
      titlebarAccentBar: true,
      activeGlowPx: 58,
      unfocusedOpacity: 0.88,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "cyber-rail",
      dockRadiusPx: 10,
      topBarStyle: "glass",
      brandLabel: "CYBER//OS 2099",
      showStockWidgets: false,
    },
    desktop3d: {
      enabled: true,
      layout: "studio-desk",
      scene: "earth-orbit",
      spatialWindows: true,
      interactiveOrbit: true,
      cameraSpeed: 0.85,
      bloomIntensity: 1.3,
      particleDensity: 1.15,
      mouseParallax: 1.15,
    },
    enabledModIds: ["mod-crt-scanlines", "mod-rgb-chroma-borders", "mod-neon-hud-type"],
    enabledWidgetIds: ["widget-live-radar", "widget-cyber-eq", "widget-matrix-ticker"],
    builtin: true,
  },
  {
    id: "brutalist-swiss",
    name: "Swiss Mono · Teenage Eng.",
    family: "creative",
    tagline: "Design industriel noir mat, orange signal #ff4d00, grille précise WGSL, Horloge & Pomodoro",
    emoji: "🟧",
    swatches: ["#ff4d00", "#e4e4e7", "#27272a"],
    baseOsTheme: "warm-amber",
    baseShader: "solar-ember",
    activeShaderModId: "shader-swiss-matrix",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Swiss Industrial",
      glassRgb: "16, 16, 18",
      elevatedRgb: "22, 22, 25",
      barRgb: "12, 12, 14",
      dockRgb: "18, 18, 21",
      glassOpacity: 0.94,
      blurPx: 10,
      borderColor: "rgba(255, 255, 255, 0.16)",
      activeBorderColor: "rgba(255, 77, 0, 0.85)",
      accentPrimary: "#ff4d00",
      accentSecondary: "#fafafa",
      windowGlow: "rgba(255, 77, 0, 0.24)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "minimal-swiss",
      buttonPosition: "right",
      radiusPx: 4,
      borderWidthPx: 1,
      titlebarHeightPx: 32,
      titleAlign: "left",
      titlebarAccentBar: true,
      activeGlowPx: 20,
      unfocusedOpacity: 0.92,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "minimal-pill",
      dockRadiusPx: 10,
      topBarStyle: "minimal",
      brandLabel: "UK-01 // SWISS",
      showStockWidgets: false,
    },
    enabledModIds: ["mod-compact-tiling"],
    enabledWidgetIds: ["widget-analog-clock", "widget-pomodoro"],
    builtin: true,
  },
  {
    id: "zen-tokyo-bonsai",
    name: "Kyoto Zen · 3D Sanctuary",
    family: "creative",
    tagline: "Lanternes de cristal 3D sur eau miroir, fenêtres flottantes douces, Orbe respiration & Pomodoro",
    emoji: "🪷",
    swatches: ["#14b8a6", "#f472b6", "#818cf8"],
    baseOsTheme: "nordic-frost",
    baseShader: "nordic-borealis",
    activeShaderModId: "shader-zen-ocean",
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Kyoto Zen",
      glassRgb: "11, 20, 26",
      elevatedRgb: "16, 28, 36",
      barRgb: "9, 17, 22",
      dockRgb: "13, 24, 31",
      glassOpacity: 0.68,
      blurPx: 34,
      borderColor: "rgba(153, 246, 228, 0.18)",
      activeBorderColor: "rgba(94, 234, 212, 0.4)",
      accentPrimary: "#14b8a6",
      accentSecondary: "#f472b6",
      windowGlow: "rgba(20, 184, 166, 0.28)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "floating-zen",
      buttonPosition: "left",
      radiusPx: 24,
      borderWidthPx: 1,
      titlebarHeightPx: 38,
      titleAlign: "center",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      activeGlowPx: 44,
      unfocusedOpacity: 0.9,
    },
    shell: {
      ...DEFAULT_SHELL,
      taskbarMode: "dock",
      dockStyle: "minimal-pill",
      dockRadiusPx: 28,
      topBarStyle: "floating-pills",
      brandLabel: "KyotoOS",
      showStockWidgets: false,
    },
    desktop3d: {
      enabled: true,
      layout: "gallery-ring",
      scene: "ocean-sunset",
      spatialWindows: true,
      interactiveOrbit: true,
      cameraSpeed: 0.6,
      bloomIntensity: 1.0,
      particleDensity: 1.1,
      mouseParallax: 1.0,
    },
    enabledModIds: ["mod-cinematic-vignette"],
    enabledWidgetIds: ["widget-zen-orb", "widget-pomodoro"],
    builtin: true,
  },
];

function createDefaultState(): ModState {
  return {
    wallpaperMode: "horizon",
    activeVariantId: "horizon",
    theme: { ...BUILTIN_VARIANTS[0]!.theme },
    decorator: { ...DEFAULT_DECORATOR },
    shell: { ...BUILTIN_VARIANTS[0]!.shell },
    desktop3d: { ...DEFAULT_DESKTOP_3D },
    fx: { ...DEFAULT_WINDOW_FX },
    eyeCandy: { ...DEFAULT_EYE_CANDY, hotCorners: { ...DEFAULT_EYE_CANDY.hotCorners } },
    activeBackdropImageId: null,
    customBackdropImageUrl: "",
    activeShaderModId: null,
    shaderCompileError: null,
    mods: BUILTIN_MODS.map((m) => ({ ...m })),
    shaders: BUILTIN_SHADERS.map((s) => ({ ...s })),
    widgets: BUILTIN_WIDGETS.map((w) => ({ ...w })),
    variants: BUILTIN_VARIANTS.map((v) => ({ ...v })),
    userCss: "",
  };
}

function mergeById<T extends { readonly id: string }>(builtins: readonly T[], saved?: readonly T[]): T[] {
  if (!Array.isArray(saved) || saved.length === 0) return builtins.map((b) => ({ ...b }));
  const map = new Map<string, T>();
  for (const b of builtins) map.set(b.id, { ...b });
  for (const item of saved) {
    if (item && typeof item.id === "string") {
      const base = map.get(item.id);
      map.set(item.id, base ? { ...base, ...item } : item);
    }
  }
  return Array.from(map.values());
}

const VALID_SCENES = new Set<Desktop3dSceneKind>([
  "ocean-sunset",
  "alpine-fjord",
  "earth-orbit",
  "jupiter-orbit",
  "lunar-horizon",
  "aurora-fjord",
]);

const VALID_HDRIS = new Set<HdriPresetId>([
  "auto",
  "venice-4k",
  "alpine-4k",
  "night-4k",
  "clouds-4k",
  "twilight-4k",
  "clear-sky-4k",
  "space-void",
  "custom",
]);

function normalizeDesktop3d(raw?: Partial<Desktop3dModConfig>): Desktop3dModConfig {
  const merged = { ...DEFAULT_DESKTOP_3D, ...(raw ?? {}) };
  const scene = VALID_SCENES.has(merged.scene) ? merged.scene : "ocean-sunset";
  const hdriPreset = VALID_HDRIS.has(merged.hdriPreset) ? merged.hdriPreset : "auto";
  return { ...merged, scene, hdriPreset };
}

function loadModState(): ModState {
  const def = createDefaultState();
  if (typeof localStorage === "undefined") return def;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<ModState>;
    return {
      activeVariantId: typeof p.activeVariantId === "string" ? p.activeVariantId : def.activeVariantId,
      wallpaperMode: p.wallpaperMode === "horizon" ? "horizon"
        : p.wallpaperMode === "system" || p.activeBackdropImageId || p.activeShaderModId ? "system" : "horizon",
      theme: { ...def.theme, ...(p.theme ?? {}) },
      decorator: { ...def.decorator, ...(p.decorator ?? {}) },
      shell: { ...def.shell, ...(p.shell ?? {}) },
      desktop3d: normalizeDesktop3d(p.desktop3d),
      fx: { ...def.fx, ...(p.fx ?? {}) },
      eyeCandy: {
        ...def.eyeCandy,
        ...(p.eyeCandy ?? {}),
        hotCorners: { ...def.eyeCandy.hotCorners, ...(p.eyeCandy?.hotCorners ?? {}) },
      },
      activeBackdropImageId: typeof p.activeBackdropImageId === "string" ? p.activeBackdropImageId : null,
      customBackdropImageUrl: typeof p.customBackdropImageUrl === "string" ? p.customBackdropImageUrl : "",
      activeShaderModId: typeof p.activeShaderModId === "string" ? p.activeShaderModId : null,
      shaderCompileError: null,
      mods: mergeById(BUILTIN_MODS, p.mods),
      shaders: mergeById(BUILTIN_SHADERS, p.shaders),
      widgets: mergeById(BUILTIN_WIDGETS, p.widgets),
      variants: mergeById(BUILTIN_VARIANTS, p.variants),
      userCss: typeof p.userCss === "string" ? p.userCss : "",
    };
  } catch {
    return def;
  }
}

class ModEngineStore {
  private state: ModState = loadModState();
  private listeners = new Set<() => void>();
  private appearanceBridge?: {
    read: () => Pick<OsVariant, "baseOsTheme" | "baseShader">;
    apply: (variant: Pick<OsVariant, "baseOsTheme" | "baseShader">) => void;
  };

  public bindBaseAppearance(bridge: NonNullable<ModEngineStore["appearanceBridge"]>): () => void {
    this.appearanceBridge = bridge;
    return () => {
      if (this.appearanceBridge === bridge) this.appearanceBridge = undefined;
    };
  }

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): ModState => this.state;

  private emit(): void {
    this.persist();
    this.applyDomOverrides();
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const toSave = { ...this.state, shaderCompileError: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore storage quota
    }
  }

  private setState(updater: (prev: ModState) => ModState): void {
    this.state = updater(this.state);
    this.emit();
  }

  /** Apply all active Theme CSS variables, Decorator vars, and Custom CSS Mods live to the DOM. */
  public applyDomOverrides(): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const s = this.state;

    if (s.theme.enabled) {
      const op = Math.max(0.4, Math.min(0.99, s.theme.glassOpacity));
      const elOp = Math.min(0.99, op + 0.06);
      root.style.setProperty("--glass-bg", `rgba(${s.theme.glassRgb}, ${op.toFixed(2)})`);
      root.style.setProperty("--glass-bg-elevated", `rgba(${s.theme.elevatedRgb}, ${elOp.toFixed(2)})`);
      root.style.setProperty("--glass-bar-bg", `rgba(${s.theme.barRgb}, ${Math.min(0.96, op + 0.05).toFixed(2)})`);
      root.style.setProperty("--glass-dock-bg", `rgba(${s.theme.dockRgb}, ${Math.min(0.96, op + 0.04).toFixed(2)})`);
      root.style.setProperty("--glass-blur", `${Math.max(0, Math.min(56, Math.round(s.theme.blurPx)))}px`);
      root.style.setProperty("--glass-border", s.theme.borderColor);
      root.style.setProperty("--glass-border-active", s.theme.activeBorderColor);
      root.style.setProperty("--accent-primary", s.theme.accentPrimary);
      root.style.setProperty("--accent-cyan", s.theme.accentSecondary);
      root.style.setProperty("--window-glow", s.theme.windowGlow);
      root.style.setProperty("--font-sans", s.theme.fontSans);
      root.style.setProperty("--font-mono", s.theme.fontMono);
      root.style.setProperty("--wallpaper-fallback-bg", s.theme.fallbackBg);
    }

    root.dataset.osVariant = s.activeVariantId;
    root.dataset.windowDecorator = s.decorator.style;
    root.dataset.dockStyle = s.shell.dockStyle;
    root.dataset.taskbarMode = s.shell.taskbarMode;
    root.dataset.topbarStyle = s.shell.topBarStyle;
    root.dataset.colorProfile = s.eyeCandy.colorProfile;
    root.style.setProperty(
      "--os-motion-scale",
      Math.max(0.3, Math.min(2.0, s.eyeCandy.motionSpeed || 1)).toFixed(2)
    );

    const cssParts: string[] = [];
    for (const mod of s.mods) {
      if (mod.enabled && mod.css && mod.css.trim()) {
        let compiled = mod.css;
        if (mod.params && mod.params.length > 0) {
          for (const spec of mod.params) {
            const val = mod.paramValues?.[spec.key] ?? spec.defaultValue;
            compiled = compiled.split(`{{${spec.key}}}`).join(String(val));
          }
        }
        cssParts.push(`/* Mod: ${mod.name} (${mod.id}) */\n${compiled}`);
      }
    }
    if (s.userCss.trim()) {
      cssParts.push(`/* User Custom CSS */\n${s.userCss}`);
    }
    let styleEl = document.getElementById("unkernelos-mod-css") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "unkernelos-mod-css";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssParts.join("\n\n");
  }

  public setTheme(patch: Partial<CustomThemeTokens>): void {
    this.setState((s) => ({ ...s, theme: { ...s.theme, ...patch } }));
  }

  public setDecorator(patch: Partial<DecoratorModConfig>): void {
    wmStore.setHorizonEnabled(false);
    this.setState((s) => ({ ...s, decorator: { ...s.decorator, ...patch } }));
  }

  public setShell(patch: Partial<ShellModConfig>): void {
    if (Object.keys(patch).some((key) => key !== "showStockWidgets"))
      wmStore.setHorizonEnabled(false);
    this.setState((s) => {
      const nextShell: ShellModConfig = { ...s.shell, ...patch };
      // Keep Dock & Taskbar coherent when toggling taskbarMode directly from Settings / Mod Studio
      if (patch.taskbarMode && patch.dockStyle === undefined) {
        if (
          (patch.taskbarMode === "dock" || patch.taskbarMode === "ios-springboard") &&
          nextShell.dockStyle === "hidden"
        ) {
          return { ...s, shell: { ...nextShell, dockStyle: "floating-glass" } };
        }
      }
      return { ...s, shell: nextShell };
    });
  }

  public setDesktop3d(patch: Partial<Desktop3dModConfig>): void {
    if (patch.enabled) wmStore.setHorizonEnabled(false);
    this.setState((s) => ({ ...s, desktop3d: { ...s.desktop3d, ...patch } }));
  }

  public setFx(patch: Partial<WindowFxConfig>): void {
    wmStore.setHorizonEnabled(false);
    this.setState((s) => ({ ...s, fx: { ...s.fx, ...patch } }));
  }

  public setEyeCandy(patch: Partial<EyeCandyConfig>): void {
    this.setState((s) => ({
      ...s,
      eyeCandy: {
        ...s.eyeCandy,
        ...patch,
        hotCorners: patch.hotCorners
          ? { ...s.eyeCandy.hotCorners, ...patch.hotCorners }
          : s.eyeCandy.hotCorners,
      },
    }));
  }

  public configureMod(id: string, paramPatch: Record<string, number | string>): OsMod | null {
    const exists = this.state.mods.some((m) => m.id === id);
    if (!exists) return null;
    this.setState((s) => ({
      ...s,
      mods: s.mods.map((m) =>
        m.id === id ? { ...m, paramValues: { ...(m.paramValues ?? {}), ...paramPatch } } : m
      ),
    }));
    return this.state.mods.find((m) => m.id === id) ?? null;
  }

  public setBackdropImage(id: string | null, customUrl?: string): void {
    this.setState((s) => ({
      ...s,
      wallpaperMode: "system",
      activeBackdropImageId: id,
      customBackdropImageUrl: customUrl !== undefined ? customUrl : s.customBackdropImageUrl,
    }));
  }

  public setUserCss(css: string): void {
    this.setState((s) => ({ ...s, userCss: css }));
  }

  public setActiveShaderMod(id: string | null): void {
    this.setState((s) => ({ ...s, wallpaperMode: "system", activeBackdropImageId: null, activeShaderModId: id, shaderCompileError: null }));
  }

  public setWallpaperMode(wallpaperMode: "horizon" | "system"): void {
    this.setState((s) => ({ ...s, wallpaperMode }));
  }

  public setShaderCompileError(err: string | null): void {
    this.state = { ...this.state, shaderCompileError: err };
    for (const fn of this.listeners) fn();
  }

  public upsertShader(shader: CustomShaderMod, activate = false): CustomShaderMod {
    this.setState((s) => {
      const idx = s.shaders.findIndex((x) => x.id === shader.id);
      const next =
        idx >= 0
          ? s.shaders.map((x, i) => (i === idx ? { ...x, ...shader } : x))
          : [shader, ...s.shaders];
      return {
        ...s,
        shaders: next,
        activeShaderModId: activate ? shader.id : s.activeShaderModId,
        activeBackdropImageId: activate ? null : s.activeBackdropImageId,
        wallpaperMode: activate ? "system" : s.wallpaperMode,
        shaderCompileError: activate ? null : s.shaderCompileError,
      };
    });
    return shader;
  }

  public deleteShader(id: string): boolean {
    const exists = this.state.shaders.some((x) => x.id === id && !x.builtin);
    if (!exists) return false;
    this.setState((s) => ({
      ...s,
      shaders: s.shaders.filter((x) => x.id !== id),
      activeShaderModId: s.activeShaderModId === id ? null : s.activeShaderModId,
    }));
    return true;
  }

  public toggleMod(id: string, forceEnabled?: boolean): OsMod | null {
    const target = this.state.mods.find((m) => m.id === id);
    if (!target) return null;
    const nextEnabled = forceEnabled ?? !target.enabled;
    if (nextEnabled && (target.decoratorPatch || target.shellPatch))
      wmStore.setHorizonEnabled(false);
    this.setState((s) => {
      const mods = s.mods.map((m) => (m.id === id ? { ...m, enabled: nextEnabled } : m));
      let next: ModState = { ...s, mods };
      if (nextEnabled) {
        if (target.themePatch) next = { ...next, theme: { ...next.theme, ...target.themePatch } };
        if (target.decoratorPatch) next = { ...next, decorator: { ...next.decorator, ...target.decoratorPatch } };
        if (target.shellPatch) next = { ...next, shell: { ...next.shell, ...target.shellPatch } };
        if (target.shaderId) next = { ...next, wallpaperMode: "system", activeBackdropImageId: null, activeShaderModId: target.shaderId };
        if (target.widgetId) {
          next = {
            ...next,
            widgets: next.widgets.map((w) => (w.id === target.widgetId ? { ...w, enabled: true } : w)),
          };
        }
      }
      return next;
    });
    return this.state.mods.find((m) => m.id === id) ?? null;
  }

  public upsertMod(mod: OsMod): OsMod {
    this.setState((s) => {
      const idx = s.mods.findIndex((m) => m.id === mod.id);
      const mods =
        idx >= 0
          ? s.mods.map((m, i) => (i === idx ? { ...m, ...mod } : m))
          : [mod, ...s.mods];
      return { ...s, mods };
    });
    return mod;
  }

  public uninstallMod(id: string): boolean {
    const target = this.state.mods.find((m) => m.id === id);
    if (!target) return false;
    this.setState((s) => ({ ...s, mods: s.mods.filter((m) => m.id !== id) }));
    return true;
  }

  public upsertWidget(widget: CustomDesktopWidget): CustomDesktopWidget {
    this.setState((s) => {
      const idx = s.widgets.findIndex((w) => w.id === widget.id);
      const widgets =
        idx >= 0
          ? s.widgets.map((w, i) => (i === idx ? { ...w, ...widget } : w))
          : [widget, ...s.widgets];
      return { ...s, widgets };
    });
    return widget;
  }

  public updateWidget(id: string, patch: Partial<CustomDesktopWidget>): void {
    this.setState((s) => ({
      ...s,
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  }

  public removeWidget(id: string): boolean {
    const exists = this.state.widgets.some((w) => w.id === id);
    if (!exists) return false;
    this.setState((s) => ({ ...s, widgets: s.widgets.filter((w) => w.id !== id) }));
    return true;
  }

  public applyVariant(variantId: string): OsVariant | null {
    const v = this.state.variants.find((x) => x.id === variantId);
    if (!v) return null;
    wmStore.setHorizonEnabled(v.desktopMode === "horizon");
    const modSet = new Set(v.enabledModIds);
    const widgetSet = new Set(v.enabledWidgetIds);
    this.setState((s) => ({
      ...s,
      activeVariantId: v.id,
      wallpaperMode: v.wallpaperMode ?? (v.desktopMode === "horizon" ? "horizon" : "system"),
      activeBackdropImageId: v.activeBackdropImageId ?? null,
      customBackdropImageUrl: v.customBackdropImageUrl ?? s.customBackdropImageUrl,
      theme: { ...v.theme },
      decorator: { ...v.decorator },
      shell: { ...v.shell },
      desktop3d: v.desktop3d
        ? { ...DEFAULT_DESKTOP_3D, ...v.desktop3d }
        : { ...DEFAULT_DESKTOP_3D, enabled: false },
      fx: v.fx
        ? { ...DEFAULT_WINDOW_FX, ...v.fx }
        : {
            ...DEFAULT_WINDOW_FX,
            wobblyDrag: v.shell.compizWobbly,
            burnClose: v.shell.compizWobbly,
            chromaBorder: v.enabledModIds.includes("mod-rgb-chroma-borders"),
          },
      activeShaderModId: v.activeShaderModId,
      shaderCompileError: null,
      mods: s.mods.map((m) => ({ ...m, enabled: modSet.has(m.id) })),
      widgets: s.widgets.map((w) => ({ ...w, enabled: widgetSet.has(w.id) })),
    }));
    this.appearanceBridge?.apply(v);
    return v;
  }

  public saveCurrentAsVariant(id: string, name: string, tagline: string, emoji = "✨"): OsVariant {
    const s = this.state;
    const variant: OsVariant = {
      id,
      ...this.appearanceBridge?.read(),
      desktopMode: wmStore.getSnapshot().horizonEnabled ? "horizon" : "classic",
      wallpaperMode: s.wallpaperMode,
      activeBackdropImageId: s.activeBackdropImageId,
      customBackdropImageUrl: s.customBackdropImageUrl,
      name,
      family: "creative",
      tagline,
      emoji,
      swatches: [s.theme.accentPrimary, s.theme.accentSecondary, "#ffffff"],
      activeShaderModId: s.activeShaderModId,
      theme: { ...s.theme },
      decorator: { ...s.decorator },
      shell: { ...s.shell },
      desktop3d: { ...s.desktop3d },
      enabledModIds: s.mods.filter((m) => m.enabled).map((m) => m.id),
      enabledWidgetIds: s.widgets.filter((w) => w.enabled).map((w) => w.id),
      builtin: false,
    };
    this.setState((prev) => {
      const idx = prev.variants.findIndex((x) => x.id === id);
      const variants =
        idx >= 0
          ? prev.variants.map((x, i) => (i === idx ? variant : x))
          : [...prev.variants, variant];
      return { ...prev, activeVariantId: id, variants };
    });
    return variant;
  }

  private reactiveBundleHooks: {
    exportConfig: () => unknown;
    importConfig: (data: unknown) => void;
  } | null = null;

  public attachReactiveBundleHooks(hooks: {
    exportConfig: () => unknown;
    importConfig: (data: unknown) => void;
  }): void {
    this.reactiveBundleHooks = hooks;
  }

  public exportBundleJson(): string {
    return JSON.stringify(
      {
        schema: "unkernelos-mod-pack/v3",
        exportedAt: new Date().toISOString(),
        activeVariantId: this.state.activeVariantId,
        ...this.appearanceBridge?.read(),
        desktopMode: wmStore.getSnapshot().horizonEnabled ? "horizon" : "classic",
        wallpaperMode: this.state.wallpaperMode,
        theme: this.state.theme,
        decorator: this.state.decorator,
        shell: this.state.shell,
        desktop3d: this.state.desktop3d,
        fx: this.state.fx,
        eyeCandy: this.state.eyeCandy,
        activeBackdropImageId: this.state.activeBackdropImageId,
        customBackdropImageUrl: this.state.customBackdropImageUrl,
        activeShaderModId: this.state.activeShaderModId,
        userCss: this.state.userCss,
        mods: this.state.mods,
        shaders: this.state.shaders,
        widgets: this.state.widgets,
        variants: this.state.variants.filter((v) => !v.builtin),
        reactive: this.reactiveBundleHooks?.exportConfig(),
      },
      null,
      2
    );
  }

  public importBundleJson(jsonText: string): { ok: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonText) as Partial<ModState> & {
        reactive?: unknown; desktopMode?: "horizon" | "classic";
      } & Pick<OsVariant, "baseOsTheme" | "baseShader">;
      this.setState((s) => ({
        ...s,
        activeVariantId: data.activeVariantId ?? s.activeVariantId,
        wallpaperMode: data.wallpaperMode === "horizon" || data.wallpaperMode === "system" ? data.wallpaperMode : "system",
        theme: data.theme ? { ...s.theme, ...data.theme } : s.theme,
        decorator: data.decorator ? { ...s.decorator, ...data.decorator } : s.decorator,
        shell: data.shell ? { ...s.shell, ...data.shell } : s.shell,
        desktop3d: data.desktop3d ? normalizeDesktop3d({ ...s.desktop3d, ...data.desktop3d }) : s.desktop3d,
        fx: data.fx ? { ...s.fx, ...data.fx } : s.fx,
        eyeCandy: data.eyeCandy
          ? {
              ...s.eyeCandy,
              ...data.eyeCandy,
              hotCorners: { ...s.eyeCandy.hotCorners, ...(data.eyeCandy.hotCorners ?? {}) },
            }
          : s.eyeCandy,
        activeBackdropImageId:
          data.activeBackdropImageId !== undefined ? data.activeBackdropImageId : s.activeBackdropImageId,
        customBackdropImageUrl:
          typeof data.customBackdropImageUrl === "string" ? data.customBackdropImageUrl : s.customBackdropImageUrl,
        activeShaderModId:
          data.activeShaderModId !== undefined ? data.activeShaderModId : s.activeShaderModId,
        userCss: typeof data.userCss === "string" ? data.userCss : s.userCss,
        mods: data.mods ? mergeById(BUILTIN_MODS, data.mods) : s.mods,
        shaders: data.shaders ? mergeById(BUILTIN_SHADERS, data.shaders) : s.shaders,
        widgets: data.widgets ? mergeById(BUILTIN_WIDGETS, data.widgets) : s.widgets,
        variants: data.variants ? mergeById(BUILTIN_VARIANTS, data.variants) : s.variants,
      }));
      if (data.reactive && this.reactiveBundleHooks) {
        this.reactiveBundleHooks.importConfig(data.reactive);
      }
      if (data.desktopMode === "horizon" || data.desktopMode === "classic")
        wmStore.setHorizonEnabled(data.desktopMode === "horizon");
      else if (data.activeVariantId)
        wmStore.setHorizonEnabled(this.state.variants.find((v) => v.id === data.activeVariantId)?.desktopMode === "horizon");
      if (data.baseOsTheme || data.baseShader) this.appearanceBridge?.apply(data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public resetAll(): void {
    wmStore.setHorizonEnabled(true);
    this.state = createDefaultState();
    this.emit();
  }
}

export const modStore = new ModEngineStore();

export function useMods(): ModState {
  return useSyncExternalStore(modStore.subscribe, modStore.getSnapshot);
}
