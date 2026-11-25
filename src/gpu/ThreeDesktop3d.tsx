import {
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Eye,
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
import { WebGPURenderer } from "three/webgpu";
import {
  HDRI_PRESETS,
  modStore,
  useMods,
  type Desktop3dSceneKind,
  type HdriPresetId,
} from "../core/mod-store.ts";
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

const LAYOUT_BUTTONS: readonly { id: Spatial3dLayoutKind; label: string; emoji: string }[] = [
  { id: "curved-cockpit", label: "Arc", emoji: "🥽" },
  { id: "spatial-grid", label: "Grille 3D", emoji: "⊞" },
  { id: "compiz-cube", label: "Cube 4", emoji: "🧊" },
  { id: "studio-desk", label: "Bureau", emoji: "🖥️" },
  { id: "gallery-ring", label: "Anneau", emoji: "🪐" },
];

const ENV_BUTTONS: readonly { id: Desktop3dSceneKind; label: string }[] = [
  { id: "cyber-observatory", label: "Studio Loft" },
  { id: "compiz-cube", label: "Compiz Arena" },
  { id: "vision-horizon", label: "Alpine Horizon" },
  { id: "space-station", label: "Space Station" },
  { id: "cyberpunk-city", label: "Night City 2099" },
  { id: "kyoto-sanctuary", label: "Kyoto Sanctuary" },
  { id: "liquid-monolith", label: "Chrome Monolith" },
];

interface PhysicalWindowMesh {
  group: THREE.Group;
  rails: THREE.Mesh[];
  rimMesh: THREE.LineSegments;
  width: number;
  height: number;
}

const hdriTextureCache = new Map<string, THREE.DataTexture>();

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest(".xterm, .monaco-editor, .cm-editor, [contenteditable='true']")) return true;
  return false;
}

function createStarTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(186,230,253,0.72)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createFloorGridTexture(accentHex: string, bgHex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(255,255,255,0.065)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  ctx.strokeStyle = accentHex;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(64, 64);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

interface EnvRuntime {
  group: THREE.Group;
  update: (t: number, speed: number) => void;
  dispose: () => void;
}

/**
 * Builds vast explorable AAA 3D architectural worlds scaled 1:1 with the real 3D DOM windows
 * (1 world unit = 1 CSS pixel, floor at y = -480, desk top at y = -390, real shadow casting & receiving!).
 */
function buildRoomEnvironment(
  envKind: Desktop3dSceneKind,
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

  const accent =
    envKind === "cyberpunk-city"
      ? "#f43f5e"
      : envKind === "compiz-cube"
      ? "#10b981"
      : envKind === "kyoto-sanctuary"
      ? "#2dd4bf"
      : envKind === "space-station"
      ? "#60a5fa"
      : "#38bdf8";

  const floorBg =
    envKind === "cyberpunk-city"
      ? "#070412"
      : envKind === "kyoto-sanctuary"
      ? "#041217"
      : envKind === "space-station"
      ? "#060812"
      : "#070a14";

  // 1. Vast Reflective 3D Horizon Floor Plane (receives real dynamic shadows from windows & architecture!)
  const floorTex = createFloorGridTexture(accent, floorBg);
  disposables.push(floorTex);
  const floor = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(46000, 46000)),
    mat(
      new THREE.MeshStandardMaterial({
        map: floorTex,
        metalness: 0.62,
        roughness: 0.34,
      })
    )
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -480;
  floor.receiveShadow = true;
  group.add(floor);

  // Subtle central circular stage platform underneath the workspace (catches crisp shadows!)
  const stagePad = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(2350, 2480, 14, 72)),
    mat(
      new THREE.MeshStandardMaterial({
        color: "#0b1020",
        metalness: 0.72,
        roughness: 0.26,
      })
    )
  );
  stagePad.position.y = -474;
  stagePad.receiveShadow = true;
  group.add(stagePad);

  const stageRing = new THREE.Mesh(
    geo(new THREE.TorusGeometry(2380, 6, 12, 128)),
    mat(
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 1.6,
      })
    )
  );
  stageRing.rotation.x = Math.PI / 2;
  stageRing.position.y = -466;
  group.add(stageRing);

  // 2. Physical 3D Studio Workstation Desk (when in Studio Desk, Curved Cockpit, or Spatial Grid layout!)
  if (layout === "studio-desk" || layout === "curved-cockpit" || layout === "spatial-grid") {
    const deskTop = new THREE.Mesh(
      geo(new THREE.BoxGeometry(2800, 34, 980)),
      mat(
        new THREE.MeshPhysicalMaterial({
          color: envKind === "kyoto-sanctuary" ? "#15262b" : "#101524",
          metalness: 0.58,
          roughness: 0.22,
          clearcoat: 0.85,
          clearcoatRoughness: 0.12,
        })
      )
    );
    deskTop.position.set(0, -405, -40);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    group.add(deskTop);

    // Glowing LED front trim strip
    const trim = new THREE.Mesh(
      geo(new THREE.BoxGeometry(2804, 5, 6)),
      mat(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 2.2,
        })
      )
    );
    trim.position.set(0, -390, 452);
    group.add(trim);

    // Sleek dark metallic legs casting floor shadows
    const legGeo = geo(new THREE.BoxGeometry(46, 78, 740));
    const legMat = mat(new THREE.MeshStandardMaterial({ color: "#171d2e", metalness: 0.88, roughness: 0.25 }));
    for (const lx of [-1220, 1220]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -444, -40);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);
    }

    // Illuminated Desk Mat & Tactile Spatial Keyboard + Mouse Props
    const matPad = new THREE.Mesh(
      geo(new THREE.BoxGeometry(1120, 4, 350)),
      mat(new THREE.MeshStandardMaterial({ color: "#090c15", roughness: 0.78, metalness: 0.14 }))
    );
    matPad.position.set(0, -386, 220);
    matPad.receiveShadow = true;
    group.add(matPad);

    const kb = new THREE.Mesh(
      geo(new THREE.BoxGeometry(470, 14, 156)),
      mat(new THREE.MeshStandardMaterial({ color: "#1e263a", metalness: 0.72, roughness: 0.26 }))
    );
    kb.position.set(-55, -377, 225);
    kb.castShadow = true;
    kb.receiveShadow = true;
    group.add(kb);

    const mouse = new THREE.Mesh(
      geo(new THREE.BoxGeometry(74, 22, 118)),
      mat(new THREE.MeshPhysicalMaterial({ color: "#1c2438", metalness: 0.7, roughness: 0.2, clearcoat: 0.9 }))
    );
    mouse.position.set(295, -374, 225);
    mouse.castShadow = true;
    group.add(mouse);
  }

  // 3. Physical 3D Translucent Glass Compiz Cube Chassis (when layout === "compiz-cube"!)
  if (layout === "compiz-cube") {
    const coreGeo = geo(new THREE.BoxGeometry(CUBE_HALF_SIZE * 2, 920, CUBE_HALF_SIZE * 2));
    const coreMesh = new THREE.Mesh(
      coreGeo,
      mat(
        new THREE.MeshPhysicalMaterial({
          color: "#091b26",
          transparent: true,
          opacity: 0.32,
          metalness: 0.25,
          roughness: 0.08,
          clearcoat: 1.0,
        })
      )
    );
    coreMesh.position.y = 35;
    group.add(coreMesh);

    const cubeEdges = new THREE.LineSegments(
      geo(new THREE.EdgesGeometry(coreGeo)),
      mat(new THREE.LineBasicMaterial({ color: accent }))
    );
    cubeEdges.position.y = 35;
    group.add(cubeEdges);

    const baseRing = new THREE.Mesh(
      geo(new THREE.TorusGeometry(CUBE_HALF_SIZE * 1.48, 8, 16, 128)),
      mat(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.8 }))
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -462;
    group.add(baseRing);
  }

  // 4. Vast Explorable Architectural Landmarks (per 3D Scene!)
  const animatedRefs: Array<{ obj: THREE.Object3D; fn: (t: number, speed: number) => void }> = [];

  if (envKind === "cyberpunk-city") {
    const bGeo = geo(new THREE.BoxGeometry(1, 1, 1));
    const bMat = mat(new THREE.MeshStandardMaterial({ color: "#0b091c", metalness: 0.78, roughness: 0.28 }));
    const capMats = ["#f43f5e", "#22d3ee", "#a855f7", "#f59e0b"].map((c) =>
      mat(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }))
    );
    for (let i = 0; i < 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      const ring = i % 3;
      const dist = 3400 + ring * 1850 + ((i * 197) % 700);
      const h = 1400 + ((i * 317) % 3600);
      const w = 280 + ((i * 89) % 440);
      const mesh = new THREE.Mesh(bGeo, bMat);
      mesh.scale.set(w, h, w);
      mesh.position.set(Math.cos(ang) * dist, h / 2 - 480, Math.sin(ang) * dist);
      mesh.castShadow = ring === 0;
      mesh.receiveShadow = true;
      group.add(mesh);

      const cap = new THREE.Mesh(bGeo, capMats[i % capMats.length]!);
      cap.scale.set(w * 1.03, 26, w * 1.03);
      cap.position.set(Math.cos(ang) * dist, h - 468, Math.sin(ang) * dist);
      group.add(cap);
    }
    // Flying neon traffic vehicles orbiting the megacity!
    const carGeo = geo(new THREE.BoxGeometry(110, 18, 32));
    for (let i = 0; i < 18; i++) {
      const col = i % 2 === 0 ? "#22d3ee" : "#f43f5e";
      const car = new THREE.Mesh(carGeo, mat(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.8 })));
      const rad = 2900 + (i % 4) * 750;
      const yPos = 450 + (i % 5) * 320;
      const dir = i % 2 === 0 ? 1 : -1;
      const offset = (i / 18) * Math.PI * 2;
      group.add(car);
      animatedRefs.push({
        obj: car,
        fn: (t, sp) => {
          const a = offset + t * 0.14 * dir * Math.max(0.2, sp);
          car.position.set(Math.cos(a) * rad, yPos, Math.sin(a) * rad);
          car.rotation.y = -a + (dir > 0 ? 0 : Math.PI);
        },
      });
    }
  } else if (envKind === "space-station") {
    // Epic Orbital Planet + Planetary Rings + Moon + Space Bridge Pillars!
    const planet = new THREE.Mesh(
      geo(new THREE.SphereGeometry(2400, 48, 36)),
      mat(
        new THREE.MeshStandardMaterial({
          color: "#1e3a8a",
          emissive: "#0c1b42",
          metalness: 0.25,
          roughness: 0.7,
        })
      )
    );
    planet.position.set(-4800, 1800, -9800);
    group.add(planet);
    animatedRefs.push({
      obj: planet,
      fn: (t, sp) => {
        planet.rotation.y = t * 0.04 * sp;
      },
    });

    const pRing = new THREE.Mesh(
      geo(new THREE.TorusGeometry(3900, 140, 8, 128)),
      mat(
        new THREE.MeshStandardMaterial({
          color: "#38bdf8",
          emissive: "#0ea5e9",
          emissiveIntensity: 0.65,
          transparent: true,
          opacity: 0.65,
        })
      )
    );
    pRing.position.copy(planet.position);
    pRing.rotation.set(1.22, 0.25, 0.15);
    pRing.scale.set(1, 1, 0.08);
    group.add(pRing);

    const moon = new THREE.Mesh(
      geo(new THREE.SphereGeometry(480, 32, 24)),
      mat(new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.9, metalness: 0.05 }))
    );
    group.add(moon);
    animatedRefs.push({
      obj: moon,
      fn: (t, sp) => {
        const a = t * 0.08 * sp;
        moon.position.set(
          planet.position.x + Math.cos(a) * 4600,
          planet.position.y + 420,
          planet.position.z + Math.sin(a) * 4600
        );
      },
    });

    // Orbital station structural ribs curving overhead
    for (let i = 0; i < 6; i++) {
      const arch = new THREE.Mesh(
        geo(new THREE.TorusGeometry(3600, 44, 10, 64, Math.PI)),
        mat(new THREE.MeshStandardMaterial({ color: "#1e293b", metalness: 0.88, roughness: 0.24 }))
      );
      arch.position.set(0, -480, -2600 + i * 1150);
      arch.castShadow = true;
      group.add(arch);
    }
  } else if (envKind === "vision-horizon") {
    // Vast Alpine Mountain Amphitheater + Luminous Glass Monoliths
    const mtGeo = geo(new THREE.CylinderGeometry(6400, 11800, 4200, 84, 6, true));
    const pos = mtGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 5) * 680 + Math.cos(a * 11) * 340 + Math.sin(a * 19) * 180);
      }
    }
    mtGeo.computeVertexNormals();
    const mt = new THREE.Mesh(
      mtGeo,
      mat(new THREE.MeshStandardMaterial({ color: "#111b31", roughness: 0.88, side: THREE.BackSide }))
    );
    mt.position.y = 920;
    group.add(mt);

    const pGeo = geo(new THREE.BoxGeometry(110, 1400, 110));
    const pMat = mat(
      new THREE.MeshPhysicalMaterial({
        color: "#7dd3fc",
        transparent: true,
        opacity: 0.28,
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1,
      })
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pil = new THREE.Mesh(pGeo, pMat);
      pil.position.set(Math.cos(a) * 3200, 220, Math.sin(a) * 3200);
      pil.castShadow = true;
      group.add(pil);
    }
  } else if (envKind === "kyoto-sanctuary") {
    // Grand Vermilion Torii Gate + Floating Jade & Sakura Lanterns!
    const toriiMat = mat(new THREE.MeshStandardMaterial({ color: "#b91c1c", roughness: 0.42, metalness: 0.18 }));
    const darkRoof = mat(new THREE.MeshStandardMaterial({ color: "#18181b", roughness: 0.5, metalness: 0.35 }));
    const colGeo = geo(new THREE.CylinderGeometry(72, 86, 1750, 18));
    for (const tx of [-760, 760]) {
      const col = new THREE.Mesh(colGeo, toriiMat);
      col.position.set(tx, 395, -2900);
      col.castShadow = true;
      group.add(col);
    }
    const beam1 = new THREE.Mesh(geo(new THREE.BoxGeometry(2240, 115, 160)), toriiMat);
    beam1.position.set(0, 1210, -2900);
    beam1.castShadow = true;
    group.add(beam1);
    const roof = new THREE.Mesh(geo(new THREE.BoxGeometry(2420, 72, 220)), darkRoof);
    roof.position.set(0, 1295, -2900);
    group.add(roof);
    const beam2 = new THREE.Mesh(geo(new THREE.BoxGeometry(1880, 75, 110)), toriiMat);
    beam2.position.set(0, 960, -2900);
    group.add(beam2);

    const lGeo = geo(new THREE.CylinderGeometry(52, 38, 155, 6));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const dist = 2300 + (i % 3) * 850;
      const col = i % 2 === 0 ? "#2dd4bf" : "#f472b6";
      const l = new THREE.Mesh(
        lGeo,
        mat(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.65 }))
      );
      const baseY = -120 + (i % 4) * 260;
      l.position.set(Math.cos(a) * dist, baseY, Math.sin(a) * dist);
      group.add(l);
      animatedRefs.push({
        obj: l,
        fn: (t, sp) => {
          l.position.y = baseY + Math.sin(t * 0.9 * sp + i) * 55;
        },
      });
    }
  } else if (envKind === "liquid-monolith") {
    // Rotating Liquid Chrome Sculptural Monolith & Floating Shards in the distance
    const mono = new THREE.Mesh(
      geo(new THREE.IcosahedronGeometry(780, 2)),
      mat(new THREE.MeshPhysicalMaterial({ color: "#e2e8f0", metalness: 1.0, roughness: 0.06, clearcoat: 1.0 }))
    );
    mono.position.set(0, 480, -3400);
    mono.castShadow = true;
    group.add(mono);
    animatedRefs.push({
      obj: mono,
      fn: (t, sp) => {
        mono.rotation.y = t * 0.22 * sp;
        mono.rotation.x = Math.sin(t * 0.35 * sp) * 0.25;
      },
    });
  } else {
    // Architect Studio Loft: Sleek Architectural Columns + Overhead Luminous Halo Ring!
    const colGeo = geo(new THREE.CylinderGeometry(64, 64, 2400, 24));
    const colMat = mat(new THREE.MeshStandardMaterial({ color: "#151c2e", metalness: 0.72, roughness: 0.28 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.set(Math.cos(a) * 3400, 720, Math.sin(a) * 3400);
      c.castShadow = true;
      c.receiveShadow = true;
      group.add(c);
    }
    const ceilingRing = new THREE.Mesh(
      geo(new THREE.TorusGeometry(2800, 16, 16, 128)),
      mat(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5 }))
    );
    ceilingRing.rotation.x = Math.PI / 2;
    ceilingRing.position.y = 1480;
    group.add(ceilingRing);
  }

  // 5. Vast 3D Spatial Starfield / Depth Particles
  const pCount = Math.max(240, Math.min(2600, Math.round(950 * particleDensity)));
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 2000 + Math.random() * 12000;
    const theta = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(theta) * r;
    pPos[i * 3 + 1] = -360 + Math.random() * 5200;
    pPos[i * 3 + 2] = Math.sin(theta) * r;
  }
  const pGeo = geo(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    mat(
      new THREE.PointsMaterial({
        size: 42,
        map: starTex,
        color: accent,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  group.add(particles);

  return {
    group,
    update: (t, speed) => {
      particles.rotation.y = t * 0.012 * speed;
      for (const a of animatedRefs) a.fn(t, speed);
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Computes ideal camera `(pos, target)` to face any 3D spatial window dead-on at 1:1 reading clarity!
 */
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
    const dist = CUBE_HALF_SIZE + 1300;
    return {
      pos: new THREE.Vector3(Math.sin(faceAngle) * dist, 180, Math.cos(faceAngle) * dist),
      target: new THREE.Vector3(0, 40, 0),
    };
  }
  if (layout === "spatial-grid") {
    return {
      pos: new THREE.Vector3(0, 170, 1980),
      target: new THREE.Vector3(0, 90, -120),
    };
  }
  if (layout === "studio-desk") {
    return {
      pos: new THREE.Vector3(0, 185, 1480),
      target: new THREE.Vector3(0, 55, -40),
    };
  }
  if (layout === "gallery-ring") {
    return {
      pos: new THREE.Vector3(0, 220, 1560),
      target: new THREE.Vector3(0, 55, -150),
    };
  }
  // curved-cockpit
  return {
    pos: new THREE.Vector3(0, 140, 1360),
    target: new THREE.Vector3(0, 55, -120),
  };
}

/**
 * Builds a hollow 4-bar machined metallic 3D perimeter frame around a window so BOTH front AND back
 * are 100% open & readable when walking/orbiting behind the window, while casting real shadows!
 */
function createHollowWindowFrame(
  width: number,
  height: number,
  focused: boolean,
  bezelMat: THREE.Material,
  castShadow: boolean
): PhysicalWindowMesh {
  const grp = new THREE.Group();
  const railThick = 16;
  const railDepth = 24;
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
  const rimMat = new THREE.LineBasicMaterial({
    color: focused ? "#38bdf8" : "#475569",
  });
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

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const roomEnvTexRef = useRef<THREE.Texture | null>(null);
  const envRef = useRef<EnvRuntime | null>(null);
  const starTexRef = useRef<THREE.Texture | null>(null);
  const windowMeshesRef = useRef<Map<string, PhysicalWindowMesh>>(new Map());
  const flyTargetRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(0, 140, 1360),
    target: new THREE.Vector3(0, 55, -120),
    active: false,
  });

  // Main synchronized Three.js WebGPU + Real 3D DOM Window Compositor + ZQSD/Arrows Engine!
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let raf = 0;
    let renderer: WebGPURenderer | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let envTarget: THREE.WebGLRenderTarget | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05070e");
    scene.fog = new THREE.FogExp2("#05070e", 0.000055);
    sceneRef.current = scene;

    const FOV = 50;
    const camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / Math.max(1, window.innerHeight),
      20,
      46000
    );
    const initCam = computeDefaultCamera(cfgRef.current.layout, wmRef.current.activeWorkspace);
    camera.position.copy(initCam.pos);

    // Rich 3-Point Studio + Sun Shadow Lighting Rig!
    const hemi = new THREE.HemisphereLight("#dbeafe", "#0b1120", 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#fff7ed", 2.2);
    keyLight.position.set(1600, 2600, 1900);
    keyLight.castShadow = cfgRef.current.shadowsEnabled;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far = 9500;
    keyLight.shadow.camera.left = -3600;
    keyLight.shadow.camera.right = 3600;
    keyLight.shadow.camera.top = 3600;
    keyLight.shadow.camera.bottom = -3600;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const cyanLight = new THREE.PointLight("#22d3ee", 3.6, 8500, 0.35);
    cyanLight.position.set(-1800, 780, 1100);
    scene.add(cyanLight);

    const violetLight = new THREE.PointLight("#a855f7", 3.6, 8500, 0.35);
    violetLight.position.set(1800, 680, -900);
    scene.add(violetLight);

    const starTex = createStarTexture();
    starTexRef.current = starTex;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.9;
    controls.minDistance = 280;
    controls.maxDistance = 12000;
    controls.maxPolarAngle = Math.PI * 0.64;
    controls.target.copy(initCam.target);
    controls.update();

    const cancelFly = () => {
      flyTargetRef.current.active = false;
    };
    controls.addEventListener("start", cancelFly);

    // ─── ZQSD / WASD Free-Flight + Arrow Keys Camera Rotation ────────────────
    const pressedCodes = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      const code = e.code;
      const navCodes = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyQ",
        "KeyZ",
        "KeyE",
        "KeyC",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ];
      if (code === "KeyR") {
        spatial3dBridge.dispatchCamera({ kind: "reset" });
        return;
      }
      if (navCodes.includes(code)) {
        pressedCodes.add(code);
        flyTargetRef.current.active = false;
        if (code.startsWith("Arrow") || code === "Space") {
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedCodes.delete(e.code);
    };
    const onBlur = () => pressedCodes.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    // Reusable temporaries for zero-GC 60fps loop
    const tmpObj = new THREE.Object3D();
    const tmpFwd = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpUp = new THREE.Vector3(0, 1, 0);
    const tmpOffset = new THREE.Vector3();
    const tmpSph = new THREE.Spherical();

    const sharedBezelMat = new THREE.MeshPhysicalMaterial({
      color: "#111729",
      metalness: 0.9,
      roughness: 0.16,
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
            pos: new THREE.Vector3(Math.sin(ang) * 3100, 960, Math.cos(ang) * 3100),
            target: new THREE.Vector3(0, 30, 0),
            active: true,
          };
        } else {
          flyTargetRef.current = {
            pos: new THREE.Vector3(820, 840, 2750),
            target: new THREE.Vector3(0, 40, -120),
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
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        r.setSize(window.innerWidth, window.innerHeight, false);
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.12;
        r.shadowMap.enabled = cfgRef.current.shadowsEnabled;
        r.shadowMap.type = THREE.PCFSoftShadowMap;

        const isWebGpu = Boolean((r.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend);
        setBackendLabel(isWebGpu ? "WebGPU" : "WebGL2");

        try {
          pmrem = new THREE.PMREMGenerator(r as unknown as THREE.WebGLRenderer);
          const room = new RoomEnvironment();
          envTarget = pmrem.fromScene(room, 0.04);
          roomEnvTexRef.current = envTarget.texture;
          if (cfgRef.current.hdriPreset === "none") {
            scene.environment = envTarget.texture;
          }
          room.dispose();
        } catch {
          // graceful lighting fallback
        }

        const initialEnv = buildRoomEnvironment(
          cfgRef.current.scene,
          cfgRef.current.layout,
          cfgRef.current.particleDensity,
          starTex
        );
        scene.add(initialEnv.group);
        envRef.current = initialEnv;

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

          // ─── ZQSD / WASD Translation + Arrow Keys Look Rotation ────────────
          if (pressedCodes.size > 0 && !isTypingTarget(document.activeElement)) {
            const sprint = pressedCodes.has("ShiftLeft") || pressedCodes.has("ShiftRight") ? 2.4 : 1.0;
            const moveStep = 1350 * (curCfg.moveSpeed || 1.0) * sprint * dt;
            const rotStep = 1.55 * dt;

            // Arrow keys rotate camera viewing direction (yaw & pitch around camera eye!)
            const yawInput =
              (pressedCodes.has("ArrowLeft") ? 1 : 0) - (pressedCodes.has("ArrowRight") ? 1 : 0);
            const pitchInput =
              (pressedCodes.has("ArrowUp") ? 1 : 0) - (pressedCodes.has("ArrowDown") ? 1 : 0);

            if (yawInput !== 0 || pitchInput !== 0) {
              tmpOffset.copy(controls.target).sub(camera.position);
              const dist = Math.max(120, tmpOffset.length());
              tmpSph.setFromVector3(tmpOffset);
              tmpSph.theta += yawInput * rotStep;
              tmpSph.phi = Math.max(0.18, Math.min(Math.PI - 0.18, tmpSph.phi - pitchInput * rotStep));
              tmpSph.radius = dist;
              tmpOffset.setFromSpherical(tmpSph);
              controls.target.copy(camera.position).add(tmpOffset);
            }

            // ZQSD + WASD free movement (Z/W forward, S back, Q/A left, D right, Space/E up, C down)
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
              // Keep camera above floor plane
              if (camera.position.y < -390) {
                const lift = -390 - camera.position.y;
                camera.position.y += lift;
                controls.target.y += lift;
              }
            }
          }

          // Smooth camera fly-to interpolation
          if (flyTargetRef.current.active) {
            camera.position.lerp(flyTargetRef.current.pos, 0.09);
            controls.target.lerp(flyTargetRef.current.target, 0.09);
            if (
              camera.position.distanceTo(flyTargetRef.current.pos) < 4 &&
              controls.target.distanceTo(flyTargetRef.current.target) < 4
            ) {
              flyTargetRef.current.active = false;
            }
          }

          controls.update();
          camera.updateMatrixWorld();

          // 1. Compute real 3D poses for all open OS windows
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

          // 2. Sync hollow 4-rail metallic 3D frames & real shadow casters
          syncPhysicalWindows(poses, curCfg.shadowsEnabled);

          // 3. Apply EXACT CSS3DRenderer camera matrix to live React window stage
          const stage = spatial3dBridge.cameraStageEl;
          if (stage) {
            const fovPx = camera.projectionMatrix.elements[5]! * (h / 2);
            stage.style.transform =
              `perspective(${fovPx.toFixed(2)}px) translateZ(${fovPx.toFixed(2)}px) ` +
              `${toCameraCSSMatrix(camera.matrixWorldInverse)} ` +
              `translate(${(w / 2).toFixed(2)}px, ${(h / 2).toFixed(2)}px)`;
          }

          // 4. Position EVERY real DOM WindowFrame directly in 3D world space!
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

          // Animate environment & dynamic lighting
          const boost = Math.max(0.3, curCfg.bloomIntensity);
          cyanLight.intensity = 3.4 * boost;
          violetLight.intensity = 3.4 * boost;
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
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      controls.dispose();

      if (spatial3dBridge.cameraStageEl) {
        spatial3dBridge.cameraStageEl.style.transform = "";
      }
      for (const id of windowMeshesRef.current.keys()) {
        const dom = spatial3dBridge.getWindowEl(id);
        if (dom) dom.style.transform = "";
      }
      for (const entry of windowMeshesRef.current.values()) {
        disposeWindowFrame(scene, entry);
      }
      windowMeshesRef.current.clear();
      sharedBezelMat.dispose();
      envRef.current?.dispose();
      envRef.current = null;
      starTex.dispose();
      envTarget?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Live Shadow Toggle synchronization
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = cfg3d.shadowsEnabled;
    }
    if (keyLightRef.current) {
      keyLightRef.current.castShadow = cfg3d.shadowsEnabled;
    }
  }, [cfg3d.shadowsEnabled]);

  // Real 360° HDRI Skybox & IBL Reflection Loader (CORS + CORP safe!)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;

    const preset = HDRI_PRESETS.find((h) => h.id === cfg3d.hdriPreset);
    const url =
      cfg3d.hdriPreset === "custom"
        ? cfg3d.hdriUrl.trim()
        : cfg3d.hdriPreset === "none"
        ? ""
        : preset?.url ?? "";

    if (!url) {
      scene.background = new THREE.Color("#05070e");
      scene.backgroundBlurriness = 0;
      if (roomEnvTexRef.current) scene.environment = roomEnvTexRef.current;
      setHdriLoading(false);
      return;
    }

    const applyTex = (tex: THREE.DataTexture) => {
      if (cancelled || !sceneRef.current) return;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      sceneRef.current.environment = tex;
      if (cfg3d.hdriBackground) {
        sceneRef.current.background = tex;
        sceneRef.current.backgroundBlurriness = 0.04;
      } else {
        sceneRef.current.background = new THREE.Color("#05070e");
        sceneRef.current.backgroundBlurriness = 0;
      }
    };

    const cached = hdriTextureCache.get(url);
    if (cached) {
      applyTex(cached);
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
        applyTex(tex);
      })
      .catch((err) => {
        console.warn("[ThreeDesktop3d] HDRI load failed:", url, err);
        if (!cancelled && sceneRef.current) {
          sceneRef.current.background = new THREE.Color("#05070e");
          if (roomEnvTexRef.current) sceneRef.current.environment = roomEnvTexRef.current;
        }
      })
      .finally(() => {
        if (!cancelled) setHdriLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cfg3d.hdriPreset, cfg3d.hdriUrl, cfg3d.hdriBackground]);

  // Hot-swap 3D room environment or layout chassis without recreating the GPU device
  useEffect(() => {
    const scene = sceneRef.current;
    const starTex = starTexRef.current;
    if (!scene || !starTex) return;
    if (envRef.current) {
      scene.remove(envRef.current.group);
      envRef.current.dispose();
    }
    const next = buildRoomEnvironment(cfg3d.scene, cfg3d.layout, cfg3d.particleDensity, starTex);
    scene.add(next.group);
    envRef.current = next;
    spatial3dBridge.dispatchCamera({ kind: "reset" });
  }, [cfg3d.scene, cfg3d.layout, cfg3d.particleDensity]);

  // Smoothly orbit around the 4-sided Compiz Cube whenever activeWorkspace changes
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
      {/* Interactive 3D WebGPU Room Canvas: drag to orbit 360°, ZQSD/WASD to fly, Arrows to look! */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full z-0 pointer-events-auto cursor-grab active:cursor-grabbing"
      />

      {/* Sleek Floating 3D Spatial Navigation, HDRI, Shadows & Layout Bar (Bottom-Left) */}
      <div className="fixed bottom-4 left-4 z-[60] hidden md:flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-2xl glass-dock border border-cyan-400/30 text-[11px] select-none shadow-2xl max-w-[calc(100vw-32px)]">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-mono text-[10px]">
          <Box className="w-3 h-3" />
          3D {backendLabel} · {fps} FPS
        </span>

        <span
          title="Déplacement libre : ZQSD/WASD (Espace/C hauteur, Shift sprint), Flèches ←↑↓→ rotation, Shift+Glisser fenêtre = profondeur Z, R = Reset"
          className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 font-mono text-[9px] text-zinc-300"
        >
          ZQSD · ←↑↓→ · Shift+Z
        </span>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* 5 True 3D Window Spatial Layouts */}
        {LAYOUT_BUTTONS.map((l) => {
          const active = cfg3d.layout === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => modStore.setDesktop3d({ layout: l.id })}
              className={`px-2 py-1 rounded-xl text-[10px] font-medium transition cursor-pointer ${
                active
                  ? "bg-gradient-to-r from-cyan-500/35 to-violet-500/35 text-white border border-cyan-300/50 shadow"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {l.emoji} {l.label}
            </button>
          );
        })}

        {cfg3d.layout === "compiz-cube" && (
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl bg-emerald-500/18 border border-emerald-400/35 text-emerald-200 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => rotateCube(-1)}
              className="p-0.5 hover:bg-white/15 rounded cursor-pointer"
              title="Tourner le Cube à gauche"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>F{wm.activeWorkspace}</span>
            <button
              type="button"
              onClick={() => rotateCube(1)}
              className="p-0.5 hover:bg-white/15 rounded cursor-pointer"
              title="Tourner le Cube à droite"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* Camera Actions */}
        <button
          type="button"
          onClick={() => {
            if (wm.activeWindowId) {
              spatial3dBridge.dispatchCamera({ kind: "focus-window", windowId: wm.activeWindowId });
            }
          }}
          title="Voler la caméra face à la fenêtre active (1:1)"
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] bg-white/8 hover:bg-white/18 text-white transition cursor-pointer"
        >
          <Crosshair className="w-3 h-3 text-cyan-300" />
          Focus
        </button>

        <button
          type="button"
          onClick={() => spatial3dBridge.dispatchCamera({ kind: "overview" })}
          title="Vue d'ensemble 3D de toute la scène"
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] bg-white/8 hover:bg-white/18 text-white transition cursor-pointer"
        >
          <Compass className="w-3 h-3 text-violet-300" />
          Vue 3D
        </button>

        <button
          type="button"
          onClick={() => {
            spatial3dBridge.resetDepthOffsets();
            spatial3dBridge.dispatchCamera({ kind: "reset" });
          }}
          title="Réinitialiser la caméra & profondeurs (touche R)"
          className="p-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Shadows & Double-Sided Toggles */}
        <button
          type="button"
          onClick={() => modStore.setDesktop3d({ shadowsEnabled: !cfg3d.shadowsEnabled })}
          title="Lumières & Ombres dynamiques temps réel (PCFSoftShadowMap)"
          className={`p-1 rounded-lg transition cursor-pointer ${
            cfg3d.shadowsEnabled
              ? "bg-amber-500/22 text-amber-200 border border-amber-400/40"
              : "text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => modStore.setDesktop3d({ doubleSidedWindows: !cfg3d.doubleSidedWindows })}
          title="Fenêtres visibles des 2 côtés (recto/verso holographique)"
          className={`p-1 rounded-lg transition cursor-pointer ${
            cfg3d.doubleSidedWindows
              ? "bg-emerald-500/22 text-emerald-200 border border-emerald-400/40"
              : "text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* Quick 3D Scene Switcher */}
        <select
          value={cfg3d.scene}
          onChange={(e) => modStore.setDesktop3d({ scene: e.target.value as Desktop3dSceneKind })}
          className="bg-white/8 border border-white/15 rounded-lg px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none cursor-pointer"
          title="Scène 3D architecturale"
        >
          {ENV_BUTTONS.map((ev) => (
            <option key={ev.id} value={ev.id} className="bg-[#0b0e18] text-white">
              {ev.label}
            </option>
          ))}
        </select>

        {/* Quick 360° HDRI Skybox Switcher */}
        <select
          value={cfg3d.hdriPreset}
          onChange={(e) => modStore.setDesktop3d({ hdriPreset: e.target.value as HdriPresetId })}
          className="bg-white/8 border border-white/15 rounded-lg px-1.5 py-0.5 text-[10px] text-cyan-200 outline-none cursor-pointer"
          title="Skybox HDRI 360° & Reflets PBR"
        >
          {HDRI_PRESETS.map((h) => (
            <option key={h.id} value={h.id} className="bg-[#0b0e18] text-white">
              {hdriLoading && cfg3d.hdriPreset === h.id ? "⏳ " : `${h.emoji} `}
              {h.name}
            </option>
          ))}
          {cfg3d.hdriUrl && (
            <option value="custom" className="bg-[#0b0e18] text-white">
              🌐 HDRI Perso
            </option>
          )}
        </select>

        <button
          type="button"
          onClick={() => wmStore.openApp("mod-studio")}
          title="Ouvrir Mod Studio"
          className="p-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => modStore.setDesktop3d({ enabled: false })}
          title="Revenir au bureau 2D"
          className="flex items-center gap-1 px-2 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 text-[10px] font-semibold cursor-pointer"
        >
          <Monitor className="w-3 h-3" />
          2D
          <X className="w-3 h-3" />
        </button>
      </div>
    </>
  );
};
