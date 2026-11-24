import type { FbScalingMode } from "../core/schema.ts";

const FB0_WGSL = /* wgsl */ `
struct Params {
  crt: f32,
  fbWidth: f32,
  fbHeight: f32,
  pad: f32,
};

@group(0) @binding(0) var fbSampler: sampler;
@group(0) @binding(1) var fbTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VsOut {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );
  var out: VsOut;
  out.pos = vec4<f32>(pos[idx], 0.0, 1.0);
  out.uv = uv[idx];
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  var col = textureSample(fbTex, fbSampler, in.uv).rgb;
  if (params.crt > 0.5) {
    let scan = 0.88 + 0.12 * sin(in.uv.y * params.fbHeight * 3.14159265);
    col *= scan;
  }
  return vec4<f32>(col, 1.0);
}
`;

/**
 * High-performance WebGPU presenter for Linux /dev/fb0 RGBA frames,
 * with automatic fallback to Canvas2D if WebGPU is unavailable or disabled.
 */
export class WebGpuFb0Renderer {
  private canvas: HTMLCanvasElement;
  private mode: "webgpu" | "canvas2d" = "canvas2d";
  private scaling: FbScalingMode = "crisp";
  private device: GPUDevice | null = null;
  private gpuCtx: GPUCanvasContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private samplerNearest: GPUSampler | null = null;
  private samplerLinear: GPUSampler | null = null;
  private uniformBuf: GPUBuffer | null = null;
  private tex: GPUTexture | null = null;
  private texW = 0;
  private texH = 0;
  private bindGroup: GPUBindGroup | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, scaling: FbScalingMode = "crisp") {
    this.canvas = canvas;
    this.scaling = scaling;
  }

  public get backend(): "webgpu" | "canvas2d" {
    return this.mode;
  }

  public setScaling(scaling: FbScalingMode): void {
    this.scaling = scaling;
    this.rebuildBindGroup();
  }

  public async init(preferWebGpu = true): Promise<"webgpu" | "canvas2d"> {
    if (preferWebGpu && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter && !this.disposed) {
          const device = await adapter.requestDevice();
          const gpuCtx = this.canvas.getContext("webgpu");
          if (gpuCtx && !this.disposed) {
            const format = navigator.gpu.getPreferredCanvasFormat();
            gpuCtx.configure({ device, format, alphaMode: "opaque" });
            const module = device.createShaderModule({ code: FB0_WGSL });
            const pipeline = device.createRenderPipeline({
              layout: "auto",
              vertex: { module, entryPoint: "vs_main" },
              fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
              primitive: { topology: "triangle-list" },
            });
            this.device = device;
            this.gpuCtx = gpuCtx;
            this.pipeline = pipeline;
            this.samplerNearest = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
            this.samplerLinear = device.createSampler({ magFilter: "linear", minFilter: "linear" });
            this.uniformBuf = device.createBuffer({
              size: 16,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.mode = "webgpu";
            return "webgpu";
          }
          device.destroy();
        }
      } catch {
        // Fallback cleanly to Canvas2D
      }
    }

    this.ctx2d = this.canvas.getContext("2d");
    this.mode = "canvas2d";
    return "canvas2d";
  }

  private ensureTexture(w: number, h: number): void {
    if (!this.device) return;
    if (this.tex && this.texW === w && this.texH === h) return;
    this.tex?.destroy();
    this.tex = this.device.createTexture({
      size: [w, h, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.texW = w;
    this.texH = h;
    this.rebuildBindGroup();
  }

  private rebuildBindGroup(): void {
    if (!this.device || !this.pipeline || !this.tex || !this.uniformBuf) return;
    const sampler = this.scaling === "crisp" ? this.samplerNearest! : this.samplerLinear!;
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: this.tex.createView() },
        { binding: 2, resource: { buffer: this.uniformBuf } },
      ],
    });
  }

  public present(rgba: Uint8ClampedArray, width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.mode === "webgpu" && this.device && this.gpuCtx && this.pipeline && this.uniformBuf) {
      this.ensureTexture(width, height);
      if (!this.tex || !this.bindGroup) return;

      this.device.queue.writeTexture(
        { texture: this.tex },
        rgba.buffer,
        { offset: rgba.byteOffset, bytesPerRow: width * 4, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 }
      );
      this.device.queue.writeBuffer(
        this.uniformBuf,
        0,
        new Float32Array([this.scaling === "crt" ? 1 : 0, width, height, 0])
      );

      const enc = this.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.gpuCtx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(6);
      pass.end();
      this.device.queue.submit([enc.finish()]);
      return;
    }

    if (this.ctx2d) {
      this.ctx2d.imageSmoothingEnabled = this.scaling !== "crisp";
      const copy = new Uint8ClampedArray(rgba);
      this.ctx2d.putImageData(new ImageData(copy, width, height), 0, 0);
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.tex?.destroy();
    this.uniformBuf?.destroy();
    this.device?.destroy();
    this.device = null;
  }
}
