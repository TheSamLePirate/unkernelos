import { screenToElement } from "../../core/spatial-pointer.ts";
import { Effect } from "effect";
import { Crosshair, Gamepad2, Sparkles } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { domButtonToLinux, domCodeToLinux } from "unkernel";
import {
  appRuntime,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_UNKERNEL_CONFIG,
  type FbScalingMode,
} from "../../core/schema.ts";
import { WebGpuFb0Renderer } from "../../gpu/webgpu-fb0.ts";

/**
 * Floating Desktop-integrated Guest 3D VirGL / KMS Window.
 * Renders hardware-accelerated OpenGL ES / EGL KMS scanout (e.g. kmscube, Mesa 3D)
 * directly on the WebOS Desktop with WebGPU presentation, Pointer Lock & evdev input.
 */
export const GlViewportWindow: React.FC<{ windowFocused?: boolean }> = ({
  windowFocused = true,
}) => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGpuFb0Renderer | null>(null);
  const stageRef = useRef<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null>(null);
  const heldKeysRef = useRef<Set<number>>(new Set());

  const [captured, setCaptured] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d">("canvas2d");
  const [res, setRes] = useState<{
    w: number;
    h: number;
    kind: "3d-gl" | "fb0";
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;

    const renderer = new WebGpuFb0Renderer(canvas, cfg.fbScaling);
    rendererRef.current = renderer;
    void renderer.init(cfg.webgpuFb0).then((b) => {
      if (!disposed) setBackend(b);
    });

    const tick = () => {
      if (disposed) return;
      const vm = appRuntime.runSync(
        Effect.map(VmService, (v) => v.getHandle()),
      );
      if (vm) {
        const gpu = vm.gl?.gpu;
        const scanout = gpu?.scanout;
        if (gpu && scanout && scanout.width > 0 && scanout.height > 0) {
          if (!stageRef.current) {
            const c = document.createElement("canvas");
            stageRef.current = { canvas: c, ctx: c.getContext("2d")! };
          }
          const st = stageRef.current;
          if (
            st.canvas.width !== scanout.width ||
            st.canvas.height !== scanout.height
          ) {
            st.canvas.width = scanout.width;
            st.canvas.height = scanout.height;
          }
          if (gpu.drawFrame(st.ctx) !== null) {
            renderer.presentSource(st.canvas, scanout.width, scanout.height);
            setRes((prev) =>
              prev?.kind === "3d-gl" &&
              prev.w === scanout.width &&
              prev.h === scanout.height
                ? prev
                : { w: scanout.width, h: scanout.height, kind: "3d-gl" },
            );
            raf = requestAnimationFrame(tick);
            return;
          }
        }

        const frame = vm.frame();
        if (frame && frame.data.byteLength > 0) {
          renderer.present(frame.data, frame.width, frame.height);
          setRes((prev) =>
            prev?.kind === "fb0" &&
            prev.w === frame.width &&
            prev.h === frame.height
              ? prev
              : { w: frame.width, h: frame.height, kind: "fb0" },
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [cfg.webgpuFb0]);

  useEffect(() => {
    rendererRef.current?.setScaling(cfg.fbScaling);
  }, [cfg.fbScaling]);

  useEffect(() => {
    const onLock = () => {
      const locked = document.pointerLockElement === canvasRef.current;
      setPointerLocked(locked);
      if (locked) setCaptured(true);
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, []);

  useEffect(() => {
    if (!windowFocused && captured) setCaptured(false);
  }, [windowFocused, captured]);

  useEffect(() => {
    if (!captured || !windowFocused) return;
    const releaseAll = () => {
      const vm = appRuntime.runSync(
        Effect.map(VmService, (v) => v.getHandle()),
      );
      if (vm?.evdev) {
        for (const c of heldKeysRef.current) vm.evdev.key(c, false);
      }
      heldKeysRef.current.clear();
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (down && e.key === "Escape" && e.shiftKey) {
        releaseAll();
        if (document.pointerLockElement) document.exitPointerLock();
        setCaptured(false);
        return;
      }
      const vm = appRuntime.runSync(
        Effect.map(VmService, (v) => v.getHandle()),
      );
      const code = domCodeToLinux(e.code);
      if (vm?.evdev && code) {
        e.preventDefault();
        e.stopPropagation();
        if (down) heldKeysRef.current.add(code);
        else heldKeysRef.current.delete(code);
        vm.evdev.key(code, down);
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd, { capture: true });
    window.addEventListener("keyup", ku, { capture: true });
    return () => {
      releaseAll();
      window.removeEventListener("keydown", kd, { capture: true });
      window.removeEventListener("keyup", ku, { capture: true });
    };
  }, [captured, windowFocused]);

  const setScaling = (fbScaling: FbScalingMode) => {
    appRuntime.runFork(
      Effect.flatMap(SettingsService, (s) => s.updateConfig({ fbScaling })),
    );
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-black overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1 bg-black/70 border-b border-white/10 text-[10px] font-mono shrink-0">
        <div className="flex items-center gap-2 text-zinc-300">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>
            {res
              ? `${res.kind === "3d-gl" ? "VirGL 3D" : "FB0"} · ${res.w}×${res.h}`
              : "Waiting for GL/KMS frame..."}
          </span>
          <span className="text-zinc-500">({backend})</span>
        </div>
        <div className="flex items-center gap-1.5">
          {(["crisp", "smooth", "crt"] as FbScalingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setScaling(m)}
              className={`px-1.5 py-0.5 rounded uppercase transition ${
                cfg.fbScaling === m
                  ? "bg-violet-500/35 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const c = canvasRef.current;
              if (!c) return;
              if (document.pointerLockElement === c) document.exitPointerLock();
              else c.requestPointerLock?.();
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition ${
              pointerLocked
                ? "bg-emerald-500/25 border-emerald-400/40 text-emerald-200"
                : "bg-white/6 border-white/12 text-zinc-300 hover:text-white"
            }`}
          >
            <Crosshair className="w-2.5 h-2.5" />
            {pointerLocked ? "Locked" : "3D Mouse"}
          </button>
          <span
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
              captured ? "bg-cyan-500/20 text-cyan-200" : "text-zinc-500"
            }`}
          >
            <Gamepad2 className="w-2.5 h-2.5" />
            {captured ? "Input ON (⇧Esc)" : "Click to capture"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const vm = appRuntime.runSync(
              Effect.map(VmService, (v) => v.getHandle()),
            );
            const c = canvasRef.current;
            if (!vm?.evdev || !c) return;
            if (document.pointerLockElement === c) {
              if (e.movementX || e.movementY)
                vm.evdev.move(e.movementX, e.movementY);
              return;
            }
            const r = c.getBoundingClientRect();
            const local = screenToElement(c, e.clientX, e.clientY);
            vm.evdev.moveTo(
              Math.max(0, Math.min(1, local.x / Math.max(1, c.clientWidth))),
              Math.max(0, Math.min(1, local.y / Math.max(1, c.clientHeight))),
            );
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setCaptured(true);
            const vm = appRuntime.runSync(
              Effect.map(VmService, (v) => v.getHandle()),
            );
            const btn = domButtonToLinux(e.button);
            if (vm?.evdev && btn) vm.evdev.button(btn, true);
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            const vm = appRuntime.runSync(
              Effect.map(VmService, (v) => v.getHandle()),
            );
            const btn = domButtonToLinux(e.button);
            if (vm?.evdev && btn) vm.evdev.button(btn, false);
          }}
          onWheel={(e) => {
            const vm = appRuntime.runSync(
              Effect.map(VmService, (v) => v.getHandle()),
            );
            if (vm?.evdev && e.deltaY) vm.evdev.wheel(e.deltaY < 0 ? 1 : -1);
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="w-full h-full object-contain cursor-crosshair"
        />
      </div>
    </div>
  );
};
