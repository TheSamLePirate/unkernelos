import { useSyncExternalStore } from "react";
import type { OsThemeId, WallpaperShaderId } from "./schema.ts";

export type WindowDecoratorStyle =
  | "macos"
  | "windows"
  | "cyber-hud"
  | "retro-95"
  | "minimal-swiss"
  | "floating-zen"
  | "tiling-i3";

export type DockStyleKind =
  | "floating-glass"
  | "full-taskbar"
  | "minimal-pill"
  | "cyber-rail"
  | "hidden";

export type TopBarStyleKind =
  | "glass"
  | "floating-pills"
  | "retro"
  | "minimal"
  | "hidden";

export type Desktop3dSceneKind =
  | "cyber-observatory"
  | "liquid-monolith"
  | "cyberpunk-city"
  | "kyoto-sanctuary";

export interface Desktop3dModConfig {
  readonly enabled: boolean;
  readonly scene: Desktop3dSceneKind;
  readonly spatialWindows: boolean;
  readonly interactiveOrbit: boolean;
  readonly cameraSpeed: number; // 0..2
  readonly bloomIntensity: number; // 0..2
  readonly particleDensity: number; // 0.25..2
  readonly mouseParallax: number; // 0..2
}

export interface DecoratorModConfig {
  readonly style: WindowDecoratorStyle;
  readonly buttonPosition: "left" | "right";
  readonly radiusPx: number; // 0..28
  readonly borderWidthPx: number; // 0..3
  readonly titlebarHeightPx: number; // 28..44
  readonly titleAlign: "left" | "center";
  readonly titlebarAccentBar: boolean;
  readonly showWorkspacePills: boolean;
  readonly showSnapButtons: boolean;
  readonly activeGlowPx: number; // 0..64
  readonly unfocusedOpacity: number; // 0.65..1
}

export interface ShellModConfig {
  readonly dockStyle: DockStyleKind;
  readonly dockRadiusPx: number;
  readonly topBarStyle: TopBarStyleKind;
  readonly brandLabel: string;
  readonly showStockWidgets: boolean;
}

export interface CustomThemeTokens {
  readonly enabled: boolean;
  readonly name: string;
  readonly glassRgb: string; // "12, 14, 22"
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
  readonly wgsl: string; // WGSL function body `fn renderCustom(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32>`
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
  readonly themePatch?: Partial<CustomThemeTokens>;
  readonly decoratorPatch?: Partial<DecoratorModConfig>;
  readonly shellPatch?: Partial<ShellModConfig>;
  readonly shaderId?: string;
  readonly widgetId?: string;
}

export interface OsVariant {
  readonly id: string;
  readonly name: string;
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
  readonly enabledModIds: readonly string[];
  readonly enabledWidgetIds: readonly string[];
  readonly builtin?: boolean;
}

export interface ModState {
  readonly activeVariantId: string;
  readonly theme: CustomThemeTokens;
  readonly decorator: DecoratorModConfig;
  readonly shell: ShellModConfig;
  readonly desktop3d: Desktop3dModConfig;
  readonly activeShaderModId: string | null;
  readonly shaderCompileError: string | null;
  readonly mods: readonly OsMod[];
  readonly shaders: readonly CustomShaderMod[];
  readonly widgets: readonly CustomDesktopWidget[];
  readonly variants: readonly OsVariant[];
  readonly userCss: string;
}

const STORAGE_KEY = "unkernelos:mods:v1";

