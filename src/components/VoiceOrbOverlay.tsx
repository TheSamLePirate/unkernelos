import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useVoiceOs, voiceOsEngine } from "../core/voice-os.ts";

const VOICE_PRESETS = [
  "Open Code IDE",
  "Theme Cyber Tokyo",
  "Split IDE & Preview",
  "Open Terminal",
  "Preview 3000",
];

/**
 * Futuristic Jarvis/visionOS Voice OS Floating Orb & Natural Command Console.
 * Renders a 60fps reactive plasma orb animated by live microphone audio level.
 */
export const VoiceOrbOverlay: React.FC = () => {
  const voice = useVoiceOs();
  const [input, setInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(0);
  levelRef.current = voice.audioLevel;

  useEffect(() => {
    if (!voice.open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const lvl = voice.listening ? 0.25 + levelRef.current * 0.85 : 0.12;
      const time = t * 0.0022;

      ctx.clearRect(0, 0, w, h);

      // Outer glowing plasma halo
      const outerR = 30 + lvl * 18 + Math.sin(time * 2) * 3;
      const g1 = ctx.createRadialGradient(cx, cy, 4, cx, cy, outerR);
      g1.addColorStop(0, "rgba(34, 211, 238, 0.95)");
      g1.addColorStop(0.45, "rgba(139, 92, 246, 0.72)");
      g1.addColorStop(0.75, "rgba(217, 70, 239, 0.28)");
      g1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Dynamic morphing neon rings
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        const baseR = 16 + ring * 5 + lvl * 7;
        for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.14) {
          const wobble =
            Math.sin(a * (3 + ring) + time * (2 + ring)) * (2.2 + lvl * 5) +
            Math.cos(a * 5 - time * 3) * (1.2 + lvl * 2.5);
          const r = baseR + wobble;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle =
          ring === 0
            ? "rgba(34, 211, 238, 0.85)"
            : ring === 1
            ? "rgba(192, 132, 252, 0.65)"
            : "rgba(244, 114, 182, 0.45)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [voice.open, voice.listening]);

  if (!voice.open) return null;

  const submit = () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput("");
    void voiceOsEngine.executeNaturalCommand(cmd);
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[96] w-[calc(100vw-24px)] max-w-md rounded-3xl glass-surface-focused p-4 space-y-3 shadow-2xl animate-window-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          unkernelOS Voice &amp; Intent Engine
        </div>
        <button
          type="button"
          onClick={() => voiceOsEngine.setOpen(false)}
          className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Reactive Plasma Orb + Mic Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            voice.listening ? voiceOsEngine.stopListening() : void voiceOsEngine.startListening()
          }
          className="relative w-20 h-20 shrink-0 flex items-center justify-center rounded-full hover:scale-105 transition"
          title={voice.listening ? "Stop Listening" : "Start Voice Command"}
        >
          <canvas ref={canvasRef} width={96} height={96} className="w-20 h-20" />
          <span className="absolute inset-0 flex items-center justify-center">
            {voice.listening ? (
              <MicOff className="w-5 h-5 text-white drop-shadow" />
            ) : (
              <Mic className="w-5 h-5 text-white drop-shadow" />
            )}
          </span>
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs font-medium text-white">
            {voice.listening
              ? "Listening — speak a command (FR / EN)..."
              : voice.lastResponse || "Tap the orb or type any OS command"}
          </div>
          {voice.transcript && (
            <div className="text-xs font-mono text-cyan-300 truncate">“{voice.transcript}”</div>
          )}
          {voice.error && <div className="text-[11px] text-amber-300">{voice.error}</div>}
        </div>
      </div>

      {/* Text Fallback Input */}
      <div className="flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") voiceOsEngine.setOpen(false);
          }}
          placeholder="e.g. 'Theme Cyber Tokyo' or 'Split IDE & Preview'..."
          className="flex-1 px-3 py-2 rounded-xl bg-black/55 border border-white/12 focus:border-cyan-400/50 text-xs text-white placeholder:text-zinc-500 outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim()}
          className="p-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white disabled:opacity-40 hover:brightness-110 transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Intent Chips */}
      <div className="flex flex-wrap gap-1">
        {VOICE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => void voiceOsEngine.executeNaturalCommand(p)}
            className="px-2 py-0.5 rounded-full text-[10px] bg-white/[0.05] hover:bg-violet-500/25 border border-white/10 text-zinc-300 hover:text-white transition"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
};
