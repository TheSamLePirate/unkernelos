import { Effect } from "effect";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  Eraser,
  Folder,
  Keyboard,
  Minus,
  Palette,
  Plus,
  Rows2,
  Search,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { appRuntime, SettingsService, useSubscriptionRef } from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG, type KittyThemeId } from "../../core/schema.ts";
import { KITTY_THEMES } from "../../gpu/webgpu-terminal.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { KittyTerminalPane, type KittyTerminalHandle } from "./KittyTerminalPane.tsx";

interface TermPane {
  readonly id: string;
  readonly cwd: string;
  readonly initialCommand?: string;
}

interface TermTab {
  readonly id: string;
  readonly title: string;
  readonly split: "single" | "vertical" | "horizontal";
  readonly panes: readonly TermPane[];
  readonly activePane: string;
}

const QUICK_SNIPPETS: readonly { label: string; cmd: string; desc: string }[] = [
  { label: "List Files", cmd: "ls -la", desc: "Detailed directory listing" },
  { label: "Git Status", cmd: "git status -sb", desc: "Short git status & branch" },
  { label: "Bun Dev Server", cmd: "bun run dev", desc: "Start dev server in workspace" },
  { label: "Claude Code", cmd: "claude", desc: "Interactive Claude Code agent" },
  { label: "Pi Agent", cmd: "pi", desc: "Interactive Pi coding agent" },
  { label: "Wayland Foot", cmd: "wland foot &", desc: "Open native Wayland desktop window" },
  { label: "3D GL kmscube", cmd: "kmscube &", desc: "Run VirGL 3D KMS demo" },
  { label: "System Info", cmd: "uname -a && nproc && free -h", desc: "Kernel, vCPUs & RAM" },
  { label: "Disk Usage", cmd: "df -h / /data", desc: "Persistent ext4 disk usage" },
];

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const makePane = (cwd: string, initialCommand?: string): TermPane => ({
  id: `pane-${Math.random().toString(36).slice(2, 7)}`,
  cwd,
  initialCommand,
});

const makeTab = (idx: number, cwd: string, title?: string, initialCommand?: string): TermTab => {
  const p = makePane(cwd, initialCommand);
  const shortDir = cwd.split("/").filter(Boolean).pop() || "shell";
  return {
    id: `tab-${Math.random().toString(36).slice(2, 7)}`,
    title: title || `${shortDir} #${idx}`,
    split: "single",
    panes: [p],
    activePane: p.id,
  };
};

