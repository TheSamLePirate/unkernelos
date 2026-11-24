import { Effect } from "effect";
import { Columns2, Minus, Palette, Plus, Rows2, Terminal, X } from "lucide-react";
import React, { useState } from "react";
import { appRuntime, SettingsService, useSubscriptionRef } from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG, type KittyThemeId } from "../../core/schema.ts";
import { KITTY_THEMES } from "../../gpu/webgpu-terminal.ts";
import { KittyTerminalPane } from "./KittyTerminalPane.tsx";

interface TermTab {
  readonly id: string;
  readonly title: string;
  readonly split: "single" | "vertical" | "horizontal";
  readonly panes: readonly string[];
  readonly activePane: string;
}

const makeTab = (idx: number): TermTab => {
  const p = `pane-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: `tab-${Math.random().toString(36).slice(2, 7)}`,
    title: `kitty #${idx}`,
    split: "single",
    panes: [p],
    activePane: p,
  };
};

export const KittyTerminalApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const [tabs, setTabs] = useState<TermTab[]>(() => [makeTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]!.id);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;

  const addTab = () => {
    const t = makeTab(tabs.length + 1);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next[next.length - 1]!.id);
      return next;
    });
  };

  const toggleSplit = (mode: "vertical" | "horizontal") => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTab.id) return t;
        if (t.split === mode && t.panes.length > 1) {
          return { ...t, split: "single", panes: [t.panes[0]!], activePane: t.panes[0]! };
        }
        const second = t.panes[1] ?? `pane-${Math.random().toString(36).slice(2, 7)}`;
        return { ...t, split: mode, panes: [t.panes[0]!, second], activePane: second };
      })
    );
  };

  const setTheme = (kittyTheme: KittyThemeId) => {
    appRuntime.runFork(
      Effect.flatMap(SettingsService, (s) => s.updateConfig({ kittyTheme }))
    );
    setThemePickerOpen(false);
  };

  const bumpFont = (delta: number) => {
    const next = Math.max(10, Math.min(22, cfg.terminalFontSize + delta));
    appRuntime.runFork(
      Effect.flatMap(SettingsService, (s) => s.updateConfig({ terminalFontSize: next }))
    );
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e16]/90">
      {/* Kitty-style Tab & Action Bar */}
      <div className="flex items-center justify-between h-9 px-2 bg-black/40 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => {
            const active = t.id === activeTab.id;
            return (
              <div
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                className={`group flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-mono cursor-pointer transition ${
                  active
                    ? "bg-white/12 text-zinc-100 border border-white/15"
                    : "text-zinc-400 hover:bg-white/6 hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3 h-3 text-cyan-400" />
                <span className="max-w-[120px] truncate">{t.title}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addTab}
            title="New Tab"
            className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Kitty Controls: Splits, Font Size, Theme */}
        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={() => toggleSplit("vertical")}
            title="Vertical Split"
            className={`p-1.5 rounded-md transition ${
              activeTab.split === "vertical"
                ? "bg-violet-500/25 text-violet-300"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleSplit("horizontal")}
            title="Horizontal Split"
            className={`p-1.5 rounded-md transition ${
              activeTab.split === "horizontal"
                ? "bg-violet-500/25 text-violet-300"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Rows2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() => bumpFont(-1)}
            title="Decrease font size"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 w-7 text-center">
            {cfg.terminalFontSize}
          </span>
          <button
            type="button"
            onClick={() => bumpFont(1)}
            title="Increase font size"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Plus className="w-3 h-3" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() => setThemePickerOpen((o) => !o)}
            title="Kitty Color Theme"
            className="flex items-center gap-1.5 px-2 h-7 rounded-md text-xs text-zinc-300 hover:bg-white/10 transition"
          >
            <Palette className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden sm:inline">{KITTY_THEMES[cfg.kittyTheme]?.name}</span>
          </button>

          {themePickerOpen && (
            <div className="absolute right-0 top-9 z-50 w-48 rounded-xl glass-surface p-1.5 shadow-2xl">
              {(Object.keys(KITTY_THEMES) as KittyThemeId[]).map((id) => {
                const th = KITTY_THEMES[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                      cfg.kittyTheme === id
                        ? "bg-violet-500/25 text-white"
                        : "text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    <span>{th.name}</span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: th.bg }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: th.cursor }} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Panes Viewport */}
      <div className="relative flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTab.id ? "flex" : "hidden"} ${
              tab.split === "horizontal" ? "flex-col" : "flex-row"
            } gap-px bg-white/10`}
          >
            {tab.panes.map((paneId) => (
              <div key={paneId} className="flex-1 min-w-0 min-h-0">
                <KittyTerminalPane
                  themeId={cfg.kittyTheme}
                  fontSize={cfg.terminalFontSize}
                  preferWebGpu={cfg.webgpuTerminal}
                  focused={windowFocused && tab.id === activeTab.id && tab.activePane === paneId}
                  onFocus={() =>
                    setTabs((prev) =>
                      prev.map((t) => (t.id === tab.id ? { ...t, activePane: paneId } : t))
                    )
                  }
                  onTitleChange={(title) =>
                    setTabs((prev) =>
                      prev.map((t) => (t.id === tab.id ? { ...t, title: title.slice(0, 24) || t.title } : t))
                    )
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
