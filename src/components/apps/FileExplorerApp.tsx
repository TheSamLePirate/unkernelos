import { Effect } from "effect";
import {
  ChevronRight,
  Download,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { FsEntry } from "../../core/fs-service.ts";
import { appRuntime, GuestFsService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

const SIDEBAR_LOCATIONS = [
  { label: "Workspace", path: "/home/user/workspace", icon: Folder },
  { label: "Home", path: "/home/user", icon: Home },
  { label: "Persistent /data", path: "/data", icon: HardDrive },
  { label: "Root /", path: "/", icon: HardDrive },
  { label: "/etc", path: "/etc", icon: Folder },
  { label: "/tmp", path: "/tmp", icon: Folder },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FileExplorerApp: React.FC = () => {
  const [cwd, setCwd] = useState("/home/user/workspace");
  const [entries, setEntries] = useState<readonly FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<FsEntry | null>(null);
  const [editorText, setEditorText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listDir(dir)))
    );
    setLoading(false);
    if (res._tag === "Left") {
      // Fallback to /home/user if /home/user/workspace isn't created yet
      if (dir === "/home/user/workspace") {
        await appRuntime.runPromise(
          Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.mkdir(dir)))
        );
        const retry = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listDir(dir)))
        );
        if (retry._tag === "Right") {
          setCwd(dir);
          setEntries(retry.right);
          return;
        }
      }
      setError(res.left.message);
    } else {
      setCwd(dir);
      setEntries(res.right);
    }
  }, []);

  useEffect(() => {
    void loadDir(cwd);
  }, []);

  const openEntry = async (entry: FsEntry) => {
    if (entry.isDir) {
      setSelectedFile(null);
      await loadDir(entry.path);
      return;
    }
    setSelectedFile(entry);
    setDirty(false);
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
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.writeFileText(selectedFile.path, editorText)))
    );
    setSaving(false);
    if (res._tag === "Right") {
      setDirty(false);
      wmStore.pushToast("File Saved", selectedFile.path, "success");
      await loadDir(cwd);
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
      await loadDir(cwd);
    } else {
      wmStore.pushToast("Error", res.left.message, "error");
    }
  };

  const handleDelete = async (entry: FsEntry) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.remove(entry.path)))
    );
    if (res._tag === "Right") {
      if (selectedFile?.path === entry.path) setSelectedFile(null);
      await loadDir(cwd);
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
    await loadDir(cwd);
  };

  const breadcrumbs = cwd.split("/").filter(Boolean);
  const filtered = entries.filter((e) =>
    !search.trim() ? true : e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="flex flex-col w-full h-full bg-[#0a0c13]/92"
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
      {/* Top Path & Action Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto">
          <button
            type="button"
            onClick={() => loadDir("/")}
            className="px-1.5 py-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
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
                  onClick={() => loadDir(full)}
                  className="px-1.5 py-0.5 rounded hover:bg-white/10 text-zinc-200 truncate max-w-[140px]"
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <Search className="w-3 h-3 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="bg-transparent text-xs text-zinc-200 outline-none w-24"
            />
          </div>
          <button
            type="button"
            onClick={() => handleCreate("file")}
            title="New File"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleCreate("dir")}
            title="New Folder"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            title="Upload files from host into VM"
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
            onClick={() => loadDir(cwd)}
            title="Refresh"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Split: Sidebar | File List | Code Editor */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-40 shrink-0 bg-black/25 border-r border-white/8 p-2 space-y-1">
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
                onClick={() => loadDir(loc.path)}
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

        {/* File List */}
        <div
          className={`flex-1 min-w-[220px] overflow-y-auto p-2 space-y-0.5 ${
            selectedFile ? "max-w-[320px] border-r border-white/8" : ""
          } ${dragOver ? "ring-2 ring-inset ring-cyan-400/60 bg-cyan-500/10" : ""}`}
        >
          {error && <div className="p-3 text-xs text-rose-400">{error}</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-zinc-500">
              Empty directory. Drag &amp; drop files here to upload into Linux.
            </div>
          )}
          {filtered.map((entry) => {
            const active = selectedFile?.path === entry.path;
            return (
              <div
                key={entry.path}
                onClick={() => openEntry(entry)}
                className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-zinc-300 hover:bg-white/6"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {entry.isDir ? (
                    <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : /\.(ts|tsx|js|jsx|py|rs|go|sh|json|html|css|md|yml|yaml)$/i.test(entry.name) ? (
                    <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  <span className="truncate font-mono">{entry.name}</span>
                  {entry.gitStatus && (
                    <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      {entry.gitStatus}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!entry.isDir && (
                    <span className="text-[10px] font-mono text-zinc-500 group-hover:hidden">
                      {formatSize(entry.size)}
                    </span>
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    {!entry.isDir && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownload(entry);
                        }}
                        title="Download to host"
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

        {/* Inline Editor / Viewer */}
        {selectedFile && (
          <div className="flex-1 flex flex-col min-w-0 bg-[#070910]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/8 text-xs">
              <span className="font-mono text-zinc-300 truncate">
                {selectedFile.path} {dirty ? <span className="text-amber-400">●</span> : null}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={handleSave}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition"
                >
                  <Save className="w-3 h-3" />
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
};
