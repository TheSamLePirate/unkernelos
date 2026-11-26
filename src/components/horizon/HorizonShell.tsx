import {
  Music2,
  Activity,
  AppWindow,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  Circle,
  Code2,
  Columns2,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  Layers,
  LayoutGrid,
  LockKeyhole,
  Monitor,
  Moon,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  surfaceRegistry,
  useSurfaces,
} from "../../core/app-surface-registry.tsx";
import { contextStore, useContexts } from "../../core/context-store.ts";
import {
  APP_CATALOG,
  useWm,
  wmStore,
  type AppId,
  type WorkspaceId,
} from "../../wm/wm-store.ts";
import { useViewport } from "../../core/use-viewport.ts";
import "./horizon.css";
import { ReactiveSurfaceSlot } from "../ReactiveSurfaceHost.tsx";
import { modStore } from "../../core/mod-store.ts";
const apps: readonly {
  id: AppId;
  icon: typeof Terminal;
  label: string;
  color: string;
}[] = [
  { id: "explorer", icon: FolderOpen, label: "Fichiers", color: "blue" },
  { id: "terminal", icon: Terminal, label: "Terminal", color: "graphite" },
  { id: "ide", icon: Code2, label: "Éditeur", color: "violet" },
  { id: "preview", icon: Globe, label: "Navigateur", color: "cyan" },
  { id: "music", icon: Music2, label: "Musique", color: "mint" },
  { id: "notes", icon: FileText, label: "Notes", color: "amber" },
  { id: "git", icon: GitBranch, label: "Git", color: "coral" },
  { id: "agent-studio", icon: Bot, label: "Agents", color: "mint" },
  { id: "t3-code", icon: Sparkles, label: "T3 Code", color: "violet" },
];
export const horizonAppIcon = (id: AppId) =>
  apps.find((x) => x.id === id)?.icon ?? AppWindow;
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={now.toISOString()}>
      {now.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })}
      <strong>
        {now.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </strong>
    </time>
  );
}
export function HorizonBackground() {
  return (
    <div className="horizon-background" aria-hidden="true">
      <div className="horizon-sky" />
      <svg
        className="horizon-landscape"
        viewBox="0 0 1800 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="hz-ridge" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#536c69" stopOpacity=".5" />
            <stop offset="1" stopColor="#121e24" />
          </linearGradient>
          <linearGradient id="hz-near" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#23343c" />
            <stop offset="1" stopColor="#07121c" />
          </linearGradient>
        </defs>
        <path
          d="M0 710Q180 700 370 500T650 480Q800 300 1000 530T1320 600Q1540 390 1800 460V1000H0Z"
          fill="url(#hz-ridge)"
        />
        <path
          d="M0 840Q200 540 400 720T820 720Q1080 490 1340 650T1800 660V1000H0Z"
          fill="url(#hz-near)"
        />
        <path
          d="M0 940Q220 870 470 900T900 820Q1200 740 1450 890T1800 900V1000H0Z"
          fill="#08131b"
        />
      </svg>
      <div className="horizon-vignette" />
      <div className="horizon-grain" />
    </div>
  );
}
export function HorizonShell({
  phase,
  distro,
  memoryMiB,
  cpus,
}: {
  phase: string;
  distro: string;
  memoryMiB: number;
  cpus: number;
}) {
  const wm = useWm(),
    contexts = useContexts(),
    vp = useViewport();
  useSurfaces();
  const [settings, setSettings] = useState(false),
    [light, setLight] = useState(() => {
      try {
        return (
          localStorage.getItem("unkernelos:horizon:appearance") === "light"
        );
      } catch {
        return false;
      }
    }),
    [reduced, setReduced] = useState(() => {
      try {
        return localStorage.getItem("unkernelos:horizon:motion") === "reduced";
      } catch {
        return false;
      }
    });
  const active = wm.windows.find((w) => w.id === wm.activeWindowId),
    visible = wm.windows.filter(
      (w) => w.workspace === wm.activeWorkspace && !w.minimized,
    ),
    center = visible.filter((w) => (w.placement ?? "center") === "center");
  useEffect(() => {
    void contextStore.initialize();
    const flush = () => {
      void contextStore.flush();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.horizon = "true";
    document.documentElement.dataset.horizonAppearance = light
      ? "light"
      : "dark";
    document.documentElement.dataset.horizonMotion = reduced
      ? "reduced"
      : "full";
    try {
      localStorage.setItem(
        "unkernelos:horizon:appearance",
        light ? "light" : "dark",
      );
      localStorage.setItem(
        "unkernelos:horizon:motion",
        reduced ? "reduced" : "full",
      );
    } catch {}
    return () => {
      delete document.documentElement.dataset.horizon;
      delete document.documentElement.dataset.horizonAppearance;
      delete document.documentElement.dataset.horizonMotion;
    };
  }, [light, reduced]);
  const prior = useRef(new Map<string, string>());
  useEffect(() => {
    const next = new Map(wm.windows.map((w) => [w.id, w.title]));
    for (const [id, title] of next)
      if (!prior.current.has(id))
        contextStore.record("Fenêtre ouverte", id, title);
    for (const [id, title] of prior.current)
      if (!next.has(id)) contextStore.record("Fenêtre fermée", id, title);
    prior.current = next;
  }, [wm.windows]);
  const slots =
    wm.horizonLayout === "triple" ? 3 : wm.horizonLayout === "split" ? 2 : 1;
  const open = (id: AppId) => wmStore.openApp(id);
  return (
    <>
      <header className="horizon-topbar glass-bar">
        <button
          className="horizon-brand"
          title="Toutes les applications"
          onClick={() => wmStore.toggleLauncher()}
        >
          <span className="horizon-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            unkernel<span className="horizon-brand-os">OS</span>
          </span>
          <span className="horizon-edition">HORIZON</span>
        </button>
        <div className="horizon-top-center">
          <ReactiveSurfaceSlot slot="topbar" />
          <button className="horizon-project" onClick={() => open("explorer")}>
            <FolderOpen size={13} />
            <span>
              {wm.activeWorkspaceDir.split("/").filter(Boolean).at(-1) ||
                "Workspace"}
            </span>
            <ChevronDown size={12} />
          </button>
          <span className="horizon-bar-divider" />
          <button
            className="horizon-search-trigger"
            onClick={() => wmStore.toggleCommandPalette()}
          >
            <Search size={14} />
            <span>Rechercher ou agir…</span>
            <kbd>⌘ K</kbd>
          </button>
        </div>
        <div className="horizon-top-right">
          <button
            className="horizon-runtime"
            onClick={() => wmStore.toggleControlCenter()}
            title={`${distro} · ${memoryMiB} Mo · ${cpus} vCPU · ${phase}`}
          >
            <span
              className={
                phase === "running" ? "horizon-dot" : "horizon-dot waiting"
              }
            />
            <span>{distro}</span>
          </button>
          <button
            className="horizon-toolbar-button"
            title="Notifications"
            aria-label="Notifications"
            onClick={() => wmStore.toggleNotificationCenter()}
          >
            <Activity size={15} />
            {wm.unreadNotifications > 0 && (
              <b className="horizon-notification-dot" />
            )}
          </button>
          <Clock />
          <button
            className="horizon-avatar"
            onClick={() => setSettings((v) => !v)}
            aria-label="Préférences du bureau"
            aria-expanded={settings}
          >
            U
          </button>
        </div>
      </header>
      <div className="horizon-workspacebar">
        <div
          className="horizon-spaces"
          role="group"
          aria-label="Espaces de travail"
        >
          {([1, 2, 3, 4] as WorkspaceId[]).map((id) => (
            <button
              key={id}
              aria-pressed={wm.activeWorkspace === id}
              onClick={() => wmStore.switchWorkspace(id)}
            >
              <span>{String(id).padStart(2, "0")}</span>
              {wm.activeWorkspace === id && (
                <strong>
                  {["Atelier", "Recherche", "Création", "Personnel"][id - 1]}
                </strong>
              )}
              <i
                className={
                  wm.windows.some((w) => w.workspace === id) ? "occupied" : ""
                }
              />
            </button>
          ))}
        </div>
        <div
          className="horizon-layouts"
          aria-label="Disposition du centre"
          role="group"
        >
          <button
            aria-label="Une fenêtre au centre"
            title="Concentration"
            aria-pressed={slots === 1}
            onClick={() => wmStore.setHorizonLayout("focus")}
          >
            <Monitor size={15} />
          </button>
          <button
            aria-label="Partager le centre en deux"
            title="Deux fenêtres"
            aria-pressed={slots === 2}
            onClick={() => wmStore.setHorizonLayout("split")}
          >
            <Columns2 size={15} />
          </button>
          <button
            aria-label="Partager le centre en trois"
            title="Trois fenêtres"
            aria-pressed={slots === 3}
            onClick={() => wmStore.setHorizonLayout("triple")}
          >
            <LayoutGrid size={15} />
          </button>
          <span />
          <button
            title="Exposé · F3"
            aria-label="Voir toutes les sessions"
            onClick={() => wmStore.toggleMissionControl()}
          >
            <Layers size={15} />
          </button>
          <button
            title="Reprendre un espace"
            aria-label="Historique et espaces enregistrés"
            aria-pressed={wm.horizonHistoryOpen}
            onClick={() => wmStore.setHorizonHistory(!wm.horizonHistoryOpen)}
          >
            <History size={15} />
          </button>
        </div>
      </div>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          className={"horizon-depth-label " + side}
          aria-hidden="true"
        >
          <span>{side === "left" ? "À portée de main" : "À suivre"}</span>
          <small>PROFONDEUR CONTINUE</small>
        </div>
      ))}
      {center.length === 0 && (
        <section className="horizon-empty">
          <div className="horizon-empty-time">
            <Clock />
          </div>
          <span className="horizon-eyebrow">
            ESPACE {String(wm.activeWorkspace).padStart(2, "0")}
          </span>
          <h1>À vous de créer.</h1>
          <p>Vos idées, vos outils, votre espace.</p>
          <div>
            <button onClick={() => open("agent-studio")}>
              <Sparkles size={17} /> Commencer avec un agent
            </button>
            <button onClick={() => wmStore.toggleLauncher()}>
              <Plus size={17} /> Ouvrir une application
            </button>
          </div>
        </section>
      )}
      <div
        className="horizon-bottom"
        style={vp.keyboardInset ? { bottom: vp.keyboardInset + 10 } : undefined}
      >
        <div className="horizon-session-line">
          <span>
            <i className="horizon-dot" />
            {active ? active.title : "Espace de travail"}
            <small>
              {active
                ? active.placement === "left"
                  ? " · aile gauche"
                  : active.placement === "right"
                    ? " · aile droite"
                    : " · au centre"
                : ""}
            </small>
          </span>
          <button
            title="Tiroir de la fenêtre active"
            disabled={!active}
            onClick={() => active && wmStore.toggleHorizonDrawer(active.id)}
          >
            <PanelRight size={12} />
            <span>Contexte</span>
            {active && (
              <b>
                {
                  contexts.entries.filter(
                    (e) => e.contextId === (active.contextId ?? active.id),
                  ).length
                }
              </b>
            )}
          </button>
        </div>
        <nav className="horizon-dock glass-dock" aria-label="Applications">
          <ReactiveSurfaceSlot slot="dock" />
          <button
            className="horizon-dock-launch"
            onClick={() => wmStore.toggleLauncher()}
            title="Applications · F4"
            aria-label="Toutes les applications"
          >
            <LayoutGrid size={22} />
          </button>
          <i className="horizon-dock-divider" />
          {apps.map((app) => {
            const Icon = app.icon,
              running = wm.windows.filter((w) => w.appId === app.id),
              isActive = active?.appId === app.id;
            return (
              <button
                key={app.id}
                className={"horizon-app-icon " + app.color}
                data-running={running.length > 0}
                data-active={isActive}
                aria-label={app.label}
                aria-pressed={isActive}
                title={
                  app.label +
                  (running.length ? ` · ${running.length} fenêtre(s)` : "")
                }
                onClick={() => open(app.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  wmStore.setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    kind: "dock",
                    appId: app.id,
                  });
                }}
              >
                <Icon size={23} strokeWidth={1.65} />
                <span className="horizon-app-tooltip">{app.label}</span>
                {running.length > 0 && <i />}
              </button>
            );
          })}
          <i className="horizon-dock-divider" />
          <button
            className="horizon-dock-launch"
            title="Exposé · F3"
            aria-label="Toutes les fenêtres"
            onClick={() => wmStore.toggleMissionControl()}
          >
            <Layers size={21} />
          </button>
          <button
            className="horizon-dock-launch"
            title="Réglages"
            aria-label="Réglages"
            onClick={() => open("settings")}
          >
            <Settings2 size={21} />
          </button>
        </nav>
        <div className="horizon-bottom-caption">
          <span>
            {visible.length} session{visible.length > 1 ? "s" : ""} ouverte
            {visible.length > 1 ? "s" : ""}
          </span>
          <span>
            {contexts.privateMode ? (
              <>
                <LockKeyhole size={10} /> Mode privé
              </>
            ) : (
              <>
                LOCAL FIRST <span>·</span>{" "}
                {phase === "running" ? "Linux actif" : "Linux " + phase}
              </>
            )}
          </span>
        </div>
      </div>
      {vp.width < 760 && visible.length > 1 && (
        <div className="horizon-mobile-sessions">
          {visible
            .filter((w) => w.id !== active?.id)
            .map((w) => (
              <button key={w.id} onClick={() => wmStore.focusWindow(w.id)}>
                {w.title}
              </button>
            ))}
        </div>
      )}
      {settings && (
        <>
          <button
            className="horizon-popover-dismiss"
            aria-label="Fermer les préférences"
            onClick={() => setSettings(false)}
          />
          <aside className="horizon-preferences">
            <div className="horizon-panel-title">
              <h2>Votre Horizon</h2>
              <button onClick={() => setSettings(false)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <button onClick={() => setLight((v) => !v)}>
              {light ? <Moon size={16} /> : <Sun size={16} />}{" "}
              {light ? "Apparence sombre" : "Apparence claire"}
            </button>
            <button
              aria-pressed={wm.horizonFlat}
              onClick={() => wmStore.setHorizonFlat(!wm.horizonFlat)}
            >
              <Monitor size={16} />{" "}
              {wm.horizonFlat ? "Activer la profondeur" : "Surfaces à plat"}
            </button>
            <button
              aria-pressed={reduced}
              onClick={() => setReduced((v) => !v)}
            >
              <Circle size={16} />{" "}
              {reduced ? "Rétablir les transitions" : "Réduire les mouvements"}
            </button>
            <button
              aria-pressed={contexts.privateMode}
              onClick={() => contextStore.setPrivate(!contexts.privateMode)}
            >
              <LockKeyhole size={16} />{" "}
              {contexts.privateMode
                ? "Reprendre la conservation"
                : "Mode privé"}
            </button>
            <hr />
            <button
              title="Changer de bureau en conservant les applications ouvertes"
              onClick={() => wmStore.setHorizonEnabled(false)}
            >
              <RotateCcw size={16} /> Passer au bureau classique
            </button>
            <button onClick={() => {
              modStore.setWallpaperMode("horizon");
              setSettings(false);
            }}>
              <Sun size={16} /> Paysage Horizon
            </button>
          </aside>
        </>
      )}
      <HorizonHistory />
      {wm.missionControlOpen && <HorizonOverview />}
    </>
  );
}
function usePanelFocus(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  close: () => void,
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("button")
      ?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = [
            ...ref.current!.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,textarea,select,[tabindex="0"]',
            ),
          ],
          i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, [open]);
}
function HorizonHistory() {
  const wm = useWm(),
    state = useContexts(),
    panel = useRef<HTMLElement>(null);
  const [name, setName] = useState("Mon atelier");
  usePanelFocus(wm.horizonHistoryOpen, panel, () =>
    wmStore.setHorizonHistory(false),
  );
  if (!wm.horizonHistoryOpen) return null;
  return (
    <>
      <button
        className="horizon-panel-dismiss"
        aria-label="Fermer l’historique"
        onClick={() => wmStore.setHorizonHistory(false)}
      />
      <aside
        ref={panel}
        className="horizon-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Reprise et historique"
      >
        <div className="horizon-panel-title">
          <div>
            <span className="horizon-eyebrow">MÉMOIRE DE TRAVAIL</span>
            <h2>Retrouver le fil.</h2>
          </div>
          <button
            onClick={() => wmStore.setHorizonHistory(false)}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="horizon-panel-scroll">
          <section className="horizon-save-space">
            <h3>Enregistrer cet espace</h3>
            <p>
              Disposition, applications et tiroirs. Les processus Linux
              dépendent de la session VM ; les documents restent dans leur
              application.
            </p>
            <input
              aria-label="Nom de l’espace"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="horizon-primary"
              disabled={state.privateMode}
              onClick={() => {
                contextStore.saveSpace(name, wm.windows, wm.horizonLayout);
                void contextStore.flush();
              }}
            >
              <Plus size={15} /> Enregistrer
            </button>
          </section>
          {state.error && (
            <p role="alert" className="horizon-error">
              {state.error}
            </p>
          )}
          {state.spaces.map((s) => (
            <article className="horizon-saved-space" key={s.id}>
              <div>
                <h3>{s.name}</h3>
                <p>
                  {s.windows.length} fenêtres ·{" "}
                  {new Date(s.savedAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <button
                onClick={() => {
                  wmStore.setHorizonLayout(s.layout);
                  wmStore.restoreHorizonWindows(s.windows);
                  contextStore.record("Espace restauré", undefined, s.name);
                  wmStore.pushToast(
                    "Disposition restaurée",
                    "Les applications fermées sont rouvertes. Les processus et documents non restaurables nécessitent une reprise.",
                    "info",
                  );
                  wmStore.setHorizonHistory(false);
                }}
              >
                <RotateCcw size={14} /> Reprendre
              </button>
              <button
                aria-label={"Supprimer " + s.name}
                onClick={() => contextStore.removeSpace(s.id)}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
          <div className="horizon-panel-sectiontitle">
            <h3>Activité récente</h3>
            <button onClick={() => contextStore.clearEvents()}>Effacer</button>
          </div>
          {[...state.events].reverse().map((e) => (
            <div className="horizon-history-event" key={e.id}>
              <time>
                {new Date(e.time).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div>
                <strong>{e.title}</strong>
                {e.detail && <p>{e.detail}</p>}
              </div>
              {e.windowId && wm.windows.some((w) => w.id === e.windowId) && (
                <button
                  onClick={() => {
                    wmStore.focusWindow(e.windowId!);
                    wmStore.setHorizonHistory(false);
                  }}
                  aria-label="Revenir à cette fenêtre"
                >
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <footer className="horizon-panel-footer">
          <LockKeyhole size={13} />
          Historique local et effaçable.
        </footer>
      </aside>
    </>
  );
}
function HorizonOverview() {
  const wm = useWm(),
    panel = useRef<HTMLElement>(null),
    [query, setQuery] = useState("");
  useSurfaces();
  usePanelFocus(true, panel, () => wmStore.setMissionControl(false));
  const wins = wm.windows.filter(
    (w) =>
      w.workspace === wm.activeWorkspace &&
      [
        w.title,
        APP_CATALOG[w.appId].title,
        surfaceRegistry.peek(w.id)?.document,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <button
        className="horizon-overview-dismiss"
        aria-label="Fermer Exposé"
        onClick={() => wmStore.setMissionControl(false)}
      />
      <aside
        ref={panel}
        className="horizon-overview-list"
        role="dialog"
        aria-modal="true"
        aria-label="Exposé des sessions"
      >
        <div className="horizon-panel-title">
          <h2>Vos sessions</h2>
          <button
            aria-label="Fermer Exposé"
            onClick={() => wmStore.setMissionControl(false)}
          >
            <X size={18} />
          </button>
        </div>
        <label className="horizon-filter">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Fenêtre, app, document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                panel.current
                  ?.querySelector<HTMLButtonElement>("[data-session-choice]")
                  ?.focus();
              }
            }}
          />
        </label>
        <div className="horizon-overview-workspaces">
          {([1, 2, 3, 4] as WorkspaceId[]).map((ws) => (
            <button
              key={ws}
              aria-pressed={wm.activeWorkspace === ws}
              onClick={() => wmStore.switchWorkspace(ws)}
            >
              Espace {ws}
            </button>
          ))}
        </div>
        <div
          className="horizon-overview-scroll"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[data-session-choice]",
              ),
            ];
            const i = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            items[
              (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length
            ]?.focus();
          }}
        >
          {wins.map((w) => {
            const Icon = horizonAppIcon(w.appId),
              a = surfaceRegistry.peek(w.id);
            return (
              <div className="horizon-session-choice" key={w.id}>
                <button
                  data-session-choice
                  onClick={() => {
                    wmStore.focusWindow(w.id);
                    wmStore.setMissionControl(false);
                  }}
                >
                  <Icon size={20} />
                  <span>
                    <strong>{a?.title ?? w.title}</strong>
                    <small>
                      {a?.document ?? APP_CATALOG[w.appId].shortTitle}
                    </small>
                    <em>
                      {w.minimized
                        ? "Réduite"
                        : w.placement === "left"
                          ? "Aile gauche"
                          : w.placement === "right"
                            ? "Aile droite"
                            : "Centre"}{" "}
                      ·{" "}
                      {a?.status === "live"
                        ? "Surface intégrée"
                        : a?.status === "disconnected"
                          ? "Déconnectée"
                          : "Session ouverte"}
                    </em>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
                <div>
                  <button
                    aria-label={"Mettre " + w.title + " à gauche"}
                    onClick={() => wmStore.placeHorizonWindow(w.id, "left")}
                  >
                    <ArrowDownLeft size={13} />
                  </button>
                  <button
                    aria-label={"Ouvrir le tiroir de " + w.title}
                    onClick={() => {
                      wmStore.setMissionControl(false);
                      wmStore.setHorizonDrawer(w.id);
                    }}
                  >
                    <PanelRight size={13} />
                  </button>
                  <button
                    aria-label={"Mettre " + w.title + " à droite"}
                    onClick={() => wmStore.placeHorizonWindow(w.id, "right")}
                  >
                    <ArrowDownRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {!wins.length && (
            <p className="horizon-panel-intro">
              Aucune session trouvée dans cet espace.
            </p>
          )}
        </div>
        <footer className="horizon-panel-footer">
          ↑ ↓ pour parcourir · Entrée pour reprendre · Échap pour revenir
        </footer>
      </aside>
    </>
  );
}
