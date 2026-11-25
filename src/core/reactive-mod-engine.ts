import { Effect } from "effect";
import { useSyncExternalStore } from "react";
import { modStore, type AmbientParticlesKind } from "./mod-store.ts";
import { appRuntime, VmService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type SignalPrimitive = number | string | boolean;

export interface LiveSignal {
  readonly key: string;
  readonly value: SignalPrimitive;
  readonly numeric: number;
  readonly unit?: string;
  readonly label?: string;
  readonly sourceId: string;
  readonly updatedAt: number;
}

export type DataSourceKind = "shell" | "python" | "bun" | "node" | "http" | "js";

export interface ReactiveDataSource {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly kind: DataSourceKind;
  readonly enabled: boolean;
  readonly intervalMs: number; // >= 500
  readonly outputPrefix: string; // e.g. "weather", "linux", "git", "custom"
  /** Command/script for shell/python/bun/node/js, OR URL for http */
  readonly code: string;
  /** Optional JS expression receiving (raw, json, signals) returning a value or Record<string, SignalPrimitive> */
  readonly parser?: string;
  readonly builtin?: boolean;
  readonly lastRunAt?: number;
  readonly lastDurationMs?: number;
  readonly lastOutput?: string;
  readonly lastError?: string | null;
}

export type BindingTarget =
  | "theme.accentPrimary"
  | "theme.accentSecondary"
  | "theme.blurPx"
  | "theme.glassOpacity"
  | "eyecandy.nightShiftWarmth"
  | "eyecandy.ambientParticles"
  | "eyecandy.ambientParticleDensity"
  | "eyecandy.vignetteStrength"
  | "eyecandy.motionSpeed"
  | "desktop3d.bloomIntensity"
  | "desktop3d.cameraSpeed"
  | "desktop3d.particleDensity"
  | "shell.dockMagStrength"
  | "shell.dockIconScale"
  | "decorator.activeGlowPx"
  | "shader.custom0"
  | "shader.custom1"
  | "shader.custom2"
  | "shader.custom3"
  | "cssVar";

export interface ReactiveBinding {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly target: BindingTarget;
  /** When target === "cssVar", CSS variable name e.g. "--my-glow" */
  readonly cssVarName?: string;
  /** JS expression with helpers: sig(), lerp(), clamp(), mapRange(), lerpColor(), hsl(), smoothstep() */
  readonly expression: string;
  readonly builtin?: boolean;
  readonly lastValue?: string;
  readonly lastError?: string | null;
}

export interface ReactiveScriptMod {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly intervalMs: number; // >= 250
  /** Unrestricted JS body receiving (signals, os, helpers, state) */
  readonly code: string;
  readonly builtin?: boolean;
  readonly lastRunAt?: number;
  readonly lastError?: string | null;
}

export type SurfaceContentType = "html" | "iframe" | "canvas";

export type SurfaceSlot =
  | "wallpaper"
  | "desktop"
  | "overlay"
  | "topbar"
  | "dock"
  | "titlebar"
  | "3d-panel";

export interface Surface3dPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
}

export interface ReactiveSurface {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly contentType: SurfaceContentType;
  readonly slot: SurfaceSlot;
  /** Positioning for desktop / overlay / 3d-panel */
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly zIndex?: number;
  readonly pointerEvents?: "none" | "auto";
  /** HTML content (supports {{signal.key}} interpolation) or iframe srcDoc */
  readonly html?: string;
  /** Optional external URL for iframe */
  readonly iframeUrl?: string;
  /** Optional unrestricted JS script for html: (root, signals, os, helpers) => void */
  readonly script?: string;
  /** 60fps Canvas script for contentType === "canvas": (ctx, canvas, t, signals, os, helpers) => void */
  readonly canvasScript?: string;
  /** Optional 3D world pose when slot === "3d-panel" */
  readonly pose3d?: Surface3dPose;
  readonly builtin?: boolean;
}

export interface ReactiveModState {
  readonly engineEnabled: boolean;
  readonly signals: Record<string, LiveSignal>;
  readonly sources: readonly ReactiveDataSource[];
  readonly bindings: readonly ReactiveBinding[];
  readonly scripts: readonly ReactiveScriptMod[];
  readonly surfaces: readonly ReactiveSurface[];
  readonly customShaderUniforms: readonly [number, number, number, number];
}

/* ─── Reactive Math & Color Helpers (Injected into Expressions & Scripts) ── */

