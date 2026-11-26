import type { OsThemeId, WallpaperShaderId } from "./schema.ts";

export interface OsThemePreset {
  readonly id: OsThemeId;
  readonly name: string;
  readonly tagline: string;
  readonly defaultShader: WallpaperShaderId;
  readonly swatches: readonly [string, string, string];
  readonly glassRgb: string; // e.g. "13, 15, 22"
  readonly elevatedRgb: string;
  readonly barRgb: string;
  readonly dockRgb: string;
  readonly borderAlpha: number;
  readonly activeBorderAlpha: number;
  readonly accentPrimary: string;
  readonly accentSecondary: string;
  readonly glowRgba: string;
  readonly fallbackBg: string;
}

export const OS_THEMES: Record<OsThemeId, OsThemePreset> = {
  "obsidian-aurora": {
    id: "obsidian-aurora",
    name: "Obsidian Aurora",
    tagline: "Smoked volcanic glass with indigo, violet & cyan aurora glow",
    defaultShader: "aurora",
    swatches: ["#8b5cf6", "#22d3ee", "#ec4899"],
    glassRgb: "12, 14, 22",
    elevatedRgb: "17, 20, 31",
    barRgb: "9, 11, 18",
    dockRgb: "14, 17, 27",
    borderAlpha: 0.1,
    activeBorderAlpha: 0.2,
    accentPrimary: "#8b5cf6",
    accentSecondary: "#22d3ee",
    glowRgba: "rgba(139, 92, 246, 0.24)",
    fallbackBg:
      "radial-gradient(ellipse 80% 60% at 15% 15%, rgba(99,102,241,0.28), transparent 55%), radial-gradient(ellipse 70% 55% at 85% 20%, rgba(14,165,233,0.22), transparent 50%), radial-gradient(ellipse 75% 65% at 50% 90%, rgba(217,70,239,0.18), transparent 55%), linear-gradient(160deg, #06070c 0%, #0b0e18 48%, #070911 100%)",
  },
  "liquid-glass": {
    id: "liquid-glass",
    name: "Liquid Glass",
    tagline: "macOS-inspired refractive sapphire crystal with luminous specular rims",
    defaultShader: "liquid-prism",
    swatches: ["#38bdf8", "#818cf8", "#e0f2fe"],
    glassRgb: "18, 25, 42",
    elevatedRgb: "23, 32, 54",
    barRgb: "14, 20, 36",
    dockRgb: "22, 31, 52",
    borderAlpha: 0.17,
    activeBorderAlpha: 0.3,
    accentPrimary: "#38bdf8",
    accentSecondary: "#818cf8",
    glowRgba: "rgba(56, 189, 248, 0.26)",
    fallbackBg:
      "radial-gradient(ellipse 80% 65% at 20% 20%, rgba(56,189,248,0.30), transparent 55%), radial-gradient(ellipse 70% 60% at 82% 25%, rgba(129,140,248,0.28), transparent 55%), radial-gradient(ellipse 65% 55% at 50% 85%, rgba(192,132,252,0.20), transparent 55%), linear-gradient(160deg, #070c18 0%, #0d162a 52%, #081020 100%)",
  },
  "cyberpunk-neon": {
    id: "cyberpunk-neon",
    name: "Cyberpunk Neon",
    tagline: "Synthwave midnight glass laced with electric magenta & laser cyan",
    defaultShader: "cyber-grid",
    swatches: ["#f43f5e", "#06b6d4", "#eab308"],
    glassRgb: "15, 10, 24",
    elevatedRgb: "22, 13, 34",
    barRgb: "12, 8, 20",
    dockRgb: "19, 12, 31",
    borderAlpha: 0.16,
    activeBorderAlpha: 0.32,
    accentPrimary: "#f43f5e",
    accentSecondary: "#06b6d4",
    glowRgba: "rgba(244, 63, 94, 0.28)",
    fallbackBg:
      "radial-gradient(ellipse 80% 55% at 20% 18%, rgba(244,63,94,0.28), transparent 55%), radial-gradient(ellipse 75% 55% at 82% 22%, rgba(6,182,212,0.25), transparent 55%), radial-gradient(ellipse 80% 50% at 50% 95%, rgba(168,85,247,0.25), transparent 55%), linear-gradient(160deg, #090510 0%, #12081f 50%, #070914 100%)",
  },
  "nordic-frost": {
    id: "nordic-frost",
    name: "Nordic Frost",
    tagline: "Serene polar slate with glacier frost & borealis emerald accents",
    defaultShader: "nordic-borealis",
    swatches: ["#88c0d0", "#5e81ac", "#a3be8c"],
    glassRgb: "20, 26, 36",
    elevatedRgb: "26, 34, 47",
    barRgb: "17, 22, 31",
    dockRgb: "22, 29, 41",
    borderAlpha: 0.13,
    activeBorderAlpha: 0.24,
    accentPrimary: "#88c0d0",
    accentSecondary: "#a3be8c",
    glowRgba: "rgba(136, 192, 208, 0.22)",
    fallbackBg:
      "radial-gradient(ellipse 80% 60% at 25% 20%, rgba(136,192,208,0.24), transparent 55%), radial-gradient(ellipse 70% 55% at 80% 25%, rgba(163,190,140,0.18), transparent 55%), radial-gradient(ellipse 75% 60% at 50% 88%, rgba(94,129,172,0.22), transparent 55%), linear-gradient(160deg, #0d1118 0%, #141b26 50%, #0e141e 100%)",
  },
  "warm-amber": {
    id: "warm-amber",
    name: "Warm Amber",
    tagline: "Architectural espresso obsidian with molten gold & copper sheen",
    defaultShader: "solar-ember",
    swatches: ["#f59e0b", "#fb7185", "#fde68a"],
    glassRgb: "22, 16, 14",
    elevatedRgb: "30, 22, 18",
    barRgb: "18, 13, 11",
    dockRgb: "26, 19, 16",
    borderAlpha: 0.13,
    activeBorderAlpha: 0.26,
    accentPrimary: "#f59e0b",
    accentSecondary: "#fb7185",
    glowRgba: "rgba(245, 158, 11, 0.24)",
    fallbackBg:
      "radial-gradient(ellipse 80% 60% at 18% 22%, rgba(245,158,11,0.24), transparent 55%), radial-gradient(ellipse 70% 55% at 82% 28%, rgba(251,113,133,0.18), transparent 55%), radial-gradient(ellipse 75% 60% at 50% 90%, rgba(217,119,6,0.20), transparent 55%), linear-gradient(160deg, #0d0907 0%, #17100c 50%, #0c0806 100%)",
  },
};

