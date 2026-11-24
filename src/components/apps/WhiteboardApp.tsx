import {
  ArrowUpRight,
  Circle,
  Download,
  Eraser,
  Grid,
  Pen,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { wmStore } from "../../wm/wm-store.ts";

type DrawTool = "pen" | "rect" | "circle" | "arrow" | "text" | "eraser";

interface DrawElement {
  readonly id: string;
  readonly tool: DrawTool;
  readonly color: string;
  readonly width: number;
  readonly points: readonly { x: number; y: number }[];
  readonly text?: string;
}

const PALETTE = ["#f4f4f5", "#8b5cf6", "#22d3ee", "#10b981", "#f59e0b", "#f43f5e", "#ec4899"];

export const WhiteboardApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#22d3ee");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [showGrid, setShowGrid] = useState(true);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const drawingRef = useRef<DrawElement | null>(null);

  const renderAll = (list: DrawElement[], active: DrawElement | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#080a12";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      for (let x = 0; x < rect.width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }
      for (let y = 0; y < rect.height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }
    }

    const all = active ? [...list, active] : list;
    for (const el of all) {
      if (el.points.length === 0) continue;
      ctx.strokeStyle = el.tool === "eraser" ? "#080a12" : el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.tool === "eraser" ? el.width * 5 : el.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const p0 = el.points[0]!;
      const p1 = el.points[el.points.length - 1]!;

      if (el.tool === "pen" || el.tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i]!.x, el.points[i]!.y);
        }
        ctx.stroke();
      } else if (el.tool === "rect") {
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      } else if (el.tool === "circle") {
        const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.tool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const head = 12;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - head * Math.cos(angle - 0.45), p1.y - head * Math.sin(angle - 0.45));
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - head * Math.cos(angle + 0.45), p1.y - head * Math.sin(angle + 0.45));
        ctx.stroke();
      } else if (el.tool === "text" && el.text) {
        ctx.font = "600 15px Inter, sans-serif";
        ctx.fillText(el.text, p0.x, p0.y);
      }
    }
    ctx.restore();
  };

  useEffect(() => {
    renderAll(elements, drawingRef.current);
  }, [elements, showGrid]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "text") {
      const txt = window.prompt("Label text:");
      if (txt?.trim()) {
        setElements((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), tool: "text", color, width: strokeWidth, points: [pos], text: txt.trim() },
        ]);
      }
      return;
    }
    drawingRef.current = {
      id: Math.random().toString(36).slice(2),
      tool,
      color,
      width: strokeWidth,
      points: [pos],
    };
    renderAll(elements, drawingRef.current);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pos = getPos(e);
    const cur = drawingRef.current;
    drawingRef.current = {
      ...cur,
      points: cur.tool === "pen" || cur.tool === "eraser" ? [...cur.points, pos] : [cur.points[0]!, pos],
    };
    renderAll(elements, drawingRef.current);
  };

  const onMouseUp = () => {
    if (!drawingRef.current) return;
    const finished = drawingRef.current;
    drawingRef.current = null;
    setElements((prev) => [...prev, finished]);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `unkernelos-sketch-${Date.now()}.png`;
    a.click();
    wmStore.pushToast("Exported", "Whiteboard PNG downloaded", "success");
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#080a12] overflow-hidden select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          {(
            [
              ["pen", Pen, "Pen"],
              ["arrow", ArrowUpRight, "Arrow"],
              ["rect", Square, "Box"],
              ["circle", Circle, "Circle"],
              ["text", Type, "Text"],
              ["eraser", Eraser, "Eraser"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              title={label}
              className={`p-1.5 rounded-lg border transition ${
                tool === id
                  ? "bg-violet-500/30 border-violet-400/50 text-white"
                  : "bg-white/[0.03] border-white/8 text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}

          <div className="h-4 w-px bg-white/10 mx-1" />

          <div className="flex items-center gap-1">
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(hex)}
                className={`w-4 h-4 rounded-full border transition ${
                  color === hex ? "scale-125 border-white" : "border-white/25"
                }`}
                style={{ background: hex }}
              />
            ))}
          </div>

          <input
            type="range"
            min={1}
            max={10}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-16 ml-2 accent-cyan-400"
            title="Stroke width"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className={`p-1.5 rounded-lg border ${
              showGrid ? "bg-white/12 border-white/25 text-white" : "border-white/8 text-zinc-400"
            }`}
            title="Toggle Grid"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={elements.length === 0}
            onClick={() => setElements((prev) => prev.slice(0, -1))}
            className="p-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-zinc-300 disabled:opacity-35"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={elements.length === 0}
            onClick={() => setElements([])}
            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 disabled:opacity-35"
            title="Clear Canvas"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={exportPng}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 text-xs text-cyan-200"
          >
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="flex-1 w-full h-full cursor-crosshair block"
      />
    </div>
  );
};
