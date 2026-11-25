//! Liquid Metal unkernelOS Réglages — Native Rust GPU Settings App powered by `anomalyco/rune` + `rune-fx`.
//!
//! Runs natively on macOS/Linux/Wayland AND in the browser via WebAssembly + WebGPU/WebGL2,
//! syncing live OS settings (themes, WebGPU wallpaper shaders, glass blur, vCPUs, RAM,
//! VirGL, Wayland, audio, dock magnification) directly with the unkernelOS desktop!

#![forbid(unsafe_code)]

pub mod gfx;

use rune::color::Color;
use rune::tok::motion;
use rune::{App, AppSpec, Cx, Drag, El, Phase, ScrollSpec, Spring, TextStyle, Tx, col, el, oklch, oklcha, row, text};

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
// Catalogs (mirrors unkernelOS schema)
// ---------------------------------------------------------------------------

const TABS: [(&str, &str); 4] = [
    ("Apparence", "Thème, Verre & Métal"),
    ("Calcul & Noyau", "vCPU, RAM & JIT"),
    ("Graphisme & I/O", "VirGL, Wayland, Audio"),
    ("Studio Métal", "Shader Liquid Metal GPU"),
];

const THEMES: [(&str, &str, u32); 5] = [
    ("obsidian-aurora", "Obsidian Aurora", 0x8b5cf6),
    ("liquid-glass", "Liquid Glass", 0x38bdf8),
    ("cyberpunk-neon", "Cyberpunk Neon", 0xf43f5e),
    ("nordic-frost", "Nordic Frost", 0x88c0d0),
    ("warm-amber", "Warm Amber", 0xf59e0b),
];

const SHADERS: [(&str, &str); 5] = [
    ("aurora", "Aurora"),
    ("liquid-prism", "Liquid Prism"),
    ("cyber-grid", "Cyber Grid"),
    ("nordic-borealis", "Borealis"),
    ("solar-ember", "Solar Ember"),
];

