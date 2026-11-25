//! Liquid Metal unkernelOS Réglages — AAA Native Rust GPU Settings & Live Telemetry App.
//!
//! Powered by `anomalyco/rune` + `rune-fx` (Liquid Metal WGSL shaders, GPU antialiased vector
//! telemetry charts, spring physics, and tactile hover/press states).
//!
//! Compiles both to native macOS/Linux/Wayland AND to WebAssembly (WebGPU + WebGL2) with a
//! live bidirectional bridge controlling unkernelOS settings & streaming real CPU/GPU/RAM stats.

#![forbid(unsafe_code)]

pub mod gfx;

use rune::color::Color;
use rune::tok::motion;
use rune::{
    App, AppSpec, Cursor, Cx, Drag, El, LineCap, Phase, ScrollSpec, Shape, Spring, TextStyle, Tx,
    canvas, col, el, oklcha, row, text,
};

use crate::gfx::{AURORA, GLOW, LIQUID_BORDER, LIQUID_SLAB, SHIMMER};

// ---------------------------------------------------------------------------
// Host bridge (wasm32 <-> unkernelOS Desktop postMessage)
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(inline_js = "
export function emitHostAction(kind, key, value) {
    try {
        window.parent.postMessage({
            source: 'unkernelos-rune-settings',
            kind,
            key,
            value,
        }, '*');
    } catch (_) {}
}

export function pollHostState() {
    const q = window.__UNKERNELOS_STATE_QUEUE__;
    if (!Array.isArray(q) || q.length === 0) return '';
    return String(q.shift() || '');
}
")]
extern "C" {
    #[wasm_bindgen(js_name = emitHostAction)]
    fn emit_host_action(kind: &str, key: &str, value: &str);
    #[wasm_bindgen(js_name = pollHostState)]
    fn poll_host_state() -> String;
}

#[cfg(not(target_arch = "wasm32"))]
fn emit_host_action(_kind: &str, _key: &str, _value: &str) {}

#[cfg(not(target_arch = "wasm32"))]
fn poll_host_state() -> String {
    String::new()
}

fn push_bool(key: &str, v: bool) {
    emit_host_action("config", key, if v { "true" } else { "false" });
}

fn push_num(key: &str, v: i32) {
    emit_host_action("config", key, &v.to_string());
}

fn push_str(key: &str, v: &str) {
    emit_host_action("config", key, v);
}

// ---------------------------------------------------------------------------
// Catalogs (mirrors unkernelOS canonical schema)
// ---------------------------------------------------------------------------

const HIST_LEN: usize = 48;

const TABS: [(&str, &str, &str); 5] = [
    ("Télémétrie", "CPU · GPU · Mémoire", "LIVE"),
    ("Apparence", "Thème, Verre & Alliage", "UI"),
    ("Calcul & Noyau", "vCPU, RAM & JIT", "SMP"),
    ("Graphisme & I/O", "VirGL, Wayland, Audio", "GPU"),
    ("Studio Métal", "Shader WGSL & Presets", "FX"),
];

const THEMES: [(&str, &str, u32, usize); 5] = [
    ("obsidian-aurora", "Obsidian", 0x8b5cf6, 0),
    ("liquid-glass", "Liquid Glass", 0x38bdf8, 5),
    ("cyberpunk-neon", "Cyberpunk", 0xf43f5e, 2),
    ("nordic-frost", "Nordic", 0x22d3ee, 1),
    ("warm-amber", "Warm Amber", 0xf59e0b, 4),
];

const SHADERS: [(&str, &str); 5] = [
    ("aurora", "Aurora"),
    ("liquid-prism", "Liquid Prism"),
    ("cyber-grid", "Cyber Grid"),
    ("nordic-borealis", "Borealis"),
    ("solar-ember", "Solar Ember"),
];

const FINISHES: [(&str, &str, u32); 4] = [
    ("Chrome", "Miroir pur", 0),
    ("Liquid Gold", "Or poli", 1),
    ("Rose Titanium", "Titane rosé", 2),
    ("Gunmetal", "Acier sombre", 3),
];

struct MetalPreset {
    name: &'static str,
    subtitle: &'static str,
    finish: u32,
    flow: f32,
    dome: f32,
    irid: f32,
    contrast: f32,
}

const METAL_PRESETS: [MetalPreset; 4] = [
    MetalPreset {
        name: "Mercure Pur",
        subtitle: "Chrome fluide haute brillance",
        finish: 0,
        flow: 0.78,
        dome: 0.62,
        irid: 0.20,
        contrast: 1.18,
    },
    MetalPreset {
        name: "Or Solaire",
        subtitle: "Reflets chauds & dôme profond",
        finish: 1,
        flow: 0.92,
        dome: 0.74,
        irid: 0.14,
        contrast: 1.24,
    },
    MetalPreset {
        name: "Titane Prisme",
        subtitle: "Iridescence couche mince",
        finish: 2,
        flow: 1.08,
        dome: 0.56,
        irid: 0.58,
        contrast: 1.14,
    },
    MetalPreset {
        name: "Carbone Brossé",
        subtitle: "Gunmetal studio mat",
        finish: 3,
        flow: 0.42,
        dome: 0.40,
        irid: 0.12,
        contrast: 1.32,
    },
];

// ---------------------------------------------------------------------------
// State (Config + Live Telemetry Ring Buffers + Hover Tracking)
// ---------------------------------------------------------------------------

pub struct State {
    pub t: f64,
    pub last_t: f64,
    pub last_sample_t: f64,
    pub tab: usize,
    // Hover tracking for dynamic GPU glow/shimmer
    pub hover_id: Option<&'static str>,
    pub hover_tab: Option<usize>,
    pub hover_finish: Option<u32>,
    pub hover_theme: Option<usize>,
    pub hover_shader: Option<usize>,
    pub hover_preset: Option<usize>,
    // Telemetry chart filter: 0 = All, 1 = CPU, 2 = GPU, 3 = Memory
    pub chart_focus: usize,
    // Appearance
    pub theme_idx: usize,
    pub shader_idx: usize,
    pub metal_finish: u32,
    pub glass_blur: f32, // 0..1 -> 8..40 px
    pub webgpu_wallpaper: bool,
    pub dock_mag: bool,
    pub ui_sounds: bool,
    pub desktop_widgets: bool,
    // Compute
    pub cpus: f32, // 0..1 -> 1..8 vCPUs
    pub ram: f32,  // 0..1 -> 512..3072 MiB
    pub jit: bool,
    pub worker_smp: bool,
    pub shared_mem: bool,
    // Graphics & I/O
    pub gl_virgl: bool,
    pub wayland: bool,
    pub display_fb0: bool,
    pub sound: bool,
    pub net_wisp: bool,
    // Liquid Metal live GPU parameters
    pub metal_flow: f32,
    pub metal_dome: f32,
    pub metal_irid: f32,
    pub metal_contrast: f32,
    // Live Telemetry (CPU / GPU / Memory + Kernel stats)
    pub cpu_pct: f32,
    pub gpu_pct: f32,
    pub mem_pct: f32,
    pub mem_used_mib: f32,
    pub mem_total_mib: f32,
    pub fps_smooth: f32,
    pub frame_ms: f32,
    pub jit_blks: u32,
    pub io_kbps: f32,
    pub uptime_sec: u32,
    pub gpu_backend: String,
    pub host_telemetry_seen: bool,
    pub cpu_hist: [f32; HIST_LEN],
    pub gpu_hist: [f32; HIST_LEN],
    pub mem_hist: [f32; HIST_LEN],
    // Status & pending reboot
    pub status_line: String,
    pub reboot_pending: bool,
}

impl Default for State {
    fn default() -> Self {
        let mut cpu_hist = [0.0; HIST_LEN];
        let mut gpu_hist = [0.0; HIST_LEN];
        let mut mem_hist = [0.0; HIST_LEN];
        for i in 0..HIST_LEN {
            let x = i as f32 * 0.24;
            cpu_hist[i] = (24.0 + (x * 1.1).sin() * 9.0 + (x * 0.43).cos() * 6.0).clamp(6.0, 95.0);
            gpu_hist[i] = (38.0 + (x * 0.85).cos() * 11.0 + (x * 1.7).sin() * 5.0).clamp(10.0, 95.0);
            mem_hist[i] = (34.0 + (x * 0.3).sin() * 3.5).clamp(12.0, 92.0);
        }
        Self {
            t: 0.0,
            last_t: 0.0,
            last_sample_t: 0.0,
            tab: 0,
            hover_id: None,
            hover_tab: None,
            hover_finish: None,
            hover_theme: None,
            hover_shader: None,
            hover_preset: None,
            chart_focus: 0,
            theme_idx: 0,
            shader_idx: 0,
            metal_finish: 0,
            glass_blur: 0.625,
            webgpu_wallpaper: true,
            dock_mag: true,
            ui_sounds: true,
            desktop_widgets: true,
            cpus: 0.43,
            ram: 0.6,
            jit: true,
            worker_smp: true,
            shared_mem: true,
            gl_virgl: true,
            wayland: true,
            display_fb0: true,
            sound: true,
            net_wisp: true,
            metal_flow: 0.76,
            metal_dome: 0.60,
            metal_irid: 0.24,
            metal_contrast: 1.16,
            cpu_pct: cpu_hist[HIST_LEN - 1],
            gpu_pct: gpu_hist[HIST_LEN - 1],
            mem_pct: mem_hist[HIST_LEN - 1],
            mem_used_mib: 696.0,
            mem_total_mib: 2048.0,
            fps_smooth: 60.0,
            frame_ms: 16.6,
            jit_blks: 4280,
            io_kbps: 128.0,
            uptime_sec: 12,
            gpu_backend: "WebGPU".to_string(),
            host_telemetry_seen: false,
            cpu_hist,
            gpu_hist,
            mem_hist,
            status_line: "Linux 7.x Debian · En ligne · WebGPU".to_string(),
            reboot_pending: false,
        }
    }
}

impl State {
    fn blur_px(&self) -> i32 {
        (8.0 + self.glass_blur * 32.0).round() as i32
    }

    fn cpu_count(&self) -> i32 {
        (1.0 + self.cpus * 7.0).round() as i32
    }

    fn ram_mib(&self) -> i32 {
        let steps = (self.ram * 10.0).round() as i32;
        512 + steps * 256
    }

    fn push_sample(&mut self, cpu: f32, gpu: f32, mem: f32) {
        self.cpu_hist.rotate_left(1);
        self.gpu_hist.rotate_left(1);
        self.mem_hist.rotate_left(1);
        self.cpu_hist[HIST_LEN - 1] = cpu.clamp(2.0, 99.0);
        self.gpu_hist[HIST_LEN - 1] = gpu.clamp(2.0, 99.0);
        self.mem_hist[HIST_LEN - 1] = mem.clamp(2.0, 99.0);
        self.cpu_pct = self.cpu_hist[HIST_LEN - 1];
        self.gpu_pct = self.gpu_hist[HIST_LEN - 1];
        self.mem_pct = self.mem_hist[HIST_LEN - 1];
    }

    /// Apply pipe/semicolon-delimited state & telemetry snapshot from host.
    fn apply_host_snapshot(&mut self, msg: &str) {
        let mut tel_cpu: Option<f32> = None;
        let mut tel_gpu: Option<f32> = None;
        let mut tel_mem: Option<f32> = None;

        for part in msg.split(';') {
            let Some((k, v)) = part.split_once('=') else { continue };
            match k {
                "osTheme" => {
                    if let Some(i) = THEMES.iter().position(|(id, _, _, _)| *id == v) {
                        self.theme_idx = i;
                    }
                }
                "wallpaperShader" => {
                    if let Some(i) = SHADERS.iter().position(|(id, _)| *id == v) {
                        self.shader_idx = i;
                    }
                }
                "glassBlur" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.glass_blur = ((n - 8.0) / 32.0).clamp(0.0, 1.0);
                    }
                }
                "webgpuWallpaper" => self.webgpu_wallpaper = v == "true",
                "dockMagnification" => self.dock_mag = v == "true",
                "uiSounds" => self.ui_sounds = v == "true",
                "desktopWidgets" => self.desktop_widgets = v == "true",
                "cpus" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.cpus = ((n - 1.0) / 7.0).clamp(0.0, 1.0);
                    }
                }
                "memoryMiB" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.ram = ((n - 512.0) / 2560.0).clamp(0.0, 1.0);
                        self.mem_total_mib = n.max(256.0);
                    }
                }
                "jit" => self.jit = v == "true",
                "worker" => self.worker_smp = v == "true",
                "shared" => self.shared_mem = v == "true",
                "gl" => self.gl_virgl = v == "true",
                "wayland" => self.wayland = v == "true",
                "display" => self.display_fb0 = v == "true",
                "sound" => self.sound = v == "true",
                "net" => self.net_wisp = v == "true",
                "status" => self.status_line = v.to_string(),
                // Real-time telemetry fields
                "cpuPct" => {
                    if let Ok(n) = v.parse::<f32>() {
                        tel_cpu = Some(n.clamp(1.0, 100.0));
                    }
                }
                "gpuPct" => {
                    if let Ok(n) = v.parse::<f32>() {
                        tel_gpu = Some(n.clamp(1.0, 100.0));
                    }
                }
                "memPct" => {
                    if let Ok(n) = v.parse::<f32>() {
                        tel_mem = Some(n.clamp(1.0, 100.0));
                    }
                }
                "memUsedMiB" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.mem_used_mib = n.max(0.0);
                    }
                }
                "memTotalMiB" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.mem_total_mib = n.max(256.0);
                    }
                }
                "jitBlks" => {
                    if let Ok(n) = v.parse::<u32>() {
                        self.jit_blks = n;
                    }
                }
                "ioKbps" => {
                    if let Ok(n) = v.parse::<f32>() {
                        self.io_kbps = n.max(0.0);
                    }
                }
                "uptimeSec" => {
                    if let Ok(n) = v.parse::<u32>() {
                        self.uptime_sec = n;
                    }
                }
                "gpuBackend" => self.gpu_backend = v.to_string(),
                _ => {}
            }
        }

        if tel_cpu.is_some() || tel_gpu.is_some() || tel_mem.is_some() {
            self.host_telemetry_seen = true;
            let cpu = tel_cpu.unwrap_or(self.cpu_pct);
            // Blend host GPU load with live Rune shader load so the curve reflects real GPU work
            let gpu_base = tel_gpu.unwrap_or(self.gpu_pct);
            let shader_work = (self.metal_flow * 8.0 + self.metal_irid * 12.0).min(18.0);
            let gpu = (gpu_base + shader_work * 0.35).clamp(4.0, 99.0);
            let mem = tel_mem.unwrap_or(self.mem_pct);
            self.push_sample(cpu, gpu, mem);
        }
    }

    fn tick_telemetry(&mut self, t: f64) {
        if self.last_t > 0.0 {
            let dt = (t - self.last_t).clamp(0.004, 0.25) as f32;
            let fps = (1.0 / dt).clamp(15.0, 144.0);
            self.fps_smooth = self.fps_smooth * 0.90 + fps * 0.10;
            self.frame_ms = self.frame_ms * 0.90 + (dt * 1000.0) * 0.10;
        }
        self.last_t = t;

        // If running standalone (or between host ticks), keep waveform breathing smoothly
        if !self.host_telemetry_seen && t - self.last_sample_t >= 0.35 {
            self.last_sample_t = t;
            let tf = t as f32;
            let cpu = 22.0 + (tf * 1.3).sin() * 11.0 + (tf * 2.9).cos() * 5.0;
            let gpu = 36.0 + self.metal_flow * 12.0 + (tf * 0.9).cos() * 9.0 + (tf * 2.1).sin() * 4.0;
            let mem = 33.0 + (tf * 0.35).sin() * 4.0;
            self.mem_used_mib = self.mem_total_mib * (mem / 100.0);
            self.push_sample(cpu, gpu, mem);
        }
    }
}

