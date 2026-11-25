import { Box, Compass, Layers, Orbit, SlidersHorizontal, Sparkles, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { WebGPURenderer } from "three/webgpu";
import { modStore, useMods, type Desktop3dSceneKind } from "../core/mod-store.ts";
import { wmStore } from "../wm/wm-store.ts";

const SCENE_LABELS: readonly { id: Desktop3dSceneKind; label: string; emoji: string }[] = [
  { id: "cyber-observatory", label: "Observatory", emoji: "🪐" },
  { id: "liquid-monolith", label: "Monolith", emoji: "💎" },
  { id: "cyberpunk-city", label: "Night City", emoji: "⚡" },
  { id: "kyoto-sanctuary", label: "Kyoto Zen", emoji: "🪷" },
];

function createGlowSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(186,230,253,0.75)");
  g.addColorStop(0.65, "rgba(139,92,246,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

interface WorldRuntime {
  group: THREE.Group;
  update: (t: number, dt: number, speed: number) => void;
  dispose: () => void;
}

function buildWorld(
  kind: Desktop3dSceneKind,
  particleDensity: number,
  glowTex: THREE.Texture
): WorldRuntime {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // Shared ambient particle starfield / dust
  const pCount = Math.max(220, Math.min(2400, Math.round(900 * particleDensity)));
  const pPos = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  const palette =
    kind === "cyberpunk-city"
      ? [new THREE.Color("#f43f5e"), new THREE.Color("#22d3ee"), new THREE.Color("#eab308")]
      : kind === "kyoto-sanctuary"
      ? [new THREE.Color("#2dd4bf"), new THREE.Color("#f472b6"), new THREE.Color("#99f6e4")]
      : kind === "liquid-monolith"
      ? [new THREE.Color("#e2e8f0"), new THREE.Color("#38bdf8"), new THREE.Color("#a78bfa")]
      : [new THREE.Color("#38bdf8"), new THREE.Color("#a855f7"), new THREE.Color("#22d3ee")];

  for (let i = 0; i < pCount; i++) {
    const r = 4.5 + Math.random() * 24;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.35) * 14;
    pPos[i * 3] = Math.cos(theta) * r;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = Math.sin(theta) * r;
    const c = palette[i % palette.length]!;
    pCol[i * 3] = c.r;
    pCol[i * 3 + 1] = c.g;
    pCol[i * 3 + 2] = c.b;
  }
  const pGeo = trackGeo(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pMat = trackMat(
    new THREE.PointsMaterial({
      size: 0.22,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);

  // Reflective dark obsidian floor plane
  const floorGeo = trackGeo(new THREE.PlaneGeometry(90, 90));
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: kind === "kyoto-sanctuary" ? "#051418" : kind === "cyberpunk-city" ? "#090412" : "#060812",
      metalness: 0.88,
      roughness: kind === "kyoto-sanctuary" ? 0.1 : 0.22,
    })
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.85;
  group.add(floor);

  if (kind === "cyber-observatory") {
    const grid = new THREE.GridHelper(64, 48, "#22d3ee", "#1e1b4b");
    grid.position.y = -2.83;
    group.add(grid);

    // Central Liquid-Metal TorusKnot Core
    const knotGeo = trackGeo(new THREE.TorusKnotGeometry(1.45, 0.42, 220, 36, 2, 3));
    const knotMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#cbd5e1",
        metalness: 1.0,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        iridescence: 0.92,
        iridescenceIOR: 1.45,
        envMapIntensity: 1.85,
      })
    );
    const knot = new THREE.Mesh(knotGeo, knotMat);
    knot.position.y = 0.25;
    group.add(knot);

    // 3 Holographic Orbital Data Rings
    const ringSpecs = [
      { r: 2.95, tube: 0.025, color: "#22d3ee", rx: 1.15, rz: 0.35 },
      { r: 3.65, tube: 0.02, color: "#a855f7", rx: 0.65, rz: -0.75 },
      { r: 4.45, tube: 0.016, color: "#f43f5e", rx: -0.95, rz: 0.5 },
    ];
    const rings: THREE.Mesh[] = [];
    for (const spec of ringSpecs) {
      const rGeo = trackGeo(new THREE.TorusGeometry(spec.r, spec.tube, 18, 128));
      const rMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.color,
          emissiveIntensity: 2.1,
          roughness: 0.2,
          metalness: 0.6,
        })
      );
      const mesh = new THREE.Mesh(rGeo, rMat);
      mesh.rotation.set(spec.rx, 0, spec.rz);
      mesh.position.y = 0.25;
      group.add(mesh);
      rings.push(mesh);
    }

    // Orbiting Glowing Quantum Satellites
    const satGeo = trackGeo(new THREE.OctahedronGeometry(0.18, 0));
    const sats: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const col = i % 2 === 0 ? "#22d3ee" : "#c084fc";
      const sMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 1.8,
          metalness: 0.9,
          roughness: 0.12,
        })
      );
      const sat = new THREE.Mesh(satGeo, sMat);
      group.add(sat);
      sats.push(sat);
    }

    return {
      group,
      update: (t, _dt, speed) => {
        const s = t * speed;
        knot.rotation.x = s * 0.28;
        knot.rotation.y = s * 0.42;
        knot.position.y = 0.25 + Math.sin(s * 0.9) * 0.2;
        rings[0]!.rotation.z = s * 0.4;
        rings[0]!.rotation.y = s * 0.22;
        rings[1]!.rotation.x = 0.65 + Math.sin(s * 0.3) * 0.25;
        rings[1]!.rotation.y = -s * 0.35;
        rings[2]!.rotation.z = -s * 0.24;
        sats.forEach((sat, i) => {
          const a = s * (0.45 + (i % 3) * 0.14) + (i * Math.PI * 2) / sats.length;
          const rad = 3.2 + (i % 3) * 0.85;
          sat.position.set(Math.cos(a) * rad, 0.25 + Math.sin(a * 2 + i) * 1.15, Math.sin(a) * rad);
          sat.rotation.set(s + i, s * 1.2, 0);
        });
        particles.rotation.y = s * 0.04;
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  if (kind === "liquid-monolith") {
    // Sculpted Liquid Chrome Icosahedron with live vertex ripples
    const icoGeo = trackGeo(new THREE.IcosahedronGeometry(1.85, 5));
    const basePos = new Float32Array(icoGeo.attributes.position.array);
    const icoMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#e2e8f0",
        metalness: 1.0,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        iridescence: 1.0,
        iridescenceIOR: 1.6,
        envMapIntensity: 2.1,
      })
    );
    const monolith = new THREE.Mesh(icoGeo, icoMat);
    monolith.position.y = 0.45;
    group.add(monolith);

    // Floating chrome shards around the monolith
    const shardGeo = trackGeo(new THREE.OctahedronGeometry(0.32, 0));
    const shardMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#bae6fd",
        metalness: 0.92,
        roughness: 0.08,
        clearcoat: 1.0,
        envMapIntensity: 1.8,
      })
    );
    const shards: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.scale.set(0.65, 1.8 + (i % 3) * 0.4, 0.65);
      group.add(m);
      shards.push(m);
    }

    // Luminous studio pedestal ring
    const pedGeo = trackGeo(new THREE.RingGeometry(2.6, 2.75, 96));
    const pedMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: "#38bdf8",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.rotation.x = -Math.PI / 2;
    ped.position.y = -2.82;
    group.add(ped);

    return {
      group,
      update: (t, _dt, speed) => {
        const s = t * speed;
        const pos = icoGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const bx = basePos[i * 3]!;
          const by = basePos[i * 3 + 1]!;
          const bz = basePos[i * 3 + 2]!;
          const disp = 1 + 0.085 * Math.sin(bx * 2.4 + s * 1.9) * Math.cos(by * 2.4 - s * 1.5) * Math.sin(bz * 2.1 + s);
          pos.setXYZ(i, bx * disp, by * disp, bz * disp);
        }
        pos.needsUpdate = true;
        icoGeo.computeVertexNormals();
        monolith.rotation.y = s * 0.25;
        monolith.position.y = 0.45 + Math.sin(s * 0.8) * 0.18;

        shards.forEach((sh, i) => {
          const a = s * 0.35 + (i * Math.PI * 2) / shards.length;
          const r = 3.5 + (i % 2) * 1.1;
          sh.position.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 1.6 + 0.3, Math.sin(a) * r);
          sh.rotation.set(s * 0.5 + i, s * 0.8, a);
        });
        particles.rotation.y = -s * 0.05;
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  if (kind === "cyberpunk-city") {
    const grid = new THREE.GridHelper(80, 56, "#f43f5e", "#0891b2");
    grid.position.y = -2.83;
    group.add(grid);

    // Synthwave Neon Sun on Horizon
    const sunGeo = trackGeo(new THREE.CircleGeometry(4.4, 64));
    const sunMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: "#f43f5e",
        transparent: true,
        opacity: 0.88,
      })
    );
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 2.2, -24);
    group.add(sun);

    // Procedural Megacity Skyline Towers along the cyber boulevard
    const bGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const darkMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: "#0c0a1d",
        metalness: 0.78,
        roughness: 0.25,
      })
    );
    const neonMats = ["#22d3ee", "#f43f5e", "#a855f7", "#eab308"].map((c) =>
      trackMat(
        new THREE.MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 2.2,
          roughness: 0.2,
        })
      )
    );

    const towers: THREE.Group[] = [];
    for (let i = 0; i < 64; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lane = 3.6 + (i % 4) * 2.4 + Math.random() * 1.2;
      const z = -22 + Math.floor(i / 2) * 1.15;
      const h = 2.2 + ((i * 37) % 10) * 0.72;
      const w = 0.8 + ((i * 13) % 5) * 0.22;

      const tg = new THREE.Group();
      const body = new THREE.Mesh(bGeo, darkMat);
      body.scale.set(w, h, w);
      body.position.y = h / 2 - 2.85;
      tg.add(body);

      const cap = new THREE.Mesh(bGeo, neonMats[i % neonMats.length]!);
      cap.scale.set(w * 1.03, 0.08, w * 1.03);
      cap.position.y = h - 2.81;
      tg.add(cap);

      tg.position.set(side * lane, 0, z);
      group.add(tg);
      towers.push(tg);
    }

    // Hover Traffic Light-Streams
    const streamGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.06, 1.6));
    const streams: { mesh: THREE.Mesh; speed: number; dir: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const mat = dir > 0 ? neonMats[0]! : neonMats[1]!;
      const mesh = new THREE.Mesh(streamGeo, mat);
      mesh.position.set((Math.random() - 0.5) * 6.0, -1.6 + Math.random() * 4.2, (Math.random() - 0.5) * 32);
      group.add(mesh);
      streams.push({ mesh, speed: 6 + Math.random() * 10, dir });
    }

    return {
      group,
      update: (t, dt, speed) => {
        const s = t * speed;
        sun.scale.setScalar(1 + Math.sin(s * 1.5) * 0.03);
        for (const st of streams) {
          st.mesh.position.z += st.dir * st.speed * dt * Math.max(0.25, speed);
          if (st.mesh.position.z > 14) st.mesh.position.z = -24;
          if (st.mesh.position.z < -24) st.mesh.position.z = 14;
        }
        particles.rotation.y = s * 0.03;
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
      },
    };
  }

  // Kyoto Floating Sanctuary
  const lanternGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.95, 6));
  const haloGeo = trackGeo(new THREE.TorusGeometry(0.55, 0.015, 12, 48));
  const lanterns: { grp: THREE.Group; baseY: number; phase: number; radius: number; angle: number }[] = [];

  for (let i = 0; i < 14; i++) {
    const col = i % 3 === 0 ? "#f472b6" : i % 3 === 1 ? "#2dd4bf" : "#fbbf24";
    const lMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 1.5,
        roughness: 0.15,
        metalness: 0.2,
        clearcoat: 1.0,
      })
    );
    const hMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.5,
      })
    );
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(lanternGeo, lMat));
    const halo = new THREE.Mesh(haloGeo, hMat);
    halo.rotation.x = Math.PI / 2;
    grp.add(halo);

    const angle = (i / 14) * Math.PI * 2;
    const radius = 2.6 + (i % 3) * 2.1;
    const baseY = -1.2 + (i % 4) * 0.85;
    grp.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius - 1.5);
    group.add(grp);
    lanterns.push({ grp, baseY, phase: i * 0.9, radius, angle });
  }

  // Tranquil concentric water rings
  const rippleMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const rGeo = trackGeo(new THREE.RingGeometry(1.5 + i * 1.8, 1.56 + i * 1.8, 72));
    const rMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: "#2dd4bf",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.24 - i * 0.04,
      })
    );
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = -2.83;
    group.add(rMesh);
    rippleMeshes.push(rMesh);
  }

  return {
    group,
    update: (t, _dt, speed) => {
      const s = t * speed;
      for (const l of lanterns) {
        const a = l.angle + s * 0.12;
        l.grp.position.x = Math.cos(a) * l.radius;
        l.grp.position.z = Math.sin(a) * l.radius - 1.5;
        l.grp.position.y = l.baseY + Math.sin(s * 1.1 + l.phase) * 0.35;
        l.grp.rotation.y = s * 0.4 + l.phase;
      }
      rippleMeshes.forEach((r, i) => {
        const sc = 0.8 + ((s * 0.25 + i * 0.25) % 1) * 1.4;
        r.scale.setScalar(sc);
      });
      particles.rotation.y = s * 0.035;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export const ThreeDesktop3d: React.FC = () => {
  const mods = useMods();
  const cfg3d = mods.desktop3d;
  const cfgRef = useRef(cfg3d);
  cfgRef.current = cfg3d;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backendLabel, setBackendLabel] = useState<"WebGPU" | "WebGL2" | "Init…">("Init…");
  const [fps, setFps] = useState(60);

  const worldRef = useRef<WorldRuntime | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const glowTexRef = useRef<THREE.Texture | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointerRef = useRef({ nx: 0, ny: 0 });

  // Main Three.js WebGPU renderer lifecycle
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
    scene.fog = new THREE.FogExp2("#05070e", 0.036);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      140
    );
    camera.position.set(0, 1.35, 8.8);

    // Studio 3-point + colored accent lighting
    const hemi = new THREE.HemisphereLight("#c4b5fd", "#090d1a", 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#e0f2fe", 2.2);
    keyLight.position.set(6, 9, 7);
    scene.add(keyLight);

    const cyanLight = new THREE.PointLight("#22d3ee", 28, 28);
    cyanLight.position.set(-5.5, 2.5, 4.0);
    scene.add(cyanLight);

    const violetLight = new THREE.PointLight("#a855f7", 30, 28);
    violetLight.position.set(5.5, 1.8, -3.5);
    scene.add(violetLight);

    const roseLight = new THREE.PointLight("#f43f5e", 18, 24);
    roseLight.position.set(0, -1.6, 5.5);
    scene.add(roseLight);

    const glowTex = createGlowSpriteTexture();
    glowTexRef.current = glowTex;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.5;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.enabled = cfgRef.current.interactiveOrbit;
    controlsRef.current = controls;

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerRef.current.ny = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

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
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        r.setPixelRatio(dpr);
        r.setSize(window.innerWidth, window.innerHeight, false);
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.12;

        const isWebGpuBackend = Boolean((r.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend);
        setBackendLabel(isWebGpuBackend ? "WebGPU" : "WebGL2");

        // Studio reflections environment map (works across both WebGPU & WebGL2 backends)
        try {
          pmrem = new THREE.PMREMGenerator(r as unknown as THREE.WebGLRenderer);
          const room = new RoomEnvironment();
          envTarget = pmrem.fromScene(room, 0.04);
          scene.environment = envTarget.texture;
          room.dispose();
        } catch {
          // Graceful fallback: 3-point + hemisphere lights still look stellar
        }

        // Build initial 3D world
        const initialWorld = buildWorld(cfgRef.current.scene, cfgRef.current.particleDensity, glowTex);
        scene.add(initialWorld.group);
        worldRef.current = initialWorld;

        let lastTime = performance.now();
        let fpsFrames = 0;
        let fpsLast = lastTime;
        const t0 = lastTime;

        const animate = (now: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(animate);
          if (document.hidden) return;

          const dt = Math.min(0.05, (now - lastTime) / 1000);
          lastTime = now;
          const elapsed = (now - t0) / 1000;
          const cur = cfgRef.current;

          // Dynamic orbiting colored rim lights
          cyanLight.position.x = Math.cos(elapsed * 0.45) * 6.2;
          cyanLight.position.z = Math.sin(elapsed * 0.45) * 6.2;
          violetLight.position.x = Math.cos(elapsed * 0.35 + Math.PI) * 6.5;
          violetLight.position.z = Math.sin(elapsed * 0.35 + Math.PI) * 6.5;

          const boost = Math.max(0.3, cur.bloomIntensity);
          cyanLight.intensity = 26 * boost;
          violetLight.intensity = 28 * boost;
          roseLight.intensity = 16 * boost;

          worldRef.current?.update(elapsed, dt, cur.cameraSpeed);

          if (cur.interactiveOrbit) {
            controls.update();
          } else {
            const p = cur.mouseParallax;
            const targetX = pointerRef.current.nx * 1.45 * p + Math.sin(elapsed * 0.16 * cur.cameraSpeed) * 0.55;
            const targetY = 1.35 - pointerRef.current.ny * 0.72 * p + Math.cos(elapsed * 0.2 * cur.cameraSpeed) * 0.18;
            camera.position.x += (targetX - camera.position.x) * 0.045;
            camera.position.y += (targetY - camera.position.y) * 0.045;
            camera.position.z += (8.8 - camera.position.z) * 0.04;
            camera.lookAt(0, 0.15, 0);
          }

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
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      worldRef.current?.dispose();
      worldRef.current = null;
      glowTex.dispose();
      envTarget?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
    };
  }, []);

  // Hot-swap 3D world or particle density without recreating GPU device!
  useEffect(() => {
    const scene = sceneRef.current;
    const glowTex = glowTexRef.current;
    if (!scene || !glowTex) return;
    if (worldRef.current) {
      scene.remove(worldRef.current.group);
      worldRef.current.dispose();
    }
    const next = buildWorld(cfg3d.scene, cfg3d.particleDensity, glowTex);
    scene.add(next.group);
    worldRef.current = next;
  }, [cfg3d.scene, cfg3d.particleDensity]);

  // Toggle OrbitControls dynamically
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = cfg3d.interactiveOrbit;
    }
  }, [cfg3d.interactiveOrbit]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 w-full h-full z-0 ${
          cfg3d.interactiveOrbit ? "pointer-events-auto cursor-grab active:cursor-grabbing" : "pointer-events-none"
        }`}
      />

      {/* Sleek Floating 3D Spatial Controls Pill (Bottom-Left) */}
      <div className="fixed bottom-4 left-4 z-[45] hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl glass-dock text-[11px] select-none">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/18 border border-cyan-400/35 text-cyan-200 font-mono text-[10px]">
          <Box className="w-3 h-3" />
          3D {backendLabel} · {fps} FPS
        </span>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {SCENE_LABELS.map((sc) => {
          const active = cfg3d.scene === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => modStore.setDesktop3d({ scene: sc.id })}
              className={`px-2 py-1 rounded-xl text-[10px] font-medium transition cursor-pointer ${
                active
                  ? "bg-white/18 text-white border border-white/30 shadow"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {sc.emoji} {sc.label}
            </button>
          );
        })}

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        <button
          type="button"
          onClick={() => modStore.setDesktop3d({ interactiveOrbit: !cfg3d.interactiveOrbit })}
          title="Activer la caméra libre 360° (glisser sur le bureau pour orbiter)"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] transition cursor-pointer ${
            cfg3d.interactiveOrbit
              ? "bg-violet-500/30 border border-violet-400/50 text-violet-100"
              : "text-zinc-300 hover:text-white hover:bg-white/10"
          }`}
        >
          <Orbit className="w-3 h-3" />
          Orbit
        </button>

        <button
          type="button"
          onClick={() => modStore.setDesktop3d({ spatialWindows: !cfg3d.spatialWindows })}
          title="Profondeur spatiale 3D des fenêtres"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] transition cursor-pointer ${
            cfg3d.spatialWindows
              ? "bg-emerald-500/25 border border-emerald-400/45 text-emerald-100"
              : "text-zinc-300 hover:text-white hover:bg-white/10"
          }`}
        >
          <Layers className="w-3 h-3" />
          Spatial
        </button>

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
          onClick={() => modStore.setDesktop3d({ enabled: false, interactiveOrbit: false })}
          title="Revenir au bureau 2D"
          className="p-1 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-rose-500/15 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Orbit Helper Hint Banner */}
      {cfg3d.interactiveOrbit && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[45] px-3.5 py-1.5 rounded-full glass-surface-focused border border-violet-400/40 text-[11px] text-violet-100 flex items-center gap-2 pointer-events-none">
          <Compass className="w-3.5 h-3.5 text-cyan-300 animate-spin" style={{ animationDuration: "6s" }} />
          <span>Mode Caméra 3D Orbit actif — Glissez sur le fond pour explorer · Molette pour zoomer</span>
          <Sparkles className="w-3 h-3 text-violet-300" />
        </div>
      )}
    </>
  );
};
