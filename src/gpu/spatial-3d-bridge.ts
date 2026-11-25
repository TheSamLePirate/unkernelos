import * as THREE from "three";
import type { WindowInstance, WorkspaceId } from "../wm/wm-store.ts";

export type Spatial3dLayoutKind =
  | "curved-cockpit"
  | "spatial-grid"
  | "compiz-cube"
  | "studio-desk"
  | "gallery-ring";

export interface SpatialWindowPose {
  readonly id: string;
  readonly workspace: WorkspaceId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly focused: boolean;
}

export type CameraCommand =
  | { readonly kind: "focus-window"; readonly windowId: string }
  | { readonly kind: "overview" }
  | { readonly kind: "workspace"; readonly workspace: WorkspaceId }
  | { readonly kind: "reset" };

const eps = (v: number): number => (Math.abs(v) < 1e-10 ? 0 : v);

/**
 * Exact Three.js CSS3DRenderer camera matrix formula (keeps WebGPURenderer & DOM windows
 * locked 1:1 down to sub-pixel precision on every frame!).
 */
export function toCameraCSSMatrix(matrixWorldInverse: THREE.Matrix4): string {
  const e = matrixWorldInverse.elements;
  return (
    "matrix3d(" +
    eps(e[0]!) + "," + eps(-e[1]!) + "," + eps(e[2]!) + "," + eps(e[3]!) + "," +
    eps(e[4]!) + "," + eps(-e[5]!) + "," + eps(e[6]!) + "," + eps(e[7]!) + "," +
    eps(e[8]!) + "," + eps(-e[9]!) + "," + eps(e[10]!) + "," + eps(e[11]!) + "," +
    eps(e[12]!) + "," + eps(-e[13]!) + "," + eps(e[14]!) + "," + eps(e[15]!) +
    ")"
  );
}

/**
 * Exact Three.js CSS3DRenderer object matrix formula for a DOM window placed in 3D world space.
 */
export function toObjectCSSMatrix(matrixWorld: THREE.Matrix4): string {
  const e = matrixWorld.elements;
  return (
    "translate(-50%,-50%) matrix3d(" +
    eps(e[0]!) + "," + eps(e[1]!) + "," + eps(e[2]!) + "," + eps(e[3]!) + "," +
    eps(-e[4]!) + "," + eps(-e[5]!) + "," + eps(-e[6]!) + "," + eps(-e[7]!) + "," +
    eps(e[8]!) + "," + eps(e[9]!) + "," + eps(e[10]!) + "," + eps(e[11]!) + "," +
    eps(e[12]!) + "," + eps(e[13]!) + "," + eps(e[14]!) + "," + eps(e[15]!) +
    ")"
  );
}

export const CUBE_HALF_SIZE = 760;

/**
 * Computes true 3D world poses `(x, y, z, rx, ry, rz)` for every open OS window
 * (in 1 world unit = 1 CSS pixel coordinates, origin at center of the 3D workspace!).
 */