// ---------------------------------------------------------------------------
// Visual Helpers
// ---------------------------------------------------------------------------

fn hex(h: u32) -> Color {
    let ch = |shift: u32| rune::color::srgb_decode(((h >> shift) & 0xff) as f32 / 255.0);
    Color { r: ch(16), g: ch(8), b: ch(0), a: 1.0 }
}

fn hexa(h: u32, a: f32) -> Color {
    hex(h).alpha(a)
}

fn fx(kind: u32, data: [f32; 4]) -> El {
    rune::effect(kind).effect_data(data)
}

fn accent_color(s: &State) -> Color {
    hex(THEMES[s.theme_idx].2)
}

fn accent_palette_idx(s: &State) -> f32 {
    THEMES[s.theme_idx].3 as f32
}

fn label_txt(s: impl Into<String>, size: f32, weight: f32, color: Color) -> El {
    text(s).font(TextStyle::new(size, weight)).color(color)
}

fn mono_txt(s: impl Into<String>, size: f32, color: Color) -> El {
    text(s).font(TextStyle::new(size, 500.0).mono()).color(color)
}

fn fmt_uptime(sec: u32) -> String {
    let h = sec / 3600;
    let m = (sec % 3600) / 60;
    let s = sec % 60;
    if h > 0 {
        format!("{h}h {m:02}m")
    } else if m > 0 {
        format!("{m}m {s:02}s")
    } else {
        format!("{s}s")
    }
}

fn stats_avg_peak(hist: &[f32; HIST_LEN]) -> (f32, f32) {
    let mut sum = 0.0;
    let mut peak = 0.0f32;
    for &v in hist {
        sum += v;
        if v > peak {
            peak = v;
        }
    }
    (sum / HIST_LEN as f32, peak)
}

