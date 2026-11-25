import { Effect } from "effect";
import {
  AppWindow,
  Box,
  ClipboardList,
  Code2,
  FileCode2,
  FolderOpen,
  Globe,
  Layers,
  Lock,
  Palette,
  Pause,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { clipboardStore, useClipboardHistory } from "../core/clipboard-store.ts";
import { useDynamicApps } from "../core/dynamic-apps-store.ts";
import { modStore } from "../core/mod-store.ts";
import { OS_THEMES } from "../core/os-themes.ts";
import { appRuntime, SettingsService, useSubscriptionRef, VmService } from "../core/runtime.ts";
import type { OsThemeId } from "../core/schema.ts";
import { useWorkflows, workflowsStore } from "../core/workflows-store.ts";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

export const CommandPalette: React.FC = () => {
  const wm = useWm();
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "",
      bootProgress: 0,
      error: null,
      support: null,
      crossOriginIsolated: false,
      webgpuAvailable: false,
      distro: "debian",
      cpus: 1,
      memoryMiB: 2048,
      transport: "inline",
      stats: null,
      glStatus: null,
      displayMode: null,
      inputState: { keyboard: false, mouse: false, tablet: false },
      detectedPorts: [],
      kernelLogs: [],
      hasSnapshot: false,
      audioMuted: false,
      wispActiveUrl: "",
    }
  );

  const customApps = useDynamicApps();
  const workflows = useWorkflows();
  const clipHistory = useClipboardHistory();
  const [query, setQuery] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!wm.commandPaletteOpen) return;
    setQuery("");
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    void appRuntime
      .runPromise(
        Effect.either(
          Effect.flatMap(VmService, (v) =>
            v.execShell(
              `cd ${sq(dir)} 2>/dev/null && find . -maxdepth 3 -type f ! -path '*/.git/*' ! -path '*/node_modules/*' 2>/dev/null | sed 's|^\\./||' | sort | head -n 120`
            )
          )
        )
      )
      .then((res) => {
        if (res._tag === "Right") {
          setWorkspaceFiles(res.right.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
        }
      });
  }, [wm.commandPaletteOpen, wm.activeWorkspaceDir]);

  if (!wm.commandPaletteOpen) return null;

  const q = query.trim().toLowerCase();
  const apps = (Object.keys(APP_CATALOG) as AppId[])
    .filter((id) => id !== "wayland-surface" && id !== "custom-app")
    .map((id) => APP_CATALOG[id])
    .filter(
      (a) =>
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.id.includes(q)
    );

  const matchingCustomApps = customApps.filter(
    (a) => !q || a.title.toLowerCase().includes(q) || a.id.includes(q)
  );
  const matchingWorkflows = workflows.filter(
    (w) => !q || w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
  );
  const matchingFiles = q
    ? workspaceFiles.filter((f) => f.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const matchingClips = q
    ? clipHistory.filter((c) => c.text.toLowerCase().includes(q)).slice(0, 4)
    : [];

  const matchingThemes = (Object.keys(OS_THEMES) as OsThemeId[])
    .map((id) => OS_THEMES[id])
    .filter((t) => !q || t.name.toLowerCase().includes(q) || "theme".includes(q));

  return (
    <div
      onClick={() => wmStore.setCommandPalette(false)}
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl glass-surface-focused overflow-hidden animate-window-in"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-4 h-4 text-violet-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") wmStore.setCommandPalette(false);
              if (e.key === "Enter" && apps[0]) {
                wmStore.openApp(apps[0].id);
                wmStore.setCommandPalette(false);
              }
            }}
            placeholder="Launch app, switch WebOS theme, open port, or run VM command..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {vm.detectedPorts.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Live Guest Web Servers
              </div>
              {vm.detectedPorts.map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => {
                    wmStore.openPreview(p.port, "/");
                    wmStore.setCommandPalette(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-emerald-500/15 text-xs text-zinc-200 transition"
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Preview <code className="text-emerald-300">http://localhost:{p.port}/</code>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">vsock</span>
                </button>
              ))}
            </div>
          )}

          {matchingFiles.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                Workspace Files ({wm.activeWorkspaceDir.split("/").pop()})
              </div>
              {matchingFiles.map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => {
                    const full = `${wm.activeWorkspaceDir}/${rel}`.replace(/\/+/g, "/");
                    wmStore.openFileInIde(full);
                    wmStore.setCommandPalette(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-sky-500/15 text-xs font-mono text-zinc-200 transition"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{rel}</span>
                </button>
              ))}
            </div>
          )}

          {matchingCustomApps.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                Agent-Built Custom Apps
              </div>
              {matchingCustomApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    wmStore.openDynamicApp(app);
                    wmStore.setCommandPalette(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-violet-500/15 text-xs text-zinc-200 transition"
                >
                  <span>{app.emoji}</span>
                  <span className="font-medium text-white">{app.title}</span>
                  <span className="text-[10px] text-zinc-400 truncate">{app.description}</span>
                </button>
              ))}
            </div>
          )}

          {matchingWorkflows.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Workflows (Run Now)
              </div>
              {matchingWorkflows.slice(0, 4).map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    wmStore.setCommandPalette(false);
                    void workflowsStore.run(wf.id);
                    wmStore.pushToast("Workflow Started", wf.name, "info");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-amber-500/15 text-xs text-zinc-200 transition"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-medium text-white">{wf.name}</span>
                  <span className="text-[10px] text-zinc-400 truncate">{wf.description}</span>
                </button>
              ))}
            </div>
          )}

          {matchingClips.length > 0 && (
            <div className="pb-1 mb-1 border-b border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-pink-400">
                Clipboard History
              </div>
              {matchingClips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    void clipboardStore.copyToHost(c.text, "manual");
                    wmStore.pushToast("Copied", c.text.slice(0, 60), "success");
                    wmStore.setCommandPalette(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 text-xs font-mono text-zinc-300 transition"
                >
                  <ClipboardList className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span className="truncate">{c.text}</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Applications
          </div>
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                wmStore.openApp(a.id);
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-white/10 text-left transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${a.accent} shrink-0`} />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white">{a.title}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{a.description}</div>
                </div>
              </div>
              {a.shortcut && (
                <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400 shrink-0">
                  {a.shortcut}
                </kbd>
              )}
            </button>
          ))}

          {matchingThemes.length > 0 && (
            <div className="pt-1 mt-1 border-t border-white/8">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                WebOS Themes
              </div>
              <div className="grid grid-cols-2 gap-1 px-1">
                {matchingThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      modStore.setTheme({ enabled: false });
                      modStore.setBackdropImage(null);
                      modStore.setActiveShaderMod(null);
                      appRuntime.runFork(
                        Effect.flatMap(SettingsService, (s) =>
                          s.updateConfig({ osTheme: t.id, wallpaperShader: t.defaultShader })
                        )
                      );
                      wmStore.setCommandPalette(false);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-zinc-200 transition"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: `linear-gradient(135deg, ${t.swatches[0]}, ${t.swatches[1]})` }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-1 mt-1 border-t border-white/8">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Active Workspace ({wm.activeWorkspaceDir})
            </div>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.openTerminalInDir(wm.activeWorkspaceDir);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              New Terminal Tab in {wm.activeWorkspaceDir}
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.openDirInExplorer(wm.activeWorkspaceDir);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              Browse Active Workspace in File Explorer
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.openDirInIde(wm.activeWorkspaceDir);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              Open Active Workspace in Code IDE
            </button>
          </div>

          <div className="pt-1 mt-1 border-t border-white/8">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Desktop &amp; Kernel Actions
            </div>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.pushToast("Wayland Desktop App", "Launching foot as native floating desktop window...", "info");
                appRuntime.runFork(
                  Effect.flatMap(VmService, (v) => v.execShell("wland foot >/tmp/wland-foot.log 2>&1 &")).pipe(Effect.ignore)
                );
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <AppWindow className="w-3.5 h-3.5 text-violet-400" />
              Launch foot (Native Wayland Desktop Window)
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.openApp("gl-window");
                wmStore.pushToast("3D VirGL Desktop Window", "Launching kmscube in floating 3D GL window...", "info");
                appRuntime.runFork(
                  Effect.flatMap(VmService, (v) => v.execShell("kmscube >/tmp/kmscube.log 2>&1 &")).pipe(Effect.ignore)
                );
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              Launch kmscube (3D VirGL Desktop Window)
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.toggleMissionControl();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
                Mission Control / Workspaces
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">⌘E</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.setLocked(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                Lock Screen
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">⌘L</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.setCommandPalette(false);
                wmStore.setGithubModal(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Connect GitHub Account (1-Click OAuth / Token)
            </button>
            <button
              type="button"
              onClick={() => {
                wmStore.openApp("settings", { tab: "appearance" });
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Palette className="w-3.5 h-3.5 text-violet-400" />
              Appearance, Themes &amp; WebGPU Shaders
            </button>
            <button
              type="button"
              onClick={() => {
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.suspend()).pipe(Effect.ignore));
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              Suspend Linux VM Snapshot
            </button>
            <button
              type="button"
              onClick={() => {
                appRuntime.runFork(Effect.flatMap(VmService, (v) => v.reboot()).pipe(Effect.ignore));
                wmStore.setCommandPalette(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-xs text-zinc-200"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              Reboot Linux Kernel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
