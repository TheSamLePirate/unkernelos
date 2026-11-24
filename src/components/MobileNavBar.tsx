import { Bot, Grid2x2, Layers, SlidersHorizontal, Terminal } from "lucide-react";
import React from "react";
import { useWm, wmStore } from "../wm/wm-store.ts";

/**
 * AAA Mobile & Compact-Tablet Floating Glass Navigation Bar (< 768px).
 * Replaces the horizontal Desktop Dock with 5 thumb-ergonomic OS controls
 * respecting iOS/Android safe-area-inset-bottom.
 */
export const MobileNavBar: React.FC = () => {
  const wm = useWm();
  const activeWin = wm.windows.find((w) => w.id === wm.activeWindowId && !w.minimized);
  const openCount = wm.windows.filter((w) => w.workspace === wm.activeWorkspace).length;

  const isStudio = !wm.launcherOpen && !wm.missionControlOpen && !wm.controlCenterOpen && activeWin?.appId === "agent-studio";
  const isTerm = !wm.launcherOpen && !wm.missionControlOpen && !wm.controlCenterOpen && activeWin?.appId === "terminal";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pt-1.5"
      style={{ paddingBottom: "max(0.55rem, env(safe-area-inset-bottom))" }}
    >
      <nav className="glass-dock rounded-2xl px-1.5 py-1.5 grid grid-cols-5 gap-1">
        <button
          type="button"
          onClick={() => wmStore.toggleLauncher()}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
            wm.launcherOpen
              ? "bg-gradient-to-br from-violet-500/35 to-cyan-500/30 text-white border border-white/25"
              : "text-zinc-400 active:bg-white/10"
          }`}
        >
          <Grid2x2 className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Apps</span>
        </button>

        <button
          type="button"
          onClick={() => {
            wmStore.setLauncher(false);
            wmStore.setControlCenter(false);
            wmStore.openApp("agent-studio");
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
            isStudio
              ? "bg-violet-500/28 text-white border border-violet-400/35"
              : "text-zinc-400 active:bg-white/10"
          }`}
        >
          <Bot className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Studio</span>
        </button>

        <button
          type="button"
          onClick={() => {
            wmStore.setLauncher(false);
            wmStore.setControlCenter(false);
            wmStore.openApp("terminal");
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
            isTerm
              ? "bg-cyan-500/25 text-white border border-cyan-400/35"
              : "text-zinc-400 active:bg-white/10"
          }`}
        >
          <Terminal className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Terminal</span>
        </button>

        <button
          type="button"
          onClick={() => {
            wmStore.setLauncher(false);
            wmStore.setControlCenter(false);
            wmStore.toggleMissionControl();
          }}
          className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
            wm.missionControlOpen
              ? "bg-fuchsia-500/28 text-white border border-fuchsia-400/35"
              : "text-zinc-400 active:bg-white/10"
          }`}
        >
          <div className="relative">
            <Layers className="w-5 h-5" />
            {openCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-violet-500 text-[9px] font-mono font-bold text-white flex items-center justify-center shadow">
                {openCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none">Windows</span>
        </button>

        <button
          type="button"
          onClick={() => {
            wmStore.setLauncher(false);
            wmStore.toggleControlCenter();
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
            wm.controlCenterOpen
              ? "bg-white/18 text-white border border-white/25"
              : "text-zinc-400 active:bg-white/10"
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Control</span>
        </button>
      </nav>
    </div>
  );
};
