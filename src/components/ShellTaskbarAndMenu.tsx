import {
  Activity,
  BookOpen,
  Bot,
  Box,
  ChevronLeft,
  ChevronRight,
  Code2,
  FolderOpen,
  Gem,
  GitBranch,
  Globe,
  Grid2x2,
  Home,
  LayoutGrid,
  Monitor,
  Network,
  Package,
  Search,
  Settings,
  Sigma,
  Sliders,
  Sparkles,
  Store,
  Terminal,
  Wifi,
  Workflow,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { modStore, useMods } from "../core/mod-store.ts";
import { APP_CATALOG, useWm, wmStore, type AppId, type WorkspaceId } from "../wm/wm-store.ts";

const ICON_MAP: Partial<Record<AppId, React.ComponentType<{ className?: string }>>> = {
  "agent-studio": Bot,
  "agent-swarm": Network,
  "agent-api": Workflow,
  ide: Code2,
  notebook: BookOpen,
  "proof-studio": Sigma,
  terminal: Terminal,
  explorer: FolderOpen,
  "app-store": Store,
  preview: Globe,
  screen: Monitor,
  git: GitBranch,
  toolchain: Package,
  monitor: Activity,
  "mod-studio": Sliders,
  "rune-settings": Gem,
  settings: Settings,
};

const DESKTOP_ICON_APPS: readonly AppId[] = [
  "agent-studio",
  "explorer",
  "terminal",
  "ide",
  "mod-studio",
  "rune-settings",
  "app-store",
  "settings",
];

const SPRINGBOARD_APPS: readonly AppId[] = [
  "agent-studio",
  "agent-swarm",
  "ide",
  "notebook",
  "proof-studio",
  "terminal",
  "explorer",
  "preview",
  "git",
  "app-store",
  "mod-studio",
  "rune-settings",
  "monitor",
  "toolchain",
  "agent-api",
  "settings",
];

const VISION_RAIL_APPS: readonly AppId[] = [
  "agent-studio",
  "ide",
  "terminal",
  "explorer",
  "mod-studio",
  "rune-settings",
  "settings",
];

/**
 * Universal Structural Shell Engine:
 * Renders authentic desktop paradigms based on the active OS Variant / Shell Mod:
 * - Classic Desktop Icons Grid (Win95 / WinXP / Win11 / XFCE / KDE / Mac OS X)
 * - Windows 95 Classic Taskbar + Start Menu
 * - Windows XP Luna Glossy Taskbar + 2-Column Green Start Menu
 * - Windows 11 Centered Fluent Acrylic Taskbar + Frosted Start Grid
 * - Linux KDE Plasma 6 Floating Breeze Panel + Kickoff Menu
 * - Linux XFCE / LXDE Lightweight Panel + Whisker Menu + Workspace Pager
 * - iOS / iPadOS SpringBoard Home Screen + Home Indicator
 * - Apple VisionOS Floating Left Glass Ornament Rail
 * - Compiz / Beryl 3D Cube Workspace Switcher Pill
 */
export const ShellTaskbarAndMenu: React.FC = () => {
  const wm = useWm();
  const mods = useMods();
  const sh = mods.shell;
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<AppId | null>(null);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [sh.taskbarMode, mods.activeVariantId]);

  const wsWins = wm.windows.filter((w) => w.workspace === wm.activeWorkspace);
  const hasVisibleWindow = wsWins.some((w) => !w.minimized);

  const openFromMenu = (appId: AppId) => {
    setMenuOpen(false);
    setSearch("");
    wmStore.openApp(appId);
  };

  const filteredMenuApps = SPRINGBOARD_APPS.filter((id) => {
    if (!search.trim()) return true;
    const def = APP_CATALOG[id];
    const q = search.toLowerCase();
    return def.title.toLowerCase().includes(q) || def.shortTitle.toLowerCase().includes(q);
  });

  const isWin95 = sh.taskbarMode === "win95";
  const isWinXp = sh.taskbarMode === "winxp";
  const isWin11 = sh.taskbarMode === "win11";
  const isKde = sh.taskbarMode === "kde-plasma";
  const isXfce = sh.taskbarMode === "xfce-lxde";
  const isVision = sh.taskbarMode === "visionos-ornament";
  const isTaskbarShell = isWin95 || isWinXp || isWin11 || isKde || isXfce;

  const rotateCube = (dir: -1 | 1) => {
    const next = (((wm.activeWorkspace - 1 + dir + 4) % 4) + 1) as WorkspaceId;
    wmStore.switchWorkspace(next);
  };

  return (
    <>
      {/* 1. CLASSIC DESKTOP ICONS GRID (Win95 / WinXP / Win11 / XFCE / KDE / Aqua) */}
      {sh.desktopIcons && !sh.springboardHome && (
        <div
          onClick={() => setSelectedIcon(null)}
          style={{ top: sh.topBarStyle === "hidden" ? "16px" : "48px" }}
          className="fixed left-4 bottom-16 z-[3] hidden sm:grid grid-flow-col grid-rows-6 gap-2 content-start select-none pointer-events-auto"
        >
          {DESKTOP_ICON_APPS.map((id) => {
            const def = APP_CATALOG[id];
            const Icon = ICON_MAP[id] ?? Sparkles;
            const selected = selectedIcon === id;
            return (
              <button
                key={id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIcon(id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  wmStore.openApp(id);
                }}
                className={`w-[78px] py-2 px-1 flex flex-col items-center gap-1.5 rounded-lg text-center transition cursor-pointer ${
                  selected
                    ? isWin95
                      ? "bg-[#000080]/80 border border-dotted border-white/80"
                      : "bg-white/18 border border-white/30 backdrop-blur-md"
                    : "hover:bg-white/10 border border-transparent"
                }`}
              >
                <div
                  className={`w-10 h-10 flex items-center justify-center shadow-md ${
                    isWin95
                      ? "bg-[#c0c0c0] border-2 border-white border-r-[#404040] border-b-[#404040] text-[#000080]"
                      : `rounded-xl bg-gradient-to-br ${def.accent} text-white`
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] line-clamp-2">
                  {def.shortTitle}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. AUTHENTIC iOS / iPadOS SPRINGBOARD HOME SCREEN */}
      {sh.springboardHome && (
        <>
          {!hasVisibleWindow && (
            <div className="fixed inset-0 top-10 bottom-24 z-[8] flex flex-col items-center justify-center px-6 py-4 select-none animate-overlay-fade">
              <div className="w-full max-w-3xl space-y-6">
                {/* iPadOS Live Glass Clock & Search Pill */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-5xl font-bold tracking-tight text-white drop-shadow-lg tabular-nums">
                      {clock}
                    </div>
                    <div className="text-xs text-white/75 capitalize mt-0.5">
                      {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => wmStore.toggleCommandPalette()}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/22 backdrop-blur-xl border border-white/25 text-xs text-white/90 shadow-lg cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Rechercher sur iPadOS…
                  </button>
                </div>

                {/* SpringBoard Squircle App Icon Grid */}
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 sm:gap-5">
                  {SPRINGBOARD_APPS.map((id) => {
                    const def = APP_CATALOG[id];
                    const Icon = ICON_MAP[id] ?? Sparkles;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => wmStore.openApp(id)}
                        className="group flex flex-col items-center gap-1.5 cursor-pointer"
                      >
                        <div
                          className={`dock-squircle w-14 h-14 sm:w-16 sm:h-16 rounded-[24%] bg-gradient-to-br ${def.accent} flex items-center justify-center text-white group-hover:scale-108 active:scale-92 transition-transform shadow-xl`}
                        >
                          <Icon className="w-7 h-7 drop-shadow" />
                        </div>
                        <span className="text-[11px] font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] truncate max-w-[76px]">
                          {def.shortTitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Home Pill to Minimize All & Return to SpringBoard */}
          {hasVisibleWindow && (
            <button
              type="button"
              onClick={() => {
                for (const w of wsWins) wmStore.minimizeWindow(w.id);
              }}
              title="Retour à l'écran d'accueil SpringBoard"
              className="fixed bottom-1 left-1/2 -translate-x-1/2 z-[60] w-36 h-1.5 rounded-full bg-white/55 hover:bg-white/90 transition cursor-pointer shadow"
            />
          )}
        </>
      )}

      {/* 3. APPLE VISIONOS LEFT FLOATING GLASS ORNAMENT RAIL */}
      {isVision && (
        <aside className="fixed left-4 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col items-center gap-2 p-2 rounded-[28px] glass-dock border border-white/30 shadow-[0_24px_64px_rgba(0,0,0,0.65)] select-none">
          <button
            type="button"
            onClick={() => wmStore.toggleLauncher()}
            title="Home View (Toutes les apps)"
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/28 border border-white/25 flex items-center justify-center text-white transition cursor-pointer"
          >
            <Home className="w-5 h-5" />
          </button>
          <div className="w-6 h-px bg-white/20" />
          {VISION_RAIL_APPS.map((id) => {
            const def = APP_CATALOG[id];
            const Icon = ICON_MAP[id] ?? Sparkles;
            const active = wm.windows.some((w) => w.appId === id && w.id === wm.activeWindowId && !w.minimized);
            return (
              <button
                key={id}
                type="button"
                onClick={() => wmStore.openApp(id)}
                title={def.title}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition cursor-pointer ${
                  active
                    ? `bg-gradient-to-br ${def.accent} text-white ring-2 ring-white/75 scale-105 shadow-lg`
                    : "bg-white/8 hover:bg-white/20 text-zinc-100 hover:scale-105"
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </aside>
      )}

      {/* 4. COMPIZ / BERYL 3D DESKTOP CUBE QUICK ROTATOR PILL */}
      {sh.compizCube && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[46] hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-dock border border-emerald-400/40 text-[11px] font-mono text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.28)] select-none">
          <button
            type="button"
            onClick={() => rotateCube(-1)}
            title="Tourner le Cube 3D à gauche"
            className="p-1 rounded-full hover:bg-white/15 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <Box className="w-3.5 h-3.5 text-emerald-300" />
          <span>CUBE FACE {wm.activeWorkspace}/4</span>
          <button
            type="button"
            onClick={() => rotateCube(1)}
            title="Tourner le Cube 3D à droite"
            className="p-1 rounded-full hover:bg-white/15 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. START / WHISKER / KICKOFF MENU POPOVER */}
      {isTaskbarShell && menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`fixed z-[70] select-none animate-window-in ${
            isWin11
              ? "bottom-14 left-1/2 -translate-x-1/2 w-[480px] max-w-[94vw] rounded-2xl bg-[#181c28]/92 backdrop-blur-2xl border border-white/18 shadow-2xl p-4"
              : isWin95
              ? "bottom-10 left-0 w-72 bg-[#c0c0c0] text-black border-2 border-white border-r-[#404040] border-b-[#404040] shadow-[6px_6px_0_rgba(0,0,0,0.45)] flex overflow-hidden"
              : isWinXp
              ? "bottom-11 left-0 w-[360px] rounded-t-xl border-2 border-[#0054e3] bg-[#d3e5fa] text-slate-900 shadow-2xl overflow-hidden"
              : isKde
              ? "bottom-14 left-3 w-[380px] rounded-2xl bg-[#1b1f26]/94 backdrop-blur-2xl border border-sky-400/35 shadow-2xl p-3.5"
              : "bottom-10 left-1 w-80 rounded-lg bg-[#1d2129] border border-slate-500/40 shadow-2xl p-3"
          }`}
        >
          {/* Win95 Sidebar Banner */}
          {isWin95 && (
            <div className="w-8 bg-gradient-to-t from-[#000080] to-[#1084d0] text-white font-bold text-sm flex items-end justify-center pb-3 shrink-0">
              <span className="-rotate-90 whitespace-nowrap tracking-wider">Windows 95</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* WinXP Glossy Header */}
            {isWinXp && (
              <div className="px-3 py-2.5 bg-gradient-to-b from-[#1e60d5] via-[#2b73ea] to-[#124ab8] text-white font-bold text-sm flex items-center gap-2 border-b border-[#003c9d]">
                <span className="w-8 h-8 rounded-md bg-white/25 border border-white/60 flex items-center justify-center text-base">
                  👤
                </span>
                <span>Administrateur · unkernelOS</span>
              </div>
            )}

            {/* Search bar for Win11 / KDE / XFCE */}
            {(isWin11 || isKde || isXfce) && (
              <div className="flex items-center gap-2 px-3 py-1.5 mb-3 rounded-xl bg-black/35 border border-white/12">
                <Search className="w-3.5 h-3.5 text-sky-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher applications & mods…"
                  className="flex-1 bg-transparent text-xs text-white outline-none"
                />
              </div>
            )}

            {/* App List / Grid */}
            {isWin11 ? (
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {filteredMenuApps.map((id) => {
                  const def = APP_CATALOG[id];
                  const Icon = ICON_MAP[id] ?? Sparkles;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openFromMenu(id)}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${def.accent} flex items-center justify-center text-white shadow`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] text-zinc-200 truncate w-full text-center">
                        {def.shortTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={`${isWin95 ? "p-1" : isWinXp ? "p-2 bg-white" : ""} space-y-0.5 max-h-80 overflow-y-auto`}>
                {filteredMenuApps.map((id) => {
                  const def = APP_CATALOG[id];
                  const Icon = ICON_MAP[id] ?? Sparkles;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openFromMenu(id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                        isWin95
                          ? "hover:bg-[#000080] hover:text-white"
                          : isWinXp
                          ? "rounded hover:bg-[#2f71cd] hover:text-white text-slate-900"
                          : "rounded-lg hover:bg-white/10 text-zinc-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="font-medium truncate">{def.title}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick Variant Switcher Footer inside Start Menu */}
            <div
              className={`mt-2 pt-2 flex items-center justify-between gap-2 text-[11px] ${
                isWin95
                  ? "border-t border-[#808080] px-2 pb-1.5"
                  : isWinXp
                  ? "px-3 py-2 bg-gradient-to-b from-[#3980ed] to-[#1e5ad0] text-white"
                  : "border-t border-white/10"
              }`}
            >
              <button
                type="button"
                onClick={() => openFromMenu("mod-studio")}
                className="flex items-center gap-1.5 font-semibold hover:underline cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Changer d'OS / Mod Studio
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  modStore.setDesktop3d({ enabled: !mods.desktop3d.enabled });
                }}
                className="px-2 py-0.5 rounded bg-black/20 hover:bg-black/35 font-mono text-[10px] cursor-pointer"
              >
                3D {mods.desktop3d.enabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. AUTHENTIC TASKBARS (Win95 · WinXP · Win11 · KDE Plasma · XFCE/LXDE) */}
      {isTaskbarShell && (
        <div
          className={`fixed z-50 hidden md:flex items-center justify-between select-none ${
            isWin95
              ? "inset-x-0 bottom-0 h-10 px-1.5 bg-[#c0c0c0] text-black border-t-2 border-white"
              : isWinXp
              ? "inset-x-0 bottom-0 h-10 pr-2 bg-gradient-to-b from-[#245edb] via-[#3f8cf3] to-[#1941a5] text-white border-t border-[#5aa0ff]"
              : isWin11
              ? "inset-x-0 bottom-0 h-12 px-3 bg-[#141824]/86 backdrop-blur-2xl text-white border-t border-white/12"
              : isKde
              ? "left-3 right-3 bottom-2 h-11 px-2.5 rounded-2xl bg-[#1a1f28]/88 backdrop-blur-2xl text-white border border-sky-400/28 shadow-2xl"
              : "inset-x-0 bottom-0 h-9 px-2 bg-[#1c2028] text-zinc-100 border-t border-slate-600/40"
          }`}
        >
          {/* Left / Center Primary Controls */}
          <div className={`flex items-center gap-1.5 min-w-0 ${isWin11 ? "mx-auto" : ""}`}>
            {/* Start / Whisker / Kickoff Button */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex items-center gap-1.5 font-bold transition cursor-pointer shrink-0 ${
                isWin95
                  ? "px-3 py-1 bg-[#c0c0c0] text-black text-xs border-2 border-white border-r-[#404040] border-b-[#404040] active:border-[#404040] active:border-r-white active:border-b-white"
                  : isWinXp
                  ? "h-10 pl-3 pr-5 rounded-r-2xl bg-gradient-to-b from-[#4bb543] via-[#3c9f38] to-[#267322] text-white italic text-sm shadow-inner border-r border-[#1f5e1c] hover:brightness-110"
                  : isWin11
                  ? "w-9 h-9 justify-center rounded-lg hover:bg-white/12 text-sky-400"
                  : isKde
                  ? "px-2.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 text-xs"
                  : "px-2.5 py-1 rounded bg-white/8 hover:bg-white/15 text-xs"
              }`}
            >
              {isWin11 ? (
                <LayoutGrid className="w-5 h-5" />
              ) : isKde || isXfce ? (
                <>
                  <Grid2x2 className="w-3.5 h-3.5" />
                  <span>{isKde ? "Plasma" : "Applications"}</span>
                </>
              ) : (
                <>
                  <span>🪟</span>
                  <span>Démarrer</span>
                </>
              )}
            </button>

            {/* Quick Pinned Icons for Win11 / KDE / XFCE */}
            {(isWin11 || isKde || isXfce) && (
              <div className="flex items-center gap-1 mx-1">
                {(["agent-studio", "terminal", "ide", "explorer", "mod-studio", "rune-settings"] as AppId[]).map((id) => {
                  const def = APP_CATALOG[id];
                  const Icon = ICON_MAP[id] ?? Sparkles;
                  const open = wsWins.some((w) => w.appId === id);
                  const active = wsWins.some((w) => w.appId === id && w.id === wm.activeWindowId && !w.minimized);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => wmStore.openApp(id)}
                      title={def.title}
                      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                        active ? "bg-white/18" : "hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-white" />
                      {open && (
                        <span
                          className={`absolute bottom-0.5 h-[3px] rounded-full ${
                            active ? "w-4 bg-sky-400" : "w-1.5 bg-zinc-400"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Open Windows Task Buttons (Classic Win95 / WinXP / XFCE / KDE) */}
            {!isWin11 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[55vw]">
                {wsWins.map((w) => {
                  const active = w.id === wm.activeWindowId && !w.minimized;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => (active ? wmStore.minimizeWindow(w.id) : wmStore.focusWindow(w.id))}
                      className={`px-2.5 py-1 text-xs truncate max-w-[160px] transition cursor-pointer ${
                        isWin95
                          ? active
                            ? "bg-[#dfdfdf] font-bold border-2 border-[#404040] border-r-white border-b-white"
                            : "bg-[#c0c0c0] border-2 border-white border-r-[#404040] border-b-[#404040]"
                          : isWinXp
                          ? active
                            ? "rounded bg-[#1a4bb8] border border-[#0f348a] font-semibold text-white"
                            : "rounded bg-[#3c81f3] hover:bg-[#5293ff] border border-[#6ca5ff]/50 text-white"
                          : active
                          ? "rounded-lg bg-white/16 border border-sky-400/45 text-white font-semibold"
                          : "rounded-lg bg-white/5 hover:bg-white/12 text-zinc-300"
                      }`}
                    >
                      {w.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right System Tray (Workspaces + 3D + Mod Studio + Clock) */}
          <div
            className={`flex items-center gap-2 shrink-0 text-[11px] font-mono ${
              isWin95
                ? "px-2 py-0.5 border-2 border-[#808080] border-r-white border-b-white bg-[#c0c0c0]"
                : isWinXp
                ? "px-3 h-full bg-gradient-to-b from-[#1290e8] to-[#0b6cc2] border-l border-[#38b0ff]"
                : "px-2"
            }`}
          >
            {(isXfce || isKde) && (
              <div className="flex items-center gap-0.5 bg-black/25 px-1 py-0.5 rounded">
                {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => wmStore.switchWorkspace(ws)}
                    className={`w-4 h-4 rounded text-[9px] cursor-pointer ${
                      wm.activeWorkspace === ws ? "bg-sky-500 text-black font-bold" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {ws}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => wmStore.openApp("mod-studio")}
              title="OS Mod Studio"
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
            <Wifi className="w-3.5 h-3.5 opacity-80" />
            <span className="tabular-nums font-semibold">{clock}</span>
          </div>
        </div>
      )}
    </>
  );
};
