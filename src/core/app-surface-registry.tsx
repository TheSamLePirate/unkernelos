import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { wmStore, type WindowInstance } from "../wm/wm-store.ts";
import { contextStore } from "./context-store.ts";
export const WindowSessionContext = createContext<WindowInstance | null>(null);
/** Declarative, live dock presentation. Action names must exist in the same adapter. */
export interface SurfaceDock {
  label: string;
  value?: string;
  detail?: string;
  glyph?: "play" | "pause" | "sun" | "cloud" | "rain" | "snow" | "activity";
  primaryAction?: string;
  progress?: number;
}
export interface SurfaceAdapter {
  dock?: SurfaceDock;
  document?: string;
  title?: string;
  state: Record<string, unknown>;
  revision: string;
  actions?: Record<
    string,
    {
      label: string;
      paramsSchema?: Record<string, unknown>;
      run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
    }
  >;
  status?: "live" | "paused" | "disconnected" | "loading" | "opaque";
  updatedAt?: number;
}
export interface SurfaceGrant {
  id: string;
  windowId: string;
  contextId: string;
  itemIds: string[];
  actions: string[];
  expiresAt: number;
  readState: boolean;
}
class SurfaceRegistry {
  private adapters = new Map<string, SurfaceAdapter>();
  private uiAdapters = new Map<string, SurfaceAdapter>();
  private sharing = new Map<string, boolean>();
  private sharingEpoch = new Map<string, number>();
  private grants = new Map<string, SurfaceGrant>();
  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.version;
  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  register(id: string, adapter: SurfaceAdapter) {
    this.adapters.set(id, adapter);
    this.emit();
    return () => {
      if (this.adapters.get(id) === adapter) {
        this.adapters.delete(id);
        this.emit();
      }
    };
  }
  registerUi(id: string, adapter: SurfaceAdapter) {
    this.uiAdapters.set(id, adapter);
    this.emit();
    return () => {
      if (this.uiAdapters.get(id) === adapter) {
        this.uiAdapters.delete(id);
        this.emit();
      }
    };
  }
  isShared(id: string) {
    return (
      this.sharing.get(id) !== false && !contextStore.getSnapshot().privateMode
    );
  }
  setSharing(id: string, shared: boolean) {
    this.sharing.set(id, shared);
    this.sharingEpoch.set(id, (this.sharingEpoch.get(id) ?? 0) + 1);
    this.emit();
  }
  peek(id: string): SurfaceAdapter | undefined {
    const a = this.adapters.get(id),
      ui = this.uiAdapters.get(id);
    if (!ui) return a;
    if (!a) return ui;
    return {
      ...a,
      state: { ...a.state, ui: ui.state },
      actions: { ...ui.actions, ...a.actions },
    };
  }
  list() {
    return wmStore.getSnapshot().windows.map((w) => {
      const a = this.peek(w.id);
      return {
        windowId: w.id,
        sessionId: w.sessionId,
        contextId: w.contextId,
        title: a?.title ?? w.title,
        document: a?.document,
        revision: a?.revision ?? null,
        shared: this.isShared(w.id),
        dock: a?.dock,
        status: a?.status ?? "opaque",
        actions: Object.entries(a?.actions ?? {}).map(([name, x]) => ({
          name,
          label: x.label,
          paramsSchema: x.paramsSchema ?? { type: "object", properties: {} },
        })),
      };
    });
  }
  grant(input: Omit<SurfaceGrant, "id" | "expiresAt">) {
    const win = wmStore
      .getSnapshot()
      .windows.find((w) => w.id === input.windowId);
    if (!win || win.contextId !== input.contextId)
      throw new Error("La session a changé.");
    const g = {
      ...input,
      id: crypto.randomUUID(),
      expiresAt: Date.now() + 15 * 60_000,
    };
    this.grants.set(g.id, g);
    contextStore.record(
      "Accès agent accordé",
      win.id,
      input.actions.join(", ") || "Lecture choisie",
    );
    this.emit();
    return g;
  }
  revoke(id: string) {
    this.grants.delete(id);
    this.emit();
  }
  activeGrants() {
    return [...this.grants.values()].filter((g) => g.expiresAt > Date.now());
  }
  private requireGrant(windowId: string, id?: string): SurfaceGrant {
    const w = wmStore.getSnapshot().windows.find((w) => w.id === windowId);
    if (!id) {
      const a = this.peek(windowId);
      if (!w || !a || !this.isShared(windowId))
        throw new Error(
          "Cette session est privée ou ne publie pas de capacités.",
        );
      return {
        id:
          "shared:" +
          windowId +
          ":" +
          w.contextId +
          ":" +
          (this.sharingEpoch.get(windowId) ?? 0),
        windowId,
        contextId: w.contextId ?? w.id,
        itemIds: contextStore
          .getSnapshot()
          .entries.filter((e) => e.contextId === w.contextId)
          .map((e) => e.id),
        actions: Object.keys(a.actions ?? {}),
        readState: true,
        expiresAt: Number.MAX_SAFE_INTEGER,
      };
    }
    const g = this.grants.get(id);
    if (
      !g ||
      g.expiresAt < Date.now() ||
      g.windowId !== windowId ||
      g.contextId !== w?.contextId
    )
      throw new Error("Accès absent, expiré ou révoqué.");
    return g;
  }
  read(windowId: string, grantId?: string) {
    const g = this.requireGrant(windowId, grantId),
      a = this.peek(windowId);
    return {
      windowId,
      revision: a?.revision ?? null,
      state: g.readState ? a?.state : undefined,
      items: contextStore
        .getSnapshot()
        .entries.filter(
          (e) => e.contextId === g.contextId && g.itemIds.includes(e.id),
        )
        .map(({ blob, ...e }) => ({ ...e, hasFile: !!blob })),
    };
  }
  private pending = new Map<string, Promise<unknown>>();
  async act(input: {
    windowId: string;
    grantId?: string;
    action: string;
    expectedRevision: string;
    requestId: string;
    args: Record<string, unknown>;
  }) {
    const g = this.requireGrant(input.windowId, input.grantId);
    if (!g.actions.includes(input.action))
      throw new Error("Action hors du périmètre accordé.");
    const key = g.id + ":" + input.requestId;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const a = this.peek(input.windowId);
    if (!a || a.revision !== input.expectedRevision)
      throw new Error("REVISION_CONFLICT : relisez la session avant d’agir.");
    const action = a.actions?.[input.action];
    if (!action) throw new Error("Action indisponible.");
    const promise = Promise.resolve()
      .then(() => {
        this.requireGrant(input.windowId, input.grantId);
        if (this.peek(input.windowId)?.revision !== input.expectedRevision)
          throw new Error("REVISION_CONFLICT");
        return action.run(input.args);
      })
      .then((result) => {
        contextStore.record(
          "Action agent terminée",
          input.windowId,
          action.label,
        );
        return {
          status: "completed",
          result,
          revision: this.peek(input.windowId)?.revision,
        };
      })
      .catch((error) => {
        contextStore.record(
          "Action agent refusée ou échouée",
          input.windowId,
          String(error),
        );
        throw error;
      });
    this.pending.set(key, promise);
    if (this.pending.size > 200)
      this.pending.delete(this.pending.keys().next().value!);
    return promise;
  }
}
export const surfaceRegistry = new SurfaceRegistry();
export const useSurfaces = () =>
  useSyncExternalStore(surfaceRegistry.subscribe, surfaceRegistry.getSnapshot);
