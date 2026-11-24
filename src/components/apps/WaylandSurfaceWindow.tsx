import React, { useEffect, useRef } from "react";
import { waylandDesktopManager } from "../../core/wayland-host.ts";

interface WaylandSurfaceWindowProps {
  readonly surfaceKey: string;
  readonly windowFocused: boolean;
  readonly visible: boolean;
}

/**
 * Mounts a native Linux Wayland toplevel surface (foot, GTK, Qt, SDL, Mesa EGL/dmabuf)
 * directly inside an unkernelOS AAA Dark Glass <WindowFrame>.
 */
export const WaylandSurfaceWindow: React.FC<WaylandSurfaceWindowProps> = ({
  surfaceKey,
  windowFocused,
  visible,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);

  // Mount the wland ViewWindow DOM element into this OS WindowFrame
  useEffect(() => {
    const host = hostRef.current;
    const viewWin = waylandDesktopManager.getViewWindow(surfaceKey);
    if (!host || !viewWin) return;

    const el = viewWin.element;
    el.style.position = "relative";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = "100%";
    el.style.height = "100%";
    host.innerHTML = "";
    host.appendChild(el);

    const syncGeometry = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width >= 100 && rect.height >= 60) {
        waylandDesktopManager.resizeWindow(surfaceKey, rect.width, rect.height);
        waylandDesktopManager.setWindowPosition(surfaceKey, rect.left, rect.top);
      }
    };

    syncGeometry();
    const ro = new ResizeObserver(syncGeometry);
    ro.observe(host);

    return () => {
      ro.disconnect();
      if (el.parentElement === host) {
        el.remove();
      }
    };
  }, [surfaceKey]);

  // Sync keyboard focus with wland Seat
  useEffect(() => {
    if (windowFocused && visible) {
      waylandDesktopManager.focusWindow(surfaceKey);
    } else if (!windowFocused) {
      waylandDesktopManager.blur();
    }
  }, [surfaceKey, windowFocused, visible]);

  // Pause rendering when hidden in another workspace or minimized
  useEffect(() => {
    waylandDesktopManager.setVisible(surfaceKey, visible);
  }, [surfaceKey, visible]);

  return (
    <div
      ref={hostRef}
      onPointerDown={() => waylandDesktopManager.focusWindow(surfaceKey)}
      className="relative w-full h-full bg-[#090b12] overflow-hidden"
    />
  );
};