export const KittyTerminalApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const [tabs, setTabs] = useState<TermTab[]>(() => [makeTab(1, wm.activeWorkspaceDir || "/home/user/workspace")]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]!.id);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatch, setSearchMatch] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const [forceTouchBar, setForceTouchBar] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const paneHandlesRef = useRef<Map<string, KittyTerminalHandle>>(new Map());
  const handledLaunchReqRef = useRef<number>(0);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;

  const getActiveHandle = (): KittyTerminalHandle | undefined =>
    paneHandlesRef.current.get(activeTab.activePane);

  // Honor cross-app "Open Terminal Here" requests (from Files, IDE, Studio, TopBar, Command Palette)
  useEffect(() => {
    const req = wm.terminalLaunchRequest;
    if (!req || req.id === handledLaunchReqRef.current) return;
    handledLaunchReqRef.current = req.id;
    wmStore.clearTerminalLaunchRequest(req.id);
    const t = makeTab(tabs.length + 1, req.cwd, req.title, req.command);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, [wm.terminalLaunchRequest]);

  // Terminal keyboard shortcuts when focused (Alt+T new tab, Alt+W close tab, Alt+D split, Ctrl+Shift+F search)
  useEffect(() => {
    if (!windowFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || (e.ctrlKey && e.shiftKey)) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        addTab();
      } else if (k === "w" && tabs.length > 1) {
        e.preventDefault();
        closeTab(activeTab.id);
      } else if (k === "d") {
        e.preventDefault();
        toggleSplit(e.shiftKey ? "horizontal" : "vertical");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [windowFocused, tabs.length, activeTab.id]);

  const addTab = (cwd = wm.activeWorkspaceDir || "/home/user/workspace") => {
    const t = makeTab(tabs.length + 1, cwd);
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
          return { ...t, split: "single", panes: [t.panes[0]!], activePane: t.panes[0]!.id };
        }
        const second = t.panes[1] ?? makePane(wm.activeWorkspaceDir || "/home/user/workspace");
        return { ...t, split: mode, panes: [t.panes[0]!, second], activePane: second.id };
      })
    );
  };

  const setTheme = (kittyTheme: KittyThemeId) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig({ kittyTheme })));
    setThemePickerOpen(false);
  };

  const bumpFont = (delta: number) => {
    const next = Math.max(10, Math.min(22, cfg.terminalFontSize + delta));
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig({ terminalFontSize: next })));
  };

  const syncToWorkspace = () => {
    const h = getActiveHandle();
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    h?.write(`mkdir -p ${sq(dir)} && cd ${sq(dir)}\n`);
    h?.focus();
  };

  const runSearch = (q: string, dir: 1 | -1 = 1) => {
    setSearchQuery(q);
    const res = getActiveHandle()?.search(q, dir) ?? { total: 0, current: 0 };
    setSearchMatch(res);
  };

  const copyScrollback = () => {
    const text = getActiveHandle()?.getVisibleText() ?? "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => wmStore.pushToast("Copied", "Terminal output copied to clipboard", "success"),
      () => {}
    );
  };

  const runSnippet = (cmd: string) => {
    const h = getActiveHandle();
    h?.write(`${cmd}\n`);
    h?.focus();
    setSnippetsOpen(false);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e16]/90">
      {/* Kitty-style Tab & Action Bar */}
      <div className="flex items-center justify-between gap-1 h-9 px-2 bg-black/45 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {tabs.map((t) => {
            const active = t.id === activeTab.id;
            const isRenaming = renamingTabId === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                onDoubleClick={() => {
                  setRenamingTabId(t.id);
                  setRenameText(t.title);
                }}
                className={`group flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-mono cursor-pointer transition shrink-0 ${
                  active
                    ? "bg-white/12 text-zinc-100 border border-white/15"
                    : "text-zinc-400 hover:bg-white/6 hover:text-zinc-200"
                }`}
                title="Double-click to rename tab"
              >
                <Terminal className="w-3 h-3 text-cyan-400 shrink-0" />
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => {
                      if (renameText.trim()) {
                        setTabs((prev) =>
                          prev.map((x) => (x.id === t.id ? { ...x, title: renameText.trim().slice(0, 24) } : x))
                        );
                      }
                      setRenamingTabId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenamingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-24 bg-black/60 px-1 rounded text-xs text-white outline-none border border-cyan-400/50"
                  />
                ) : (
                  <span className="max-w-[120px] truncate">{t.title}</span>
                )}
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    className="opacity-50 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addTab()}
            title={`New Tab in ${wm.activeWorkspaceDir} (Alt+T)`}
            className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Kitty Controls: Workspace CD, Search, Snippets, Clear, Copy, Splits, Font Size, Theme */}
        <div className="flex items-center gap-0.5 sm:gap-1 relative shrink-0">
          <button
            type="button"
            onClick={syncToWorkspace}
            title={`cd ${wm.activeWorkspaceDir}`}
            className="hidden sm:flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-mono bg-amber-500/12 hover:bg-amber-500/22 border border-amber-400/25 text-amber-200 transition"
          >
            <Folder className="w-3 h-3 text-amber-400" />
            <span className="max-w-[90px] truncate">
              {wm.activeWorkspaceDir.split("/").filter(Boolean).pop() || "ws"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => {
                if (v) getActiveHandle()?.clearSearch();
                return !v;
              });
            }}
            title="Search Scrollback (⌘F)"
            className={`p-1.5 rounded-md transition ${
              searchOpen ? "bg-cyan-500/25 text-cyan-200" : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSnippetsOpen((v) => !v);
              setThemePickerOpen(false);
            }}
            title="Quick Command Snippets"
            className={`p-1.5 rounded-md transition ${
              snippetsOpen ? "bg-violet-500/25 text-violet-200" : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={copyScrollback}
            title="Copy Terminal Output"
            className="hidden sm:inline-flex p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              getActiveHandle()?.clear();
              getActiveHandle()?.focus();
            }}
            title="Clear Screen"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          <div className="hidden md:block h-4 w-px bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={() => toggleSplit("vertical")}
            title="Vertical Split (Alt+D)"
            className={`hidden md:inline-flex p-1.5 rounded-md transition ${
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
            title="Horizontal Split (Alt+Shift+D)"
            className={`hidden md:inline-flex p-1.5 rounded-md transition ${
              activeTab.split === "horizontal"
                ? "bg-violet-500/25 text-violet-300"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Rows2 className="w-3.5 h-3.5" />
          </button>

          <div className="hidden lg:block h-4 w-px bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={() => bumpFont(-1)}
            title="Decrease font size"
            className="hidden lg:inline-flex p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="hidden lg:inline text-[11px] font-mono text-zinc-400 w-6 text-center">
            {cfg.terminalFontSize}
          </span>
          <button
            type="button"
            onClick={() => bumpFont(1)}
            title="Increase font size"
            className="hidden lg:inline-flex p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Plus className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => setForceTouchBar((v) => !v)}
            title="Toggle Virtual Accessory Keys"
            className={`hidden sm:inline-flex p-1.5 rounded-md transition ${
              forceTouchBar ? "bg-cyan-500/25 text-cyan-200" : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setThemePickerOpen((o) => !o);
              setSnippetsOpen(false);
            }}
            title="Kitty Color Theme"
            className="flex items-center gap-1 px-1.5 sm:px-2 h-7 rounded-md text-xs text-zinc-300 hover:bg-white/10 transition"
          >
            <Palette className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden xl:inline">{KITTY_THEMES[cfg.kittyTheme]?.name}</span>
          </button>

          {/* Snippets Popover */}
          {snippetsOpen && (
            <div className="absolute right-0 top-9 z-50 w-64 rounded-2xl glass-surface-focused p-1.5 shadow-2xl space-y-0.5 animate-window-in">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Quick Linux Commands
              </div>
              {QUICK_SNIPPETS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => runSnippet(s.cmd)}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-white/10 transition"
                >
                  <div className="flex items-center justify-between text-xs text-white font-medium">
                    <span>{s.label}</span>
                    <code className="text-[10px] font-mono text-cyan-300">{s.cmd}</code>
                  </div>
                  <div className="text-[10px] text-zinc-500">{s.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Theme Picker Popover */}
          {themePickerOpen && (
            <div className="absolute right-0 top-9 z-50 w-48 rounded-xl glass-surface-focused p-1.5 shadow-2xl animate-window-in">
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

      {/* Scrollback Search Bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/55 border-b border-white/10 text-xs shrink-0">
          <Search className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value, 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(searchQuery, e.shiftKey ? -1 : 1);
              if (e.key === "Escape") {
                getActiveHandle()?.clearSearch();
                setSearchOpen(false);
              }
            }}
            placeholder="Find in terminal scrollback..."
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder:text-zinc-500 outline-none"
          />
          <span className="text-[11px] font-mono text-zinc-400">
            {searchMatch.total > 0 ? `${searchMatch.current}/${searchMatch.total}` : "0 matches"}
          </span>
          <button
            type="button"
            onClick={() => runSearch(searchQuery, -1)}
            className="p-1 rounded hover:bg-white/10 text-zinc-300"
            title="Previous match"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => runSearch(searchQuery, 1)}
            className="p-1 rounded hover:bg-white/10 text-zinc-300"
            title="Next match"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              getActiveHandle()?.clearSearch();
              setSearchOpen(false);
            }}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Panes Viewport */}
      <div className="relative flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTab.id ? "flex" : "hidden"} ${
              tab.split === "horizontal" ? "flex-col" : "flex-row"
            } gap-px bg-white/10`}
          >
            {tab.panes.map((pane) => (
              <div key={pane.id} className="flex-1 min-w-0 min-h-0">
                <KittyTerminalPane
                  themeId={cfg.kittyTheme}
                  fontSize={cfg.terminalFontSize}
                  preferWebGpu={cfg.webgpuTerminal}
                  cwd={pane.cwd}
                  initialCommand={pane.initialCommand}
                  forceTouchBar={forceTouchBar}
                  focused={windowFocused && tab.id === activeTab.id && tab.activePane === pane.id}
                  onReady={(h) => {
                    paneHandlesRef.current.set(pane.id, h);
                  }}
                  onFocus={() =>
                    setTabs((prev) =>
                      prev.map((t) => (t.id === tab.id ? { ...t, activePane: pane.id } : t))
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
