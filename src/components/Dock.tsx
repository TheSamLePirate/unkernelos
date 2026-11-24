import {
  Activity,
  Bot,
  FolderOpen,
  GitBranch,
  Globe,
  Monitor,
  Package,
  Settings,
  Terminal,
} from "lucide-react";
import React from "react";
import { APP_CATALOG, useWm, wmStore, type AppId } from "../wm/wm-store.ts";

const DOCK_ITEMS: readonly { id: AppId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "agent-studio", icon: Bot },
  { id: "terminal", icon: Terminal },
  { id: "explorer", icon: FolderOpen },
  { id: "preview", icon: Globe },
  { id: "screen", icon: Monitor },
  { id: "git", icon: GitBranch },
  { id: "toolchain", icon: Package },
  { id: "monitor", icon: Activity },
  { id: "settings", icon: Settings },
];

export const Dock: React.FC = () => {
  const wm = useWm();

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <nav className="glass-dock px-2.5 py-2 rounded-2xl flex items-center gap-1.5">
        {DOCK_ITEMS.map(({ id, icon: Icon }) => {
          const def = APP_CATALOG[id];
          const win = wm.windows.find((w) => w.appId === id);
          const isOpen = Boolean(win);
          const isActive = win && win.id === wm.activeWindowId && !win.minimized;

          return (
            <button
              key={id}
              type="button"
              onClick={() => wmStore.openApp(id)}
              className="group relative flex flex-col items-center justify-center"
            >
              {/* Floating Tooltip */}
              <span className="pointer-events-none absolute -top-9 px-2.5 py-1 rounded-lg bg-[#0d1018]/95 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl">
                {def.shortTitle}
                {def.shortcut && <span className="ml-1.5 text-zinc-500 font-mono">{def.shortcut}</span>}
              </span>

              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 group-hover:-translate-y-1.5 group-hover:scale-110 bg-gradient-to-br ${def.accent} ${
                  isActive
                    ? "ring-2 ring-white/50 shadow-lg"
                    : "opacity-85 group-hover:opacity-100 shadow-md"
                }`}
              >
                <Icon className="w-5 h-5 text-white drop-shadow" />
              </div>

              {/* Running indicator dot */}
              <span
                className={`mt-1 w-1 h-1 rounded-full transition-opacity ${
                  isOpen ? (isActive ? "bg-white opacity-100" : "bg-zinc-400 opacity-80") : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
};