export interface WallpaperShaderMeta {
  readonly id: WallpaperShaderId;
  readonly name: string;
  readonly description: string;
  readonly modeIndex: number;
  readonly previewGradient: string;
}

export const WALLPAPER_SHADERS: Record<WallpaperShaderId, WallpaperShaderMeta> = {
  aurora: {
    id: "aurora",
    name: "Aurora Mesh",
    description: "Flowing violet & cyan aurora blobs over micro-architectural grid",
    modeIndex: 0,
    previewGradient: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 45%, #0e7490 100%)",
  },
  "liquid-prism": {
    id: "liquid-prism",
    name: "Liquid Prism",
    description: "Refractive caustic light waves inspired by macOS Liquid Glass",
    modeIndex: 1,
    previewGradient: "linear-gradient(135deg, #0c4a6e 0%, #3730a3 50%, #38bdf8 100%)",
  },
  "cyber-grid": {
    id: "cyber-grid",
    name: "Cyber Horizon",
    description: "3D perspective synthwave horizon grid & pulsing neon sun",
    modeIndex: 2,
    previewGradient: "linear-gradient(135deg, #1e052b 0%, #be123c 55%, #0891b2 100%)",
  },
  "nordic-borealis": {
    id: "nordic-borealis",
    name: "Nordic Borealis",
    description: "Polar curtain ribbons drifting across an arctic starfield",
    modeIndex: 3,
    previewGradient: "linear-gradient(135deg, #0f172a 0%, #115e59 52%, #38bdf8 100%)",
  },
  "solar-ember": {
    id: "solar-ember",
    name: "Solar Ember",
    description: "Volumetric molten amber waves & drifting golden bokeh",
    modeIndex: 4,
    previewGradient: "linear-gradient(135deg, #1c1008 0%, #9a3412 52%, #f59e0b 100%)",
  },
};

export function applyOsThemeToDocument(themeId: OsThemeId, blurPx: number, opacity: number): void {
  if (typeof document === "undefined") return;
  const theme = OS_THEMES[themeId] ?? OS_THEMES["obsidian-aurora"];
  const root = document.documentElement;
  const clampedBlur = Math.max(8, Math.min(48, Math.round(blurPx)));
  const clampedOp = Math.max(0.45, Math.min(0.95, opacity));
  const elevatedOp = Math.min(0.96, clampedOp + 0.1);

  root.dataset.osTheme = theme.id;
  root.style.setProperty("--font-sans", '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif');
  root.style.setProperty("--font-mono", '"JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace');
  root.style.setProperty("--glass-bg", `rgba(${theme.glassRgb}, ${clampedOp.toFixed(2)})`);
  root.style.setProperty("--glass-bg-elevated", `rgba(${theme.elevatedRgb}, ${elevatedOp.toFixed(2)})`);
  root.style.setProperty("--glass-bar-bg", `rgba(${theme.barRgb}, ${Math.min(0.9, clampedOp).toFixed(2)})`);
  root.style.setProperty("--glass-dock-bg", `rgba(${theme.dockRgb}, ${Math.min(0.92, clampedOp + 0.04).toFixed(2)})`);
  root.style.setProperty("--glass-blur", `${clampedBlur}px`);
  root.style.setProperty("--glass-border", `rgba(255, 255, 255, ${theme.borderAlpha})`);
  root.style.setProperty("--glass-border-active", `rgba(255, 255, 255, ${theme.activeBorderAlpha})`);
  root.style.setProperty("--accent-primary", theme.accentPrimary);
  root.style.setProperty("--accent-cyan", theme.accentSecondary);
  root.style.setProperty("--window-glow", theme.glowRgba);
  root.style.setProperty("--wallpaper-fallback-bg", theme.fallbackBg);
}