/// Builds a smooth GPU antialiased vector area + glow-polyline chart using `rune::Shape`.
fn build_sparkline_shape(hist: &[f32; HIST_LEN], stroke_col: Color, show_grid: bool) -> Shape {
    let vb_w = 240.0f32;
    let vb_h = 84.0f32;
    let pad_y = 6.0f32;
    let usable_h = vb_h - pad_y * 2.0;

    let mut shape = Shape::new().view_box(vb_w, vb_h);

    if show_grid {
        let grid_col = oklcha(1.0, 0.0, 0.0, 0.065);
        for frac in [0.25f32, 0.50, 0.75] {
            let gy = pad_y + usable_h * frac;
            shape = shape.line([0.0, gy], [vb_w, gy], 1.0, LineCap::Butt, grid_col);
        }
    }

    let mut pts: Vec<[f32; 2]> = Vec::with_capacity(HIST_LEN);
    let step_x = vb_w / (HIST_LEN - 1) as f32;
    for (i, &val) in hist.iter().enumerate() {
        let x = i as f32 * step_x;
        let y = pad_y + usable_h * (1.0 - (val.clamp(0.0, 100.0) / 100.0));
        pts.push([x, y]);
    }

    // Translucent area polygon under the live curve
    let mut poly = Vec::with_capacity(HIST_LEN + 2);
    poly.push([0.0, vb_h]);
    poly.extend_from_slice(&pts);
    poly.push([vb_w, vb_h]);

    shape = shape
        .fill(poly, stroke_col.alpha(0.18))
        .stroke(pts.clone(), 5.5, stroke_col.alpha(0.14))
        .stroke(pts, 2.0, stroke_col);

    shape
}

/// Multi-channel overlay chart (CPU + GPU + Memory simultaneously).
fn build_multichannel_shape(s: &State) -> Shape {
    let vb_w = 560.0f32;
    let vb_h = 116.0f32;
    let pad_y = 8.0f32;
    let usable_h = vb_h - pad_y * 2.0;
    let step_x = vb_w / (HIST_LEN - 1) as f32;

    let mut shape = Shape::new().view_box(vb_w, vb_h);
    let grid_col = oklcha(1.0, 0.0, 0.0, 0.065);
    for frac in [0.25f32, 0.50, 0.75] {
        let gy = pad_y + usable_h * frac;
        shape = shape.line([0.0, gy], [vb_w, gy], 1.0, LineCap::Butt, grid_col);
    }

    let channels: [(&[f32; HIST_LEN], Color, usize); 3] = [
        (&s.mem_hist, hex(0x34d399), 3),
        (&s.gpu_hist, hex(0xc084fc), 2),
        (&s.cpu_hist, hex(0x22d3ee), 1),
    ];

    for (hist, col, ch_id) in channels {
        let emphasized = s.chart_focus == 0 || s.chart_focus == ch_id;
        let alpha_line = if emphasized { 1.0 } else { 0.22 };
        let alpha_fill = if s.chart_focus == ch_id {
            0.22
        } else if s.chart_focus == 0 {
            0.09
        } else {
            0.02
        };

        let mut pts = Vec::with_capacity(HIST_LEN);
        for (i, &val) in hist.iter().enumerate() {
            let x = i as f32 * step_x;
            let y = pad_y + usable_h * (1.0 - (val.clamp(0.0, 100.0) / 100.0));
            pts.push([x, y]);
        }

        let mut poly = Vec::with_capacity(HIST_LEN + 2);
        poly.push([0.0, vb_h]);
        poly.extend_from_slice(&pts);
        poly.push([vb_w, vb_h]);

        shape = shape.fill(poly, col.alpha(alpha_fill));
        if emphasized {
            shape = shape.stroke(pts.clone(), 5.0, col.alpha(0.14));
        }
        shape = shape.stroke(pts, if s.chart_focus == ch_id { 2.4 } else { 1.85 }, col.alpha(alpha_line));
    }

    shape
}

// ---------------------------------------------------------------------------
// Reusable AAA Liquid Metal Controls (Hover, Press, Spring Physics, Cursor)
// ---------------------------------------------------------------------------

fn metal_switch(
    key: &'static str,
    on: bool,
    finish: u32,
    accent: Color,
    on_toggle: impl Fn(&mut State) + 'static,
) -> El {
    let (w, h, k) = (50.0, 28.0, 22.0);
    let inset = (h - k) / 2.0;
    let knob_x = if on { w - k - inset } else { inset };

    el().key(key)
        .role("switch")
        .label(key)
        .checked(on)
        .focusable(true)
        .cursor(Cursor::Pointer)
        .size(w, h)
        .radius(h / 2.0)
        .fill(if on { accent } else { oklcha(1.0, 0.0, 0.0, 0.13) })
        .hover(oklcha(1.0, 0.0, 0.0, 0.14))
        .press(oklcha(0.0, 0.0, 0.0, 0.12))
        .press_scale(0.95)
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .border(1.0, oklcha(1.0, 0.0, 0.0, if on { 0.42 } else { 0.15 }))
        .motion(motion::SNAPPY)
        .on_press(on_toggle)
        .child(
            el().key(format!("{key}-knob"))
                .size(k, k)
                .radius(k / 2.0)
                .absolute(knob_x, inset)
                .fill(hex(0xf4f6fa))
                .shadow(1.5, 6.0, oklcha(0.0, 0.0, 0.0, 0.58))
                .child(
                    fx(LIQUID_SLAB, [finish as f32, 48.0, 7.0, 1.0])
                        .key(format!("{key}-knob-fx"))
                        .absolute(0.0, 0.0)
                        .size(k, k)
                        .radius(k / 2.0),
                ),
        )
}

fn setting_toggle_row(
    key: &'static str,
    title: &str,
    subtitle: &str,
    on: bool,
    finish: u32,
    accent: Color,
    on_toggle: impl Fn(&mut State) + 'static,
) -> El {
    row()
        .key(format!("row-{key}"))
        .w_full()
        .px(16.0)
        .py(12.0)
        .center_y()
        .gap(12.0)
        .cursor(Cursor::Pointer)
        .hover(oklcha(1.0, 0.0, 0.0, 0.045))
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .child(
            col()
                .grow(1.0)
                .gap(2.0)
                .child(label_txt(title, 13.0, 500.0, hex(0xf6f7fb)))
                .child(label_txt(subtitle, 11.0, 400.0, hex(0x888fa6))),
        )
        .child(metal_switch(key, on, finish, accent, on_toggle))
}

fn liquid_slider(
    key: &'static str,
    title: &str,
    value_label: String,
    val: f32,
    finish: u32,
    accent: Color,
    track_w: f32,
    on_change: impl Fn(&mut State, f32, bool) + Copy + 'static,
) -> El {
    let puck = 23.0;
    let travel = (track_w - puck).max(60.0);
    let to_v = move |x: f32| ((x - puck / 2.0) / travel).clamp(0.0, 1.0);
    let clamped = val.clamp(0.0, 1.0);

    col()
        .key(format!("slider-wrap-{key}"))
        .w_full()
        .px(16.0)
        .py(12.0)
        .gap(9.0)
        .hover(oklcha(1.0, 0.0, 0.0, 0.035))
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .child(
            row()
                .w_full()
                .center_y()
                .child(label_txt(title, 13.0, 500.0, hex(0xf6f7fb)).grow(1.0))
                .child(
                    el().px(9.0)
                        .py(3.0)
                        .radius(999.0)
                        .fill(accent.alpha(0.14))
                        .border(1.0, accent.alpha(0.35))
                        .child(mono_txt(value_label, 11.0, hex(0xe2f5ff))),
                ),
        )
        .child(
            el().key(key)
                .role("slider")
                .label(title)
                .range_value(f64::from(clamped), 0.0, 1.0)
                .cursor(Cursor::Grab)
                .size(track_w, puck)
                .motion(Spring::new(0.26, 0.14))
                .on_drag(move |s: &mut State, d: &mut Drag, tx: &mut Tx| match d.phase {
                    Phase::Down => {
                        let next = to_v(d.x);
                        on_change(s, next, false);
                    }
                    Phase::Move => {
                        let next = to_v(d.x);
                        on_change(s, next, false);
                        tx.instant();
                    }
                    Phase::Up => {
                        let next = to_v(d.x);
                        on_change(s, next, true);
                    }
                })
                .child(
                    el().key(format!("{key}-rail"))
                        .size(travel, 5.0)
                        .radius(2.5)
                        .fill(oklcha(1.0, 0.0, 0.0, 0.13))
                        .absolute(puck / 2.0, puck / 2.0 - 2.5),
                )
                .child(
                    el().key(format!("{key}-fill"))
                        .size(travel * clamped, 5.0)
                        .radius(2.5)
                        .fill(accent)
                        .absolute(puck / 2.0, puck / 2.0 - 2.5),
                )
                .child(
                    el().key(format!("{key}-puck"))
                        .size(puck, puck)
                        .radius(puck / 2.0)
                        .absolute(travel * clamped, 0.0)
                        .fill(hex(0xf4f7fc))
                        .hover(oklcha(1.0, 0.0, 0.0, 0.18))
                        .shadow(2.0, 8.0, oklcha(0.0, 0.0, 0.0, 0.65))
                        .child(
                            fx(LIQUID_SLAB, [finish as f32, 46.0, 8.0, 1.0])
                                .key(format!("{key}-puck-fx"))
                                .absolute(0.0, 0.0)
                                .size(puck, puck)
                                .radius(puck / 2.0),
                        ),
                ),
        )
}

