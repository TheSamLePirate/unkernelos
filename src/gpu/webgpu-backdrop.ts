import { WALLPAPER_SHADERS } from "../core/os-themes.ts";
import type { WallpaperShaderId } from "../core/schema.ts";

const BACKDROP_WGSL = /* wgsl */ `
struct Uniforms {
  time: f32,
  width: f32,
  height: f32,
  mode: f32, // 0=aurora, 1=liquid-prism, 2=cyber-grid, 3=nordic-borealis, 4=solar-ember
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VsOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 3.0,  1.0)
  );
  let p = positions[idx];
  var out: VsOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

fn hash21(p: vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn renderAurora(uv: vec2<f32>, aspect: f32, t: f32, px: vec2<f32>) -> vec3<f32> {
  var col = vec3<f32>(0.022, 0.026, 0.046);
  let p1 = vec2<f32>(0.22 + 0.14 * sin(t * 0.9), 0.24 + 0.10 * cos(t * 0.7));
  let p2 = vec2<f32>(0.78 + 0.12 * cos(t * 0.6), 0.30 + 0.12 * sin(t * 0.8));
  let p3 = vec2<f32>(0.48 + 0.18 * sin(t * 0.5 + 1.4), 0.82 + 0.08 * cos(t * 0.65));

  let d1 = length((uv - p1) * vec2<f32>(aspect * 0.85, 1.15));
  let d2 = length((uv - p2) * vec2<f32>(aspect * 0.9, 1.1));
  let d3 = length((uv - p3) * vec2<f32>(aspect * 0.75, 1.25));

  col += vec3<f32>(0.32, 0.20, 0.78) * exp(-d1 * d1 * 3.2) * 0.48;
  col += vec3<f32>(0.06, 0.50, 0.72) * exp(-d2 * d2 * 3.6) * 0.36;
  col += vec3<f32>(0.68, 0.15, 0.52) * exp(-d3 * d3 * 4.0) * 0.28;

  let gx = abs(fract(px.x / 64.0) - 0.5);
  let gy = abs(fract(px.y / 64.0) - 0.5);
  let grid = smoothstep(0.492, 0.5, max(gx, gy));
  col += vec3<f32>(0.36, 0.46, 0.78) * grid * 0.03;
  return col;
}

fn renderLiquidPrism(uv: vec2<f32>, aspect: f32, t: f32) -> vec3<f32> {
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0);
  var q = p * 2.2;
  let w1 = sin(q.x * 1.7 + t * 1.1 + cos(q.y * 1.4 - t * 0.8));
  let w2 = cos(q.y * 1.9 - t * 0.9 + sin(q.x * 1.5 + t * 0.7));
  let w3 = sin((q.x + q.y) * 1.3 + t * 0.6);
  let caustic = pow(clamp(0.5 + 0.5 * (w1 * 0.45 + w2 * 0.35 + w3 * 0.2), 0.0, 1.0), 2.2);

  var col = mix(vec3<f32>(0.025, 0.045, 0.105), vec3<f32>(0.055, 0.11, 0.24), uv.y);
  let prismR = smoothstep(0.35, 0.95, caustic + 0.12 * sin(q.x * 2.0 + t));
  let prismG = smoothstep(0.35, 0.95, caustic);
  let prismB = smoothstep(0.35, 0.95, caustic + 0.12 * cos(q.y * 2.0 - t));

  col += vec3<f32>(0.18 * prismR, 0.48 * prismG, 0.82 * prismB) * 0.52;
  col += vec3<f32>(0.45, 0.28, 0.85) * exp(-length(p - vec2<f32>(-0.35, 0.2)) * 2.2) * 0.35;
  col += vec3<f32>(0.15, 0.75, 0.95) * exp(-length(p - vec2<f32>(0.42, -0.18)) * 2.4) * 0.32;
  return col;
}

fn renderCyberGrid(uv: vec2<f32>, aspect: f32, t: f32) -> vec3<f32> {
  // Flip y so horizon sits at 0.46 from bottom
  let y = 1.0 - uv.y;
  let horizon = 0.46;
  var col = mix(vec3<f32>(0.03, 0.015, 0.07), vec3<f32>(0.12, 0.025, 0.16), smoothstep(0.0, horizon, y));

  // Synthwave glowing sun above horizon
  let sunPos = vec2<f32>(0.5, horizon - 0.12);
  let sunDist = length((vec2<f32>(uv.x, y) - sunPos) * vec2<f32>(aspect, 1.0));
  let sunGlow = exp(-sunDist * 4.5);
  let sunCore = smoothstep(0.155, 0.145, sunDist) * step(y, horizon);
  let scanSlice = step(0.28, fract(y * 36.0 - t * 0.4));
  let sunBand = mix(1.0, scanSlice, smoothstep(horizon - 0.16, horizon, y));
  col += vec3<f32>(0.95, 0.18, 0.42) * sunGlow * 0.45;
  col += mix(vec3<f32>(1.0, 0.65, 0.15), vec3<f32>(0.95, 0.15, 0.55), clamp((y - (horizon - 0.25)) * 4.0, 0.0, 1.0)) * sunCore * sunBand * 0.85;

  // Perspective neon floor grid below horizon
  if (y > horizon) {
    let dy = max(y - horizon, 0.004);
    let gz = 0.24 / dy;
    let gx = (uv.x - 0.5) * aspect * gz;
    let lineX = smoothstep(0.45, 0.5, abs(fract(gx * 1.4) - 0.5));
    let lineZ = smoothstep(0.45, 0.5, abs(fract(gz * 1.2 - t * 2.2) - 0.5));
    let grid = max(lineX, lineZ) * exp(-gz * 0.14);
    col = mix(vec3<f32>(0.035, 0.012, 0.06), vec3<f32>(0.06, 0.015, 0.11), exp(-dy * 4.0));
    col += vec3<f32>(0.05, 0.82, 0.95) * grid * 0.65;
    col += vec3<f32>(0.92, 0.18, 0.52) * exp(-dy * 18.0) * 0.55;
  }
  return col;
}

fn renderNordicBorealis(uv: vec2<f32>, aspect: f32, t: f32) -> vec3<f32> {
  var col = mix(vec3<f32>(0.032, 0.048, 0.075), vec3<f32>(0.065, 0.095, 0.145), 1.0 - uv.y);

  // Flowing borealis curtain waves
  let x = uv.x * aspect;
  let wave1 = 0.55 + 0.16 * sin(x * 1.9 + t * 0.9) + 0.08 * cos(x * 3.7 - t * 0.6);
  let wave2 = 0.42 + 0.14 * cos(x * 2.3 - t * 0.7 + 1.2) + 0.06 * sin(x * 4.1 + t * 0.5);
  let curtain1 = exp(-abs(uv.y - wave1) * 5.2) * (0.6 + 0.4 * sin(x * 9.0 + t * 1.4));
  let curtain2 = exp(-abs(uv.y - wave2) * 6.0) * (0.6 + 0.4 * cos(x * 7.5 - t * 1.1));

  col += vec3<f32>(0.18, 0.78, 0.62) * curtain1 * 0.42;
  col += vec3<f32>(0.36, 0.64, 0.85) * curtain2 * 0.36;
  col += vec3<f32>(0.48, 0.40, 0.72) * curtain1 * curtain2 * 0.45;

  // Subtle arctic starfield
  let cell = floor(uv * vec2<f32>(120.0 * aspect, 120.0));
  let star = step(0.994, hash21(cell)) * (0.5 + 0.5 * sin(t * 2.5 + hash21(cell + 19.0) * 6.28));
  col += vec3<f32>(0.85, 0.93, 1.0) * star * 0.38 * smoothstep(0.2, 0.9, uv.y);
  return col;
}

fn renderSolarEmber(uv: vec2<f32>, aspect: f32, t: f32) -> vec3<f32> {
  var col = vec3<f32>(0.042, 0.025, 0.018);
  let p1 = vec2<f32>(0.24 + 0.15 * sin(t * 0.7), 0.32 + 0.12 * cos(t * 0.5));
  let p2 = vec2<f32>(0.76 + 0.13 * cos(t * 0.6), 0.65 + 0.11 * sin(t * 0.75));
  let p3 = vec2<f32>(0.50 + 0.16 * sin(t * 0.45 + 2.0), 0.18 + 0.10 * cos(t * 0.6));

  let d1 = length((uv - p1) * vec2<f32>(aspect * 0.85, 1.15));
  let d2 = length((uv - p2) * vec2<f32>(aspect * 0.9, 1.1));
  let d3 = length((uv - p3) * vec2<f32>(aspect * 0.8, 1.2));

  col += vec3<f32>(0.86, 0.42, 0.06) * exp(-d1 * d1 * 3.1) * 0.46;
  col += vec3<f32>(0.76, 0.20, 0.24) * exp(-d2 * d2 * 3.5) * 0.36;
  col += vec3<f32>(0.96, 0.68, 0.18) * exp(-d3 * d3 * 4.4) * 0.28;

  // Warm diagonal silky ribbons
  let rib = 0.5 + 0.5 * sin((uv.x * 2.8 + uv.y * 2.2) * 3.14 + t * 0.8 + sin(uv.y * 4.0 - t));
  col += vec3<f32>(0.85, 0.48, 0.14) * pow(rib, 5.0) * 0.09;
  return col;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let aspect = u.width / max(u.height, 1.0);
  let uv = in.uv;
  let t = u.time * 0.22;
  let px = uv * vec2<f32>(u.width, u.height);

  var col = vec3<f32>(0.02, 0.025, 0.04);
  if (u.mode < 0.5) {
    col = renderAurora(uv, aspect, t, px);
  } else if (u.mode < 1.5) {
    col = renderLiquidPrism(uv, aspect, t);
  } else if (u.mode < 2.5) {
    col = renderCyberGrid(uv, aspect, t);
  } else if (u.mode < 3.5) {
    col = renderNordicBorealis(uv, aspect, t);
  } else {
    col = renderSolarEmber(uv, aspect, t);
  }

  // Gentle studio vignette
  let vig = 1.0 - smoothstep(0.38, 1.2, length((uv - 0.5) * vec2<f32>(1.18, 1.0)));
  col *= 0.74 + 0.26 * vig;

  // Anti-banding dither noise
  let n = (hash21(px + fract(u.time)) - 0.5) * (1.0 / 255.0);
  return vec4<f32>(col + n, 1.0);
}
`;

