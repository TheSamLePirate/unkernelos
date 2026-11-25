import {
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Monitor,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { WebGPURenderer } from "three/webgpu";
import { modStore, useMods, type Desktop3dSceneKind } from "../core/mod-store.ts";
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
  { id: "curved-cockpit", label: "Arc Spatial", emoji: "🥽" },
  { id: "compiz-cube", label: "Cube 4 Bureaux", emoji: "🧊" },
  { id: "studio-desk", label: "Bureau 3D", emoji: "🖥️" },
  { id: "gallery-ring", label: "Anneau 360°", emoji: "🪐" },
];

const ENV_BUTTONS: readonly { id: Desktop3dSceneKind; label: string }[] = [
  { id: "cyber-observatory", label: "Studio" },
  { id: "compiz-cube", label: "Compiz" },
  { id: "vision-horizon", label: "Horizon" },
  { id: "cyberpunk-city", label: "Night City" },
  { id: "kyoto-sanctuary", label: "Kyoto" },
];

interface PhysicalWindowMesh {
  group: THREE.Group;
  frameMesh: THREE.Mesh;
  rimMesh: THREE.LineSegments;
  shadowMesh: THREE.Mesh;
  width: number;
  height: number;
}

function createStarTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(186,230,253,0.7)");
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
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
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
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.needsUpdate = true;
  return tex;
}

interface EnvRuntime {
  group: THREE.Group;
  update: (t: number, speed: number) => void;
  dispose: () => void;
}