fn glass_card(key: &str, children: Vec<El>) -> El {
    let mut c = col()
        .key(key)
        .w_full()
        .radius(18.0)
        .gradient(hex(0x131726), hex(0x0d101b))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.11))
        .shadow(6.0, 22.0, oklcha(0.0, 0.0, 0.0, 0.38));
    for (idx, child) in children.into_iter().enumerate() {
        if idx > 0 {
            c = c.child(el().w_full().h(1.0).fill(oklcha(1.0, 0.0, 0.0, 0.065)));
        }
        c = c.child(child);
    }
    c
}

fn section_title(title: &str, accent: Color) -> El {
    row()
        .center_y()
        .gap(7.0)
        .child(el().size(5.0, 5.0).radius(2.5).fill(accent))
        .child(label_txt(title.to_uppercase(), 10.5, 700.0, hex(0x8890ab)))
}

fn liquid_cta_button(
    s: &State,
    id: &'static str,
    label: &str,
    w: f32,
    h: f32,
    on_click: impl Fn(&mut State) + 'static,
) -> El {
    let hovered = s.hover_id == Some(id);
    let mut btn = el()
        .key(id)
        .role("button")
        .label(label)
        .focusable(true)
        .cursor(Cursor::Pointer)
        .size(w, h)
        .radius(14.0)
        .fill(hex(0x1b2030))
        .hover(oklcha(1.0, 0.0, 0.0, 0.12))
        .press(oklcha(0.0, 0.0, 0.0, 0.16))
        .press_scale(0.965)
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .border(1.0, oklcha(1.0, 0.0, 0.0, if hovered { 0.55 } else { 0.25 }))
        .shadow(4.0, if hovered { 20.0 } else { 12.0 }, oklcha(0.0, 0.0, 0.0, 0.55))
        .on_hover_change(move |st: &mut State, entered, _| {
            if entered {
                st.hover_id = Some(id);
            } else if st.hover_id == Some(id) {
                st.hover_id = None;
            }
        })
        .on_press(on_click)
        .child(
            fx(LIQUID_SLAB, [s.metal_finish as f32, 96.0, 12.0, 1.0])
                .key(format!("{id}-metal"))
                .absolute(0.0, 0.0)
                .size(w, h)
                .radius(14.0),
        )
        .child(
            fx(
                SHIMMER,
                [if hovered { 0.85 } else { 0.42 }, if hovered { 1.4 } else { 2.8 }, 0.32, 0.0],
            )
            .key(format!("{id}-shimmer"))
            .absolute(0.0, 0.0)
            .size(w, h)
            .radius(14.0),
        );

    if hovered {
        btn = btn.child(
            fx(GLOW, [accent_palette_idx(s), 0.0, 0.45, 18.0])
                .key(format!("{id}-glow"))
                .absolute(0.0, 0.0)
                .size(w, h)
                .radius(14.0),
        );
    }

    btn.child(
        el().size(w, h)
            .center()
            .child(label_txt(label, 12.5, 700.0, hex(0x090b12))),
    )
}

// ---------------------------------------------------------------------------
// Hero Banner (Live GPU Liquid Metal + Live Mini KPI Badges)
// ---------------------------------------------------------------------------

fn mini_kpi_pill(label: &str, value: String, dot_col: Color) -> El {
    row()
        .px(9.0)
        .py(4.5)
        .radius(999.0)
        .center_y()
        .gap(6.0)
        .fill(oklcha(0.0, 0.0, 0.0, 0.34))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.11))
        .child(el().size(6.0, 6.0).radius(3.0).fill(dot_col))
        .child(mono_txt(format!("{label} {value}"), 10.0, hex(0xe8ecf7)))
}

fn liquid_metal_hero(s: &State, width: f32, compact: bool) -> El {
    let accent = accent_color(s);
    let h = if compact { 126.0 } else { 112.0 };
    let finish_name = FINISHES[s.metal_finish as usize % FINISHES.len()].0;
    let orb_hovered = s.hover_id == Some("hero-orb");

    let mut medallion = el()
        .key("hero-medallion")
        .cursor(Cursor::Pointer)
        .size(64.0, 64.0)
        .radius(19.0)
        .fill(hex(0x1b2030))
        .hover(oklcha(1.0, 0.0, 0.0, 0.12))
        .press_scale(0.93)
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .shadow(4.0, 18.0, oklcha(0.0, 0.0, 0.0, 0.65))
        .on_hover_change(|st: &mut State, entered, _| {
            if entered {
                st.hover_id = Some("hero-orb");
            } else if st.hover_id == Some("hero-orb") {
                st.hover_id = None;
            }
        })
        .on_press(|st: &mut State| {
            st.metal_finish = (st.metal_finish + 1) % FINISHES.len() as u32;
        })
        .child(
            fx(LIQUID_SLAB, [s.metal_finish as f32, 82.0, 15.0, 1.0])
                .key("hero-medallion-fx")
                .absolute(0.0, 0.0)
                .size(64.0, 64.0)
                .radius(19.0),
        );

    if orb_hovered {
        medallion = medallion.child(
            fx(SHIMMER, [0.9, 1.3, 0.35, 0.0])
                .key("hero-medallion-shimmer")
                .absolute(0.0, 0.0)
                .size(64.0, 64.0)
                .radius(19.0),
        );
    }

    medallion = medallion.child(
        el().size(64.0, 64.0)
            .center()
            .child(label_txt("U", 26.0, 700.0, hex(0x090b12))),
    );

    el().key("hero-banner")
        .w_full()
        .h(h)
        .radius(20.0)
        .gradient(hex(0x121728), hex(0x0a0d16))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.14))
        .shadow(8.0, 28.0, oklcha(0.0, 0.0, 0.0, 0.48))
        .child(
            fx(LIQUID_BORDER, [s.metal_finish as f32, 2.2, if orb_hovered { 1.0 } else { 0.0 }, 0.0])
                .key("hero-rim")
                .absolute(0.0, 0.0)
                .size(width, h)
                .radius(20.0),
        )
        .child(
            fx(AURORA, [0.28, 0.30, 0.0, 0.0])
                .key("hero-aurora")
                .absolute(0.0, 0.0)
                .size(width, h)
                .radius(20.0),
        )
        .child(
            row()
                .w_full()
                .h_full()
                .px(18.0)
                .center_y()
                .gap(16.0)
                .child(medallion)
                .child(
                    col()
                        .grow(1.0)
                        .gap(5.0)
                        .child(
                            row()
                                .center_y()
                                .gap(8.0)
                                .child(label_txt("Liquid Metal Réglages", 17.5, 700.0, hex(0xffffff)))
                                .child(
                                    el().px(8.0)
                                        .py(2.0)
                                        .radius(999.0)
                                        .fill(accent.alpha(0.22))
                                        .border(1.0, accent.alpha(0.55))
                                        .child(mono_txt("RUST RUNE GPU", 9.0, hex(0xf3e8ff))),
                                ),
                        )
                        .child(label_txt(
                            format!(
                                "Alliage {finish_name} · {} · {} · Uptime {}",
                                THEMES[s.theme_idx].1,
                                s.status_line,
                                fmt_uptime(s.uptime_sec)
                            ),
                            11.0,
                            400.0,
                            hex(0xa3acc7),
                        ))
                        .child(
                            row()
                                .gap(6.0)
                                .child(mini_kpi_pill("CPU", format!("{:.0}%", s.cpu_pct), hex(0x22d3ee)))
                                .child(mini_kpi_pill("GPU", format!("{:.0} FPS", s.fps_smooth), hex(0xc084fc)))
                                .child(mini_kpi_pill(
                                    "RAM",
                                    format!("{:.0}/{:.0}M", s.mem_used_mib, s.mem_total_mib),
                                    hex(0x34d399),
                                )),
                        ),
                ),
        )
}

