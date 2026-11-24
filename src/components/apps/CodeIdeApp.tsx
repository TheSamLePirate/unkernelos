import { Effect } from "effect";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  FilePlus,
  Folder,
  FolderOpen,
  Play,
  RefreshCw,
  Save,
  Search,
  TerminalSquare,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../core/fs-service.ts";
import {
  appRuntime,
  GuestFsService,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../../core/schema.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { KittyTerminalPane, type KittyTerminalHandle } from "./KittyTerminalPane.tsx";

interface OpenTab {
  readonly path: string;
  readonly name: string;
  readonly content: string;
  readonly savedContent: string;
}

interface SearchHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    html: "html",
    css: "css",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    wgsl: "wgsl",
    glsl: "glsl",
    c: "c",
    cpp: "cpp",
    h: "c",
    sql: "sql",
  };
  return map[ext] ?? "text";
}

const KEYWORDS = new Set([
  "import", "export", "from", "default", "const", "let", "var", "function", "return",
  "if", "else", "for", "while", "switch", "case", "break", "continue", "async", "await",
  "try", "catch", "finally", "throw", "new", "class", "extends", "interface", "type",
  "enum", "readonly", "public", "private", "protected", "true", "false", "null", "undefined",
  "def", "lambda", "with", "as", "pass", "elif", "yield", "fn", "pub", "struct", "impl",
  "match", "use", "mod", "mut", "package", "func", "defer", "go", "select", "chan",
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCode(code: string, lang: string): string {
  if (lang === "text") return escapeHtml(code);
  const lines = code.split("\n");
  return lines
    .map((line) => {
      // Comments first
      if ((lang === "python" || lang === "bash" || lang === "yaml") && /^\s*#/.test(line)) {
        return `<span class="text-zinc-500 italic">${escapeHtml(line)}</span>`;
      }
      if (/^\s*\/\//.test(line)) {
        return `<span class="text-zinc-500 italic">${escapeHtml(line)}</span>`;
      }

      let out = "";
      let i = 0;
      while (i < line.length) {
        const ch = line[i]!;
        // Inline // comment
        if (ch === "/" && line[i + 1] === "/" && lang !== "html" && lang !== "css") {
          out += `<span class="text-zinc-500 italic">${escapeHtml(line.slice(i))}</span>`;
          break;
        }
        // Strings
        if (ch === '"' || ch === "'" || ch === "`") {
          const quote = ch;
          let j = i + 1;
          while (j < line.length) {
            if (line[j] === "\\") j += 2;
            else if (line[j] === quote) {
              j++;
              break;
            } else j++;
          }
          out += `<span class="text-emerald-300">${escapeHtml(line.slice(i, j))}</span>`;
          i = j;
          continue;
        }
        // Numbers
        if (/[0-9]/.test(ch) && (i === 0 || !/[a-zA-Z0-9_$]/.test(line[i - 1]!))) {
          let j = i;
          while (j < line.length && /[0-9._xXa-fA-F]/.test(line[j]!)) j++;
          out += `<span class="text-amber-300">${escapeHtml(line.slice(i, j))}</span>`;
          i = j;
          continue;
        }
        // Identifiers / Keywords / Types
        if (/[a-zA-Z_$]/.test(ch)) {
          let j = i;
          while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j]!)) j++;
          const word = line.slice(i, j);
          if (KEYWORDS.has(word)) {
            out += `<span class="text-fuchsia-400 font-medium">${escapeHtml(word)}</span>`;
          } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
            out += `<span class="text-cyan-300">${escapeHtml(word)}</span>`;
          } else if (line[j] === "(") {
            out += `<span class="text-sky-300">${escapeHtml(word)}</span>`;
          } else {
            out += escapeHtml(word);
          }
          i = j;
          continue;
        }
        // HTML tags
        if (ch === "<" && (lang === "html" || lang === "tsx" || lang === "jsx")) {
          const m = /^<\/?[a-zA-Z][a-zA-Z0-9.-]*/.exec(line.slice(i));
          if (m) {
            out += `<span class="text-rose-400">${escapeHtml(m[0])}</span>`;
            i += m[0].length;
            continue;
          }
        }
        out += escapeHtml(ch);
        i++;
      }
      return out;
    })
    .join("\n");
}

function fileDotColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "bg-sky-400";
  if (ext === "js" || ext === "jsx") return "bg-amber-400";
  if (ext === "py") return "bg-emerald-400";
  if (ext === "json") return "bg-yellow-300";
  if (ext === "css") return "bg-fuchsia-400";
  if (ext === "html") return "bg-orange-400";
  if (ext === "md") return "bg-cyan-300";
  return "bg-zinc-400";
}

