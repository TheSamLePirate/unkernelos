import { afterEach, describe, expect, test } from "bun:test";
import { modStore, BUILTIN_VARIANTS } from "../src/core/mod-store.ts";
import { wmStore } from "../src/wm/wm-store.ts";

afterEach(() => {
  for (const win of [...wmStore.getSnapshot().windows]) wmStore.closeWindow(win.id, false);
  modStore.resetAll();
});

describe("desktop and mod compatibility", () => {
  test("variant application and exports coordinate their base theme and shader", () => {
    const applied: unknown[] = [];
    const unbind = modStore.bindBaseAppearance({
      read: () => ({ baseOsTheme: "cyberpunk-neon", baseShader: "cyber-grid" }),
      apply: (appearance) => applied.push({ baseOsTheme: appearance.baseOsTheme, baseShader: appearance.baseShader }),
    });
    try {
      modStore.applyVariant("unkernel-default");
      expect(applied.at(-1)).toEqual({ baseOsTheme: "obsidian-aurora", baseShader: "aurora" });
      const saved = modStore.saveCurrentAsVariant("base-test", "Base test", "Test");
      expect(saved.baseOsTheme).toBe("cyberpunk-neon");
      expect(saved.baseShader).toBe("cyber-grid");
      const bundle = modStore.exportBundleJson();
      expect(modStore.importBundleJson(bundle).ok).toBe(true);
      expect(applied.at(-1)).toEqual({ baseOsTheme: "cyberpunk-neon", baseShader: "cyber-grid" });
    } finally { unbind(); }
  });
  test("Horizon is the default and each classic variant activates its compositor", () => {
    modStore.resetAll();
    expect(wmStore.getSnapshot().horizonEnabled).toBe(true);
    expect(modStore.getSnapshot().activeVariantId).toBe("horizon");
    const id = wmStore.openApp("notes");
    const original = wmStore.getSnapshot().windows.find((w) => w.id === id)!;
    for (const variant of BUILTIN_VARIANTS) {
      modStore.applyVariant(variant.id);
      expect(wmStore.getSnapshot().horizonEnabled).toBe(variant.desktopMode === "horizon");
      const current = wmStore.getSnapshot().windows.find((w) => w.id === id)!;
      expect(current.sessionId).toBe(original.sessionId);
      expect(current.contextId).toBe(original.contextId);
      expect([current.x, current.y, current.width, current.height]).toEqual([original.x, original.y, original.width, original.height]);
    }
  });
  test("themes and wallpapers stay in Horizon; classic decorations and 3D take effect", () => {
    modStore.resetAll();
    modStore.setTheme({ enabled: true, accentPrimary: "#12abcd" });
    modStore.setBackdropImage("custom", "https://example.com/wallpaper.png");
    expect(wmStore.getSnapshot().horizonEnabled).toBe(true);
    expect(modStore.getSnapshot().wallpaperMode).toBe("system");
    modStore.setActiveShaderMod("shader-event-horizon");
    expect(modStore.getSnapshot().activeBackdropImageId).toBeNull();
    modStore.setWallpaperMode("horizon");
    expect(modStore.getSnapshot().wallpaperMode).toBe("horizon");
    modStore.setDecorator({ style: "windows-95" });
    expect(wmStore.getSnapshot().horizonEnabled).toBe(false);
    wmStore.setHorizonEnabled(true);
    modStore.setDesktop3d({ enabled: true });
    expect(wmStore.getSnapshot().horizonEnabled).toBe(false);
    modStore.applyVariant("horizon");
    expect(modStore.getSnapshot().desktop3d.enabled).toBe(false);
    expect(modStore.getSnapshot().activeBackdropImageId).toBeNull();
  });
  test("custom variants and bundle roundtrips preserve the chosen desktop", () => {
    modStore.resetAll();
    modStore.setBackdropImage("custom", "https://example.com/custom-wallpaper.png");
    const variant = modStore.saveCurrentAsVariant("test-horizon", "Test Horizon", "Custom");
    expect(variant.desktopMode).toBe("horizon");
    const bundle = modStore.exportBundleJson();
    modStore.applyVariant("unkernel-default");
    expect(modStore.importBundleJson(bundle).ok).toBe(true);
    expect(wmStore.getSnapshot().horizonEnabled).toBe(true);
    expect(modStore.getSnapshot().wallpaperMode).toBe("system");
    modStore.applyVariant("unkernel-default");
    modStore.applyVariant("test-horizon");
    expect(wmStore.getSnapshot().horizonEnabled).toBe(true);
    expect(modStore.getSnapshot().wallpaperMode).toBe("system");
    expect(modStore.getSnapshot().activeBackdropImageId).toBe("custom");
    expect(modStore.getSnapshot().customBackdropImageUrl).toBe("https://example.com/custom-wallpaper.png");
  });
});
