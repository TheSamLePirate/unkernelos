import { afterEach, describe, expect, test } from "bun:test";
import { wmStore } from "../src/wm/wm-store.ts";
import { surfaceRegistry } from "../src/core/app-surface-registry.tsx";
afterEach(() => {
  for (const w of [...wmStore.getSnapshot().windows])
    wmStore.closeWindow(w.id, false);
  wmStore.setHorizonEnabled(true);
  wmStore.setHorizonLayout("focus");
});
describe("Horizon window state", () => {
  test("parking, recalling and undo never replace a session identity", () => {
    const a = wmStore.openApp("notes", undefined, true),
      b = wmStore.openApp("terminal", undefined, true);
    const session = wmStore
      .getSnapshot()
      .windows.find((w) => w.id === a)!.sessionId;
    wmStore.placeHorizonWindow(a, "right");
    wmStore.placeHorizonWindow(a, "center");
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === a)!.sessionId,
    ).toBe(session);
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === a)!.placement,
    ).toBe("center");
    wmStore.undoHorizon();
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === a)!.placement,
    ).toBe("right");
    expect(wmStore.getSnapshot().windows.some((w) => w.id === b)).toBe(true);
  });
  test("undo restores layout capacity as well as placements", () => {
    wmStore.openApp("notes");
    wmStore.openApp("terminal");
    wmStore.setHorizonLayout("split");
    expect(wmStore.getSnapshot().horizonLayout).toBe("split");
    wmStore.undoHorizon();
    expect(wmStore.getSnapshot().horizonLayout).toBe("focus");
  });
  test("maximizing a peripheral window recalls its existing session", () => {
    const a = wmStore.openApp("notes"),
      b = wmStore.openApp("terminal");
    wmStore.placeHorizonWindow(a, "left");
    wmStore.toggleMaximize(a);
    const w = wmStore.getSnapshot().windows.find((w) => w.id === a)!;
    expect(w.placement).toBe("center");
    expect(w.maximized).toBe(true);
  });
  test("invalid focus requests do not corrupt the active window", () => {
    const id = wmStore.openApp("notes");
    wmStore.focusWindow("missing");
    expect(wmStore.getSnapshot().activeWindowId).toBe(id);
  });
});
describe("session-scoped app actions", () => {
  test("read grants omit state unless it was explicitly selected", () => {
    const id = wmStore.openApp("notes");
    const w = wmStore.getSnapshot().windows.find((w) => w.id === id)!;
    const cleanup = surfaceRegistry.register(id, {
      revision: "1",
      state: { privateText: "not shared" },
    });
    const grant = surfaceRegistry.grant({
      windowId: id,
      contextId: w.contextId!,
      itemIds: [],
      actions: [],
      readState: false,
    });
    expect(surfaceRegistry.read(id, grant.id).state).toBeUndefined();
    expect(surfaceRegistry.read(id, grant.id).revision).toBe("1");
    surfaceRegistry.revoke(grant.id);
    expect(() => surfaceRegistry.read(id, grant.id)).toThrow();
    cleanup();
  });
  test("stale, unauthorized and replayed actions have distinct effects", async () => {
    const id = wmStore.openApp("notes"),
      w = wmStore.getSnapshot().windows.find((w) => w.id === id)!;
    let writes = 0;
    const cleanup = surfaceRegistry.register(id, {
      revision: "2",
      state: {},
      actions: {
        write: {
          label: "Write",
          run: async () => {
            writes++;
            return writes;
          },
        },
      },
    });
    const grant = surfaceRegistry.grant({
      windowId: id,
      contextId: w.contextId!,
      itemIds: [],
      actions: ["write"],
      readState: false,
    });
    const req = {
      windowId: id,
      grantId: grant.id,
      action: "write",
      expectedRevision: "2",
      requestId: "once",
      args: {},
    };
    await expect(
      surfaceRegistry.act({ ...req, expectedRevision: "1" }),
    ).rejects.toThrow("REVISION_CONFLICT");
    await expect(
      surfaceRegistry.act({ ...req, action: "not-granted" }),
    ).rejects.toThrow();
    const [a, b] = await Promise.all([
      surfaceRegistry.act(req),
      surfaceRegistry.act(req),
    ]);
    expect(writes).toBe(1);
    expect(a).toEqual(b);
    surfaceRegistry.revoke(grant.id);
    cleanup();
  });
});

describe("independent window drawers and spatial persistence", () => {
  test("opening or toggling one drawer never closes another", () => {
    const a = wmStore.openApp("notes"),
      b = wmStore.openApp("terminal");
    wmStore.setHorizonDrawer(a);
    wmStore.setHorizonDrawer(b);
    expect(
      wmStore.getSnapshot().windows.filter((w) => w.horizonDrawerOpen),
    ).toHaveLength(2);
    wmStore.toggleHorizonDrawer(a);
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === a)!.horizonDrawerOpen,
    ).toBe(false);
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === b)!.horizonDrawerOpen,
    ).toBe(true);
  });
  test("depth and altitude survive undo/redo and saved-layout restore", () => {
    const id = wmStore.openApp("notes"),
      spatial = { depth: 0.52, y: 0.72, anchor: 0.4 };
    wmStore.placeHorizonWindow(id, "left", undefined, spatial);
    const saved = wmStore.getSnapshot().windows;
    wmStore.placeHorizonWindow(id, "right", undefined, {
      depth: 1,
      y: 0.2,
      anchor: 0.5,
    });
    wmStore.undoHorizon();
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === id)!.horizonSpatial,
    ).toEqual(spatial);
    wmStore.undoHorizon(true);
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === id)!.horizonSpatial!
        .depth,
    ).toBe(1);
    wmStore.restoreHorizonWindows(saved);
    expect(
      wmStore.getSnapshot().windows.find((w) => w.id === id)!.horizonSpatial,
    ).toEqual(spatial);
  });
  test("docking collapses the owner's drawer and validates out-of-range coordinates", () => {
    const id = wmStore.openApp("notes");
    wmStore.setHorizonDrawer(id);
    wmStore.placeHorizonWindow(id, "right", undefined, {
      depth: 1,
      y: 9,
      anchor: -2,
    });
    const w = wmStore.getSnapshot().windows.find((w) => w.id === id)!;
    expect(w.horizonDrawerOpen).toBe(false);
    expect(w.horizonSpatial).toEqual({ depth: 1, y: 1, anchor: 0 });
  });
});