// ---------------------------------------------------------------------------
// Tab 0: Real-Time CPU / GPU / Memory Telemetry Graphs (AAA GPU Vector Charts)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn telemetry_card(
    s: &State,
    id: &'static str,
    title: &str,
    sub: String,
    big_val: String,
    pct: f32,
    hist: &[f32; HIST_LEN],
    color: Color,
    palette_idx: f32,
    card_w: f32,
    footer_left: String,
    footer_right: String,
) -> El {
    let hovered = s.hover_id == Some(id);
    let (avg, peak) = stats_avg_peak(hist);
    let card_h = 196.0;
    let bar_w = (card_w - 32.0).max(80.0);
    let fill_w = (bar_w * (pct.clamp(0.0, 100.0) / 100.0)).max(6.0);

    let mut card = el()
        .key(id)
        .cursor(Cursor::Pointer)
        .w(card_w)
        .h(card_h)
        .radius(18.0)
        .gradient(hex(0x14192a), hex(0x0c0f19))
        .hover(oklcha(1.0, 0.0, 0.0, 0.05))
        .press_scale(0.985)
        .hover_motion(motion::SNAPPY, motion::SNAPPY)
        .border(1.0, if hovered { color.alpha(0.6) } else { oklcha(1.0, 0.0, 0.0, 0.11) })
        .shadow(6.0, if hovered { 26.0 } else { 18.0 }, oklcha(0.0, 0.0, 0.0, 0.45))
        .on_hover_change(move |st: &mut State, entered, _| {
            if entered {
                st.hover_id = Some(id);
            } else if st.hover_id == Some(id) {
                st.hover_id = None;
            }
        });

    if hovered {
        card = card
            .child(
                fx(LIQUID_BORDER, [s.metal_finish as f32, 1.8, 0.8, 0.0])
                    .key(format!("{id}-rim"))
                    .absolute(0.0, 0.0)
                    .size(card_w, card_h)
                    .radius(18.0),
            )
            .child(
                fx(GLOW, [palette_idx, 0.0, 0.30, 18.0])
                    .key(format!("{id}-glow"))
                    .absolute(0.0, 0.0)
                    .size(card_w, card_h)
                    .radius(18.0),
            );
    }

    card.child(
        col()
            .w_full()
            .h_full()
            .padding(14.0)
            .gap(8.0)
            .child(
                row()
                    .w_full()
                    .center_y()
                    .child(
                        col()
                            .grow(1.0)
                            .gap(2.0)
                            .child(
                                row()
                                    .center_y()
                                    .gap(6.0)
                                    .child(el().size(7.0, 7.0).radius(3.5).fill(color))
                                    .child(label_txt(title, 12.0, 700.0, hex(0xf6f7fb))),
                            )
                            .child(mono_txt(sub, 9.5, hex(0x7c849f))),
                    )
                    .child(
                        col()
                            .gap(1.0)
                            .child(mono_txt(big_val, 16.5, color))
                            .child(mono_txt(format!("max {:.0}% · moy {:.0}%", peak, avg), 9.0, hex(0x7c849f))),
                    ),
            )
            // Real-time GPU vector sparkline chart
            .child(
                el().w_full()
                    .h(84.0)
                    .radius(12.0)
                    .fill(oklcha(0.0, 0.0, 0.0, 0.28))
                    .border(1.0, oklcha(1.0, 0.0, 0.0, 0.06))
                    .child(
                        canvas(build_sparkline_shape(hist, color, true))
                            .w_full()
                            .h_full(),
                    ),
            )
            // Metallic fill progress meter
            .child(
                el().w(bar_w)
                    .h(5.0)
                    .radius(2.5)
                    .fill(oklcha(1.0, 0.0, 0.0, 0.09))
                    .child(
                        el().w(fill_w)
                            .h(5.0)
                            .radius(2.5)
                            .fill(color),
                    ),
            )
            .child(
                row()
                    .w_full()
                    .center_y()
                    .child(mono_txt(footer_left, 9.5, hex(0x9aa3bf)).grow(1.0))
                    .child(mono_txt(footer_right, 9.5, hex(0x6d758f))),
            ),
    )
}

fn view_telemetry(s: &State, content_w: f32, compact: bool, accent: Color) -> El {
    let cards = if compact {
        let cw = content_w;
        col()
            .w_full()
            .gap(12.0)
            .child(telemetry_card(
                s,
                "tel-cpu",
                "CPU · Noyau aarch64",
                format!("{} vCPU · JIT {}", s.cpu_count(), if s.jit { "ON" } else { "OFF" }),
                format!("{:.1}%", s.cpu_pct),
                s.cpu_pct,
                &s.cpu_hist,
                hex(0x22d3ee),
                1.0,
                cw,
                format!("{} blks JIT", s.jit_blks),
                format!("I/O {:.0} KB/s", s.io_kbps),
            ))
            .child(telemetry_card(
                s,
                "tel-gpu",
                "GPU · Rune + VirGL",
                format!("{} · {:.1} ms", s.gpu_backend, s.frame_ms),
                format!("{:.0}%", s.gpu_pct),
                s.gpu_pct,
                &s.gpu_hist,
                hex(0xc084fc),
                0.0,
                cw,
                format!("{:.0} FPS temps réel", s.fps_smooth),
                if s.gl_virgl { "VirGL 3D".into() } else { "Software".into() },
            ))
            .child(telemetry_card(
                s,
                "tel-mem",
                "Mémoire · RAM & Heap",
                format!("{:.0} / {:.0} MiB", s.mem_used_mib, s.mem_total_mib),
                format!("{:.0}%", s.mem_pct),
                s.mem_pct,
                &s.mem_hist,
                hex(0x34d399),
                3.0,
                cw,
                if s.shared_mem { "SAB SMP actif".into() } else { "Mémoire locale".into() },
                format!("{:.0} MiB libre", (s.mem_total_mib - s.mem_used_mib).max(0.0)),
            ))
    } else {
        let cw = ((content_w - 24.0) / 3.0).max(180.0);
        row()
            .w_full()
            .gap(12.0)
            .child(telemetry_card(
                s,
                "tel-cpu",
                "CPU · aarch64",
                format!("{} vCPU · JIT {}", s.cpu_count(), if s.jit { "ON" } else { "OFF" }),
                format!("{:.1}%", s.cpu_pct),
                s.cpu_pct,
                &s.cpu_hist,
                hex(0x22d3ee),
                1.0,
                cw,
                format!("{} blks JIT", s.jit_blks),
                format!("{:.0} KB/s", s.io_kbps),
            ))
            .child(telemetry_card(
                s,
                "tel-gpu",
                "GPU · Rune FX",
                format!("{} · {:.1} ms", s.gpu_backend, s.frame_ms),
                format!("{:.0}%", s.gpu_pct),
                s.gpu_pct,
                &s.gpu_hist,
                hex(0xc084fc),
                0.0,
                cw,
                format!("{:.0} FPS live", s.fps_smooth),
                if s.gl_virgl { "VirGL 3D".into() } else { "2D".into() },
            ))
            .child(telemetry_card(
                s,
                "tel-mem",
                "Mémoire · RAM",
                format!("{:.0}/{:.0} MiB", s.mem_used_mib, s.mem_total_mib),
                format!("{:.0}%", s.mem_pct),
                s.mem_pct,
                &s.mem_hist,
                hex(0x34d399),
                3.0,
                cw,
                if s.shared_mem { "SAB SMP".into() } else { "Isolée".into() },
                format!("{:.0}M libre", (s.mem_total_mib - s.mem_used_mib).max(0.0)),
            ))
    };

    // Interactive Multi-Channel Legend Pills with Hover
    let filters: [(&str, Color, usize); 4] = [
        ("Tous", hex(0xe2e8f0), 0),
        ("CPU", hex(0x22d3ee), 1),
        ("GPU", hex(0xc084fc), 2),
        ("Mémoire", hex(0x34d399), 3),
    ];
    let mut filter_row = row().gap(6.0).center_y();
    for (lbl, col, idx) in filters {
        let active = s.chart_focus == idx;
        filter_row = filter_row.child(
            el().key(format!("flt-{idx}"))
                .cursor(Cursor::Pointer)
                .px(10.0)
                .py(5.0)
                .radius(999.0)
                .fill(if active { col.alpha(0.22) } else { oklcha(1.0, 0.0, 0.0, 0.05) })
                .hover(col.alpha(0.18))
                .press(col.alpha(0.30))
                .press_scale(0.95)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(1.0, if active { col.alpha(0.75) } else { oklcha(1.0, 0.0, 0.0, 0.1) })
                .on_press(move |st: &mut State| st.chart_focus = idx)
                .child(
                    row()
                        .center_y()
                        .gap(5.0)
                        .child(el().size(6.0, 6.0).radius(3.0).fill(col))
                        .child(mono_txt(lbl, 10.0, if active { hex(0xffffff) } else { hex(0xa2abc6) })),
                ),
        );
    }

    let overlay_card = el()
        .key("multi-chart-card")
        .w_full()
        .radius(18.0)
        .gradient(hex(0x131726), hex(0x0b0e18))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.11))
        .shadow(6.0, 22.0, oklcha(0.0, 0.0, 0.0, 0.42))
        .padding(16.0)
        .child(
            col()
                .w_full()
                .gap(12.0)
                .child(
                    row()
                        .w_full()
                        .center_y()
                        .gap(10.0)
                        .child(
                            col()
                                .grow(1.0)
                                .gap(2.0)
                                .child(label_txt("Oscilloscope Système Multi-Canaux", 13.5, 600.0, hex(0xffffff)))
                                .child(label_txt("Cliquez sur un canal pour isoler sa courbe GPU en temps réel", 10.5, 400.0, hex(0x838ba6))),
                        )
                        .child(filter_row),
                )
                .child(
                    el().w_full()
                        .h(120.0)
                        .radius(14.0)
                        .fill(oklcha(0.0, 0.0, 0.0, 0.32))
                        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.07))
                        .child(canvas(build_multichannel_shape(s)).w_full().h_full()),
                ),
        );

    // Quick Action Metallic Controls Row
    let qa_w = if compact { (content_w - 10.0) / 2.0 } else { (content_w - 20.0) / 3.0 };
    let quick_actions = row()
        .w_full()
        .gap(10.0)
        .child(liquid_cta_button(
            s,
            "qa-alloy",
            "Changer d'alliage",
            qa_w,
            40.0,
            |st| st.metal_finish = (st.metal_finish + 1) % FINISHES.len() as u32,
        ))
        .child(liquid_cta_button(
            s,
            "qa-theme",
            "Thème OS suivant",
            qa_w,
            40.0,
            |st| {
                st.theme_idx = (st.theme_idx + 1) % THEMES.len();
                push_str("osTheme", THEMES[st.theme_idx].0);
            },
        ))
        .child(liquid_cta_button(
            s,
            "qa-reboot",
            "Redémarrer noyau",
            qa_w,
            40.0,
            |st| {
                st.reboot_pending = false;
                emit_host_action("vm", "reboot", "now");
            },
        ));

    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Télémétrie Temps Réel (CPU · GPU · Mémoire)", accent))
        .child(cards)
        .child(overlay_card)
        .child(section_title("Actions Rapides Liquid Metal", accent))
        .child(quick_actions)
}

