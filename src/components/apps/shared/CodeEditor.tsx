import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { highlight, type HighlightLang } from "../../../core/microml.ts";

/** A character range in the editor text, rendered under the code. */
export interface EditorMarker {
  readonly start: number;
  readonly end: number;
  readonly kind: "error" | "focus";
}

export interface CodeEditorHandle {
  focus(): void;
  /** Insert text at the caret (replacing the selection) and keep the caret after it. */
  insert(text: string): void;
  /** Select a range and scroll it into view. */
  reveal(start: number, end?: number): void;
}

interface Props {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly lang: HighlightLang;
  /** ⌘/Ctrl+Enter */
  readonly onRun?: () => void;
  /** Caret offset after clicks / key moves. */
  readonly onCursor?: (offset: number) => void;
  readonly markers?: readonly EditorMarker[];
  /** 1-based lines whose number is shown in red. */
  readonly errorLines?: readonly number[];
  readonly fontSize?: number;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MARKER_CLASS: Record<EditorMarker["kind"], string> = {
  error: "underline decoration-wavy decoration-rose-400 decoration-2 underline-offset-4 bg-rose-500/15 rounded-sm",
  focus: "bg-amber-300/20 rounded-sm outline outline-1 outline-amber-300/40",
};

/** Text with transparent glyphs and highlighted marker ranges, layered under the textarea. */
function markersHtml(src: string, markers: readonly EditorMarker[]): string {
  const sorted = [...markers]
    .filter((m) => m.end > m.start)
    .map((m) => ({ ...m, start: Math.max(0, Math.min(src.length, m.start)), end: Math.max(0, Math.min(src.length, m.end)) }))
    .sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const m of sorted) {
    if (m.start < pos) continue; // overlapping markers: keep the first
    out += escapeHtml(src.slice(pos, m.start));
    out += `<span class="${MARKER_CLASS[m.kind]}">${escapeHtml(src.slice(m.start, m.end))}</span>`;
    pos = m.end;
  }
  return `${out}${escapeHtml(src.slice(pos))}\n`;
}

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, onChange, lang, onRun, onCursor, markers = [], errorLines = [], fontSize = 12.5 },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const layers = useRef<(HTMLPreElement | null)[]>([]);
  const gutterRef = useRef<HTMLDivElement>(null);

  const sourceHtml = useMemo(() => `${highlight(value, lang)}\n`, [value, lang]);
  const overlayHtml = useMemo(() => (markers.length ? markersHtml(value, markers) : ""), [value, markers]);
  const lineCount = value.split("\n").length;
  const errorSet = useMemo(() => new Set(errorLines), [errorLines]);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    for (const el of layers.current) {
      if (el) {
        el.scrollTop = ta.scrollTop;
        el.scrollLeft = ta.scrollLeft;
      }
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    insert: (text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const { selectionStart: a, selectionEnd: b } = ta;
      onChange(`${value.slice(0, a)}${text}${value.slice(b)}`);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = a + text.length;
        onCursor?.(a + text.length);
      });
    },
    reveal: (start: number, end = start) => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
      const line = value.slice(0, start).split("\n").length - 1;
      const lineHeight = fontSize * 1.6;
      const target = line * lineHeight - ta.clientHeight / 3;
      ta.scrollTop = Math.max(0, target);
      syncScroll();
    },
  }));

  const reportCursor = () => {
    const ta = textareaRef.current;
    if (ta && onCursor) onCursor(ta.selectionStart);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = ta;
      onChange(`${value.slice(0, a)}  ${value.slice(b)}`);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = a + 2;
      });
    }
  };

  const textStyle: React.CSSProperties = { fontSize: `${fontSize}px` };
  const layerClass = "absolute inset-0 m-0 p-3 font-mono leading-[1.6] whitespace-pre overflow-hidden pointer-events-none";

  return (
    <div className="relative flex-1 min-h-0 flex">
      <div
        ref={gutterRef}
        style={textStyle}
        className="w-10 shrink-0 py-3 pr-2 text-right font-mono leading-[1.6] text-zinc-600 bg-black/25 border-r border-white/6 overflow-hidden select-none"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={errorSet.has(i + 1) ? "text-rose-400 font-semibold" : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        {overlayHtml && (
          <pre
            ref={(el) => {
              layers.current[0] = el;
            }}
            aria-hidden="true"
            style={textStyle}
            className={`${layerClass} text-transparent`}
            dangerouslySetInnerHTML={{ __html: overlayHtml }}
          />
        )}
        <pre
          ref={(el) => {
            layers.current[1] = el;
          }}
          aria-hidden="true"
          style={textStyle}
          className={`${layerClass} text-zinc-100`}
          dangerouslySetInnerHTML={{ __html: sourceHtml }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onCursor?.(e.target.selectionStart);
          }}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onKeyUp={reportCursor}
          onClick={reportCursor}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          style={textStyle}
          className="absolute inset-0 w-full h-full m-0 p-3 font-mono leading-[1.6] whitespace-pre bg-transparent text-transparent caret-amber-300 resize-none outline-none selection:bg-amber-400/25"
        />
      </div>
    </div>
  );
});