export function useAppSurface(adapter: SurfaceAdapter, enabled = true) {
  const win = useContext(WindowSessionContext);
  const contextsReady = useSyncExternalStore(
    contextStore.subscribe,
    () => contextStore.getSnapshot().ready,
  );
  const latest = useRef(adapter);
  latest.current = adapter;
  useEffect(() => {
    if (!win || !enabled) return;
    const stable: SurfaceAdapter = {
      ...adapter,
      get dock() {
        return latest.current.dock;
      },
      get state() {
        return latest.current.state;
      },
      actions: adapter.actions
        ? Object.fromEntries(
            Object.entries(adapter.actions).map(([name, a]) => [
              name,
              {
                label: a.label,
                paramsSchema: a.paramsSchema,
                run: (args: Record<string, unknown>) =>
                  latest.current.actions?.[name]?.run(args),
              },
            ]),
          )
        : undefined,
    };
    return surfaceRegistry.register(win.id, stable);
  }, [win?.id, adapter.revision, adapter.document, adapter.status, enabled]);
  useEffect(() => {
    if (!win || !enabled || !adapter.document) return;
    const ownKey = `${win.appId}:${adapter.document}:${win.sessionId ?? win.id}`;
    const attached = new Set(
      wmStore
        .getSnapshot()
        .windows.filter((w) => w.id !== win.id)
        .map((w) => w.contextId),
    );
    const matching = contextStore
      .getSnapshot()
      .entries.filter(
        (e) =>
          e.source.appId === win.appId &&
          e.source.document === adapter.document &&
          !attached.has(e.contextId),
      );
    const key =
      matching.find((e) => e.contextId === win.contextId)?.contextId ??
      matching.sort((a, b) => b.createdAt - a.createdAt)[0]?.contextId ??
      ownKey;
    if (win.contextId !== key)
      wmStore.bindWindowContext(win.id, key, adapter.title);
  }, [
    win?.id,
    win?.sessionId,
    win?.contextId,
    adapter.document,
    adapter.title,
    contextsReady,
    enabled,
  ]);
}

export function useSurfaceRevision(...values: unknown[]): string {
  const ref = useRef<{ values: unknown[]; revision: number }>({
    values: [],
    revision: 0,
  });
  if (
    values.some((v, i) => v !== ref.current.values[i]) ||
    values.length !== ref.current.values.length
  )
    ref.current = { values, revision: ref.current.revision + 1 };
  return String(ref.current.revision);
}
