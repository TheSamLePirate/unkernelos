import { screenToElement } from "../../core/spatial-pointer.ts";
import {
  WindowSessionContext,
  useAppSurface,
  useSurfaceRevision,
} from "../../core/app-surface-registry.tsx";
import { contextStore } from "../../core/context-store.ts";
import { createPortal } from "react-dom";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { Effect } from "effect";
import {
  ClipboardPaste,
  ExternalLink,
  Keyboard,
  Sparkles,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { Pty } from "unkernel";
import {
  appRuntime,
  GithubAuthService,
  VmService,
} from "../../core/runtime.ts";
import type { KittyThemeId } from "../../core/schema.ts";
import { useViewport } from "../../core/use-viewport.ts";
import {
  KITTY_THEMES,
  KittyWebGpuRenderer,
} from "../../gpu/webgpu-terminal.ts";
import { wmStore } from "../../wm/wm-store.ts";

export interface KittyTerminalHandle {
  write: (data: string) => void;
  focus: () => void;
  clear: () => void;
  search: (query: string, dir?: 1 | -1) => { total: number; current: number };
  clearSearch: () => void;
  getVisibleText: () => string;
}

interface KittyTerminalPaneProps {
  surfaceActive?: boolean;
  surfaceId?: string;
  themeId: KittyThemeId;
  fontSize: number;
  preferWebGpu: boolean;
  initialCommand?: string;
  cwd?: string;
  focused?: boolean;
  forceTouchBar?: boolean;
  onFocus?: () => void;
  onReady?: (handle: KittyTerminalHandle) => void;
  onTitleChange?: (title: string) => void;
}

function keyEventToAnsi(
  e: KeyboardEvent,
  appCursorMode: boolean,
): string | null {
  if (e.metaKey) return null; // keep macOS Cmd+C / Cmd+V / Cmd+K for browser/OS

  // On Windows/Linux, AltGr sends ctrlKey && altKey with a printable character (e.g. @, #, {, }, [, ], \, |, ~, €)
  if (e.ctrlKey && e.altKey && e.key.length === 1) {
    return e.key;
  }

  // On macOS, Option (Alt) produces composed printable characters (e.g. Option+( -> {, Option+Shift+L -> |, Option+N -> ~)
  // Distinguish real Alt+<letter> shortcuts from macOS Option-composed symbols:
  if (e.altKey && !e.ctrlKey && e.key.length === 1) {
    const isAsciiLetterOrDigit = /^[a-zA-Z0-9]$/.test(e.key);
    const matchesPhysicalKey =
      (e.code.startsWith("Key") &&
        e.code.slice(3).toLowerCase() === e.key.toLowerCase()) ||
      (e.code.startsWith("Digit") && e.code.slice(5) === e.key);
    // If the OS composed a different symbol (AZERTY/macOS {, }, |, ~, \, [, ], €, etc.), send that symbol verbatim!
    if (!isAsciiLetterOrDigit && !matchesPhysicalKey) {
      return e.key;
    }
    return `\x1b${e.key}`;
  }

  const mod =
    1 + (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0);

  if (e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "c" && window.getSelection()?.toString()) return null;
    if (k === "backspace") return "\x08";
    if (k.length === 1 && k >= "a" && k <= "z") {
      return String.fromCharCode(k.charCodeAt(0) - 96);
    }
    if (e.key === "[" || e.key === "3") return "\x1b";
    if (e.key === "\\" || e.key === "4") return "\x1c";
    if (e.key === "]" || e.key === "5") return "\x1d";
    if (e.key === "^" || e.key === "6") return "\x1e";
    if (e.key === "_" || e.key === "7" || e.key === "/") return "\x1f";
    if (e.key === " " || e.key === "@" || e.key === "2") return "\x00";
  }

  const csiMod = (letter: string, ss3 = false): string => {
    if (mod > 1) return `\x1b[1;${mod}${letter}`;
    return ss3 ? `\x1bO${letter}` : `\x1b[${letter}`;
  };

  const tildeMod = (num: number): string =>
    mod > 1 ? `\x1b[${num};${mod}~` : `\x1b[${num}~`;

  switch (e.key) {
    case "Enter":
      return e.altKey ? "\x1b\r" : "\r";
    case "Backspace":
      return e.altKey ? "\x1b\x7f" : "\x7f";
    case "Tab":
      return e.shiftKey ? "\x1b[Z" : "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return csiMod("A", appCursorMode);
    case "ArrowDown":
      return csiMod("B", appCursorMode);
    case "ArrowRight":
      return csiMod("C", appCursorMode);
    case "ArrowLeft":
      return csiMod("D", appCursorMode);
    case "Home":
      return csiMod("H", appCursorMode);
    case "End":
      return csiMod("F", appCursorMode);
    case "Insert":
      return tildeMod(2);
    case "Delete":
      return tildeMod(3);
    case "PageUp":
      return tildeMod(5);
    case "PageDown":
      return tildeMod(6);
    case "F1":
      return csiMod("P", true);
    case "F2":
      return csiMod("Q", true);
    case "F3":
      return csiMod("R", true);
    case "F4":
      return csiMod("S", true);
    case "F5":
      return tildeMod(15);
    case "F6":
      return tildeMod(17);
    case "F7":
      return tildeMod(18);
    case "F8":
      return tildeMod(19);
    case "F9":
      return tildeMod(20);
    case "F10":
      return tildeMod(21);
    case "F11":
      return tildeMod(23);
    case "F12":
      return tildeMod(24);
  }

  if (e.key.length === 1) {
    return e.key;
  }

  return null;
}