export function clamp(v: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function lerp(a: number, b: number, t: number): number {
  const k = clamp(t, 0, 1);
  return a + (b - a) * k;
}

export function mapRange(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMax === inMin) return outMin;
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    return [
      parseInt(clean[0]! + clean[0]!, 16) || 0,
      parseInt(clean[1]! + clean[1]!, 16) || 0,
      parseInt(clean[2]! + clean[2]!, 16) || 0,
    ];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [139, 92, 246];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function lerpColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  const k = clamp(t, 0, 1);
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const b = Math.round(b1 + (b2 - b1) * k);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function hsl(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) [r, g, b] = [c, x, 0];
  else if (hn < 120) [r, g, b] = [x, c, 0];
  else if (hn < 180) [r, g, b] = [0, c, x];
  else if (hn < 240) [r, g, b] = [0, x, c];
  else if (hn < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const REACTIVE_HELPERS = {
  clamp,
  lerp,
  mapRange,
  smoothstep,
  lerpColor,
  hsl,
};

/* ─── Built-in AAA Data Sources, Bindings, Scripts & Surfaces ────────────── */

export const BUILTIN_DATA_SOURCES: readonly ReactiveDataSource[] = [
  {
    id: "src-weather-live",
    name: "Météo Live (Open-Meteo)",
    emoji: "🌦️",
    description: "Récupère température, vent, pluie et code WMO en temps réel sur internet (Paris par défaut, modifiable).",
    kind: "http",
    enabled: true,
    intervalMs: 180_000,
    outputPrefix: "weather",
    code: "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,precipitation,weather_code,wind_speed_10m,is_day",
    parser: `const c = json?.current || {};
const code = Number(c.weather_code ?? 0);
const isRain = code >= 51 && code <= 82;
const isSnow = code >= 71 && code <= 77;
const label = isSnow ? "Neige" : isRain ? "Pluie" : code >= 95 ? "Orage" : code >= 2 ? "Nuageux" : "Clair";
return {
  temp: Number(c.temperature_2m ?? 18),
  wind: Number(c.wind_speed_10m ?? 8),
  code,
  rain: isRain || isSnow ? Math.max(0.55, Math.min(1, Number(c.precipitation ?? 0.5))) : 0,
  isDay: Number(c.is_day ?? 1),
  label,
};`,
    builtin: true,
  },
  {
    id: "src-linux-proc-python",
    name: "Python3 Télémétrie Linux (/proc)",
    emoji: "🐍",
    description: "Exécute un script Python3 dans unkernel pour lire les vrais compteurs /proc (RAM, Disque, Processus, LoadAvg, Uptime).",
    kind: "python",
    enabled: true,
    intervalMs: 5000,
    outputPrefix: "linux",
    code: `import json, os, shutil
procs = sum(1 for d in os.listdir('/proc') if d.isdigit())
mem = {}
with open('/proc/meminfo') as f:
    for l in f:
        p = l.split()
        if len(p) >= 2: mem[p[0].rstrip(':')] = int(p[1])
tot = max(1, mem.get('MemTotal', 1))
avail = mem.get('MemAvailable', mem.get('MemFree', 0))
ram_pct = round((1.0 - avail / tot) * 100.0, 1)
du = shutil.disk_usage('/')
disk_pct = round((du.used / max(1, du.total)) * 100.0, 1)
load1 = round(os.getloadavg()[0], 2)
with open('/proc/uptime') as f:
    up = round(float(f.read().split()[0]))
print(json.dumps({"procs": procs, "ram": ram_pct, "disk": disk_pct, "load": load1, "uptime": up}))`,
    builtin: true,
  },
  {
    id: "src-git-workspace-sh",
    name: "Shell Git & Workspace Pulse",
    emoji: "🐚",
    description: "Commande sh dans unkernel mesurant le nombre de fichiers, la branche git et les modifications non commitées dans ~/workspace.",
    kind: "shell",
    enabled: false,
    intervalMs: 12_000,
    outputPrefix: "workspace",
    code: `cd /home/user/workspace 2>/dev/null || cd /home/user; FILES=$(find . -maxdepth 3 -type f 2>/dev/null | wc -l); BR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo none); DIRTY=$(git status --porcelain 2>/dev/null | wc -l); printf '{"files":%d,"branch":"%s","dirty":%d}' "$FILES" "$BR" "$DIRTY"`,
    builtin: true,
  },
  {
    id: "src-crypto-http",
    name: "Marché Crypto Live (BTC)",
    emoji: "📈",
    description: "Récupère le prix et la variation 24h du Bitcoin via API publique JSON (pilote couleurs/widgets en direct).",
    kind: "http",
    enabled: false,
    intervalMs: 60_000,
    outputPrefix: "market",
    code: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
    parser: `const b = json?.bitcoin || {};
return {
  btc: Math.round(Number(b.usd ?? 0)),
  btcChange: Number((b.usd_24h_change ?? 0).toFixed(2)),
};`,
    builtin: true,
  },
  {
    id: "src-bun-custom",
    name: "Script Bun Réactif (Template)",
    emoji: "🥟",
    description: "Exemple de script Bun exécuté directement dans la VM Linux unkernel pour calculer des signaux personnalisés.",
    kind: "bun",
    enabled: false,
    intervalMs: 4000,
    outputPrefix: "custom",
    code: `const t = Date.now() / 1000;
const energy = Number((0.5 + 0.5 * Math.sin(t * 0.7)).toFixed(3));
const pulse = Number((0.5 + 0.5 * Math.cos(t * 1.1)).toFixed(3));
console.log(JSON.stringify({ energy, pulse }));`,
    builtin: true,
  },
];

export const BUILTIN_BINDINGS: readonly ReactiveBinding[] = [
  {
    id: "bind-cpu-accent",
    name: "Couleur d'Accent Thermique CPU",
    description: "Passe fluidement du cyan froid (#22d3ee) au rouge plasma (#f43f5e) selon la charge CPU en temps réel.",
    enabled: false,
    target: "theme.accentPrimary",
    expression: "lerpColor('#22d3ee', '#f43f5e', clamp(sig('sys.cpu') / 85, 0, 1))",
    builtin: true,
  },
  {
    id: "bind-circadian-nightshift",
    name: "Night Shift Circadien Automatique",
    description: "Réchauffe automatiquement l'affichage la nuit selon le cycle solaire réel (time.daylight).",
    enabled: false,
    target: "eyecandy.nightShiftWarmth",
    expression: "Math.round((1 - sig('time.daylight')) * 42)",
    builtin: true,
  },
  {
    id: "bind-weather-particles",
    name: "Particules Bureau Liées à la Météo",
    description: "Active pluie, neige ou lucioles nocturnes automatiquement d'après la météo Open-Meteo et l'heure.",
    enabled: false,
    target: "eyecandy.ambientParticles",
    expression:
      "sig('weather.rain') > 0.3 ? (sig('weather.temp') <= 1 ? 'snow' : 'rain') : (sig('time.daylight') < 0.25 ? 'fireflies' : 'none')",
    builtin: true,
  },
  {
    id: "bind-tokens-glow",
    name: "Halo Fenêtres Réactif aux Tokens IA",
    description: "Augmente le halo lumineux des fenêtres au rythme de l'activité et des tokens utilisés par les agents IA.",
    enabled: false,
    target: "decorator.activeGlowPx",
    expression: "Math.round(18 + clamp(sig('agent.tokens') / 25000, 0, 1) * 44)",
    builtin: true,
  },
  {
    id: "bind-shader-custom0",
    name: "Uniform WGSL u.custom0 ← Charge Système",
    description: "Injecte l'énergie combinée CPU+GPU (0..1) dans le uniform WebGPU u.custom0 utilisable dans vos shaders.",
    enabled: true,
    target: "shader.custom0",
    expression: "clamp((sig('sys.cpu') * 0.65 + sig('sys.gpu') * 0.35) / 100, 0, 1)",
    builtin: true,
  },
  {
    id: "bind-3d-bloom-cpu",
    name: "Intensité Bloom 3D ← CPU & Agents",
    description: "Modifie l'éclairage et le bloom de la scène 3D Three.js selon l'activité système et agents.",
    enabled: false,
    target: "desktop3d.bloomIntensity",
    expression: "Number((0.75 + clamp(sig('sys.cpu') / 100, 0, 1) * 0.85 + sig('agent.active') * 0.35).toFixed(2))",
    builtin: true,
  },
];

export const BUILTIN_SCRIPTS: readonly ReactiveScriptMod[] = [
  {
    id: "script-circadian-weather",
    name: "Pilote Circadien & Météo Complet",
    emoji: "🌅",
    description: "Script JS complet qui adapte les 2 couleurs d'accent du thème, le Night Shift et les particules selon l'heure + météo Open-Meteo.",
    enabled: false,
    intervalMs: 4000,
    code: `// Cycle Circadien + Météo Live (accès complet à os.modStore, signals, helpers)
const day = sig("time.daylight", 0.7);
const temp = sig("weather.temp", 18);
const rain = sig("weather.rain", 0);

const primary = rain > 0.3
  ? "#38bdf8"
  : lerpColor("#6366f1", "#f59e0b", smoothstep(0.15, 0.85, day));
const secondary = lerpColor("#22d3ee", "#fb7185", mapRange(temp, -5, 35, 0, 1));

os.modStore.setTheme({
  enabled: true,
  accentPrimary: primary,
  accentSecondary: secondary,
  windowGlow: primary + "55",
});
os.modStore.setEyeCandy({
  nightShiftWarmth: Math.round((1 - day) * 38),
  ambientParticles: rain > 0.3 ? (temp <= 1 ? "snow" : "rain") : day < 0.2 ? "fireflies" : "none",
});`,
    builtin: true,
  },
  {
    id: "script-telemetry-reactor",
    name: "Réacteur Télémétrie Linux & Tokens IA",
    emoji: "⚛️",
    description: "Fait pulser le thème, le halo des fenêtres, la force du Dock et les uniforms shader u.custom1/2 en temps réel selon CPU/RAM/Procs/Tokens.",
    enabled: false,
    intervalMs: 1200,
    code: `const cpu = clamp(sig("sys.cpu", 15) / 100, 0, 1);
const ram = clamp(sig("sys.ram", 30) / 100, 0, 1);
const tokens = clamp(sig("agent.tokens", 0) / 25000, 0, 1);
const energy = clamp(cpu * 0.55 + ram * 0.25 + tokens * 0.4, 0, 1);

os.reactiveEngine.setCustomUniform(1, energy);
os.reactiveEngine.setCustomUniform(2, tokens);
os.modStore.setTheme({
  enabled: true,
  accentPrimary: lerpColor("#22d3ee", "#ec4899", energy),
  accentSecondary: lerpColor("#8b5cf6", "#facc15", tokens),
});
os.modStore.setDecorator({ activeGlowPx: Math.round(16 + energy * 42) });
os.modStore.setShell({ dockMagStrength: Number((0.38 + energy * 0.38).toFixed(2)) });`,
    builtin: true,
  },
  {
    id: "script-custom-dom-lab",
    name: "Labo Libre JS (DOM + Linux + API OS)",
    emoji: "🧪",
    description: "Exemple minimal sans garde-fou montrant comment lire un signal, manipuler le DOM ou appeler unkernel en JS.",
    enabled: false,
    intervalMs: 5000,
    code: `// Accès 100% libre : document, window, os.modStore, os.wmStore, os.execShell, os.call, fetch
state.ticks = (state.ticks || 0) + 1;
const hue = (state.ticks * 18 + sig("sys.cpu", 10) * 2) % 360;
const col = hsl(hue, 88, 62);
os.reactiveEngine.pushSignal("custom.hue", Math.round(hue), { unit: "°", label: "Teinte Script" });
document.documentElement.style.setProperty("--accent-cyan", col);`,
    builtin: true,
  },
];

export const BUILTIN_SURFACES: readonly ReactiveSurface[] = [
  {
    id: "surf-canvas-reactor-bg",
    name: "Fond d'Écran Canvas 2D Réacteur",
    emoji: "🎨",
    description: "Canvas 2D plein écran 60fps derrière les fenêtres : ondes fluides et constellations qui pulsent avec CPU, météo et souris.",
    enabled: false,
    contentType: "canvas",
    slot: "wallpaper",
    pointerEvents: "none",
    canvasScript: `const w = canvas.clientWidth, h = canvas.clientHeight;
const cpu = clamp(sig("sys.cpu", 20) / 100, 0, 1);
const day = sig("time.daylight", 0.5);
const mx = sig("input.mouseX", 0.5) * w;
const my = sig("input.mouseY", 0.5) * h;

ctx.fillStyle = "rgba(6, 9, 18, 0.22)";
ctx.fillRect(0, 0, w, h);

// Circadian + CPU energy aurora ribbons
const rings = 5;
for (let i = 0; i < rings; i++) {
  ctx.beginPath();
  const hue = (195 + i * 28 + cpu * 115 + day * 40) % 360;
  ctx.strokeStyle = \`hsla(\${hue}, 92%, 62%, \${0.16 + cpu * 0.25})\`;
  ctx.lineWidth = 1.5 + cpu * 2.5;
  for (let x = 0; x <= w; x += 18) {
    const nx = x / w;
    const amp = (32 + cpu * 95) * (0.6 + i * 0.14);
    const y = h * (0.28 + i * 0.12)
      + Math.sin(nx * 6.5 + t * (0.9 + cpu * 2.4) + i * 1.1) * amp
      + Math.cos(nx * 12 - t * 1.3 + i) * (amp * 0.28);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Mouse reactive orbital pulse
const grd = ctx.createRadialGradient(mx, my, 4, mx, my, 180 + cpu * 140);
grd.addColorStop(0, \`hsla(\${200 + cpu * 130}, 95%, 65%, 0.22)\`);
grd.addColorStop(1, "rgba(0,0,0,0)");
ctx.fillStyle = grd;
ctx.beginPath();
ctx.arc(mx, my, 180 + cpu * 140, 0, Math.PI * 2);
ctx.fill();`,
    builtin: true,
  },
  {
    id: "surf-hud-telemetry",
    name: "HUD Overlay Télémétrie Live",
    emoji: "🛰️",
    description: "Overlay HTML/CSS flottant en bas à gauche affichant CPU, RAM, Disque, Procs, Météo & Tokens IA en temps réel.",
    enabled: false,
    contentType: "html",
    slot: "overlay",
    x: 18,
    y: 54,
    width: 280,
    pointerEvents: "none",
    html: `<div style="padding:10px 14px;border-radius:16px;background:rgba(8,11,20,0.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.14);box-shadow:0 16px 40px rgba(0,0,0,0.55);font-family:var(--font-mono);font-size:10.5px;color:#e4e4e7;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <span style="color:var(--accent-cyan);font-weight:700;letter-spacing:0.08em;">⚡ REACTIVE HUD</span>
    <span style="color:#a1a1aa;">{{weather.temp}}°C · {{weather.label}}</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;">
    <div style="padding:4px;border-radius:8px;background:rgba(255,255,255,0.05);">
      <div style="color:#71717a;font-size:9px;">CPU</div>
      <div style="color:#38bdf8;font-weight:700;">{{sys.cpu}}%</div>
    </div>
    <div style="padding:4px;border-radius:8px;background:rgba(255,255,255,0.05);">
      <div style="color:#71717a;font-size:9px;">RAM</div>
      <div style="color:#c084fc;font-weight:700;">{{sys.ram}}%</div>
    </div>
    <div style="padding:4px;border-radius:8px;background:rgba(255,255,255,0.05);">
      <div style="color:#71717a;font-size:9px;">PROCS</div>
      <div style="color:#34d399;font-weight:700;">{{sys.procs}}</div>
    </div>
    <div style="padding:4px;border-radius:8px;background:rgba(255,255,255,0.05);">
      <div style="color:#71717a;font-size:9px;">TOKENS</div>
      <div style="color:#fbbf24;font-weight:700;">{{agent.tokens}}</div>
    </div>
  </div>
</div>`,
    builtin: true,
  },
  {
    id: "surf-topbar-weather-pulse",
    name: "Capsule TopBar Météo & CPU",
    emoji: "🌤️",
    description: "Injecte une capsule HTML temps réel directement dans la TopBar de l'OS (météo + CPU + tokens).",
    enabled: false,
    contentType: "html",
    slot: "topbar",
    pointerEvents: "auto",
    html: `<div style="display:flex;align-items:center;gap:6px;padding:0 9px;height:24px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(56,189,248,0.35);font-family:var(--font-mono);font-size:10px;color:#e0f2fe;white-space:nowrap;">
  <span>🌤️ {{weather.temp}}°C</span>
  <span style="opacity:0.35;">·</span>
  <span style="color:#38bdf8;">CPU {{sys.cpu}}%</span>
</div>`,
    builtin: true,
  },
  {
    id: "surf-dock-meter",
    name: "Vu-Mètre Canvas dans le Dock",
    emoji: "📊",
    description: "Mini égaliseur Canvas 60fps CPU/GPU/RAM/Tokens intégré directement à l'intérieur du Dock !",
    enabled: false,
    contentType: "canvas",
    slot: "dock",
    width: 54,
    height: 40,
    pointerEvents: "none",
    canvasScript: `const w = canvas.clientWidth, h = canvas.clientHeight;
ctx.clearRect(0, 0, w, h);
const vals = [
  clamp(sig("sys.cpu", 20) / 100, 0.08, 1),
  clamp(sig("sys.gpu", 25) / 100, 0.08, 1),
  clamp(sig("sys.ram", 30) / 100, 0.08, 1),
  clamp(sig("sys.disk", 15) / 100, 0.08, 1),
  clamp((sig("agent.tokens", 0) % 10000) / 10000 + 0.15, 0.1, 1),
];
const colors = ["#38bdf8", "#a855f7", "#34d399", "#fb923c", "#f43f5e"];
const bw = (w - 14) / vals.length;
vals.forEach((v, i) => {
  const pulse = clamp(v + Math.sin(t * 4 + i * 1.3) * 0.08, 0.1, 1);
  const bh = Math.max(4, (h - 10) * pulse);
  ctx.fillStyle = colors[i];
  ctx.beginPath();
  ctx.roundRect(5 + i * (bw + 2), h - 5 - bh, bw - 1, bh, 3);
  ctx.fill();
});`,
    builtin: true,
  },
  {
    id: "surf-titlebar-badge",
    name: "Badge Barre de Titre Réactif",
    emoji: "🏷️",
    description: "Ajoute un micro-indicateur temps réel dans la barre de titre de la fenêtre active.",
    enabled: false,
    contentType: "html",
    slot: "titlebar",
    pointerEvents: "none",
    html: `<span style="padding:1px 6px;border-radius:999px;background:rgba(34,211,238,0.14);border:1px solid rgba(34,211,238,0.35);font-family:var(--font-mono);font-size:9.5px;color:#67e8f9;white-space:nowrap;">⚡ {{sys.cpu}}% · {{sys.procs}}p</span>`,
    builtin: true,
  },
  {
    id: "surf-3d-holo-board",
    name: "Panneau Holographique 3D Spatial",
    emoji: "🧊",
    description: "Panneau HTML réactif flottant véritablement en 3D dans la scène Three.js à gauche des fenêtres.",
    enabled: false,
    contentType: "html",
    slot: "3d-panel",
    width: 340,
    height: 220,
    pointerEvents: "auto",
    pose3d: { x: -1120, y: 170, z: 160, rx: 0, ry: 0.42, rz: 0 },
    html: `<div style="width:100%;height:100%;padding:16px;border-radius:24px;background:linear-gradient(145deg,rgba(12,18,34,0.88),rgba(20,10,40,0.82));border:1px solid rgba(56,189,248,0.45);box-shadow:0 0 42px rgba(56,189,248,0.28);color:#f8fafc;font-family:var(--font-mono);display:flex;flex-direction:column;justify-content:space-between;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#38bdf8;font-weight:800;font-size:12px;">🛰️ 3D TELEMETRY PANEL</span>
    <span style="font-size:10px;color:#a78bfa;">LIVE</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;">
    <div style="padding:10px;border-radius:14px;background:rgba(255,255,255,0.06);">
      <div style="font-size:9px;color:#94a3b8;">CPU / GPU</div>
      <div style="font-size:18px;font-weight:800;color:#38bdf8;">{{sys.cpu}}% / {{sys.gpu}}%</div>
    </div>
    <div style="padding:10px;border-radius:14px;background:rgba(255,255,255,0.06);">
      <div style="font-size:9px;color:#94a3b8;">MÉTÉO</div>
      <div style="font-size:18px;font-weight:800;color:#fbbf24;">{{weather.temp}}°C</div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#cbd5e1;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
    <span>RAM {{sys.ram}}% · {{sys.procs}} procs</span>
    <span style="color:#34d399;">AI {{agent.tokens}} tok</span>
  </div>
</div>`,
    builtin: true,
  },
  {
    id: "surf-iframe-dashboard",
    name: "Surface Iframe Bureau Temps Réel",
    emoji: "🌐",
    description: "Iframe HTML/Web interactif posé sur le bureau qui reçoit automatiquement tous les signaux OS via postMessage.",
    enabled: false,
    contentType: "iframe",
    slot: "desktop",
    x: 24,
    y: 440,
    width: 300,
    height: 170,
    pointerEvents: "auto",
    html: `<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}
body{width:100vw;height:100vh;padding:14px;background:linear-gradient(135deg,rgba(12,15,28,0.88),rgba(28,14,48,0.88));color:#f8fafc;font-family:system-ui,sans-serif;border:1px solid rgba(255,255,255,0.14);border-radius:18px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;}
.top{display:flex;justify-content:space-between;font:700 11px ui-monospace,monospace;color:#38bdf8;}
.bars{display:flex;flex-direction:column;gap:7px;}
.row{display:flex;align-items:center;gap:8px;font:11px ui-monospace,monospace;}
.track{flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden;}
.fill{height:100%;border-radius:99px;transition:width 400ms ease;}
</style></head><body>
<div class="top"><span>🌐 IFRAME LIVE SIGNAL BRIDGE</span><span id="w">--°C</span></div>
<div class="bars">
  <div class="row"><span style="width:42px">CPU</span><div class="track"><div id="bcpu" class="fill" style="width:20%;background:#38bdf8"></div></div><span id="vcpu" style="width:34px;text-align:right">0%</span></div>
  <div class="row"><span style="width:42px">RAM</span><div class="track"><div id="bram" class="fill" style="width:30%;background:#c084fc"></div></div><span id="vram" style="width:34px;text-align:right">0%</span></div>
  <div class="row"><span style="width:42px">DISK</span><div class="track"><div id="bdsk" class="fill" style="width:15%;background:#34d399"></div></div><span id="vdsk" style="width:34px;text-align:right">0%</span></div>
</div>
<div style="font:10px ui-monospace,monospace;color:#94a3b8;display:flex;justify-content:space-between;">
  <span id="p">0 procs</span><span id="tok">0 tokens</span>
</div>
<script>
window.addEventListener("message", (e) => {
  if (!e.data || e.data.source !== "unkernelos-reactive-signals") return;
  const s = e.data.signals || {};
  const g = (k, d=0) => (s[k] ? s[k].value : d);
  const cpu = Math.round(Number(g("sys.cpu", 0)));
  const ram = Math.round(Number(g("sys.ram", 0)));
  const dsk = Math.round(Number(g("sys.disk", 0)));
  document.getElementById("bcpu").style.width = cpu + "%";
  document.getElementById("vcpu").textContent = cpu + "%";
  document.getElementById("bram").style.width = ram + "%";
  document.getElementById("vram").textContent = ram + "%";
  document.getElementById("bdsk").style.width = dsk + "%";
  document.getElementById("vdsk").textContent = dsk + "%";
  document.getElementById("w").textContent = g("weather.temp", 18) + "°C " + g("weather.label", "");
  document.getElementById("p").textContent = g("sys.procs", 0) + " procs";
  document.getElementById("tok").textContent = g("agent.tokens", 0) + " tok";
});
</script></body></html>`,
    builtin: true,
  },
];

/* ─── Persistence & Engine Store ─────────────────────────────────────────── */

const STORAGE_KEY = "unkernelos:reactive-mods:v1";

function mergeById<T extends { id: string }>(builtins: readonly T[], saved?: readonly T[]): T[] {
  if (!saved || !Array.isArray(saved)) return [...builtins];
  const savedMap = new Map(saved.map((item) => [item.id, item]));
  const merged = builtins.map((b) => {
    const s = savedMap.get(b.id);
    if (!s) return b;
    savedMap.delete(b.id);
    return { ...b, ...s };
  });
  for (const extra of savedMap.values()) merged.push(extra);
  return merged;
}

function makeInitialSignals(): Record<string, LiveSignal> {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const daylight = Number(Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)).toFixed(3));
  const ts = Date.now();
  const sig = (
    key: string,
    value: SignalPrimitive,
    unit?: string,
    label?: string
  ): [string, LiveSignal] => [
    key,
    {
      key,
      value,
      numeric: typeof value === "number" ? value : typeof value === "boolean" ? (value ? 1 : 0) : Number(value) || 0,
      unit,
      label,
      sourceId: "native",
      updatedAt: ts,
    },
  ];
  return Object.fromEntries([
    sig("time.hour", Number(h.toFixed(2)), "h", "Heure"),
    sig("time.minute", now.getMinutes(), "m", "Minute"),
    sig("time.second", now.getSeconds(), "s", "Seconde"),
    sig("time.daylight", daylight, "", "Lumière Solaire"),
    sig("time.phase", daylight > 0.45 ? "day" : daylight > 0.1 ? "twilight" : "night", "", "Phase"),
    sig("sys.cpu", 14, "%", "CPU"),
    sig("sys.gpu", 22, "%", "GPU"),
    sig("sys.ram", 32, "%", "RAM"),
    sig("sys.disk", 18, "%", "Disque"),
    sig("sys.procs", 12, "", "Processus"),
    sig("sys.load", 0.25, "", "Load 1m"),
    sig("sys.windows", 1, "", "Fenêtres"),
    sig("sys.ports", 0, "", "Ports"),
    sig("sys.fps", 60, "fps", "FPS"),
    sig("agent.calls", 0, "", "Appels Agent API"),
    sig("agent.tokens", 0, "tok", "Tokens Agents IA"),
    sig("agent.active", 0, "", "Activité Agent"),
    sig("input.mouseX", 0.5, "", "Souris X"),
    sig("input.mouseY", 0.5, "", "Souris Y"),
    sig("weather.temp", 18, "°C", "Température"),
    sig("weather.wind", 10, "km/h", "Vent"),
    sig("weather.rain", 0, "", "Pluie"),
    sig("weather.code", 0, "", "Code Météo"),
    sig("weather.isDay", daylight > 0.1 ? 1 : 0, "", "Jour"),
    sig("weather.label", "Clair", "", "Météo"),
  ]);
}

