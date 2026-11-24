import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { Effect } from "effect";
import { ExternalLink, Sparkles } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { Pty } from "unkernel";
import { appRuntime, VmService } from "../../core/runtime.ts";
import type { KittyThemeId } from "../../core/schema.ts";
import { KITTY_THEMES, KittyWebGpuRenderer } from "../../gpu/webgpu-terminal.ts";
import { wmStore } from "../../wm/wm-store.ts";

export interface KittyTerminalHandle {
  write: (data: string) => void;
  focus: () => void;
  clear: () => void;
}

interface KittyTerminalPaneProps {
  themeId: KittyThemeId;
  fontSize: number;
  preferWebGpu: boolean;
  initialCommand?: string;
  cwd?: string;
  focused?: boolean;
  onFocus?: () => void;
  onReady?: (handle: KittyTerminalHandle) => void;
  onTitleChange?: (title: string) => void;
}

function keyEventToAnsi(e: KeyboardEvent): string | null {
  if (e.metaKey) return null; // keep macOS Cmd+C / Cmd+V / Cmd+K for browser/OS

  if (e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "c" && window.getSelection()?.toString()) return null;
    if (k.length === 1 && k >= "a" && k <= "z") {
      return String.fromCharCode(k.charCodeAt(0) - 96);
    }
    if (e.key === "[") return "\x1b";
    if (e.key === "\\") return "\x1c";
    if (e.key === "]") return "\x1d";
    if (e.key === " ") return "\x00";
  }

  switch (e.key) {
    case "Enter": return "\r";
    case "Backspace": return "\x7f";
    case "Tab": return e.shiftKey ? "\x1b[Z" : "\t";
    case "Escape": return "\x1b";
    case "ArrowUp": return "\x1b[A";
    case "ArrowDown": return "\x1b[B";
    case "ArrowRight": return "\x1b[C";
    case "ArrowLeft": return "\x1b[D";
    case "Home": return "\x1b[H";
    case "End": return "\x1b[F";
    case "Delete": return "\x1b[3~";
    case "Insert": return "\x1b[2~";
    case "PageUp": return "\x1b[5~";
    case "PageDown": return "\x1b[6~";
    case "F1": return "\x1bOP";
    case "F2": return "\x1bOQ";
    case "F3": return "\x1bOR";
    case "F4": return "\x1bOS";
    case "F5": return "\x1b[15~";
    case "F6": return "\x1b[17~";
    case "F7": return "\x1b[18~";
    case "F8": return "\x1b[19~";
    case "F9": return "\x1b[20~";
    case "F10": return "\x1b[21~";
    case "F11": return "\x1b[23~";
    case "F12": return "\x1b[24~";
  }

  if (e.altKey && e.key.length === 1) {
    return `\x1b${e.key}`;
  }

  if (e.key.length === 1) {
    return e.key;
  }

  return null;
}