function encodeSgrMouse(
  btnCode: number,
  col: number,
  row: number,
  pressed: boolean,
  e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean },
): string {
  const mods = (e.shiftKey ? 4 : 0) + (e.altKey ? 8 : 0) + (e.ctrlKey ? 16 : 0);
  return `\x1b[<${btnCode | mods};${col + 1};${row + 1}${pressed ? "M" : "m"}`;
}

const LOCAL_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})(\/[^\s"'<>)]*)?/i;
const EXTERNAL_AUTH_URL_RE =
  /https:\/\/(?:github\.com\/login\/device|claude\.ai\/[^\s"'<>)]+|console\.anthropic\.com\/[^\s"'<>)]+|accounts\.google\.com\/[^\s"'<>)]+|auth\.openai\.com\/[^\s"'<>)]+)[^\s"'<>)]*/i;
const DEVICE_CODE_RE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/;
const ANSI_STRIP_RE =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export const KittyTerminalPane: React.FC<KittyTerminalPaneProps> = ({
  surfaceActive = true,
  surfaceId = "pane",
  themeId,
  fontSize,
  preferWebGpu,
  initialCommand,
  cwd,
  focused = true,
  forceTouchBar = false,
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
  const [status, setStatus] = useState<"connecting" | "connected" | "exited">(
    "connecting",
  );
  const session = React.useContext(WindowSessionContext);
  const [touchSelecting, setTouchSelecting] = useState(false);
  const [terminalMenu, setTerminalMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [outputTail, setOutputTail] = useState("");
  const revision =
    surfaceId + ":" + useSurfaceRevision(status, cwd, outputTail);
  useAppSurface(
    {
      revision,
      status:
        status === "connected"
          ? "live"
          : status === "connecting"
            ? "loading"
            : "disconnected",
      state: {
        cwd,
        status,
        outputTail,
        contentAccess: "terminal buffer via selection",
      },
      actions: {
        clear: {
          label: "Effacer l’affichage du terminal",
          run: () => {
            termRef.current?.clear();
            rendererRef.current?.markDirty();
            return { cleared: true };
          },
        },
      },
    },
    session?.appId === "terminal" && surfaceActive,
  );
  const copySelection = async () => {
    const text = extractSelectedText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (session)
        contextStore.add({
          contextId:
            wmStore.getSnapshot().windows.find((w) => w.id === session.id)
              ?.contextId ?? session.id,
          kind: "text",
          text,
          source: {
            windowId: session.id,
            appId: session.appId,
            title: "Terminal",
            confidence: "app",
          },
        });
    } catch {
      wmStore.pushToast(
        "Copie refusée",
        "Le navigateur a refusé l’accès au presse-papiers.",
        "warn",
      );
    }
  };

  const [detectedUrl, setDetectedUrl] = useState<{
    port: number;
    path: string;
  } | null>(null);
  const [externalLink, setExternalLink] = useState<{
    url: string;
    code?: string;
  } | null>(null);
  const [hasDomFocus, setHasDomFocus] = useState(false);
  const [ctrlArmed, setCtrlArmed] = useState(false);
  const { isMobile, isTouch } = useViewport();
  const showTouchBar = forceTouchBar || isMobile || isTouch;
  const recentDeviceCodeRef = useRef<string | null>(null);
  const recentTextRef = useRef<string>("");
  useEffect(() => {
    const timer = setInterval(
      () => setOutputTail(recentTextRef.current.slice(-1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const touchScrollYRef = useRef<number | null>(null);
  const searchStateRef = useRef<{ query: string; index: number }>({
    query: "",
    index: -1,
  });

  const focusInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // Re-assert focus after mousedown default browser blur/selection settling
    requestAnimationFrame(() => {
      if (document.activeElement !== el && focused) {
        el.focus({ preventScroll: true });
      }
    });
  };

  useEffect(() => {
    if (focused) {
      focusInput();
    }
  }, [focused]);

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
    const { cols, rows } = r.computeGrid(
      container.clientWidth,
      container.clientHeight,
    );
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

    // Forward @xterm/headless terminal query responses (DSR \x1b[6n], DA1/DA2, etc.) back to the Linux PTY.
    // Required by interactive TUI apps like `gh auth login`, `claude`, `pi`, `fzf`, `nvim`.
    term.onData((data) => writeToPty(data));

    // Host browser bridge: `$BROWSER <url>` / `xdg-open <url>` inside Linux emits OSC 9999;open;<url>
    term.parser.registerOscHandler(9999, (data) => {
      if (data.startsWith("open;")) {
        const url = data.slice(5).trim();
        if (/^https?:\/\//i.test(url)) {
          const code = recentDeviceCodeRef.current ?? undefined;
          if (code) {
            navigator.clipboard.writeText(code).catch(() => {});
          }
          setExternalLink({ url, code });
          window.open(url, "_blank", "noopener,noreferrer");
          wmStore.pushToast(
            code ? `Open GitHub (${code} copied)` : "Open URL in Browser",
            url,
            "info",
            {
              label: code ? `Copy ${code} & Open` : "Open Link",
              url,
              copyText: code,
            },
          );
        }
      }
      return true;
    });

    const apiHandle: KittyTerminalHandle = {
      write: writeToPty,
      focus: () => inputRef.current?.focus({ preventScroll: true }),
      clear: () => {
        term.clear();
        renderer.selection = null;
        renderer.markDirty();
      },
      search: (query, dir = 1) => {
        const q = query.trim().toLowerCase();
        if (!q) {
          renderer.selection = null;
          searchStateRef.current = { query: "", index: -1 };
          renderer.markDirty();
          return { total: 0, current: 0 };
        }
        const buf = term.buffer.active;
        const matches: { absRow: number; col: number; len: number }[] = [];
        for (let r = 0; r < buf.length; r++) {
          const line = buf.getLine(r);
          if (!line) continue;
          const txt = line.translateToString(true);
          const low = txt.toLowerCase();
          let pos = low.indexOf(q);
          while (pos !== -1) {
            matches.push({ absRow: r, col: pos, len: q.length });
            pos = low.indexOf(q, pos + q.length);
          }
        }
        if (matches.length === 0) {
          renderer.selection = null;
          searchStateRef.current = { query: q, index: -1 };
          renderer.markDirty();
          return { total: 0, current: 0 };
        }
        let nextIdx =
          searchStateRef.current.query === q &&
          searchStateRef.current.index >= 0
            ? (searchStateRef.current.index + dir + matches.length) %
              matches.length
            : dir < 0
              ? matches.length - 1
              : 0;
        searchStateRef.current = { query: q, index: nextIdx };
        const m = matches[nextIdx]!;
        const targetTop = Math.max(0, m.absRow - Math.floor(term.rows / 2));
        term.scrollToLine(targetTop);
        const viewRow = Math.max(
          0,
          Math.min(term.rows - 1, m.absRow - buf.viewportY),
        );
        renderer.selection = {
          startCol: m.col,
          startRow: viewRow,
          endCol: m.col + m.len - 1,
          endRow: viewRow,
        };
        renderer.markDirty();
        return { total: matches.length, current: nextIdx + 1 };
      },
      clearSearch: () => {
        renderer.selection = null;
        searchStateRef.current = { query: "", index: -1 };
        renderer.markDirty();
      },
      getVisibleText: () => {
        const buf = term.buffer.active;
        const lines: string[] = [];
        const start = Math.max(0, buf.length - 300);
        for (let r = start; r < buf.length; r++) {
          const line = buf.getLine(r);
          if (line) lines.push(line.translateToString(true));
        }
        return lines.join("\n").trimEnd();
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

      const { cols, rows } = renderer.computeGrid(
        container.clientWidth,
        container.clientHeight,
      );
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
                BROWSER: "/tmp/unkernel-open",
              },
            });
          }),
        ),
      );

      if (disposed) {
        if (spawnRes._tag === "Right") spawnRes.right.close();
        return;
      }

      if (spawnRes._tag === "Left") {
        setStatus("exited");
        term.write(
          `\r\n\x1b[31m[unkernelOS] Waiting for Linux kernel to finish booting...\x1b[0m\r\n`,
        );
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
            const cleanText = text.replace(ANSI_STRIP_RE, "");
            recentTextRef.current = (recentTextRef.current + cleanText).slice(
              -512,
            );
            const rolling = recentTextRef.current;

            const urlMatch = LOCAL_URL_RE.exec(cleanText);
            if (urlMatch) {
              const port = Number(urlMatch[1]);
              if (port > 0 && port < 65536) {
                setDetectedUrl({ port, path: urlMatch[2] || "/" });
              }
            }
            const codeMatch = DEVICE_CODE_RE.exec(rolling);
            if (codeMatch && /one-time code|login\/device/i.test(rolling)) {
              recentDeviceCodeRef.current = codeMatch[1]!;
            }
            const extMatch = EXTERNAL_AUTH_URL_RE.exec(rolling);
            if (extMatch) {
              const url = extMatch[0]!.replace(/[.,;:]+$/, "");
              setExternalLink((prev) =>
                prev?.url === url &&
                prev?.code === (recentDeviceCodeRef.current ?? undefined)
                  ? prev
                  : { url, code: recentDeviceCodeRef.current ?? undefined },
              );
            }
            if (
              /Authentication complete|Logged in as|Logged in to github\.com/i.test(
                rolling,
              )
            ) {
              recentDeviceCodeRef.current = null;
              recentTextRef.current = "";
              setExternalLink(null);
              appRuntime.runFork(
                Effect.flatMap(GithubAuthService, (g) => g.checkAuth()),
              );
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
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n", () =>
            renderer.markDirty(),
          );
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

    const onGlobalMouseUp = () => {
      dragSelect.current = false;
      mouseDownBtn.current = null;
    };
    window.addEventListener("mouseup", onGlobalMouseUp);

    return () => {
      disposed = true;
      window.removeEventListener("mouseup", onGlobalMouseUp);
      ro.disconnect();
      ptyRef.current?.close();
      ptyRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [preferWebGpu]);

  const composingRef = useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      composingRef.current ||
      e.nativeEvent.isComposing ||
      e.key === "Process" ||
      e.key === "Dead"
    ) {
      return;
    }
    if (
      (e.metaKey || (e.ctrlKey && e.shiftKey)) &&
      e.key.toLowerCase() === "c"
    ) {
      const text = extractSelectedText();
      if (text) {
        void copySelection();
        e.preventDefault();
        return;
      }
    }
    if (
      (e.metaKey || (e.ctrlKey && e.shiftKey)) &&
      e.key.toLowerCase() === "v"
    ) {
      navigator.clipboard
        .readText()
        .then((t) => {
          if (t) ptyRef.current?.write(t).catch(() => {});
        })
        .catch(() => {});
      e.preventDefault();
      return;
    }

    const seq = keyEventToAnsi(
      e.nativeEvent,
      Boolean(termRef.current?.modes.applicationCursorKeysMode),
    );
    if (seq !== null) {
      e.preventDefault();
      e.stopPropagation();
      termRef.current?.scrollToBottom();
      if (ctrlArmed && seq.length === 1) {
        const ch = seq.toLowerCase();
        const ctrlSeq =
          ch >= "a" && ch <= "z"
            ? String.fromCharCode(ch.charCodeAt(0) - 96)
            : seq;
        setCtrlArmed(false);
        ptyRef.current?.write(ctrlSeq).catch(() => {});
      } else {
        ptyRef.current?.write(seq).catch(() => {});
      }
      rendererRef.current?.markDirty();
    }
  };

  const writePaste = (text: string) => {
    if (!text || !ptyRef.current) return;
    const bracketed = Boolean(termRef.current?.modes.bracketedPasteMode);
    const payload = bracketed ? `\x1b[200~${text}\x1b[201~` : text;
    ptyRef.current.write(payload).catch(() => {});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (composingRef.current) return;
    const val = e.target.value;
    if (val) {
      e.target.value = "";
      termRef.current?.scrollToBottom();
      if (ctrlArmed && val.length === 1) {
        const ch = val.toLowerCase();
        const ctrlSeq =
          ch >= "a" && ch <= "z"
            ? String.fromCharCode(ch.charCodeAt(0) - 96)
            : val;
        setCtrlArmed(false);
        ptyRef.current?.write(ctrlSeq).catch(() => {});
      } else {
        ptyRef.current?.write(val).catch(() => {});
      }
      rendererRef.current?.markDirty();
    }
  };

  const handleCompositionStart = () => {
    composingRef.current = true;
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLTextAreaElement>,
  ) => {
    composingRef.current = false;
    const val = e.currentTarget.value || e.data;
    e.currentTarget.value = "";
    if (val) {
      termRef.current?.scrollToBottom();
      ptyRef.current?.write(val).catch(() => {});
      rendererRef.current?.markDirty();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      writePaste(text);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const mode = termRef.current?.modes.mouseTrackingMode ?? "none";
    if (
      mode !== "none" &&
      !e.shiftKey &&
      canvasRef.current &&
      rendererRef.current
    ) {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const point = screenToElement(canvasRef.current!, e.clientX, e.clientY);
      const cell = rendererRef.current.pixelToCell(point.x, point.y);
      const btn = e.deltaY < 0 ? 64 : 65;
      ptyRef.current
        ?.write(encodeSgrMouse(btn, cell.col, cell.row, true, e))
        .catch(() => {});
      return;
    }
    const lines = Math.round(e.deltaY / 28);
    if (lines !== 0 && termRef.current) {
      termRef.current.scrollLines(lines);
      rendererRef.current?.markDirty();
    }
  };

  const dragSelect = useRef(false);
  const mouseDownBtn = useRef<number | null>(null);
  const lastMouseCell = useRef<{ col: number; row: number } | null>(null);

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

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" && !touchSelecting) return;
    const tracking = termRef.current?.modes.mouseTrackingMode ?? "none";
    if (e.button === 2 && tracking === "none") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Prevent default browser focus-steal/text-selection on the non-editable canvas wrapper
    // so the hidden textarea retains focus reliably when returning from another window.
    e.preventDefault();
    onFocus?.();
    focusInput();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;
    const point = screenToElement(canvasRef.current!, e.clientX, e.clientY);
    const cell = rendererRef.current.pixelToCell(point.x, point.y);

    const mode = termRef.current?.modes.mouseTrackingMode ?? "none";
    if (mode !== "none" && !e.shiftKey) {
      const btn = e.button === 1 ? 1 : e.button === 2 ? 2 : 0;
      mouseDownBtn.current = btn;
      lastMouseCell.current = cell;
      ptyRef.current
        ?.write(encodeSgrMouse(btn, cell.col, cell.row, true, e))
        .catch(() => {});
      return;
    }

    // Middle-click paste when not in mouse tracking mode
    if (e.button === 1) {
      navigator.clipboard
        .readText()
        .then((t) => writePaste(t))
        .catch(() => {});
      return;
    }

    dragSelect.current = true;
    rendererRef.current.selection = {
      startCol: cell.col,
      startRow: cell.row,
      endCol: cell.col,
      endRow: cell.row,
    };
    rendererRef.current.markDirty();
  };

  const handleMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" && !touchSelecting) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;
    const point = screenToElement(canvasRef.current!, e.clientX, e.clientY);
    const cell = rendererRef.current.pixelToCell(point.x, point.y);

    const mode = termRef.current?.modes.mouseTrackingMode ?? "none";
    if (mode !== "none" && !e.shiftKey) {
      const moved =
        !lastMouseCell.current ||
        lastMouseCell.current.col !== cell.col ||
        lastMouseCell.current.row !== cell.row;
      if (!moved) return;
      lastMouseCell.current = cell;
      if (
        mode === "any" ||
        (mode === "drag" && mouseDownBtn.current !== null)
      ) {
        const baseBtn =
          mouseDownBtn.current !== null ? mouseDownBtn.current : 3;
        ptyRef.current
          ?.write(encodeSgrMouse(baseBtn | 32, cell.col, cell.row, true, e))
          .catch(() => {});
      }
      return;
    }

    if (!dragSelect.current || !rendererRef.current.selection) return;
    rendererRef.current.selection.endCol = cell.col;
    rendererRef.current.selection.endRow = cell.row;
    rendererRef.current.markDirty();
  };

  const handleMouseUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const mode = termRef.current?.modes.mouseTrackingMode ?? "none";
    if (
      mode !== "none" &&
      !e.shiftKey &&
      mouseDownBtn.current !== null &&
      canvasRef.current &&
      rendererRef.current
    ) {
      const rect = canvasRef.current.getBoundingClientRect();
      const point = screenToElement(canvasRef.current!, e.clientX, e.clientY);
      const cell = rendererRef.current.pixelToCell(point.x, point.y);
      const btn = mouseDownBtn.current;
      mouseDownBtn.current = null;
      if (mode !== "x10") {
        ptyRef.current
          ?.write(encodeSgrMouse(btn, cell.col, cell.row, false, e))
          .catch(() => {});
      }
      return;
    }
    mouseDownBtn.current = null;

    if (!dragSelect.current) return;
    dragSelect.current = false;
    const sel = rendererRef.current?.selection;
    if (sel && sel.startCol === sel.endCol && sel.startRow === sel.endRow) {
      rendererRef.current!.selection = null;
      rendererRef.current!.markDirty();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    const mode = termRef.current?.modes.mouseTrackingMode ?? "none";
    e.preventDefault();
    if (mode === "none" || e.shiftKey)
      setTerminalMenu({
        x: Math.min(e.clientX, window.innerWidth - 210),
        y: Math.min(e.clientY, window.innerHeight - 200),
      });
  };

  const sendVirtualKey = (seq: string) => {
    onFocus?.();
    termRef.current?.scrollToBottom();
    ptyRef.current?.write(seq).catch(() => {});
    rendererRef.current?.markDirty();
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchScrollYRef.current = e.touches[0]!.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (
      touchSelecting ||
      e.touches.length !== 1 ||
      touchScrollYRef.current === null ||
      !termRef.current
    )
      return;
    const y = e.touches[0]!.clientY;
    const dy = touchScrollYRef.current - y;
    if (Math.abs(dy) >= 18) {
      const lines = Math.round(dy / 18);
      termRef.current.scrollLines(lines);
      rendererRef.current?.markDirty();
      touchScrollYRef.current = y;
    }
  };

  const handleTouchEnd = () => {
    touchScrollYRef.current = null;
  };

  return (
    <div
      style={{ backgroundColor: theme.bg }}
      className="flex flex-col w-full h-full overflow-hidden"
    >
      {showTouchBar && (
        <div className="flex items-center gap-2 px-2 py-1 text-[10px] border-b border-white/10">
          <button
            type="button"
            aria-pressed={touchSelecting}
            onClick={() => setTouchSelecting((v) => !v)}
            className="px-2 py-1 rounded bg-white/10"
          >
            {touchSelecting
              ? "Sélection tactile active"
              : "Sélectionner du texte"}
          </button>
          <button
            type="button"
            onClick={() => void copySelection()}
            className="px-2 py-1 rounded bg-white/10"
          >
            Copier la sélection
          </button>
        </div>
      )}
      {terminalMenu &&
        createPortal(
          <div
            className="horizon-menu-scrim"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setTerminalMenu(null);
            }}
          >
            <div
              role="menu"
              className="horizon-menu"
              style={{ left: terminalMenu.x, top: terminalMenu.y }}
            >
              <button
                role="menuitem"
                onClick={() => {
                  void copySelection();
                  setTerminalMenu(null);
                }}
              >
                Copier la sélection
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  navigator.clipboard
                    .readText()
                    .then(writePaste)
                    .catch(() =>
                      wmStore.pushToast(
                        "Collage refusé",
                        "Utilisez le raccourci de collage du navigateur.",
                        "warn",
                      ),
                    );
                  setTerminalMenu(null);
                }}
              >
                Coller
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setTerminalMenu(null);
                  setTouchSelecting((v) => !v);
                }}
              >
                Sélection tactile
              </button>
              <button role="menuitem" onClick={() => setTerminalMenu(null)}>
                Fermer
              </button>
            </div>
          </div>,
          document.body,
        )}
      <div
        ref={containerRef}
        tabIndex={0}
        onFocus={() => {
          onFocus?.();
          inputRef.current?.focus({ preventScroll: true });
        }}
        onClick={() => {
          onFocus?.();
          inputRef.current?.focus({ preventScroll: true });
        }}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={() => {
          dragSelect.current = false;
          mouseDownBtn.current = null;
        }}
        onLostPointerCapture={() => {
          dragSelect.current = false;
          mouseDownBtn.current = null;
        }}
        style={{ touchAction: touchSelecting ? "none" : "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        className={`relative flex-1 min-h-0 w-full overflow-hidden cursor-text outline-none transition-shadow ${
          hasDomFocus
            ? "ring-1 ring-inset ring-violet-400/35"
            : focused
              ? "ring-1 ring-inset ring-white/10"
              : "opacity-90"
        }`}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Hidden textarea for native keyboard, IME & clipboard events */}
        <textarea
          ref={inputRef}
          autoFocus={focused && !showTouchBar}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          onFocus={() => setHasDomFocus(true)}
          onBlur={() => setHasDomFocus(false)}
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          aria-label="Terminal Input"
          className="absolute opacity-0 w-1 h-1 top-0 left-0 resize-none overflow-hidden"
        />

        {/* WebGPU / Kitty HUD badge */}
        <div className="pointer-events-none absolute bottom-2 right-2.5 flex items-center gap-1.5 text-[10px] font-mono">
          {externalLink && (
            <div className="pointer-events-auto flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-violet-600/90 border border-violet-300/40 text-white shadow-lg shadow-violet-950/50 backdrop-blur-md">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (externalLink.code) {
                    navigator.clipboard
                      .writeText(externalLink.code)
                      .catch(() => {});
                  }
                  window.open(
                    externalLink.url,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
                className="flex items-center gap-1 hover:underline cursor-pointer"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                {externalLink.code
                  ? `Copy ${externalLink.code} & Open GitHub`
                  : `Open ${externalLink.url.replace(/^https?:\/\//, "").slice(0, 28)}`}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExternalLink(null);
                }}
                className="p-0.5 rounded-full hover:bg-white/20 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
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

      {/* AAA Touch & Mobile Virtual Terminal Accessory Keybar */}
      {showTouchBar && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 px-1.5 py-1.5 bg-black/70 border-t border-white/10 overflow-x-auto no-scrollbar shrink-0 select-none"
        >
          {(
            [
              ["ESC", "\x1b"],
              ["TAB", "\t"],
            ] as const
          ).map(([label, seq]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => sendVirtualKey(seq)}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 active:bg-violet-500/40 text-[11px] font-mono font-semibold text-zinc-100 shrink-0"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCtrlArmed((v) => !v);
              inputRef.current?.focus({ preventScroll: true });
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold shrink-0 border transition ${
              ctrlArmed
                ? "bg-violet-500/40 border-violet-300/60 text-white"
                : "bg-white/10 border-transparent text-zinc-100"
            }`}
          >
            CTRL
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => sendVirtualKey("\x03")}
            className="px-2 py-1.5 rounded-lg bg-rose-500/20 active:bg-rose-500/40 text-[11px] font-mono font-semibold text-rose-200 shrink-0"
          >
            ^C
          </button>
          {(
            [
              ["↑", "\x1b[A"],
              ["↓", "\x1b[B"],
              ["←", "\x1b[D"],
              ["→", "\x1b[C"],
              ["|", "|"],
              ["/", "/"],
              ["~", "~"],
              ["-", "-"],
              ["_", "_"],
            ] as const
          ).map(([label, seq]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => sendVirtualKey(seq)}
              className="min-w-[32px] px-2 py-1.5 rounded-lg bg-white/8 active:bg-white/25 text-xs font-mono text-zinc-200 shrink-0"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              navigator.clipboard
                .readText()
                .then((t) => writePaste(t))
                .catch(() => {});
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 active:bg-white/25 text-[11px] font-mono text-zinc-200 shrink-0"
            title="Paste Clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.focus({ preventScroll: true })}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/20 active:bg-cyan-500/35 text-[11px] font-mono text-cyan-200 shrink-0"
            title="Show Soft Keyboard"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