function loadState(): ReactiveModState {
  const def: ReactiveModState = {
    engineEnabled: true,
    signals: makeInitialSignals(),
    sources: [...BUILTIN_DATA_SOURCES],
    bindings: [...BUILTIN_BINDINGS],
    scripts: [...BUILTIN_SCRIPTS],
    surfaces: [...BUILTIN_SURFACES],
    customShaderUniforms: [0.2, 0, 0, 0],
  };
  if (typeof localStorage === "undefined") return def;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<ReactiveModState>;
    return {
      ...def,
      engineEnabled: typeof p.engineEnabled === "boolean" ? p.engineEnabled : true,
      sources: mergeById(BUILTIN_DATA_SOURCES, p.sources),
      bindings: mergeById(BUILTIN_BINDINGS, p.bindings),
      scripts: mergeById(BUILTIN_SCRIPTS, p.scripts),
      surfaces: mergeById(BUILTIN_SURFACES, p.surfaces),
    };
  } catch {
    return def;
  }
}

export type OsApiCallFn = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

class ReactiveModEngine {
  private state: ReactiveModState = loadState();
  private listeners = new Set<() => void>();
  private started = false;
  private nativeTimer = 0;
  private fpsRaf = 0;
  private sourceTimers = new Map<string, number>();
  private scriptTimers = new Map<string, number>();
  private scriptStates = new Map<string, Record<string, unknown>>();
  private runningSources = new Set<string>();
  private osCallBridge: OsApiCallFn | null = null;
  private mouseListener: ((e: PointerEvent) => void) | null = null;
  private mouseX = 0.5;
  private mouseY = 0.5;
  private lastFps = 60;
  private totalTokens = 0;
  private totalApiCalls = 0;
  private lastApiBurstAt = 0;
  private readonly shaderPack = new Float32Array(20);

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): ReactiveModState => this.state;

  /** Register executeOsAction bridge from agent-os-api to avoid circular module init issues */
  public attachOsCallBridge(fn: OsApiCallFn): void {
    this.osCallBridge = fn;
  }

  /** Called by Agent OS API / Agent Studio / Swarm to feed live AI activity & token usage */
  public recordAgentActivity(tokensDelta = 0, callsDelta = 1): void {
    this.totalTokens += Math.max(0, Math.round(tokensDelta));
    this.totalApiCalls += Math.max(0, Math.round(callsDelta));
    this.lastApiBurstAt = Date.now();
    this.pushSignals(
      {
        "agent.tokens": this.totalTokens,
        "agent.calls": this.totalApiCalls,
        "agent.active": 1,
      },
      "agent-api"
    );
  }

  public setCustomUniform(index: 0 | 1 | 2 | 3, value: number): void {
    const next: [number, number, number, number] = [...this.state.customShaderUniforms];
    next[index] = Number.isFinite(value) ? value : 0;
    this.state = { ...this.state, customShaderUniforms: next };
  }

  /** Zero-GC 20-float live signal vector read directly at 60fps by WebGpuBackdrop & ThreeDesktop3d! */
  public getShaderUniformPack(elapsed: number, width: number, height: number, modeIndex: number): Float32Array {
    const s = this.state.signals;
    const g = (k: string, d = 0) => s[k]?.numeric ?? d;
    const out = this.shaderPack;
    out[0] = elapsed;
    out[1] = width;
    out[2] = height;
    out[3] = modeIndex;
    out[4] = clamp(g("sys.cpu", 15) / 100, 0, 1);
    out[5] = clamp(g("sys.gpu", 20) / 100, 0, 1);
    out[6] = clamp(g("sys.ram", 30) / 100, 0, 1);
    out[7] = clamp(g("sys.disk", 18) / 100, 0, 1);
    out[8] = clamp(g("sys.procs", 12) / 100, 0, 1);
    out[9] = clamp(g("agent.tokens", 0) / 50000, 0, 1);
    out[10] = clamp(g("time.daylight", 0.6), 0, 1);
    out[11] = clamp((g("weather.temp", 18) + 10) / 50, 0, 1);
    out[12] = this.mouseX;
    out[13] = this.mouseY;
    out[14] = clamp(g("weather.rain", 0), 0, 1);
    out[15] = clamp(g("agent.active", 0), 0, 1);
    out[16] = this.state.customShaderUniforms[0];
    out[17] = this.state.customShaderUniforms[1];
    out[18] = this.state.customShaderUniforms[2];
    out[19] = this.state.customShaderUniforms[3];
    return out;
  }

  public getSignalNumeric(key: string, fallback = 0): number {
    return this.state.signals[key]?.numeric ?? fallback;
  }

  public getSignalValue(key: string, fallback: SignalPrimitive = 0): SignalPrimitive {
    return this.state.signals[key]?.value ?? fallback;
  }

  /** Interpolates `{{signal.key}}` placeholders inside HTML templates */
  public interpolateTemplate(html: string): string {
    return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
      const s = this.state.signals[key];
      if (!s) return "--";
      return String(s.value);
    });
  }

  /** Build unrestricted OS handle passed to Reactive JS Scripts & Surfaces */
  public createOsContext() {
    return {
      modStore,
      wmStore,
      reactiveEngine: this,
      call: (method: string, params: Record<string, unknown> = {}) =>
        this.osCallBridge ? this.osCallBridge(method, params) : Promise.resolve(null),
      execShell: async (cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> => {
        const res = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(VmService, (v) => v.execShell(cmd)))
        );
        if (res._tag === "Right") return res.right;
        return { stdout: "", stderr: String(res.left), exitCode: 1 };
      },
      fetch: typeof fetch !== "undefined" ? fetch.bind(window) : undefined,
      document: typeof document !== "undefined" ? document : undefined,
      window: typeof window !== "undefined" ? window : undefined,
    };
  }

  private emit(persistConfig = false): void {
    if (persistConfig) this.persist();
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const payload = {
        engineEnabled: this.state.engineEnabled,
        sources: this.state.sources.map((s) => ({
          ...s,
          lastOutput: undefined,
          lastError: undefined,
        })),
        bindings: this.state.bindings.map((b) => ({
          ...b,
          lastValue: undefined,
          lastError: undefined,
        })),
        scripts: this.state.scripts.map((s) => ({
          ...s,
          lastError: undefined,
        })),
        surfaces: this.state.surfaces,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota
    }
  }

  private syncCssVars(): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const s of Object.values(this.state.signals)) {
      const slug = s.key.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
      root.style.setProperty(`--sig-${slug}`, String(s.value));
    }
    const cpu = clamp(this.getSignalNumeric("sys.cpu", 15) / 100, 0, 1);
    const gpu = clamp(this.getSignalNumeric("sys.gpu", 20) / 100, 0, 1);
    const ram = clamp(this.getSignalNumeric("sys.ram", 30) / 100, 0, 1);
    const disk = clamp(this.getSignalNumeric("sys.disk", 18) / 100, 0, 1);
    const tok = clamp(this.getSignalNumeric("agent.tokens", 0) / 50000, 0, 1);
    root.style.setProperty("--sig-cpu-n", cpu.toFixed(3));
    root.style.setProperty("--sig-gpu-n", gpu.toFixed(3));
    root.style.setProperty("--sig-ram-n", ram.toFixed(3));
    root.style.setProperty("--sig-disk-n", disk.toFixed(3));
    root.style.setProperty("--sig-tokens-n", tok.toFixed(3));
  }

  public pushSignal(
    key: string,
    value: SignalPrimitive,
    meta?: { unit?: string; label?: string; sourceId?: string }
  ): void {
    this.pushSignals({ [key]: value }, meta?.sourceId ?? "api", meta);
  }

  public pushSignals(
    entries: Record<string, SignalPrimitive>,
    sourceId = "api",
    meta?: { unit?: string; label?: string }
  ): void {
    const ts = Date.now();
    const nextSignals = { ...this.state.signals };
    for (const [k, v] of Object.entries(entries)) {
      const prev = nextSignals[k];
      const numeric =
        typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0;
      nextSignals[k] = {
        key: k,
        value: v,
        numeric: Number.isFinite(numeric) ? numeric : 0,
        unit: meta?.unit ?? prev?.unit,
        label: meta?.label ?? prev?.label,
        sourceId,
        updatedAt: ts,
      };
    }
    this.state = { ...this.state, signals: nextSignals };
    this.syncCssVars();
    if (this.state.engineEnabled) {
      this.evaluateBindings();
    }
    this.emit(false);
  }

  public start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    // Passive mouse tracking for zero-overhead shader uniforms
    this.mouseListener = (e: PointerEvent) => {
      this.mouseX = clamp(e.clientX / Math.max(1, window.innerWidth), 0, 1);
      this.mouseY = clamp(e.clientY / Math.max(1, window.innerHeight), 0, 1);
    };
    window.addEventListener("pointermove", this.mouseListener, { passive: true });

    // Lightweight FPS sampler
    let frames = 0;
    let last = performance.now();
    const fpsLoop = (now: number) => {
      if (!this.started) return;
      frames++;
      if (now - last >= 1000) {
        this.lastFps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      this.fpsRaf = requestAnimationFrame(fpsLoop);
    };
    this.fpsRaf = requestAnimationFrame(fpsLoop);

    // 1-second native signal collector (time, solar cycle, VM stats, windows, mouse, agent burst)
    const tickNative = () => {
      if (!this.started) return;
      const now = new Date();
      const h = now.getHours() + now.getMinutes() / 60;
      const daylight = Number(Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)).toFixed(3));
      const phase = h >= 21 || h < 5 ? "night" : h < 8 ? "dawn" : h < 18 ? "day" : "dusk";

      const vmSnap = appRuntime.runSync(
        Effect.flatMap(VmService, (v) => v.stateRef.get).pipe(Effect.catchAll(() => Effect.succeed(null)))
      );
      const wmSnap = wmStore.getSnapshot();
      const modSnap = modStore.getSnapshot();
      const jitCompiled = vmSnap?.stats?.jit?.compiled ?? 0;

      // Prefer real Linux Python /proc metrics when recently updated (< 15s), otherwise smooth VM/JIT telemetry
      const linuxFresh =
        this.state.signals["linux.ram"] && Date.now() - this.state.signals["linux.ram"]!.updatedAt < 15_000;
      const tSec = Date.now() / 1000;
      const cpuEst = Number(
        clamp(
          (vmSnap?.phase === "running" ? 16 : 5) +
            (jitCompiled % 24) +
            (this.state.signals["linux.load"]?.numeric ?? 0) * 18 +
            Math.sin(tSec * 0.6) * 4,
          2,
          99
        ).toFixed(1)
      );
      const gpuEst = Number(
        clamp(
          (modSnap.desktop3d.enabled ? 46 : 22) +
            wmSnap.windows.length * 2.5 +
            Math.cos(tSec * 0.5) * 4,
          4,
          98
        ).toFixed(1)
      );

      const updates: Record<string, SignalPrimitive> = {
        "time.hour": Number(h.toFixed(2)),
        "time.minute": now.getMinutes(),
        "time.second": now.getSeconds(),
        "time.daylight": daylight,
        "time.phase": phase,
        "sys.cpu": cpuEst,
        "sys.gpu": gpuEst,
        "sys.ram": linuxFresh ? this.state.signals["linux.ram"]!.numeric : Number(clamp(28 + wmSnap.windows.length * 3, 10, 92).toFixed(1)),
        "sys.disk": linuxFresh ? this.state.signals["linux.disk"]!.numeric : 18,
        "sys.procs": linuxFresh ? this.state.signals["linux.procs"]!.numeric : 12 + wmSnap.windows.length * 2,
        "sys.load": linuxFresh ? this.state.signals["linux.load"]!.numeric : Number((cpuEst / 100).toFixed(2)),
        "sys.windows": wmSnap.windows.length,
        "sys.ports": vmSnap?.detectedPorts.length ?? 0,
        "sys.fps": this.lastFps,
        "agent.active": Date.now() - this.lastApiBurstAt < 4500 ? 1 : 0,
        "input.mouseX": Number(this.mouseX.toFixed(3)),
        "input.mouseY": Number(this.mouseY.toFixed(3)),
      };
      this.pushSignals(updates, "native");
    };

    tickNative();
    this.nativeTimer = window.setInterval(tickNative, 1000);
    this.syncSchedulers();
  }

  public stop(): void {
    this.started = false;
    window.clearInterval(this.nativeTimer);
    cancelAnimationFrame(this.fpsRaf);
    if (this.mouseListener) {
      window.removeEventListener("pointermove", this.mouseListener);
      this.mouseListener = null;
    }
    for (const id of this.sourceTimers.values()) window.clearInterval(id);
    for (const id of this.scriptTimers.values()) window.clearInterval(id);
    this.sourceTimers.clear();
    this.scriptTimers.clear();
  }

  private syncSchedulers(): void {
    for (const id of this.sourceTimers.values()) window.clearInterval(id);
    for (const id of this.scriptTimers.values()) window.clearInterval(id);
    this.sourceTimers.clear();
    this.scriptTimers.clear();

    if (!this.started || !this.state.engineEnabled) return;

    for (const src of this.state.sources) {
      if (!src.enabled) continue;
      const ms = Math.max(500, src.intervalMs || 5000);
      // Run immediately (slight stagger for VM commands so boot isn't crowded)
      const delay = src.kind === "http" || src.kind === "js" ? 300 : 2500;
      window.setTimeout(() => {
        if (this.started && this.state.engineEnabled) void this.runSource(src.id);
      }, delay);
      const timer = window.setInterval(() => {
        if (this.started && this.state.engineEnabled && !document.hidden) {
          void this.runSource(src.id);
        }
      }, ms);
      this.sourceTimers.set(src.id, timer);
    }

    for (const scr of this.state.scripts) {
      if (!scr.enabled) continue;
      const ms = Math.max(250, scr.intervalMs || 1500);
      this.runScript(scr.id);
      const timer = window.setInterval(() => {
        if (this.started && this.state.engineEnabled && !document.hidden) {
          this.runScript(scr.id);
        }
      }, ms);
      this.scriptTimers.set(scr.id, timer);
    }
  }

  /** Execute a Data Source (shell / python / bun / node / http / js) right now and update signals! */
  public async runSource(sourceId: string): Promise<{ ok: boolean; output?: string; error?: string }> {
    const src = this.state.sources.find((s) => s.id === sourceId);
    if (!src) return { ok: false, error: "Source introuvable" };
    if (this.runningSources.has(sourceId)) return { ok: true };
    this.runningSources.add(sourceId);
    const t0 = performance.now();

    try {
      let raw = "";
      let parsedJson: unknown = null;

      if (src.kind === "http") {
        const resp = await fetch(src.code.trim());
        raw = await resp.text();
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          // non-JSON HTTP response
        }
      } else if (src.kind === "js") {
        const sigFn = (k: string, d = 0) => this.getSignalNumeric(k, d);
        const fn = new Function(
          "signals",
          "sig",
          "os",
          "helpers",
          `const { clamp, lerp, mapRange, smoothstep, lerpColor, hsl } = helpers; return (async () => { ${src.code} })();`
        );
        const res = await fn(this.state.signals, sigFn, this.createOsContext(), REACTIVE_HELPERS);
        parsedJson = res;
        raw = typeof res === "string" ? res : JSON.stringify(res);
      } else {
        // Guest Linux VM execution: sh / python3 / bun / node!
        const vmPhase = appRuntime.runSync(
          Effect.flatMap(VmService, (v) => v.stateRef.get).pipe(
            Effect.map((s) => s.phase),
            Effect.catchAll(() => Effect.succeed("idle"))
          )
        );
        if (vmPhase !== "running") {
          return { ok: false, error: "VM Linux non démarrée" };
        }
        const sq = (str: string) => `'${str.replace(/'/g, `'\\''`)}'`;
        const cmd =
          src.kind === "python"
            ? `python3 -c ${sq(src.code)}`
            : src.kind === "bun"
            ? `bun -e ${sq(src.code)}`
            : src.kind === "node"
            ? `node -e ${sq(src.code)}`
            : src.code;
        const execRes = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(VmService, (v) => v.execShell(cmd)))
        );
        if (execRes._tag === "Left") {
          throw new Error(String(execRes.left));
        }
        if (execRes.right.exitCode !== 0 && !execRes.right.stdout.trim()) {
          throw new Error(execRes.right.stderr.trim() || `Exit code ${execRes.right.exitCode}`);
        }
        raw = execRes.right.stdout.trim();
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          // plain string or number
        }
      }

      // Optional custom parser expression
      let finalVal: unknown = parsedJson !== null ? parsedJson : raw;
      if (src.parser && src.parser.trim()) {
        const sigFn = (k: string, d = 0) => this.getSignalNumeric(k, d);
        const pfn = new Function("raw", "json", "signals", "sig", "helpers", src.parser);
        finalVal = pfn(raw, parsedJson, this.state.signals, sigFn, REACTIVE_HELPERS);
      }

      // Flatten output into live signals under outputPrefix
      const prefix = src.outputPrefix.trim();
      const emitted: Record<string, SignalPrimitive> = {};
      if (finalVal && typeof finalVal === "object" && !Array.isArray(finalVal)) {
        for (const [k, v] of Object.entries(finalVal as Record<string, unknown>)) {
          if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
            const fullKey = prefix ? `${prefix}.${k}` : k;
            emitted[fullKey] = v;
          }
        }
      } else if (
        typeof finalVal === "number" ||
        typeof finalVal === "string" ||
        typeof finalVal === "boolean"
      ) {
        const n = Number(finalVal);
        emitted[prefix || src.id] =
          typeof finalVal === "string" && finalVal.trim() !== "" && Number.isFinite(n) ? n : finalVal;
      }

      const dur = Math.round(performance.now() - t0);
      this.state = {
        ...this.state,
        sources: this.state.sources.map((s) =>
          s.id === sourceId
            ? {
                ...s,
                lastRunAt: Date.now(),
                lastDurationMs: dur,
                lastOutput: raw.slice(0, 220),
                lastError: null,
              }
            : s
        ),
      };

      if (Object.keys(emitted).length > 0) {
        this.pushSignals(emitted, src.id);
      } else {
        this.emit(false);
      }
      return { ok: true, output: raw.slice(0, 220) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = {
        ...this.state,
        sources: this.state.sources.map((s) =>
          s.id === sourceId
            ? {
                ...s,
                lastRunAt: Date.now(),
                lastDurationMs: Math.round(performance.now() - t0),
                lastError: msg.slice(0, 180),
              }
            : s
        ),
      };
      this.emit(false);
      return { ok: false, error: msg };
    } finally {
      this.runningSources.delete(sourceId);
    }
  }

  /** Evaluate all enabled Reactive Bindings against current signals and apply live patches! */
  public evaluateBindings(): void {
    const activeBindings = this.state.bindings.filter((b) => b.enabled);
    if (activeBindings.length === 0) return;

    const sigFn = (key: string, fallback = 0): number => this.getSignalNumeric(key, fallback);
    const sigRaw = (key: string, fallback: SignalPrimitive = ""): SignalPrimitive =>
      this.getSignalValue(key, fallback);

    const themePatch: Record<string, unknown> = {};
    const eyePatch: Record<string, unknown> = {};
    const d3Patch: Record<string, unknown> = {};
    const shellPatch: Record<string, unknown> = {};
    const decPatch: Record<string, unknown> = {};
    let nextUniforms: [number, number, number, number] | null = null;

    const nextBindings = this.state.bindings.map((b) => {
      if (!b.enabled) return b;
      try {
        const fn = new Function(
          "sig",
          "sigRaw",
          "signals",
          "clamp",
          "lerp",
          "mapRange",
          "smoothstep",
          "lerpColor",
          "hsl",
          `return (${b.expression});`
        );
        const val = fn(
          sigFn,
          sigRaw,
          this.state.signals,
          clamp,
          lerp,
          mapRange,
          smoothstep,
          lerpColor,
          hsl
        );

        switch (b.target) {
          case "theme.accentPrimary":
            if (typeof val === "string") {
              themePatch.enabled = true;
              themePatch.accentPrimary = val;
              themePatch.windowGlow = val.startsWith("#") ? `${val}55` : val;
            }
            break;
          case "theme.accentSecondary":
            if (typeof val === "string") {
              themePatch.enabled = true;
              themePatch.accentSecondary = val;
            }
            break;
          case "theme.blurPx":
            themePatch.enabled = true;
            themePatch.blurPx = Math.round(clamp(Number(val), 0, 56));
            break;
          case "theme.glassOpacity":
            themePatch.enabled = true;
            themePatch.glassOpacity = Number(clamp(Number(val), 0.42, 0.96).toFixed(2));
            break;
          case "eyecandy.nightShiftWarmth":
            eyePatch.nightShiftWarmth = Math.round(clamp(Number(val), 0, 100));
            break;
          case "eyecandy.ambientParticles":
            if (typeof val === "string") eyePatch.ambientParticles = val as AmbientParticlesKind;
            break;
          case "eyecandy.ambientParticleDensity":
            eyePatch.ambientParticleDensity = Number(clamp(Number(val), 0.3, 2).toFixed(2));
            break;
          case "eyecandy.vignetteStrength":
            eyePatch.vignetteStrength = Math.round(clamp(Number(val), 0, 80));
            break;
          case "eyecandy.motionSpeed":
            eyePatch.motionSpeed = Number(clamp(Number(val), 0.3, 2).toFixed(2));
            break;
          case "desktop3d.bloomIntensity":
            d3Patch.bloomIntensity = Number(clamp(Number(val), 0, 2).toFixed(2));
            break;
          case "desktop3d.cameraSpeed":
            d3Patch.cameraSpeed = Number(clamp(Number(val), 0, 2).toFixed(2));
            break;
          case "desktop3d.particleDensity":
            d3Patch.particleDensity = Number(clamp(Number(val), 0.25, 2).toFixed(2));
            break;
          case "shell.dockMagStrength":
            shellPatch.dockMagStrength = Number(clamp(Number(val), 0, 1).toFixed(2));
            break;
          case "shell.dockIconScale":
            shellPatch.dockIconScale = Number(clamp(Number(val), 0.8, 1.25).toFixed(2));
            break;
          case "decorator.activeGlowPx":
            decPatch.activeGlowPx = Math.round(clamp(Number(val), 0, 64));
            break;
          case "shader.custom0":
          case "shader.custom1":
          case "shader.custom2":
          case "shader.custom3": {
            const idx = Number(b.target.slice(-1)) as 0 | 1 | 2 | 3;
            if (!nextUniforms) nextUniforms = [...this.state.customShaderUniforms];
            nextUniforms[idx] = Number.isFinite(Number(val)) ? Number(val) : 0;
            break;
          }
          case "cssVar":
            if (typeof document !== "undefined" && b.cssVarName) {
              const varName = b.cssVarName.startsWith("--") ? b.cssVarName : `--${b.cssVarName}`;
              document.documentElement.style.setProperty(varName, String(val));
            }
            break;
        }
        return { ...b, lastValue: String(val), lastError: null };
      } catch (err) {
        return { ...b, lastError: err instanceof Error ? err.message : String(err) };
      }
    });

    this.state = {
      ...this.state,
      bindings: nextBindings,
      customShaderUniforms: nextUniforms ?? this.state.customShaderUniforms,
    };

    // Apply only changed patches to modStore so we never cause render storms!
    const cur = modStore.getSnapshot();
    const diff = (target: Record<string, unknown>, patch: Record<string, unknown>) =>
      Object.entries(patch).some(([k, v]) => target[k] !== v);

    if (Object.keys(themePatch).length > 0 && diff(cur.theme as unknown as Record<string, unknown>, themePatch)) {
      modStore.setTheme(themePatch);
    }
    if (Object.keys(eyePatch).length > 0 && diff(cur.eyeCandy as unknown as Record<string, unknown>, eyePatch)) {
      modStore.setEyeCandy(eyePatch);
    }
    if (Object.keys(d3Patch).length > 0 && diff(cur.desktop3d as unknown as Record<string, unknown>, d3Patch)) {
      modStore.setDesktop3d(d3Patch);
    }
    if (Object.keys(shellPatch).length > 0 && diff(cur.shell as unknown as Record<string, unknown>, shellPatch)) {
      modStore.setShell(shellPatch);
    }
    if (Object.keys(decPatch).length > 0 && diff(cur.decorator as unknown as Record<string, unknown>, decPatch)) {
      modStore.setDecorator(decPatch);
    }
  }

  /** Execute an unrestricted Reactive JS Script Mod */
  public runScript(scriptId: string): { ok: boolean; error?: string } {
    const scr = this.state.scripts.find((s) => s.id === scriptId);
    if (!scr) return { ok: false, error: "Script introuvable" };
    let bag = this.scriptStates.get(scriptId);
    if (!bag) {
      bag = {};
      this.scriptStates.set(scriptId, bag);
    }
    const sigFn = (k: string, d = 0) => this.getSignalNumeric(k, d);
    const sigRaw = (k: string, d: SignalPrimitive = "") => this.getSignalValue(k, d);
    try {
      const fn = new Function(
        "signals",
        "os",
        "helpers",
        "state",
        "sig",
        "sigRaw",
        `const { clamp, lerp, mapRange, smoothstep, lerpColor, hsl } = helpers;\n${scr.code}`
      );
      fn(this.state.signals, this.createOsContext(), REACTIVE_HELPERS, bag, sigFn, sigRaw);
      this.state = {
        ...this.state,
        scripts: this.state.scripts.map((s) =>
          s.id === scriptId ? { ...s, lastRunAt: Date.now(), lastError: null } : s
        ),
      };
      this.emit(false);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = {
        ...this.state,
        scripts: this.state.scripts.map((s) =>
          s.id === scriptId ? { ...s, lastRunAt: Date.now(), lastError: msg } : s
        ),
      };
      this.emit(false);
      return { ok: false, error: msg };
    }
  }

  /* ─── CRUD Mutations ─────────────────────────────────────────────────── */

  public setEngineEnabled(enabled: boolean): void {
    this.state = { ...this.state, engineEnabled: enabled };
    this.syncSchedulers();
    this.emit(true);
  }

  public upsertSource(src: ReactiveDataSource): ReactiveDataSource {
    const idx = this.state.sources.findIndex((s) => s.id === src.id);
    const sources =
      idx >= 0
        ? this.state.sources.map((s, i) => (i === idx ? { ...s, ...src } : s))
        : [src, ...this.state.sources];
    this.state = { ...this.state, sources };
    this.syncSchedulers();
    this.emit(true);
    return src;
  }

  public removeSource(id: string): boolean {
    const exists = this.state.sources.some((s) => s.id === id);
    if (!exists) return false;
    this.state = { ...this.state, sources: this.state.sources.filter((s) => s.id !== id) };
    this.syncSchedulers();
    this.emit(true);
    return true;
  }

  public upsertBinding(binding: ReactiveBinding): ReactiveBinding {
    const idx = this.state.bindings.findIndex((b) => b.id === binding.id);
    const bindings =
      idx >= 0
        ? this.state.bindings.map((b, i) => (i === idx ? { ...b, ...binding } : b))
        : [binding, ...this.state.bindings];
    this.state = { ...this.state, bindings };
    if (this.state.engineEnabled) this.evaluateBindings();
    this.emit(true);
    return binding;
  }

  public removeBinding(id: string): boolean {
    const exists = this.state.bindings.some((b) => b.id === id);
    if (!exists) return false;
    this.state = { ...this.state, bindings: this.state.bindings.filter((b) => b.id !== id) };
    this.emit(true);
    return true;
  }

  public upsertScript(script: ReactiveScriptMod): ReactiveScriptMod {
    const idx = this.state.scripts.findIndex((s) => s.id === script.id);
    const scripts =
      idx >= 0
        ? this.state.scripts.map((s, i) => (i === idx ? { ...s, ...script } : s))
        : [script, ...this.state.scripts];
    this.state = { ...this.state, scripts };
    this.syncSchedulers();
    this.emit(true);
    return script;
  }

  public removeScript(id: string): boolean {
    const exists = this.state.scripts.some((s) => s.id === id);
    if (!exists) return false;
    this.state = { ...this.state, scripts: this.state.scripts.filter((s) => s.id !== id) };
    this.scriptStates.delete(id);
    this.syncSchedulers();
    this.emit(true);
    return true;
  }

  public upsertSurface(surface: ReactiveSurface): ReactiveSurface {
    const idx = this.state.surfaces.findIndex((s) => s.id === surface.id);
    const surfaces =
      idx >= 0
        ? this.state.surfaces.map((s, i) => (i === idx ? { ...s, ...surface } : s))
        : [surface, ...this.state.surfaces];
    this.state = { ...this.state, surfaces };
    this.emit(true);
    return surface;
  }

  public removeSurface(id: string): boolean {
    const exists = this.state.surfaces.some((s) => s.id === id);
    if (!exists) return false;
    this.state = { ...this.state, surfaces: this.state.surfaces.filter((s) => s.id !== id) };
    this.emit(true);
    return true;
  }

  public exportConfig(): {
    engineEnabled: boolean;
    sources: readonly ReactiveDataSource[];
    bindings: readonly ReactiveBinding[];
    scripts: readonly ReactiveScriptMod[];
    surfaces: readonly ReactiveSurface[];
  } {
    return {
      engineEnabled: this.state.engineEnabled,
      sources: this.state.sources.map((s) => ({ ...s, lastOutput: undefined, lastError: undefined })),
      bindings: this.state.bindings.map((b) => ({ ...b, lastValue: undefined, lastError: undefined })),
      scripts: this.state.scripts.map((s) => ({ ...s, lastError: undefined })),
      surfaces: this.state.surfaces,
    };
  }

  public importConfig(data: Partial<ReactiveModState> | undefined): void {
    if (!data || typeof data !== "object") return;
    this.state = {
      ...this.state,
      engineEnabled: typeof data.engineEnabled === "boolean" ? data.engineEnabled : this.state.engineEnabled,
      sources: data.sources ? mergeById(BUILTIN_DATA_SOURCES, data.sources) : this.state.sources,
      bindings: data.bindings ? mergeById(BUILTIN_BINDINGS, data.bindings) : this.state.bindings,
      scripts: data.scripts ? mergeById(BUILTIN_SCRIPTS, data.scripts) : this.state.scripts,
      surfaces: data.surfaces ? mergeById(BUILTIN_SURFACES, data.surfaces) : this.state.surfaces,
    };
    this.syncSchedulers();
    if (this.state.engineEnabled) this.evaluateBindings();
    this.emit(true);
  }

  public resetAll(): void {
    this.scriptStates.clear();
    this.state = {
      engineEnabled: true,
      signals: makeInitialSignals(),
      sources: [...BUILTIN_DATA_SOURCES],
      bindings: [...BUILTIN_BINDINGS],
      scripts: [...BUILTIN_SCRIPTS],
      surfaces: [...BUILTIN_SURFACES],
      customShaderUniforms: [0.2, 0, 0, 0],
    };
    this.syncSchedulers();
    this.emit(true);
  }
}

export const reactiveEngine = new ReactiveModEngine();

// Wire full reactive config (sources, bindings, scripts, surfaces) into Mod Pack v3 JSON export/import!
modStore.attachReactiveBundleHooks({
  exportConfig: () => reactiveEngine.exportConfig(),
  importConfig: (data) => reactiveEngine.importConfig(data as Partial<ReactiveModState>),
});

export function useReactiveMod(): ReactiveModState {
  return useSyncExternalStore(reactiveEngine.subscribe, reactiveEngine.getSnapshot);
}
