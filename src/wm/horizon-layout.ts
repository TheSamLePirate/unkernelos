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
      return { ...w, placement, placementOrder: Date.now() + left + right };
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
    return {
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
          : Math.max(-(availH - h) / 2, Math.min((availH - h) / 2, offset.y))),
      width: Math.max(220, w),
      height: Math.max(160, actualH),
      scale: 1,
      angle: 0,
      z: 20 + win.zIndex,
      hidden:
        win.minimized ||
        win.workspace !== workspace ||
        (mobile && centers[0]?.id !== win.id),
    };
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
    ),
    count = wing.length;
  const w = Math.max(600, Math.min(win.width, 1000)),
    h = Math.max(380, Math.min(win.height, 700));
  // Cards retain their real app viewport. CSS projection only; no copied screenshot or duplicate session.
  const wingTop = top + 65,
    wingH = Math.max(100, height - wingTop - bottom);
  const compactReserve = count <= 2 && width >= 1100 && height >= 800 ? 110 : 0;
  const visibleCount = Math.max(1, Math.min(3, count));
  const scale = Math.max(
    0.03,
    Math.min(
      side / w,
      (wingH - compactReserve * visibleCount - 30 * (visibleCount - 1)) /
        visibleCount /
        h,
      0.37,
    ),
  );
  const visibleH = h * scale;
  const spacing =
    count <= 3
      ? visibleH + compactReserve + 30
      : Math.max(32, (wingH - visibleH - 20) / Math.max(1, count - 1));
  const stackH = visibleH + compactReserve + spacing * (count - 1);
  const y = wingTop + Math.max(0, (wingH - stackH) / 2) + spacing * index;
  return {
    x: place === "left" ? 16 : width - 16 - w * scale,
    y,
    width: w,
    height: h,
    scale,
    angle: flat ? 0 : place === "left" ? 13 : -13,
    z: 5 + index,
    hidden: win.minimized || win.workspace !== workspace || mobile,
  };
}