export const CodeIdeApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const wm = useWm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const [rootDir, setRootDir] = useState(wm.activeWorkspaceDir || "/home/user/workspace");
  const [sidebarMode, setSidebarMode] = useState<"tree" | "search">("tree");
  const [dirMap, setDirMap] = useState<Record<string, readonly FsEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [saving, setSaving] = useState(false);

  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const termRef = useRef<KittyTerminalHandle | null>(null);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;

  const loadDirectory = useCallback(async (dir: string) => {
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listDir(dir)))
    );
    if (res._tag === "Right") {
      setDirMap((prev) => ({ ...prev, [dir]: res.right }));
    }
  }, []);

  useEffect(() => {
    setExpandedDirs({ [rootDir]: true });
    void loadDirectory(rootDir);
  }, [rootDir, loadDirectory]);

  useEffect(() => {
    if (wm.activeWorkspaceDir && wm.activeWorkspaceDir !== rootDir) {
      setRootDir(wm.activeWorkspaceDir);
    }
  }, [wm.activeWorkspaceDir]);

  useEffect(() => {
    if (wm.ideOpenFilePath) {
      const target = wm.ideOpenFilePath;
      wmStore.clearIdeOpenFile();
      void openFile(target);
    }
  }, [wm.ideOpenFilePath]);

  const toggleDir = (dir: string) => {
    const next = !expandedDirs[dir];
    setExpandedDirs((prev) => ({ ...prev, [dir]: next }));
    if (next) void loadDirectory(dir);
  };

  const openFile = async (filePath: string, name?: string) => {
    const existing = tabs.find((t) => t.path === filePath);
    if (existing) {
      setActivePath(filePath);
      return;
    }
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileText(filePath)))
    );
    if (res._tag === "Right") {
      const tab: OpenTab = {
        path: filePath,
        name: name || filePath.split("/").pop() || filePath,
        content: res.right,
        savedContent: res.right,
      };
      setTabs((prev) => [...prev, tab]);
      setActivePath(filePath);
    } else {
      wmStore.pushToast("Open Failed", res.left.message, "error");
    }
  };

  const updateActiveContent = (next: string) => {
    if (!activePath) return;
    setTabs((prev) => prev.map((t) => (t.path === activePath ? { ...t, content: next } : t)));
  };

  const saveActiveTab = useCallback(async () => {
    if (!activeTab) return;
    setSaving(true);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          const vm = yield* VmService;
          yield* fs.writeFileText(activeTab.path, activeTab.content);
          yield* vm.syncDisk();
        })
      )
    );
    setSaving(false);
    if (res._tag === "Right") {
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTab.path ? { ...t, savedContent: activeTab.content } : t))
      );
      wmStore.pushToast("Saved", activeTab.path, "success");
    } else {
      wmStore.pushToast("Save Error", res.left.message, "error");
    }
  }, [activeTab]);

  const closeTab = (path: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activePath === path) {
        setActivePath(next[next.length - 1]?.path ?? null);
      }
      return next;
    });
  };

  const createNewFile = async () => {
    const rel = window.prompt(`New file path inside ${rootDir}:`, "app.ts");
    if (!rel?.trim()) return;
    const fullPath = `${rootDir}/${rel.trim()}`.replace(/\/+/g, "/");
    const parent = fullPath.split("/").slice(0, -1).join("/") || "/";
    await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          yield* fs.mkdir(parent);
          yield* fs.writeFileText(fullPath, "");
        })
      )
    );
    await loadDirectory(rootDir);
    await openFile(fullPath);
  };

  const runActiveFile = () => {
    if (!activeTab) return;
    setShowTerminal(true);
    const ext = activeTab.name.split(".").pop()?.toLowerCase() ?? "";
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    let cmd = "";
    if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "mjs") {
      cmd = `bun run ${sq(activeTab.path)}`;
    } else if (ext === "py") {
      cmd = `python3 ${sq(activeTab.path)}`;
    } else if (ext === "sh") {
      cmd = `sh ${sq(activeTab.path)}`;
    } else {
      wmStore.pushToast("Run Hint", `Open terminal to run ${activeTab.name}`, "info");
      return;
    }
    setTimeout(() => {
      termRef.current?.write(`cd ${sq(rootDir)} && ${cmd}\n`);
      termRef.current?.focus();
    }, 120);
  };

  const runProjectSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.execShell(
            `cd ${sq(rootDir)} && (command -v rg >/dev/null 2>&1 && rg -n --max-count 5 --max-filesize 256K -- ${sq(q)} . || grep -rn --exclude-dir=node_modules --exclude-dir=.git -- ${sq(q)} .) | head -n 60`
          )
        )
      )
    );
    setSearching(false);
    if (res._tag === "Right") {
      const hits: SearchHit[] = [];
      for (const raw of res.right.stdout.split("\n")) {
        const m = /^([^:]+):(\d+):(.*)$/.exec(raw);
        if (m) {
          const rel = m[1]!.replace(/^\.\//, "");
          hits.push({
            file: `${rootDir}/${rel}`.replace(/\/+/g, "/"),
            line: Number(m[2]),
            text: m[3]!.trim(),
          });
        }
      }
      setSearchHits(hits);
    }
  };

  const highlightedHtml = useMemo(() => {
    if (!activeTab) return "";
    return highlightCode(activeTab.content, detectLanguage(activeTab.path)) + "\n";
  }, [activeTab?.content, activeTab?.path]);

  const lineCount = useMemo(
    () => (activeTab ? activeTab.content.split("\n").length : 0),
    [activeTab?.content]
  );

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  const updateCursor = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const lines = before.split("\n");
    setCursorInfo({ line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 });
  };

  const renderTree = (dir: string, depth = 0): React.ReactNode => {
    const entries = (dirMap[dir] ?? []).filter((e) => e.name !== "node_modules" && e.name !== ".git");
    return entries.map((entry) => {
      const expanded = Boolean(expandedDirs[entry.path]);
      const isSelected = activePath === entry.path;
      return (
        <div key={entry.path}>
          <button
            type="button"
            onClick={() => (entry.isDir ? toggleDir(entry.path) : void openFile(entry.path, entry.name))}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            className={`w-full flex items-center gap-1.5 pr-2 py-1 text-left text-xs rounded-md transition ${
              isSelected
                ? "bg-violet-500/25 text-white"
                : "text-zinc-300 hover:bg-white/6 hover:text-white"
            }`}
          >
            {entry.isDir ? (
              <>
                {expanded ? (
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
                )}
                {expanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <span className={`w-2 h-2 rounded-full shrink-0 ${fileDotColor(entry.name)}`} />
              </>
            )}
            <span className="truncate font-mono text-[11px]">{entry.name}</span>
          </button>
          {entry.isDir && expanded && renderTree(entry.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96 select-none">
      {/* Top IDE Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Code2 className="w-4 h-4 text-sky-400 shrink-0" />
          <input
            value={rootDir}
            onChange={(e) => setRootDir(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void loadDirectory(rootDir)}
            className="w-64 max-w-full px-2 py-0.5 rounded-md bg-black/50 border border-white/10 text-[11px] font-mono text-zinc-200 outline-none"
          />
          <button
            type="button"
            onClick={() => void loadDirectory(rootDir)}
            className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white"
            title="Refresh Tree"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void createNewFile()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/8 hover:bg-white/14 text-[11px] text-zinc-200 transition"
          >
            <FilePlus className="w-3 h-3 text-cyan-400" />
            New File
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab && (
            <>
              <button
                type="button"
                onClick={runActiveFile}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
                title="Run active file in integrated terminal"
              >
                <Play className="w-3 h-3" />
                Run
              </button>
              <button
                type="button"
                disabled={saving || activeTab.content === activeTab.savedContent}
                onClick={() => void saveActiveTab()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-600/85 hover:bg-violet-500 text-white disabled:opacity-40 transition"
                title="Save (⌘S)"
              >
                <Save className="w-3 h-3" />
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowTerminal((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition ${
              showTerminal
                ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                : "bg-white/6 border-white/10 text-zinc-400 hover:text-white"
            }`}
            title="Toggle Integrated Terminal"
          >
            <TerminalSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split: Sidebar | Editor + Terminal */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-56 shrink-0 bg-black/35 border-r border-white/10 flex flex-col min-h-0">
          <div className="grid grid-cols-2 p-1 gap-1 border-b border-white/8 text-[11px]">
            <button
              type="button"
              onClick={() => setSidebarMode("tree")}
              className={`py-1 rounded-lg font-medium transition ${
                sidebarMode === "tree" ? "bg-white/12 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Explorer
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode("search")}
              className={`py-1 rounded-lg font-medium transition ${
                sidebarMode === "search" ? "bg-white/12 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Search (rg)
            </button>
          </div>

          {sidebarMode === "tree" ? (
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">{renderTree(rootDir)}</div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 p-2 space-y-2">
              <div className="flex gap-1">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void runProjectSearch()}
                  placeholder="Search in project..."
                  className="flex-1 px-2 py-1 rounded-lg bg-black/50 border border-white/12 text-[11px] font-mono text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void runProjectSearch()}
                  className="p-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1">
                {searching && <p className="text-[11px] text-zinc-500 px-1">Searching...</p>}
                {searchHits.map((h, i) => (
                  <button
                    key={`${h.file}:${h.line}:${i}`}
                    type="button"
                    onClick={() => void openFile(h.file)}
                    className="w-full text-left p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/10 transition"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                      <span className="truncate">{h.file.replace(rootDir, "").replace(/^\//, "")}</span>
                      <span className="text-zinc-500 ml-1">:{h.line}</span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">{h.text}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right: Tabs + Code Editor + Integrated Terminal */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Open File Tabs */}
          <div className="flex items-center gap-0.5 h-8 px-1.5 bg-black/40 border-b border-white/8 overflow-x-auto no-scrollbar shrink-0">
            {tabs.map((t) => {
              const dirty = t.content !== t.savedContent;
              const active = t.path === activePath;
              return (
                <div
                  key={t.path}
                  onClick={() => setActivePath(t.path)}
                  className={`group flex items-center gap-1.5 px-2.5 h-6 rounded-md text-[11px] font-mono cursor-pointer transition shrink-0 ${
                    active
                      ? "bg-white/12 text-white border border-white/15"
                      : "text-zinc-400 hover:bg-white/6 hover:text-zinc-200"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${fileDotColor(t.name)}`} />
                  <span>{t.name}</span>
                  {dirty && <span className="text-amber-400">●</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.path);
                    }}
                    className="opacity-50 group-hover:opacity-100 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {tabs.length === 0 && (
              <span className="text-[11px] text-zinc-500 px-2">Select a file from Explorer to start coding</span>
            )}
          </div>

          {/* Code Editor Surface */}
          <div className="flex-1 min-h-0 relative flex overflow-hidden bg-[#0c0e17]">
            {activeTab ? (
              <>
                {/* Line Numbers Gutter */}
                <div
                  ref={gutterRef}
                  className="w-12 shrink-0 py-3 pr-2.5 text-right font-mono text-[12px] leading-[1.6] text-zinc-600 bg-black/25 border-r border-white/6 overflow-hidden select-none"
                >
                  {Array.from({ length: Math.max(1, lineCount) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* Syntax Highlight Layer + Transparent Editable Textarea */}
                <div className="relative flex-1 min-w-0 overflow-hidden">
                  <pre
                    ref={preRef}
                    aria-hidden="true"
                    className="absolute inset-0 m-0 p-3 font-mono text-[12.5px] leading-[1.6] whitespace-pre overflow-hidden pointer-events-none text-zinc-100"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={activeTab.content}
                    onChange={(e) => {
                      updateActiveContent(e.target.value);
                      updateCursor();
                    }}
                    onScroll={syncScroll}
                    onKeyUp={updateCursor}
                    onClick={updateCursor}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                        e.preventDefault();
                        void saveActiveTab();
                        return;
                      }
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const s = ta.selectionStart;
                        const end = ta.selectionEnd;
                        const next = ta.value.slice(0, s) + "  " + ta.value.slice(end);
                        updateActiveContent(next);
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = s + 2;
                        });
                      }
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className="relative w-full h-full m-0 p-3 bg-transparent text-transparent caret-cyan-400 font-mono text-[12.5px] leading-[1.6] whitespace-pre overflow-auto outline-none resize-none select-text"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
                  <FileCode2 className="w-6 h-6 text-sky-400" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <div className="text-sm font-medium text-zinc-200">unkernelOS Code IDE</div>
                  <p className="text-xs text-zinc-400">
                    Edit files directly on your persistent Linux filesystem with syntax highlighting, project-wide <code className="text-cyan-300">rg</code> search, and integrated WebGPU terminal.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Integrated Bottom Terminal */}
          {showTerminal && (
            <div className="h-44 shrink-0 border-t border-white/12 flex flex-col">
              <div className="flex items-center justify-between px-2.5 py-1 bg-black/45 border-b border-white/8 text-[10px] font-mono text-zinc-400">
                <span>INTEGRATED TERMINAL · {rootDir}</span>
                <button
                  type="button"
                  onClick={() => setShowTerminal(false)}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <KittyTerminalPane
                  themeId={cfg.kittyTheme}
                  fontSize={12}
                  preferWebGpu={cfg.webgpuTerminal}
                  cwd={rootDir}
                  focused={windowFocused && !activeTab}
                  onReady={(h) => {
                    termRef.current = h;
                  }}
                />
              </div>
            </div>
          )}

          {/* Status Bar */}
          <div className="flex items-center justify-between px-3 py-1 bg-black/55 border-t border-white/8 text-[10px] font-mono text-zinc-400 shrink-0">
            <div className="flex items-center gap-3 truncate">
              <span>{activeTab ? activeTab.path : rootDir}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {activeTab && (
                <>
                  <span>
                    Ln {cursorInfo.line}, Col {cursorInfo.col}
                  </span>
                  <span className="uppercase text-cyan-300">{detectLanguage(activeTab.path)}</span>
                  <span>UTF-8</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