export function computeSpatialWindowPoses(
  windows: readonly WindowInstance[],
  activeWindowId: string | null,
  activeWorkspace: WorkspaceId,
  layout: Spatial3dLayoutKind,
  viewportW: number,
  viewportH: number,
  depthOffsets?: ReadonlyMap<string, number>
): SpatialWindowPose[] {
  const vw = Math.max(800, viewportW);
  const vh = Math.max(600, viewportH);

  const activeWsVisible = windows
    .filter((w) => w.workspace === activeWorkspace && !w.minimized)
    .sort((a, b) => a.zIndex - b.zIndex);

  const allNonMinimized = windows
    .filter((w) => !w.minimized)
    .sort((a, b) => a.zIndex - b.zIndex);

  return windows.map((w) => {
    const isFocused = w.id === activeWindowId && w.workspace === activeWorkspace && !w.minimized;
    const userDepth = depthOffsets?.get(w.id) ?? 0;

    if (w.minimized) {
      return {
        id: w.id,
        workspace: w.workspace,
        x: 0,
        y: -2500,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        width: w.width,
        height: w.height,
        visible: false,
        focused: false,
      };
    }

    const winW = w.maximized ? Math.min(1180, vw - 80) : w.width;
    const winH = w.maximized ? Math.min(720, vh - 130) : w.height;
    const cx = w.maximized ? 0 : w.x + w.width / 2 - vw / 2;
    const cy = w.maximized ? 20 : -(w.y + w.height / 2 - vh / 2);

    // 1. TRUE 4-SIDED COMPIZ / BERYL 3D CUBE (all 4 workspaces mounted simultaneously on the 4 physical cube faces!)
    if (layout === "compiz-cube") {
      const sameWs = windows
        .filter((x) => x.workspace === w.workspace && !x.minimized)
        .sort((a, b) => a.zIndex - b.zIndex);
      const stackIdx = Math.max(0, sameWs.findIndex((x) => x.id === w.id));
      const faceOut = CUBE_HALF_SIZE + 44 + stackIdx * 42 + (isFocused ? 28 : 0) + userDepth;
      const localX = Math.max(-520, Math.min(520, cx * 0.85));
      const localY = Math.max(-250, Math.min(340, cy * 0.82 + 45));

      // Workspace 1 = Front (+Z), 2 = Right (+X), 3 = Back (-Z), 4 = Left (-X)
      const faceAngle = (w.workspace - 1) * (Math.PI / 2);
      const cosA = Math.cos(faceAngle);
      const sinA = Math.sin(faceAngle);
      const x = localX * cosA + faceOut * sinA;
      const z = -localX * sinA + faceOut * cosA;

      return {
        id: w.id,
        workspace: w.workspace,
        x,
        y: localY,
        z,
        rx: 0,
        ry: faceAngle,
        rz: 0,
        width: Math.min(winW, 1060),
        height: Math.min(winH, 660),
        visible: true,
        focused: isFocused,
      };
    }

    // 2. 360° SPATIAL GALLERY RING (all open windows float around you in a 3D panoramic ring!)
    if (layout === "gallery-ring") {
      const idx = Math.max(0, allNonMinimized.findIndex((x) => x.id === w.id));
      const total = Math.max(1, allNonMinimized.length);
      const radius = Math.max(1120, total * 255);
      const angle = total === 1 ? 0 : (idx / total) * Math.PI * 2;
      const lift = (isFocused ? 85 : 0) + userDepth;
      const r = Math.max(550, radius - lift);
      return {
        id: w.id,
        workspace: w.workspace,
        x: Math.sin(angle) * r,
        y: 65 + (isFocused ? 18 : 0),
        z: -Math.cos(angle) * r + radius - 160,
        rx: 0,
        ry: -angle,
        rz: 0,
        width: Math.min(winW, 1040),
        height: Math.min(winH, 650),
        visible: true,
        focused: isFocused,
      };
    }

    // Active workspace layouts
    if (w.workspace !== activeWorkspace) {
      return {
        id: w.id,
        workspace: w.workspace,
        x: 0,
        y: -2500,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        width: winW,
        height: winH,
        visible: false,
        focused: false,
      };
    }

    const idx = Math.max(0, activeWsVisible.findIndex((x) => x.id === w.id));
    const count = activeWsVisible.length;

    // 3. 3D SPATIAL COMMAND GRID WALL (zero-overlap curved multi-row × multi-column 3D grid!)
    if (layout === "spatial-grid") {
      const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 6 ? Math.min(3, Math.ceil(Math.sqrt(count))) : 4;
      const rows = Math.max(1, Math.ceil(count / cols));
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const cellW = count === 1 ? Math.min(1120, winW) : cols === 2 ? 860 : cols === 3 ? 760 : 680;
      const cellH = rows === 1 ? Math.min(680, winH) : 540;
      const gapX = 76;
      const gapY = 74;

      const rowCount = row === rows - 1 ? count - row * cols : cols;
      const flatX = (col - (rowCount - 1) / 2) * (cellW + gapX);
      const flatY = ((rows - 1) / 2 - row) * (cellH + gapY) + 90;

      const wallRadius = 2650;
      const theta = flatX / wallRadius;
      const zCurve = wallRadius - Math.cos(theta) * wallRadius;
      const x = Math.sin(theta) * wallRadius;
      const z = zCurve + (isFocused ? 75 : 0) + userDepth - 140;

      return {
        id: w.id,
        workspace: w.workspace,
        x,
        y: flatY,
        z,
        rx: -((flatY - 90) * 0.00014),
        ry: -theta * 0.85,
        rz: 0,
        width: cellW,
        height: cellH,
        visible: true,
        focused: isFocused,
      };
    }

    // 4. 3D VIRTUAL STUDIO WORKSTATION DESK (ergonomic triple-monitor / wing-monitor setup over a physical 3D desk!)
    if (layout === "studio-desk") {
      const focusedIdx = activeWsVisible.findIndex((x) => x.id === activeWindowId);
      const others = activeWsVisible.filter((x) => x.id !== activeWindowId);
      if (isFocused || (focusedIdx === -1 && idx === count - 1)) {
        return {
          id: w.id,
          workspace: w.workspace,
          x: cx * 0.35,
          y: 85 + cy * 0.25,
          z: 70 + userDepth,
          rx: -0.02,
          ry: 0,
          rz: 0,
          width: Math.min(winW, 1080),
          height: Math.min(winH, 660),
          visible: true,
          focused: isFocused,
        };
      }
      const oIdx = Math.max(0, others.findIndex((x) => x.id === w.id));
      const side = oIdx % 2 === 0 ? -1 : 1;
      const tier = Math.floor(oIdx / 2);
      const wingX = side * (920 + tier * 560);
      const wingZ = -180 - tier * 240 + userDepth;
      return {
        id: w.id,
        workspace: w.workspace,
        x: wingX,
        y: 88 + tier * 40,
        z: wingZ,
        rx: -0.02,
        ry: -side * 0.44,
        rz: 0,
        width: Math.min(winW, 960),
        height: Math.min(winH, 610),
        visible: true,
        focused: false,
      };
    }

    // 5. CURVED SPATIAL COCKPIT (Apple VisionOS / Minority Report Ergonomic 3D Arc)
    const arcRadius = 1580;
    const spreadX = count > 1 ? cx * 1.15 + (idx - (count - 1) / 2) * 145 : cx * 0.92;
    const clampedX = Math.max(-1480, Math.min(1480, spreadX));
    const theta = clampedX / arcRadius;
    const depthOffset = idx * 46 + (isFocused ? 95 : 0);
    const r = arcRadius - depthOffset;
    const x = Math.sin(theta) * r;
    const z = (arcRadius - Math.cos(theta) * r) * 0.9 + depthOffset + userDepth - 160;
    const y = Math.max(-180, Math.min(420, cy * 0.8 + 65));

    return {
      id: w.id,
      workspace: w.workspace,
      x,
      y,
      z,
      rx: -y * 0.00016,
      ry: -theta * 0.92,
      rz: 0,
      width: Math.min(winW, 1120),
      height: Math.min(winH, 680),
      visible: true,
      focused: isFocused,
    };
  });
}

