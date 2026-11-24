import { useSyncExternalStore } from "react";

export type NetworkEntrySource = "preview-sw" | "api-client" | "probe";

export interface NetworkLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly source: NetworkEntrySource;
  readonly method: string;
  readonly url: string;
  readonly port?: number;
  readonly path: string;
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
  readonly reqSize: number;
  readonly resSize: number;
  readonly reqHeaders: readonly [string, string][];
  readonly resHeaders: readonly [string, string][];
  readonly reqBody: string;
  readonly resBody: string;
  readonly contentType: string;
  readonly error?: string;
  readonly pending?: boolean;
}

interface NetworkState {
  readonly entries: readonly NetworkLogEntry[];
  readonly recording: boolean;
}

const MAX_ENTRIES = 300;
const MAX_BODY_CAPTURE = 32_768;

class NetworkTrafficStore {
  private state: NetworkState = {
    entries: [],
    recording: true,
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): NetworkState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  public setRecording(recording: boolean): void {
    this.state = { ...this.state, recording };
    this.emit();
  }

  public clear(): void {
    this.state = { ...this.state, entries: [] };
    this.emit();
  }

  public startRequest(init: {
    source: NetworkEntrySource;
    method: string;
    url: string;
    port?: number;
    path: string;
    reqHeaders: readonly [string, string][];
    reqBody?: string;
    reqSize?: number;
  }): string | null {
    if (!this.state.recording) return null;
    const id = `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const body = (init.reqBody ?? "").slice(0, MAX_BODY_CAPTURE);
    const entry: NetworkLogEntry = {
      id,
      timestamp: Date.now(),
      source: init.source,
      method: init.method.toUpperCase(),
      url: init.url,
      port: init.port,
      path: init.path,
      status: 0,
      statusText: "Pending",
      durationMs: 0,
      reqSize: init.reqSize ?? new TextEncoder().encode(body).byteLength,
      resSize: 0,
      reqHeaders: init.reqHeaders,
      resHeaders: [],
      reqBody: body,
      resBody: "",
      contentType: "",
      pending: true,
    };
    this.state = {
      ...this.state,
      entries: [entry, ...this.state.entries].slice(0, MAX_ENTRIES),
    };
    this.emit();
    return id;
  }

  public finishRequest(
    id: string | null,
    update: {
      status: number;
      statusText?: string;
      durationMs: number;
      resHeaders?: readonly [string, string][];
      resBody?: string;
      resSize?: number;
      contentType?: string;
      error?: string;
    }
  ): void {
    if (!id) return;
    const idx = this.state.entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const prev = this.state.entries[idx]!;
    const clippedBody = (update.resBody ?? prev.resBody).slice(0, MAX_BODY_CAPTURE);
    const resHeaders = update.resHeaders ?? prev.resHeaders;
    const ct =
      update.contentType ??
      resHeaders.find(([k]) => k.toLowerCase() === "content-type")?.[1] ??
      "";
    const updated: NetworkLogEntry = {
      ...prev,
      status: update.status,
      statusText: update.statusText ?? prev.statusText,
      durationMs: Math.max(0, Math.round(update.durationMs)),
      resHeaders,
      resBody: clippedBody,
      resSize: update.resSize ?? new TextEncoder().encode(clippedBody).byteLength,
      contentType: ct,
      error: update.error,
      pending: false,
    };
    const next = [...this.state.entries];
    next[idx] = updated;
    this.state = { ...this.state, entries: next };
    this.emit();
  }

  public recordComplete(entry: Omit<NetworkLogEntry, "id" | "timestamp" | "pending">): void {
    if (!this.state.recording) return;
    const full: NetworkLogEntry = {
      ...entry,
      id: `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      reqBody: entry.reqBody.slice(0, MAX_BODY_CAPTURE),
      resBody: entry.resBody.slice(0, MAX_BODY_CAPTURE),
      pending: false,
    };
    this.state = {
      ...this.state,
      entries: [full, ...this.state.entries].slice(0, MAX_ENTRIES),
    };
    this.emit();
  }

  public toCurl(entry: NetworkLogEntry): string {
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const parts = [`curl -X ${entry.method}`];
    for (const [k, v] of entry.reqHeaders) {
      if (k.toLowerCase() === "content-length" || k.toLowerCase() === "host") continue;
      parts.push(`-H ${sq(`${k}: ${v}`)}`);
    }
    if (entry.reqBody && entry.method !== "GET" && entry.method !== "HEAD") {
      parts.push(`--data-raw ${sq(entry.reqBody)}`);
    }
    parts.push(sq(entry.url));
    return parts.join(" \\\n  ");
  }
}

export const networkStore = new NetworkTrafficStore();

export function useNetworkTraffic(): NetworkState {
  return useSyncExternalStore(networkStore.subscribe, networkStore.getSnapshot);
}