export const DEFAULT_DESKTOP_3D: Desktop3dModConfig = {
  enabled: false,
  scene: "cyber-observatory",
  spatialWindows: true,
  interactiveOrbit: false,
  cameraSpeed: 0.7,
  bloomIntensity: 1.0,
  particleDensity: 1.0,
  mouseParallax: 1.0,
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
  dockStyle: "floating-glass",
  dockRadiusPx: 22,
  topBarStyle: "glass",
  brandLabel: "unkernelOS",
  showStockWidgets: true,
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
// Built-in Custom WGSL Wallpaper Shaders (Hot-Compiled on WebGPU!)
// ---------------------------------------------------------------------------

export const BUILTIN_SHADERS: readonly CustomShaderMod[] = [
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
  // Secondary deeper cyan layer
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

  // Subtle starfield warped by gravity
  let warp = p * (1.0 + 0.14 / max(r, 0.16));
  let cell = floor((warp + 2.0) * 75.0);
  let star = step(0.994, hash21(cell)) * (0.5 + 0.5 * sin(t * 2.0 + hash21(cell + 7.0) * 6.28));
  col += vec3<f32>(0.82, 0.88, 1.0) * star * smoothstep(0.18, 0.35, r) * 0.6;

  // Relativistic accretion disk
  let diskY = p.y * 4.2 + 0.06 * sin(ang * 3.0 - t * 2.4);
  let diskR = length(vec2<f32>(p.x, diskY));
  let swirl = 0.65 + 0.35 * sin(ang * 6.0 - t * 3.6 + 8.0 / max(r, 0.15));
  let disk = exp(-abs(diskR - 0.34) * 14.0) * swirl;
  let photonRing = exp(-abs(r - 0.19) * 38.0);

  col += mix(vec3<f32>(0.98, 0.55, 0.12), vec3<f32>(0.65, 0.22, 0.95), clamp(r * 2.0, 0.0, 1.0)) * disk * 0.85;
  col += vec3<f32>(1.0, 0.86, 0.62) * photonRing * 0.95;

  // Pitch-black event horizon core
  let hole = smoothstep(0.165, 0.19, r);
  return col * hole;
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
    description: "Guide de respiration ambiant apaisant pour la variante Kyoto Zen.",
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
];

// ---------------------------------------------------------------------------
// Built-in General & Specific OS Mods (Toggleable & Stackable!)
// ---------------------------------------------------------------------------

export const BUILTIN_MODS: readonly OsMod[] = [
  {
    id: "mod-crt-scanlines",
    name: "CRT Scanlines & Phosphore",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Superpose des lignes de balayage CRT rétro et un léger vignettage sur tout le bureau (sans bloquer les clics).",
    tags: ["retro", "cyberpunk", "overlay"],
    enabled: false,
    builtin: true,
    css: `body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.14) 0px,
      rgba(0, 0, 0, 0.14) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(circle at center, transparent 58%, rgba(0, 0, 0, 0.38) 100%);
}`,
  },
  {
    id: "mod-rgb-chroma-borders",
    name: "Bordures Prismatiques RGB Actives",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "specific",
    description: "Ajoute un halo prismatique animé cyan/violet/magenta autour de la fenêtre active et du Dock.",
    tags: ["glow", "windows", "rgb"],
    enabled: false,
    builtin: true,
    css: `@keyframes unkernel-chroma-border {
  0% { border-color: rgba(34, 211, 238, 0.72); box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 34px -6px rgba(34,211,238,0.52); }
  50% { border-color: rgba(232, 121, 249, 0.76); box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 38px -6px rgba(232,121,249,0.54); }
  100% { border-color: rgba(34, 211, 238, 0.72); box-shadow: 0 28px 80px -12px rgba(0,0,0,0.85), 0 0 34px -6px rgba(34,211,238,0.52); }
}
.glass-surface-focused {
  animation: unkernel-chroma-border 4.5s ease-in-out infinite;
}`,
  },
  {
    id: "mod-liquid-chrome-rim",
    name: "Reflets Liquid Chrome Specular",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Intensifie les arêtes spéculaires cristallines façon macOS Tahoe / VisionOS sur fenêtres, dock et widgets.",
    tags: ["liquid-glass", "specular", "macos"],
    enabled: false,
    builtin: true,
    css: `.glass-surface, .glass-surface-focused, .glass-dock, .glass-widget {
  box-shadow:
    0 28px 72px -12px rgba(0, 0, 0, 0.75),
    0 1.5px 0 0 rgba(255, 255, 255, 0.34) inset,
    0 -1px 0 0 rgba(125, 211, 252, 0.16) inset,
    1px 0 0 0 rgba(255, 255, 255, 0.12) inset;
}`,
  },
  {
    id: "mod-neon-hud-type",
    name: "Typographie HUD Cybernétique",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "specific",
    description: "Passe les titres de fenêtres et barres système en monospace lumineux majuscule façon terminal futuriste.",
    tags: ["typography", "hud", "cyberpunk"],
    enabled: false,
    builtin: true,
    css: `[data-unkernel-titlebar] {
  font-family: var(--font-mono) !important;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 0 0 12px var(--accent-cyan);
}
header.glass-bar {
  font-family: var(--font-mono);
}`,
  },
  {
    id: "mod-compact-tiling",
    name: "Densité Pro Ultra-Compacte",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Réduit les ombres, affine les scrollbars et rend les bordures ultra-nettes pour un workflow tiling haute densité.",
    tags: ["tiling", "minimal", "performance"],
    enabled: false,
    builtin: true,
    css: `.glass-surface, .glass-surface-focused {
  backdrop-filter: blur(12px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(12px) saturate(140%) !important;
}
::-webkit-scrollbar { width: 4px; height: 4px; }`,
  },
  {
    id: "mod-retro-bevel-chrome",
    name: "Relief 3D Classique (Win95 / BeOS)",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "specific",
    description: "Ajoute des bordures biseautées 3D rétro et des surfaces opaques nettes inspirées des OS années 90.",
    tags: ["retro", "win95", "vaporwave"],
    enabled: false,
    builtin: true,
    css: `.glass-surface, .glass-surface-focused {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow:
    inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.55),
    inset -1.5px -1.5px 0 rgba(0, 0, 0, 0.7),
    6px 6px 0 rgba(0, 0, 0, 0.48) !important;
}
.dock-squircle {
  border-radius: 6px !important;
}`,
  },
  {
    id: "mod-cinematic-vignette",
    name: "Vignettage Cinéma & Profondeur",
    author: "unkernelOS Labs",
    version: "1.0.0",
    kind: "css",
    scope: "general",
    description: "Ajoute un vignettage cinéma subtil sur les bords de l'écran pour sublimer le contraste des fenêtres.",
    tags: ["cinema", "zen", "ambient"],
    enabled: false,
    builtin: true,
    css: `body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 4;
  background: radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.42) 100%);
}`,
  },
];

// ---------------------------------------------------------------------------
// 6 Curated Full OS Variants (1-Click Total OS Transformation!)
// ---------------------------------------------------------------------------

export const BUILTIN_VARIANTS: readonly OsVariant[] = [
  {
    id: "unkernel-default",
    name: "unkernelOS Stock",
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
  {
    id: "macos-tahoe-liquid",
    name: "macOS Liquid Metal",
    tagline: "Verre saphir réfractif, reflets chrome spéculaires, Mercure WGSL & Horloge Studio",
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
      dockStyle: "floating-glass",
      dockRadiusPx: 26,
      topBarStyle: "floating-pills",
      brandLabel: "LiquidOS",
      showStockWidgets: true,
    },
    enabledModIds: ["mod-liquid-chrome-rim"],
    enabledWidgetIds: ["widget-analog-clock", "widget-live-radar"],
    builtin: true,
  },
  {
    id: "cyberpunk-2099",
    name: "Night City 2099 HUD",
    tagline: "Décorateur Cyber HUD laser, Matrix Rain WGSL, CRT scanlines, bordures RGB & EQ",
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
      glassOpacity: 0.84,
      blurPx: 18,
      borderColor: "rgba(34, 211, 238, 0.32)",
      activeBorderColor: "rgba(244, 63, 94, 0.78)",
      accentPrimary: "#f43f5e",
      accentSecondary: "#22d3ee",
      windowGlow: "rgba(244, 63, 94, 0.42)",
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
      dockStyle: "cyber-rail",
      dockRadiusPx: 10,
      topBarStyle: "glass",
      brandLabel: "CYBER//OS 2099",
      showStockWidgets: false,
    },
    enabledModIds: ["mod-crt-scanlines", "mod-rgb-chroma-borders", "mod-neon-hud-type"],
    enabledWidgetIds: ["widget-live-radar", "widget-cyber-eq", "widget-matrix-ticker"],
    builtin: true,
  },
  {
    id: "win95-vaporwave",
    name: "Retro 95 · Vaporwave",
    tagline: "Fenêtres biseautées 3D années 90, Taskbar classique, Cyber Horizon & Equalizer",
    emoji: "💾",
    swatches: ["#0ea5e9", "#ec4899", "#eab308"],
    baseOsTheme: "cyberpunk-neon",
    baseShader: "cyber-grid",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "Vaporwave 95",
      glassRgb: "24, 28, 44",
      elevatedRgb: "30, 35, 56",
      barRgb: "20, 24, 42",
      dockRgb: "24, 28, 48",
      glassOpacity: 0.96,
      blurPx: 8,
      borderColor: "rgba(186, 230, 253, 0.55)",
      activeBorderColor: "rgba(244, 114, 182, 0.85)",
      accentPrimary: "#0ea5e9",
      accentSecondary: "#f472b6",
      windowGlow: "rgba(236, 72, 153, 0.35)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "retro-95",
      buttonPosition: "right",
      radiusPx: 2,
      borderWidthPx: 2,
      titlebarHeightPx: 32,
      titleAlign: "left",
      titlebarAccentBar: false,
      showWorkspacePills: false,
      activeGlowPx: 16,
      unfocusedOpacity: 0.94,
    },
    shell: {
      dockStyle: "full-taskbar",
      dockRadiusPx: 4,
      topBarStyle: "retro",
      brandLabel: "Unkernel 95",
      showStockWidgets: false,
    },
    enabledModIds: ["mod-retro-bevel-chrome", "mod-crt-scanlines"],
    enabledWidgetIds: ["widget-cyber-eq", "widget-analog-clock"],
    builtin: true,
  },
  {
    id: "brutalist-swiss",
    name: "Swiss Mono · Industrial",
    tagline: "Design Braun / Teenage Engineering : noir mat, orange signal #ff4d00, grille précise & Pomodoro",
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
      glassOpacity: 0.92,
      blurPx: 12,
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
    name: "Kyoto Zen · Bioluminescence",
    tagline: "Fenêtres flottantes ultra-douces, ondes jade & sakura WGSL, vignettage cinéma & Orbe Zen",
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
      glassOpacity: 0.72,
      blurPx: 34,
      borderColor: "rgba(153, 246, 228, 0.16)",
      activeBorderColor: "rgba(94, 234, 212, 0.36)",
      accentPrimary: "#14b8a6",
      accentSecondary: "#f472b6",
      windowGlow: "rgba(20, 184, 166, 0.26)",
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
      dockStyle: "minimal-pill",
      dockRadiusPx: 28,
      topBarStyle: "floating-pills",
      brandLabel: "KyotoOS",
      showStockWidgets: false,
    },
    enabledModIds: ["mod-cinematic-vignette"],
    enabledWidgetIds: ["widget-zen-orb", "widget-pomodoro"],
    builtin: true,
  },
  {
    id: "vision-spatial-3d",
    name: "VisionOS Spatial 3D (WebGPU)",
    tagline: "Bureau 3D temps réel Three.js WebGPU, fenêtres spatiales en profondeur, anneaux orbitaux & verre cristallin",
    emoji: "🪐",
    swatches: ["#38bdf8", "#a855f7", "#22d3ee"],
    baseOsTheme: "liquid-glass",
    baseShader: "liquid-prism",
    activeShaderModId: null,
    theme: {
      ...DEFAULT_CUSTOM_THEME,
      enabled: true,
      name: "VisionOS Spatial Glass",
      glassRgb: "12, 18, 34",
      elevatedRgb: "18, 26, 48",
      barRgb: "10, 15, 28",
      dockRgb: "16, 24, 44",
      glassOpacity: 0.62,
      blurPx: 32,
      borderColor: "rgba(186, 230, 253, 0.24)",
      activeBorderColor: "rgba(125, 211, 252, 0.55)",
      accentPrimary: "#38bdf8",
      accentSecondary: "#a855f7",
      windowGlow: "rgba(56, 189, 248, 0.36)",
    },
    decorator: {
      ...DEFAULT_DECORATOR,
      style: "floating-zen",
      buttonPosition: "left",
      radiusPx: 22,
      borderWidthPx: 1,
      titlebarHeightPx: 36,
      titleAlign: "center",
      titlebarAccentBar: true,
      activeGlowPx: 58,
      unfocusedOpacity: 0.88,
    },
    shell: {
      dockStyle: "floating-glass",
      dockRadiusPx: 26,
      topBarStyle: "floating-pills",
      brandLabel: "SpatialOS 3D",
      showStockWidgets: false,
    },
    desktop3d: {
      enabled: true,
      scene: "cyber-observatory",
      spatialWindows: true,
      interactiveOrbit: false,
      cameraSpeed: 0.75,
      bloomIntensity: 1.15,
      particleDensity: 1.1,
      mouseParallax: 1.15,
    },
    enabledModIds: ["mod-liquid-chrome-rim"],
    enabledWidgetIds: ["widget-live-radar", "widget-analog-clock"],
    builtin: true,
  },
];

