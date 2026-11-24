import { Effect } from "effect";
import {
  Activity,
  Copy,
  Eraser,
  ExternalLink,
  Globe,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  networkStore,
  useNetworkTraffic,
  type NetworkLogEntry,
} from "../../core/network-store.ts";
import { appRuntime, useSubscriptionRef, VmService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

type FilterBucket = "all" | "2xx" | "3xx" | "err" | "json";

const METHOD_STYLE: Record<string, string> = {
  GET: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30",
  POST: "text-amber-300 bg-amber-500/15 border-amber-400/30",
  PUT: "text-sky-300 bg-sky-500/15 border-sky-400/30",
  PATCH: "text-violet-300 bg-violet-500/15 border-violet-400/30",
  DELETE: "text-rose-300 bg-rose-500/15 border-rose-400/30",
};

function statusBadge(status: number, pending?: boolean): string {
  if (pending) return "text-cyan-300 bg-cyan-500/15 border-cyan-400/30";
  if (status >= 200 && status < 300) return "text-emerald-300 bg-emerald-500/15 border-emerald-400/30";
  if (status >= 300 && status < 400) return "text-sky-300 bg-sky-500/15 border-sky-400/30";
  if (status >= 400 && status < 500) return "text-amber-300 bg-amber-500/15 border-amber-400/30";
  return "text-rose-300 bg-rose-500/15 border-rose-400/30";
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const NetworkInspectorApp: React.FC = () => {
  const net = useNetworkTraffic();
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    {
      phase: "idle" as const,
      bootStage: "",
      bootProgress: 0,
      error: null,
      support: null,
      crossOriginIsolated: false,
      webgpuAvailable: false,
      distro: "debian",
      cpus: 1,
      memoryMiB: 2048,
      transport: "inline",
      stats: null,
      glStatus: null,
      displayMode: null,
      inputState: { keyboard: false, mouse: false, tablet: false },
      detectedPorts: [],
      kernelLogs: [],
      hasSnapshot: false,
      audioMuted: false,
      wispActiveUrl: "",
    }
  );

  const [viewMode, setViewMode] = useState<"traffic" | "sockets">("traffic");
  const [filter, setFilter] = useState<FilterBucket>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"headers" | "response" | "request">("response");
  const [probeUrl, setProbeUrl] = useState("http://127.0.0.1:3000/");
  const [probing, setProbing] = useState(false);
  const [socketsText, setSocketsText] = useState("");
  const [loadingSockets, setLoadingSockets] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return net.entries.filter((e) => {
      if (filter === "2xx" && !(e.status >= 200 && e.status < 300)) return false;
      if (filter === "3xx" && !(e.status >= 300 && e.status < 400)) return false;
      if (filter === "err" && !(e.status >= 400 || e.status === 0 || Boolean(e.error))) return false;
      if (filter === "json" && !e.contentType.toLowerCase().includes("json")) return false;
      if (!q) return true;
      return (
        e.url.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        String(e.status).includes(q) ||
        e.contentType.toLowerCase().includes(q)
      );
    });
  }, [net.entries, filter, query]);

  const selected: NetworkLogEntry | null =
    filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  const maxDuration = useMemo(
    () => Math.max(50, ...filtered.map((e) => e.durationMs)),
    [filtered]
  );

  const runProbe = async (targetUrl: string, method = "GET", headers?: readonly [string, string][], body?: string) => {
    const clean = targetUrl.trim();
    if (!clean) return;
    setProbing(true);
    const t0 = performance.now();
    let parsedPort: number | undefined;
    let parsedPath = clean;
    try {
      const u = new URL(clean);
      parsedPath = `${u.pathname}${u.search}`;
      if (u.port) parsedPort = Number(u.port);
    } catch {
      // ignore
    }
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i.test(clean);
    const hdrPairs: [string, string][] = headers ? [...headers] : [];
    const netId = networkStore.startRequest({
      source: "probe",
      method,
      url: clean,
      port: parsedPort,
      path: parsedPath,
      reqHeaders: hdrPairs,
      reqBody: body ?? "",
    });
    if (netId) setSelectedId(netId);

    try {
      const hdrObj: Record<string, string> = {};
      for (const [k, v] of hdrPairs) {
        if (k.toLowerCase() !== "host" && k.toLowerCase() !== "content-length") {
          hdrObj[k] = v;
        }
      }
      const init: RequestInit = {
        method,
        headers: hdrObj,
        body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      };
      let res: Response;
      if (isLocal) {
        const handle = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
        if (!handle) throw new Error("Linux VM is not running");
        res = await handle.fetch(clean.replace(/localhost|0\.0\.0\.0/i, "127.0.0.1"), init);
      } else {
        res = await fetch(clean, init);
      }
      const txt = await res.text();
      const resHeaders: [string, string][] = [];
      res.headers.forEach((v, k) => resHeaders.push([k, v]));
      networkStore.finishRequest(netId, {
        status: res.status,
        statusText: res.statusText,
        durationMs: performance.now() - t0,
        resHeaders,
        resBody: txt,
        resSize: new TextEncoder().encode(txt).byteLength,
        contentType: res.headers.get("content-type") || "",
      });
    } catch (err) {
      networkStore.finishRequest(netId, {
        status: 0,
        statusText: "Failed",
        durationMs: performance.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProbing(false);
    }
  };

  const refreshSockets = async () => {
    setLoadingSockets(true);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (v) =>
          v.execShell(
            `(command -v ss >/dev/null 2>&1 && ss -tulnp 2>/dev/null) || (command -v netstat >/dev/null 2>&1 && netstat -tulnp 2>/dev/null) || cat /proc/net/tcp`
          )
        )
      )
    );
    setLoadingSockets(false);
    if (res._tag === "Right") {
      setSocketsText(res.right.stdout || "(no listening sockets)");
    } else {
      setSocketsText(String(res.left));
    }
  };

  useEffect(() => {
    if (viewMode === "sockets") void refreshSockets();
  }, [viewMode]);

  useEffect(() => {
    if (vm.detectedPorts.length > 0 && probeUrl === "http://127.0.0.1:3000/") {
      setProbeUrl(`http://127.0.0.1:${vm.detectedPorts[0]!.port}/`);
    }
  }, [vm.detectedPorts, probeUrl]);

  const prettyResBody = useMemo(() => {
    if (!selected?.resBody) return "";
    try {
      return JSON.stringify(JSON.parse(selected.resBody), null, 2);
    } catch {
      return selected.resBody;
    }
  }, [selected]);

  const copyCurl = (entry: NetworkLogEntry) => {
    navigator.clipboard.writeText(networkStore.toCurl(entry)).catch(() => {});
    wmStore.pushToast("Copied cURL", `${entry.method} ${entry.path}`, "info");
  };

  const openInApiClient = (entry: NetworkLogEntry) => {
    wmStore.openRequestInApiClient({
      method: entry.method,
      url: entry.url,
      target: entry.port ? "vm" : "browser",
      headers: entry.reqHeaders,
      body: entry.reqBody,
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#080a11]/96 overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => networkStore.setRecording(!net.recording)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition ${
              net.recording
                ? "bg-rose-500/20 border-rose-400/40 text-rose-200"
                : "bg-white/8 border-white/15 text-zinc-300"
            }`}
            title={net.recording ? "Pause HTTP Capture" : "Resume HTTP Capture"}
          >
            {net.recording ? (
              <>
                <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                Recording
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                Paused
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => networkStore.clear()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-300 transition"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear
          </button>

          <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("traffic")}
              className={`px-2.5 py-1 rounded-lg transition ${
                viewMode === "traffic" ? "bg-cyan-500/25 text-cyan-200" : "text-zinc-400 hover:text-white"
              }`}
            >
              HTTP Traffic ({net.entries.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("sockets")}
              className={`px-2.5 py-1 rounded-lg transition ${
                viewMode === "sockets" ? "bg-cyan-500/25 text-cyan-200" : "text-zinc-400 hover:text-white"
              }`}
            >
              Listening Ports ({vm.detectedPorts.length})
            </button>
          </div>
        </div>

        {/* Quick Live Probe */}
        <div className="flex items-center gap-1.5 flex-1 max-w-md">
          <input
            value={probeUrl}
            onChange={(e) => setProbeUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runProbe(probeUrl)}
            placeholder="Quick probe: http://127.0.0.1:3000/api/health"
            className="flex-1 px-2.5 py-1 rounded-xl bg-black/55 border border-white/12 focus:border-cyan-400/50 text-xs font-mono text-zinc-100 outline-none"
          />
          <button
            type="button"
            disabled={probing}
            onClick={() => void runProbe(probeUrl)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/35 text-cyan-100 disabled:opacity-50 transition"
          >
            <Play className="w-3 h-3" />
            Probe
          </button>
        </div>
      </div>

      {viewMode === "sockets" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Active Guest Listening Ports (vsock forwarded)
            </div>
            <button
              type="button"
              onClick={() => void refreshSockets()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSockets ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {vm.detectedPorts.length === 0 ? (
              <div className="col-span-full p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-zinc-500">
                No listening guest servers detected yet. Start a server (Bun, Python, Rust, Vite) and it appears here automatically.
              </div>
            ) : (
              vm.detectedPorts.map((p) => (
                <div
                  key={p.port}
                  className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-mono font-bold text-emerald-300">
                      127.0.0.1:{p.port}
                    </div>
                    <div className="text-[10px] text-zinc-400">vsock live bridge</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode("traffic");
                        void runProbe(`http://127.0.0.1:${p.port}/`);
                      }}
                      className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-[11px] text-cyan-200"
                    >
                      Probe
                    </button>
                    <button
                      type="button"
                      onClick={() => wmStore.openPreview(p.port, "/")}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/18 text-[11px] text-white flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" />
                      Preview
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-2xl bg-black/55 border border-white/10 overflow-hidden">
            <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/8 text-[10px] font-mono text-zinc-400">
              LINUX KERNEL SOCKETS (ss -tulnp)
            </div>
            <pre className="p-3 text-xs font-mono text-zinc-300 whitespace-pre-wrap overflow-x-auto select-text">
              {socketsText || "Click Refresh to inspect Linux sockets."}
            </pre>
          </div>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-black/25 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 w-60">
              <Search className="w-3.5 h-3.5 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter path, status, method..."
                className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              {(
                [
                  ["all", "All"],
                  ["2xx", "2xx OK"],
                  ["3xx", "3xx"],
                  ["err", "4xx/5xx"],
                  ["json", "JSON"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-2 py-0.5 rounded-lg border transition ${
                    filter === id
                      ? "bg-white/15 border-white/30 text-white"
                      : "bg-white/[0.03] border-white/8 text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto text-[10px] font-mono text-zinc-500">
              Auto-captures Web Preview (vsock) + API Client + Probes
            </div>
          </div>

          {/* Main Split: Request Table + Inspector */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Requests Waterfall List */}
            <div className="flex-1 min-w-0 overflow-auto border-b lg:border-b-0 lg:border-r border-white/10">
              {filtered.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-2 text-zinc-500">
                  <Activity className="w-8 h-8 text-cyan-400/50" />
                  <div className="text-xs text-zinc-300 font-medium">No captured HTTP requests yet</div>
                  <p className="text-[11px] max-w-sm">
                    Open a guest server in <strong>Web Preview</strong>, send a request from <strong>API Client</strong>, or hit <strong>Probe</strong> above to inspect live traffic &amp; waterfall latency.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#0d101b] border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-2.5 py-2">Status</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Path / Target</th>
                      <th className="px-2 py-2 hidden sm:table-cell">Size</th>
                      <th className="px-2.5 py-2 w-32">Waterfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => {
                      const active = selected?.id === entry.id;
                      const pct = Math.max(4, Math.min(100, (entry.durationMs / maxDuration) * 100));
                      return (
                        <tr
                          key={entry.id}
                          onClick={() => setSelectedId(entry.id)}
                          className={`border-b border-white/6 cursor-pointer transition ${
                            active ? "bg-cyan-500/16" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <td className="px-2.5 py-1.5 font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] ${statusBadge(
                                entry.status,
                                entry.pending
                              )}`}
                            >
                              {entry.pending ? "…" : entry.status || "ERR"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] ${
                                METHOD_STYLE[entry.method] ?? "text-zinc-300 bg-white/10 border-white/15"
                              }`}
                            >
                              {entry.method}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 max-w-[240px]">
                            <div className="font-mono text-zinc-100 truncate">{entry.path}</div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {entry.port ? `:${entry.port}` : entry.source} · {entry.contentType.split(";")[0] || "—"}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-400 hidden sm:table-cell">
                            {fmtSize(entry.resSize)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className={`h-full rounded-full ${
                                    entry.status >= 400 || entry.error
                                      ? "bg-rose-400"
                                      : entry.durationMs > 250
                                      ? "bg-amber-400"
                                      : "bg-gradient-to-r from-cyan-400 to-violet-400"
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-zinc-400 w-11 text-right">
                                {entry.durationMs}ms
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Right Inspector Drawer */}
            <div className="w-full lg:w-[44%] h-64 lg:h-auto shrink-0 flex flex-col bg-[#06080f] min-h-0">
              {selected ? (
                <>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-1">
                      {(["response", "headers", "request"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDetailTab(t)}
                          className={`px-2.5 py-1 rounded-lg capitalize text-[11px] font-medium transition ${
                            detailTab === t
                              ? "bg-white/14 text-white"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void runProbe(
                            selected.url,
                            selected.method,
                            selected.reqHeaders,
                            selected.reqBody
                          )
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/18 hover:bg-emerald-500/28 text-[11px] text-emerald-200"
                        title="Replay Request"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Replay
                      </button>
                      <button
                        type="button"
                        onClick={() => copyCurl(selected)}
                        className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-zinc-300"
                        title="Copy as cURL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openInApiClient(selected)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/32 text-[11px] text-violet-200"
                        title="Edit & Send in API Client"
                      >
                        <Send className="w-3 h-3" />
                        API Client
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono select-text space-y-3">
                    {selected.error && (
                      <div className="p-2.5 rounded-xl bg-rose-500/12 border border-rose-400/30 text-rose-300">
                        {selected.error}
                      </div>
                    )}

                    {detailTab === "response" && (
                      <pre className="text-emerald-200/90 whitespace-pre-wrap break-words leading-relaxed">
                        {prettyResBody || "(empty response body)"}
                      </pre>
                    )}

                    {detailTab === "headers" && (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                            General
                          </div>
                          <div className="text-zinc-200 break-all">
                            {selected.method} {selected.url}
                          </div>
                          <div className="text-zinc-400">
                            Status: {selected.status} {selected.statusText} · {selected.durationMs}ms · {fmtSize(selected.resSize)}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-cyan-400">
                            Response Headers ({selected.resHeaders.length})
                          </div>
                          {selected.resHeaders.map(([k, v], i) => (
                            <div key={i} className="grid grid-cols-3 gap-2 py-0.5 border-b border-white/6">
                              <span className="text-cyan-300 truncate">{k}</span>
                              <span className="col-span-2 text-zinc-300 break-all">{v}</span>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-violet-400">
                            Request Headers ({selected.reqHeaders.length})
                          </div>
                          {selected.reqHeaders.map(([k, v], i) => (
                            <div key={i} className="grid grid-cols-3 gap-2 py-0.5 border-b border-white/6">
                              <span className="text-violet-300 truncate">{k}</span>
                              <span className="col-span-2 text-zinc-300 break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detailTab === "request" && (
                      <pre className="text-amber-200/90 whitespace-pre-wrap break-words leading-relaxed">
                        {selected.reqBody || "(no request payload)"}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                  Select a request to inspect headers, payload &amp; JSON response.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