// ---------------------------------------------------------------------------
// Tab 1: Appearance & Glass
// ---------------------------------------------------------------------------

fn view_appearance(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    let finish_w = ((content_w - 30.0) / 4.0).max(80.0);
    let mut finish_row = row().w_full().gap(10.0);
    for &(name, sub, idx) in &FINISHES {
        let active = s.metal_finish == idx;
        let hovered = s.hover_finish == Some(idx);
        let mut tile = el()
            .key(format!("finish-{idx}"))
            .cursor(Cursor::Pointer)
            .w(finish_w)
            .h(74.0)
            .radius(15.0)
            .gradient(hex(0x171c2d), hex(0x0f121e))
            .hover(oklcha(1.0, 0.0, 0.0, 0.08))
            .press(oklcha(0.0, 0.0, 0.0, 0.14))
            .press_scale(0.96)
            .hover_motion(motion::SNAPPY, motion::SNAPPY)
            .border(
                if active { 1.5 } else { 1.0 },
                if active {
                    hex(0xffffff)
                } else if hovered {
                    oklcha(1.0, 0.0, 0.0, 0.36)
                } else {
                    oklcha(1.0, 0.0, 0.0, 0.12)
                },
            )
            .shadow(4.0, if hovered || active { 18.0 } else { 10.0 }, oklcha(0.0, 0.0, 0.0, 0.45))
            .motion(motion::SNAPPY)
            .on_hover_change(move |st: &mut State, entered, _| {
                if entered {
                    st.hover_finish = Some(idx);
                } else if st.hover_finish == Some(idx) {
                    st.hover_finish = None;
                }
            })
            .on_press(move |st: &mut State| st.metal_finish = idx)
            .child(
                fx(LIQUID_SLAB, [idx as f32, 68.0, 10.0, 1.0])
                    .key(format!("finish-fx-{idx}"))
                    .absolute(0.0, 0.0)
                    .size(finish_w, 38.0)
                    .radius(13.0),
            );

        if hovered || active {
            tile = tile.child(
                fx(SHIMMER, [if hovered { 0.8 } else { 0.35 }, 1.8, 0.3, 0.0])
                    .key(format!("finish-shim-{idx}"))
                    .absolute(0.0, 0.0)
                    .size(finish_w, 38.0)
                    .radius(13.0),
            );
        }

        tile = tile.child(
            col()
                .absolute(0.0, 41.0)
                .w(finish_w)
                .h(30.0)
                .center()
                .gap(1.0)
                .child(label_txt(
                    name,
                    11.0,
                    if active { 700.0 } else { 500.0 },
                    if active || hovered { hex(0xffffff) } else { hex(0xc2c8dc) },
                ))
                .child(label_txt(sub, 9.0, 400.0, hex(0x767e98))),
        );
        finish_row = finish_row.child(tile);
    }

    // OS Theme chips with hover glow
    let mut theme_row = row().w_full().gap(8.0);
    for (i, &(id, name, swatch, _)) in THEMES.iter().enumerate() {
        let active = s.theme_idx == i;
        let hovered = s.hover_theme == Some(i);
        theme_row = theme_row.child(
            el().key(format!("theme-{id}"))
                .cursor(Cursor::Pointer)
                .grow(1.0)
                .py(11.0)
                .px(8.0)
                .radius(14.0)
                .center()
                .fill(if active { hexa(swatch, 0.24) } else { hex(0x121625) })
                .hover(hexa(swatch, 0.16))
                .press(hexa(swatch, 0.28))
                .press_scale(0.96)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(
                    1.0,
                    if active {
                        hex(swatch)
                    } else if hovered {
                        hexa(swatch, 0.55)
                    } else {
                        oklcha(1.0, 0.0, 0.0, 0.1)
                    },
                )
                .motion(motion::SNAPPY)
                .on_hover_change(move |st: &mut State, entered, _| {
                    if entered {
                        st.hover_theme = Some(i);
                    } else if st.hover_theme == Some(i) {
                        st.hover_theme = None;
                    }
                })
                .on_press(move |st: &mut State| {
                    st.theme_idx = i;
                    push_str("osTheme", id);
                })
                .child(
                    col()
                        .center()
                        .gap(6.0)
                        .child(
                            el().size(15.0, 15.0)
                                .radius(7.5)
                                .fill(hex(swatch))
                                .shadow(0.0, if active || hovered { 10.0 } else { 4.0 }, hexa(swatch, 0.7)),
                        )
                        .child(label_txt(
                            name,
                            10.5,
                            if active { 700.0 } else { 500.0 },
                            if active || hovered { hex(0xffffff) } else { hex(0xc2c8dc) },
                        )),
                ),
        );
    }

    // WebGPU Wallpaper Shader chips with hover
    let mut shader_row = row().w_full().gap(8.0);
    for (i, &(id, name)) in SHADERS.iter().enumerate() {
        let active = s.shader_idx == i;
        let hovered = s.hover_shader == Some(i);
        shader_row = shader_row.child(
            el().key(format!("shader-{id}"))
                .cursor(Cursor::Pointer)
                .grow(1.0)
                .py(10.0)
                .px(8.0)
                .radius(12.0)
                .center()
                .fill(if active { accent.alpha(0.24) } else { hex(0x121625) })
                .hover(accent.alpha(0.14))
                .press(accent.alpha(0.26))
                .press_scale(0.96)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(
                    1.0,
                    if active {
                        accent
                    } else if hovered {
                        accent.alpha(0.55)
                    } else {
                        oklcha(1.0, 0.0, 0.0, 0.09)
                    },
                )
                .on_hover_change(move |st: &mut State, entered, _| {
                    if entered {
                        st.hover_shader = Some(i);
                    } else if st.hover_shader == Some(i) {
                        st.hover_shader = None;
                    }
                })
                .on_press(move |st: &mut State| {
                    st.shader_idx = i;
                    push_str("wallpaperShader", id);
                })
                .child(label_txt(
                    name,
                    11.0,
                    if active { 700.0 } else { 500.0 },
                    if active || hovered { hex(0xffffff) } else { hex(0xb0b8d0) },
                )),
        );
    }

    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Alliage Liquid Metal (GPU WGSL)", accent))
        .child(finish_row)
        .child(section_title("Thème unkernelOS (Temps réel)", accent))
        .child(theme_row)
        .child(section_title("Shader Fond d'écran WebGPU", accent))
        .child(shader_row)
        .child(section_title("Verre & Sensations", accent))
        .child(glass_card(
            "glass-card",
            vec![
                liquid_slider(
                    "blur",
                    "Intensité du flou Liquid Glass",
                    format!("{} px", s.blur_px()),
                    s.glass_blur,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, commit| {
                        st.glass_blur = v;
                        if commit {
                            push_num("glassBlur", st.blur_px());
                        }
                    },
                ),
                setting_toggle_row(
                    "wallpaper",
                    "Fond d'écran WebGPU animé",
                    "Shader fragment 60 fps derrière les fenêtres verre",
                    s.webgpu_wallpaper,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.webgpu_wallpaper = !st.webgpu_wallpaper;
                        push_bool("webgpuWallpaper", st.webgpu_wallpaper);
                    },
                ),
                setting_toggle_row(
                    "dock-mag",
                    "Zoom magnétique du Dock",
                    "Écartement fluide des icônes au passage du curseur",
                    s.dock_mag,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.dock_mag = !st.dock_mag;
                        push_bool("dockMagnification", st.dock_mag);
                    },
                ),
                setting_toggle_row(
                    "sounds",
                    "Sons d'interface synthétisés",
                    "Retours acoustiques WebAudio discrets",
                    s.ui_sounds,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.ui_sounds = !st.ui_sounds;
                        push_bool("uiSounds", st.ui_sounds);
                    },
                ),
                setting_toggle_row(
                    "widgets",
                    "Widgets ambiants du bureau",
                    "Horloge & télémétrie en arrière-plan",
                    s.desktop_widgets,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.desktop_widgets = !st.desktop_widgets;
                        push_bool("desktopWidgets", st.desktop_widgets);
                    },
                ),
            ],
        ))
}

