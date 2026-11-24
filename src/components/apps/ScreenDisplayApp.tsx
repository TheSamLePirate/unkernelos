import { Effect } from "effect";
import {
  AppWindow,
  Box,
  Cpu,
  ExternalLink,
  Gamepad2,
  Layers,
  Monitor,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { domButtonToLinux, domCodeToLinux } from "unkernel";
import { appRuntime, SettingsService, useSubscriptionRef, VmService } from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG, type FbScalingMode } from "../../core/schema.ts";
import { useWaylandDesktop, waylandDesktopManager } from "../../core/wayland-host.ts";
import { WebGpuFb0Renderer } from "../../gpu/webgpu-fb0.ts";
import { wmStore } from "../../wm/wm-store.ts";

type ScreenTab = "fb0" | "wayland" | "gl";

export const ScreenDisplayApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const vmState = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "",
      bootProgress: 0,
      error: null,
      support: null,
      crossOriginIsolated: false,
      webgpuAvailable: false,
      distro: "debian",
      cpus: 1,
      memoryMiB: 2048,
      transport: "inline",
      stats: null,
      glStatus: null,
      displayMode: null,
      inputState: { keyboard: false, mouse: false, tablet: false },
      detectedPorts: [],
      kernelLogs: [],
      hasSnapshot: false,
      audioMuted: false,
      wispActiveUrl: "",
    }
  );

  const wlDesktop = useWaylandDesktop();
  const [tab, setTab] = useState<ScreenTab>("fb0");
  const [fbBackend, setFbBackend] = useState<"webgpu" | "canvas2d">("canvas2d");
  const [glInfoText, setGlInfoText] = useState<string>("");
  const [captured, setCaptured] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [scanoutActive, setScanoutActive] = useState<{ width: number; height: number; kind: "fb0" | "3d-gl" } | null>(null);

  const fbCanvasRef = useRef<HTMLCanvasElement>(null);
  const fbRendererRef = useRef<WebGpuFb0Renderer | null>(null);
  const heldKeysRef = useRef<Set<number>>(new Set());
  const glStageRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null>(null);

  // WebGPU /dev/fb0 + 3D VirGL KMS scanout presentation loop
  useEffect(() => {
    const canvas = fbCanvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let raf = 0;
    const renderer = new WebGpuFb0Renderer(canvas, cfg.fbScaling);
    fbRendererRef.current = renderer;

    void renderer.init(cfg.webgpuFb0).then((b) => {
      if (!disposed) setFbBackend(b);
    });

    const loop = () => {
      if (disposed) return;
      const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
      if (vm) {
        // 1. Check for hardware 3D VirGL KMS scanout first (e.g. kmscube, Mesa EGL/GBM)
        const gpu = vm.gl?.gpu;
        const scanout = gpu?.scanout;
        if (gpu && scanout && scanout.width > 0 && scanout.height > 0) {
          if (!glStageRef.current) {
            const c = document.createElement("canvas");
            const ctx = c.getContext("2d")!;
            glStageRef.current = { canvas: c, ctx };
          }
          const st = glStageRef.current;
          if (st.canvas.width !== scanout.width || st.canvas.height !== scanout.height) {
            st.canvas.width = scanout.width;
            st.canvas.height = scanout.height;
          }
          const drew = gpu.drawFrame(st.ctx);
          if (drew !== null) {
            renderer.presentSource(st.canvas, scanout.width, scanout.height);
            setScanoutActive((prev) =>
              prev?.kind === "3d-gl" && prev.width === scanout.width && prev.height === scanout.height
                ? prev
                : { width: scanout.width, height: scanout.height, kind: "3d-gl" }
            );
            raf = requestAnimationFrame(loop);
            return;
          }
        }

        // 2. Otherwise present /dev/fb0 or 2D KMS dumb-buffer frame
        const frame = vm.frame();
        if (frame && frame.data.byteLength > 0) {
          renderer.present(frame.data, frame.width, frame.height);
          setScanoutActive((prev) =>
            prev?.kind === "fb0" && prev.width === frame.width && prev.height === frame.height
              ? prev
              : { width: frame.width, height: frame.height, kind: "fb0" }
          );
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      fbRendererRef.current = null;
    };
  }, [cfg.webgpuFb0]);

  useEffect(() => {
    fbRendererRef.current?.setScaling(cfg.fbScaling);
  }, [cfg.fbScaling]);

  // Track pointer lock changes for relative 3D/game mouse input
  useEffect(() => {
    const onLockChange = () => {
      const locked = document.pointerLockElement === fbCanvasRef.current;
      setPointerLocked(locked);
      if (locked) setCaptured(true);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  // Release evdev keyboard capture automatically when another OS window takes focus
  useEffect(() => {
    if (!windowFocused && captured) {
      setCaptured(false);
    }
  }, [windowFocused, captured]);

  // Complete evdev keyboard capture (all special keys, modifiers, F1-F12, arrows, Tab, Esc + release-all on blur)
  useEffect(() => {
    if (!captured || !windowFocused) return;

    const releaseAll = () => {
      const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
      if (vm?.evdev) {
        for (const code of heldKeysRef.current) {
          vm.evdev.key(code, false);
        }
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
      const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
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
    const onBlur = () => {
      releaseAll();
      setCaptured(false);
    };

    window.addEventListener("keydown", kd, { capture: true });
    window.addEventListener("keyup", ku, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      releaseAll();
      window.removeEventListener("keydown", kd, { capture: true });
      window.removeEventListener("keyup", ku, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [captured, windowFocused]);

  const handleFbPointer = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    const canvas = fbCanvasRef.current;
    if (!vm?.evdev || !canvas) return;
    if (document.pointerLockElement === canvas) {
      if (e.movementX !== 0 || e.movementY !== 0) {
        vm.evdev.move(e.movementX, e.movementY);
      }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    vm.evdev.moveTo(nx, ny);
  };

  const handleFbButton = (down: boolean) => (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setCaptured(true);
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    const btn = domButtonToLinux(e.button);
    if (vm?.evdev && btn) vm.evdev.button(btn, down);
  };

  const togglePointerLock = () => {
    const canvas = fbCanvasRef.current;
    if (!canvas) return;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    } else {
      canvas.requestPointerLock?.();
    }
  };

  const runDemo = (cmd: string, label: string) => {
    wmStore.pushToast("Launching Graphical App", `Running ${label} in guest...`, "info");
    appRuntime.runFork(
      Effect.gen(function* () {
        const vm = yield* VmService;
        yield* vm.execShell(`${cmd} >/tmp/gfx-demo.log 2>&1 &`).pipe(Effect.ignore);
      })
    );
  };

  const probeEgl = async () => {
    setGlInfoText("Probing VirGL / OpenGL ES renderer...");
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const vm = yield* VmService;
          const handle = vm.getHandle();
          if (handle?.gl) {
            yield* Effect.promise(() => handle.gl!.load().catch(() => {}));
          }
          return yield* vm.execShell("eglinfo -B -p gbm 2>&1 || eglinfo -B -p surfaceless 2>&1 || echo 'Install Mesa VirGL via Toolchain Installer first.'");
        })
      )
    );
    if (res._tag === "Right") setGlInfoText(res.right.stdout || res.right.stderr);
    else setGlInfoText(String(res.left));
  };

  const setScaling = (fbScaling: FbScalingMode) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig({ fbScaling })));
  };

  const toggleAudio = () => {
    appRuntime.runFork(Effect.flatMap(VmService, (v) => v.toggleMute()));
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#080a10]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => setTab("fb0")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              tab === "fb0" ? "bg-pink-500/25 text-pink-200 border border-pink-400/30" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            /dev/fb0 (WebGPU)
          </button>
          <button
            type="button"
            onClick={() => setTab("gl")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              tab === "gl" ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/30" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Guest GL (/dev/dri)
          </button>
          <button
            type="button"
            onClick={() => setTab("wayland")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              tab === "wayland" ? "bg-violet-500/25 text-violet-200 border border-violet-400/30" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Wayland (wland)
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {tab === "fb0" && (
            <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 text-[11px]">
              {(["crisp", "smooth", "crt"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScaling(m)}
                  className={`px-2 py-0.5 rounded capitalize transition ${
                    cfg.fbScaling === m ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => runDemo("glimmer", "Glimmer (FB0 + ALSA)")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200 transition"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-pink-400" />
            Launch Glimmer
          </button>

          {cfg.distro === "debian" && (
            <button
              type="button"
              onClick={() => {
                wmStore.openApp("gl-window");
                runDemo("kmscube", "kmscube (3D VirGL Desktop Window)");
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-200 transition"
            >
              <Play className="w-3 h-3" />
              kmscube 3D
            </button>
          )}

          <button
            type="button"
            onClick={() => wmStore.openApp("gl-window")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-violet-500/15 hover:bg-violet-500/25 border border-violet-400/30 text-violet-200 transition"
            title="Pop out floating Desktop 3D GL / KMS window"
          >
            <Box className="w-3.5 h-3.5" />
            Pop Out 3D GL
          </button>

          <button
            type="button"
            onClick={toggleAudio}
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
            title={vmState.audioMuted ? "Unmute ALSA Sound" : "Mute ALSA Sound"}
          >
            {vmState.audioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Tab 1: /dev/fb0 WebGPU Display */}
      <div className={`relative flex-1 min-h-0 flex items-center justify-center bg-black ${tab === "fb0" ? "" : "hidden"}`}>
        <canvas
          ref={fbCanvasRef}
          onMouseMove={handleFbPointer}
          onMouseDown={handleFbButton(true)}
          onMouseUp={handleFbButton(false)}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={togglePointerLock}
          onWheel={(e) => {
            e.preventDefault();
            const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
            vm?.evdev?.wheel(e.deltaY > 0 ? -1 : 1);
          }}
          className="max-w-full max-h-full object-contain cursor-crosshair"
        />

        {!vmState.displayMode && !scanoutActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm text-center p-6 space-y-3 pointer-events-none">
            <Monitor className="w-10 h-10 text-pink-400/80" />
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-medium text-zinc-200">/dev/fb0 &amp; /dev/dri/card0 Standby</p>
              <p className="text-xs text-zinc-400">
                Launch <code className="text-pink-300">glimmer</code>, <code className="text-cyan-300">kmscube</code>, SDL2, or any framebuffer / KMS graphics program in Linux. Frames present automatically via <strong className="text-violet-300">{fbBackend.toUpperCase()}</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-zinc-300">
              {scanoutActive
                ? `${scanoutActive.width}×${scanoutActive.height} (${scanoutActive.kind === "3d-gl" ? "3D VirGL" : "/dev/fb0"})`
                : vmState.displayMode
                ? `${vmState.displayMode.width}×${vmState.displayMode.height}`
                : `${cfg.displayWidth}×${cfg.displayHeight} (idle)`}
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200">
              <Sparkles className="w-3 h-3" />
              Presenter: {fbBackend.toUpperCase()}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-zinc-400">
            {pointerLocked
              ? "Pointer Locked + Keyboard Captured (Esc / Shift+Esc)"
              : captured
              ? "evdev Captured (Shift+Esc release · Dbl-click Pointer Lock)"
              : "Click canvas for evdev keys/mouse · Dbl-click Pointer Lock"}
          </span>
        </div>
      </div>

      {/* Tab 2: Guest GL (/dev/dri VirGL WebGL2) */}
      <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${tab === "gl" ? "" : "hidden"}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">VirGL Hardware 3D Pipeline</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Guest OpenGL ES 3.0 / GL 2.1 runs via stock Mesa <code className="text-zinc-200">virtio_gpu</code> (<code className="text-zinc-200">/dev/dri/renderD128</code>) into <code className="text-zinc-200">virgl.wasm</code> backed by browser <strong>WebGL2</strong>.
            </p>
            <div className="pt-2 space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Status</span>
                <span className="text-emerald-300">{vmState.glStatus?.state ?? (cfg.distro === "debian" ? "disabled" : "requires Debian")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Renderer</span>
                <span className="text-zinc-200 truncate max-w-[240px]">{vmState.glStatus?.what ?? "Loads on first GL call"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">WebGL2 GPU</span>
                <span className="text-zinc-300 truncate max-w-[240px]">{vmState.glStatus?.webgl ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-300">Diagnostics &amp; Demos</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={probeEgl}
                className="px-3 py-1.5 rounded-lg text-xs bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 text-cyan-200 transition"
              >
                Run eglinfo -B
              </button>
              <button
                type="button"
                onClick={() => wmStore.openApp("toolchain")}
                className="px-3 py-1.5 rounded-lg text-xs bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-200 transition"
              >
                Install Mesa &amp; kmscube
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Note: Guest GL uses WebGL2 inside <code>virglrenderer</code> (required by OpenGL/Gallium semantics), while host FB0 &amp; Terminal compositing run on WebGPU.
            </p>
          </div>
        </div>

        {glInfoText && (
          <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-xs font-mono text-cyan-200 overflow-x-auto whitespace-pre-wrap">
            {glInfoText}
          </pre>
        )}
      </div>

      {/* Tab 3: Desktop-Integrated Wayland Compositor (wland) */}
      <div className={`relative flex-1 min-h-0 flex flex-col overflow-y-auto p-5 space-y-4 ${tab === "wayland" ? "" : "hidden"}`}>
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Layers className="w-4 h-4 text-violet-400" />
              Desktop-Integrated Wayland Compositor (wland)
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                  wlDesktop.ready
                    ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                    : "bg-amber-500/15 border-amber-400/30 text-amber-300"
                }`}
              >
                {cfg.distro !== "debian"
                  ? "Requires Debian"
                  : wlDesktop.ready
                  ? "ACTIVE (/dev/kwshm + vsock:1023)"
                  : "STANDBY"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Native Linux Wayland apps now open directly as first-class floating <strong>unkernelOS Desktop windows</strong> with full resize, snap, workspaces &amp; VirGL dmabuf support.
            </p>
          </div>
          {cfg.distro === "debian" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runDemo("wland foot", "foot (Native Wayland Desktop Window)")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 text-xs font-medium transition"
              >
                <AppWindow className="w-3.5 h-3.5" />
                Launch foot (Desktop)
              </button>
              <button
                type="button"
                onClick={() => runDemo("wland galculator", "Galculator (GTK Wayland Window)")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-200 text-xs font-medium transition"
              >
                <AppWindow className="w-3.5 h-3.5" />
                Launch Galculator
              </button>
              <button
                type="button"
                onClick={() => {
                  wmStore.openApp("gl-window");
                  runDemo("kmscube", "kmscube (3D VirGL Desktop Window)");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 text-cyan-200 text-xs font-medium transition"
              >
                <Box className="w-3.5 h-3.5" />
                Launch kmscube (3D GL)
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Active Desktop Wayland Surfaces ({wlDesktop.windows.length})
          </div>
          {wlDesktop.windows.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-2">
              <AppWindow className="w-8 h-8 text-violet-400/60 mx-auto" />
              <p className="text-xs text-zinc-300">No Linux Wayland windows running yet.</p>
              <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                Click <strong>Launch foot</strong> above or run <code className="text-violet-300">wland &lt;app&gt;</code> in any Kitty Terminal — it will immediately appear as a native floating window on your desktop.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {wlDesktop.windows.map((w) => (
                <div
                  key={w.key}
                  className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">{w.title}</div>
                    <div className="text-[10px] font-mono text-zinc-400 truncate">
                      {w.appId || "wayland"} · surface #{w.surface}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => wmStore.openWaylandWindow(w.key, w.title, w.appId)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 text-[11px]"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => waylandDesktopManager.closeWindow(w.key)}
                      className="p-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"
                      title="Close Wayland Window"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
