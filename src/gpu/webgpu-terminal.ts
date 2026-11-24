import type { IBufferCell, Terminal as HeadlessTerminal } from "@xterm/headless";
import type { KittyThemeId } from "../core/schema.ts";

export interface KittyTheme {
  readonly id: KittyThemeId;
  readonly name: string;
  readonly bg: string;
  readonly fg: string;
  readonly cursor: string;
  readonly selection: string;
  readonly ansi: readonly string[]; // 16 colors
}

export const KITTY_THEMES: Record<KittyThemeId, KittyTheme> = {
  "tokyo-night": {
    id: "tokyo-night",
    name: "Tokyo Night",
    bg: "#11131d",
    fg: "#c0caf5",
    cursor: "#7aa2f7",
    selection: "rgba(122, 162, 247, 0.28)",
    ansi: [
      "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
      "#414868", "#ff899d", "#9fe044", "#faba4a", "#8db0ff", "#c7a9ff", "#a4daff", "#c0caf5",
    ],
  },
  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    bg: "#13131e",
    fg: "#cdd6f4",
    cursor: "#f5e0dc",
    selection: "rgba(203, 166, 247, 0.26)",
    ansi: [
      "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
      "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
    ],
  },
  dracula: {
    id: "dracula",
    name: "Dracula",
    bg: "#14151f",
    fg: "#f8f8f2",
    cursor: "#ff79c6",
    selection: "rgba(189, 147, 249, 0.28)",
    ansi: [
      "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
      "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
    ],
  },
  "obsidian-glass": {
    id: "obsidian-glass",
    name: "Obsidian Glass",
    bg: "#090b10",
    fg: "#e4e4e7",
    cursor: "#22d3ee",
    selection: "rgba(34, 211, 238, 0.24)",
    ansi: [
      "#18181b", "#fb7185", "#4ade80", "#facc15", "#60a5fa", "#c084fc", "#22d3ee", "#e4e4e7",
      "#52525b", "#fda4af", "#86efac", "#fde047", "#93c5fd", "#d8b4fe", "#67e8f9", "#ffffff",
    ],
  },
  nord: {
    id: "nord",
    name: "Nord Frost",
    bg: "#161a23",
    fg: "#d8dee9",
    cursor: "#88c0d0",
    selection: "rgba(136, 192, 208, 0.25)",
    ansi: [
      "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
      "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
    ],
  },
};

