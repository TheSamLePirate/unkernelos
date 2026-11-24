import { Effect } from "effect";
import {
  Cpu,
  Gamepad2,
  Layers,
  Monitor,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { domButtonToLinux, domCodeToLinux } from "unkernel";
import { appRuntime, SettingsService, useSubscriptionRef, VmService } from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG, type FbScalingMode } from "../../core/schema.ts";
import { WaylandDesktopHost } from "../../core/wayland-host.ts";
import { WebGpuFb0Renderer } from "../../gpu/webgpu-fb0.ts";
import { wmStore } from "../../wm/wm-store.ts";

type ScreenTab = "fb0" | "wayland" | "gl";

export const ScreenDisplayApp: React.FC = () => {
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

  const [tab, setTab] = useState<ScreenTab>("fb0");
  const [fbBackend, setFbBackend] = useState<"webgpu" | "canvas2d">("canvas2d");
  const [glInfoText, setGlInfoText] = useState<string>("");
  const [waylandReady, setWaylandReady] = useState(false);
  const [captured, setCaptured] = useState(false);

  const fbCanvasRef = useRef<HTMLCanvasElement>(null);
  const fbRendererRef = useRef<WebGpuFb0Renderer | null>(null);
  const waylandContainerRef = useRef<HTMLDivElement>(null);
  const waylandHostRef = useRef<WaylandDesktopHost | null>(null);

  // WebGPU /dev/fb0 presentation loop
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
        const frame = vm.frame();
        if (frame && frame.data.byteLength > 0) {
          renderer.present(frame.data, frame.width, frame.height);
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

  // Attach Wayland compositor (wland) when Debian + Wayland enabled
  useEffect(() => {
    const container = waylandContainerRef.current;
    if (!container || vmState.phase !== "running" || !cfg.wayland || cfg.distro !== "debian") return;

    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    if (!vm) return;

    const host = new WaylandDesktopHost();
    waylandHostRef.current = host;
    void host.attach(vm, container).then((ok) => setWaylandReady(ok));

    return () => {
      host.dispose();
      waylandHostRef.current = null;
      setWaylandReady(false);
    };
  }, [vmState.phase, cfg.wayland, cfg.distro]);

  // Evdev keyboard/mouse forwarding to /dev/input/event*
  useEffect(() => {
    if (!captured) return;
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) {
        setCaptured(false);
        return;
      }
      const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
      const code = domCodeToLinux(e.code);
      if (vm?.evdev && code) {
        e.preventDefault();
        vm.evdev.key(code, down);
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [captured]);

  const handleFbPointer = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    const canvas = fbCanvasRef.current;
    if (!vm?.evdev || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    vm.evdev.moveTo(nx, ny);
  };

  const handleFbButton = (down: boolean) => (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCaptured(true);
    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    const btn = domButtonToLinux(e.button);
    if (vm?.evdev && btn) vm.evdev.button(btn, down);
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
                setTab("fb0");
                runDemo("kmscube", "kmscube (3D VirGL)");
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-200 transition"
            >
              <Play className="w-3 h-3" />
              kmscube 3D
            </button>
          )}

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
          onWheel={(e) => {
            const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
            vm?.evdev?.wheel(e.deltaY > 0 ? -1 : 1);
          }}
          className="max-w-full max-h-full object-contain cursor-crosshair"
        />

        {!vmState.displayMode && (
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
              {vmState.displayMode
                ? `${vmState.displayMode.width}×${vmState.displayMode.height}`
                : `${cfg.displayWidth}×${cfg.displayHeight} (idle)`}
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200">
              <Sparkles className="w-3 h-3" />
              Presenter: {fbBackend.toUpperCase()}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-zinc-400">
            {captured ? "Input Captured (Shift+Esc to release)" : "Click canvas to send evdev keys"}
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

      {/* Tab 3: Wayland Compositor (wland) */}
      <div className={`relative flex-1 min-h-0 flex flex-col ${tab === "wayland" ? "" : "hidden"}`}>
        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/8 text-xs">
          <span className="text-zinc-400">
            wland compositor:{" "}
            <strong className={waylandReady ? "text-emerald-300" : "text-amber-300"}>
              {cfg.distro !== "debian"
                ? "Requires Debian"
                : waylandReady
                ? "Connected (/dev/kwshm + vsock:1023)"
                : "Standby"}
            </strong>
          </span>
          {cfg.distro === "debian" && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => runDemo("wland foot", "foot (Wayland)")}
                className="px-2.5 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 text-violet-200 text-[11px]"
              >
                wland foot
              </button>
              <button
                type="button"
                onClick={() => runDemo("wland galculator", "Galculator (GTK Wayland)")}
                className="px-2.5 py-0.5 rounded bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200 text-[11px]"
              >
                wland galculator
              </button>
            </div>
          )}
        </div>
        <div ref={waylandContainerRef} className="relative flex-1 min-h-0 bg-[#07090f] overflow-hidden" />
      </div>
    </div>
  );
};