/**
 * Builds the 3D physical architectural environment scaled 1:1 with the real 3D DOM windows
 * (1 world unit = 1 CSS pixel, floor at y = -480, desk top at y = -390!).
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
      : "#38bdf8";

  const floorBg =
    envKind === "cyberpunk-city"
      ? "#080412"
      : envKind === "kyoto-sanctuary"
      ? "#051217"
      : "#070912";

  // 1. Vast Reflective 3D Floor Plane (grounds all floating 3D windows with real spatial depth!)
  const floorTex = createFloorGridTexture(accent, floorBg);
  disposables.push(floorTex);
  const floor = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(24000, 24000)),
    mat(
      new THREE.MeshStandardMaterial({
        map: floorTex,
        metalness: 0.72,
        roughness: 0.28,
      })
    )
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -480;
  group.add(floor);

  // 2. Physical 3D Studio Workstation Desk (when in Studio Desk or Curved Cockpit layout!)
  if (layout === "studio-desk" || layout === "curved-cockpit") {
    const deskTop = new THREE.Mesh(
      geo(new THREE.BoxGeometry(2700, 34, 960)),
      mat(
        new THREE.MeshPhysicalMaterial({
          color: envKind === "kyoto-sanctuary" ? "#132227" : "#0e121d",
          metalness: 0.65,
          roughness: 0.18,
          clearcoat: 0.9,
          clearcoatRoughness: 0.1,
        })
      )
    );
    deskTop.position.set(0, -405, -40);
    group.add(deskTop);

    // Glowing LED front trim strip along the studio desk
    const trim = new THREE.Mesh(
      geo(new THREE.BoxGeometry(2704, 5, 6)),
      mat(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 2.2,
        })
      )
    );
    trim.position.set(0, -390, 442);
    group.add(trim);

    // Sleek dark metallic legs
    const legGeo = geo(new THREE.BoxGeometry(44, 78, 720));
    const legMat = mat(new THREE.MeshStandardMaterial({ color: "#151926", metalness: 0.9, roughness: 0.25 }));
    for (const lx of [-1180, 1180]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -444, -40);
      group.add(leg);
    }

    // Illuminated Desk Mat & Tactile Spatial Keyboard Prop
    const matPad = new THREE.Mesh(
      geo(new THREE.BoxGeometry(1080, 4, 340)),
      mat(new THREE.MeshStandardMaterial({ color: "#090b12", roughness: 0.75, metalness: 0.15 }))
    );
    matPad.position.set(0, -386, 220);
    group.add(matPad);

    const kb = new THREE.Mesh(
      geo(new THREE.BoxGeometry(460, 14, 155)),
      mat(new THREE.MeshStandardMaterial({ color: "#1c2233", metalness: 0.75, roughness: 0.25 }))
    );
    kb.position.set(-40, -378, 225);
    group.add(kb);
  }

  // 3. Physical 3D Translucent Glass Compiz Cube Chassis (when layout === "compiz-cube"!)
  let cubeEdges: THREE.LineSegments | null = null;
  if (layout === "compiz-cube") {
    const coreGeo = geo(new THREE.BoxGeometry(CUBE_HALF_SIZE * 2, 920, CUBE_HALF_SIZE * 2));
    const coreMesh = new THREE.Mesh(
      coreGeo,
      mat(
        new THREE.MeshPhysicalMaterial({
          color: "#091922",
          transparent: true,
          opacity: 0.42,
          metalness: 0.25,
          roughness: 0.1,
          clearcoat: 1.0,
        })
      )
    );
    coreMesh.position.y = 20;
    group.add(coreMesh);

    cubeEdges = new THREE.LineSegments(
      geo(new THREE.EdgesGeometry(coreGeo)),
      mat(new THREE.LineBasicMaterial({ color: accent }))
    );
    cubeEdges.position.y = 20;
    group.add(cubeEdges);

    // Floating holographic turntable ring underneath the 4-workspace Cube
    const baseRing = new THREE.Mesh(
      geo(new THREE.TorusGeometry(CUBE_HALF_SIZE * 1.48, 8, 16, 128)),
      mat(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 1.8,
        })
      )
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -468;
    group.add(baseRing);
  }

  // 4. Environment Architectural Landmarks (placed far in the background so they frame the 3D windows cleanly!)
  if (envKind === "cyberpunk-city") {
    const bGeo = geo(new THREE.BoxGeometry(1, 1, 1));
    const bMat = mat(new THREE.MeshStandardMaterial({ color: "#0c0a1d", metalness: 0.75, roughness: 0.3 }));
    const capMats = ["#f43f5e", "#22d3ee", "#a855f7"].map((c) =>
      mat(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.0 }))
    );
    for (let i = 0; i < 42; i++) {
      const ang = (i / 42) * Math.PI * 2;
      const dist = 3600 + (i % 4) * 900;
      const h = 1200 + ((i * 233) % 2400);
      const w = 260 + ((i * 71) % 340);
      const mesh = new THREE.Mesh(bGeo, bMat);
      mesh.scale.set(w, h, w);
      mesh.position.set(Math.cos(ang) * dist, h / 2 - 480, Math.sin(ang) * dist);
      group.add(mesh);

      const cap = new THREE.Mesh(bGeo, capMats[i % capMats.length]!);
      cap.scale.set(w * 1.02, 22, w * 1.02);
      cap.position.set(Math.cos(ang) * dist, h - 470, Math.sin(ang) * dist);
      group.add(cap);
    }
  } else if (envKind === "vision-horizon") {
    const mtGeo = geo(new THREE.CylinderGeometry(5200, 7400, 2600, 64, 4, true));
    const pos = mtGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 5) * 480 + Math.cos(a * 11) * 240);
      }
    }
    mtGeo.computeVertexNormals();
    const mt = new THREE.Mesh(
      mtGeo,
      mat(new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.85, side: THREE.BackSide }))
    );
    mt.position.y = 480;
    group.add(mt);
  } else if (envKind === "kyoto-sanctuary") {
    const lGeo = geo(new THREE.CylinderGeometry(45, 34, 140, 6));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dist = 2400 + (i % 3) * 650;
      const col = i % 2 === 0 ? "#2dd4bf" : "#f472b6";
      const l = new THREE.Mesh(
        lGeo,
        mat(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5 }))
      );
      l.position.set(Math.cos(a) * dist, -120 + (i % 4) * 210, Math.sin(a) * dist);
      group.add(l);
    }
  } else {
    // Architectural Studio Orbital Ceiling Halo
    const ceilingRing = new THREE.Mesh(
      geo(new THREE.TorusGeometry(2400, 12, 16, 128)),
      mat(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 1.4,
        })
      )
    );
    ceilingRing.rotation.x = Math.PI / 2;
    ceilingRing.position.y = 1150;
    group.add(ceilingRing);
  }

  // 5. Subtle 3D Spatial Starfield / Depth Particles
  const pCount = Math.max(180, Math.min(1800, Math.round(700 * particleDensity)));
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 1800 + Math.random() * 5200;
    const theta = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(theta) * r;
    pPos[i * 3 + 1] = -320 + Math.random() * 2600;
    pPos[i * 3 + 2] = Math.sin(theta) * r;
  }
  const pGeo = geo(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    mat(
      new THREE.PointsMaterial({
        size: 36,
        map: starTex,
        color: accent,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  group.add(particles);

  return {
    group,
    update: (t, speed) => {
      particles.rotation.y = t * 0.015 * speed;
      if (cubeEdges) {
        cubeEdges.visible = true;
      }
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
    720,
    Math.min(1650, (Math.max(pose.height + 160, viewportH * 0.78) / 2) / Math.tan(fovRad / 2))
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
    const dist = CUBE_HALF_SIZE + 1260;
    return {
      pos: new THREE.Vector3(Math.sin(faceAngle) * dist, 160, Math.cos(faceAngle) * dist),
      target: new THREE.Vector3(0, 30, 0),
    };
  }
  if (layout === "studio-desk") {
    return {
      pos: new THREE.Vector3(0, 180, 1460),
      target: new THREE.Vector3(0, 50, -40),
    };
  }
  if (layout === "gallery-ring") {
    return {
      pos: new THREE.Vector3(0, 210, 1520),
      target: new THREE.Vector3(0, 40, -140),
    };
  }
  // curved-cockpit
  return {
    pos: new THREE.Vector3(0, 130, 1340),
    target: new THREE.Vector3(0, 40, -120),
  };
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

  const sceneRef = useRef<THREE.Scene | null>(null);
  const envRef = useRef<EnvRuntime | null>(null);
  const starTexRef = useRef<THREE.Texture | null>(null);
  const windowMeshesRef = useRef<Map<string, PhysicalWindowMesh>>(new Map());
  const flyTargetRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(0, 130, 1340),
    target: new THREE.Vector3(0, 40, -120),
    active: false,
  });

  // Main synchronized Three.js WebGPU + Real 3D DOM Window Compositor loop!
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
    scene.fog = new THREE.FogExp2("#05070e", 0.00014);
    sceneRef.current = scene;

    const FOV = 50;
    const camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / Math.max(1, window.innerHeight),
      20,
      24000
    );
    const initCam = computeDefaultCamera(cfgRef.current.layout, wmRef.current.activeWorkspace);
    camera.position.copy(initCam.pos);

    // Studio architectural lighting
    const hemi = new THREE.HemisphereLight("#c4b5fd", "#090d1a", 0.95);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight("#e0f2fe", 1.8);
    keyLight.position.set(1200, 1800, 1600);
    scene.add(keyLight);
    const cyanLight = new THREE.PointLight("#22d3ee", 3.5, 6500, 0.4);
    cyanLight.position.set(-1400, 600, 900);
    scene.add(cyanLight);
    const violetLight = new THREE.PointLight("#a855f7", 3.5, 6500, 0.4);
    violetLight.position.set(1400, 500, -700);
    scene.add(violetLight);

    const starTex = createStarTexture();
    starTexRef.current = starTex;

    // Always-on background OrbitControls: drag empty 3D room to orbit 360°, right-drag to pan, scroll to zoom!
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.85;
    controls.minDistance = 420;
    controls.maxDistance = 5200;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.target.copy(initCam.target);
    controls.update();

    // Cancel camera fly-to as soon as user manually grabs the 3D canvas
    const cancelFly = () => {
      flyTargetRef.current.active = false;
    };
    controls.addEventListener("start", cancelFly);

    // Reusable matrix temporaries for zero-GC 60fps window synchronization
    const tmpObj = new THREE.Object3D();
    const sharedBezelMat = new THREE.MeshPhysicalMaterial({
      color: "#0b0f1b",
      metalness: 0.88,
      roughness: 0.16,
      clearcoat: 1.0,
    });
    const sharedShadowMat = new THREE.MeshBasicMaterial({
      color: "#000000",
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });

    const syncPhysicalWindows = (poses: readonly SpatialWindowPose[]) => {
      const seen = new Set<string>();
      for (const p of poses) {
        seen.add(p.id);
        let entry = windowMeshesRef.current.get(p.id);
        if (!entry || Math.abs(entry.width - p.width) > 4 || Math.abs(entry.height - p.height) > 4) {
          if (entry) {
            scene.remove(entry.group);
            entry.frameMesh.geometry.dispose();
            entry.rimMesh.geometry.dispose();
            (entry.rimMesh.material as THREE.Material).dispose();
            entry.shadowMesh.geometry.dispose();
          }
          const grp = new THREE.Group();
          const boxGeo = new THREE.BoxGeometry(p.width + 14, p.height + 14, 18);
          const frameMesh = new THREE.Mesh(boxGeo, sharedBezelMat);
          frameMesh.position.z = -13; // sits cleanly right behind the real DOM window!
          grp.add(frameMesh);

          const rimGeo = new THREE.EdgesGeometry(boxGeo);
          const rimMat = new THREE.LineBasicMaterial({
            color: p.focused ? "#38bdf8" : "#475569",
          });
          const rimMesh = new THREE.LineSegments(rimGeo, rimMat);
          rimMesh.position.z = -13;
          grp.add(rimMesh);

          const shadowMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(p.width * 0.92, 260),
            sharedShadowMat
          );
          shadowMesh.rotation.x = -Math.PI / 2;
          grp.add(shadowMesh);

          scene.add(grp);
          entry = { group: grp, frameMesh, rimMesh, shadowMesh, width: p.width, height: p.height };
          windowMeshesRef.current.set(p.id, entry);
        }

        entry.group.visible = p.visible;
        if (p.visible) {
          entry.group.position.set(p.x, p.y, p.z);
          entry.group.rotation.set(p.rx, p.ry, p.rz);
          (entry.rimMesh.material as THREE.LineBasicMaterial).color.set(p.focused ? "#38bdf8" : "#334155");
          // Ground reflection/shadow sits right on the studio floor beneath the window
          entry.shadowMesh.position.set(0, -476 - p.y, 0);
        }
      }

      // Cleanup closed windows
      for (const [id, entry] of windowMeshesRef.current.entries()) {
        if (!seen.has(id)) {
          scene.remove(entry.group);
          entry.frameMesh.geometry.dispose();
          entry.rimMesh.geometry.dispose();
          (entry.rimMesh.material as THREE.Material).dispose();
          entry.shadowMesh.geometry.dispose();
          windowMeshesRef.current.delete(id);
        }
      }
    };

    // Listen for camera fly-to commands (Focus window, Overview, Workspace Cube spin, Reset)
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
            pos: new THREE.Vector3(Math.sin(ang) * 2950, 920, Math.cos(ang) * 2950),
            target: new THREE.Vector3(0, 20, 0),
            active: true,
          };
        } else {
          flyTargetRef.current = {
            pos: new THREE.Vector3(680, 740, 2450),
            target: new THREE.Vector3(0, 20, -120),
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
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        r.setSize(window.innerWidth, window.innerHeight, false);
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.15;

        const isWebGpu = Boolean((r.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend);
        setBackendLabel(isWebGpu ? "WebGPU" : "WebGL2");

        try {
          pmrem = new THREE.PMREMGenerator(r as unknown as THREE.WebGLRenderer);
          const room = new RoomEnvironment();
          envTarget = pmrem.fromScene(room, 0.04);
          scene.environment = envTarget.texture;
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
        const t0 = fpsLast;

        const animate = (now: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(animate);
          if (document.hidden) return;

          const elapsed = (now - t0) / 1000;
          const curCfg = cfgRef.current;
          const curWm = wmRef.current;

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
            h
          );

          // 2. Sync Three.js physical 3D glass/chrome bezels & floor shadows behind every window
          syncPhysicalWindows(poses);

          // 3. Apply EXACT CSS3DRenderer camera matrix to the live React window stage (ZERO React re-render!)
          const stage = spatial3dBridge.cameraStageEl;
          if (stage) {
            const fovPx = camera.projectionMatrix.elements[5]! * (h / 2);
            stage.style.transform =
              `perspective(${fovPx.toFixed(2)}px) translateZ(${fovPx.toFixed(2)}px) ` +
              `${toCameraCSSMatrix(camera.matrixWorldInverse)} ` +
              `translate(${(w / 2).toFixed(2)}px, ${(h / 2).toFixed(2)}px)`;
          }

          // 4. Position EVERY real DOM WindowFrame directly in 3D world space using the exact same Three.js Matrix4!
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

          // Animate environment particles & lighting
          const boost = Math.max(0.3, curCfg.bloomIntensity);
          cyanLight.intensity = 3.2 * boost;
          violetLight.intensity = 3.2 * boost;
          envRef.current?.update(elapsed, curCfg.cameraSpeed);

          // Render the 3D WebGPU room + physical window bezels
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
      controls.dispose();

      // Clean up DOM transforms cleanly when returning to 2D!
      if (spatial3dBridge.cameraStageEl) {
        spatial3dBridge.cameraStageEl.style.transform = "";
      }
      for (const el of windowMeshesRef.current.keys()) {
        const dom = spatial3dBridge.getWindowEl(el);
        if (dom) dom.style.transform = "";
      }
      for (const entry of windowMeshesRef.current.values()) {
        scene.remove(entry.group);
        entry.frameMesh.geometry.dispose();
        entry.rimMesh.geometry.dispose();
        (entry.rimMesh.material as THREE.Material).dispose();
        entry.shadowMesh.geometry.dispose();
      }
      windowMeshesRef.current.clear();
      sharedBezelMat.dispose();
      sharedShadowMat.dispose();
      envRef.current?.dispose();
      envRef.current = null;
      starTex.dispose();
      envTarget?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
    };
  }, []);

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

  // Smoothly orbit the 3D camera around the 4-sided Compiz Cube whenever activeWorkspace changes!
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
      {/* Interactive 3D WebGPU Room Canvas: drag ANYWHERE around windows to orbit 360°, scroll to zoom! */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full z-0 pointer-events-auto cursor-grab active:cursor-grabbing"
      />

      {/* Sleek Floating 3D Spatial Navigation & Layout Bar (Bottom-Left) */}
      <div className="fixed bottom-4 left-4 z-[60] hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl glass-dock border border-cyan-400/30 text-[11px] select-none shadow-2xl">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-mono text-[10px]">
          <Box className="w-3 h-3" />
          3D {backendLabel} · {fps} FPS
        </span>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* 4 True 3D Window Spatial Layouts */}
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

        {/* Camera Actions: Focus Active Window, Overview 3D, Reset */}
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
          title="Vue d'ensemble 3D de toute la pièce / du Cube"
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] bg-white/8 hover:bg-white/18 text-white transition cursor-pointer"
        >
          <Compass className="w-3 h-3 text-violet-300" />
          Vue 3D
        </button>

        <button
          type="button"
          onClick={() => spatial3dBridge.dispatchCamera({ kind: "reset" })}
          title="Réinitialiser la caméra"
          className="p-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* Quick 3D Room Environment Switcher */}
        <select
          value={cfg3d.scene}
          onChange={(e) => modStore.setDesktop3d({ scene: e.target.value as Desktop3dSceneKind })}
          className="bg-white/8 border border-white/15 rounded-lg px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none cursor-pointer"
          title="Environnement 3D de la pièce"
        >
          {ENV_BUTTONS.map((ev) => (
            <option key={ev.id} value={ev.id} className="bg-[#0b0e18] text-white">
              {ev.label}
            </option>
          ))}
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