const LOCAL_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})(\/[^\s"'<>)]*)?/i;

export const KittyTerminalPane: React.FC<KittyTerminalPaneProps> = ({
  themeId,
  fontSize,
  preferWebGpu,
  initialCommand,
  cwd,
  focused = true,
  onFocus,
  onReady,
  onTitleChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rendererRef = useRef<KittyWebGpuRenderer | null>(null);
  const termRef = useRef<HeadlessTerminal | null>(null);
  const ptyRef = useRef<Pty | null>(null);

  const [backend, setBackend] = useState<"webgpu" | "canvas2d">("canvas2d");
  const [status, setStatus] = useState<"connecting" | "connected" | "exited">("connecting");
  const [detectedUrl, setDetectedUrl] = useState<{ port: number; path: string } | null>(null);

  const theme = KITTY_THEMES[themeId] ?? KITTY_THEMES["tokyo-night"];

  useEffect(() => {
    rendererRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const r = rendererRef.current;
    const container = containerRef.current;
    const term = termRef.current;
    if (!r || !container || !term) return;
    r.setFontSize(fontSize);
    const { cols, rows } = r.computeGrid(container.clientWidth, container.clientHeight);
    term.resize(cols, rows);
    ptyRef.current?.resize(cols, rows);
    r.markDirty();
  }, [fontSize]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let disposed = false;
    const term = new HeadlessTerminal({
      cols: 100,
      rows: 30,
      scrollback: 5000,
      allowProposedApi: true,
    });
    termRef.current = term;

    const renderer = new KittyWebGpuRenderer(canvas, term, theme, fontSize);
    rendererRef.current = renderer;

    term.onTitleChange((t) => onTitleChange?.(t));

    const writeToPty = (data: string) => {
      if (ptyRef.current) {
        ptyRef.current.write(data).catch(() => {});
      }
    };

    const apiHandle: KittyTerminalHandle = {
      write: writeToPty,
      focus: () => inputRef.current?.focus(),
      clear: () => {
        term.clear();
        renderer.markDirty();
      },
    };
    onReady?.(apiHandle);

    const init = async () => {
      const used = await renderer.init(preferWebGpu);
      if (disposed) {
        renderer.dispose();
        return;
      }
      setBackend(used);

      const { cols, rows } = renderer.computeGrid(container.clientWidth, container.clientHeight);
      renderer.resizeCanvas(container.clientWidth, container.clientHeight);
      term.resize(cols, rows);
      renderer.markDirty();

      // Spawn a real Linux PTY over unkernel vsock
      const spawnRes = await appRuntime.runPromise(
        Effect.either(
          Effect.gen(function* () {
            const vm = yield* VmService;
            return yield* vm.spawnPty(undefined, undefined, {
              cols,
              rows,
              cwd,
              env: {
                TERM: "xterm-256color",
                COLORTERM: "truecolor",
              },
            });
          })
        )
      );

      if (disposed) {
        if (spawnRes._tag === "Right") spawnRes.right.close();
        return;
      }

      if (spawnRes._tag === "Left") {
        setStatus("exited");
        term.write(`\r\n\x1b[31m[unkernelOS] Waiting for Linux kernel to finish booting...\x1b[0m\r\n`);
        renderer.markDirty();
        return;
      }

      const pty = spawnRes.right;
      ptyRef.current = pty;
      setStatus("connected");

      if (initialCommand) {
        setTimeout(() => {
          if (!disposed) {
            pty.write(`${initialCommand}\n`).catch(() => {});
          }
        }, 250);
      }

      const reader = pty.output.getReader();
      const decoder = new TextDecoder();
      try {
        while (!disposed) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const text = decoder.decode(value, { stream: true });
            const urlMatch = LOCAL_URL_RE.exec(text);
            if (urlMatch) {
              const port = Number(urlMatch[1]);
              if (port > 0 && port < 65536) {
                setDetectedUrl({ port, path: urlMatch[2] || "/" });
              }
            }
            term.write(value, () => renderer.markDirty());
          }
        }
      } catch {
        // stream closed
      } finally {
        reader.cancel().catch(() => {});
        if (!disposed) {
          setStatus("exited");
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n", () => renderer.markDirty());
        }
      }
    };

    void init();

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w < 40 || h < 24) return;
      renderer.resizeCanvas(w, h);
      const { cols, rows } = renderer.computeGrid(w, h);
      if (cols !== term.cols || rows !== term.rows) {
        term.resize(cols, rows);
        ptyRef.current?.resize(cols, rows);
      }
      renderer.markDirty();
    });
    ro.observe(container);

    return () => {
      disposed = true;
      ro.disconnect();
      ptyRef.current?.close();
      ptyRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [preferWebGpu]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || (e.ctrlKey && e.shiftKey)) && e.key.toLowerCase() === "c") {
      const text = extractSelectedText();
      if (text) {
        navigator.clipboard.writeText(text).catch(() => {});
        e.preventDefault();
        return;
      }
    }
    if ((e.metaKey || (e.ctrlKey && e.shiftKey)) && e.key.toLowerCase() === "v") {
      navigator.clipboard.readText().then((t) => {
        if (t) ptyRef.current?.write(t).catch(() => {});
      }).catch(() => {});
      e.preventDefault();
      return;
    }

    const seq = keyEventToAnsi(e.nativeEvent);
    if (seq !== null) {
      e.preventDefault();
      e.stopPropagation();
      termRef.current?.scrollToBottom();
      ptyRef.current?.write(seq).catch(() => {});
      rendererRef.current?.markDirty();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      ptyRef.current?.write(text).catch(() => {});
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const lines = Math.round(e.deltaY / 28);
    if (lines !== 0 && termRef.current) {
      termRef.current.scrollLines(lines);
      rendererRef.current?.markDirty();
    }
  };

  const dragSelect = useRef(false);

  const extractSelectedText = (): string => {
    const sel = rendererRef.current?.selection;
    const term = termRef.current;
    if (!sel || !term) return "";
    let { startCol, startRow, endCol, endRow } = sel;
    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startCol, endCol] = [endCol, startCol];
      [startRow, endRow] = [endRow, startRow];
    }
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const line = buf.getLine(buf.viewportY + r);
      if (!line) continue;
      const c0 = r === startRow ? startCol : 0;
      const c1 = r === endRow ? endCol + 1 : term.cols;
      lines.push(line.translateToString(true, c0, c1));
    }
    return lines.join("\n").trimEnd();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    onFocus?.();
    inputRef.current?.focus();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;
    const cell = rendererRef.current.pixelToCell(e.clientX - rect.left, e.clientY - rect.top);
    dragSelect.current = true;
    rendererRef.current.selection = {
      startCol: cell.col,
      startRow: cell.row,
      endCol: cell.col,
      endRow: cell.row,
    };
    rendererRef.current.markDirty();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragSelect.current || !canvasRef.current || !rendererRef.current?.selection) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cell = rendererRef.current.pixelToCell(e.clientX - rect.left, e.clientY - rect.top);
    rendererRef.current.selection.endCol = cell.col;
    rendererRef.current.selection.endRow = cell.row;
    rendererRef.current.markDirty();
  };

  const handleMouseUp = () => {
    if (!dragSelect.current) return;
    dragSelect.current = false;
    const sel = rendererRef.current?.selection;
    if (sel && sel.startCol === sel.endCol && sel.startRow === sel.endRow) {
      rendererRef.current!.selection = null;
      rendererRef.current!.markDirty();
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{ backgroundColor: theme.bg }}
      className={`relative w-full h-full overflow-hidden cursor-text transition-shadow ${
        focused ? "ring-1 ring-inset ring-violet-400/25" : "opacity-90"
      }`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Hidden textarea for native keyboard, IME & clipboard events */}
      <textarea
        ref={inputRef}
        autoFocus={focused}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        aria-label="Terminal Input"
        className="absolute opacity-0 w-1 h-1 pointer-events-none top-0 left-0"
      />

      {/* WebGPU / Kitty HUD badge */}
      <div className="pointer-events-none absolute bottom-2 right-2.5 flex items-center gap-1.5 text-[10px] font-mono">
        {detectedUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              wmStore.openPreview(detectedUrl.port, detectedUrl.path);
            }}
            className="pointer-events-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Preview :{detectedUrl.port}
          </button>
        )}
        <span
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border backdrop-blur-md ${
            backend === "webgpu"
              ? "bg-violet-500/15 border-violet-400/30 text-violet-300"
              : "bg-zinc-800/70 border-zinc-700/60 text-zinc-400"
          }`}
        >
          <Sparkles className="w-2.5 h-2.5" />
          {backend === "webgpu" ? "WebGPU" : "2D"}
        </span>
        {status !== "connected" && (
          <span className="px-2 py-0.5 rounded-full bg-zinc-900/80 border border-white/10 text-zinc-400">
            {status}
          </span>
        )}
      </div>
    </div>
  );
};
