import { Effect } from "effect";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  FileCode2,
  FilePlus,
  FileSearch,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Minus,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Replace,
  Save,
  Search,
  Terminal,
  TerminalSquare,
  Trash2,
  WrapText,
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
import { useIsMobile } from "../../core/use-viewport.ts";
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

  const isMobile = useIsMobile();
  const [rootDir, setRootDir] = useState(wm.activeWorkspaceDir || "/home/user/workspace");
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
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
  const [wordWrap, setWordWrap] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(12.5);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [allProjectFiles, setAllProjectFiles] = useState<readonly string[]>([]);

  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const termRef = useRef<KittyTerminalHandle | null>(null);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;

  const commitRootDir = (nextDir: string) => {
    const clean = nextDir.trim().replace(/\/+/g, "/") || "/home/user/workspace";
    setRootDir(clean);
    wmStore.setWorkspaceDir(clean);
    void loadDirectory(clean);
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    termRef.current?.write(`cd ${sq(clean)}\n`);
  };

  // Global IDE keyboard shortcuts (⌘P Quick Open, ⌘F Find & Replace, ⌘⇧S Save All)
  useEffect(() => {
    if (!windowFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "p") {
        e.preventDefault();
        void openQuickPicker();
      } else if (k === "f") {
        e.preventDefault();
        setFindOpen((v) => !v);
      } else if (k === "s" && e.shiftKey) {
        e.preventDefault();
        void saveAllTabs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [windowFocused, rootDir, tabs]);

  const openQuickPicker = async () => {
    setQuickOpen(true);
    setQuickQuery("");
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.execShell(
            `cd ${sq(rootDir)} && find . -maxdepth 4 -type f ! -path '*/.git/*' ! -path '*/node_modules/*' 2>/dev/null | sed 's|^\\./||' | sort | head -n 300`
          )
        )
      )
    );
    if (res._tag === "Right") {
      setAllProjectFiles(res.right.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
    }
  };

  const saveAllTabs = async () => {
    const dirtyTabs = tabs.filter((t) => t.content !== t.savedContent);
    if (dirtyTabs.length === 0) return;
    setSaving(true);
    for (const t of dirtyTabs) {
      await appRuntime.runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.writeFileText(t.path, t.content)))
      );
    }
    await appRuntime.runPromise(Effect.either(Effect.flatMap(VmService, (vm) => vm.syncDisk())));
    setSaving(false);
    setTabs((prev) => prev.map((t) => ({ ...t, savedContent: t.content })));
    wmStore.pushToast("Saved All", `${dirtyTabs.length} file(s) saved`, "success");
  };

  const findMatches = useMemo(() => {
    if (!activeTab || !findQuery) return [];
    const low = activeTab.content.toLowerCase();
    const q = findQuery.toLowerCase();
    const hits: number[] = [];
    let pos = low.indexOf(q);
    while (pos !== -1) {
      hits.push(pos);
      pos = low.indexOf(q, pos + Math.max(1, q.length));
    }
    return hits;
  }, [activeTab?.content, findQuery]);

  const jumpToMatch = (idx: number) => {
    if (!findMatches.length || !textareaRef.current) return;
    const safe = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
    setFindIdx(safe);
    const start = findMatches[safe]!;
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(start, start + findQuery.length);
    const lineNum = ta.value.slice(0, start).split("\n").length;
    ta.scrollTop = Math.max(0, (lineNum - 5) * (editorFontSize * 1.6));
    syncScroll();
  };

  const replaceOne = () => {
    if (!activeTab || !findMatches.length) return;
    const safe = ((findIdx % findMatches.length) + findMatches.length) % findMatches.length;
    const start = findMatches[safe]!;
    const next =
      activeTab.content.slice(0, start) +
      replaceText +
      activeTab.content.slice(start + findQuery.length);
    updateActiveContent(next);
  };

  const replaceAll = () => {
    if (!activeTab || !findQuery) return;
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = activeTab.content.replace(new RegExp(escaped, "gi"), replaceText);
    updateActiveContent(next);
  };

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
      if (isMobile) setSidebarOpen(false);
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

  const createNewFile = async (baseDir = rootDir) => {
    const rel = window.prompt(`New file path inside ${baseDir}:`, "app.ts");
    if (!rel?.trim()) return;
    const fullPath = `${baseDir}/${rel.trim()}`.replace(/\/+/g, "/");
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
    await loadDirectory(baseDir);
    if (baseDir !== rootDir) await loadDirectory(rootDir);
    await openFile(fullPath);
  };

  const createNewFolder = async (baseDir = rootDir) => {
    const rel = window.prompt(`New folder name inside ${baseDir}:`, "components");
    if (!rel?.trim()) return;
    const fullPath = `${baseDir}/${rel.trim()}`.replace(/\/+/g, "/");
    await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.mkdir(fullPath)))
    );
    await loadDirectory(baseDir);
    if (baseDir !== rootDir) await loadDirectory(rootDir);
  };

  const renameEntry = async (entry: FsEntry) => {
    const nextName = window.prompt(`Rename ${entry.name} to:`, entry.name);
    if (!nextName?.trim() || nextName.trim() === entry.name) return;
    const parent = entry.path.split("/").slice(0, -1).join("/") || "/";
    const toPath = `${parent}/${nextName.trim()}`.replace(/\/+/g, "/");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.rename(entry.path, toPath)))
    );
    if (res._tag === "Right") {
      setTabs((prev) =>
        prev.map((t) =>
          t.path === entry.path ? { ...t, path: toPath, name: nextName.trim() } : t
        )
      );
      if (activePath === entry.path) setActivePath(toPath);
      await loadDirectory(parent);
    } else {
      wmStore.pushToast("Rename Failed", res.left.message, "error");
    }
  };

  const deleteEntry = async (entry: FsEntry) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    const parent = entry.path.split("/").slice(0, -1).join("/") || "/";
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.remove(entry.path)))
    );
    if (res._tag === "Right") {
      closeTab(entry.path);
      await loadDirectory(parent);
    } else {
      wmStore.pushToast("Delete Failed", res.left.message, "error");
    }
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
          <div
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => (entry.isDir ? toggleDir(entry.path) : void openFile(entry.path, entry.name))}
            className={`group w-full flex items-center justify-between gap-1 pr-1.5 py-1 text-left text-xs rounded-md cursor-pointer transition ${
              isSelected
                ? "bg-violet-500/25 text-white"
                : "text-zinc-300 hover:bg-white/6 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
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
            </div>
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              {entry.isDir && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void createNewFile(entry.path);
                  }}
                  title="New file here"
                  className="p-0.5 rounded hover:bg-white/15 text-zinc-400 hover:text-cyan-300"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void renameEntry(entry);
                }}
                title="Rename"
                className="p-0.5 rounded hover:bg-white/15 text-zinc-400 hover:text-white"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteEntry(entry);
                }}
                title="Delete"
                className="p-0.5 rounded hover:bg-rose-500/25 text-zinc-400 hover:text-rose-300"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {entry.isDir && expanded && renderTree(entry.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96 select-none">
      {/* Top IDE Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className={`p-1 rounded-md border transition shrink-0 ${
              sidebarOpen
                ? "bg-violet-500/20 border-violet-400/35 text-violet-200"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            }`}
            title="Toggle File Sidebar"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <Code2 className="hidden sm:block w-4 h-4 text-sky-400 shrink-0" />
          <input
            value={rootDir}
            onChange={(e) => setRootDir(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitRootDir(rootDir)}
            className="w-36 sm:w-60 max-w-full px-2 py-0.5 rounded-md bg-black/50 border border-white/10 text-[11px] font-mono text-zinc-200 outline-none focus:border-sky-400/50"
            title="Working Directory (press Enter to switch workspace)"
          />
          <button
            type="button"
            onClick={() => void loadDirectory(rootDir)}
            className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white shrink-0"
            title="Refresh Tree"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void createNewFile(rootDir)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/8 hover:bg-white/14 text-[11px] text-zinc-200 transition shrink-0"
            title="New File"
          >
            <FilePlus className="w-3 h-3 text-cyan-400" />
            <span className="hidden lg:inline">File</span>
          </button>
          <button
            type="button"
            onClick={() => void createNewFolder(rootDir)}
            className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/6 hover:bg-white/14 text-[11px] text-zinc-300 transition shrink-0"
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3 text-amber-400" />
          </button>
          <button
            type="button"
            onClick={() => void openQuickPicker()}
            className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/6 hover:bg-white/14 border border-white/10 text-[11px] text-zinc-300 transition shrink-0"
            title="Quick Open File (⌘P)"
          >
            <FileSearch className="w-3 h-3 text-violet-400" />
            <span className="font-mono text-[10px]">⌘P</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activeTab && (
            <>
              <button
                type="button"
                onClick={() => setFindOpen((v) => !v)}
                className={`p-1 rounded-lg border transition ${
                  findOpen
                    ? "bg-violet-500/25 border-violet-400/40 text-white"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                }`}
                title="Find & Replace (⌘F)"
              >
                <Replace className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setWordWrap((v) => !v)}
                className={`hidden sm:inline-flex p-1 rounded-lg border transition ${
                  wordWrap
                    ? "bg-cyan-500/20 border-cyan-400/35 text-cyan-200"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                }`}
                title="Toggle Word Wrap"
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>
              <div className="hidden xl:flex items-center bg-white/5 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setEditorFontSize((s) => Math.max(10, s - 1))}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Decrease editor font size"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditorFontSize((s) => Math.min(18, s + 1))}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Increase editor font size"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={runActiveFile}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
                title="Run active file in integrated terminal"
              >
                <Play className="w-3 h-3" />
                <span className="hidden sm:inline">Run</span>
              </button>
              <button
                type="button"
                disabled={saving || activeTab.content === activeTab.savedContent}
                onClick={() => void saveActiveTab()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-violet-600/85 hover:bg-violet-500 text-white disabled:opacity-40 transition"
                title="Save (⌘S) · Save All (⌘⇧S)"
              >
                <Save className="w-3 h-3" />
                <span className="hidden sm:inline">{saving ? "..." : "Save"}</span>
              </button>
            </>
          )}
          <div className="hidden lg:flex items-center gap-0.5 pl-1 ml-0.5 border-l border-white/10">
            <button
              type="button"
              onClick={() => wmStore.openTerminalInDir(rootDir)}
              className="p-1 rounded-md text-zinc-400 hover:text-cyan-300 hover:bg-white/10"
              title="Open Kitty Terminal in this folder"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wmStore.openDirInGit(rootDir)}
              className="p-1 rounded-md text-zinc-400 hover:text-orange-300 hover:bg-white/10"
              title="Open Git for this workspace"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wmStore.openDirInStudio(rootDir)}
              className="p-1 rounded-md text-zinc-400 hover:text-violet-300 hover:bg-white/10"
              title="Open Agent Studio in this workspace"
            >
              <Bot className="w-3.5 h-3.5" />
            </button>
          </div>
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
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        {/* Left Sidebar (Collapsible Drawer on Mobile) */}
        {sidebarOpen && (
          <aside className="absolute md:relative inset-y-0 left-0 z-20 w-56 shrink-0 bg-[#0b0e17]/98 md:bg-black/35 border-r border-white/10 flex flex-col min-h-0 shadow-2xl md:shadow-none">
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
        )}

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

          {/* In-File Find & Replace Bar */}
          {findOpen && activeTab && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-black/60 border-b border-white/10 text-xs shrink-0">
              <Search className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <input
                autoFocus
                value={findQuery}
                onChange={(e) => {
                  setFindQuery(e.target.value);
                  setFindIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") jumpToMatch(e.shiftKey ? findIdx - 1 : findIdx + 1);
                  if (e.key === "Escape") setFindOpen(false);
                }}
                placeholder="Find..."
                className="w-36 px-2 py-0.5 rounded bg-black/60 border border-white/12 text-[11px] font-mono text-white outline-none"
              />
              <span className="text-[10px] font-mono text-zinc-400 min-w-[44px]">
                {findMatches.length > 0 ? `${(findIdx % findMatches.length) + 1}/${findMatches.length}` : "0/0"}
              </span>
              <button
                type="button"
                onClick={() => jumpToMatch(findIdx - 1)}
                className="p-0.5 rounded hover:bg-white/10 text-zinc-300"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => jumpToMatch(findIdx + 1)}
                className="p-0.5 rounded hover:bg-white/10 text-zinc-300"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace..."
                className="w-32 px-2 py-0.5 rounded bg-black/60 border border-white/12 text-[11px] font-mono text-white outline-none"
              />
              <button
                type="button"
                onClick={replaceOne}
                disabled={!findMatches.length}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/18 text-[11px] text-zinc-200 disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={!findMatches.length}
                className="px-2 py-0.5 rounded bg-violet-600/80 hover:bg-violet-500 text-[11px] text-white disabled:opacity-40"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFindOpen(false)}
                className="ml-auto p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Code Editor Surface */}
          <div className="flex-1 min-h-0 relative flex overflow-hidden bg-[#0c0e17]">
            {activeTab ? (
              <>
                {/* Line Numbers Gutter */}
                <div
                  ref={gutterRef}
                  style={{ fontSize: `${editorFontSize}px` }}
                  className="w-12 shrink-0 py-3 pr-2.5 text-right font-mono leading-[1.6] text-zinc-600 bg-black/25 border-r border-white/6 overflow-hidden select-none"
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
                    style={{ fontSize: `${editorFontSize}px` }}
                    className={`absolute inset-0 m-0 p-3 font-mono leading-[1.6] overflow-hidden pointer-events-none text-zinc-100 ${
                      wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    }`}
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
                    style={{ fontSize: `${editorFontSize}px` }}
                    className={`relative w-full h-full m-0 p-3 bg-transparent text-transparent caret-cyan-400 font-mono leading-[1.6] overflow-auto outline-none resize-none select-text ${
                      wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    }`}
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

      {/* Quick Open File Modal (⌘P) */}
      {quickOpen && (
        <div
          onClick={() => setQuickOpen(false)}
          className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm flex items-start justify-center pt-14 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl glass-surface-focused overflow-hidden shadow-2xl animate-window-in"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
              <FileSearch className="w-4 h-4 text-violet-400" />
              <input
                autoFocus
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuickOpen(false);
                  if (e.key === "Enter") {
                    const first = allProjectFiles.find((f) =>
                      f.toLowerCase().includes(quickQuery.trim().toLowerCase())
                    );
                    if (first) {
                      setQuickOpen(false);
                      void openFile(`${rootDir}/${first}`.replace(/\/+/g, "/"));
                    }
                  }
                }}
                placeholder="Quick open file in workspace..."
                className="flex-1 bg-transparent text-xs font-mono text-white outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
              {allProjectFiles
                .filter((f) => !quickQuery.trim() || f.toLowerCase().includes(quickQuery.trim().toLowerCase()))
                .slice(0, 40)
                .map((rel) => (
                  <button
                    key={rel}
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      void openFile(`${rootDir}/${rel}`.replace(/\/+/g, "/"));
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-left text-xs font-mono text-zinc-200 transition"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${fileDotColor(rel)}`} />
                    <span className="truncate">{rel}</span>
                  </button>
                ))}
              {allProjectFiles.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">No files found in {rootDir}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