class Spatial3dBridge {
  public cameraStageEl: HTMLDivElement | null = null;
  private windowEls = new Map<string, HTMLDivElement>();
  private commandListeners = new Set<(cmd: CameraCommand) => void>();
  public poses = new Map<string, SpatialWindowPose>();
  public depthOffsets = new Map<string, number>();

  public registerWindowEl(id: string, el: HTMLDivElement | null): void {
    if (el) {
      this.windowEls.set(id, el);
    } else {
      this.windowEls.delete(id);
    }
  }

  public getWindowEl(id: string): HTMLDivElement | undefined {
    return this.windowEls.get(id);
  }

  public setWindowDepth(id: string, z: number): void {
    const clamped = Math.max(-750, Math.min(750, Math.round(z)));
    this.depthOffsets.set(id, clamped);
  }

  public getWindowDepth(id: string): number {
    return this.depthOffsets.get(id) ?? 0;
  }

  public resetDepthOffsets(): void {
    this.depthOffsets.clear();
  }

  public onCameraCommand(fn: (cmd: CameraCommand) => void): () => void {
    this.commandListeners.add(fn);
    return () => this.commandListeners.delete(fn);
  }

  public dispatchCamera(cmd: CameraCommand): void {
    for (const fn of this.commandListeners) fn(cmd);
  }
}

export const spatial3dBridge = new Spatial3dBridge();
