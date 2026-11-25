import React, { useEffect, useRef } from "react";
import {
  REACTIVE_HELPERS,
  reactiveEngine,
  useReactiveMod,
  type ReactiveSurface,
  type SurfaceSlot,
} from "../core/reactive-mod-engine.ts";
import { spatial3dBridge } from "../gpu/spatial-3d-bridge.ts";

/** Renders a live 60fps Canvas 2D surface scripted by a Reactive Mod */
const ReactiveCanvasSurface: React.FC<{ surface: ReactiveSurface }> = ({ surface }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !surface.canvasScript) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type CanvasDrawFn = (
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      t: number,
      signals: ReturnType<typeof reactiveEngine.getSnapshot>["signals"],
      os: ReturnType<typeof reactiveEngine.createOsContext>,
      helpers: typeof REACTIVE_HELPERS,
      sig: (k: string, d?: number) => number
    ) => void;
    let compiled: CanvasDrawFn | null = null;

    try {
      compiled = new Function(
        "ctx",
        "canvas",
        "t",
        "signals",
        "os",
        "helpers",
        "sig",
        `const { clamp, lerp, mapRange, smoothstep, lerpColor, hsl } = helpers;\n${surface.canvasScript}`
      ) as unknown as CanvasDrawFn;
    } catch (err) {
      console.warn(`[ReactiveSurface:${surface.id}] Canvas compile error:`, err);
      return;
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor((rect.width || surface.width || window.innerWidth) * dpr));
      const h = Math.max(1, Math.floor((rect.height || surface.height || window.innerHeight) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const osCtx = reactiveEngine.createOsContext();
    const sigFn = (k: string, d = 0) => reactiveEngine.getSignalNumeric(k, d);
    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !compiled) return;
      try {
        compiled(
          ctx,
          canvas,
          (now - t0) / 1000,
          reactiveEngine.getSnapshot().signals,
          osCtx,
          REACTIVE_HELPERS,
          sigFn
        );
      } catch {
        // swallow per-frame user script error so OS never crashes
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [surface.id, surface.canvasScript, surface.width, surface.height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: surface.slot === "wallpaper" ? "100%" : surface.width ? `${surface.width}px` : "100%",
        height: surface.slot === "wallpaper" ? "100%" : surface.height ? `${surface.height}px` : "100%",
      }}
      className="block"
    />
  );
};

/** Renders a live HTML surface (supports {{signal.key}} interpolation + unrestricted DOM script) */
const ReactiveHtmlSurface: React.FC<{ surface: ReactiveSurface }> = ({ surface }) => {
  const reactive = useReactiveMod();
  const rootRef = useRef<HTMLDivElement>(null);
  const interpolated = surface.html ? reactiveEngine.interpolateTemplate(surface.html) : "";

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !surface.script) return;
    try {
      const fn = new Function(
        "root",
        "signals",
        "os",
        "helpers",
        "sig",
        `const { clamp, lerp, mapRange, smoothstep, lerpColor, hsl } = helpers;\n${surface.script}`
      );
      fn(
        root,
        reactive.signals,
        reactiveEngine.createOsContext(),
        REACTIVE_HELPERS,
        (k: string, d = 0) => reactiveEngine.getSignalNumeric(k, d)
      );
    } catch (err) {
      console.warn(`[ReactiveSurface:${surface.id}] HTML script error:`, err);
    }
  }, [surface.id, surface.script, reactive.signals]);

  return (
    <div
      ref={rootRef}
      style={{
        width: surface.width && surface.slot !== "topbar" && surface.slot !== "titlebar" ? `${surface.width}px` : undefined,
        height: surface.height && surface.slot !== "topbar" && surface.slot !== "titlebar" ? `${surface.height}px` : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: interpolated }}
    />
  );
};

/** Renders a live Iframe surface (external URL or srcDoc) with real-time signals bridged via postMessage */
const ReactiveIframeSurface: React.FC<{ surface: ReactiveSurface }> = ({ surface }) => {
  const reactive = useReactiveMod();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        source: "unkernelos-reactive-signals",
        signals: reactive.signals,
      },
      "*"
    );
  }, [reactive.signals]);

  return (
    <iframe
      ref={iframeRef}
      title={surface.name}
      src={surface.iframeUrl?.trim() ? surface.iframeUrl.trim() : undefined}
      srcDoc={!surface.iframeUrl?.trim() ? surface.html ?? "" : undefined}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      onLoad={() => {
        iframeRef.current?.contentWindow?.postMessage(
          {
            source: "unkernelos-reactive-signals",
            signals: reactiveEngine.getSnapshot().signals,
          },
          "*"
        );
      }}
      style={{
        width: surface.slot === "wallpaper" ? "100%" : surface.width ? `${surface.width}px` : "320px",
        height: surface.slot === "wallpaper" ? "100%" : surface.height ? `${surface.height}px` : "180px",
      }}
      className="border-0 bg-transparent block rounded-2xl overflow-hidden"
    />
  );
};

