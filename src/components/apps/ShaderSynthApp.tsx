import {
  useAppSurface,
  useSurfaceRevision,
} from "../../core/app-surface-registry.tsx";
import {
  AudioWaveform,
  MonitorPlay,
  Play,
  Sliders,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { wmStore } from "../../wm/wm-store.ts";

interface ShaderPreset {
  readonly id: string;
  readonly name: string;
  readonly wgslBody: string;
}

const SHADER_PRESETS: readonly ShaderPreset[] = [
  {
    id: "nebula",
    name: "Plasma Nebula",
    wgslBody: `fn shade(uv: vec2<f32>, t: f32, mouse: vec2<f32>) -> vec3<f32> {
  var p = (uv - 0.5) * 3.0;
  p += (mouse - 0.5) * 0.8;
  var acc = 0.0;
  for (var i = 1; i < 6; i++) {
    let fi = f32(i);
    p.x += 0.35 / fi * sin(fi * p.y + t * 0.9 + fi);
    p.y += 0.35 / fi * cos(fi * p.x - t * 0.8 + fi * 1.4);
    acc += sin(p.x + p.y);
  }
  let r = 0.5 + 0.5 * sin(acc * 0.6 + t + 0.0);
  let g = 0.5 + 0.5 * sin(acc * 0.6 + t + 2.1);
  let b = 0.5 + 0.5 * sin(acc * 0.6 + t + 4.2);
  return vec3<f32>(r * 0.85, g * 0.65, b * 1.05);
}`,
  },
  {
    id: "rings",
    name: "Neon Tunnel",
    wgslBody: `fn shade(uv: vec2<f32>, t: f32, mouse: vec2<f32>) -> vec3<f32> {
  let p = (uv - mouse) * 2.4;
  let r = length(p);
  let a = atan2(p.y, p.x);
  let ring = sin(12.0 / max(r, 0.06) - t * 4.0);
  let spokes = sin(a * 8.0 + t * 1.5);
  let glow = exp(-r * 1.6);
  var col = vec3<f32>(0.05, 0.04, 0.12);
  col += vec3<f32>(0.95, 0.18, 0.58) * smoothstep(0.2, 0.95, ring) * 0.65;
  col += vec3<f32>(0.10, 0.85, 0.98) * smoothstep(0.3, 0.95, spokes * ring) * 0.55;
  col += vec3<f32>(0.6, 0.4, 1.0) * glow * 0.6;
  return col;
}`,
  },
  {
    id: "mandel",
    name: "Mandelbrot Zoom",
    wgslBody: `fn shade(uv: vec2<f32>, t: f32, mouse: vec2<f32>) -> vec3<f32> {
  let zoom = pow(1.4, 1.0 + 3.0 * (0.5 + 0.5 * sin(t * 0.35)));
  let center = vec2<f32>(-0.745, 0.186) + (mouse - 0.5) * 0.08;
  let c = center + (uv - 0.5) * (2.6 / zoom);
  var z = vec2<f32>(0.0, 0.0);
  var iter = 0.0;
  for (var i = 0; i < 64; i++) {
    if (dot(z, z) > 4.0) { break; }
    z = vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    iter += 1.0;
  }
  let v = iter / 64.0;
  if (iter >= 63.5) { return vec3<f32>(0.02, 0.02, 0.05); }
  return 0.5 + 0.5 * cos(6.2831 * (v * 2.5 + vec3<f32>(0.0, 0.33, 0.67) + t * 0.1));
}`,
  },
  {
    id: "crystal",
    name: "Liquid Crystal",
    wgslBody: `fn shade(uv: vec2<f32>, t: f32, mouse: vec2<f32>) -> vec3<f32> {
  let p = uv * 6.0;
  let w1 = sin(p.x + sin(p.y + t));
  let w2 = cos(p.y * 1.3 - cos(p.x * 1.1 - t * 0.7));
  let w3 = sin(length(uv - mouse) * 14.0 - t * 3.0);
  let k = (w1 + w2 + w3) / 3.0;
  let c1 = vec3<f32>(0.08, 0.12, 0.28);
  let c2 = vec3<f32>(0.22, 0.80, 0.96);
  let c3 = vec3<f32>(0.76, 0.32, 0.96);
  return mix(mix(c1, c2, 0.5 + 0.5 * k), c3, smoothstep(0.2, 0.9, abs(w3)));
}`,
  },
];

function wrapWgsl(body: string): string {
  return `struct U { time: f32, w: f32, h: f32, mx: f32, my: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<uniform> u: U;
struct V { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -3.0), vec2(-1.0, 1.0), vec2(3.0, 1.0));
  var o: V;
  o.pos = vec4<f32>(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  return o;
}
${body}
@fragment fn fs(in: V) -> @location(0) vec4<f32> {
  let aspect = u.w / max(u.h, 1.0);
  let uv = vec2<f32>((in.uv.x - 0.5) * aspect + 0.5, 1.0 - in.uv.y);
  let col = shade(uv, u.time, vec2<f32>(u.mx, u.my));
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;
}

const SYNTH_KEYS: readonly {
  note: string;
  freq: number;
  key: string;
  black?: boolean;
}[] = [
  { note: "C4", freq: 261.63, key: "a" },
  { note: "C#4", freq: 277.18, key: "w", black: true },
  { note: "D4", freq: 293.66, key: "s" },
  { note: "D#4", freq: 311.13, key: "e", black: true },
  { note: "E4", freq: 329.63, key: "d" },
  { note: "F4", freq: 349.23, key: "f" },
  { note: "F#4", freq: 369.99, key: "t", black: true },
  { note: "G4", freq: 392.0, key: "g" },
  { note: "G#4", freq: 415.3, key: "y", black: true },
  { note: "A4", freq: 440.0, key: "h" },
  { note: "A#4", freq: 466.16, key: "u", black: true },
  { note: "B4", freq: 493.88, key: "j" },
  { note: "C5", freq: 523.25, key: "k" },
];

export const ShaderSynthApp: React.FC = () => {
  const [mode, setMode] = useState<"shader" | "synth">("shader");

  // Shader state
  const [presetId, setPresetId] = useState(SHADER_PRESETS[0]!.id);
  const [code, setCode] = useState(SHADER_PRESETS[0]!.wgslBody);
  const [shaderErr, setShaderErr] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const simulationTime = useRef(0);
  const revision = useSurfaceRevision(
    presetId,
    code,
    speed,
    paused,
    mode,
    shaderErr,
  );
  useAppSurface({
    document: "shader:" + presetId,
    revision,
    status: shaderErr ? "disconnected" : paused ? "paused" : "live",
    state: {
      preset: presetId,
      speed,
      paused,
      mode,
      error: shaderErr,
      time: simulationTime.current,
    },
    actions: {
      pause: {
        label: "Mettre le shader en pause",
        run: () => {
          setPaused(true);
          return { paused: true };
        },
      },
      resume: {
        label: "Reprendre le shader",
        run: () => {
          setPaused(false);
          return { paused: false };
        },
      },
      preset: {
        label: "Changer de scénario shader",
        run: (args) => {
          const p = SHADER_PRESETS.find((p) => p.id === args.id);
          if (!p) throw new Error("Scénario inconnu");
          setPresetId(p.id);
          setCode(p.wgslBody);
          return { preset: p.id };
        },
      },
    },
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const speedRef = useRef(1.0);
  speedRef.current = speed;

  // Synth state
  const [waveform, setWaveform] = useState<OscillatorType>("sawtooth");
  const [cutoff, setCutoff] = useState(2400);
  const [release, setRelease] = useState(0.45);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [arpPlaying, setArpPlaying] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Live WebGPU Shader Runner
  useEffect(() => {
    if (mode !== "shader") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let device: GPUDevice | null = null;

    const run = async () => {
      if (!navigator.gpu) {
        setShaderErr("WebGPU not available in this browser.");
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || disposed) return;
        device = await adapter.requestDevice();
        if (disposed) {
          device.destroy();
          return;
        }
        const ctx = canvas.getContext("webgpu");
        if (!ctx) return;
        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: "opaque" });

        const module = device.createShaderModule({ code: wrapWgsl(code) });
        const info = await module.getCompilationInfo();
        const errs = info.messages.filter((m) => m.type === "error");
        if (errs.length > 0) {
          setShaderErr(
            errs.map((e) => `L${e.lineNum}: ${e.message}`).join("\n"),
          );
          return;
        }
        setShaderErr(null);

        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: "fs", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });
        const uBuf = device.createBuffer({
          size: 32,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bg = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uBuf } }],
        });

        let simTime = simulationTime.current;
        let lastTs = performance.now();
        let frames = 0;
        let fpsStamp = lastTs;

        const tick = () => {
          if (disposed || !device) return;
          const now = performance.now();
          const dt = (now - lastTs) / 1000;
          lastTs = now;
          if (!pausedRef.current) simTime += dt * speedRef.current;
          simulationTime.current = simTime;

          const rect = canvas.getBoundingClientRect();
          const w = Math.max(
            1,
            Math.floor(rect.width * Math.min(window.devicePixelRatio || 1, 2)),
          );
          const h = Math.max(
            1,
            Math.floor(rect.height * Math.min(window.devicePixelRatio || 1, 2)),
          );
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          device.queue.writeBuffer(
            uBuf,
            0,
            new Float32Array([
              simTime,
              w,
              h,
              mouseRef.current.x,
              mouseRef.current.y,
              0,
              0,
              0,
            ]),
          );
          const enc = device.createCommandEncoder();
          const pass = enc.beginRenderPass({
            colorAttachments: [
              {
                view: ctx.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bg);
          pass.draw(3);
          pass.end();
          device.queue.submit([enc.finish()]);

          frames++;
          if (now - fpsStamp >= 1000) {
            setFps(Math.round((frames * 1000) / (now - fpsStamp)));
            frames = 0;
            fpsStamp = now;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setShaderErr(e instanceof Error ? e.message : String(e));
      }
    };
    void run();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      device?.destroy();
    };
  }, [mode, code]);

  // Synth audio trigger
  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, analyser: analyserRef.current! };
  };

  const triggerNote = (freq: number, noteName: string) => {
    const { ctx, analyser } = ensureAudio();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(4.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + release + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(analyser);
    osc.start(now);
    osc.stop(now + release + 0.08);
    setActiveNote(noteName);
    setTimeout(
      () => setActiveNote((cur) => (cur === noteName ? null : cur)),
      180,
    );
  };

  // Arpeggiator
  useEffect(() => {
    if (!arpPlaying || mode !== "synth") return;
    const pattern = [0, 4, 7, 12, 7, 4, 2, 7];
    let step = 0;
    const id = setInterval(() => {
      const k = SYNTH_KEYS[pattern[step % pattern.length]!]!;
      triggerNote(k.freq, k.note);
      step++;
    }, 185);
    return () => clearInterval(id);
  }, [arpPlaying, mode, waveform, cutoff, release]);

  // Computer keyboard playback (A W S E D F T G Y H U J K)
  useEffect(() => {
    if (mode !== "synth") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const found = SYNTH_KEYS.find((k) => k.key === e.key.toLowerCase());
      if (found) triggerNote(found.freq, found.note);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, waveform, cutoff, release]);

  // Oscilloscope draw loop
  useEffect(() => {
    if (mode !== "synth") return;
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ctx2d = canvas.getContext("2d");
    const draw = () => {
      if (!ctx2d) return;
      const w = (canvas.width = canvas.clientWidth * 2 || 600);
      const h = (canvas.height = canvas.clientHeight * 2 || 200);
      ctx2d.fillStyle = "#080a12";
      ctx2d.fillRect(0, 0, w, h);

      ctx2d.strokeStyle = "rgba(255,255,255,0.06)";
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();

      const analyser = analyserRef.current;
      if (analyser) {
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(buf);
        const grad = ctx2d.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "#8b5cf6");
        grad.addColorStop(0.5, "#22d3ee");
        grad.addColorStop(1, "#f43f5e");
        ctx2d.strokeStyle = grad;
        ctx2d.lineWidth = 3;
        ctx2d.beginPath();
        const slice = w / buf.length;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i]! / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx2d.moveTo(0, y);
          else ctx2d.lineTo(i * slice, y);
        }
        ctx2d.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96 overflow-hidden">
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className="absolute right-3 bottom-3 z-20 px-3 py-1.5 rounded-lg border border-white/15 bg-slate-900/90 text-xs text-amber-100"
      >
        {paused ? "Reprendre le shader" : "Mettre en pause"}
      </button>
      {/* Top Mode Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode("shader")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium transition ${
              mode === "shader"
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            WebGPU WGSL Studio
          </button>
          <button
            type="button"
            onClick={() => setMode("synth")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium transition ${
              mode === "synth"
                ? "bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
            }`}
          >
            <AudioWaveform className="w-3.5 h-3.5" />
            WebAudio Poly Synth
          </button>
        </div>

        <div className="flex items-center gap-2">
          {mode === "shader" && (
            <span className="text-[11px] font-mono text-cyan-300 px-2 py-0.5 rounded-full bg-cyan-500/12 border border-cyan-400/30">
              {fps} FPS · WebGPU
            </span>
          )}
          <button
            type="button"
            onClick={() => wmStore.openApp("screen")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-[11px] text-zinc-200 transition"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-pink-400" />
            Guest GL / FB0
          </button>
        </div>
      </div>

      {mode === "shader" ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
          {/* Left: Presets + Live WGSL Editor */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/30 border-b border-white/8 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {SHADER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetId(p.id);
                      setCode(p.wgslBody);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[11px] border transition ${
                      presetId === p.id
                        ? "bg-violet-500/25 border-violet-400/45 text-white"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <Sliders className="w-3 h-3" />
                <span>{speed.toFixed(1)}×</span>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-16 accent-violet-500"
                />
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full p-3.5 bg-[#0b0d16] font-mono text-xs text-cyan-100 leading-relaxed outline-none resize-none select-text"
            />
            {shaderErr && (
              <div className="p-2.5 bg-rose-500/15 border-t border-rose-400/35 text-[11px] font-mono text-rose-200 whitespace-pre-wrap">
                {shaderErr}
              </div>
            )}
          </div>

          {/* Right: Live GPU Canvas */}
          <div className="relative min-h-[240px] bg-black">
            <canvas
              ref={canvasRef}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                mouseRef.current = {
                  x: (e.clientX - r.left) / Math.max(1, r.width),
                  y: (e.clientY - r.top) / Math.max(1, r.height),
                };
              }}
              className="w-full h-full block cursor-crosshair"
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 px-2 py-0.5 rounded-full bg-black/60 border border-white/15 text-[10px] font-mono text-zinc-300">
              Move mouse to modulate shader
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* Live Oscilloscope */}
          <div className="h-40 rounded-2xl overflow-hidden border border-white/12 bg-[#080a12] relative">
            <canvas ref={scopeCanvasRef} className="w-full h-full block" />
            <div className="absolute top-2.5 left-3 flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>OSCILLOSCOPE</span>
              {activeNote && (
                <span className="text-violet-300 font-semibold">
                  {activeNote}
                </span>
              )}
            </div>
          </div>

          {/* Synth Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
              <div className="text-[11px] text-zinc-400">Waveform</div>
              <div className="grid grid-cols-2 gap-1">
                {(
                  ["sine", "triangle", "sawtooth", "square"] as OscillatorType[]
                ).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWaveform(w)}
                    className={`py-1 rounded-lg text-[10px] font-mono capitalize border transition ${
                      waveform === w
                        ? "bg-violet-500/30 border-violet-400/50 text-white"
                        : "bg-white/5 border-white/10 text-zinc-400"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">Filter Cutoff</span>
                <span className="font-mono text-cyan-300">{cutoff} Hz</span>
              </div>
              <input
                type="range"
                min={200}
                max={8000}
                step={50}
                value={cutoff}
                onChange={(e) => setCutoff(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">Release</span>
                <span className="font-mono text-violet-300">
                  {release.toFixed(2)} s
                </span>
              </div>
              <input
                type="range"
                min={0.08}
                max={1.8}
                step={0.04}
                value={release}
                onChange={(e) => setRelease(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div className="text-[11px] text-zinc-400">Cyber Arpeggiator</div>
              <button
                type="button"
                onClick={() => setArpPlaying((v) => !v)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                  arpPlaying
                    ? "bg-rose-500/25 border border-rose-400/40 text-rose-200"
                    : "bg-gradient-to-r from-violet-600 to-cyan-500 text-white"
                }`}
              >
                {arpPlaying ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {arpPlaying ? "Stop Arp" : "Play Synthwave Arp"}
              </button>
            </div>
          </div>

          {/* Interactive Glass Piano Keyboard */}
          <div className="flex gap-1.5 flex-1 min-h-[120px] items-stretch">
            {SYNTH_KEYS.map((k) => (
              <button
                key={k.note}
                type="button"
                onMouseDown={() => triggerNote(k.freq, k.note)}
                className={`flex-1 rounded-2xl flex flex-col items-center justify-end pb-3 border transition active:scale-95 ${
                  activeNote === k.note
                    ? "bg-gradient-to-b from-violet-500/60 to-cyan-500/60 border-white/60 text-white shadow-lg"
                    : k.black
                      ? "bg-black/80 hover:bg-violet-950/60 border-white/15 text-zinc-400"
                      : "bg-white/10 hover:bg-white/18 border-white/15 text-zinc-200"
                }`}
              >
                <span className="text-[10px] font-mono font-semibold">
                  {k.note}
                </span>
                <span className="text-[9px] text-zinc-500 uppercase mt-0.5">
                  {k.key}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
