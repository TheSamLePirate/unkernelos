const BACKDROP_WGSL = /* wgsl */ `
struct Uniforms {
  time: f32,
  width: f32,
  height: f32,
  pad: f32,
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

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let aspect = u.width / max(u.height, 1.0);
  let uv = in.uv;
  let t = u.time * 0.14;

  // Deep obsidian base
  var col = vec3<f32>(0.022, 0.026, 0.044);

  // Subtle flowing aurora blobs
  let p1 = vec2<f32>(0.22 + 0.14 * sin(t * 0.9), 0.24 + 0.10 * cos(t * 0.7));
  let p2 = vec2<f32>(0.78 + 0.12 * cos(t * 0.6), 0.30 + 0.12 * sin(t * 0.8));
  let p3 = vec2<f32>(0.48 + 0.18 * sin(t * 0.5 + 1.4), 0.82 + 0.08 * cos(t * 0.65));

  let d1 = length((uv - p1) * vec2<f32>(aspect * 0.85, 1.15));
  let d2 = length((uv - p2) * vec2<f32>(aspect * 0.9, 1.1));
  let d3 = length((uv - p3) * vec2<f32>(aspect * 0.75, 1.25));

  // Indigo / Violet / Cyan / Rose glass aurora
  col += vec3<f32>(0.29, 0.19, 0.72) * exp(-d1 * d1 * 3.4) * 0.42;
  col += vec3<f32>(0.06, 0.46, 0.68) * exp(-d2 * d2 * 3.8) * 0.32;
  col += vec3<f32>(0.64, 0.14, 0.48) * exp(-d3 * d3 * 4.2) * 0.24;

  // Fine architectural grid hint
  let px = uv * vec2<f32>(u.width, u.height);
  let gx = abs(fract(px.x / 64.0) - 0.5);
  let gy = abs(fract(px.y / 64.0) - 0.5);
  let grid = (1.0 - smoothstep(0.485, 0.5, gx)) * 0.0 + smoothstep(0.492, 0.5, max(gx, gy));
  col += vec3<f32>(0.35, 0.45, 0.75) * grid * 0.028;

  // Subtle vignette
  let vig = 1.0 - smoothstep(0.35, 1.15, length((uv - 0.5) * vec2<f32>(1.2, 1.0)));
  col *= 0.72 + 0.28 * vig;

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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
    const data = new Float32Array([elapsed, this.canvas.width, this.canvas.height, 0]);
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