const FINISHES: [(&str, u32); 4] = [
    ("Chrome", 0),
    ("Liquid Gold", 1),
    ("Rose Titanium", 2),
    ("Gunmetal", 3),
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct State {
    pub t: f64,
    pub tab: usize,
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
    // Live telemetry string
    pub status_line: String,
    pub reboot_pending: bool,
}

impl Default for State {
    fn default() -> Self {
        Self {
            t: 0.0,
            tab: 0,
            theme_idx: 0,
            shader_idx: 0,
            metal_finish: 0,
            glass_blur: 0.625, // 28px
            webgpu_wallpaper: true,
            dock_mag: true,
            ui_sounds: true,
            desktop_widgets: true,
            cpus: 0.43, // 4 vCPUs
            ram: 0.6,   // 2048 MiB
            jit: true,
            worker_smp: true,
            shared_mem: true,
            gl_virgl: true,
            wayland: true,
            display_fb0: true,
            sound: true,
            net_wisp: true,
            metal_flow: 0.72,
            metal_dome: 0.58,
            metal_irid: 0.22,
            metal_contrast: 1.12,
            status_line: "Linux 7.x Debian · WebGPU Ready".to_string(),
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
        let steps = (self.ram * 10.0).round() as i32; // 512 + steps * 256 -> 512..3072
        512 + steps * 256
    }

    /// Apply pipe-delimited state snapshot from host: `key=value;key=value;...`
    fn apply_host_snapshot(&mut self, msg: &str) {
        for part in msg.split(';') {
            let Some((k, v)) = part.split_once('=') else { continue };
            match k {
                "osTheme" => {
                    if let Some(i) = THEMES.iter().position(|(id, _, _)| *id == v) {
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
                _ => {}
            }
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

fn label_txt(s: impl Into<String>, size: f32, weight: f32, color: Color) -> El {
    text(s).font(TextStyle::new(size, weight)).color(color)
}

fn mono_txt(s: impl Into<String>, size: f32, color: Color) -> El {
    text(s).font(TextStyle::new(size, 500.0).mono()).color(color)
}

// ---------------------------------------------------------------------------
// Reusable Liquid Metal Controls
// ---------------------------------------------------------------------------

fn metal_switch(
    key: &'static str,
    on: bool,
    finish: u32,
    accent: Color,
    on_toggle: impl Fn(&mut State) + 'static,
) -> El {
    let (w, h, k) = (48.0, 26.0, 20.0);
    let inset = (h - k) / 2.0;
    let knob_x = if on { w - k - inset } else { inset };

    el().key(key)
        .role("switch")
        .label(key)
        .checked(on)
        .focusable(true)
        .size(w, h)
        .radius(h / 2.0)
        .fill(if on { accent } else { oklcha(1.0, 0.0, 0.0, 0.12) })
        .border(1.0, oklcha(1.0, 0.0, 0.0, if on { 0.35 } else { 0.12 }))
        .motion(motion::SNAPPY)
        .on_press(on_toggle)
        .child(
            el().key(format!("{key}-knob"))
                .size(k, k)
                .radius(k / 2.0)
                .absolute(knob_x, inset)
                .fill(hex(0xf4f6fa))
                .shadow(1.5, 5.0, oklcha(0.0, 0.0, 0.0, 0.55))
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
        .child(
            col()
                .grow(1.0)
                .gap(2.0)
                .child(label_txt(title, 13.5, 500.0, hex(0xf4f4f8)))
                .child(label_txt(subtitle, 11.0, 400.0, hex(0x8e93a6))),
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
    let puck = 22.0;
    let travel = (track_w - puck).max(60.0);
    let to_v = move |x: f32| ((x - puck / 2.0) / travel).clamp(0.0, 1.0);
    let clamped = val.clamp(0.0, 1.0);

    col()
        .key(format!("slider-wrap-{key}"))
        .w_full()
        .px(16.0)
        .py(11.0)
        .gap(8.0)
        .child(
            row()
                .w_full()
                .center_y()
                .child(label_txt(title, 13.0, 500.0, hex(0xf4f4f8)).grow(1.0))
                .child(
                    el().px(8.0)
                        .py(3.0)
                        .radius(8.0)
                        .fill(oklcha(1.0, 0.0, 0.0, 0.07))
                        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.1))
                        .child(mono_txt(value_label, 11.0, hex(0x67e8f9))),
                ),
        )
        .child(
            el().key(key)
                .role("slider")
                .label(title)
                .range_value(f64::from(clamped), 0.0, 1.0)
                .size(track_w, puck)
                .motion(Spring::new(0.28, 0.15))
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
                        .size(travel, 4.0)
                        .radius(2.0)
                        .fill(oklcha(1.0, 0.0, 0.0, 0.12))
                        .absolute(puck / 2.0, puck / 2.0 - 2.0),
                )
                .child(
                    el().key(format!("{key}-fill"))
                        .size(travel * clamped, 4.0)
                        .radius(2.0)
                        .fill(accent)
                        .absolute(puck / 2.0, puck / 2.0 - 2.0),
                )
                .child(
                    el().key(format!("{key}-puck"))
                        .size(puck, puck)
                        .radius(puck / 2.0)
                        .absolute(travel * clamped, 0.0)
                        .fill(hex(0xeef2f7))
                        .shadow(2.0, 7.0, oklcha(0.0, 0.0, 0.0, 0.6))
                        .child(
                            fx(LIQUID_SLAB, [finish as f32, 44.0, 8.0, 1.0])
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
        .fill(oklch(0.145, 0.012, 265.0))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.1));
    for (idx, child) in children.into_iter().enumerate() {
        if idx > 0 {
            c = c.child(el().w_full().h(1.0).fill(oklcha(1.0, 0.0, 0.0, 0.06)));
        }
        c = c.child(child);
    }
    c
}

fn section_title(title: &str) -> El {
    label_txt(title.to_uppercase(), 10.5, 600.0, hex(0x7c8299))
}

// ---------------------------------------------------------------------------
// Hero Banner (Live GPU Liquid Metal)
// ---------------------------------------------------------------------------

fn liquid_metal_hero(s: &State, width: f32) -> El {
    let accent = accent_color(s);
    let h = 116.0;
    let finish_name = FINISHES[s.metal_finish as usize % FINISHES.len()].0;

    el().key("hero-banner")
        .w_full()
        .h(h)
        .radius(20.0)
        .fill(hex(0x0b0e18))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.14))
        // Liquid Metal metallic rim border
        .child(
            fx(LIQUID_BORDER, [s.metal_finish as f32, 2.5, 0.0, 0.0])
                .key("hero-rim")
                .absolute(0.0, 0.0)
                .size(width, h)
                .radius(20.0),
        )
        // Subtle ambient aurora glow inside hero
        .child(
            fx(AURORA, [0.32, 0.35, 0.0, 0.0])
                .key("hero-aurora")
                .absolute(0.0, 0.0)
                .size(width, h)
                .radius(20.0),
        )
        .child(
            row()
                .w_full()
                .h_full()
                .px(20.0)
                .center_y()
                .gap(18.0)
                // Molten Liquid Metal Emblem Medallion
                .child(
                    el().key("hero-medallion")
                        .size(68.0, 68.0)
                        .radius(20.0)
                        .fill(hex(0x1b2030))
                        .shadow(4.0, 16.0, oklcha(0.0, 0.0, 0.0, 0.6))
                        .child(
                            fx(LIQUID_SLAB, [s.metal_finish as f32, 85.0, 16.0, 1.0])
                                .key("hero-medallion-fx")
                                .absolute(0.0, 0.0)
                                .size(68.0, 68.0)
                                .radius(20.0),
                        )
                        .child(
                            el().size(68.0, 68.0)
                                .center()
                                .child(label_txt("U", 28.0, 700.0, hex(0x090b12))),
                        ),
                )
                .child(
                    col()
                        .grow(1.0)
                        .gap(4.0)
                        .child(
                            row()
                                .center_y()
                                .gap(8.0)
                                .child(label_txt("Liquid Metal Réglages", 18.0, 700.0, hex(0xffffff)))
                                .child(
                                    el().px(8.0)
                                        .py(2.0)
                                        .radius(999.0)
                                        .fill(accent.alpha(0.22))
                                        .border(1.0, accent.alpha(0.5))
                                        .child(mono_txt("RUST RUNE GPU", 9.5, hex(0xe9d5ff))),
                                ),
                        )
                        .child(label_txt(
                            format!("Finition {finish_name} · {} · {} vCPU · {} MiB RAM", THEMES[s.theme_idx].1, s.cpu_count(), s.ram_mib()),
                            12.0,
                            400.0,
                            hex(0xa8b0c6),
                        ))
                        .child(mono_txt(s.status_line.clone(), 10.5, hex(0x67e8f9))),
                ),
        )
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

fn view(s: &State, cx: &mut Cx<State>) -> El {
    let [win_w, _win_h] = cx.layout_size("root").unwrap_or([880.0, 600.0]);
    let compact = win_w < 680.0;
    let sidebar_w = if compact { 0.0 } else { 210.0 };
    let content_w = (win_w - sidebar_w - 48.0).max(280.0);
    let slider_w = (content_w - 32.0).max(200.0);
    let accent = accent_color(s);

    // Sidebar (desktop / iPad landscape)
    let mut nav_items = col().w_full().gap(6.0);
    for (i, (title, sub)) in TABS.iter().enumerate() {
        let active = i == s.tab;
        let mut item = el()
            .key(format!("tab-{i}"))
            .role("tab")
            .label(*title)
            .checked(active)
            .focusable(true)
            .w_full()
            .px(12.0)
            .py(10.0)
            .radius(14.0)
            .fill(if active { oklcha(1.0, 0.0, 0.0, 0.1) } else { oklcha(1.0, 0.0, 0.0, 0.02) })
            .border(1.0, if active { accent.alpha(0.55) } else { oklcha(1.0, 0.0, 0.0, 0.05) })
            .motion(motion::SNAPPY)
            .on_press(move |s: &mut State| s.tab = i)
            .child(
                row()
                    .w_full()
                    .center_y()
                    .gap(10.0)
                    .child(
                        el().size(8.0, 8.0)
                            .radius(4.0)
                            .fill(if active { accent } else { hex(0x474d61) }),
                    )
                    .child(
                        col()
                            .gap(1.0)
                            .child(label_txt(*title, 12.5, if active { 600.0 } else { 500.0 }, if active { hex(0xffffff) } else { hex(0xb8bed0) }))
                            .child(label_txt(*sub, 10.0, 400.0, hex(0x72788e))),
                    ),
            );
        if active {
            item = item.child(
                fx(GLOW, [0.0, 0.0, 0.35, 14.0])
                    .key(format!("tab-glow-{i}"))
                    .absolute(0.0, 0.0)
                    .size(sidebar_w - 28.0, 46.0)
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
        .fill(hex(0x090b12))
        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.07))
        .child(
            row()
                .center_y()
                .gap(10.0)
                .px(4.0)
                .child(
                    el().size(30.0, 30.0)
                        .radius(9.0)
                        .fill(hex(0x23283a))
                        .child(
                            fx(LIQUID_SLAB, [s.metal_finish as f32, 54.0, 8.0, 1.0])
                                .key("side-orb-fx")
                                .absolute(0.0, 0.0)
                                .size(30.0, 30.0)
                                .radius(9.0),
                        ),
                )
                .child(
                    col()
                        .gap(1.0)
                        .child(label_txt("unkernelOS", 13.5, 700.0, hex(0xffffff)))
                        .child(mono_txt("Rune 0.1 · Metal", 9.5, hex(0x7c8299))),
                ),
        )
        .child(nav_items)
        .child(el().grow(1.0))
        .child(
            el().w_full()
                .padding(10.0)
                .radius(12.0)
                .fill(oklcha(1.0, 0.0, 0.0, 0.03))
                .border(1.0, oklcha(1.0, 0.0, 0.0, 0.07))
                .child(
                    col()
                        .gap(3.0)
                        .child(mono_txt("anomalyco/rune", 10.0, hex(0xa78bfa)))
                        .child(label_txt("Rendu 100% Rust GPU + WGSL", 10.0, 400.0, hex(0x7c8299))),
                ),
        );

    // Compact horizontal tabs for phones / narrow panes
    let mut mobile_tabs = row().w_full().gap(6.0);
    for (i, (title, _)) in TABS.iter().enumerate() {
        let active = i == s.tab;
        mobile_tabs = mobile_tabs.child(
            el().key(format!("mtab-{i}"))
                .grow(1.0)
                .py(8.0)
                .center()
                .radius(10.0)
                .fill(if active { accent.alpha(0.25) } else { oklcha(1.0, 0.0, 0.0, 0.05) })
                .border(1.0, if active { accent.alpha(0.6) } else { oklcha(1.0, 0.0, 0.0, 0.08) })
                .on_press(move |s: &mut State| s.tab = i)
                .child(label_txt(*title, 11.0, 600.0, if active { hex(0xffffff) } else { hex(0x9da3b8) })),
        );
    }

    // Active tab body
    let body = match s.tab {
        0 => view_appearance(s, content_w, slider_w, accent),
        1 => view_compute(s, content_w, slider_w, accent),
        2 => view_graphics(s, accent),
        _ => view_metal_lab(s, content_w, slider_w, accent),
    };

    let mut content_col = col()
        .w_full()
        .gap(16.0)
        .padding(20.0);
    if compact {
        content_col = content_col.child(mobile_tabs);
    }
    content_col = content_col
        .child(liquid_metal_hero(s, content_w))
        .child(body);

    let scroll_pane = col()
        .key("content-scroll")
        .grow(1.0)
        .h_full()
        .shrink()
        .scroll(ScrollSpec::default())
        .scroll_edge_fade(18.0)
        .child(content_col);

    let mut root = row().key("root").w_full().h_full().fill(hex(0x070910));
    if !compact {
        root = root.child(sidebar);
    }
    root.child(scroll_pane)
}

fn view_appearance(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    // Liquid Metal Finish pills
    let finish_w = ((content_w - 30.0) / 4.0).max(80.0);
    let mut finish_row = row().w_full().gap(10.0);
    for &(name, idx) in &FINISHES {
        let active = s.metal_finish == idx;
        finish_row = finish_row.child(
            el().key(format!("finish-{idx}"))
                .w(finish_w)
                .h(64.0)
                .radius(14.0)
                .fill(hex(0x131622))
                .border(1.5, if active { hex(0xffffff) } else { oklcha(1.0, 0.0, 0.0, 0.12) })
                .motion(motion::SNAPPY)
                .on_press(move |s: &mut State| s.metal_finish = idx)
                .child(
                    fx(LIQUID_SLAB, [idx as f32, 68.0, 10.0, 1.0])
                        .key(format!("finish-fx-{idx}"))
                        .absolute(0.0, 0.0)
                        .size(finish_w, 38.0)
                        .radius(12.0),
                )
                .child(
                    el().absolute(0.0, 40.0)
                        .w(finish_w)
                        .h(22.0)
                        .center()
                        .child(label_txt(name, 11.0, if active { 600.0 } else { 400.0 }, if active { hex(0xffffff) } else { hex(0xa2a8bc) })),
                ),
        );
    }

    // OS Theme chips
    let mut theme_row = row().w_full().gap(8.0);
    for (i, &(id, name, swatch)) in THEMES.iter().enumerate() {
        let active = s.theme_idx == i;
        theme_row = theme_row.child(
            el().key(format!("theme-{id}"))
                .grow(1.0)
                .py(10.0)
                .px(8.0)
                .radius(13.0)
                .center()
                .fill(if active { hexa(swatch, 0.22) } else { oklch(0.145, 0.012, 265.0) })
                .border(1.0, if active { hex(swatch) } else { oklcha(1.0, 0.0, 0.0, 0.1) })
                .motion(motion::SNAPPY)
                .on_press(move |s: &mut State| {
                    s.theme_idx = i;
                    push_str("osTheme", id);
                })
                .child(
                    col()
                        .center()
                        .gap(6.0)
                        .child(el().size(14.0, 14.0).radius(7.0).fill(hex(swatch)))
                        .child(label_txt(name, 10.5, if active { 600.0 } else { 400.0 }, hex(0xf4f4f8))),
                ),
        );
    }

    // WebGPU Wallpaper Shader chips
    let mut shader_row = row().w_full().gap(8.0);
    for (i, &(id, name)) in SHADERS.iter().enumerate() {
        let active = s.shader_idx == i;
        shader_row = shader_row.child(
            el().key(format!("shader-{id}"))
                .grow(1.0)
                .py(9.0)
                .px(8.0)
                .radius(11.0)
                .center()
                .fill(if active { accent.alpha(0.24) } else { oklch(0.145, 0.012, 265.0) })
                .border(1.0, if active { accent } else { oklcha(1.0, 0.0, 0.0, 0.09) })
                .on_press(move |s: &mut State| {
                    s.shader_idx = i;
                    push_str("wallpaperShader", id);
                })
                .child(label_txt(name, 11.0, if active { 600.0 } else { 400.0 }, if active { hex(0xffffff) } else { hex(0xb0b6c9) })),
        );
    }

    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Alliage Liquid Metal (GPU WGSL)"))
        .child(finish_row)
        .child(section_title("Thème unkernelOS (Temps réel)"))
        .child(theme_row)
        .child(section_title("Shader Fond d'écran WebGPU"))
        .child(shader_row)
        .child(section_title("Verre & Sensations"))
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
                    |s, v, commit| {
                        s.glass_blur = v;
                        if commit {
                            push_num("glassBlur", s.blur_px());
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
                    |s| {
                        s.webgpu_wallpaper = !s.webgpu_wallpaper;
                        push_bool("webgpuWallpaper", s.webgpu_wallpaper);
                    },
                ),
                setting_toggle_row(
                    "dock-mag",
                    "Zoom magnétique du Dock",
                    "Écartement fluide des icônes au passage du curseur",
                    s.dock_mag,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.dock_mag = !s.dock_mag;
                        push_bool("dockMagnification", s.dock_mag);
                    },
                ),
                setting_toggle_row(
                    "sounds",
                    "Sons d'interface synthétisés",
                    "Retours acoustiques WebAudio discrets",
                    s.ui_sounds,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.ui_sounds = !s.ui_sounds;
                        push_bool("uiSounds", s.ui_sounds);
                    },
                ),
                setting_toggle_row(
                    "widgets",
                    "Widgets ambiants du bureau",
                    "Horloge & télémétrie en arrière-plan",
                    s.desktop_widgets,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.desktop_widgets = !s.desktop_widgets;
                        push_bool("desktopWidgets", s.desktop_widgets);
                    },
                ),
            ],
        ))
}

fn view_compute(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    let btn_w = content_w.min(340.0);
    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Ressources du noyau Linux aarch64"))
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
                    |s, v, commit| {
                        s.cpus = v;
                        s.reboot_pending = true;
                        if commit {
                            push_num("cpus", s.cpu_count());
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
                    |s, v, commit| {
                        s.ram = v;
                        s.reboot_pending = true;
                        if commit {
                            push_num("memoryMiB", s.ram_mib());
                        }
                    },
                ),
            ],
        ))
        .child(section_title("Accélération WebAssembly"))
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
                    |s| {
                        s.jit = !s.jit;
                        s.reboot_pending = true;
                        push_bool("jit", s.jit);
                    },
                ),
                setting_toggle_row(
                    "worker",
                    "Web Workers dédiés",
                    "Exécute le noyau hors du thread principal UI",
                    s.worker_smp,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.worker_smp = !s.worker_smp;
                        s.reboot_pending = true;
                        push_bool("worker", s.worker_smp);
                    },
                ),
                setting_toggle_row(
                    "shared",
                    "Mémoire partagée (SharedArrayBuffer)",
                    "Active le multi-cœur SMP via COOP/COEP",
                    s.shared_mem,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.shared_mem = !s.shared_mem;
                        s.reboot_pending = true;
                        push_bool("shared", s.shared_mem);
                    },
                ),
            ],
        ))
        .child(
            row()
                .w_full()
                .center()
                .py(6.0)
                .child(
                    el().key("reboot-btn")
                        .role("button")
                        .label("Redémarrer le noyau")
                        .focusable(true)
                        .size(btn_w, 46.0)
                        .radius(14.0)
                        .fill(hex(0x1b2030))
                        .border(1.0, oklcha(1.0, 0.0, 0.0, 0.25))
                        .on_press(|s: &mut State| {
                            s.reboot_pending = false;
                            emit_host_action("vm", "reboot", "now");
                        })
                        .child(
                            fx(LIQUID_SLAB, [s.metal_finish as f32, 96.0, 12.0, 1.0])
                                .key("reboot-metal-fx")
                                .absolute(0.0, 0.0)
                                .size(btn_w, 46.0)
                                .radius(14.0),
                        )
                        .child(
                            fx(SHIMMER, [0.55, 2.8, 0.3, 0.0])
                                .key("reboot-shimmer")
                                .absolute(0.0, 0.0)
                                .size(btn_w, 46.0)
                                .radius(14.0),
                        )
                        .child(
                            el().size(btn_w, 46.0)
                                .center()
                                .child(label_txt(
                                    if s.reboot_pending {
                                        "Appliquer & Redémarrer le noyau Linux"
                                    } else {
                                        "Redémarrer le noyau Linux"
                                    },
                                    13.0,
                                    700.0,
                                    hex(0x090b12),
                                )),
                        ),
                ),
        )
}

