import { describe, test, expect } from "bun:test";
import {
  horizonPose,
  settleHorizon,
  horizonTravel,
  horizonDepthScale,
  isHorizonDocked,
} from "../src/wm/horizon-layout.ts";
import { unprojectQuad } from "../src/core/spatial-pointer.ts";
import type { WindowInstance } from "../src/wm/wm-store.ts";
function window(
  id: string,
  placement: "center" | "left" | "right" = "center",
  z = 10,
): WindowInstance {
  return {
    id,
    appId: "notes",
    title: id,
    workspace: 1,
    x: 100,
    y: 100,
    width: 900,
    height: 600,
    zIndex: z,
    minimized: false,
    maximized: false,
    snap: "none",
    placement,
  };
}
describe("Horizon layouts", () => {
  test("opening and recalling preserves existing session objects and enforces central capacity", () => {
    const a = window("a"),
      b = window("b", "center", 11),
      c = window("c", "right");
    const result = settleHorizon([a, b, c], 1, "b");
    expect(result.find((w) => w.id === "b")).toBe(b);
    expect(result.filter((w) => w.placement === "center")).toHaveLength(1);
    expect(result.find((w) => w.id === "a")?.placement).toBe("left");
    expect(result.find((w) => w.id === "c")).toBe(c);
  });
  test("split capacities do not affect other workspace sessions", () => {
    const wins = [
      window("a"),
      window("b", "center", 11),
      { ...window("other"), workspace: 2 as const },
    ];
    const settled = settleHorizon(wins, 2, "b");
    expect(settled.filter((w) => w.placement === "center")).toHaveLength(3);
  });
  test("center is flat and wing keeps a full application viewport", () => {
    const a = window("a"),
      b = window("b", "left"),
      windows = [a, b];
    const center = horizonPose(a, windows, 1512, 982, 1),
      wing = horizonPose(b, windows, 1512, 982, 1);
    expect(center.scale).toBe(1);
    expect(center.angle).toBe(0);
    expect(wing.width).toBeGreaterThanOrEqual(600);
    expect(wing.scale).toBeLessThan(1);
    expect(wing.angle).toBeGreaterThan(0);
    expect(horizonPose(b, windows, 1512, 982, 1, true).angle).toBe(0);
  });
  test("mobile surfaces remain mounted but wings are not announced as visible", () => {
    const a = window("a"),
      b = window("b", "left");
    expect(horizonPose(a, [a, b], 390, 844, 1).hidden).toBe(false);
    expect(horizonPose(b, [a, b], 390, 844, 1).hidden).toBe(true);
  });
});
describe("projected pointer precision", () => {
  test("inverts a non-affine plane, not just its screen bounding rectangle", () => {
    const project = (x: number, y: number) => {
      const denominator = 0.0003 * x + 0.0005 * y + 1;
      return {
        x: (0.8 * x + 0.1 * y + 100) / denominator,
        y: (-0.1 * x + 0.9 * y + 50) / denominator,
      };
    };
    const quad = [
      project(0, 0),
      project(800, 0),
      project(800, 600),
      project(0, 600),
    ];
    for (const p of [
      { x: 0, y: 0 },
      { x: 400, y: 300 },
      { x: 799, y: 599 },
      { x: 133, y: 510 },
    ]) {
      const local = unprojectQuad(project(p.x, p.y), quad, 800, 600);
      expect(local.x).toBeCloseTo(p.x, 6);
      expect(local.y).toBeCloseTo(p.y, 6);
    }
  });
});

test("side cards leave the workspace heading and dock clear", () => {
  for (const [width, height] of [
    [1512, 982],
    [1280, 800],
    [1100, 650],
  ]) {
    const a = window("a", "left"),
      b = window("b", "left");
    for (const w of [a, b]) {
      const p = horizonPose(w, [a, b], width!, height!, 1);
      expect(p.y - 30).toBeGreaterThanOrEqual(130);
      expect(p.y + p.height * p.scale).toBeLessThanOrEqual(height! - 100);
    }
  }
});

describe("continuous spatial travel and docking", () => {
  test("depth follows position continuously and shrinks strictly toward the edge", () => {
    let previous = 1;
    for (let i = 1; i <= 100; i++) {
      const x = 1512 * 0.32 - ((1512 * 0.32 - 32) * i) / 100;
      const t = horizonTravel(x, 1512),
        scale = horizonDepthScale(t.depth);
      expect(t.depth).toBeCloseTo(i / 100, 8);
      expect(scale).toBeLessThan(previous);
      expect(horizonTravel(1512 - x, 1512).depth).toBeCloseTo(t.depth, 8);
      previous = scale;
    }
    expect(horizonTravel(756, 1512).placement).toBe("center");
    expect(horizonTravel(85, 1512).docked).toBe(false);
    expect(horizonTravel(24, 1512).docked).toBe(true);
  });
  test("different released depths retain distinct projected sizes and vertical positions", () => {
    const a = {
        ...window("near", "left"),
        horizonSpatial: { depth: 0.3, y: 0.1, anchor: 0.5 },
      },
      b = {
        ...window("far", "left"),
        horizonSpatial: { depth: 0.8, y: 0.8, anchor: 0.5 },
      };
    const near = horizonPose(a, [a, b], 1512, 982, 1),
      far = horizonPose(b, [a, b], 1512, 982, 1);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(far.y).toBeGreaterThan(near.y);
    expect(isHorizonDocked(b)).toBe(false);
    const boundary = {
      ...a,
      horizonSpatial: { ...a.horizonSpatial, depth: 0 },
    };
    expect(horizonPose(boundary, [boundary, b], 1512, 982, 1).angle).toBe(0);
  });
  test("attached drawer and owner fit in the viewport without changing logical app size", () => {
    const w = {
      ...window("open", "right"),
      horizonDrawerOpen: true,
      horizonSpatial: { depth: 1, y: 0.8, anchor: 0.5 },
    };
    const pose = horizonPose(w, [w], 1512, 982, 1);
    expect(pose.width).toBe(900);
    expect(pose.x + (pose.width + 340) * pose.scale).toBeLessThanOrEqual(1498);
    expect(pose.y + pose.height * pose.scale).toBeLessThanOrEqual(872);
    expect(pose.docked).toBe(false);
    expect(isHorizonDocked(w)).toBe(true);
  });
  test("many docked sessions fill additional columns with distinct reachable tiles", () => {
    const windows = Array.from({ length: 16 }, (_, i) => ({
      ...window("dock" + i, "left", i),
      horizonSpatial: { depth: 1, y: 0.5, anchor: 0.5 },
    }));
    const poses = windows.map((w) => horizonPose(w, windows, 1512, 982, 1));
    expect(new Set(poses.map((p) => p.x + ":" + p.y)).size).toBe(16);
    for (const pose of poses) {
      expect(pose.x).toBeGreaterThanOrEqual(16);
      expect(pose.y + 72).toBeLessThan(882);
    }
  });
});
