//! GPU Compositor for Liquid Metal unkernelOS Réglages (powered by `rune-fx`).
//!
//! Each `rune::effect(kind).effect_data([a, b, c, d])` slot becomes a deterministic WGSL
//! fragment shader layer: molten liquid metal slabs, metallic tube borders, neon & soft
//! hover glows, specular shimmer sweeps, and ambient studio aurora.

#![forbid(unsafe_code)]

use rune::compose::{Compositor, DeviceKey, Frame};
use rune::render::{EffectPhase, EffectSite, KIND_EFFECT};
use rune_fx::*;

use crate::State;

pub const LIQUID_SLAB: u32 = 1;
pub const LIQUID_BORDER: u32 = 2;
pub const GLOW: u32 = 3;
pub const SHIMMER: u32 = 4;
pub const AURORA: u32 = 5;

const PALETTE: [u32; 6] = [
    0x8b5cf6, // 0: violet
    0x22d3ee, // 1: cyan
    0xf43f5e, // 2: rose / neon
    0x34d399, // 3: emerald
    0xf59e0b, // 4: amber / gold
    0x38bdf8, // 5: sapphire sky
];

fn metal_preset(idx: u32, flow: f32, dome: f32, iridescence: f32, contrast: f32) -> LiquidMetalParams {
    let mut base = match idx {
        1 => LiquidMetalParams::gold(),
        2 => LiquidMetalParams::rose(),
        3 => LiquidMetalParams::gunmetal(),
        _ => LiquidMetalParams {
            light: rgb(0xe2f0ff),
            ..LiquidMetalParams::chrome()
        },
    };
    base.flow = flow.clamp(0.0, 1.5);
    base.dome = dome.clamp(0.05, 1.0);
    base.iridescence = iridescence.clamp(0.0, 0.75);
    base.contrast = contrast.clamp(0.65, 1.65);
    base.speed = 0.44;
    base
}

fn build_layer(kind: u32, d: [f32; 4], shape: Shape, t: f32, s: &State) -> Option<FxLayer> {
    let fx = match kind {
        LIQUID_SLAB => {
            let finish = d[0] as u32;
            let mut p = metal_preset(finish, s.metal_flow, s.metal_dome, s.metal_irid, s.metal_contrast);
            if d[1] > 0.0 {
                p.scale = d[1];
            }
            if d[2] > 0.0 {
                p.bevel = d[2];
            }
            if d[3] > 0.5 {
                p = p.anchor(FillAnchor::Element);
            }
            Fx::fill(p)
        }
        LIQUID_BORDER => {
            let finish = d[0] as u32;
            let width = if d[1] > 0.0 { d[1] } else { 2.2 };
            let boost = if d[2] > 0.0 { d[2] } else { 0.0 };
            let mut p = metal_preset(
                finish,
                (s.metal_flow * 0.9 + boost * 0.25).min(1.5),
                s.metal_dome,
                (s.metal_irid + 0.1 + boost * 0.12).min(0.75),
                (s.metal_contrast + boost * 0.18).min(1.65),
            );
            p.bevel = width * 2.4;
            Fx::fill(p.border(width))
        }
        GLOW => {
            let col = rgb(PALETTE[(d[0].max(0.0) as usize).min(PALETTE.len() - 1)]);
            let style = if d[1] > 0.5 { GlowStyle::Neon } else { GlowStyle::Soft };
            let intensity = if d[2] > 0.0 { d[2] } else { 0.7 };
            let radius = if d[3] > 0.0 { d[3] } else { 16.0 };
            Fx::glow(GlowParams {
                style,
                color: col,
                intensity,
                radius,
                aura_speed: 0.42,
                ..Default::default()
            })
        }
        SHIMMER => Fx::shimmer(ShimmerParams {
            intensity: if d[0] > 0.0 { d[0] } else { 0.5 },
            period: if d[1] > 0.0 { d[1] } else { 2.6 },
            band: if d[2] > 0.0 { d[2] } else { 0.30 },
            ..Default::default()
        }),
        AURORA => Fx::aurora(AuroraParams {
            intensity: if d[0] > 0.0 { d[0] } else { 0.32 },
            speed: if d[1] > 0.0 { d[1] } else { 0.24 },
            ..Default::default()
        }),
        _ => return None,
    };
    Some(fx.on(shape).at(t))
}

struct FxCache {
    device_key: DeviceKey,
    format: wgpu::TextureFormat,
    fx: FxRenderer,
}

#[derive(Default)]
pub struct LiquidGfx {
    cache: Option<FxCache>,
}

impl Compositor<State> for LiquidGfx {
    fn animating(&self) -> bool {
        true
    }

    fn release_gpu(&mut self) {
        self.cache = None;
    }

    fn render(&mut self, f: &mut Frame<'_, State>) {
        let (device, queue, size) = (f.device, f.queue, f.size);
        let t = f.rt.t as f32;
        let marks = &f.rt.marks;
        let mut at: Vec<u32> = Vec::new();
        let mut layers: Vec<FxLayer> = Vec::new();
        let mut slots: Vec<FxSlot> = Vec::new();

        for (n, i) in f.rt.instances.iter().enumerate() {
            if i.params[1] != KIND_EFFECT {
                continue;
            }
            let kind = marks.get(n).copied().unwrap_or(0) & 0xff;
            let k = i.params[3].max(1.0);
            let [x, y, w, h] = i.rect.map(|v| v / k);
            let r = i.radii.iter().fold(0.0f32, |a, v| a.max(v.abs())) / k;
            let Some(l) = build_layer(kind, i.uv, Shape::rounded(x, y, w, h, r), t, &f.rt.state) else {
                continue;
            };
            at.push(n as u32);
            layers.push(l);
            slots.push(FxSlot::default().scale(k).clip(i.clip, i.fade));
        }

        let device_key = f.device_key();
        if self
            .cache
            .as_ref()
            .is_none_or(|c| c.device_key != device_key || c.format != f.format)
        {
            self.cache = None;
            let mut fx = FxRenderer::new(device, f.format, FxOptions { dither: true });
            fx.add_format(device, wgpu::TextureFormat::Rgba16Float);
            self.cache = Some(FxCache {
                device_key,
                format: f.format,
                fx,
            });
        }

        let fx = &mut self.cache.as_mut().unwrap().fx;
        fx.set_srgb_blend(f.srgb_blend());
        fx.prepare_with_slots(
            device,
            queue,
            &FxFrame {
                viewport: [size.0, size.1],
                scale: 1.0,
                layers: &layers,
                backdrop: None,
                sources: &[],
            },
            &slots,
        );

        let clear = f.rt.clear_color();
        f.ui.prepare(device, queue, &mut f.rt.text.atlas, &f.rt.instances, size);
        f.ui.draw_with_backdrop(f.encoder, f.target, clear, &mut |phase, site: &EffectSite<'_>| {
            let Some(idx) = at.iter().position(|n| *n == site.index) else {
                return;
            };
            match phase {
                EffectPhase::Backdrop(enc) => {
                    if let Some(bd) = site.backdrop {
                        fx.blur_backdrop(device, queue, enc, bd, idx);
                    }
                }
                EffectPhase::Draw(pass) => fx.draw_layer_in(pass, site.format, site.origin, idx),
            }
        });
    }
}
