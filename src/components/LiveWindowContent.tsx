import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { attachWindowAutomation } from "../core/window-automation.ts";
import { rememberWindowSelection, recordWindowCopy } from "../core/horizon-selection.ts";
import { wmStore } from "../wm/wm-store.ts";

/** A shell owns the frame; the session owns the live app and its portal target.
 * Park the target while React replaces a frame, before the old DOM is removed.
 * Atomic DOM moves preserve iframe documents on browsers supporting moveBefore.
 */
export function useLiveWindowContent(id: string, children: React.ReactNode) {
  const parking = useRef<HTMLDivElement>(null);
  const focus = useRef<HTMLElement | null>(null);
  const [host] = useState(() => {
    const node = document.createElement("div");
    node.className = "window-app-host";
    node.dataset.appContent = id;
    return node;
  });
  const move = useCallback((parent: HTMLElement) => {
    if (host.contains(document.activeElement))
      focus.current = document.activeElement as HTMLElement;
    const atomic = parent as HTMLElement & { moveBefore?: (node: Node, before: Node | null) => void };
    if (host.isConnected && parent.isConnected && typeof atomic.moveBefore === "function")
      atomic.moveBefore(host, null);
    else parent.appendChild(host);
  }, [host]);
  const slot = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    move(node);
    if (focus.current?.isConnected) focus.current.focus({ preventScroll: true });
    return () => {
      if (parking.current?.isConnected) move(parking.current);
    };
  }, [move]);
  useEffect(() => attachWindowAutomation(id, host), [id, host]);
  const selection = () => rememberWindowSelection(id, host);
  return {
    parking: <div ref={parking} hidden data-window-parking={id} />,
    slot: <div ref={slot} className="window-app-slot" />,
    content: createPortal(
      <div
        className="window-app-content"
        onPointerDownCapture={() => {
          if (wmStore.getSnapshot().activeWindowId !== id)
            wmStore.focusWindow(id, false);
        }}
        onPointerUpCapture={selection}
        onKeyUpCapture={selection}
        onCopyCapture={() => recordWindowCopy(id, host)}
      >
        {children}
      </div>, host, id),
  };
}