fn view_graphics(s: &State, accent: Color) -> El {
    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Affichage, 3D & Compositing Linux"))
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
                    |s| {
                        s.gl_virgl = !s.gl_virgl;
                        push_bool("gl", s.gl_virgl);
                    },
                ),
                setting_toggle_row(
                    "wayland",
                    "Compositeur Wayland intégré (wland)",
                    "Ouvre les apps GUI Linux (foot, Rune natif) en fenêtres",
                    s.wayland,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.wayland = !s.wayland;
                        push_bool("wayland", s.wayland);
                    },
                ),
                setting_toggle_row(
                    "fb0",
                    "Framebuffer graphique (/dev/fb0)",
                    "Surface d'affichage WebGPU directe du noyau",
                    s.display_fb0,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.display_fb0 = !s.display_fb0;
                        push_bool("display", s.display_fb0);
                    },
                ),
            ],
        ))
        .child(section_title("Audio & Réseau"))
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
                    |s| {
                        s.sound = !s.sound;
                        push_bool("sound", s.sound);
                    },
                ),
                setting_toggle_row(
                    "net",
                    "Réseau virtuel Wisp Relay",
                    "Accès Internet complet (git, cargo, npm, apt, curl)",
                    s.net_wisp,
                    s.metal_finish,
                    accent,
                    |s| {
                        s.net_wisp = !s.net_wisp;
                        push_bool("net", s.net_wisp);
                    },
                ),
            ],
        ))
}

