import { Effect } from "effect";
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FileCode2,
  FileImage,
  FilePlus2,
  Folder,
  FolderGit2,
  FolderPlus,
  HardDrive,
  Home,
  LayoutGrid,
  List,
  PanelLeft,
  Pencil,
  RefreshCw,
  Save,
  Scissors,
  Search,
  Star,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../core/fs-service.ts";
import { appRuntime, GuestFsService, VmService } from "../../core/runtime.ts";
import { useIsMobile } from "../../core/use-viewport.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

const SIDEBAR_LOCATIONS = [
  { label: "Workspace Root", path: "/home/user/workspace", icon: Folder },
  { label: "Home", path: "/home/user", icon: Home },
  { label: "Persistent /data", path: "/data", icon: HardDrive },
  { label: "Root /", path: "/", icon: HardDrive },
  { label: "/etc", path: "/etc", icon: Folder },
  { label: "/tmp", path: "/tmp", icon: Folder },
];

type SortKey = "name" | "size" | "type";
type ViewMode = "list" | "grid";

interface ClipboardItem {
  readonly mode: "copy" | "cut";
  readonly entry: FsEntry;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const CODE_RE = /\.(ts|tsx|js|jsx|mjs|py|rs|go|sh|json|html|css|md|yml|yaml|toml|sql|c|cpp|h|wgsl|glsl)$/i;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

export const FileExplorerApp: React.FC = () => {
  const wm = useWm();
  const isMobile = useIsMobile();

  const [cwd, setCwd] = useState(wm.activeWorkspaceDir || "/home/user/workspace");
  const [history, setHistory] = useState<string[]>([wm.activeWorkspaceDir || "/home/user/workspace"]);
  const [histIdx, setHistIdx] = useState(0);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(cwd);

  const [entries, setEntries] = useState<readonly FsEntry[]>([]);
  const [projects, setProjects] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [selectedFile, setSelectedFile] = useState<FsEntry | null>(null);
  const [editorText, setEditorText] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listProjects("/home/user/workspace")))
    );
    if (res._tag === "Right") setProjects(res.right);
  }, []);

  const loadDir = useCallback(async (dir: string, pushHist = true) => {
    setLoading(true);
    setError(null);
    const clean = dir.trim().replace(/\/+/g, "/") || "/";
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listDir(clean)))
    );
    setLoading(false);
    if (res._tag === "Left") {
      if (clean.startsWith("/home/user/workspace")) {
        await appRuntime.runPromise(Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.mkdir(clean))));
        const retry = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listDir(clean)))
        );
        if (retry._tag === "Right") {
          setCwd(clean);
          setPathDraft(clean);
          setEntries(retry.right);
          return;
        }
      }
      setError(res.left.message);
    } else {
      setCwd(clean);
      setPathDraft(clean);
      setEntries(res.right);
      if (pushHist) {
        setHistory((prev) => {
          const next = [...prev.slice(0, histIdx + 1), clean];
          setHistIdx(next.length - 1);
          return next;
        });
      }
    }
  }, [histIdx]);

  useEffect(() => {
    void loadDir(cwd, false);
    void loadProjects();
  }, []);

  // Honor external "Open Dir in Explorer" requests (TopBar / Studio / IDE / Command Palette)
  useEffect(() => {
    if (wm.explorerTargetDir) {
      const target = wm.explorerTargetDir;
      wmStore.clearExplorerTargetDir();
      setSelectedFile(null);
      void loadDir(target, true);
    }
  }, [wm.explorerTargetDir]);

  // Cleanup image preview object URLs
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const goBack = () => {
    if (histIdx <= 0) return;
    const nextIdx = histIdx - 1;
    setHistIdx(nextIdx);
    void loadDir(history[nextIdx]!, false);
  };

  const goForward = () => {
    if (histIdx >= history.length - 1) return;
    const nextIdx = histIdx + 1;
    setHistIdx(nextIdx);
    void loadDir(history[nextIdx]!, false);
  };

  const goUp = () => {
    if (cwd === "/") return;
    const parent = cwd.split("/").slice(0, -1).join("/") || "/";
    void loadDir(parent, true);
  };

  const openEntry = async (entry: FsEntry) => {
    if (entry.isDir) {
      setSelectedFile(null);
      await loadDir(entry.path, true);
      if (isMobile) setSidebarOpen(false);
      return;
    }
    setSelectedFile(entry);
    setDirty(false);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }

    if (IMAGE_RE.test(entry.name)) {
      const res = await appRuntime.runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileBytes(entry.path)))
      );
      if (res._tag === "Right") {
        const bytes = new Uint8Array(res.right);
        const blob = new Blob([bytes.buffer], { type: guessMime(entry.name) });
        setImagePreviewUrl(URL.createObjectURL(blob));
        setEditorText("");
      } else {
        setEditorText(`[Error loading image: ${res.left.message}]`);
      }
      return;
    }

    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileText(entry.path)))
    );
    if (res._tag === "Right") {
      setEditorText(res.right);
    } else {
      setEditorText(`[Error reading file: ${res.left.message}]`);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          const vm = yield* VmService;
          yield* fs.writeFileText(selectedFile.path, editorText);
          yield* vm.syncDisk();
        })
      )
    );
    setSaving(false);
    if (res._tag === "Right") {
      setDirty(false);
      wmStore.pushToast("File Saved", selectedFile.path, "success");
      await loadDir(cwd, false);
    } else {
      wmStore.pushToast("Save Failed", res.left.message, "error");
    }
  };

  const handleCreate = async (kind: "file" | "dir") => {
    const name = window.prompt(kind === "dir" ? "New folder name:" : "New file name:");
    if (!name || !name.trim()) return;
    const target = `${cwd.replace(/\/$/, "")}/${name.trim()}`;
    const eff =
      kind === "dir"
        ? Effect.flatMap(GuestFsService, (fs) => fs.mkdir(target))
        : Effect.flatMap(GuestFsService, (fs) => fs.writeFileText(target, ""));
    const res = await appRuntime.runPromise(Effect.either(eff));
    if (res._tag === "Right") {
      await loadDir(cwd, false);
      if (kind === "dir") void loadProjects();
    } else {
      wmStore.pushToast("Error", res.left.message, "error");
    }
  };

  const handleRename = async (entry: FsEntry) => {
    const nextName = window.prompt(`Rename ${entry.name} to:`, entry.name);
    if (!nextName || !nextName.trim() || nextName.trim() === entry.name) return;
    const parent = entry.path.split("/").slice(0, -1).join("/") || "/";
    const toPath = `${parent}/${nextName.trim()}`.replace(/\/+/g, "/");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.rename(entry.path, toPath)))
    );
    if (res._tag === "Right") {
      if (selectedFile?.path === entry.path) setSelectedFile(null);
      wmStore.pushToast("Renamed", `${entry.name} → ${nextName.trim()}`, "success");
      await loadDir(cwd, false);
      void loadProjects();
    } else {
      wmStore.pushToast("Rename Failed", res.left.message, "error");
    }
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    const base = cwd.replace(/\/$/, "");
    let target = `${base}/${clipboard.entry.name}`;
    if (target === clipboard.entry.path) {
      target = `${base}/${clipboard.entry.name}.copy`;
    }
    const eff =
      clipboard.mode === "cut"
        ? Effect.flatMap(GuestFsService, (fs) => fs.rename(clipboard.entry.path, target))
        : Effect.flatMap(GuestFsService, (fs) => fs.copy(clipboard.entry.path, target));
    const res = await appRuntime.runPromise(Effect.either(eff));
    if (res._tag === "Right") {
      wmStore.pushToast(
        clipboard.mode === "cut" ? "Moved" : "Copied",
        `${clipboard.entry.name} → ${cwd}`,
        "success"
      );
      if (clipboard.mode === "cut") setClipboard(null);
      await loadDir(cwd, false);
    } else {
      wmStore.pushToast("Paste Failed", res.left.message, "error");
    }
  };

  const handleDelete = async (entry: FsEntry) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.remove(entry.path)))
    );
    if (res._tag === "Right") {
      if (selectedFile?.path === entry.path) setSelectedFile(null);
      await loadDir(cwd, false);
      void loadProjects();
    } else {
      wmStore.pushToast("Delete Failed", res.left.message, "error");
    }
  };

  const handleDownload = async (entry: FsEntry) => {
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileBytes(entry.path)))
    );
    if (res._tag === "Right") {
      const bytes = new Uint8Array(res.right);
      const blob = new Blob([bytes.buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const target = `${cwd.replace(/\/$/, "")}/${f.name}`;
      await appRuntime.runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.writeFileBytes(target, bytes)))
      );
    }
    wmStore.pushToast("Uploaded", `${files.length} file(s) copied into ${cwd}`, "success");
    await loadDir(cwd, false);
  };

  const isWorkspaceActive = cwd === wm.activeWorkspaceDir;
  const breadcrumbs = cwd.split("/").filter(Boolean);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (!showHidden && e.name.startsWith(".")) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortKey === "size") return b.size - a.size;
      if (sortKey === "type") {
        const ea = a.name.split(".").pop() ?? "";
        const eb = b.name.split(".").pop() ?? "";
        return ea.localeCompare(eb) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [entries, search, showHidden, sortKey]);

  return (
    <div
      className="flex flex-col w-full h-full bg-[#0a0c13]/94 select-none"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleUploadFiles(e.dataTransfer.files);
      }}
    >
      {/* Top Navigation, Path Bar & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className={`p-1.5 rounded-lg transition ${
              sidebarOpen ? "bg-amber-500/20 text-amber-200" : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
            title="Toggle Sidebar"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={histIdx <= 0}
            onClick={goBack}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/12 text-zinc-300 disabled:opacity-30"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={histIdx >= history.length - 1}
            onClick={goForward}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/12 text-zinc-300 disabled:opacity-30"
            title="Forward"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={cwd === "/"}
            onClick={goUp}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/12 text-zinc-300 disabled:opacity-30"
            title="Parent Folder"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          {/* Editable Breadcrumb / Path Input */}
          {editingPath ? (
            <input
              autoFocus
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => setEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditingPath(false);
                  void loadDir(pathDraft, true);
                }
                if (e.key === "Escape") {
                  setPathDraft(cwd);
                  setEditingPath(false);
                }
              }}
              className="flex-1 min-w-[140px] px-2.5 py-1 rounded-lg bg-black/60 border border-amber-400/50 text-xs font-mono text-white outline-none"
            />
          ) : (
            <div
              onDoubleClick={() => {
                setPathDraft(cwd);
                setEditingPath(true);
              }}
              className="flex items-center gap-0.5 text-xs font-mono overflow-x-auto no-scrollbar px-1.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/8 flex-1 min-w-[120px]"
              title="Double-click to edit path directly"
            >
              <button
                type="button"
                onClick={() => void loadDir("/", true)}
                className="px-1 py-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white shrink-0"
              >
                /
              </button>
              {breadcrumbs.map((part, idx) => {
                const full = "/" + breadcrumbs.slice(0, idx + 1).join("/");
                return (
                  <React.Fragment key={full}>
                    <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <button
                      type="button"
                      onClick={() => void loadDir(full, true)}
                      className="px-1 py-0.5 rounded hover:bg-white/10 text-zinc-200 truncate max-w-[120px] shrink-0"
                    >
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setPathDraft(cwd);
                  setEditingPath(true);
                }}
                className="ml-auto p-0.5 text-zinc-500 hover:text-zinc-200 shrink-0"
                title="Edit Path"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <Search className="w-3 h-3 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="bg-transparent text-xs text-zinc-200 outline-none w-20 sm:w-28"
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === "list" ? "grid" : "list"))}
            title={viewMode === "list" ? "Switch to Grid View" : "Switch to List View"}
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            {viewMode === "list" ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setSortKey((k) => (k === "name" ? "size" : k === "size" ? "type" : "name"))}
            title={`Sort by: ${sortKey} (click to cycle)`}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-white/6 hover:bg-white/12 text-[11px] text-zinc-300 capitalize"
          >
            <ArrowDownAZ className="w-3.5 h-3.5" />
            {sortKey}
          </button>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            title={showHidden ? "Hide dotfiles" : "Show dotfiles"}
            className={`p-1.5 rounded-lg transition ${
              showHidden ? "bg-white/10 text-zinc-200" : "bg-white/5 text-zinc-500"
            }`}
          >
            {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate("file")}
            title="New File"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleCreate("dir")}
            title="New Folder"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            title="Upload files from host"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void handleUploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => void loadDir(cwd, false)}
            title="Refresh"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Workspace & Cross-App Integration Ribbon */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/[0.025] border-b border-white/8 text-[11px] overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              wmStore.setWorkspaceDir(cwd);
              wmStore.pushToast("Active Workspace Set", cwd, "success");
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium transition ${
              isWorkspaceActive
                ? "bg-amber-500/20 border-amber-400/40 text-amber-200"
                : "bg-white/5 hover:bg-amber-500/15 border-white/10 text-zinc-300"
            }`}
          >
            {isWorkspaceActive ? <Check className="w-3 h-3" /> : <Star className="w-3 h-3 text-amber-400" />}
            {isWorkspaceActive ? "Active Workspace" : "Set as Workspace"}
          </button>

          <button
            type="button"
            onClick={() => wmStore.openTerminalInDir(cwd)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/12 hover:bg-cyan-500/22 border border-cyan-400/25 text-cyan-200 transition"
          >
            <Terminal className="w-3 h-3" />
            Terminal
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInIde(cwd)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/12 hover:bg-sky-500/22 border border-sky-400/25 text-sky-200 transition"
          >
            <Code2 className="w-3 h-3" />
            Code IDE
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInStudio(cwd)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/12 hover:bg-violet-500/22 border border-violet-400/25 text-violet-200 transition"
          >
            <Bot className="w-3 h-3" />
            Studio
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInGit(cwd)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/12 hover:bg-orange-500/22 border border-orange-400/25 text-orange-200 transition"
          >
            <FolderGit2 className="w-3 h-3" />
            Git
          </button>
        </div>

        {clipboard && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-zinc-400 font-mono truncate max-w-[140px]">
              {clipboard.mode === "cut" ? "Move:" : "Copy:"} {clipboard.entry.name}
            </span>
            <button
              type="button"
              onClick={() => void handlePaste()}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200"
            >
              <Clipboard className="w-3 h-3" />
              Paste Here
            </button>
            <button
              type="button"
              onClick={() => setClipboard(null)}
              className="p-0.5 text-zinc-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Main Split: Sidebar | File List/Grid | Preview & Quick Editor */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="absolute md:relative inset-y-0 left-0 z-20 w-44 shrink-0 bg-[#0b0e17]/98 md:bg-black/25 border-r border-white/8 p-2 space-y-3 overflow-y-auto shadow-2xl md:shadow-none">
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                Active Workspace
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadDir(wm.activeWorkspaceDir, true);
                  if (isMobile) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition ${
                  cwd === wm.activeWorkspaceDir
                    ? "bg-amber-500/22 text-amber-100 border border-amber-400/35"
                    : "text-zinc-300 hover:bg-white/6"
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate font-mono">
                  {wm.activeWorkspaceDir.split("/").filter(Boolean).pop() || "workspace"}
                </span>
              </button>
            </div>

            {projects.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Projects
                </div>
                {projects.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      void loadDir(p, true);
                      if (isMobile) setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs transition ${
                      cwd === p ? "bg-violet-500/20 text-white" : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="truncate font-mono">{p.split("/").pop()}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Locations
              </div>
              {SIDEBAR_LOCATIONS.map((loc) => {
                const Icon = loc.icon;
                const active = cwd === loc.path;
                return (
                  <button
                    key={loc.path}
                    type="button"
                    onClick={() => {
                      void loadDir(loc.path, true);
                      if (isMobile) setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition ${
                      active
                        ? "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                        : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{loc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* File List / Grid */}
        <div
          className={`flex-1 min-w-[200px] overflow-y-auto p-2 ${
            selectedFile ? "hidden sm:block sm:max-w-[340px] border-r border-white/8" : ""
          } ${dragOver ? "ring-2 ring-inset ring-cyan-400/60 bg-cyan-500/10" : ""}`}
        >
          {error && <div className="p-3 text-xs text-rose-400">{error}</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-8 text-center text-xs text-zinc-500">
              Empty directory. Drag &amp; drop files here to upload into Linux.
            </div>
          )}

          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((entry) => {
                const active = selectedFile?.path === entry.path;
                return (
                  <div
                    key={entry.path}
                    onClick={() => void openEntry(entry)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border cursor-pointer transition text-center ${
                      active
                        ? "bg-white/12 border-white/25 text-white"
                        : "bg-white/[0.02] border-white/6 hover:bg-white/[0.07] text-zinc-200"
                    }`}
                  >
                    {entry.isDir ? (
                      <Folder className="w-8 h-8 text-amber-400" />
                    ) : IMAGE_RE.test(entry.name) ? (
                      <FileImage className="w-8 h-8 text-pink-400" />
                    ) : CODE_RE.test(entry.name) ? (
                      <FileCode2 className="w-8 h-8 text-cyan-400" />
                    ) : (
                      <File className="w-8 h-8 text-zinc-400" />
                    )}
                    <span className="text-[11px] font-mono truncate w-full">{entry.name}</span>
                    <span className="text-[9px] font-mono text-zinc-500">
                      {entry.isDir ? "Folder" : formatSize(entry.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((entry) => {
                const active = selectedFile?.path === entry.path;
                return (
                  <div
                    key={entry.path}
                    onClick={() => void openEntry(entry)}
                    className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                      active ? "bg-white/12 text-white" : "text-zinc-300 hover:bg-white/6"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {entry.isDir ? (
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : IMAGE_RE.test(entry.name) ? (
                        <FileImage className="w-4 h-4 text-pink-400 shrink-0" />
                      ) : CODE_RE.test(entry.name) ? (
                        <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="truncate font-mono">{entry.name}</span>
                      {entry.gitStatus && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
                          {entry.gitStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="hidden lg:inline text-[10px] font-mono text-zinc-600 group-hover:hidden">
                        {entry.mtime}
                      </span>
                      {!entry.isDir && (
                        <span className="text-[10px] font-mono text-zinc-500 group-hover:hidden">
                          {formatSize(entry.size)}
                        </span>
                      )}
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRename(entry);
                          }}
                          title="Rename"
                          className="p-1 rounded hover:bg-white/15 text-zinc-300"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setClipboard({ mode: "copy", entry });
                          }}
                          title="Copy"
                          className="p-1 rounded hover:bg-white/15 text-zinc-300"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setClipboard({ mode: "cut", entry });
                          }}
                          title="Cut / Move"
                          className="p-1 rounded hover:bg-white/15 text-zinc-300"
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                        {!entry.isDir && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDownload(entry);
                            }}
                            title="Download"
                            className="p-1 rounded hover:bg-white/15 text-zinc-300"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(entry);
                          }}
                          title="Delete"
                          className="p-1 rounded hover:bg-rose-500/25 text-zinc-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rich File Previewer / Quick Editor */}
        {selectedFile && (
          <div className="flex-1 flex flex-col min-w-0 bg-[#070910]">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/45 border-b border-white/8 text-xs shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="sm:hidden p-1 rounded bg-white/8 text-zinc-300"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-zinc-200 truncate">
                  {selectedFile.name} {dirty ? <span className="text-amber-400">●</span> : null}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFile.path).catch(() => {});
                    wmStore.pushToast("Path Copied", selectedFile.path, "info");
                  }}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
                  title="Copy Path"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {!imagePreviewUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => wmStore.openFileInIde(selectedFile.path)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 transition"
                    >
                      <FileCode2 className="w-3 h-3" />
                      IDE
                    </button>
                    <button
                      type="button"
                      disabled={!dirty || saving}
                      onClick={() => void handleSave()}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition"
                    >
                      <Save className="w-3 h-3" />
                      {saving ? "..." : "Save"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="hidden sm:inline-flex p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {imagePreviewUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto gap-3">
                <img
                  src={imagePreviewUrl}
                  alt={selectedFile.name}
                  className="max-w-full max-h-[75%] rounded-xl border border-white/15 shadow-2xl object-contain bg-black/40"
                />
                <div className="text-[11px] font-mono text-zinc-400">
                  {selectedFile.name} · {formatSize(selectedFile.size)}
                </div>
              </div>
            ) : (
              <textarea
                value={editorText}
                onChange={(e) => {
                  setEditorText(e.target.value);
                  setDirty(true);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
                spellCheck={false}
                className="flex-1 w-full p-3 bg-transparent text-xs font-mono text-zinc-200 leading-relaxed outline-none resize-none select-text"
              />
            )}
          </div>
        )}
      </div>

      {/* Status Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-black/55 border-t border-white/8 text-[10px] font-mono text-zinc-400 shrink-0">
        <span className="truncate">
          {filtered.length} item{filtered.length === 1 ? "" : "s"} · {cwd}
        </span>
        <span className="shrink-0">
          {selectedFile
            ? `${selectedFile.permissions} · ${formatSize(selectedFile.size)}`
            : `Workspace: ${wm.activeWorkspaceDir.split("/").pop() || "/"}`}
        </span>
      </div>
    </div>
  );
};
