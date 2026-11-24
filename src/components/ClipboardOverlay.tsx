import { Check, ClipboardList, Copy, Pin, Search, Trash2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { clipboardStore, useClipboardHistory } from "../core/clipboard-store.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

/**
 * Universal Persistent Clipboard History Manager (⌘⇧V / Ctrl+Shift+V).
 * Shared across host copy events, `pbcopy`, `osctl system.clipboard.write`, and manual snippets.
 */
export const ClipboardOverlay: React.FC = () => {
  const wm = useWm();
  const entries = useClipboardHistory();
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!wm.clipboardOpen) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") wmStore.setClipboardOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wm.clipboardOpen]);

  if (!wm.clipboardOpen) return null;

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((e) => !q || e.text.toLowerCase().includes(q));

  const copyEntry = async (id: string, text: string) => {
    await clipboardStore.copyToHost(text, "manual");
    setCopiedId(id);
    wmStore.pushToast("Copied from History", text.slice(0, 80), "success");
    setTimeout(() => {
      setCopiedId(null);
      wmStore.setClipboardOpen(false);
    }, 350);
  };

  return (
    <div
      onClick={() => wmStore.setClipboardOpen(false)}
      className="fixed inset-0 z-[102] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl glass-surface-focused overflow-hidden shadow-2xl animate-window-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ClipboardList className="w-4 h-4 text-amber-400" />
            Universal Clipboard History
            <span className="text-[10px] font-mono text-zinc-400">({entries.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => clipboardStore.clearUnpinned()}
                className="text-[11px] text-zinc-400 hover:text-rose-300 px-2 py-0.5 rounded-lg hover:bg-white/6"
              >
                Clear Unpinned
              </button>
            )}
            <button
              type="button"
              onClick={() => wmStore.setClipboardOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/8 bg-black/30">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter clipboard history (pbcopy, host & agents)..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">
            ⌘⇧V
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              No clipboard entries yet. Copy text or run <code className="text-amber-300">echo hi | pbcopy</code> in Linux.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => void copyEntry(item.id, item.text)}
                className={`group p-2.5 rounded-2xl border cursor-pointer transition ${
                  item.pinned
                    ? "bg-amber-500/10 border-amber-400/30 hover:bg-amber-500/15"
                    : "bg-white/[0.03] border-white/8 hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <pre className="text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words line-clamp-3 flex-1">
                    {item.text}
                  </pre>
                  <div className="flex items-center gap-1 shrink-0">
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clipboardStore.togglePin(item.id);
                      }}
                      className={`p-1 rounded hover:bg-white/10 ${
                        item.pinned ? "text-amber-400" : "text-zinc-500 hover:text-zinc-200"
                      }`}
                      title={item.pinned ? "Unpin" : "Pin snippet"}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clipboardStore.remove(item.id);
                      }}
                      className="p-1 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-300"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>{item.source}</span>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