fn view_metal_lab(s: &State, content_w: f32, slider_w: f32, accent: Color) -> El {
    let stage_h = 156.0;
    col()
        .w_full()
        .gap(14.0)
        .child(section_title("Surface Liquid Metal en direct (rune-fx WGSL)"))
        .child(
            el().key("metal-stage")
                .w_full()
                .h(stage_h)
                .radius(22.0)
                .fill(hex(0x0b0e17))
                .border(1.0, oklcha(1.0, 0.0, 0.0, 0.14))
                .child(
                    fx(LIQUID_SLAB, [s.metal_finish as f32, 115.0, 20.0, 0.0])
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
                                .gap(4.0)
                                .child(label_txt("LIQUID METAL", 22.0, 700.0, hex(0x090b12)))
                                .child(mono_txt(
                                    format!(
                                        "flow {:.2} · dome {:.2} · irid {:.2} · contrast {:.2}",
                                        s.metal_flow, s.metal_dome, s.metal_irid, s.metal_contrast
                                    ),
                                    11.0,
                                    hex(0x181c28),
                                )),
                        ),
                ),
        )
        .child(section_title("Paramètres physiques du shader"))
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
                    |s, v, _| s.metal_flow = v * 1.5,
                ),
                liquid_slider(
                    "dome",
                    "Courbure spéculaire (Dome)",
                    format!("{:.2}", s.metal_dome),
                    (s.metal_dome - 0.05) / 0.95,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |s, v, _| s.metal_dome = 0.05 + v * 0.95,
                ),
                liquid_slider(
                    "irid",
                    "Iridescence couche mince",
                    format!("{:.2}", s.metal_irid),
                    s.metal_irid / 0.75,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |s, v, _| s.metal_irid = v * 0.75,
                ),
                liquid_slider(
                    "contrast",
                    "Contraste studio",
                    format!("{:.2}", s.metal_contrast),
                    (s.metal_contrast - 0.65) / 1.0,
                    s.metal_finish,
                    accent,
                    slider_w,
                    |s, v, _| s.metal_contrast = 0.65 + v,
                ),
            ],
        ))
}

// ---------------------------------------------------------------------------
// Entrypoints (Web WASM + Native Linux/macOS)
// ---------------------------------------------------------------------------

pub fn app() -> App<State> {
    App::new(AppSpec::<State> {
        poll: Some(|s, t, _| {
            s.t = t;
            loop {
                let msg = poll_host_state();
                if msg.is_empty() {
                    break;
                }
                s.apply_host_snapshot(&msg);
            }
            true
        }),
        ..AppSpec::new("Liquid Metal Réglages", (920.0, 640.0), State::default, view)
    })
    .compositor(gfx::LiquidGfx::default())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(start))]
pub fn start() {
    app().run();
}
