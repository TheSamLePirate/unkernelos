import type { WindowInstance, WorkspaceId } from "./wm-store.ts";
export type HorizonPlacement = "center" | "left" | "right";
export type HorizonLayout = "focus" | "split" | "triple";
export interface HorizonPose {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  angle: number;
  z: number;
  hidden: boolean;
  depth?: number;
  docked?: boolean;
}
export const HORIZON_DOCK_DEPTH = 0.94;
export const HORIZON_DRAWER_WIDTH = 340;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
/** Continuous travel, not rectangular side snap targets. Only the terminal ends dock. */
export function horizonTravel(x: number, width: number) {
  const side: HorizonPlacement =
    x < width * 0.32 ? "left" : x > width * 0.68 ? "right" : "center";
  const distance = side === "left" ? width * 0.32 - x : x - width * 0.68;
  const depth =
    side === "center"
      ? 0
      : clamp(distance / Math.max(1, width * 0.32 - 32), 0, 1);
  return { placement: side, depth, docked: depth >= HORIZON_DOCK_DEPTH };
}
export const horizonDepthScale = (depth: number) =>
  Math.exp(-2.65 * clamp(depth, 0, 1));
export const isHorizonDocked = (win: WindowInstance) =>
  win.placement !== "center" &&
  !!win.horizonSpatial &&
  win.horizonSpatial.depth >= HORIZON_DOCK_DEPTH;
export function fitHorizonDrawer(
  pose: HorizonPose,
  win: WindowInstance,
  width: number,
  height: number,
): HorizonPose {
  if (!win.horizonDrawerOpen || pose.hidden) return pose;
  const mobile = width < 760;
  const extent = pose.width + (mobile ? 0 : HORIZON_DRAWER_WIDTH + 28);
  const scale = Math.min(
    1,
    (width - (mobile ? 28 : 60)) / extent,
    (height - (mobile ? 175 : 240)) / pose.height,
  );
  const angle = mobile ? 0 : pose.angle * 0.25;
  // Parent perspective is applied after scale. Reserve the projected right/bottom edge too.
  const denominator = Math.min(
    1,
    1 + (extent * scale * Math.sin((angle * Math.PI) / 180)) / 1800,
  );
  const projectedWidth =
    (extent * scale * Math.cos((angle * Math.PI) / 180)) / denominator;
  const projectedHeight = (pose.height * scale) / denominator;
  return {
    ...pose,
    docked: false,
    scale,
    angle,
    x: clamp(pose.x, 14, Math.max(14, width - projectedWidth - 14)),
    y: clamp(
      pose.y,
      mobile ? 78 : 125,
      Math.max(mobile ? 78 : 125, height - 110 - projectedHeight),
    ),
    z: 200 + win.zIndex,
  };
}
export const centerSlots = (layout: HorizonLayout) =>
  layout === "triple" ? 3 : layout === "split" ? 2 : 1;