const SurfaceBody: React.FC<{ surface: ReactiveSurface }> = ({ surface }) => {
  if (surface.contentType === "canvas") return <ReactiveCanvasSurface surface={surface} />;
  if (surface.contentType === "iframe") return <ReactiveIframeSurface surface={surface} />;
  return <ReactiveHtmlSurface surface={surface} />;
};

/**
 * Mounts all enabled Reactive Mod Surfaces targeting a specific OS slot:
 * - "wallpaper" (full-screen behind windows)
 * - "desktop" (positioned on desktop layer)
 * - "overlay" (floating HUD above windows)
 * - "topbar" (inline inside OS TopBar)
 * - "dock" (inline inside OS Dock)
 * - "titlebar" (inline inside focused window titlebar)
 */
export const ReactiveSurfaceSlot: React.FC<{ slot: Exclude<SurfaceSlot, "3d-panel"> }> = ({ slot }) => {
  const reactive = useReactiveMod();
  if (!reactive.engineEnabled) return null;

  const items = reactive.surfaces.filter((s) => s.enabled && s.slot === slot);
  if (items.length === 0) return null;

  if (slot === "wallpaper") {
    return (
      <>
        {items.map((s) => (
          <div
            key={s.id}
            style={{ zIndex: s.zIndex ?? 1 }}
            className={`fixed inset-0 overflow-hidden ${
              s.pointerEvents === "auto" ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <SurfaceBody surface={s} />
          </div>
        ))}
      </>
    );
  }

  if (slot === "desktop" || slot === "overlay") {
    const baseZ = slot === "overlay" ? 72 : 6;
    return (
      <>
        {items.map((s) => (
          <div
            key={s.id}
            style={{
              left: s.x !== undefined ? `${s.x}px` : undefined,
              top: s.y !== undefined ? `${s.y}px` : undefined,
              zIndex: s.zIndex ?? baseZ,
            }}
            className={`fixed hidden sm:block ${
              s.pointerEvents === "auto" ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <SurfaceBody surface={s} />
          </div>
        ))}
      </>
    );
  }

  // Inline slots: topbar, dock, titlebar
  return (
    <>
      {items.map((s) => (
        <div
          key={s.id}
          className={`flex items-center shrink-0 ${
            s.pointerEvents === "none" ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          <SurfaceBody surface={s} />
        </div>
      ))}
    </>
  );
};

/**
 * Mounts all enabled Reactive Mod 3D Panels inside the exact Three.js CSS3D camera stage!
 */
export const Reactive3dPanels: React.FC<{ doubleSided?: boolean }> = ({ doubleSided = true }) => {
  const reactive = useReactiveMod();
  if (!reactive.engineEnabled) return null;
  const panels = reactive.surfaces.filter((s) => s.enabled && s.slot === "3d-panel");
  if (panels.length === 0) return null;

  return (
    <>
      {panels.map((s) => (
        <div
          key={s.id}
          ref={(el) => {
            spatial3dBridge.registerPanel3dEl(s.id, el, {
              x: s.pose3d?.x ?? -1050,
              y: s.pose3d?.y ?? 160,
              z: s.pose3d?.z ?? 150,
              rx: s.pose3d?.rx ?? 0,
              ry: s.pose3d?.ry ?? 0.35,
              rz: s.pose3d?.rz ?? 0,
            });
          }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${s.width ?? 340}px`,
            height: `${s.height ?? 220}px`,
            backfaceVisibility: doubleSided ? "visible" : "hidden",
            WebkitBackfaceVisibility: doubleSided ? "visible" : "hidden",
          }}
          className={s.pointerEvents === "none" ? "pointer-events-none" : "pointer-events-auto"}
        >
          <SurfaceBody surface={s} />
        </div>
      ))}
    </>
  );
};
