import React, { useEffect, useRef, useState } from "react";
import { modStore, useMods, type HotCornerAction } from "../core/mod-store.ts";
import { uiSounds } from "../core/ui-sounds.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

interface RippleItem {
  id: number;
  x: number;
  y: number;
}

function triggerHotCornerAction(action: HotCornerAction): void {
  if (action === "none") return;
  uiSounds.playHotCorner();
  switch (action) {
    case "mission-control":
      wmStore.toggleMissionControl();
      break;
    case "launcher":
      wmStore.toggleLauncher();
      break;
    case "command-palette":
      wmStore.toggleCommandPalette();
      break;
    case "desktop-3d": {
      const cur = modStore.getSnapshot().desktop3d.enabled;
      modStore.setDesktop3d({ enabled: !cur });
      break;
    }
    case "grid-tile":
      modStore.setDesktop3d({ enabled: false });
      wmStore.tileWorkspace("grid");
      break;
    case "lock-screen":
      wmStore.setLocked(true);
      break;
    case "minimize-all":
      wmStore.minimizeAllInWorkspace();
      break;
  }
}

const CORNER_LABELS: Record<HotCornerAction, string> = {
  none: "",
  "mission-control": "Mission Control",
  launcher: "Launchpad",
  "command-palette": "Spotlight ⌘K",
  "desktop-3d": "Bureau 3D",
  "grid-tile": "Grille 2D",
  "lock-screen": "Verrouiller",
  "minimize-all": "Afficher Bureau",
};

/**
 * Global AAA Eye-Candy & Micro-Interaction Layer:
 * - GPU Cursor Ambient Spotlight illuminating glass surfaces
 * - 60fps Canvas Engine for Ambient Desktop Particles (Sakura, Snow, Fireflies, Rain, Matrix, Embers) + Cursor Trails
 * - Tactile Luminous Click Ripples
 * - Adaptive Circadian Night Shift Warmth + Cinema Color Grading + Subtle Frosted Quartz Film Grain + Edge Breath Glow
 * - Real 4-Corner macOS/Hyprland Hot Corners with 220ms magnetic dwell & visual corner beacon
 * - Optional Live Developer Perf HUD (FPS, Memory, Active Windows, GPU mode)
 */
