import {
  Activity,
  AppWindow,
  Bot,
  Box,
  Code2,
  Cpu,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Monitor,
  Package,
  PenTool,
  PlayCircle,
  Search,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Workflow,
  Wrench,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

type CategoryId = "all" | "dev" | "system" | "creative";

const APP_META: Record<
  AppId,
  { icon: React.ComponentType<{ className?: string }>; category: Exclude<CategoryId, "all"> }
> = {
  "agent-studio": { icon: Bot, category: "dev" },
  "agent-api": { icon: Workflow, category: "dev" },
  ide: { icon: Code2, category: "dev" },
  terminal: { icon: Terminal, category: "dev" },
  explorer: { icon: FolderOpen, category: "system" },
  "api-client": { icon: Send, category: "dev" },
  database: { icon: Database, category: "dev" },
  services: { icon: PlayCircle, category: "dev" },
  notes: { icon: FileText, category: "creative" },
  whiteboard: { icon: PenTool, category: "creative" },
  "dev-utils": { icon: Wrench, category: "dev" },
  processes: { icon: Cpu, category: "system" },
  "shader-synth": { icon: Sparkles, category: "creative" },
  preview: { icon: Globe, category: "dev" },
  screen: { icon: Monitor, category: "system" },
  "gl-window": { icon: Box, category: "creative" },
  "wayland-surface": { icon: AppWindow, category: "system" },
  git: { icon: GitBranch, category: "dev" },
  toolchain: { icon: Package, category: "system" },
  monitor: { icon: Activity, category: "system" },
  settings: { icon: Settings, category: "system" },
};

const CATEGORIES: readonly { id: CategoryId; label: string }[] = [
  { id: "all", label: "All Apps" },
  { id: "dev", label: "AI & Development" },
  { id: "system", label: "Linux & System" },
  { id: "creative", label: "Notes & Creative" },
];

export const AppLauncherOverlay: React.FC = () => {
  const wm = useWm();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("all");

  useEffect(() => {
    if (!wm.launcherOpen) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        wmStore.setLauncher(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wm.launcherOpen]);

  if (!wm.launcherOpen) return null;

  const q = query.trim().toLowerCase();
  const appIds = (Object.keys(APP_CATALOG) as AppId[]).filter((id) => {
    if (id === "wayland-surface") return false;
    const def = APP_CATALOG[id];
    const meta = APP_META[id];
    if (category !== "all" && meta?.category !== category) return false;
    if (!q) return true;
    return (
      def.title.toLowerCase().includes(q) ||
      def.shortTitle.toLowerCase().includes(q) ||
      def.description.toLowerCase().includes(q)
    );
  });

  return (
    <div
      onClick={() => wmStore.setLauncher(false)}
      className="fixed inset-0 z-[94] bg-black/55 backdrop-blur-2xl flex flex-col items-center pt-14 pb-24 px-6 animate-overlay-fade"
    >
      {/* Search + Category Pills */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl flex flex-col items-center gap-4 mb-8"
      >
        <div className="w-full max-w-md flex items-center gap-2.5 px-4 py-2.5 rounded-2xl glass-surface-focused">
          <Search className="w-4 h-4 text-violet-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && appIds[0]) {
                wmStore.openApp(appIds[0]);
                wmStore.setLauncher(false);
              }
            }}
            placeholder="Search 20 WebOS apps..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] font-mono text-zinc-400">
            ESC
          </kbd>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                category === c.id
                  ? "bg-white/18 border-white/35 text-white shadow"
                  : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* App Grid */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl flex-1 min-h-0 overflow-y-auto px-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-8">
          {appIds.map((id) => {
            const def = APP_CATALOG[id];
            const Icon = APP_META[id]?.icon ?? Sparkles;
            const isOpen = wm.windows.some((w) => w.appId === id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  wmStore.openApp(id);
                  wmStore.setLauncher(false);
                }}
                className="group flex flex-col items-center gap-2.5 p-4 rounded-3xl glass-surface hover:glass-surface-focused hover:-translate-y-1 transition-all text-center cursor-pointer"
              >
                <div
                  className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${def.accent} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-7 h-7 text-white drop-shadow" />
                  {isOpen && (
                    <span className="absolute -bottom-1 w-2 h-2 rounded-full bg-white shadow" />
                  )}
                </div>
                <div className="space-y-0.5 w-full">
                  <div className="text-xs font-semibold text-white truncate">{def.shortTitle}</div>
                  <div className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">
                    {def.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
