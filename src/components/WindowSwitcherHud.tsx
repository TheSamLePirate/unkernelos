import React, { useEffect, useState } from "react";
import { APP_CATALOG, useWm, wmStore } from "../wm/wm-store.ts";

/**
 * Alt+Tab / Option+Tab floating window switcher HUD across all open windows.
 */
export const WindowSwitcherHud: React.FC = () => {
  const wm = useWm();
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const ordered = [...wm.windows].sort((a, b) => b.zIndex - a.zIndex);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "Tab") {
        const list = [...wmStore.getSnapshot().windows].sort((a, b) => b.zIndex - a.zIndex);
        if (list.length < 2) return;
        e.preventDefault();
        setOpen(true);
        setSelectedIdx((prev) => {
          const base = open ? prev : 0;
          const delta = e.shiftKey ? -1 : 1;
          return (base + delta + list.length) % list.length;
        });
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" && open) {
        const list = [...wmStore.getSnapshot().windows].sort((a, b) => b.zIndex - a.zIndex);
        const chosen = list[selectedIdx];
        setOpen(false);
        if (chosen) {
          wmStore.focusWindow(chosen.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open, selectedIdx]);

  if (!open || ordered.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[108] flex items-center justify-center pointer-events-none">
      <div className="glass-surface-focused rounded-3xl px-4 py-3.5 flex items-center gap-2.5 max-w-[90vw] overflow-x-auto shadow-2xl animate-window-in">
        {ordered.map((win, idx) => {
          const def = APP_CATALOG[win.appId];
          const active = idx === selectedIdx;
          return (
            <div
              key={win.id}
              className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl w-28 shrink-0 transition ${
                active
                  ? "bg-white/18 ring-2 ring-violet-400/70 scale-105"
                  : "bg-white/[0.03] opacity-70"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${def.accent} flex items-center justify-center text-sm font-bold text-white shadow`}
              >
                {def.shortTitle[0]}
              </div>
              <div className="text-[11px] font-medium text-white truncate w-full text-center">
                {def.shortTitle}
              </div>
              <div className="text-[9px] font-mono text-zinc-400">Desktop {win.workspace}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
