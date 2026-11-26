import {
  rememberWindowSelection,
  recordWindowCopy,
} from "../../core/horizon-selection.ts";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  WindowSessionContext,
  surfaceRegistry,
  useSurfaces,
} from "../../core/app-surface-registry.tsx";
import { contextStore } from "../../core/context-store.ts";
import { useViewport } from "../../core/use-viewport.ts";
import { HorizonWindowDrawer } from "./HorizonDrawer.tsx";
import { HorizonDockFace } from "./HorizonDockFace.tsx";
import {
  clamp,
  horizonDepthScale,
  horizonTravel,
  HORIZON_DOCK_DEPTH,
  horizonPose,
  type HorizonPlacement,
} from "../../wm/horizon-layout.ts";
import {
  APP_CATALOG,
  useWm,
  wmStore,
  type WindowInstance,
} from "../../wm/wm-store.ts";
import { ReactiveSurfaceSlot } from "../ReactiveSurfaceHost.tsx";
import { screenToElement } from "../../core/spatial-pointer.ts";
interface Props {
  win: WindowInstance;
  focused: boolean;
  visible: boolean;
  children: React.ReactNode;
}
type Gesture = {
  id: number;
  startX: number;
  startY: number;
  localX: number;
  localY: number;
  pose: ReturnType<typeof horizonPose>;
  kind: string;
  moved: boolean;
  el: HTMLElement;
  raf: number;
  x: number;
  y: number;
};
const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export function HorizonWindowFrame({ win, focused, visible, children }: Props) {
  useSurfaces();
  const suppressClick = useRef(false);
  const wm = useWm(),
    vp = useViewport(),
    frame = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    cleanup = useRef<(() => void) | null>(null);
  const [docking, setDocking] = useState(false);
  const [moving, setMoving] = useState(false),
    [destination, setDestination] = useState<HorizonPlacement | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number } | null>(null),
    [geometry, setGeometry] = useState(false);
  const [draft, setDraft] = useState({ width: win.width, height: win.height });
  const [closeRequested, setCloseRequested] = useState(false);
  const [savingBeforeClose, setSavingBeforeClose] = useState(false);
  const requestClose = () => {
    if (surfaceRegistry.peek(win.id)?.state.dirty) setCloseRequested(true);
    else wmStore.closeWindow(win.id);
  };
  useEffect(() => {
    if (!closeRequested) return;
    const before = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[data-horizon-close="' + win.id + '"] button:not(:disabled)',
        ),
      ];
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && i === list.length - 1) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [closeRequested]);

  const place = win.placement ?? "center",
    basePose = horizonPose(
      win,
      wm.windows,
      vp.width,
      Math.min(vp.height, vp.visualHeight),
      wm.activeWorkspace,
      wm.horizonFlat,
    );
  const overviewWindows = wm.windows.filter(
    (w) => w.workspace === wm.activeWorkspace && !w.minimized,
  );
  const index = Math.max(
      0,
      overviewWindows.findIndex((w) => w.id === win.id),
    ),
    cols = Math.max(1, Math.ceil(Math.sqrt(overviewWindows.length))),
    rows = Math.max(1, Math.ceil(overviewWindows.length / cols)),
    cw = (vp.width - 375) / cols,
    ch = (vp.height - 245) / rows;
  const previewW = Math.max(600, win.width),
    previewH = Math.max(380, win.height),
    previewScale = Math.max(
      0.03,
      Math.min((cw - 20) / previewW, (ch - 30) / previewH, 0.65),
    );
  const pose =
    wm.missionControlOpen && vp.width >= 760
      ? {
          ...basePose,
          docked: false,
          x: 24 + (index % cols) * cw + (cw - previewW * previewScale) / 2,
          y:
            120 +
            Math.floor(index / cols) * ch +
            (ch - previewH * previewScale) / 2,
          width: previewW,
          height: previewH,
          scale: previewScale,
          angle: 0,
          z: 20 + index,
        }
      : basePose;
  const transform = (p: typeof pose) =>
    `translate3d(${p.x}px,${p.y}px,0) perspective(1800px) rotateY(${p.angle}deg) scale(${p.scale})`;
  const reset = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    cancelAnimationFrame(g.raf);
    cleanup.current?.();
    cleanup.current = null;
    if (g.el.hasPointerCapture(g.id)) g.el.releasePointerCapture(g.id);
    if (frame.current) {
      frame.current.style.transform = transform(g.pose);
      frame.current.style.width = g.pose.width + "px";
      frame.current.style.height = g.pose.height + "px";
      frame.current.removeAttribute("data-gesture");
    }
    setMoving(false);
    setDestination(null);
    setDocking(false);
  }, []);
  useEffect(() => () => reset(), [reset]);
  useEffect(() => {
    reset();
  }, [vp.width, vp.height]);
  const onStart = (
    e: React.PointerEvent<HTMLElement>,
    kind = "move",
    fromDock = false,
  ) => {
    if (wm.missionControlOpen || win.maximized) return;
    if (
      e.button !== 0 ||
      !e.isPrimary ||
      (e.target instanceof Element &&
        kind === "move" &&
        !fromDock &&
        e.target.closest("button,input,select,a"))
    )
      return;
    if (gesture.current) return;
    e.preventDefault();
    suppressClick.current = false;
    // The non-transformed desktop owns capture after activation. Dock/window
    // planes change scale and hit regions during travel; a tap keeps its native click.
    const el =
      frame.current?.closest<HTMLElement>(".horizon-root") ??
      frame.current ??
      e.currentTarget;
    if (!fromDock) wmStore.focusWindow(win.id, false);
    const local = fromDock
      ? { x: pose.width / 2, y: 24 }
      : frame.current
        ? screenToElement(frame.current, e.clientX, e.clientY)
        : { x: 0, y: 0 };
    const g: Gesture = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      localX: local.x,
      localY: local.y,
      pose,
      kind,
      moved: false,
      el,
      raf: 0,
      x: e.clientX,
      y: e.clientY,
    };
    gesture.current = g;
    const travel = (x: number) =>
      vp.width < 760
        ? { placement: "center" as const, depth: 0, docked: false }
        : horizonTravel(x, vp.width);
    const targetPlace = (x: number): HorizonPlacement => travel(x).placement;
    const paint = () => {
      g.raf = 0;
      const node = frame.current;
      if (!node || gesture.current !== g || !g.moved) return;
      node.setAttribute("data-gesture", "true");
      const dx = g.x - g.startX,
        dy = g.y - g.startY;
      if (kind === "move") {
        const destination = travel(g.x),
          depth = destination.depth;
        const amount = Math.min(1, Math.hypot(dx, dy) / 80);
        const targetScale = horizonDepthScale(depth);
        const actualScale = pose.scale + (targetScale - pose.scale) * amount;
        const angle = wm.horizonFlat
          ? 0
          : destination.placement === "left"
            ? depth * 22
            : destination.placement === "right"
              ? -depth * 22
              : 0;
        node.style.transform = transform({
          ...pose,
          x: clamp(
            g.x - local.x * actualScale,
            12,
            Math.max(12, vp.width - pose.width * actualScale - 12),
          ),
          y: clamp(
            g.y - local.y * actualScale,
            100,
            Math.max(100, vp.height - 110 - pose.height * actualScale),
          ),
          scale: actualScale,
          angle,
        });
        node.dataset.travelDepth = String(depth);
      } else {
        const def = APP_CATALOG[win.appId],
          minW = Math.min(def.minWidth, pose.width, 400),
          minH = Math.min(def.minHeight, pose.height, 260);
        const w = Math.max(
          minW,
          Math.min(
            vp.width - 28,
            pose.width +
              (kind.includes("w") ? -dx : kind.includes("e") ? dx : 0),
          ),
        );
        const h = Math.max(
          minH,
          Math.min(
            vp.visualHeight - 180,
            pose.height +
              (kind.includes("n") ? -dy : kind.includes("s") ? dy : 0),
          ),
        );
        node.style.width = w + "px";
        node.style.height = h + "px";
        node.style.transform = transform({
          ...pose,
          x: pose.x + (kind.includes("w") ? pose.width - w : 0),
          y: pose.y + (kind.includes("n") ? pose.height - h : 0),
        });
      }
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return;
      g.x = ev.clientX;
      g.y = ev.clientY;
      if (
        !g.moved &&
        Math.hypot(g.x - g.startX, g.y - g.startY) >
          (ev.pointerType === "mouse" ? 5 : 10)
      ) {
        g.moved = true;
        if (fromDock) wmStore.focusWindow(win.id, false);
        g.el.setPointerCapture(g.id);
        suppressClick.current = true;
        setMoving(true);
      }
      if (g.moved) {
        const next = targetPlace(g.x);
        setDocking(travel(g.x).docked);
        setDestination((prev) => (prev === next ? prev : next));
        if (!g.raf) g.raf = requestAnimationFrame(paint);
      }
    };
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return;
      g.x = ev.clientX;
      g.y = ev.clientY;
      if (g.raf) {
        cancelAnimationFrame(g.raf);
        paint();
      }
      const moved = g.moved;
      const node = frame.current;
      const width = node?.offsetWidth ?? pose.width,
        height = node?.offsetHeight ?? pose.height;
      reset();
      if (!moved) return;
      if (kind === "move") {
        const dest = targetPlace(g.x);
        const depth = travel(g.x).depth,
          scale = horizonDepthScale(depth);
        const wingTop = 165,
          wingH = Math.max(100, vp.height - wingTop - 110);
        wmStore.placeHorizonWindow(win.id, dest, undefined, {
          depth,
          anchor: g.localX / pose.width,
          y: clamp(
            (g.y - g.localY * scale - wingTop) /
              Math.max(1, wingH - pose.height * scale),
            0,
            1,
          ),
        });
        if (dest === "center") {
          const current = wmStore.getSnapshot();
          const movedWindow = current.windows.find((w) => w.id === win.id)!;
          const settled = horizonPose(
            movedWindow,
            current.windows,
            vp.width,
            vp.height,
            current.activeWorkspace,
            current.horizonFlat,
          );
          wmStore.setHorizonOffset(win.id, {
            x: (movedWindow.horizonOffset?.x ?? 0) + g.x - g.localX - settled.x,
            y: (movedWindow.horizonOffset?.y ?? 0) + g.y - g.localY - settled.y,
          });
        }
        contextStore.record(
          "Fenêtre déplacée",
          win.id,
          dest === "center"
            ? "Centre"
            : dest === "left"
              ? depth >= HORIZON_DOCK_DEPTH
                ? "Dock gauche"
                : "Profondeur gauche"
              : depth >= HORIZON_DOCK_DEPTH
                ? "Dock droit"
                : "Profondeur droite",
        );
      } else {
        wmStore.rememberHorizon();
        wmStore.moveResize(win.id, { width, height });
        wmStore.setHorizonOffset(win.id, {
          x:
            (win.horizonOffset?.x ?? 0) +
            ((kind.includes("w") ? -1 : 1) * (width - pose.width)) / 2,
          y:
            (win.horizonOffset?.y ?? 0) +
            ((kind.includes("n") ? -1 : 1) * (height - pose.height)) / 2,
        });
      }
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.type === "lostpointercapture" && ev.target !== g.el) return;
      if (ev.pointerId === g.id) reset();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        reset();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", reset);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", reset);
    };
  };
  const openMenu = (x: number, y: number) => {
    setDraft({
      width: Math.round(pose.width),
      height: Math.round(pose.height),
    });
    setMenu({
      x: Math.max(8, Math.min(x, vp.width - 270)),
      y: Math.max(8, Math.min(y, vp.height - 470)),
    });
  };
  const closeMenu = () => {
    setMenu(null);
    frame.current
      ?.querySelector<HTMLButtonElement>("[data-menu-trigger]")
      ?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!menu) return;
    const prev = document.activeElement;
    const el = document.querySelector<HTMLElement>(
      '[data-horizon-menu="' + win.id + '"]',
    );
    el?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
      if (e.key === "Tab") {
        const buttons = el?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input",
        );
        if (!buttons?.length) return;
        const a = [...buttons],
          i = a.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i === 0) {
          e.preventDefault();
          a.at(-1)?.focus();
        } else if (!e.shiftKey && i === a.length - 1) {
          e.preventDefault();
          a[0]?.focus();
        }
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const a = [...el!.querySelectorAll<HTMLElement>("button")];
        a[
          (a.indexOf(document.activeElement as HTMLElement) +
            (e.key === "ArrowDown" ? 1 : -1) +
            a.length) %
            a.length
        ]?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
    };
  }, [menu]);
  const command = (fn: () => void) => {
    closeMenu();
    fn();
  };
  const a = surfaceRegistry.peek(win.id);
  return (
    <>
      <div
        ref={frame}
        data-window-surface={win.id}
        data-horizon-window={win.id}
        data-placement={place}
        data-docked={!!pose.docked && !moving}
        data-maximized={win.maximized && !wm.missionControlOpen}
        data-drawer-open={!!win.horizonDrawerOpen && !wm.missionControlOpen}
        data-depth={pose.depth ?? 0}
        data-focused={focused}
        data-app-id={win.appId}
        aria-label={win.title}
        role="region"
        aria-hidden={pose.hidden || !visible}
        inert={pose.hidden || !visible}
        className={"horizon-window " + (focused ? "glass-surface-focused" : "glass-surface")}
        style={{
          width: pose.width,
          height: pose.height,
          transform: transform(pose),
          zIndex: moving ? 800 : pose.z,
          visibility: pose.hidden || !visible ? "hidden" : "visible",
          pointerEvents: pose.hidden || !visible ? "none" : "auto",
        }}
        onPointerUpCapture={(e) => {
          if ((e.target as Element).closest("[data-window-drawer]")) return;
          if (frame.current) rememberWindowSelection(win.id, frame.current);
        }}
        onKeyUpCapture={(e) => {
          if ((e.target as Element).closest("[data-window-drawer]")) return;
          if (frame.current) rememberWindowSelection(win.id, frame.current);
        }}
        onCopyCapture={(e) => {
          if ((e.target as Element).closest("[data-window-drawer]")) return;
          if (frame.current) recordWindowCopy(win.id, frame.current);
        }}
        onClick={() => {
          if (wm.missionControlOpen) {
            wmStore.focusWindow(win.id);
            wmStore.setMissionControl(false);
          }
        }}
        onPointerDownCapture={(e) => {
          if (
            !e.target ||
            !(e.target instanceof Element) ||
            e.target.closest("button")
          )
            return;
          if (!focused) wmStore.focusWindow(win.id, false);
        }}
      >
        {[
          [0, 0],
          ["100%", 0],
          ["100%", "100%"],
          [0, "100%"],
        ].map(([x, y], i) => (
          <i
            key={i}
            data-plane-corner
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        ))}
        <header
          data-unkernel-titlebar="true"
          inert={!!pose.docked && !moving}
          className="horizon-windowbar"
          onPointerDown={(e) => onStart(e)}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest("button"))
              wmStore.toggleMaximize(win.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
          }}
          onKeyDown={(e) => {
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(r.left + 10, r.bottom);
            }
          }}
          tabIndex={0}
          aria-label={"Commandes de " + win.title}
        >
          <div className="horizon-traffic">
            <button
              aria-label={"Fermer " + win.title}
              title="Fermer"
              onClick={requestClose}
            >
              <X size={10} />
            </button>
            <button
              aria-label={"Réduire " + win.title}
              title="Réduire"
              onClick={() => wmStore.minimizeWindow(win.id)}
            >
              <Minus size={10} />
            </button>
            <button
              aria-label={win.maximized ? "Restaurer la fenêtre" : "Plein écran"}
              title={win.maximized ? "Restaurer la fenêtre" : "Plein écran"}
              aria-pressed={win.maximized}
              onClick={() => wmStore.toggleMaximize(win.id)}
            >
              {win.maximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
            </button>
          </div>
          <span className="horizon-windowtitle">{a?.title ?? win.title}</span>
          {focused && <ReactiveSurfaceSlot slot="titlebar" />}
          <div className="horizon-windowtools">
            <button
              title="Aile gauche"
              aria-label="Placer dans l’aile gauche"
              onClick={() => wmStore.placeHorizonWindow(win.id, "left")}
            >
              <ArrowDownLeft size={14} />
            </button>
            <button
              title="Tiroir de cette fenêtre"
              aria-label="Ouvrir le tiroir de cette fenêtre"
              data-drawer-toggle
              aria-expanded={!!win.horizonDrawerOpen}
              aria-controls={"horizon-drawer-" + win.id}
              onClick={() => wmStore.toggleHorizonDrawer(win.id)}
            >
              <PanelRight size={14} />
            </button>
            <button
              title="Aile droite"
              aria-label="Placer dans l’aile droite"
              onClick={() => wmStore.placeHorizonWindow(win.id, "right")}
            >
              <ArrowDownRight size={14} />
            </button>
            <button
              data-menu-trigger
              aria-label="Options de la fenêtre"
              aria-haspopup="menu"
              aria-expanded={!!menu}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu(r.right - 255, r.bottom + 8);
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        </header>
        <WindowSessionContext.Provider value={win}>
          <div
            className="horizon-windowbody"
            inert={!!pose.docked && !moving}
            style={{
              pointerEvents: wm.missionControlOpen ? "none" : undefined,
            }}
          >
            {children}
          </div>
        </WindowSessionContext.Provider>
        <HorizonWindowDrawer
          win={win}
          open={!!win.horizonDrawerOpen && !wm.missionControlOpen && !moving}
        />
        {!pose.docked && !wm.missionControlOpen && !win.maximized && (
          <button
            className="horizon-drawer-tab"
            data-drawer-toggle
            aria-label={
              win.horizonDrawerOpen
                ? "Fermer le tiroir de cette fenêtre"
                : "Ouvrir le tiroir de cette fenêtre"
            }
            aria-expanded={!!win.horizonDrawerOpen}
            aria-controls={"horizon-drawer-" + win.id}
            onClick={() => wmStore.toggleHorizonDrawer(win.id)}
          >
            <PanelRight size={15} />
            <span>{win.horizonDrawerOpen ? "Fermer" : "Tiroir"}</span>
          </button>
        )}
        {place !== "center" && !pose.docked && !wm.missionControlOpen && (
          <div
            className="horizon-surface-label"
            style={{
              width: Math.max(130, Math.min(250, pose.width * pose.scale)),
              transform: `scale(${1 / pose.scale})`,
              top: -30 / pose.scale,
            }}
          >
            <button
              onClick={() => wmStore.focusWindow(win.id)}
              title="Ramener au centre"
            >
              {a?.title ?? win.title}
            </button>
            <button
              data-drawer-toggle
              aria-label={"Tiroir de " + win.title}
              aria-expanded={!!win.horizonDrawerOpen}
              onClick={() => wmStore.toggleHorizonDrawer(win.id)}
            >
              <PanelRight size={13} />
            </button>
          </div>
        )}
        {pose.docked && (
          <HorizonDockFace
            win={win}
            scale={pose.scale}
            onGrab={(e) => onStart(e, "move", true)}
            suppressClick={suppressClick}
            onMenu={openMenu}
          />
        )}
        {place === "center" &&
          !win.maximized &&
          vp.width >= 760 &&
          directions.map((dir) => (
            <div
              key={dir}
              className={"horizon-resize horizon-resize-" + dir}
              onPointerDown={(e) => onStart(e, dir)}
              aria-hidden="true"
            />
          ))}
      </div>
      {moving &&
        destination &&
        createPortal(
          <div className="horizon-depth-guide" aria-live="polite">
            <span>
              {destination === "center"
                ? "Ramener au centre"
                : destination === "left"
                  ? docking
                    ? "Relâcher pour docker à gauche"
                    : "Éloigner à gauche · extrémité pour docker"
                  : docking
                    ? "Relâcher pour docker à droite"
                    : "Éloigner à droite · extrémité pour docker"}
            </span>
          </div>,
          document.body,
        )}
      {closeRequested &&
        createPortal(
          <div
            className="horizon-menu-scrim horizon-close-scrim"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setCloseRequested(false);
              }
            }}
          >
            <section
              data-horizon-close={win.id}
              className="horizon-close-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-label="Modifications non enregistrées"
            >
              <FileWarningIcon />
              <h2>Garder vos modifications ?</h2>
              <p>
                Les modifications de {win.title} ne sont pas encore enregistrées
                dans Linux.
              </p>
              <div>
                <button autoFocus onClick={() => setCloseRequested(false)}>
                  Continuer à travailler
                </button>
                <button onClick={() => wmStore.closeWindow(win.id)}>
                  Fermer sans enregistrer
                </button>
                {surfaceRegistry.peek(win.id)?.actions?.save && (
                  <button
                    disabled={savingBeforeClose}
                    onClick={() => {
                      setSavingBeforeClose(true);
                      Promise.resolve()
                        .then(() =>
                          surfaceRegistry.peek(win.id)!.actions!.save!.run({}),
                        )
                        .then(() => wmStore.closeWindow(win.id))
                        .catch((e) => {
                          setSavingBeforeClose(false);
                          wmStore.pushToast(
                            "Sauvegarde échouée",
                            String(e),
                            "error",
                          );
                        });
                    }}
                  >
                    {savingBeforeClose
                      ? "Enregistrement…"
                      : "Enregistrer et fermer"}
                  </button>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
      {menu &&
        createPortal(
          <div
            className="horizon-menu-scrim"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) closeMenu();
            }}
          >
            <div
              role="menu"
              aria-label="Options de fenêtre"
              data-horizon-menu={win.id}
              className="horizon-menu"
              style={{ left: menu.x, top: menu.y }}
            >
              <div className="horizon-menu-label">{win.title}</div>
              <button
                role="menuitem"
                onClick={() =>
                  command(() => wmStore.placeHorizonWindow(win.id, "center"))
                }
              >
                <ArrowUpLeft size={15} /> Ramener au centre
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  command(() => wmStore.placeHorizonWindow(win.id, "left"))
                }
              >
                <ArrowDownLeft size={15} /> Aile gauche
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  command(() => wmStore.placeHorizonWindow(win.id, "right"))
                }
              >
                <ArrowDownRight size={15} /> Aile droite
              </button>
              <hr />
              <button
                role="menuitem"
                onClick={() => command(() => wmStore.toggleMaximize(win.id))}
              >
                {win.maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                {win.maximized ? "Restaurer la fenêtre" : "Plein écran"}
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  command(() => wmStore.toggleHorizonDrawer(win.id))
                }
              >
                <PanelRight size={15} /> Ouvrir le tiroir
              </button>
              <button role="menuitem" onClick={() => setGeometry((v) => !v)}>
                <Maximize2 size={15} /> Taille précise
              </button>
              {geometry && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    command(() => {
                      wmStore.rememberHorizon();
                      wmStore.moveResize(win.id, {
                        width: Math.max(
                          240,
                          Math.min(vp.width - 24, draft.width),
                        ),
                        height: Math.max(
                          180,
                          Math.min(vp.visualHeight - 180, draft.height),
                        ),
                      });
                    });
                  }}
                  className="horizon-size-form"
                >
                  <label>
                    Largeur
                    <input
                      type="number"
                      min="240"
                      max={vp.width - 24}
                      value={draft.width}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          width: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Hauteur
                    <input
                      type="number"
                      min="180"
                      max={vp.visualHeight - 180}
                      value={draft.height}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          height: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <button type="submit">
                    <Check size={14} />
                    Appliquer
                  </button>
                </form>
              )}
              <button
                role="menuitem"
                onClick={() =>
                  command(() =>
                    wmStore.placeHorizonWindow(win.id, "left", undefined, {
                      depth: 1,
                      y: 0.5,
                      anchor: 0.5,
                    }),
                  )
                }
              >
                <ArrowDownLeft size={15} /> Docker à gauche
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  command(() =>
                    wmStore.placeHorizonWindow(win.id, "right", undefined, {
                      depth: 1,
                      y: 0.5,
                      anchor: 0.5,
                    }),
                  )
                }
              >
                <ArrowDownRight size={15} /> Docker à droite
              </button>
              <button
                role="menuitem"
                onClick={() => command(() => wmStore.undoHorizon())}
              >
                <RotateCcw size={15} /> Annuler le placement
              </button>
              <hr />
              <button role="menuitem" onClick={() => command(requestClose)}>
                <X size={15} /> Fermer cette fenêtre
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function FileWarningIcon() {
  return <PanelRight size={26} strokeWidth={1} />;
}
