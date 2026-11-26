import { useSyncExternalStore } from "react";
import type { WindowInstance } from "../wm/wm-store.ts";
export interface ContextEntry {
  id: string;
  contextId: string;
  kind: "text" | "link" | "file" | "image";
  text: string;
  createdAt: number;
  source: {
    windowId?: string;
    appId?: string;
    title: string;
    document?: string;
    confidence: "app" | "explicit" | "observed" | "unknown";
  };
  pinned: boolean;
  blob?: Blob;
  name?: string;
  mime?: string;
  guestPath?: string;
}
export interface HorizonEvent {
  id: string;
  time: number;
  title: string;
  windowId?: string;
  detail?: string;
}
export interface SavedSpace {
  id: string;
  name: string;
  savedAt: number;
  windows: readonly WindowInstance[];
  layout: "focus" | "split" | "triple";
}
interface ContextState {
  entries: readonly ContextEntry[];
  events: readonly HorizonEvent[];
  spaces: readonly SavedSpace[];
  ready: boolean;
  saving: boolean;
  error: string | null;
  privateMode: boolean;
}
const initial: ContextState = {
  entries: [],
  events: [],
  spaces: [],
  ready: false,
  saving: false,
  error: null,
  privateMode: false,
};
export class ContextStore {
  private state: ContextState = initial;
  private listeners = new Set<() => void>();
  private db: IDBDatabase | null = null;
  private blobIds = new Set<string>();
  private changes = 0;
  private writes: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private boot: Promise<void> | null = null;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private emit() {
    for (const fn of this.listeners) fn();
  }
  private update(patch: Partial<ContextState>, persist = true) {
    if (persist) this.changes++;
    this.state = {
      ...this.state,
      ...patch,
      ...(persist && !this.state.privateMode ? { saving: true } : {}),
    };
    this.emit();
    if (persist) this.schedule();
  }
  initialize(): Promise<void> {
    if (this.boot) return this.boot;
    this.boot = this.load();
    return this.boot;
  }
  private async load() {
    if (typeof indexedDB === "undefined") {
      this.update(
        {
          ready: true,
          error:
            "Stockage persistant indisponible. Les nouveaux éléments restent dans cette session.",
        },
        false,
      );
      return;
    }
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("unkernelos-horizon", 2);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("state"))
            req.result.createObjectStore("state");
          if (!req.result.objectStoreNames.contains("blobs"))
            req.result.createObjectStore("blobs");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () =>
          reject(
            new Error("Fermez les anciennes fenêtres pour ouvrir le stockage."),
          );
      });
      this.db.onversionchange = () => {
        this.db?.close();
        this.db = null;
        this.update(
          {
            error:
              "Stockage mis à jour dans un autre onglet. Rechargez pour reprendre la conservation.",
          },
          false,
        );
      };
      const saved = await new Promise<Partial<ContextState> | undefined>(
        (resolve, reject) => {
          const req = this.db!.transaction("state")
            .objectStore("state")
            .get("v1");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        },
      );
      const loadedEntries = await Promise.all(
        (saved?.entries ?? []).map(async (e) => {
          if (e.blob) return e;
          const blob = await new Promise<Blob | undefined>(
            (resolve, reject) => {
              const req = this.db!.transaction("blobs")
                .objectStore("blobs")
                .get(e.id);
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            },
          );
          if (blob) this.blobIds.add(e.id);
          return blob ? { ...e, blob } : e;
        }),
      );
      const merge = <T extends { id: string }>(
        a: readonly T[],
        b: readonly T[],
      ) => [...new Map([...a, ...b].map((x) => [x.id, x])).values()];
      this.update(
        {
          entries: merge(loadedEntries, this.state.entries),
          events: merge(saved?.events ?? [], this.state.events).slice(-200),
          spaces: merge(saved?.spaces ?? [], this.state.spaces),
          ready: true,
        },
        false,
      );
    } catch (e) {
      this.update(
        { ready: true, error: "Conservation indisponible : " + String(e) },
        false,
      );
    }
  }
  private schedule() {
    if (this.state.privateMode) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 180);
  }
  flush(): Promise<void> {
    const write = async () => {
      await this.initialize();
      if (!this.db || this.state.privateMode) return;
      const { entries, events, spaces } = this.state,
        revision = this.changes;
      const blobs = entries.filter((e) => !!e.blob),
        nextBlobIds = new Set(blobs.map((e) => e.id));
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(["state", "blobs"], "readwrite");
          tx.objectStore("state").put(
            { entries: entries.map(({ blob, ...e }) => e), events, spaces },
            "v1",
          );
          for (const e of blobs)
            if (!this.blobIds.has(e.id))
              tx.objectStore("blobs").put(e.blob, e.id);
          for (const id of this.blobIds)
            if (!nextBlobIds.has(id)) tx.objectStore("blobs").delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        this.blobIds = nextBlobIds;
        this.update({ error: null, saving: revision !== this.changes }, false);
      } catch (e) {
        this.update(
          {
            saving: false,
            error:
              "Échec de sauvegarde. Exportez vos éléments avant de fermer : " +
              String(e),
          },
          false,
        );
      }
    };
    this.writes = this.writes.then(write, write);
    return this.writes;
  }
  add(input: Omit<ContextEntry, "id" | "createdAt" | "pinned">): ContextEntry {
    const entry: ContextEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      pinned: false,
    };
    if (this.state.privateMode) return entry;
    // Cap unpinned text history per drawer; pinned items and explicit files are retained.
    const entries = [...this.state.entries, entry];
    const recent = entries
      .filter(
        (x) =>
          x.contextId === entry.contextId &&
          !x.pinned &&
          !x.blob &&
          !x.guestPath,
      )
      .slice(-100);
    const ids = new Set(recent.map((x) => x.id));
    this.update({
      entries: entries.filter(
        (x) =>
          x.contextId !== entry.contextId ||
          x.pinned ||
          x.blob ||
          x.guestPath ||
          ids.has(x.id),
      ),
    });
    this.record(
      "Ajout au tiroir",
      entry.source.windowId,
      entry.name ?? entry.text.slice(0, 100),
    );
    return entry;
  }
  async addFiles(
    contextId: string,
    files: readonly File[],
    source: ContextEntry["source"],
  ) {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024)
        throw new Error(file.name + " dépasse la limite de 25 Mo par fichier.");
      this.add({
        contextId,
        kind: file.type.startsWith("image/") ? "image" : "file",
        text: file.name,
        name: file.name,
        mime: file.type,
        blob: file,
        source,
      });
    }
    await this.flush();
  }
  remove(id: string) {
    this.update({ entries: this.state.entries.filter((x) => x.id !== id) });
  }
  pin(id: string) {
    this.update({
      entries: this.state.entries.map((x) =>
        x.id === id ? { ...x, pinned: !x.pinned } : x,
      ),
    });
  }
  clear(contextId: string) {
    this.update({
      entries: this.state.entries.filter(
        (x) => x.contextId !== contextId || x.pinned,
      ),
    });
  }
  record(title: string, windowId?: string, detail?: string) {
    if (this.state.privateMode) return;
    this.update({
      events: [
        ...this.state.events,
        { id: crypto.randomUUID(), time: Date.now(), title, windowId, detail },
      ].slice(-200),
    });
  }
  clearEvents() {
    this.update({ events: [] });
  }
  setPrivate(value: boolean) {
    this.update({ privateMode: value }, false);
  }
  saveSpace(
    name: string,
    windows: readonly WindowInstance[],
    layout: SavedSpace["layout"],
  ) {
    const safe = windows.map((w) => ({
      ...w,
      props: w.props
        ? Object.fromEntries(
            Object.entries(w.props).filter(([key]) =>
              [
                "path",
                "initialPath",
                "dynamicAppId",
                "directory",
                "documentPath",
              ].includes(key),
            ),
          )
        : undefined,
    }));
    const space: SavedSpace = {
      id: crypto.randomUUID(),
      name: name.trim() || "Mon espace",
      savedAt: Date.now(),
      windows: safe,
      layout,
    };
    this.update({ spaces: [space, ...this.state.spaces].slice(0, 12) });
    this.record("Espace enregistré", undefined, space.name);
    return space;
  }
  removeSpace(id: string) {
    this.update({ spaces: this.state.spaces.filter((x) => x.id !== id) });
  }
  exportContext(contextId?: string) {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        entries: this.state.entries
          .filter((x) => !contextId || x.contextId === contextId)
          .map(({ blob, ...x }) => ({ ...x, fileIncluded: false })),
        events: contextId ? [] : this.state.events,
      },
      null,
      2,
    );
  }
}
export const contextStore = new ContextStore();
export const useContexts = () =>
  useSyncExternalStore(contextStore.subscribe, contextStore.getSnapshot);
