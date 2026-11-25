import {
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Eye,
  LayoutPanelTop,
  Monitor,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  color as tslColor,
  dot,
  float,
  max,
  mix,
  normalView,
  normalWorld,
  positionViewDirection,
  pow,
  smoothstep,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import {
  HDRI_PRESETS,
  modStore,
  useMods,
  type Desktop3dSceneKind,
  type HdriPresetId,
} from "../core/mod-store.ts";
import { reactiveEngine } from "../core/reactive-mod-engine.ts";
import { useWm, wmStore, type WorkspaceId } from "../wm/wm-store.ts";
import {
  CUBE_HALF_SIZE,
  computeSpatialWindowPoses,
  spatial3dBridge,
  toCameraCSSMatrix,
  toObjectCSSMatrix,
  type CameraCommand,
  type Spatial3dLayoutKind,
  type SpatialWindowPose,
} from "./spatial-3d-bridge.ts";

// Verified CORS + CORP 4K NASA Planet Textures (jsDelivr — 100% COEP safe!)
const PLANET_TEX = {
  earthSurface: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_earth_surface.jpg",
  earthNormal: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_earth_normal.jpg",
  earthSpecular: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_earth_specular.jpg",
  earthClouds: "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png",
  moonSurface: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_moon_surface.jpg",
  moonNormal: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_moon_normal.jpg",
  jupiterSurface: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_jupiter.jpg",
  jupiterBump: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/4k_jupiter_bump.jpg",
  lensFlare: "https://cdn.jsdelivr.net/gh/rikyoz/SolarSystemSimulator@master/textures/lensFlare.png",
} as const;

const LAYOUT_BUTTONS: readonly { id: Spatial3dLayoutKind; label: string; emoji: string }[] = [
  { id: "curved-cockpit", label: "Arc", emoji: "🥽" },
  { id: "spatial-grid", label: "Grille", emoji: "⊞" },
  { id: "compiz-cube", label: "Cube", emoji: "🧊" },
  { id: "studio-desk", label: "Ailes", emoji: "🖥️" },
  { id: "gallery-ring", label: "360°", emoji: "🪐" },
];

const WORLD_BUTTONS: readonly { id: Desktop3dSceneKind; label: string }[] = [
  { id: "ocean-sunset", label: "🌊 Océan & Coucher de Soleil" },
  { id: "alpine-fjord", label: "🏔️ Fjord Alpin & Lac Miroir" },
  { id: "earth-orbit", label: "🌍 Orbite Terrestre (NASA 4K)" },
  { id: "jupiter-orbit", label: "🪐 Orbite Jupiter (NASA 4K)" },
  { id: "lunar-horizon", label: "🌙 Horizon Lunaire & Terre 4K" },
  { id: "aurora-fjord", label: "🌌 Aurores Boréales & Mer Glacée" },
];

interface PhysicalWindowMesh {
  group: THREE.Group;
  rails: THREE.Mesh[];
  rimMesh: THREE.LineSegments;
  width: number;
  height: number;
}

const hdriTextureCache = new Map<string, THREE.DataTexture>();
const imageTextureCache = new Map<string, THREE.Texture>();

function loadCachedTexture(url: string, srgb = true, maxAniso = 8): THREE.Texture {
  const key = `${url}|${srgb ? "s" : "l"}`;
  const existing = imageTextureCache.get(key);
  if (existing) return existing;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const tex = loader.load(url);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  imageTextureCache.set(key, tex);
  return tex;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest(".xterm, .monaco-editor, .cm-editor, [contenteditable='true']")) return true;
  return false;
}

/** Deterministic smooth 2D hash & FBM value noise for cinematic alpine mountains, islands & craters! */
function hash2(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function vnoise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2(x: number, z: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise2(x * freq, z * freq);
    freq *= 2.04;
    amp *= 0.49;
  }
  return sum;
}

function createStarTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0.5, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(224,242,254,0.85)");
  g.addColorStop(0.55, "rgba(147,197,253,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createSunGlowTexture(innerHex: string, midHex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  g.addColorStop(0, innerHex);
  g.addColorStop(0.24, midHex);
  g.addColorStop(0.6, "rgba(251,146,60,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createAuroraTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, "rgba(16, 185, 129, 0)");
  grad.addColorStop(0.18, "rgba(52, 211, 153, 0.92)");
  grad.addColorStop(0.45, "rgba(34, 211, 238, 0.72)");
  grad.addColorStop(0.74, "rgba(168, 85, 247, 0.45)");
  grad.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Add fine vertical luminous curtain streaks
  for (let x = 0; x < 512; x += 3) {
    const a = 0.06 + 0.28 * Math.pow(Math.abs(Math.sin(x * 0.085) * Math.cos(x * 0.031)), 1.5);
    ctx.fillStyle = `rgba(210, 255, 245, ${a.toFixed(3)})`;
    ctx.fillRect(x, 22, 2, 195);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createStarfield(count: number, radiusMin: number, radiusMax: number, starTex: THREE.Texture): THREE.Group {
  const grp = new THREE.Group();
  const palette = [
    new THREE.Color("#ffffff"),
    new THREE.Color("#dbeafe"),
    new THREE.Color("#bae6fd"),
    new THREE.Color("#fef3c7"),
    new THREE.Color("#e0e7ff"),
  ];
  const makeLayer = (n: number, size: number, opacity: number) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2 * v - 1);
      const r = radiusMin + Math.random() * (radiusMax - radiusMin);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = palette[i % palette.length]!;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size,
        map: starTex,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      })
    );
  };
  grp.add(makeLayer(Math.round(count * 0.8), 44, 0.85));
  grp.add(makeLayer(Math.round(count * 0.2), 110, 0.96));
  return grp;
}

/**
 * Cinema-Grade Volumetric Rayleigh + Mie Planetary Atmosphere (Three.js WebGPU TSL Node Material):
 * - Layer 1 (FrontSide): Smooth Fresnel horizon haze + warm golden-orange terminator scatter on the sunlit hemisphere.
 * - Layer 2 (BackSide): Exponentially decaying outer atmospheric glow fading seamlessly to 0 into black space (ZERO hard bands!).
 */
function createVolumetricAtmosphere(
  planetRadius: number,
  dayColorHex: string,
  twilightColorHex: string,
  sunDirection: THREE.Vector3,
  intensity = 1.25
): { group: THREE.Group; disposables: Array<{ dispose: () => void }> } {
  const grp = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const sd = sunDirection.clone().normalize();
  const sunDirNode = vec3(sd.x, sd.y, sd.z);
  const cDay = tslColor(dayColorHex);
  const cTwilight = tslColor(twilightColorHex);

  // Layer 1: Inner Rayleigh Fresnel surface scatter + twilight terminator band
  const innerGeo = new THREE.SphereGeometry(planetRadius * 1.012, 112, 80);
  const innerMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    fog: false,
  });
  const ndotvInner = max(dot(normalView, positionViewDirection), float(0.0));
  const fresnelInner = pow(float(1.0).sub(ndotvInner), float(3.2));
  const sunDot = dot(normalWorld, sunDirNode);
  const dayMask = smoothstep(float(-0.28), float(0.45), sunDot);
  const twilightMask = smoothstep(float(-0.34), float(0.02), sunDot).mul(
    float(1.0).sub(smoothstep(float(0.02), float(0.38), sunDot))
  );
  const scatterCol = mix(cDay, cTwilight, twilightMask.mul(0.55));
  innerMat.colorNode = scatterCol.mul(fresnelInner).mul(dayMask).mul(float(intensity * 1.15));
  innerMat.opacityNode = fresnelInner.mul(dayMask).mul(float(0.95));
  disposables.push(innerGeo, innerMat);
  grp.add(new THREE.Mesh(innerGeo, innerMat));

  // Layer 2: Outer exponential soft atmospheric limb scatter halo (fades seamlessly to 0 at edge!)
  const outerGeo = new THREE.SphereGeometry(planetRadius * 1.095, 112, 80);
  const outerMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    fog: false,
  });
  const ndotvOuter = max(dot(normalView.negate(), positionViewDirection), float(0.0));
  const softLimb = pow(ndotvOuter, float(5.2));
  const outerDay = smoothstep(float(-0.35), float(0.35), sunDot);
  outerMat.colorNode = cDay.mul(softLimb).mul(outerDay).mul(float(intensity * 1.65));
  outerMat.opacityNode = softLimb.mul(outerDay).mul(float(0.9));
  disposables.push(outerGeo, outerMat);
  grp.add(new THREE.Mesh(outerGeo, outerMat));

  return { group: grp, disposables };
}

/** Resolves the sharpest 4K HDRI URL for a given preset & active cinematic world! */
function resolveHdriUrl(preset: HdriPresetId, customUrl: string, sceneKind: Desktop3dSceneKind): string {
  if (preset === "space-void") return "";
  if (preset === "custom") return customUrl.trim();
  if (preset === "auto") {
    if (sceneKind === "ocean-sunset") {
      return HDRI_PRESETS.find((h) => h.id === "venice-4k")?.url ?? "";
    }
    if (sceneKind === "alpine-fjord") {
      return HDRI_PRESETS.find((h) => h.id === "alpine-4k")?.url ?? "";
    }
    if (sceneKind === "aurora-fjord") {
      return HDRI_PRESETS.find((h) => h.id === "night-4k")?.url ?? "";
    }
    // Space worlds (Earth Orbit, Jupiter Orbit, Lunar Horizon) look crispest against pure deep black starspace!
    return "";
  }
  return HDRI_PRESETS.find((h) => h.id === preset)?.url ?? "";
}

