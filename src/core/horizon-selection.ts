import { contextStore } from "./context-store.ts";
import { surfaceRegistry } from "./app-surface-registry.tsx";
import { wmStore } from "../wm/wm-store.ts";
interface SelectionSnapshot {
  text: string;
  document?: string;
  capturedAt: number;
}
const selections = new Map<string, SelectionSnapshot>();
export function rememberWindowSelection(id: string, root: HTMLElement): string {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    if (
      !root.contains(active) ||
      (active instanceof HTMLInputElement &&
        ["password", "hidden"].includes(active.type)) ||
      active.closest("[data-private]")
    )
      return "";
    const { selectionStart: s, selectionEnd: e } = active;
    if (s !== null && e !== null && e > s) {
      const text = active.value.slice(s, e);
      selections.set(id, {
        text,
        document: surfaceRegistry.peek(id)?.document,
        capturedAt: Date.now(),
      });
      return text;
    }
    selections.delete(id);
    return "";
  }
  const selection = window.getSelection();
  if (
    selection?.anchorNode &&
    selection.focusNode &&
    root.contains(selection.anchorNode) &&
    root.contains(selection.focusNode) &&
    selection.toString().trim()
  ) {
    const text = selection.toString();
    selections.set(id, {
      text,
      document: surfaceRegistry.peek(id)?.document,
      capturedAt: Date.now(),
    });
    return text;
  }
  if (
    selection?.anchorNode &&
    root.contains(selection.anchorNode) &&
    selection.isCollapsed
  )
    selections.delete(id);
  return "";
}
export function keepWindowSelection(id: string) {
  const win = wmStore.getSnapshot().windows.find((w) => w.id === id),
    s = selections.get(id);
  if (
    !win ||
    !s ||
    s.document !== surfaceRegistry.peek(id)?.document ||
    Date.now() - s.capturedAt > 5 * 60_000
  )
    throw new Error(
      "Sélectionnez un extrait dans cette fenêtre avant de le conserver.",
    );
  return contextStore.add({
    contextId: win.contextId ?? win.id,
    kind: "text",
    text: s.text,
    source: {
      windowId: id,
      appId: win.appId,
      title: win.title,
      document: s.document,
      confidence: "explicit",
    },
  });
}
export function recordWindowCopy(id: string, root: HTMLElement) {
  const text = rememberWindowSelection(id, root);
  const win = wmStore.getSnapshot().windows.find((w) => w.id === id);
  if (text && win)
    contextStore.add({
      contextId: win.contextId ?? id,
      kind: "text",
      text,
      source: {
        windowId: id,
        appId: win.appId,
        title: win.title,
        document: surfaceRegistry.peek(id)?.document,
        confidence: "observed",
      },
    });
}