function createDefaultState(): ModState {
  return {
    activeVariantId: "unkernel-default",
    theme: { ...DEFAULT_CUSTOM_THEME },
    decorator: { ...DEFAULT_DECORATOR },
    shell: { ...DEFAULT_SHELL },
    desktop3d: { ...DEFAULT_DESKTOP_3D },
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

function loadModState(): ModState {
  const def = createDefaultState();
  if (typeof localStorage === "undefined") return def;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<ModState>;
    return {
      activeVariantId: typeof p.activeVariantId === "string" ? p.activeVariantId : def.activeVariantId,
      theme: { ...def.theme, ...(p.theme ?? {}) },
      decorator: { ...def.decorator, ...(p.decorator ?? {}) },
      shell: { ...def.shell, ...(p.shell ?? {}) },
      desktop3d: { ...def.desktop3d, ...(p.desktop3d ?? {}) },
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

    // 1. Custom Theme override (when enabled)
    if (s.theme.enabled) {
      const op = Math.max(0.4, Math.min(0.98, s.theme.glassOpacity));
      const elOp = Math.min(0.99, op + 0.08);
      root.style.setProperty("--glass-bg", `rgba(${s.theme.glassRgb}, ${op.toFixed(2)})`);
      root.style.setProperty("--glass-bg-elevated", `rgba(${s.theme.elevatedRgb}, ${elOp.toFixed(2)})`);
      root.style.setProperty("--glass-bar-bg", `rgba(${s.theme.barRgb}, ${Math.min(0.95, op + 0.06).toFixed(2)})`);
      root.style.setProperty("--glass-dock-bg", `rgba(${s.theme.dockRgb}, ${Math.min(0.95, op + 0.04).toFixed(2)})`);
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

    // 2. Active variant & decorator dataset hooks for CSS mods
    root.dataset.osVariant = s.activeVariantId;
    root.dataset.windowDecorator = s.decorator.style;
    root.dataset.dockStyle = s.shell.dockStyle;
    root.dataset.topbarStyle = s.shell.topBarStyle;

    // 3. Inject all enabled CSS mods + userCss into a single hot-reloaded <style> tag
    const cssParts: string[] = [];
    for (const mod of s.mods) {
      if (mod.enabled && mod.css && mod.css.trim()) {
        cssParts.push(`/* Mod: ${mod.name} (${mod.id}) */\n${mod.css}`);
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
    this.setState((s) => ({
      ...s,
      theme: { ...s.theme, ...patch },
    }));
  }

  public setDecorator(patch: Partial<DecoratorModConfig>): void {
    this.setState((s) => ({
      ...s,
      decorator: { ...s.decorator, ...patch },
    }));
  }

  public setShell(patch: Partial<ShellModConfig>): void {
    this.setState((s) => ({
      ...s,
      shell: { ...s.shell, ...patch },
    }));
  }

  public setDesktop3d(patch: Partial<Desktop3dModConfig>): void {
    this.setState((s) => ({
      ...s,
      desktop3d: { ...s.desktop3d, ...patch },
    }));
  }

  public setUserCss(css: string): void {
    this.setState((s) => ({ ...s, userCss: css }));
  }

  public setActiveShaderMod(id: string | null): void {
    this.setState((s) => ({
      ...s,
      activeShaderModId: id,
      shaderCompileError: null,
    }));
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
    this.setState((s) => {
      const mods = s.mods.map((m) => (m.id === id ? { ...m, enabled: nextEnabled } : m));
      let next: ModState = { ...s, mods };
      if (nextEnabled) {
        if (target.themePatch) next = { ...next, theme: { ...next.theme, ...target.themePatch } };
        if (target.decoratorPatch) next = { ...next, decorator: { ...next.decorator, ...target.decoratorPatch } };
        if (target.shellPatch) next = { ...next, shell: { ...next.shell, ...target.shellPatch } };
        if (target.shaderId) next = { ...next, activeShaderModId: target.shaderId };
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
    this.setState((s) => ({
      ...s,
      mods: s.mods.filter((m) => m.id !== id),
    }));
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
    this.setState((s) => ({
      ...s,
      widgets: s.widgets.filter((w) => w.id !== id),
    }));
    return true;
  }

  public applyVariant(variantId: string): OsVariant | null {
    const v = this.state.variants.find((x) => x.id === variantId);
    if (!v) return null;
    const modSet = new Set(v.enabledModIds);
    const widgetSet = new Set(v.enabledWidgetIds);
    this.setState((s) => ({
      ...s,
      activeVariantId: v.id,
      theme: { ...v.theme },
      decorator: { ...v.decorator },
      shell: { ...v.shell },
      desktop3d: v.desktop3d
        ? { ...DEFAULT_DESKTOP_3D, ...v.desktop3d }
        : { ...DEFAULT_DESKTOP_3D, enabled: false },
      activeShaderModId: v.activeShaderModId,
      shaderCompileError: null,
      mods: s.mods.map((m) => ({ ...m, enabled: modSet.has(m.id) })),
      widgets: s.widgets.map((w) => ({ ...w, enabled: widgetSet.has(w.id) })),
    }));
    return v;
  }

  public saveCurrentAsVariant(id: string, name: string, tagline: string, emoji = "✨"): OsVariant {
    const s = this.state;
    const variant: OsVariant = {
      id,
      name,
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

  public exportBundleJson(): string {
    return JSON.stringify(
      {
        schema: "unkernelos-mod-pack/v1",
        exportedAt: new Date().toISOString(),
        activeVariantId: this.state.activeVariantId,
        theme: this.state.theme,
        decorator: this.state.decorator,
        shell: this.state.shell,
        desktop3d: this.state.desktop3d,
        activeShaderModId: this.state.activeShaderModId,
        userCss: this.state.userCss,
        mods: this.state.mods,
        shaders: this.state.shaders,
        widgets: this.state.widgets,
        variants: this.state.variants.filter((v) => !v.builtin),
      },
      null,
      2
    );
  }

  public importBundleJson(jsonText: string): { ok: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonText) as Partial<ModState>;
      this.setState((s) => ({
        ...s,
        activeVariantId: data.activeVariantId ?? s.activeVariantId,
        theme: data.theme ? { ...s.theme, ...data.theme } : s.theme,
        decorator: data.decorator ? { ...s.decorator, ...data.decorator } : s.decorator,
        shell: data.shell ? { ...s.shell, ...data.shell } : s.shell,
        desktop3d: data.desktop3d ? { ...s.desktop3d, ...data.desktop3d } : s.desktop3d,
        activeShaderModId:
          data.activeShaderModId !== undefined ? data.activeShaderModId : s.activeShaderModId,
        userCss: typeof data.userCss === "string" ? data.userCss : s.userCss,
        mods: data.mods ? mergeById(BUILTIN_MODS, data.mods) : s.mods,
        shaders: data.shaders ? mergeById(BUILTIN_SHADERS, data.shaders) : s.shaders,
        widgets: data.widgets ? mergeById(BUILTIN_WIDGETS, data.widgets) : s.widgets,
        variants: data.variants ? mergeById(BUILTIN_VARIANTS, data.variants) : s.variants,
      }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public resetAll(): void {
    this.state = createDefaultState();
    this.emit();
  }
}

export const modStore = new ModEngineStore();

export function useMods(): ModState {
  return useSyncExternalStore(modStore.subscribe, modStore.getSnapshot);
}
