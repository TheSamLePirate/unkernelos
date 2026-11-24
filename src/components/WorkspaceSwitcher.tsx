import { Effect } from "effect";
import {
  Bot,
  Check,
  ChevronDown,
  Code2,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  PlayCircle,
  RefreshCw,
  Terminal,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { appRuntime, GuestFsService, VmService } from "../core/runtime.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

/**
 * Global OS Active Workspace Switcher in TopBar.
 * Syncs the active project working directory seamlessly across Agent Studio,
 * Code IDE, File Explorer, Kitty Terminal, Git & Service Runner.
 */
export const WorkspaceSwitcher: React.FC = () => {
  const wm = useWm();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [customPath, setCustomPath] = useState(wm.activeWorkspaceDir);

  const shortName =
    wm.activeWorkspaceDir === "/home/user/workspace"
      ? "workspace"
      : wm.activeWorkspaceDir.split("/").filter(Boolean).pop() || "/";

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listProjects("/home/user/workspace")))
    );
    setLoading(false);
    if (res._tag === "Right") {
      setProjects(res.right);
    }
  }, []);

  useEffect(() => {
    setCustomPath(wm.activeWorkspaceDir);
  }, [wm.activeWorkspaceDir]);

  useEffect(() => {
    if (!open) return;
    void loadProjects();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loadProjects]);

  const selectWorkspace = (dir: string) => {
    wmStore.setWorkspaceDir(dir);
    wmStore.pushToast("Active Workspace", dir, "info");
    setOpen(false);
  };

  const createProject = async () => {
    const clean = newProjectName.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
    if (!clean) return;
    const full = `/home/user/workspace/${clean}`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          const vm = yield* VmService;
          yield* fs.mkdir(full);
          yield* vm.syncDisk();
        })
      )
    );
    if (res._tag === "Right") {
      setNewProjectName("");
      wmStore.setWorkspaceDir(full);
      wmStore.pushToast("Workspace Created", full, "success");
      setOpen(false);
    } else {
      wmStore.pushToast("Workspace Error", String(res.left), "error");
    }
  };

  const allDirs = Array.from(
    new Set([wm.activeWorkspaceDir, ...projects, ...wm.recentWorkspaces, "/home/user/workspace"])
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono transition max-w-[160px] ${
          open
            ? "bg-amber-500/20 border-amber-400/45 text-amber-100"
            : "bg-white/[0.05] hover:bg-white/10 border-white/10 text-zinc-200"
        }`}
        title={`Active Workspace: ${wm.activeWorkspaceDir}`}
      >
        <Folder className="w-3 h-3 text-amber-400 shrink-0" />
        <span className="truncate">{shortName}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[78]" onClick={() => setOpen(false)} />
          <div
            style={{ top: "calc(42px + env(safe-area-inset-top))" }}
            className="fixed left-2 right-2 sm:left-3 sm:right-auto sm:w-88 z-[85] rounded-3xl glass-surface-focused p-3.5 space-y-3 animate-window-in shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                Active Working Directory
              </div>
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
                title="Refresh workspace projects"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Direct Path Input */}
            <div className="flex gap-1.5">
              <input
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPath.trim()) selectWorkspace(customPath);
                }}
                placeholder="/home/user/workspace/my-project"
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-[11px] font-mono text-zinc-100 outline-none focus:border-amber-400/50"
              />
              <button
                type="button"
                onClick={() => customPath.trim() && selectWorkspace(customPath)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-[11px] font-medium text-amber-200 transition"
              >
                Use
              </button>
            </div>

            {/* New Project Creator */}
            <div className="flex gap-1.5">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createProject()}
                placeholder="New project in ~/workspace/..."
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono text-zinc-100 outline-none focus:border-violet-400/50"
              />
              <button
                type="button"
                disabled={!newProjectName.trim()}
                onClick={() => void createProject()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-600/85 hover:bg-violet-500 disabled:opacity-40 text-[11px] font-medium text-white transition"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Create
              </button>
            </div>

            {/* Project List */}
            <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-1">
                Projects &amp; Recent Folders
              </div>
              {allDirs.map((dir) => {
                const active = dir === wm.activeWorkspaceDir;
                const label = dir.split("/").filter(Boolean).pop() || "/";
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => selectWorkspace(dir)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left transition ${
                      active
                        ? "bg-amber-500/18 border border-amber-400/35 text-white"
                        : "bg-white/[0.02] hover:bg-white/10 border border-transparent text-zinc-300"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{label}</div>
                      <div className="text-[10px] font-mono text-zinc-500 truncate">{dir}</div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* 1-Click Open Active Workspace In... */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-0.5">
                Open Active Workspace In
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openDirInStudio(wm.activeWorkspaceDir);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-400/30 text-[11px] text-violet-200 transition"
                >
                  <Bot className="w-3 h-3" />
                  Studio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openDirInIde(wm.activeWorkspaceDir);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-[11px] text-sky-200 transition"
                >
                  <Code2 className="w-3 h-3" />
                  IDE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openTerminalInDir(wm.activeWorkspaceDir);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-[11px] text-cyan-200 transition"
                >
                  <Terminal className="w-3 h-3" />
                  Terminal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openDirInExplorer(wm.activeWorkspaceDir);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-[11px] text-amber-200 transition"
                >
                  <FolderOpen className="w-3 h-3" />
                  Files
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openDirInGit(wm.activeWorkspaceDir);
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-400/30 text-[11px] text-orange-200 transition"
                >
                  <FolderGit2 className="w-3 h-3" />
                  Git
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    wmStore.openApp("services");
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-[11px] text-emerald-200 transition"
                >
                  <PlayCircle className="w-3 h-3" />
                  Services
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
