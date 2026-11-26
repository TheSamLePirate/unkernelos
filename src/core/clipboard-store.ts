import { wmStore } from "../wm/wm-store.ts";
import { useSyncExternalStore } from "react";
import { uiSounds } from "./ui-sounds.ts";

export interface ClipboardEntry {
  readonly id: string;
  readonly text: string;
  readonly timestamp: number;
  readonly source: "host" | "agent" | "terminal" | "manual";
  readonly pinned: boolean;
}

const STORAGE_KEY = "unkernelos:clipboard:v1";
const MAX_ENTRIES = 50;

function loadEntries(): ClipboardEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: readonly ClipboardEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota
  }
}

class ClipboardStore {
  private entries: readonly ClipboardEntry[] = loadEntries();
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): readonly ClipboardEntry[] => this.entries;

  private emit(): void {
    saveEntries(this.entries);
    for (const fn of this.listeners) fn();
  }

  public record(text: string, source: ClipboardEntry["source"] = "host"): void {
    const clean = text.trim();
    if (!clean) return;
    const existing = this.entries.find((e) => e.text === text);
    const pinned = existing?.pinned ?? false;
    const entry: ClipboardEntry = {
      id: existing?.id ?? Math.random().toString(36).slice(2, 9),
      text,
      timestamp: Date.now(),
      source,
      pinned,
    };
    const rest = this.entries.filter((e) => e.text !== text);
    const pinnedItems = [entry, ...rest].filter((e) => e.pinned);
    const normalItems = [entry, ...rest].filter((e) => !e.pinned);
    this.entries = [...pinnedItems, ...normalItems].slice(0, MAX_ENTRIES);
    this.emit();
  }

  public async copyToHost(
    text: string,
    source: ClipboardEntry["source"] = "manual",
  ): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      this.record(text, source);
      uiSounds.playClick();
      return true;
    } catch {
      wmStore.pushToast(
        "Copie refusée",
        "Le navigateur a refusé le presse-papiers. Sélectionnez le texte et copiez-le manuellement.",
        "warn",
      );
      return false;
    }
  }

  public togglePin(id: string): void {
    this.entries = this.entries
      .map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e))
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.timestamp - a.timestamp,
      );
    this.emit();
  }

  public remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.emit();
  }

  public clearUnpinned(): void {
    this.entries = this.entries.filter((e) => e.pinned);
    this.emit();
  }
}

export const clipboardStore = new ClipboardStore();

export function useClipboardHistory(): readonly ClipboardEntry[] {
  return useSyncExternalStore(
    clipboardStore.subscribe,
    clipboardStore.getSnapshot,
  );
}