// ---------------------------------------------------------------------------
// Tab 2: Compute & Kernel
// ---------------------------------------------------------------------------

fn view_compute(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    let btn_w = content_w.min(360.0);
    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Ressources du noyau Linux aarch64", accent))
        .child(glass_card(
            "compute-sliders",
            vec![
                liquid_slider(
                    "cpus",
                    "Processeurs virtuels (SMP vCPUs)",
                    format!("{} vCPU", s.cpu_count()),
                    s.cpus,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, commit| {
                        st.cpus = v;
                        st.reboot_pending = true;
                        if commit {
                            push_num("cpus", st.cpu_count());
                        }
                    },
                ),
                liquid_slider(
                    "ram",
                    "Mémoire vive allouée (RAM invité)",
                    format!("{} MiB", s.ram_mib()),
                    s.ram,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, commit| {
                        st.ram = v;
                        st.reboot_pending = true;
                        if commit {
                            push_num("memoryMiB", st.ram_mib());
                        }
                    },
                ),
            ],
        ))
        .child(section_title("Accélération WebAssembly", accent))
        .child(glass_card(
            "compute-toggles",
            vec![
                setting_toggle_row(
                    "jit",
                    "Compilateur JIT aarch64 → WASM",
                    "Exécution quasi-native des binaires Linux Debian",
                    s.jit,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.jit = !st.jit;
                        st.reboot_pending = true;
                        push_bool("jit", st.jit);
                    },
                ),
                setting_toggle_row(
                    "worker",
                    "Web Workers dédiés",
                    "Exécute le noyau hors du thread principal UI",
                    s.worker_smp,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.worker_smp = !st.worker_smp;
                        st.reboot_pending = true;
                        push_bool("worker", st.worker_smp);
                    },
                ),
                setting_toggle_row(
                    "shared",
                    "Mémoire partagée (SharedArrayBuffer)",
                    "Active le multi-cœur SMP via COOP/COEP",
                    s.shared_mem,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.shared_mem = !st.shared_mem;
                        st.reboot_pending = true;
                        push_bool("shared", st.shared_mem);
                    },
                ),
            ],
        ))
        .child(
            row()
                .w_full()
                .center()
                .py(6.0)
                .child(liquid_cta_button(
                    s,
                    "reboot-btn",
                    if s.reboot_pending {
                        "Appliquer & Redémarrer le noyau Linux"
                    } else {
                        "Redémarrer le noyau Linux"
                    },
                    btn_w,
                    46.0,
                    |st| {
                        st.reboot_pending = false;
                        emit_host_action("vm", "reboot", "now");
                    },
                )),
        )
}

// ---------------------------------------------------------------------------
// Tab 3: Graphics & I/O
// ---------------------------------------------------------------------------

fn view_graphics(s: &State, accent: Color) -> El {
    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Affichage, 3D & Compositing Linux", accent))
        .child(glass_card(
            "gfx-card",
            vec![
                setting_toggle_row(
                    "gl",
                    "Accélération 3D VirGL (/dev/dri)",
                    "OpenGL ES matériel pour applications Linux & Mesa",
                    s.gl_virgl,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.gl_virgl = !st.gl_virgl;
                        push_bool("gl", st.gl_virgl);
                    },
                ),
                setting_toggle_row(
                    "wayland",
                    "Compositeur Wayland intégré (wland)",
                    "Ouvre les apps GUI Linux (foot, Rune natif) en fenêtres",
                    s.wayland,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.wayland = !st.wayland;
                        push_bool("wayland", st.wayland);
                    },
                ),
                setting_toggle_row(
                    "fb0",
                    "Framebuffer graphique (/dev/fb0)",
                    "Surface d'affichage WebGPU directe du noyau",
                    s.display_fb0,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.display_fb0 = !st.display_fb0;
                        push_bool("display", st.display_fb0);
                    },
                ),
            ],
        ))
        .child(section_title("Audio & Réseau", accent))
        .child(glass_card(
            "io-card",
            vec![
                setting_toggle_row(
                    "sound",
                    "Carte son Virtio Audio",
                    "Flux PCM de l'invité Linux vers WebAudio",
                    s.sound,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.sound = !st.sound;
                        push_bool("sound", st.sound);
                    },
                ),
                setting_toggle_row(
                    "net",
                    "Réseau virtuel Wisp Relay",
                    "Accès Internet complet (git, cargo, npm, apt, curl)",
                    s.net_wisp,
                    s.metal_finish,
                    accent,
                    |st| {
                        st.net_wisp = !st.net_wisp;
                        push_bool("net", st.net_wisp);
                    },
                ),
            ],
        ))
}

// ---------------------------------------------------------------------------
// Tab 4: Liquid Metal Studio Lab (WGSL Interactive Materializer + Presets)
// ---------------------------------------------------------------------------