interface EnvRuntime {
  group: THREE.Group;
  fogColor: string;
  fogDensity: number;
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  update: (t: number, speed: number) => void;
  dispose: () => void;
}

/**
 * Builds 6 genuinely breathtaking, film-grade cinematic 3D worlds (NO boring boxes or office desks!):
 * 1. ocean-sunset   — Animated Gerstner wave ocean, golden sunset reflections & volcanic islands
 * 2. alpine-fjord   — Sculpted multi-octave FBM snow-capped alpine mountains & glacial mirror lake
 * 3. earth-orbit    — Colossal 4K NASA rotating Earth, 4K clouds, Rayleigh atmosphere, 4K Moon & Sun flare
 * 4. jupiter-orbit  — Colossal 4K NASA Jupiter, amber limb glow, ring, orbiting Io & Europa moons
 * 5. lunar-horizon  — 4K NASA cratered lunar surface ridge with colossal 4K Earthrise above the horizon
 * 6. aurora-fjord   — Animated 3D volumetric Aurora Borealis curtains reflected on icy arctic sea + icebergs
 */
function buildCinematicWorld(
  world: Desktop3dSceneKind,
  layout: Spatial3dLayoutKind,
  particleDensity: number,
  starTex: THREE.Texture
): EnvRuntime {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };
  const updaters: Array<(t: number, speed: number) => void> = [];

  // Ultra-subtle Compiz Cube wireframe ONLY when layout === "compiz-cube" (never blocks cinematic vistas!)
  if (layout === "compiz-cube") {
    const coreGeo = geo(new THREE.BoxGeometry(CUBE_HALF_SIZE * 2, 920, CUBE_HALF_SIZE * 2));
    const cubeEdges = new THREE.LineSegments(
      geo(new THREE.EdgesGeometry(coreGeo)),
      mat(new THREE.LineBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.24 }))
    );
    cubeEdges.position.y = 45;
    group.add(cubeEdges);
  }

  // ─── 1. OCEAN SUNSET (Animated Reflective Ocean + Volcanic Archipelago + Golden Sun) ───
  if (world === "ocean-sunset") {
    const segs = 112;
    const oceanGeo = geo(new THREE.PlaneGeometry(46000, 46000, segs, segs));
    oceanGeo.rotateX(-Math.PI / 2);
    const posAttr = oceanGeo.attributes.position as THREE.BufferAttribute;
    const baseX = new Float32Array(posAttr.count);
    const baseZ = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      baseX[i] = posAttr.getX(i);
      baseZ[i] = posAttr.getZ(i);
    }

    const oceanMat = mat(
      new THREE.MeshPhysicalMaterial({
        color: "#083344",
        emissive: "#041824",
        emissiveIntensity: 0.25,
        metalness: 0.84,
        roughness: 0.14,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        reflectivity: 1.0,
      })
    );
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.position.y = -580;
    ocean.receiveShadow = true;
    group.add(ocean);

    // Sculpted distant volcanic archipelago islands along the golden horizon!
    const islandMat = mat(
      new THREE.MeshStandardMaterial({
        color: "#1e1b2e",
        roughness: 0.88,
        metalness: 0.08,
      })
    );
    const islands = [
      { x: -7800, z: -13200, r: 4200, h: 1650 },
      { x: 6400, z: -14600, r: 5200, h: 2100 },
      { x: -13500, z: -5500, r: 3600, h: 1250 },
      { x: 13800, z: -4200, r: 3800, h: 1350 },
      { x: 1200, z: -18500, r: 3400, h: 980 },
    ];
    for (const isl of islands) {
      const iGeo = geo(new THREE.PlaneGeometry(isl.r * 2, isl.r * 2, 42, 42));
      iGeo.rotateX(-Math.PI / 2);
      const ip = iGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ip.count; i++) {
        const vx = ip.getX(i);
        const vz = ip.getZ(i);
        const d = Math.hypot(vx, vz) / isl.r;
        const falloff = Math.max(0, 1 - d * d);
        const ridge = fbm2((vx + isl.x) * 0.00075, (vz + isl.z) * 0.00075, 5);
        ip.setY(i, Math.pow(falloff, 1.55) * isl.h * (0.45 + ridge * 1.05) - 90);
      }
      iGeo.computeVertexNormals();
      const m = new THREE.Mesh(iGeo, islandMat);
      m.position.set(isl.x, -580, isl.z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // Glowing Golden Sunset Solar Disc + Atmospheric Halo on the horizon!
    const sunTex = createSunGlowTexture("rgba(255,250,220,1)", "rgba(251,191,36,0.72)");
    disposables.push(sunTex);
    const sunSprite = new THREE.Sprite(
      mat(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    sunSprite.position.set(-1600, 1450, -19500);
    sunSprite.scale.set(7800, 7800, 1);
    group.add(sunSprite);

    // Subtle floating golden sea mist motes
    const mCount = Math.round(420 * particleDensity);
    const mPos = new Float32Array(mCount * 3);
    for (let i = 0; i < mCount; i++) {
      mPos[i * 3] = (Math.random() - 0.5) * 14000;
      mPos[i * 3 + 1] = -480 + Math.random() * 1400;
      mPos[i * 3 + 2] = (Math.random() - 0.5) * 14000;
    }
    const mGeo = geo(new THREE.BufferGeometry());
    mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    const mist = new THREE.Points(
      mGeo,
      mat(
        new THREE.PointsMaterial({
          size: 46,
          map: starTex,
          color: "#fde68a",
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    group.add(mist);

    let normTick = 0;
    updaters.push((t, sp) => {
      const wt = t * Math.max(0.25, sp) * 0.95;
      for (let i = 0; i < posAttr.count; i++) {
        const x = baseX[i]!;
        const z = baseZ[i]!;
        const y =
          Math.sin(x * 0.0014 + wt * 1.25) * 34 +
          Math.cos(z * 0.0017 - wt * 1.05) * 28 +
          Math.sin((x + z) * 0.0028 + wt * 1.7) * 14 +
          Math.cos((x * 0.6 - z) * 0.0042 - wt * 2.1) * 7;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      // Recompute smooth normals every 2nd frame for 60fps liquid reflections!
      if ((normTick++ & 1) === 0) oceanGeo.computeVertexNormals();
      mist.rotation.y = t * 0.008 * sp;
    });

    return {
      group,
      fogColor: "#1b1426",
      fogDensity: 0.000028,
      sunPos: [-2200, 1400, -4500],
      sunColor: "#fdba74",
      sunIntensity: 2.6,
      hemiSky: "#fde68a",
      hemiGround: "#0c4a6e",
      update: (t, s) => {
        for (const u of updaters) u(t, s);
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ─── 2. ALPINE FJORD & MIRROR LAKE (Procedural FBM Snow Mountains + Mirror Water) ───
  if (world === "alpine-fjord") {
    const terrainGeo = geo(new THREE.PlaneGeometry(38000, 38000, 124, 124));
    terrainGeo.rotateX(-Math.PI / 2);
    const tp = terrainGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(tp.count * 3);

    const cShore = new THREE.Color("#1e293b");
    const cPine = new THREE.Color("#14332a");
    const cRock = new THREE.Color("#475569");
    const cSnow = new THREE.Color("#f1f5f9");
    const tmpCol = new THREE.Color();

    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const z = tp.getZ(i);
      const dist = Math.hypot(x, z);
      // Carve a wide crystal-clear glacial fjord lake in the center (r < 4200), rising into dramatic snow peaks around it!
      const ringFactor = THREE.MathUtils.smoothstep(dist, 3400, 10500);
      const n1 = fbm2(x * 0.00026 + 4.2, z * 0.00026 - 1.7, 5);
      const ridge = 1.0 - Math.abs(fbm2(x * 0.00042 - 3.1, z * 0.00042 + 6.4, 4) * 2 - 1);
      const h = ringFactor * (1400 + Math.pow(ridge, 1.8) * 4400 + n1 * 1800) - 720;
      tp.setY(i, h);

      if (h < -520) tmpCol.copy(cShore);
      else if (h < 320) tmpCol.copy(cPine).lerp(cRock, THREE.MathUtils.clamp((h + 520) / 840, 0, 1));
      else if (h < 1550) tmpCol.copy(cRock).lerp(cSnow, THREE.MathUtils.clamp((h - 320) / 1230, 0, 1));
      else tmpCol.copy(cSnow);

      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }
    terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrain = new THREE.Mesh(
      terrainGeo,
      mat(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.84,
          metalness: 0.06,
        })
      )
    );
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    group.add(terrain);

    // Calm Glacial Mirror Lake surface with gentle ripples!
    const lakeGeo = geo(new THREE.PlaneGeometry(24000, 24000, 72, 72));
    lakeGeo.rotateX(-Math.PI / 2);
    const lp = lakeGeo.attributes.position as THREE.BufferAttribute;
    const lx = new Float32Array(lp.count);
    const lz = new Float32Array(lp.count);
    for (let i = 0; i < lp.count; i++) {
      lx[i] = lp.getX(i);
      lz[i] = lp.getZ(i);
    }
    const lake = new THREE.Mesh(
      lakeGeo,
      mat(
        new THREE.MeshPhysicalMaterial({
          color: "#0b2e3d",
          metalness: 0.9,
          roughness: 0.08,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          transparent: true,
          opacity: 0.94,
        })
      )
    );
    lake.position.y = -580;
    lake.receiveShadow = true;
    group.add(lake);

    // Drifting translucent cloud wisps floating along the mountain ridges
    const cloudTex = createSunGlowTexture("rgba(255,255,255,0.42)", "rgba(226,232,240,0.16)");
    disposables.push(cloudTex);
    const clouds: Array<{ sp: THREE.Sprite; baseAngle: number; rad: number; y: number }> = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(
        mat(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.48, depthWrite: false }))
      );
      const rad = 6400 + (i % 4) * 2100;
      const y = 950 + (i % 5) * 420;
      const baseAngle = (i / 16) * Math.PI * 2;
      sp.scale.set(5200 + (i % 3) * 1400, 1400, 1);
      sp.position.set(Math.cos(baseAngle) * rad, y, Math.sin(baseAngle) * rad);
      group.add(sp);
      clouds.push({ sp, baseAngle, rad, y });
    }

    let nTick = 0;
    updaters.push((t, sp) => {
      const wt = t * Math.max(0.2, sp) * 0.7;
      for (let i = 0; i < lp.count; i++) {
        const y = Math.sin(lx[i]! * 0.002 + wt) * 10 + Math.cos(lz[i]! * 0.0023 - wt * 0.85) * 9;
        lp.setY(i, y);
      }
      lp.needsUpdate = true;
      if ((nTick++ & 2) === 0) lakeGeo.computeVertexNormals();
      for (const c of clouds) {
        const a = c.baseAngle + t * 0.008 * sp;
        c.sp.position.set(Math.cos(a) * c.rad, c.y, Math.sin(a) * c.rad);
      }
    });

    return {
      group,
      fogColor: "#142234",
      fogDensity: 0.000022,
      sunPos: [3800, 3200, -2800],
      sunColor: "#fff7ed",
      sunIntensity: 2.5,
      hemiSky: "#bae6fd",
      hemiGround: "#1e293b",
      update: (t, s) => {
        for (const u of updaters) u(t, s);
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ─── 3. EARTH ORBIT — AAA CINEMATIC NASA 4K EARTH + VOLUMETRIC RAYLEIGH ATMOSPHERE + 4K MOON ───
  if (world === "earth-orbit") {
    const stars = createStarfield(Math.round(4500 * particleDensity), 16000, 38000, starTex);
    stars.traverse((obj) => {
      if (obj instanceof THREE.Points) disposables.push(obj.geometry, obj.material as THREE.Material);
    });
    group.add(stars);

    const sunPosVec = new THREE.Vector3(-9200, 5200, -11000);
    const earthGroup = new THREE.Group();
    earthGroup.position.set(0, -6120, -1900);
    earthGroup.rotation.z = 0.22;
    group.add(earthGroup);

    const earthSurf = loadCachedTexture(PLANET_TEX.earthSurface, true, 16);
    const earthNorm = loadCachedTexture(PLANET_TEX.earthNormal, false, 16);
    const earthSpec = loadCachedTexture(PLANET_TEX.earthSpecular, false, 16);
    const earthCloudsTex = loadCachedTexture(PLANET_TEX.earthClouds, true, 16);

    // 128x96 ultra-smooth sphere, ZERO shadow-acne (receiveShadow = false!)
    const earth = new THREE.Mesh(
      geo(new THREE.SphereGeometry(5600, 128, 96)),
      mat(
        new THREE.MeshStandardMaterial({
          map: earthSurf,
          normalMap: earthNorm,
          normalScale: new THREE.Vector2(1.2, 1.2),
          roughnessMap: earthSpec,
          roughness: 0.68,
          metalness: 0.08,
          fog: false,
        })
      )
    );
    earth.receiveShadow = false;
    earth.castShadow = false;
    earthGroup.add(earth);

    // Drifting 4K Volumetric Cloud Layer (+88 altitude clearance — ZERO z-fighting!)
    const clouds = new THREE.Mesh(
      geo(new THREE.SphereGeometry(5688, 112, 80)),
      mat(
        new THREE.MeshStandardMaterial({
          map: earthCloudsTex,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          roughness: 0.92,
          metalness: 0.0,
          fog: false,
        })
      )
    );
    clouds.receiveShadow = false;
    clouds.castShadow = false;
    earthGroup.add(clouds);

    // TRUE AAA Volumetric Rayleigh + Twilight Atmosphere (NO flat cyan band!)
    const atmo = createVolumetricAtmosphere(5600, "#38bdf8", "#fb923c", sunPosVec, 1.35);
    disposables.push(...atmo.disposables);
    earthGroup.add(atmo.group);

    // Crisp 4K NASA Moon suspended in upper distant orbit (ZERO shadow-acne!)
    const moonSurf = loadCachedTexture(PLANET_TEX.moonSurface, true, 16);
    const moonNorm = loadCachedTexture(PLANET_TEX.moonNormal, false, 16);
    const moon = new THREE.Mesh(
      geo(new THREE.SphereGeometry(820, 96, 64)),
      mat(
        new THREE.MeshStandardMaterial({
          map: moonSurf,
          normalMap: moonNorm,
          normalScale: new THREE.Vector2(1.3, 1.3),
          roughness: 0.94,
          metalness: 0.02,
          fog: false,
        })
      )
    );
    moon.receiveShadow = false;
    moon.castShadow = false;
    moon.position.set(5200, 2950, -11200);
    group.add(moon);

    // Blazing Orbital Sun with NASA Lens Flare!
    const flareTex = loadCachedTexture(PLANET_TEX.lensFlare, true);
    const sunFlare = new THREE.Sprite(
      mat(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    );
    sunFlare.position.set(-10500, 5800, -17200);
    sunFlare.scale.set(9600, 9600, 1);
    group.add(sunFlare);

    updaters.push((t, sp) => {
      earth.rotation.y = 1.65 + t * 0.012 * sp;
      clouds.rotation.y = 1.65 + t * 0.017 * sp;
      moon.rotation.y = t * 0.022 * sp;
      stars.rotation.y = t * 0.0018 * sp;
    });

    return {
      group,
      fogColor: "#01030a",
      fogDensity: 0.0,
      sunPos: [sunPosVec.x, sunPosVec.y, sunPosVec.z],
      sunColor: "#fffaf0",
      sunIntensity: 3.2,
      hemiSky: "#60a5fa",
      hemiGround: "#030712",
      update: (t, s) => {
        for (const u of updaters) u(t, s);
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ─── 4. JUPITER ORBIT — AAA COLOSSAL 4K NASA JUPITER + VOLUMETRIC AMBER ATMOSPHERE + MOONS ───
  if (world === "jupiter-orbit") {
    const stars = createStarfield(Math.round(4600 * particleDensity), 16000, 38000, starTex);
    stars.traverse((obj) => {
      if (obj instanceof THREE.Points) disposables.push(obj.geometry, obj.material as THREE.Material);
    });
    group.add(stars);

    const sunPosVec = new THREE.Vector3(9800, 4800, -11000);
    const jupSurf = loadCachedTexture(PLANET_TEX.jupiterSurface, true, 16);
    const jupBump = loadCachedTexture(PLANET_TEX.jupiterBump, false, 16);
    const jupiterGroup = new THREE.Group();
    jupiterGroup.position.set(-600, -5450, -4800);
    jupiterGroup.rotation.z = -0.14;
    group.add(jupiterGroup);

    const jupiter = new THREE.Mesh(
      geo(new THREE.SphereGeometry(6400, 128, 96)),
      mat(
        new THREE.MeshStandardMaterial({
          map: jupSurf,
          bumpMap: jupBump,
          bumpScale: 24,
          roughness: 0.78,
          metalness: 0.02,
          fog: false,
        })
      )
    );
    jupiter.receiveShadow = false;
    jupiter.castShadow = false;
    jupiterGroup.add(jupiter);

    // Volumetric Warm Amber-Terracotta Gas Giant Atmosphere (ZERO hard edge!)
    const jupAtmo = createVolumetricAtmosphere(6400, "#fbbf24", "#ea580c", sunPosVec, 1.15);
    disposables.push(...jupAtmo.disposables);
    jupiterGroup.add(jupAtmo.group);

    // Delicate Jovian Gossamer Dust Ring
    const ring = new THREE.Mesh(
      geo(new THREE.RingGeometry(7400, 9600, 144)),
      mat(
        new THREE.MeshBasicMaterial({
          color: "#d6b48c",
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
        })
      )
    );
    ring.rotation.x = Math.PI / 2 - 0.18;
    jupiterGroup.add(ring);

    // Orbiting Galilean Moons: Io (volcanic amber) & Europa (icy blue)
    const moonSurf = loadCachedTexture(PLANET_TEX.moonSurface, true, 16);
    const moonNorm = loadCachedTexture(PLANET_TEX.moonNormal, false, 16);
    const europa = new THREE.Mesh(
      geo(new THREE.SphereGeometry(440, 64, 48)),
      mat(new THREE.MeshStandardMaterial({ map: moonSurf, normalMap: moonNorm, color: "#bae6fd", roughness: 0.45, metalness: 0.1, fog: false }))
    );
    const io = new THREE.Mesh(
      geo(new THREE.SphereGeometry(380, 64, 48)),
      mat(new THREE.MeshStandardMaterial({ map: moonSurf, normalMap: moonNorm, color: "#fbbf24", roughness: 0.82, fog: false }))
    );
    group.add(europa, io);

    const flareTex = loadCachedTexture(PLANET_TEX.lensFlare, true);
    const sunFlare = new THREE.Sprite(
      mat(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    );
    sunFlare.position.set(11200, 5200, -16200);
    sunFlare.scale.set(8200, 8200, 1);
    group.add(sunFlare);

    updaters.push((t, sp) => {
      jupiter.rotation.y = 0.8 + t * 0.02 * sp;
      const a1 = 0.7 + t * 0.045 * sp;
      europa.position.set(Math.cos(a1) * 5800 + 1800, 1500 + Math.sin(a1) * 520, -7600 + Math.sin(a1) * 2800);
      const a2 = -1.2 + t * 0.068 * sp;
      io.position.set(Math.cos(a2) * 4200 - 2200, 2200, -9200 + Math.sin(a2) * 2400);
      stars.rotation.y = t * 0.0018 * sp;
    });

    return {
      group,
      fogColor: "#040308",
      fogDensity: 0.0,
      sunPos: [sunPosVec.x, sunPosVec.y, sunPosVec.z],
      sunColor: "#ffedd5",
      sunIntensity: 3.1,
      hemiSky: "#fbbf24",
      hemiGround: "#1c1208",
      update: (t, s) => {
        for (const u of updaters) u(t, s);
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ─── 5. LUNAR HORIZON & AAA 4K EARTHRISE (NASA 4K Cratered Moon Terrain + Volumetric Earthrise!) ───
  if (world === "lunar-horizon") {
    const stars = createStarfield(Math.round(4600 * particleDensity), 16000, 38000, starTex);
    stars.traverse((obj) => {
      if (obj instanceof THREE.Points) disposables.push(obj.geometry, obj.material as THREE.Material);
    });
    group.add(stars);

    const sunPosVec = new THREE.Vector3(-8500, 3200, 4200);
    const moonSurf = loadCachedTexture(PLANET_TEX.moonSurface, true, 16);
    const moonNorm = loadCachedTexture(PLANET_TEX.moonNormal, false, 16);
    moonSurf.wrapS = moonSurf.wrapT = THREE.RepeatWrapping;
    moonNorm.wrapS = moonNorm.wrapT = THREE.RepeatWrapping;
    moonSurf.repeat.set(3, 3);
    moonNorm.repeat.set(3, 3);

    const lunarGeo = geo(new THREE.PlaneGeometry(36000, 36000, 128, 128));
    lunarGeo.rotateX(-Math.PI / 2);
    const lp = lunarGeo.attributes.position as THREE.BufferAttribute;
    const craters = [
      { x: -2400, z: -2600, r: 1650, d: 340 },
      { x: 3600, z: -3800, r: 2200, d: 460 },
      { x: -5800, z: -6400, r: 2800, d: 520 },
      { x: 1200, z: -7800, r: 1900, d: 380 },
      { x: 5400, z: 1400, r: 1700, d: 310 },
    ];
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i);
      const z = lp.getZ(i);
      const dist = Math.hypot(x, z);
      let y = -620 - dist * dist * 0.0000045 + fbm2(x * 0.00032, z * 0.00032, 5) * 620;
      for (const c of craters) {
        const cd = Math.hypot(x - c.x, z - c.z) / c.r;
        if (cd < 1.35) {
          if (cd < 0.85) y -= (1 - (cd / 0.85) ** 2) * c.d;
          else y += Math.sin(((cd - 0.85) / 0.5) * Math.PI) * (c.d * 0.36);
        }
      }
      lp.setY(i, y);
    }
    lunarGeo.computeVertexNormals();

    const lunarGround = new THREE.Mesh(
      lunarGeo,
      mat(
        new THREE.MeshStandardMaterial({
          map: moonSurf,
          normalMap: moonNorm,
          normalScale: new THREE.Vector2(1.8, 1.8),
          roughness: 0.94,
          metalness: 0.04,
          fog: false,
        })
      )
    );
    lunarGround.receiveShadow = false;
    lunarGround.castShadow = false;
    group.add(lunarGround);

    // Colossal AAA Volumetric 4K Earthrise hanging over the lunar horizon!
    const earthSurf = loadCachedTexture(PLANET_TEX.earthSurface, true, 16);
    const earthCloudsTex = loadCachedTexture(PLANET_TEX.earthClouds, true, 16);
    const earthRise = new THREE.Group();
    earthRise.position.set(1600, 2650, -13800);
    group.add(earthRise);

    const earthSphere = new THREE.Mesh(
      geo(new THREE.SphereGeometry(2650, 112, 80)),
      mat(new THREE.MeshStandardMaterial({ map: earthSurf, roughness: 0.65, metalness: 0.08, fog: false }))
    );
    earthRise.add(earthSphere);
    const earthCloudSphere = new THREE.Mesh(
      geo(new THREE.SphereGeometry(2700, 96, 64)),
      mat(new THREE.MeshStandardMaterial({ map: earthCloudsTex, transparent: true, opacity: 0.88, depthWrite: false, fog: false }))
    );
    earthRise.add(earthCloudSphere);
    const riseAtmo = createVolumetricAtmosphere(2650, "#38bdf8", "#fb923c", sunPosVec, 1.35);
    disposables.push(...riseAtmo.disposables);
    earthRise.add(riseAtmo.group);

    updaters.push((t, sp) => {
      earthSphere.rotation.y = 2.1 + t * 0.016 * sp;
      earthCloudSphere.rotation.y = 2.1 + t * 0.022 * sp;
      stars.rotation.y = t * 0.0015 * sp;
    });

    return {
      group,
      fogColor: "#010206",
      fogDensity: 0.0,
      sunPos: [sunPosVec.x, sunPosVec.y, sunPosVec.z],
      sunColor: "#ffffff",
      sunIntensity: 3.1,
      hemiSky: "#93c5fd",
      hemiGround: "#090b12",
      update: (t, s) => {
        for (const u of updaters) u(t, s);
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ─── 6. AURORA BOREALIS & ARCTIC ICEBERG SEA (Animated 3D Volumetric Aurora Ribbons!) ───
  const stars = createStarfield(Math.round(3600 * particleDensity), 14000, 34000, starTex);
  stars.traverse((obj) => {
    if (obj instanceof THREE.Points) disposables.push(obj.geometry, obj.material as THREE.Material);
  });
  group.add(stars);

  // Dark Reflective Arctic Sea
  const seaGeo = geo(new THREE.PlaneGeometry(42000, 42000, 88, 88));
  seaGeo.rotateX(-Math.PI / 2);
  const spAttr = seaGeo.attributes.position as THREE.BufferAttribute;
  const sx = new Float32Array(spAttr.count);
  const sz = new Float32Array(spAttr.count);
  for (let i = 0; i < spAttr.count; i++) {
    sx[i] = spAttr.getX(i);
    sz[i] = spAttr.getZ(i);
  }
  const sea = new THREE.Mesh(
    seaGeo,
    mat(
      new THREE.MeshPhysicalMaterial({
        color: "#03131c",
        emissive: "#042f2e",
        emissiveIntensity: 0.25,
        metalness: 0.88,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
      })
    )
  );
  sea.position.y = -580;
  sea.receiveShadow = true;
  group.add(sea);

  // Sculpted Crystalline Faceted Icebergs floating in the arctic sea!
  const iceMat = mat(
    new THREE.MeshPhysicalMaterial({
      color: "#cbd5e1",
      emissive: "#083344",
      emissiveIntensity: 0.22,
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 0.9,
      flatShading: true,
    })
  );
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.2;
    const dist = 2900 + (i % 4) * 1900;
    const radius = 320 + ((i * 137) % 680);
    const height = 420 + ((i * 211) % 1450);
    const bergGeo = geo(new THREE.ConeGeometry(radius, height, 6 + (i % 4), 2));
    const bp = bergGeo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < bp.count; k++) {
      bp.setX(k, bp.getX(k) * (0.78 + hash2(k, i) * 0.45));
      bp.setZ(k, bp.getZ(k) * (0.78 + hash2(i, k) * 0.45));
    }
    bergGeo.computeVertexNormals();
    const berg = new THREE.Mesh(bergGeo, iceMat);
    berg.position.set(Math.cos(a) * dist, -580 + height * 0.34, Math.sin(a) * dist);
    berg.rotation.y = i * 1.1;
    berg.castShadow = true;
    berg.receiveShadow = true;
    group.add(berg);
  }

  // 5 Towering Animated 3D Volumetric Aurora Borealis Curtain Ribbons!
  const auroraTex = createAuroraTexture();
  disposables.push(auroraTex);
  const ribbons: Array<{
    geo: THREE.PlaneGeometry;
    basePos: Float32Array;
    phase: number;
    amp: number;
  }> = [];

  for (let r = 0; r < 5; r++) {
    const rGeo = geo(new THREE.PlaneGeometry(18000, 3200, 72, 6));
    const rp = rGeo.attributes.position as THREE.BufferAttribute;
    const basePos = new Float32Array(rp.array.length);
    basePos.set(rp.array as Float32Array);

    const rMat = mat(
      new THREE.MeshBasicMaterial({
        map: auroraTex,
        transparent: true,
        opacity: 0.42 + (r % 2) * 0.14,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const mesh = new THREE.Mesh(rGeo, rMat);
    mesh.position.set((r - 2) * 1800, 2400 + r * 320, -6800 - r * 1450);
    mesh.rotation.y = (r - 2) * 0.24;
    group.add(mesh);
    ribbons.push({ geo: rGeo, basePos, phase: r * 1.35, amp: 520 + r * 130 });
  }

  let aTick = 0;
  updaters.push((t, sp) => {
    const wt = t * Math.max(0.25, sp);
    for (const rb of ribbons) {
      const rp = rb.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rp.count; i++) {
        const bx = rb.basePos[i * 3]!;
        const by = rb.basePos[i * 3 + 1]!;
        const waveZ =
          Math.sin(bx * 0.00045 + wt * 0.55 + rb.phase) * rb.amp +
          Math.cos(bx * 0.0011 - wt * 0.8 + rb.phase) * (rb.amp * 0.35);
        const waveY = Math.sin(bx * 0.0007 + wt * 0.4) * 260;
        rp.setY(i, by + waveY);
        rp.setZ(i, waveZ);
      }
      rp.needsUpdate = true;
    }
    for (let i = 0; i < spAttr.count; i++) {
      spAttr.setY(i, Math.sin(sx[i]! * 0.0016 + wt * 0.9) * 14 + Math.cos(sz[i]! * 0.0018 - wt * 0.7) * 12);
    }
    spAttr.needsUpdate = true;
    if ((aTick++ & 2) === 0) seaGeo.computeVertexNormals();
  });

  return {
    group,
    fogColor: "#040d18",
    fogDensity: 0.000018,
    sunPos: [1800, 2600, -4200],
    sunColor: "#6ee7b7",
    sunIntensity: 2.1,
    hemiSky: "#34d399",
    hemiGround: "#081422",
    update: (t, s) => {
      for (const u of updaters) u(t, s);
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

function computeWindowFocusCamera(
  pose: SpatialWindowPose,
  fovDeg: number,
  viewportH: number
): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const target = new THREE.Vector3(pose.x, pose.y, pose.z);
  const euler = new THREE.Euler(pose.rx, pose.ry, pose.rz, "XYZ");
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize();
  const fovRad = THREE.MathUtils.degToRad(fovDeg);
  const idealDist = Math.max(
    680,
    Math.min(1680, (Math.max(pose.height + 160, viewportH * 0.78) / 2) / Math.tan(fovRad / 2))
  );
  const pos = target.clone().addScaledVector(normal, idealDist);
  return { pos, target };
}

function computeDefaultCamera(
  layout: Spatial3dLayoutKind,
  activeWorkspace: WorkspaceId
): { pos: THREE.Vector3; target: THREE.Vector3 } {
  if (layout === "compiz-cube") {
    const faceAngle = (activeWorkspace - 1) * (Math.PI / 2);
    const dist = CUBE_HALF_SIZE + 1320;
    return {
      pos: new THREE.Vector3(Math.sin(faceAngle) * dist, 160, Math.cos(faceAngle) * dist),
      target: new THREE.Vector3(0, 45, 0),
    };
  }
  if (layout === "spatial-grid") {
    return {
      pos: new THREE.Vector3(0, 160, 2020),
      target: new THREE.Vector3(0, 80, -120),
    };
  }
  if (layout === "studio-desk") {
    return {
      pos: new THREE.Vector3(0, 165, 1520),
      target: new THREE.Vector3(0, 55, -40),
    };
  }
  if (layout === "gallery-ring") {
    return {
      pos: new THREE.Vector3(0, 210, 1600),
      target: new THREE.Vector3(0, 55, -150),
    };
  }
  return {
    pos: new THREE.Vector3(0, 125, 1400),
    target: new THREE.Vector3(0, 45, -120),
  };
}

/**
 * Hollow 4-bar machined metallic 3D perimeter frame around each window so BOTH front AND back
 * are completely open & readable while casting real dynamic shadows!
 */
function createHollowWindowFrame(
  width: number,
  height: number,
  focused: boolean,
  bezelMat: THREE.Material,
  castShadow: boolean
): PhysicalWindowMesh {
  const grp = new THREE.Group();
  const railThick = 14;
  const railDepth = 22;
  const outerW = width + railThick * 2;
  const outerH = height + railThick * 2;

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(outerW, railThick, railDepth), bezelMat);
  topRail.position.set(0, height / 2 + railThick / 2, -2);
  const botRail = new THREE.Mesh(new THREE.BoxGeometry(outerW, railThick, railDepth), bezelMat);
  botRail.position.set(0, -(height / 2 + railThick / 2), -2);
  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(railThick, height, railDepth), bezelMat);
  leftRail.position.set(-(width / 2 + railThick / 2), 0, -2);
  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(railThick, height, railDepth), bezelMat);
  rightRail.position.set(width / 2 + railThick / 2, 0, -2);

  const rails = [topRail, botRail, leftRail, rightRail];
  for (const r of rails) {
    r.castShadow = castShadow;
    r.receiveShadow = true;
    grp.add(r);
  }

  const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(outerW + 2, outerH + 2, railDepth + 2));
  const rimMat = new THREE.LineBasicMaterial({ color: focused ? "#38bdf8" : "#475569" });
  const rimMesh = new THREE.LineSegments(rimGeo, rimMat);
  rimMesh.position.z = -2;
  grp.add(rimMesh);

  return { group: grp, rails, rimMesh, width, height };
}

function disposeWindowFrame(scene: THREE.Scene, entry: PhysicalWindowMesh): void {
  scene.remove(entry.group);
  for (const r of entry.rails) r.geometry.dispose();
  entry.rimMesh.geometry.dispose();
  (entry.rimMesh.material as THREE.Material).dispose();
}

export const ThreeDesktop3d: React.FC = () => {
  const wm = useWm();
  const mods = useMods();
  const cfg3d = mods.desktop3d;

  const wmRef = useRef(wm);
  wmRef.current = wm;
  const cfgRef = useRef(cfg3d);
  cfgRef.current = cfg3d;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backendLabel, setBackendLabel] = useState<"WebGPU" | "WebGL2" | "Init…">("Init…");
  const [fps, setFps] = useState(60);
  const [hdriLoading, setHdriLoading] = useState(false);
  const overviewToggleRef = useRef(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const roomEnvTexRef = useRef<THREE.Texture | null>(null);
  const envRef = useRef<EnvRuntime | null>(null);
  const starTexRef = useRef<THREE.Texture | null>(null);
  const windowMeshesRef = useRef<Map<string, PhysicalWindowMesh>>(new Map());
  const flyTargetRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(0, 125, 1400),
    target: new THREE.Vector3(0, 45, -120),
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let raf = 0;
    let renderer: WebGPURenderer | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let envTarget: THREE.WebGLRenderTarget | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#03050a");
    scene.fog = new THREE.FogExp2("#03050a", 0.00002);
    sceneRef.current = scene;

    const FOV = 50;
    const camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / Math.max(1, window.innerHeight),
      20,
      58000
    );
    const initCam = computeDefaultCamera(cfgRef.current.layout, wmRef.current.activeWorkspace);
    camera.position.copy(initCam.pos);

    // Cinema 3-Point Sun + Hemisphere + Rim Lighting
    const hemi = new THREE.HemisphereLight("#dbeafe", "#0b1120", 0.95);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const keyLight = new THREE.DirectionalLight("#fff7ed", 2.5);
    keyLight.position.set(1600, 2600, 1900);
    keyLight.castShadow = cfgRef.current.shadowsEnabled;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far = 16000;
    keyLight.shadow.camera.left = -4500;
    keyLight.shadow.camera.right = 4500;
    keyLight.shadow.camera.top = 4500;
    keyLight.shadow.camera.bottom = -4500;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.normalBias = 24;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.PointLight("#38bdf8", 2.4, 9500, 0.4);
    rimLight.position.set(-1600, 700, 1400);
    scene.add(rimLight);

    const starTex = createStarTexture();
    starTexRef.current = starTex;

    // ─── AAA Mouse, Precision Trackpad & Multi-Touch Controls ────────────────
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.068;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 1.05;
    controls.panSpeed = 1.0;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minDistance = 260;
    controls.maxDistance = 14500;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.target.copy(initCam.target);
    controls.update();

    const cancelFly = () => {
      flyTargetRef.current.active = false;
    };
    controls.addEventListener("start", cancelFly);

    // Reusable temporaries for zero-GC 60fps loop + trackpad gestures
    const tmpObj = new THREE.Object3D();
    const tmpFwd = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpUp = new THREE.Vector3(0, 1, 0);
    const tmpOffset = new THREE.Vector3();
    const tmpSph = new THREE.Spherical();

    // Precision Trackpad & Mouse Wheel Enhancement (2-finger horizontal orbit/pan, Shift+scroll pan, Alt+scroll fly!)
    const onCanvasWheel = (e: WheelEvent) => {
      if (!cfgRef.current.interactiveOrbit) return;
      flyTargetRef.current.active = false;
      // Alt + Wheel: Smooth forward/back camera dolly flight through the 3D scene!
      if (e.altKey) {
        e.preventDefault();
        camera.getWorldDirection(tmpFwd);
        const step = -e.deltaY * 3.2;
        camera.position.addScaledVector(tmpFwd, step);
        controls.target.addScaledVector(tmpFwd, step);
        return;
      }
      // Shift + Wheel or 2-finger Trackpad Horizontal Swipe: Smooth pan / horizontal orbit!
      if (e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        camera.getWorldDirection(tmpFwd);
        tmpRight.crossVectors(tmpFwd, tmpUp).normalize();
        const panScale = Math.max(0.8, camera.position.distanceTo(controls.target) * 0.0012);
        const move = tmpOffset
          .set(0, 0, 0)
          .addScaledVector(tmpRight, e.deltaX * panScale)
          .addScaledVector(tmpUp, e.deltaY * panScale);
        camera.position.add(move);
        controls.target.add(move);
        return;
      }
      // Trackpad 2-finger horizontal swipe (MacBook): smoothly orbits horizontally!
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.15 && Math.abs(e.deltaX) > 1.5) {
        e.preventDefault();
        tmpOffset.copy(camera.position).sub(controls.target);
        tmpSph.setFromVector3(tmpOffset);
        tmpSph.theta -= e.deltaX * 0.0038;
        tmpOffset.setFromSpherical(tmpSph);
        camera.position.copy(controls.target).add(tmpOffset);
      }
    };
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });

    // Double-click empty 3D space: smoothly toggle Cinematic Panorama Overview <-> Workspace View!
    const onCanvasDblClick = () => {
      overviewToggleRef.current = !overviewToggleRef.current;
      spatial3dBridge.dispatchCamera({ kind: overviewToggleRef.current ? "overview" : "reset" });
    };
    canvas.addEventListener("dblclick", onCanvasDblClick);

    // ─── ZQSD / WASD Free-Flight + Arrow Keys Smooth Rotation ────────────────
    const pressedCodes = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      const code = e.code;
      if (code === "KeyR") {
        spatial3dBridge.dispatchCamera({ kind: "reset" });
        return;
      }
      const navCodes = [
        "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyZ", "KeyE", "KeyC",
        "Space", "ShiftLeft", "ShiftRight",
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      ];
      if (navCodes.includes(code)) {
        pressedCodes.add(code);
        flyTargetRef.current.active = false;
        if (code.startsWith("Arrow") || code === "Space") e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => pressedCodes.delete(e.code);
    const onBlur = () => pressedCodes.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    // Subtle glowing holographic rail under the 3D Super Dock!
    const dockGlowBar = new THREE.Mesh(
      new THREE.BoxGeometry(920, 4, 18),
      new THREE.MeshStandardMaterial({
        color: "#38bdf8",
        emissive: "#38bdf8",
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.72,
      })
    );
    scene.add(dockGlowBar);

    const sharedBezelMat = new THREE.MeshPhysicalMaterial({
      color: "#111827",
      metalness: 0.92,
      roughness: 0.14,
      clearcoat: 1.0,
    });

    const syncPhysicalWindows = (poses: readonly SpatialWindowPose[], shadows: boolean) => {
      const seen = new Set<string>();
      for (const p of poses) {
        seen.add(p.id);
        let entry = windowMeshesRef.current.get(p.id);
        if (!entry || Math.abs(entry.width - p.width) > 4 || Math.abs(entry.height - p.height) > 4) {
          if (entry) disposeWindowFrame(scene, entry);
          entry = createHollowWindowFrame(p.width, p.height, p.focused, sharedBezelMat, shadows);
          scene.add(entry.group);
          windowMeshesRef.current.set(p.id, entry);
        }
        entry.group.visible = p.visible;
        if (p.visible) {
          entry.group.position.set(p.x, p.y, p.z);
          entry.group.rotation.set(p.rx, p.ry, p.rz);
          (entry.rimMesh.material as THREE.LineBasicMaterial).color.set(p.focused ? "#38bdf8" : "#334155");
          for (const r of entry.rails) r.castShadow = shadows;
        }
      }
      for (const [id, entry] of windowMeshesRef.current.entries()) {
        if (!seen.has(id)) {
          disposeWindowFrame(scene, entry);
          windowMeshesRef.current.delete(id);
        }
      }
    };

    const unsubCmd = spatial3dBridge.onCameraCommand((cmd: CameraCommand) => {
      if (cmd.kind === "focus-window") {
        const pose = spatial3dBridge.poses.get(cmd.windowId);
        if (pose && pose.visible) {
          const { pos, target } = computeWindowFocusCamera(pose, FOV, window.innerHeight);
          flyTargetRef.current = { pos, target, active: true };
        }
      } else if (cmd.kind === "overview") {
        const layout = cfgRef.current.layout;
        if (layout === "compiz-cube") {
          const ang = (wmRef.current.activeWorkspace - 1) * (Math.PI / 2) + 0.58;
          flyTargetRef.current = {
            pos: new THREE.Vector3(Math.sin(ang) * 3200, 980, Math.cos(ang) * 3200),
            target: new THREE.Vector3(0, 40, 0),
            active: true,
          };
        } else {
          flyTargetRef.current = {
            pos: new THREE.Vector3(960, 820, 2950),
            target: new THREE.Vector3(0, 20, -200),
            active: true,
          };
        }
      } else if (cmd.kind === "workspace") {
        const camGoal = computeDefaultCamera(cfgRef.current.layout, cmd.workspace);
        flyTargetRef.current = { pos: camGoal.pos, target: camGoal.target, active: true };
      } else if (cmd.kind === "reset") {
        const camGoal = computeDefaultCamera(cfgRef.current.layout, wmRef.current.activeWorkspace);
        flyTargetRef.current = { pos: camGoal.pos, target: camGoal.target, active: true };
      }
    });

    const onResize = () => {
      if (!renderer || disposed) return;
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    const applyWorldLighting = (env: EnvRuntime) => {
      scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
      keyLight.position.set(...env.sunPos);
      keyLight.color.set(env.sunColor);
      keyLight.intensity = env.sunIntensity;
      hemi.color.set(env.hemiSky);
      hemi.groundColor.set(env.hemiGround);
    };

    const boot = async () => {
      try {
        const r = new WebGPURenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
        await r.init();
        if (disposed) {
          r.dispose();
          return;
        }
        renderer = r;
        rendererRef.current = r;
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
        r.setSize(window.innerWidth, window.innerHeight, false);
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.1;
        r.shadowMap.enabled = cfgRef.current.shadowsEnabled;
        r.shadowMap.type = THREE.PCFSoftShadowMap;

        const isWebGpu = Boolean((r.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend);
        setBackendLabel(isWebGpu ? "WebGPU" : "WebGL2");

        try {
          pmrem = new THREE.PMREMGenerator(r as unknown as THREE.WebGLRenderer);
          const room = new RoomEnvironment();
          envTarget = pmrem.fromScene(room, 0.04);
          roomEnvTexRef.current = envTarget.texture;
          // Do not clobber a 4K HDRI environment if the HDRI effect already applied one
          if (!scene.environment) {
            scene.environment = envTarget.texture;
          }
          room.dispose();
        } catch {
          // graceful lighting fallback
        }

        // Only build the initial world if the hot-swap effect hasn't already built it during async r.init()
        if (!envRef.current) {
          const initialEnv = buildCinematicWorld(
            cfgRef.current.scene,
            cfgRef.current.layout,
            cfgRef.current.particleDensity,
            starTex
          );
          scene.add(initialEnv.group);
          applyWorldLighting(initialEnv);
          envRef.current = initialEnv;
        }

        let fpsFrames = 0;
        let fpsLast = performance.now();
        let prevFrame = fpsLast;
        const t0 = fpsLast;

        const animate = (now: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(animate);
          if (document.hidden) return;

          const dt = Math.min(0.05, Math.max(0.001, (now - prevFrame) / 1000));
          prevFrame = now;
          const elapsed = (now - t0) / 1000;
          const curCfg = cfgRef.current;
          const curWm = wmRef.current;

          controls.enabled = curCfg.interactiveOrbit;

          // ZQSD / WASD + Arrow Keys navigation
          if (pressedCodes.size > 0 && !isTypingTarget(document.activeElement)) {
            const sprint = pressedCodes.has("ShiftLeft") || pressedCodes.has("ShiftRight") ? 2.4 : 1.0;
            const moveStep = 1450 * (curCfg.moveSpeed || 1.0) * sprint * dt;
            const rotStep = 1.55 * dt;

            const yawInput =
              (pressedCodes.has("ArrowLeft") ? 1 : 0) - (pressedCodes.has("ArrowRight") ? 1 : 0);
            const pitchInput =
              (pressedCodes.has("ArrowUp") ? 1 : 0) - (pressedCodes.has("ArrowDown") ? 1 : 0);

            if (yawInput !== 0 || pitchInput !== 0) {
              tmpOffset.copy(controls.target).sub(camera.position);
              const dist = Math.max(120, tmpOffset.length());
              tmpSph.setFromVector3(tmpOffset);
              tmpSph.theta += yawInput * rotStep;
              tmpSph.phi = Math.max(0.14, Math.min(Math.PI - 0.14, tmpSph.phi - pitchInput * rotStep));
              tmpSph.radius = dist;
              tmpOffset.setFromSpherical(tmpSph);
              controls.target.copy(camera.position).add(tmpOffset);
            }

            const fwdIn =
              (pressedCodes.has("KeyW") || pressedCodes.has("KeyZ") ? 1 : 0) -
              (pressedCodes.has("KeyS") ? 1 : 0);
            const strafeIn =
              (pressedCodes.has("KeyD") ? 1 : 0) -
              (pressedCodes.has("KeyA") || pressedCodes.has("KeyQ") ? 1 : 0);
            const vertIn =
              (pressedCodes.has("Space") || pressedCodes.has("KeyE") ? 1 : 0) -
              (pressedCodes.has("KeyC") ? 1 : 0);

            if (fwdIn !== 0 || strafeIn !== 0 || vertIn !== 0) {
              camera.getWorldDirection(tmpFwd);
              tmpFwd.y = 0;
              if (tmpFwd.lengthSq() < 1e-5) tmpFwd.set(0, 0, -1);
              tmpFwd.normalize();
              tmpRight.crossVectors(tmpFwd, tmpUp).normalize();

              const moveVec = tmpOffset.set(0, 0, 0);
              if (fwdIn !== 0) moveVec.addScaledVector(tmpFwd, fwdIn * moveStep);
              if (strafeIn !== 0) moveVec.addScaledVector(tmpRight, strafeIn * moveStep);
              if (vertIn !== 0) moveVec.y += vertIn * moveStep * 0.85;

              camera.position.add(moveVec);
              controls.target.add(moveVec);
              if (camera.position.y < -480) {
                const lift = -480 - camera.position.y;
                camera.position.y += lift;
                controls.target.y += lift;
              }
            }
          }

          if (flyTargetRef.current.active) {
            camera.position.lerp(flyTargetRef.current.pos, 0.088);
            controls.target.lerp(flyTargetRef.current.target, 0.088);
            if (
              camera.position.distanceTo(flyTargetRef.current.pos) < 4 &&
              controls.target.distanceTo(flyTargetRef.current.target) < 4
            ) {
              flyTargetRef.current.active = false;
            }
          }

          controls.update();
          camera.updateMatrixWorld();

          const w = window.innerWidth;
          const h = Math.max(1, window.innerHeight);
          const poses = computeSpatialWindowPoses(
            curWm.windows,
            curWm.activeWindowId,
            curWm.activeWorkspace,
            curCfg.layout,
            w,
            h,
            spatial3dBridge.depthOffsets
          );

          syncPhysicalWindows(poses, curCfg.shadowsEnabled);

          // Exact CSS3D Camera Stage Transform
          const stage = spatial3dBridge.cameraStageEl;
          if (stage) {
            const fovPx = camera.projectionMatrix.elements[5]! * (h / 2);
            stage.style.transform =
              `perspective(${fovPx.toFixed(2)}px) translateZ(${fovPx.toFixed(2)}px) ` +
              `${toCameraCSSMatrix(camera.matrixWorldInverse)} ` +
              `translate(${(w / 2).toFixed(2)}px, ${(h / 2).toFixed(2)}px)`;
          }

          // Synchronize all open real DOM Windows in 3D space
          spatial3dBridge.poses.clear();
          for (const p of poses) {
            spatial3dBridge.poses.set(p.id, p);
            const el = spatial3dBridge.getWindowEl(p.id);
            if (!el) continue;
            if (!p.visible) {
              el.style.display = "none";
              continue;
            }
            tmpObj.position.set(p.x, p.y, p.z);
            tmpObj.rotation.set(p.rx, p.ry, p.rz);
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrixWorld();
            el.style.display = "flex";
            el.style.left = "0px";
            el.style.top = "0px";
            el.style.width = `${p.width}px`;
            el.style.height = `${p.height}px`;
            el.style.transform = toObjectCSSMatrix(tmpObj.matrixWorld);
          }

          // Synchronize FULL 3D Super Dock / Taskbar + 3D Global Menu inside the 3D Scene!
          const faceAngle =
            curCfg.layout === "compiz-cube" ? (curWm.activeWorkspace - 1) * (Math.PI / 2) : 0;
          const cosF = Math.cos(faceAngle);
          const sinF = Math.sin(faceAngle);
          const dockDist = curCfg.layout === "compiz-cube" ? CUBE_HALF_SIZE + 260 : 320;
          const menuDist = curCfg.layout === "compiz-cube" ? CUBE_HALF_SIZE + 140 : 120;

          const dockEl = spatial3dBridge.dock3dEl;
          if (dockEl && curCfg.spatialChrome3d) {
            const dx = dockDist * sinF;
            const dz = dockDist * cosF;
            tmpObj.position.set(dx, -345, dz);
            tmpObj.rotation.set(-0.2, faceAngle, 0);
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrixWorld();
            dockEl.style.display = "flex";
            dockEl.style.transform = toObjectCSSMatrix(tmpObj.matrixWorld);

            dockGlowBar.visible = true;
            dockGlowBar.position.set(dx, -384, dz - 8 * cosF);
            dockGlowBar.rotation.set(-0.2, faceAngle, 0);
          } else {
            dockGlowBar.visible = false;
            if (dockEl) dockEl.style.transform = "";
          }

          const menuEl = spatial3dBridge.globalMenu3dEl;
          if (menuEl && curCfg.spatialChrome3d) {
            const mx = menuDist * sinF;
            const mz = menuDist * cosF;
            tmpObj.position.set(mx, 495, mz);
            tmpObj.rotation.set(0.08, faceAngle, 0);
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrixWorld();
            menuEl.style.display = "flex";
            menuEl.style.transform = toObjectCSSMatrix(tmpObj.matrixWorld);
          } else if (menuEl) {
            menuEl.style.transform = "";
          }

          // Synchronize custom Reactive Mod 3D Panels (HTML / Iframe / Canvas placed in 3D space!)
          for (const { el, pose } of spatial3dBridge.panel3dEls.values()) {
            tmpObj.position.set(pose.x, pose.y, pose.z);
            tmpObj.rotation.set(pose.rx, pose.ry, pose.rz);
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrixWorld();
            el.style.transform = toObjectCSSMatrix(tmpObj.matrixWorld);
          }

          const liveCpuBoost = 1 + (reactiveEngine.getSignalNumeric("sys.cpu", 15) / 100) * 0.45 + reactiveEngine.getSignalNumeric("agent.active", 0) * 0.35;
          rimLight.intensity = 2.4 * Math.max(0.3, curCfg.bloomIntensity) * liveCpuBoost;
          envRef.current?.update(elapsed, curCfg.cameraSpeed);

          r.render(scene, camera);

          fpsFrames++;
          if (now - fpsLast >= 650) {
            setFps(Math.round((fpsFrames * 1000) / (now - fpsLast)));
            fpsFrames = 0;
            fpsLast = now;
          }
        };

        raf = requestAnimationFrame(animate);
      } catch (err) {
        console.warn("[ThreeDesktop3d] init error:", err);
        setBackendLabel("WebGL2");
      }
    };

    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsubCmd();
      controls.removeEventListener("start", cancelFly);
      canvas.removeEventListener("wheel", onCanvasWheel);
      canvas.removeEventListener("dblclick", onCanvasDblClick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      controls.dispose();

      if (spatial3dBridge.cameraStageEl) spatial3dBridge.cameraStageEl.style.transform = "";
      if (spatial3dBridge.dock3dEl) spatial3dBridge.dock3dEl.style.transform = "";
      if (spatial3dBridge.globalMenu3dEl) spatial3dBridge.globalMenu3dEl.style.transform = "";
      for (const { el } of spatial3dBridge.panel3dEls.values()) {
        el.style.transform = "";
      }
      for (const id of windowMeshesRef.current.keys()) {
        const dom = spatial3dBridge.getWindowEl(id);
        if (dom) dom.style.transform = "";
      }
      for (const entry of windowMeshesRef.current.values()) {
        disposeWindowFrame(scene, entry);
      }
      windowMeshesRef.current.clear();
      dockGlowBar.geometry.dispose();
      (dockGlowBar.material as THREE.Material).dispose();
      sharedBezelMat.dispose();
      envRef.current?.dispose();
      envRef.current = null;
      starTex.dispose();
      starTexRef.current = null;
      keyLightRef.current = null;
      hemiLightRef.current = null;
      roomEnvTexRef.current = null;
      envTarget?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Shadow toggle sync
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.shadowMap.enabled = cfg3d.shadowsEnabled;
    if (keyLightRef.current) keyLightRef.current.castShadow = cfg3d.shadowsEnabled;
  }, [cfg3d.shadowsEnabled]);

  // Razor-Sharp 4K HDRI Loader (ZERO blurriness — backgroundBlurriness = 0 & LinearFilter!)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;

    const url = resolveHdriUrl(cfg3d.hdriPreset, cfg3d.hdriUrl, cfg3d.scene);
    if (!url) {
      scene.background = new THREE.Color("#02040a");
      scene.backgroundBlurriness = 0;
      if (roomEnvTexRef.current) scene.environment = roomEnvTexRef.current;
      setHdriLoading(false);
      return;
    }

    const applySharpHdri = (tex: THREE.DataTexture) => {
      if (cancelled || !sceneRef.current) return;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      sceneRef.current.environment = tex;
      if (cfg3d.hdriBackground) {
        sceneRef.current.background = tex;
        sceneRef.current.backgroundBlurriness = 0; // 100% razor sharp 4K!
      } else {
        sceneRef.current.background = new THREE.Color("#02040a");
        sceneRef.current.backgroundBlurriness = 0;
      }
    };

    const cached = hdriTextureCache.get(url);
    if (cached) {
      applySharpHdri(cached);
      setHdriLoading(false);
      return;
    }

    setHdriLoading(true);
    const loader = new HDRLoader();
    loader.setCrossOrigin("anonymous");
    loader
      .loadAsync(url)
      .then((tex) => {
        hdriTextureCache.set(url, tex);
        applySharpHdri(tex);
      })
      .catch((err) => {
        console.warn("[ThreeDesktop3d] 4K HDRI load failed:", url, err);
        if (!cancelled && sceneRef.current) {
          sceneRef.current.background = new THREE.Color("#03060f");
          if (roomEnvTexRef.current) sceneRef.current.environment = roomEnvTexRef.current;
        }
      })
      .finally(() => {
        if (!cancelled) setHdriLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cfg3d.hdriPreset, cfg3d.hdriUrl, cfg3d.hdriBackground, cfg3d.scene]);

  // Hot-swap cinematic 3D world or layout without recreating the WebGPU device
  useEffect(() => {
    const scene = sceneRef.current;
    const starTex = starTexRef.current;
    if (!scene || !starTex) return;
    if (envRef.current) {
      scene.remove(envRef.current.group);
      envRef.current.dispose();
    }
    const next = buildCinematicWorld(cfg3d.scene, cfg3d.layout, cfg3d.particleDensity, starTex);
    scene.add(next.group);
    scene.fog = new THREE.FogExp2(next.fogColor, next.fogDensity);
    if (keyLightRef.current) {
      keyLightRef.current.position.set(...next.sunPos);
      keyLightRef.current.color.set(next.sunColor);
      keyLightRef.current.intensity = next.sunIntensity;
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.color.set(next.hemiSky);
      hemiLightRef.current.groundColor.set(next.hemiGround);
    }
    envRef.current = next;
    spatial3dBridge.dispatchCamera({ kind: "reset" });
  }, [cfg3d.scene, cfg3d.layout, cfg3d.particleDensity]);

  useEffect(() => {
    if (cfg3d.layout === "compiz-cube") {
      spatial3dBridge.dispatchCamera({ kind: "workspace", workspace: wm.activeWorkspace });
    }
  }, [wm.activeWorkspace, cfg3d.layout]);

  const rotateCube = (dir: -1 | 1) => {
    const next = (((wm.activeWorkspace - 1 + dir + 4) % 4) + 1) as WorkspaceId;
    wmStore.switchWorkspace(next);
  };

  return (
    <>
      {/* Full-viewport Interactive 3D Canvas (Mouse Orbit/Pan/Zoom, Trackpad 2-Finger Glide/Pinch, Touch, ZQSD + Arrows) */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full z-0 pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Optional 3D Control Pill — HIDDEN by default, toggled cleanly from the OS TopBar! */}
      {cfg3d.showControlsHud && (
        <div
          style={{ top: mods.shell.topBarStyle === "hidden" ? "10px" : "44px" }}
          className="fixed left-1/2 -translate-x-1/2 z-[55] hidden md:flex items-center select-none pointer-events-none animate-window-in"
        >
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-dock border border-white/18 text-[10px] shadow-2xl max-w-[96vw]">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/35 text-cyan-200 font-mono shrink-0">
              <Box className="w-3 h-3" />
              {backendLabel} · {fps}
            </span>

            {/* World Selector */}
            <select
              value={cfg3d.scene}
              onChange={(e) => modStore.setDesktop3d({ scene: e.target.value as Desktop3dSceneKind })}
              className="bg-white/8 border border-white/14 rounded-full px-2 py-0.5 text-[10px] text-white outline-none cursor-pointer max-w-[165px]"
              title="Monde 3D cinématographique"
            >
              {WORLD_BUTTONS.map((ev) => (
                <option key={ev.id} value={ev.id} className="bg-[#0b0e18] text-white">
                  {ev.label}
                </option>
              ))}
            </select>

            {/* 4K HDRI Selector */}
            <select
              value={cfg3d.hdriPreset}
              onChange={(e) => modStore.setDesktop3d({ hdriPreset: e.target.value as HdriPresetId })}
              className="bg-white/8 border border-white/14 rounded-full px-2 py-0.5 text-[10px] text-amber-200 outline-none cursor-pointer max-w-[138px]"
              title="Skybox 4K HDRI ultra-nette"
            >
              {HDRI_PRESETS.map((h) => (
                <option key={h.id} value={h.id} className="bg-[#0b0e18] text-white">
                  {hdriLoading && cfg3d.hdriPreset === h.id ? "⏳ 4K… " : `${h.emoji} `}
                  {h.name}
                </option>
              ))}
              {cfg3d.hdriUrl && (
                <option value="custom" className="bg-[#0b0e18] text-white">
                  🌐 HDRI Perso
                </option>
              )}
            </select>

            <div className="w-px h-3.5 bg-white/15" />

            {/* 5 Spatial Window Layouts */}
            <div className="flex items-center gap-0.5">
              {LAYOUT_BUTTONS.map((l) => {
                const active = cfg3d.layout === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => modStore.setDesktop3d({ layout: l.id })}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-cyan-500/40 to-violet-500/40 text-white border border-cyan-300/50"
                        : "text-zinc-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {l.emoji} {l.label}
                  </button>
                );
              })}
            </div>

            {cfg3d.layout === "compiz-cube" && (
              <div className="flex items-center gap-0.5 px-1 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 font-mono">
                <button type="button" onClick={() => rotateCube(-1)} className="p-0.5 hover:bg-white/15 rounded-full cursor-pointer">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span>F{wm.activeWorkspace}</span>
                <button type="button" onClick={() => rotateCube(1)} className="p-0.5 hover:bg-white/15 rounded-full cursor-pointer">
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="w-px h-3.5 bg-white/15" />

            {/* Camera Controls */}
            <button
              type="button"
              onClick={() => {
                if (wm.activeWindowId) {
                  spatial3dBridge.dispatchCamera({ kind: "focus-window", windowId: wm.activeWindowId });
                }
              }}
              title="Focaliser la caméra 1:1 sur la fenêtre active"
              className="p-1 rounded-full hover:bg-white/15 text-cyan-300 cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => spatial3dBridge.dispatchCamera({ kind: "overview" })}
              title="Vue panoramique cinématique (ou double-clic sur le ciel)"
              className="p-1 rounded-full hover:bg-white/15 text-violet-300 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                spatial3dBridge.resetDepthOffsets();
                spatial3dBridge.dispatchCamera({ kind: "reset" });
              }}
              title="Réinitialiser la caméra (R)"
              className="p-1 rounded-full hover:bg-white/15 text-zinc-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-white/15" />

            {/* 3D Dock & Global Menu Toggle, Shadows, Double-Sided */}
            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ spatialChrome3d: !cfg3d.spatialChrome3d })}
              title="Super Dock, Barre des tâches & Menu Global EN 3D dans la scène"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition cursor-pointer ${
                cfg3d.spatialChrome3d
                  ? "bg-fuchsia-500/28 border border-fuchsia-300/50 text-fuchsia-100"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <LayoutPanelTop className="w-3 h-3" />
              Dock 3D
            </button>

            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ shadowsEnabled: !cfg3d.shadowsEnabled })}
              title="Ombres dynamiques 3D"
              className={`p-1 rounded-full transition cursor-pointer ${
                cfg3d.shadowsEnabled ? "bg-amber-500/22 text-amber-200" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ doubleSidedWindows: !cfg3d.doubleSidedWindows })}
              title="Fenêtres visibles des 2 côtés"
              className={`p-1 rounded-full transition cursor-pointer ${
                cfg3d.doubleSidedWindows ? "bg-emerald-500/22 text-emerald-200" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => wmStore.openApp("mod-studio")}
              title="Mod Studio (Scènes, HDRI 4K, Fonds 2D/3D)"
              className="p-1 rounded-full text-zinc-300 hover:text-white hover:bg-white/15 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ enabled: false })}
              title="Revenir au bureau 2D"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/22 hover:bg-rose-500/38 text-rose-200 font-semibold cursor-pointer"
            >
              <Monitor className="w-3 h-3" />
              2D
            </button>

            <button
              type="button"
              onClick={() => modStore.setDesktop3d({ showControlsHud: false })}
              title="Masquer la barre de contrôle 3D"
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/15 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