export class WebGpuBackdrop {
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private disposed = false;
  private device: GPUDevice | null = null;
  private ctx: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuf: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private startTime = performance.now();
  private modeIndex = 0;

  constructor(canvas: HTMLCanvasElement, initialShader: WallpaperShaderId = "aurora") {
    this.canvas = canvas;
    this.modeIndex = WALLPAPER_SHADERS[initialShader]?.modeIndex ?? 0;
  }

  public setShader(shader: WallpaperShaderId): void {
    this.modeIndex = WALLPAPER_SHADERS[shader]?.modeIndex ?? 0;
  }

  public async init(): Promise<boolean> {
    if (!navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
      if (!adapter || this.disposed) return false;
      const device = await adapter.requestDevice();
      if (this.disposed) {
        device.destroy();
        return false;
      }
      const ctx = this.canvas.getContext("webgpu");
      if (!ctx) {
        device.destroy();
        return false;
      }
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "opaque" });

      const module = device.createShaderModule({ code: BACKDROP_WGSL });
      const info = await module.getCompilationInfo();
      if (info.messages.some((m) => m.type === "error")) {
        device.destroy();
        return false;
      }

      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });

      const uniformBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
      });

      this.device = device;
      this.ctx = ctx;
      this.pipeline = pipeline;
      this.uniformBuf = uniformBuf;
      this.bindGroup = bindGroup;

      this.loop();
      return true;
    } catch {
      return false;
    }
  }

  public resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private loop = () => {
    if (this.disposed || !this.device || !this.ctx || !this.pipeline || !this.uniformBuf || !this.bindGroup) {
      return;
    }
    const elapsed = (performance.now() - this.startTime) / 1000;
    const data = new Float32Array([elapsed, this.canvas.width, this.canvas.height, this.modeIndex]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);

    const enc = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.025, b: 0.04, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);

    this.raf = requestAnimationFrame(this.loop);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.uniformBuf?.destroy();
    this.device?.destroy();
    this.device = null;
  }
}