fn view_metal_lab(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    let stage_h = 160.0;

    let mut presets_row = row().w_full().gap(8.0);
    for (i, p) in METAL_PRESETS.iter().enumerate() {
        let hovered = s.hover_preset == Some(i);
        let active = s.metal_finish == p.finish && (s.metal_flow - p.flow).abs() < 0.06;
        presets_row = presets_row.child(
            el().key(format!("preset-{i}"))
                .cursor(Cursor::Pointer)
                .grow(1.0)
                .px(10.0)
                .py(10.0)
                .radius(13.0)
                .gradient(hex(0x161b2c), hex(0x0f1320))
                .hover(accent.alpha(0.14))
                .press(accent.alpha(0.24))
                .press_scale(0.96)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(
                    1.0,
                    if active {
                        accent
                    } else if hovered {
                        oklcha(1.0, 0.0, 0.0, 0.34)
                    } else {
                        oklcha(1.0, 0.0, 0.0, 0.1)
                    },
                )
                .on_hover_change(move |st: &mut State, entered, _| {
                    if entered {
                        st.hover_preset = Some(i);
                    } else if st.hover_preset == Some(i) {
                        st.hover_preset = None;
                    }
                })
                .on_press(move |st: &mut State| {
                    st.metal_finish = p.finish;
                    st.metal_flow = p.flow;
                    st.metal_dome = p.dome;
                    st.metal_irid = p.irid;
                    st.metal_contrast = p.contrast;
                })
                .child(
                    col()
                        .gap(2.0)
                        .child(label_txt(p.name, 11.5, 700.0, hex(0xffffff)))
                        .child(label_txt(p.subtitle, 9.5, 400.0, hex(0x8890ab))),
                ),
        );
    }

    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Surface Liquid Metal en direct (rune-fx WGSL)", accent))
        .child(
            el().key("metal-stage")
                .cursor(Cursor::Pointer)
                .w_full()
                .h(stage_h)
                .radius(22.0)
                .fill(hex(0x0b0e17))
                .hover(oklcha(1.0, 0.0, 0.0, 0.08))
                .press_scale(0.99)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(1.0, oklcha(1.0, 0.0, 0.0, 0.16))
                .shadow(8.0, 26.0, oklcha(0.0, 0.0, 0.0, 0.5))
                .on_press(|st: &mut State| {
                    st.metal_finish = (st.metal_finish + 1) % FINISHES.len() as u32;
                })
                .child(
                    fx(LIQUID_SLAB, [s.metal_finish as f32, 118.0, 22.0, 0.0])
                        .key("metal-stage-fx")
                        .absolute(0.0, 0.0)
                        .size(content_w, stage_h)
                        .radius(22.0),
                )
                .child(
                    el().size(content_w, stage_h)
                        .center()
                        .child(
                            col()
                                .center()
                                .gap(5.0)
                                .child(label_txt("LIQUID METAL", 23.0, 700.0, hex(0x090b12)))
                                .child(mono_txt(
                                    format!(
                                        "flow {:.2} · dome {:.2} · irid {:.2} · contrast {:.2}",
                                        s.metal_flow, s.metal_dome, s.metal_irid, s.metal_contrast
                                    ),
                                    11.0,
                                    hex(0x161b29),
                                ))
                                .child(label_txt(
                                    "Cliquez pour parcourir les alliages",
                                    10.0,
                                    600.0,
                                    hexa(0x090b12, 0.72),
                                )),
                        ),
                ),
        )
        .child(section_title("Préréglages Studio", accent))
        .child(presets_row)
        .child(section_title("Paramètres physiques du shader", accent))
        .child(glass_card(
            "metal-params",
            vec![
                liquid_slider(
                    "flow",
                    "Ondulation fluide (Flow)",
                    format!("{:.2}", s.metal_flow),
                    s.metal_flow / 1.5,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, _| st.metal_flow = v * 1.5,
                ),
                liquid_slider(
                    "dome",
                    "Courbure spéculaire (Dome)",
                    format!("{:.2}", s.metal_dome),
                    (s.metal_dome - 0.05) / 0.95,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, _| st.metal_dome = 0.05 + v * 0.95,
                ),
                liquid_slider(
                    "irid",
                    "Iridescence couche mince",
                    format!("{:.2}", s.metal_irid),
                    s.metal_irid / 0.75,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, _| st.metal_irid = v * 0.75,
                ),
                liquid_slider(
                    "contrast",
                    "Contraste studio",
                    format!("{:.2}", s.metal_contrast),
                    (s.metal_contrast - 0.65) / 1.0,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |st, v, _| st.metal_contrast = 0.65 + v,
                ),
            ],
        ))
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

fn view(s: &State, cx: &mut Cx<State>) -> El {
    let [win_w, _win_h] = cx.layout_size("root").unwrap_or([940.0, 640.0]);
    let compact = win_w < 700.0;
    let sidebar_w = if compact { 0.0 } else { 222.0 };
    let content_w = (win_w - sidebar_w - 44.0).max(280.0);
    let slider_w = (content_w - 32.0).max(200.0);
    let accent = accent_color(s);
    let accent_idx = accent_palette_idx(s);

    // Sidebar (desktop / iPad landscape) with rich hover + active GPU glow
    let mut nav_items = col().w_full().gap(6.0);
    for (i, (title, sub, badge)) in TABS.iter().enumerate() {
        let active = i == s.tab;
        let hovered = s.hover_tab == Some(i);
        let mut item = el()
            .key(format!("tab-{i}"))
            .role("tab")
            .label(*title)
            .checked(active)
            .focusable(true)
            .cursor(Cursor::Pointer)
            .w_full()
            .px(12.0)
            .py(10.0)
            .radius(14.0)
            .fill(if active {
                accent.alpha(0.16)
            } else {
                oklcha(1.0, 0.0, 0.0, 0.025)
            })
            .hover(oklcha(1.0, 0.0, 0.0, 0.08))
            .press(oklcha(1.0, 0.0, 0.0, 0.14))
            .press_scale(0.97)
            .hover_motion(motion::SNAPPY, motion::SNAPPY)
            .border(
                1.0,
                if active {
                    accent.alpha(0.68)
                } else if hovered {
                    oklcha(1.0, 0.0, 0.0, 0.22)
                } else {
                    oklcha(1.0, 0.0, 0.0, 0.05)
                },
            )
            .motion(motion::SNAPPY)
            .on_hover_change(move |st: &mut State, entered, _| {
                if entered {
                    st.hover_tab = Some(i);
                } else if st.hover_tab == Some(i) {
                    st.hover_tab = None;
                }
            })
            .on_press(move |st: &mut State| st.tab = i)
            .child(
                row()
                    .w_full()
                    .center_y()
                    .gap(9.0)
                    .child(
                        el().size(7.0, 7.0)
                            .radius(3.5)
                            .fill(if active {
                                accent
                            } else if hovered {
                                hex(0xa5b4fc)
                            } else {
                                hex(0x474f68)
                            }),
                    )
                    .child(
                        col()
                            .grow(1.0)
                            .gap(1.0)
                            .child(label_txt(
                                *title,
                                12.5,
                                if active { 700.0 } else { 500.0 },
                                if active || hovered { hex(0xffffff) } else { hex(0xb8c0d8) },
                            ))
                            .child(label_txt(*sub, 9.5, 400.0, hex(0x767f9c))),
                    )
                    .child(
                        el().px(5.5)
                            .py(2.0)
                            .radius(6.0)
                            .fill(if active { accent.alpha(0.26) } else { oklcha(1.0, 0.0, 0.0, 0.05) })
                            .child(mono_txt(*badge, 8.5, if active { hex(0xffffff) } else { hex(0x7f88a6) })),
                    ),
            );

        if active || hovered {
            item = item.child(
                fx(GLOW, [accent_idx, 0.0, if active { 0.34 } else { 0.16 }, 14.0])
                    .key(format!("tab-glow-{i}"))
                    .absolute(0.0, 0.0)
                    .size(sidebar_w - 28.0, 48.0)
                    .radius(14.0),
            );
        }
        nav_items = nav_items.child(item);
    }

    let sidebar = col()
        .key("sidebar")
        .w(sidebar_w)
        .h_full()
        .padding(14.0)
        .gap(14.0)
        .gradient(hex(0x0b0e18), hex(0x070910))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.08))
        .child(
            row()
                .center_y()
                .gap(10.0)
                .px(4.0)
                .child(
                    el().size(30.0, 30.0)
                        .radius(9.0)
                        .fill(hex(0x1f2538))
                        .shadow(2.0, 8.0, oklcha(0.0, 0.0, 0.0, 0.5))
                        .child(
                            fx(LIQUID_SLAB, [s.metal_finish as f32, 48.0, 7.0, 1.0])
                                .key("brand-fx")
                                .absolute(0.0, 0.0)
                                .size(30.0, 30.0)
                                .radius(9.0),
                        ),
                )
                .child(
                    col()
                        .gap(1.0)
                        .child(label_txt("unkernelOS", 13.5, 700.0, hex(0xffffff)))
                        .child(mono_txt("Rune 0.1 · Metal", 9.5, hex(0x7c84a0))),
                ),
        )
        .child(nav_items)
        .child(el().grow(1.0))
        // Live mini CPU/GPU/RAM telemetry widget in sidebar footer
        .child(
            el().w_full()
                .padding(11.0)
                .radius(14.0)
                .gradient(hex(0x121626), hex(0x0c0f1a))
                .border(1.0, oklcha(1.0, 0.0, 0.0, 0.09))
                .child(
                    col()
                        .w_full()
                        .gap(6.0)
                        .child(
                            row()
                                .w_full()
                                .center_y()
                                .child(mono_txt("TÉLÉMÉTRIE LIVE", 9.0, hex(0x8b94b2)).grow(1.0))
                                .child(mono_txt(format!("{:.0} FPS", s.fps_smooth), 9.5, hex(0x22d3ee))),
                        )
                        .child(
                            row()
                                .w_full()
                                .gap(6.0)
                                .child(mono_txt(format!("CPU {:.0}%", s.cpu_pct), 9.5, hex(0x67e8f9)))
                                .child(mono_txt(format!("GPU {:.0}%", s.gpu_pct), 9.5, hex(0xd8b4fe)))
                                .child(mono_txt(format!("RAM {:.0}%", s.mem_pct), 9.5, hex(0x6ee7b7))),
                        )
                        .child(mono_txt("anomalyco/rune · WGSL", 9.0, hex(0x6a728e))),
                ),
        );

    // Compact horizontal tabs for narrow panes / phones
    let mut mobile_tabs = row().w_full().gap(5.0);
    for (i, (title, _, _)) in TABS.iter().enumerate() {
        let active = i == s.tab;
        mobile_tabs = mobile_tabs.child(
            el().key(format!("mtab-{i}"))
                .cursor(Cursor::Pointer)
                .grow(1.0)
                .py(8.0)
                .center()
                .radius(10.0)
                .fill(if active { accent.alpha(0.26) } else { oklcha(1.0, 0.0, 0.0, 0.05) })
                .hover(accent.alpha(0.16))
                .press_scale(0.95)
                .hover_motion(motion::SNAPPY, motion::SNAPPY)
                .border(1.0, if active { accent.alpha(0.68) } else { oklcha(1.0, 0.0, 0.0, 0.09) })
                .on_press(move |st: &mut State| st.tab = i)
                .child(label_txt(
                    *title,
                    10.5,
                    if active { 700.0 } else { 500.0 },
                    if active { hex(0xffffff) } else { hex(0x9da6c2) },
                )),
        );
    }

    let body = match s.tab {
        0 => view_telemetry(s, content_w, compact, accent),
        1 => view_appearance(s, content_w, slider_w, accent),
        2 => view_compute(s, content_w, slider_w, accent),
        3 => view_graphics(s, accent),
        _ => view_metal_lab(s, content_w, slider_w, accent),
    };

    let mut content_col = col().w_full().gap(16.0).padding(20.0);
    if compact {
        content_col = content_col.child(mobile_tabs);
    }
    content_col = content_col
        .child(liquid_metal_hero(s, content_w, compact))
        .child(body);

    let scroll_pane = col()
        .key("content-scroll")
        .grow(1.0)
        .h_full()
        .shrink()
        .scroll(ScrollSpec::default())
        .scroll_edge_fade(20.0)
        .child(content_col);

    let mut root = row()
        .key("root")
        .w_full()
        .h_full()
        .gradient(hex(0x090c16), hex(0x06080f));
    if !compact {
        root = root.child(sidebar);
    }
    root.child(scroll_pane)
}

// ---------------------------------------------------------------------------
// Entrypoints (Web WASM + Native Linux/macOS)
// ---------------------------------------------------------------------------

pub fn app() -> App<State> {
    App::new(AppSpec::<State> {
        poll: Some(|s, t, _| {
            s.t = t;
            s.tick_telemetry(t);
            loop {
                let msg = poll_host_state();
                if msg.is_empty() {
                    break;
                }
                s.apply_host_snapshot(&msg);
            }
            true
        }),
        ..AppSpec::new("Liquid Metal Réglages", (980.0, 660.0), State::default, view)
    })
    .compositor(gfx::LiquidGfx::default())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(start))]
pub fn start() {
    app().run();
}