export function settleHorizon(
  windows: readonly WindowInstance[],
  slots: number,
  preferred?: string | null,
): readonly WindowInstance[] {
  let result = [...windows];
  for (const workspace of [1, 2, 3, 4] as WorkspaceId[]) {
    const centers = result
      .filter(
        (w) =>
          w.workspace === workspace &&
          !w.minimized &&
          (w.placement ?? "center") === "center",
      )
      .sort((a, b) =>
        a.id === preferred ? -1 : b.id === preferred ? 1 : b.zIndex - a.zIndex,
      );
    const overflow = new Set(centers.slice(slots).map((w) => w.id));
    let left = result.filter(
      (w) => w.workspace === workspace && w.placement === "left",
    ).length;
    let right = result.filter(
      (w) => w.workspace === workspace && w.placement === "right",
    ).length;
    result = result.map((w) => {
      if (!overflow.has(w.id)) return w;
      const placement = left <= right ? "left" : "right";
      placement === "left" ? left++ : right++;
      return {
        ...w,
        placement,
        placementOrder: Date.now() + left + right,
        horizonSpatial: {
          depth: 0.68,
          y: clamp(
            0.2 + ((placement === "left" ? left : right) - 1) * 0.35,
            0.08,
            0.9,
          ),
          anchor: 0.5,
        },
      };
    });
  }
  return result;
}
export function horizonPose(
  win: WindowInstance,
  windows: readonly WindowInstance[],
  width: number,
  height: number,
  workspace: WorkspaceId,
  flat = false,
): HorizonPose {
  // Fullscreen belongs to the viewport, independently of the central layout,
  // remembered depth, or an open drawer. Geometry stays untouched for restore.
  if (win.maximized)
    return {
      x: 0,
      y: 0,
      width,
      height,
      scale: 1,
      angle: 0,
      z: 20 + win.zIndex,
      hidden: win.minimized || win.workspace !== workspace,
      docked: false,
    };
  const mobile = width < 760,
    top = mobile ? 78 : 100,
    bottom = mobile ? 90 : 110;
  const availH = Math.max(180, height - top - bottom),
    side =
      width < 1100 ? Math.max(58, width * 0.09) : Math.min(235, width * 0.155);
  const stageX = mobile ? 10 : side + 24,
    stageW = mobile ? width - 20 : width - stageX * 2;
  const place = win.placement ?? "center";
  if (place === "center") {
    const centers = windows
      .filter(
        (w) =>
          w.workspace === workspace &&
          !w.minimized &&
          (w.placement ?? "center") === "center",
      )
      .sort(
        (a, b) => (a.centerOrder ?? a.zIndex) - (b.centerOrder ?? b.zIndex),
      );
    if (mobile) centers.sort((a, b) => b.zIndex - a.zIndex).splice(1);
    const index = Math.max(
        0,
        centers.findIndex((w) => w.id === win.id),
      ),
      count = Math.max(1, centers.length),
      gap = 14;
    const cellW = (stageW - gap * (count - 1)) / count;
    const w = win.maximized ? cellW : Math.min(cellW, win.width),
      h = win.maximized ? availH : Math.min(availH, win.height);
    const offset = win.horizonOffset ?? { x: 0, y: 0 };
    const quarter = win.snap.includes("top") || win.snap.includes("bottom");
    const actualH = quarter ? Math.min(h, (availH - 12) / 2) : h;
    return fitHorizonDrawer(
      {
        x:
          stageX +
          index * (cellW + gap) +
          (cellW - w) / 2 +
          Math.max(-(cellW - w) / 2, Math.min((cellW - w) / 2, offset.x)),
        y:
          (quarter
            ? win.snap.includes("bottom")
              ? top + (availH + 12) / 2
              : top
            : top + (availH - h) / 2) +
          (quarter
            ? 0
            : Math.max(
                -(availH - h) / 2,
                Math.min((availH - h) / 2, offset.y),
              )),
        width: Math.max(220, w),
        height: Math.max(160, actualH),
        scale: 1,
        angle: 0,
        z: 20 + win.zIndex,
        hidden:
          win.minimized ||
          win.workspace !== workspace ||
          (mobile && centers[0]?.id !== win.id),
      },
      win,
      width,
      height,
    );
  }
  const wing = windows
    .filter(
      (w) => w.workspace === workspace && !w.minimized && w.placement === place,
    )
    .sort(
      (a, b) => (a.placementOrder ?? a.zIndex) - (b.placementOrder ?? b.zIndex),
    );
  const index = Math.max(
    0,
    wing.findIndex((w) => w.id === win.id),
  );
  const w = Math.max(600, Math.min(win.width, 1200)),
    h = Math.max(380, Math.min(win.height, 850));
  const spatial = win.horizonSpatial ?? {
    depth: 0.68,
    y: clamp(0.2 + index * 0.35, 0.08, 0.9),
    anchor: 0.5,
  };
  const depth = clamp(spatial.depth, 0, 1),
    docked = depth >= HORIZON_DOCK_DEPTH;
  const scale = horizonDepthScale(depth);
  const pointerX =
    place === "left"
      ? width * 0.32 - depth * (width * 0.32 - 32)
      : width * 0.68 + depth * (width * 0.32 - 32);
  const wingTop = top + 65,
    wingH = Math.max(100, height - wingTop - bottom);
  const dockPeers = wing.filter(isHorizonDocked),
    dockIndex = Math.max(
      0,
      dockPeers.findIndex((w) => w.id === win.id),
    );
  const dockRows = Math.max(1, Math.floor((height - 280) / 90));
  const column = Math.floor(dockIndex / dockRows),
    row = dockIndex % dockRows;
  const dockCount = Math.min(
    dockRows,
    Math.max(1, dockPeers.length - column * dockRows),
  );
  const x = docked
    ? place === "left"
      ? 16 + column * 92
      : width - 88 - column * 92
    : clamp(
        pointerX - w * scale * clamp(spatial.anchor, 0, 1),
        14,
        Math.max(14, width - w * scale - 14),
      );
  const y = docked
    ? 150 + Math.max(0, (height - 280 - dockCount * 90) / 2) + row * 90
    : wingTop + clamp(spatial.y, 0, 1) * Math.max(0, wingH - h * scale);
  return fitHorizonDrawer(
    {
      x,
      y,
      width: w,
      height: h,
      scale,
      angle: flat ? 0 : (place === "left" ? 1 : -1) * (depth * 22),
      z: 5 + win.zIndex,
      hidden: win.minimized || win.workspace !== workspace || mobile,
      depth,
      docked,
    },
    win,
    width,
    height,
  );
}