function hexToRgba01(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

function ansi256ToRgba01(idx: number, palette: readonly string[]): [number, number, number, number] {
  if (idx < 16) return hexToRgba01(palette[idx] || "#ffffff");
  if (idx >= 232) {
    const v = (8 + (idx - 232) * 10) / 255;
    return [v, v, v, 1];
  }
  const c = idx - 16;
  const r = Math.floor(c / 36);
  const g = Math.floor((c % 36) / 6);
  const b = c % 6;
  const map = [0, 95, 135, 175, 215, 255];
  return [map[r]! / 255, map[g]! / 255, map[b]! / 255, 1];
}

function resolveCellColors(
  cell: IBufferCell,
  theme: KittyTheme
): { fg: [number, number, number, number]; bg: [number, number, number, number]; isDefaultBg: boolean } {
  let fg: [number, number, number, number];
  let bg: [number, number, number, number];
  let isDefaultBg = false;

  if (cell.isFgRGB()) {
    const rgb = cell.getFgColor();
    fg = [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  } else if (cell.isFgPalette()) {
    let idx = cell.getFgColor();
    if (cell.isBold() && idx < 8) idx += 8;
    fg = ansi256ToRgba01(idx, theme.ansi);
  } else {
    fg = hexToRgba01(theme.fg);
  }

  if (cell.isBgRGB()) {
    const rgb = cell.getBgColor();
    bg = [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  } else if (cell.isBgPalette()) {
    bg = ansi256ToRgba01(cell.getBgColor(), theme.ansi);
  } else {
    bg = hexToRgba01(theme.bg);
    isDefaultBg = true;
  }

  if (cell.isInverse()) {
    const tmp = fg;
    fg = bg;
    bg = tmp;
    isDefaultBg = false;
  }
  if (cell.isDim()) {
    fg = [fg[0] * 0.62, fg[1] * 0.62, fg[2] * 0.62, 1];
  }

  return { fg, bg, isDefaultBg };
}

// Instanced WGSL shader rendering both cell backgrounds and textured glyph masks in a single GPU pass!
const TERM_WGSL = /* wgsl */ `
struct Viewport {
  width: f32,
  height: f32,
  cellW: f32,
  cellH: f32,
  atlasW: f32,
  atlasH: f32,
  pad0: f32,
  pad1: f32,
};

struct CellInstance {
  @location(0) rect: vec4<f32>,      // x, y, w, h in px
  @location(1) uvRect: vec4<f32>,    // u0, v0, u1, v1 in atlas [0..1] (w=0 => solid quad)
  @location(2) color: vec4<f32>,     // rgba
};

@group(0) @binding(0) var<uniform> vp: Viewport;
@group(0) @binding(1) var atlasSamp: sampler;
@group(0) @binding(2) var atlasTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) textured: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32, inst: CellInstance) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0)
  );
  let c = corners[vIdx];
  let px = inst.rect.xy + c * inst.rect.zw;
  let ndc = vec2<f32>(
    (px.x / max(vp.width, 1.0)) * 2.0 - 1.0,
    1.0 - (px.y / max(vp.height, 1.0)) * 2.0
  );
  var out: VsOut;
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.uv = mix(inst.uvRect.xy, inst.uvRect.zw, c);
  out.color = inst.color;
  out.textured = select(0.0, 1.0, inst.uvRect.z > inst.uvRect.x);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (in.textured > 0.5) {
    let a = textureSample(atlasTex, atlasSamp, in.uv).a;
    return vec4<f32>(in.color.rgb, in.color.a * a);
  }
  return in.color;
}
`;

interface GlyphSlot {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const ATLAS_SIZE = 1024;
const FLOATS_PER_INSTANCE = 12; // rect(4) + uvRect(4) + color(4)

/**
 * Kitty-inspired WebGPU instanced terminal renderer paired with @xterm/headless.
 * Renders dynamic glyph atlas + truecolor cells + smooth cursor on WebGPU (or Canvas2D fallback).
 */
export class KittyWebGpuRenderer {
  private canvas: HTMLCanvasElement;
  private term: HeadlessTerminal;
  private theme: KittyTheme;
  private fontSize: number;
  private fontFamily = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private padX = 12;
  private padY = 10;

  public cellW = 8;
  public cellH = 18;
  public backend: "webgpu" | "canvas2d" = "canvas2d";
  public fps = 0;

  // WebGPU objects
  private device: GPUDevice | null = null;
  private gpuCtx: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuf: GPUBuffer | null = null;
  private instanceBuf: GPUBuffer | null = null;
  private instanceCap = 16384;
  private atlasTex: GPUTexture | null = null;
  private bindGroup: GPUBindGroup | null = null;

  // Dynamic glyph atlas (offscreen 2D canvas -> GPU texture upload on miss)
  private atlasCanvas: HTMLCanvasElement;
  private atlasCtx: CanvasRenderingContext2D;
  private glyphs = new Map<string, GlyphSlot>();
  private atlasCursorX = 0;
  private atlasCursorY = 0;
  private atlasDirty = false;

  // Canvas2D fallback
  private ctx2d: CanvasRenderingContext2D | null = null;

  // Selection state (row/col in viewport coordinates)
  public selection: { startCol: number; startRow: number; endCol: number; endRow: number } | null = null;

  private instanceData = new Float32Array(16384 * FLOATS_PER_INSTANCE);
  private disposed = false;
  private dirty = true;
  private raf = 0;
  private framesInSec = 0;
  private lastFpsStamp = performance.now();

  constructor(canvas: HTMLCanvasElement, term: HeadlessTerminal, theme: KittyTheme, fontSize = 13.5) {
    this.canvas = canvas;
    this.term = term;
    this.theme = theme;
    this.fontSize = fontSize;

    this.atlasCanvas = document.createElement("canvas");
    this.atlasCanvas.width = ATLAS_SIZE;
    this.atlasCanvas.height = ATLAS_SIZE;
    this.atlasCtx = this.atlasCanvas.getContext("2d", { willReadFrequently: false })!;

    this.measureFont();
  }

  public measureFont(): { cellW: number; cellH: number } {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = this.atlasCtx;
    ctx.font = `400 ${this.fontSize * this.dpr}px ${this.fontFamily}`;
    const m = ctx.measureText("M");
    this.cellW = Math.max(6, Math.ceil(m.width) / this.dpr);
    this.cellH = Math.max(12, Math.ceil(this.fontSize * 1.42));
    this.resetAtlas();
    this.dirty = true;
    return { cellW: this.cellW, cellH: this.cellH };
  }

  private resetAtlas(): void {
    this.glyphs.clear();
    this.atlasCursorX = 2;
    this.atlasCursorY = 2;
    this.atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    this.atlasDirty = true;
  }

  public setTheme(theme: KittyTheme): void {
    this.theme = theme;
    this.dirty = true;
  }

  public setFontSize(size: number): void {
    if (Math.abs(size - this.fontSize) < 0.1) return;
    this.fontSize = size;
    this.measureFont();
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public computeGrid(widthPx: number, heightPx: number): { cols: number; rows: number } {
    const usableW = Math.max(40, widthPx - this.padX * 2);
    const usableH = Math.max(24, heightPx - this.padY * 2);
    return {
      cols: Math.max(20, Math.floor(usableW / this.cellW)),
      rows: Math.max(6, Math.floor(usableH / this.cellH)),
    };
  }

  public pixelToCell(offsetX: number, offsetY: number): { col: number; row: number } {
    const col = Math.max(0, Math.min(this.term.cols - 1, Math.floor((offsetX - this.padX) / this.cellW)));
    const row = Math.max(0, Math.min(this.term.rows - 1, Math.floor((offsetY - this.padY) / this.cellH)));
    return { col, row };
  }

  public resizeCanvas(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(cssWidth * this.dpr));
    const h = Math.max(1, Math.floor(cssHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.dirty = true;
    }
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
            gpuCtx.configure({ device, format, alphaMode: "premultiplied" });

            const module = device.createShaderModule({ code: TERM_WGSL });
            const pipeline = device.createRenderPipeline({
              layout: "auto",
              vertex: {
                module,
                entryPoint: "vs_main",
                buffers: [
                  {
                    arrayStride: FLOATS_PER_INSTANCE * 4,
                    stepMode: "instance",
                    attributes: [
                      { shaderLocation: 0, offset: 0, format: "float32x4" },
                      { shaderLocation: 1, offset: 16, format: "float32x4" },
                      { shaderLocation: 2, offset: 32, format: "float32x4" },
                    ],
                  },
                ],
              },
              fragment: {
                module,
                entryPoint: "fs_main",
                targets: [
                  {
                    format,
                    blend: {
                      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                    },
                  },
                ],
              },
              primitive: { topology: "triangle-list" },
            });

            const uniformBuf = device.createBuffer({
              size: 32,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            const instanceBuf = device.createBuffer({
              size: this.instanceCap * FLOATS_PER_INSTANCE * 4,
              usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            const atlasTex = device.createTexture({
              size: [ATLAS_SIZE, ATLAS_SIZE, 1],
              format: "rgba8unorm",
              usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
            });
            const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

            const bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniformBuf } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: atlasTex.createView() },
              ],
            });

            this.device = device;
            this.gpuCtx = gpuCtx;
            this.pipeline = pipeline;
            this.uniformBuf = uniformBuf;
            this.instanceBuf = instanceBuf;
            this.atlasTex = atlasTex;
            this.bindGroup = bindGroup;
            this.backend = "webgpu";
            this.atlasDirty = true;
            this.startLoop();
            return "webgpu";
          }
          device.destroy();
        }
      } catch {
        // Fallback to Canvas2D
      }
    }

    this.ctx2d = this.canvas.getContext("2d");
    this.backend = "canvas2d";
    this.startLoop();
    return "canvas2d";
  }

  private getOrRasterizeGlyph(ch: string, bold: boolean, italic: boolean, widthCells: number): GlyphSlot | null {
    const key = `${bold ? "b" : ""}${italic ? "i" : ""}${widthCells}:${ch}`;
    const cached = this.glyphs.get(key);
    if (cached) return cached;

    const gw = Math.ceil(this.cellW * widthCells * this.dpr) + 2;
    const gh = Math.ceil(this.cellH * this.dpr) + 2;
    if (this.atlasCursorX + gw >= ATLAS_SIZE - 2) {
      this.atlasCursorX = 2;
      this.atlasCursorY += gh + 2;
    }
    if (this.atlasCursorY + gh >= ATLAS_SIZE - 2) {
      this.resetAtlas();
    }

    const x = this.atlasCursorX;
    const y = this.atlasCursorY;
    this.atlasCursorX += gw + 2;

    const ctx = this.atlasCtx;
    ctx.clearRect(x, y, gw, gh);
    ctx.font = `${italic ? "italic " : ""}${bold ? "600" : "400"} ${this.fontSize * this.dpr}px ${this.fontFamily}`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(ch, x + 1, y + gh * 0.52);

    const slot: GlyphSlot = {
      u0: x / ATLAS_SIZE,
      v0: y / ATLAS_SIZE,
      u1: (x + gw) / ATLAS_SIZE,
      v1: (y + gh) / ATLAS_SIZE,
    };
    this.glyphs.set(key, slot);
    this.atlasDirty = true;
    return slot;
  }

  private isSelected(col: number, row: number): boolean {
    if (!this.selection) return false;
    let { startCol, startRow, endCol, endRow } = this.selection;
    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startCol, endCol] = [endCol, startCol];
      [startRow, endRow] = [endRow, startRow];
    }
    if (row < startRow || row > endRow) return false;
    if (row === startRow && col < startCol) return false;
    if (row === endRow && col > endCol) return false;
    return true;
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      if (this.dirty) {
        this.dirty = false;
        if (this.backend === "webgpu") this.renderWebGpu();
        else this.renderCanvas2d();

        this.framesInSec++;
        const now = performance.now();
        if (now - this.lastFpsStamp >= 1000) {
          this.fps = Math.round((this.framesInSec * 1000) / (now - this.lastFpsStamp));
          this.framesInSec = 0;
          this.lastFpsStamp = now;
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private pushInstance(
    count: number,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    rgba: [number, number, number, number]
  ): number {
    if (count >= this.instanceCap) {
      this.instanceCap *= 2;
      const next = new Float32Array(this.instanceCap * FLOATS_PER_INSTANCE);
      next.set(this.instanceData);
      this.instanceData = next;
      if (this.device) {
        this.instanceBuf?.destroy();
        this.instanceBuf = this.device.createBuffer({
          size: this.instanceCap * FLOATS_PER_INSTANCE * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
    }
    const o = count * FLOATS_PER_INSTANCE;
    const d = this.instanceData;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = w;
    d[o + 3] = h;
    d[o + 4] = u0;
    d[o + 5] = v0;
    d[o + 6] = u1;
    d[o + 7] = v1;
    d[o + 8] = rgba[0];
    d[o + 9] = rgba[1];
    d[o + 10] = rgba[2];
    d[o + 11] = rgba[3];
    return count + 1;
  }

  private renderWebGpu(): void {
    if (!this.device || !this.gpuCtx || !this.pipeline || !this.uniformBuf || !this.instanceBuf || !this.atlasTex || !this.bindGroup) {
      return;
    }

    const buf = this.term.buffer.active;
    const rows = this.term.rows;
    const cols = this.term.cols;
    const cw = this.cellW * this.dpr;
    const ch = this.cellH * this.dpr;
    const ox = this.padX * this.dpr;
    const oy = this.padY * this.dpr;
    const cellRef = buf.getNullCell();
    const selRgba: [number, number, number, number] = [0.48, 0.64, 0.97, 0.30];

    let count = 0;

    // Pass 1: cell backgrounds & selection highlights
    for (let y = 0; y < rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      if (!line) continue;
      for (let x = 0; x < cols; x++) {
        line.getCell(x, cellRef);
        if (!cellRef) continue;
        const w = cellRef.getWidth();
        if (w === 0) continue;
        const { bg, isDefaultBg } = resolveCellColors(cellRef, this.theme);
        if (!isDefaultBg) {
          count = this.pushInstance(count, ox + x * cw, oy + y * ch, cw * w, ch, 0, 0, 0, 0, bg);
        }
        if (this.isSelected(x, y)) {
          count = this.pushInstance(count, ox + x * cw, oy + y * ch, cw * w, ch, 0, 0, 0, 0, selRgba);
        }
      }
    }

    // Pass 2: Kitty cursor bar/block
    const cursorRow = buf.baseY - buf.viewportY + buf.cursorY;
    if (cursorRow >= 0 && cursorRow < rows && buf.cursorX >= 0 && buf.cursorX < cols) {
      const curCol = hexToRgba01(this.theme.cursor, 0.85);
      count = this.pushInstance(
        count,
        ox + buf.cursorX * cw,
        oy + cursorRow * ch + ch * 0.08,
        Math.max(2 * this.dpr, cw * 0.24),
        ch * 0.86,
        0,
        0,
        0,
        0,
        curCol
      );
    }

    // Pass 3: glyphs & underlines
    for (let y = 0; y < rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      if (!line) continue;
      for (let x = 0; x < cols; x++) {
        line.getCell(x, cellRef);
        if (!cellRef) continue;
        const w = cellRef.getWidth();
        if (w === 0) continue;
        const chars = cellRef.getChars();
        if (!chars || chars === " ") continue;

        const { fg } = resolveCellColors(cellRef, this.theme);
        const slot = this.getOrRasterizeGlyph(chars, !!cellRef.isBold(), !!cellRef.isItalic(), w);
        if (slot) {
          count = this.pushInstance(
            count,
            ox + x * cw,
            oy + y * ch,
            cw * w + 2,
            ch + 2,
            slot.u0,
            slot.v0,
            slot.u1,
            slot.v1,
            fg
          );
        }
        if (cellRef.isUnderline()) {
          count = this.pushInstance(
            count,
            ox + x * cw,
            oy + (y + 1) * ch - Math.max(1, this.dpr),
            cw * w,
            Math.max(1, this.dpr),
            0,
            0,
            0,
            0,
            fg
          );
        }
      }
    }

    if (this.atlasDirty) {
      this.device.queue.copyExternalImageToTexture(
        { source: this.atlasCanvas },
        { texture: this.atlasTex },
        [ATLAS_SIZE, ATLAS_SIZE]
      );
      this.atlasDirty = false;
    }

    this.device.queue.writeBuffer(
      this.uniformBuf,
      0,
      new Float32Array([this.canvas.width, this.canvas.height, cw, ch, ATLAS_SIZE, ATLAS_SIZE, 0, 0])
    );

    if (count > 0) {
      this.device.queue.writeBuffer(
        this.instanceBuf,
        0,
        this.instanceData.buffer,
        0,
        count * FLOATS_PER_INSTANCE * 4
      );
    }

    const bgRgba = hexToRgba01(this.theme.bg, 0.0);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpuCtx.getCurrentTexture().createView(),
          clearValue: { r: bgRgba[0], g: bgRgba[1], b: bgRgba[2], a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuf);
    if (count > 0) {
      pass.draw(6, count);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  private renderCanvas2d(): void {
    const ctx = this.ctx2d;
    if (!ctx) return;

    const buf = this.term.buffer.active;
    const rows = this.term.rows;
    const cols = this.term.cols;
    const cw = this.cellW * this.dpr;
    const ch = this.cellH * this.dpr;
    const ox = this.padX * this.dpr;
    const oy = this.padY * this.dpr;
    const cellRef = buf.getNullCell();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let y = 0; y < rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      if (!line) continue;
      for (let x = 0; x < cols; x++) {
        line.getCell(x, cellRef);
        if (!cellRef) continue;
        const w = cellRef.getWidth();
        if (w === 0) continue;
        const { fg, bg, isDefaultBg } = resolveCellColors(cellRef, this.theme);
        if (!isDefaultBg) {
          ctx.fillStyle = `rgb(${Math.round(bg[0] * 255)},${Math.round(bg[1] * 255)},${Math.round(bg[2] * 255)})`;
          ctx.fillRect(ox + x * cw, oy + y * ch, cw * w + 0.5, ch + 0.5);
        }
        if (this.isSelected(x, y)) {
          ctx.fillStyle = this.theme.selection;
          ctx.fillRect(ox + x * cw, oy + y * ch, cw * w, ch);
        }
        const chars = cellRef.getChars();
        if (chars && chars !== " ") {
          ctx.font = `${cellRef.isItalic() ? "italic " : ""}${cellRef.isBold() ? "600" : "400"} ${this.fontSize * this.dpr}px ${this.fontFamily}`;
          ctx.fillStyle = `rgb(${Math.round(fg[0] * 255)},${Math.round(fg[1] * 255)},${Math.round(fg[2] * 255)})`;
          ctx.fillText(chars, ox + x * cw, oy + y * ch + ch * 0.52);
        }
      }
    }

    const cursorRow = buf.baseY - buf.viewportY + buf.cursorY;
    if (cursorRow >= 0 && cursorRow < rows && buf.cursorX >= 0 && buf.cursorX < cols) {
      ctx.fillStyle = this.theme.cursor;
      ctx.fillRect(ox + buf.cursorX * cw, oy + cursorRow * ch + ch * 0.08, Math.max(2 * this.dpr, cw * 0.24), ch * 0.86);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.atlasTex?.destroy();
    this.uniformBuf?.destroy();
    this.instanceBuf?.destroy();
    this.device?.destroy();
    this.device = null;
  }
}