export const OsEyeCandyLayer: React.FC = () => {
  const mods = useMods();
  const wm = useWm();
  const ec = mods.eyeCandy;

  const spotlightRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const [hoveredCorner, setHoveredCorner] = useState<string | null>(null);
  const [perfStats, setPerfStats] = useState({ fps: 60, heapMb: 0 });
  const cornerTimerRef = useRef<number | null>(null);

  // Sync WebAudio sound profile immediately
  useEffect(() => {
    uiSounds.setProfile(ec.soundProfile);
  }, [ec.soundProfile]);

  // 1. Zero-React-Rerender Cursor Ambient Spotlight + Tactile Click Ripples
  useEffect(() => {
    if (!ec.cursorSpotlight && !ec.clickRipples) return;
    let rid = 1;
    const onMove = (e: PointerEvent) => {
      if (spotlightRef.current && ec.cursorSpotlight) {
        spotlightRef.current.style.transform = `translate3d(${e.clientX - ec.cursorSpotlightSize / 2}px, ${
          e.clientY - ec.cursorSpotlightSize / 2
        }px, 0)`;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ec.clickRipples) return;
      const id = ++rid;
      setRipples((prev) => [...prev.slice(-4), { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 520);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [ec.cursorSpotlight, ec.cursorSpotlightSize, ec.clickRipples]);

  // 2. Unified 60fps Canvas for Ambient Weather/Particles + Cursor Trail (zero CPU when both off!)
  useEffect(() => {
    const needParticles = ec.ambientParticles !== "none";
    const needTrail = ec.cursorTrail !== "none";
    const canvas = canvasRef.current;
    if (!canvas || (!needParticles && !needTrail)) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = window.innerWidth;
    let h = window.innerHeight;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Ambient particle pool
    const count = needParticles ? Math.round(55 * ec.ambientParticleDensity) : 0;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.9,
      vy: 0.5 + Math.random() * 1.4,
      size: 2 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.04,
      phase: Math.random() * Math.PI * 2,
    }));

    // Cursor trail pool
    const trail: Array<{ x: number; y: number; vx: number; vy: number; life: number; hue: number; size: number }> = [];
    let hueCycle = 190;
    const onMove = (e: PointerEvent) => {
      if (!needTrail) return;
      hueCycle = (hueCycle + 3.5) % 360;
      const burst = ec.cursorTrail === "stardust" ? 2 : 1;
      for (let i = 0; i < burst; i++) {
        trail.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.1,
          vy: (Math.random() - 0.5) * 1.1 - (ec.cursorTrail === "stardust" ? 0.4 : 0),
          life: 1.0,
          hue: hueCycle,
          size: ec.cursorTrail === "neon-ribbon" ? 6 : 3 + Math.random() * 3.5,
        });
      }
      if (trail.length > 75) trail.splice(0, trail.length - 75);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let t = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      if (document.hidden) return;
      t += 0.016 * ec.motionSpeed;
      ctx.clearRect(0, 0, w, h);

      // Draw ambient particles
      if (needParticles) {
        const mode = ec.ambientParticles;
        for (const p of particles) {
          if (mode === "fireflies") {
            p.x += Math.sin(t + p.phase) * 0.65;
            p.y += Math.cos(t * 0.8 + p.phase) * 0.5;
            const pulse = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.6 + p.phase));
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.75, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(110, 231, 183, ${(pulse * 0.85).toFixed(2)})`;
            ctx.shadowColor = "#34d399";
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
          } else if (mode === "embers") {
            p.x += Math.sin(t * 1.4 + p.phase) * 0.8;
            p.y -= p.vy * 1.15;
            if (p.y < -12) {
              p.y = h + 10;
              p.x = Math.random() * w;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(251, 146, 60, 0.82)";
            ctx.shadowColor = "#f97316";
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
          } else if (mode === "rain") {
            p.x -= 1.2;
            p.y += p.vy * 8.5;
            if (p.y > h + 20) {
              p.y = -20;
              p.x = Math.random() * (w + 140);
            }
            ctx.strokeStyle = "rgba(125, 211, 252, 0.34)";
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 2.5, p.y - 16);
            ctx.stroke();
          } else if (mode === "matrix-sparks") {
            p.y += p.vy * 2.8;
            if (p.y > h + 14) {
              p.y = -14;
              p.x = Math.random() * w;
            }
            ctx.fillStyle = "rgba(52, 211, 153, 0.65)";
            ctx.fillRect(p.x, p.y, 2, 9);
          } else if (mode === "sakura") {
            p.x += 0.65 + Math.sin(t + p.phase) * 0.9;
            p.y += p.vy * 0.85;
            p.rot += p.vrot;
            if (p.y > h + 16 || p.x > w + 16) {
              p.y = -12;
              p.x = Math.random() * w;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = "rgba(249, 168, 212, 0.78)";
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size * 1.15, p.size * 0.58, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            // snow
            p.x += Math.sin(t * 0.9 + p.phase) * 0.65;
            p.y += p.vy * 0.85;
            if (p.y > h + 10) {
              p.y = -10;
              p.x = Math.random() * w;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(241, 245, 249, 0.72)";
            ctx.fill();
          }
          if (p.x < -20) p.x = w + 15;
          if (p.x > w + 20) p.x = -15;
        }
      }

      // Draw fluid cursor trail
      if (needTrail && trail.length > 0) {
        if (ec.cursorTrail === "neon-ribbon" && trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const a = trail[i - 1]!;
            const b = trail[i]!;
            ctx.strokeStyle = `hsla(${b.hue}, 95%, 65%, ${(b.life * 0.65).toFixed(2)})`;
            ctx.lineWidth = Math.max(1, b.life * 4.5);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        for (let i = trail.length - 1; i >= 0; i--) {
          const pt = trail[i]!;
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.life -= 0.036;
          if (pt.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (ec.cursorTrail !== "neon-ribbon") {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
            ctx.fillStyle =
              ec.cursorTrail === "aurora"
                ? `hsla(${pt.hue}, 92%, 68%, ${(pt.life * 0.55).toFixed(2)})`
                : `rgba(255, 255, 255, ${(pt.life * 0.85).toFixed(2)})`;
            ctx.fill();
          }
        }
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [ec.ambientParticles, ec.ambientParticleDensity, ec.cursorTrail, ec.motionSpeed]);

  // 3. Optional Live Developer Performance HUD (FPS + Heap + Window Count)
  useEffect(() => {
    if (!ec.showPerfHud) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 600) {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;
        setPerfStats({
          fps: Math.round((frames * 1000) / (now - last)),
          heapMb: Math.round(mem / (1024 * 1024)),
        });
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ec.showPerfHud]);

  const enterCorner = (key: string, action: HotCornerAction) => {
    if (action === "none") return;
    setHoveredCorner(key);
    if (cornerTimerRef.current) window.clearTimeout(cornerTimerRef.current);
    cornerTimerRef.current = window.setTimeout(() => {
      triggerHotCornerAction(action);
      setHoveredCorner(null);
    }, 240);
  };

  const leaveCorner = () => {
    setHoveredCorner(null);
    if (cornerTimerRef.current) {
      window.clearTimeout(cornerTimerRef.current);
      cornerTimerRef.current = null;
    }
  };

  const corners: Array<{ key: string; pos: string; action: HotCornerAction; tipPos: string }> = [
    { key: "tl", pos: "top-0 left-0", action: ec.hotCorners.topLeft, tipPos: "top-3 left-3" },
    { key: "tr", pos: "top-0 right-0", action: ec.hotCorners.topRight, tipPos: "top-3 right-3" },
    { key: "bl", pos: "bottom-0 left-0", action: ec.hotCorners.bottomLeft, tipPos: "bottom-3 left-3" },
    { key: "br", pos: "bottom-0 right-0", action: ec.hotCorners.bottomRight, tipPos: "bottom-3 right-3" },
  ];

  return (
    <>
      {/* 1. Ambient Cursor Spotlight Aura */}
      {ec.cursorSpotlight && (
        <div
          ref={spotlightRef}
          style={{
            width: `${ec.cursorSpotlightSize}px`,
            height: `${ec.cursorSpotlightSize}px`,
            opacity: ec.cursorSpotlightOpacity,
            background:
              "radial-gradient(circle, var(--accent-cyan) 0%, var(--accent-primary) 35%, transparent 72%)",
          }}
          className="fixed top-0 left-0 z-[2] pointer-events-none rounded-full blur-2xl will-change-transform hidden sm:block"
        />
      )}

      {/* 2. 60fps Ambient Particles + Cursor Trail Canvas */}
      {(ec.ambientParticles !== "none" || ec.cursorTrail !== "none") && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 w-full h-full z-[65] pointer-events-none"
        />
      )}

      {/* 3. Tactile Click Ripples */}
      {ec.clickRipples &&
        ripples.map((r) => (
          <span
            key={r.id}
            style={{ left: `${r.x}px`, top: `${r.y}px` }}
            className="os-click-ripple fixed z-[92] pointer-events-none"
          />
        ))}

      {/* 4. Subtle Organic Frosted Quartz Glass Grain */}
      {ec.glassGrain > 0 && (
        <div
          style={{ opacity: (ec.glassGrain / 100) * 0.085 }}
          className="os-film-grain fixed inset-0 z-[88] pointer-events-none"
        />
      )}

      {/* 5. Ambient Screen Vignette & Breathing Luminous Edge Halo */}
      {(ec.vignetteStrength > 0 || ec.edgeBreathGlow) && (
        <div
          style={{
            background:
              ec.vignetteStrength > 0
                ? `radial-gradient(ellipse 84% 84% at 50% 50%, transparent 56%, rgba(0,0,0,${(
                    ec.vignetteStrength / 100
                  ).toFixed(2)}) 100%)`
                : undefined,
          }}
          className={`fixed inset-0 z-[86] pointer-events-none ${
            ec.edgeBreathGlow ? "os-edge-breath" : ""
          }`}
        />
      )}

      {/* 6. Adaptive Circadian Night Shift Warmth Overlay */}
      {ec.nightShiftWarmth > 0 && (
        <div
          style={{
            backgroundColor: `rgba(255, 148, 38, ${((ec.nightShiftWarmth / 100) * 0.24).toFixed(3)})`,
            mixBlendMode: "multiply",
          }}
          className="fixed inset-0 z-[94] pointer-events-none"
        />
      )}

      {/* 7. Real 4-Corner macOS / Hyprland Hot Corners */}
      {corners.map(
        (c) =>
          c.action !== "none" && (
            <div
              key={c.key}
              onPointerEnter={() => enterCorner(c.key, c.action)}
              onPointerLeave={leaveCorner}
              className={`fixed ${c.pos} w-3.5 h-3.5 z-[96] hidden md:block`}
            >
              {hoveredCorner === c.key && (
                <div
                  className={`fixed ${c.tipPos} px-2.5 py-1 rounded-full bg-black/85 backdrop-blur-xl border border-cyan-400/55 text-[10px] font-mono text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.45)] pointer-events-none animate-window-in`}
                >
                  ⚡ {CORNER_LABELS[c.action]}
                </div>
              )}
            </div>
          )
      )}

      {/* 8. Optional Live Developer Performance Telemetry Pill */}
      {ec.showPerfHud && (
        <div className="fixed bottom-3 right-3 z-[75] hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-xl border border-white/15 text-[10px] font-mono text-zinc-200 shadow-xl pointer-events-none select-none">
          <span className="text-emerald-400 font-bold">{perfStats.fps} FPS</span>
          {perfStats.heapMb > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-cyan-300">{perfStats.heapMb} MB JS</span>
            </>
          )}
          <span className="text-white/20">·</span>
          <span className="text-violet-300">{wm.windows.length} win</span>
          <span className="text-white/20">·</span>
          <span className="text-amber-300">{mods.desktop3d.enabled ? "3D GPU" : "2D GPU"}</span>
        </div>
      )}
    </>
  );
};
