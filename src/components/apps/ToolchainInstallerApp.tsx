import { Effect } from "effect";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useEffect } from "react";
import {
  appRuntime,
  ToolchainService,
  useSubscriptionRef,
} from "../../core/runtime.ts";
import {
  CORE_DEV_STACK,
  TOOLCHAIN_SPECS,
  type ToolId,
  type ToolchainSnapshot,
} from "../../core/toolchain-service.ts";

const EMPTY_SNAPSHOT: ToolchainSnapshot = {
  tools: Object.fromEntries(
    TOOLCHAIN_SPECS.map((t) => [t.id, { id: t.id, status: "unknown", version: null, error: null }])
  ) as ToolchainSnapshot["tools"],
  logs: [],
  busy: false,
};

const CATEGORY_LABEL: Record<string, string> = {
  vcs: "Version Control & GitHub",
  runtime: "Languages & Runtimes (Python, Node, Bun, Rust, OCaml)",
  science: "Data Science & SQL (NumPy, Matplotlib, SQLite)",
  agent: "AI Coding Agents",
  graphics: "Graphics (Debian Only)",
};

export const ToolchainInstallerApp: React.FC = () => {
  const snap = useSubscriptionRef(
    Effect.map(ToolchainService, (t) => t.stateRef),
    EMPTY_SNAPSHOT
  );

  useEffect(() => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.refreshAll()));
  }, []);

  const installOne = (id: ToolId) => {
    appRuntime.runFork(
      Effect.flatMap(ToolchainService, (t) => t.installTool(id)).pipe(Effect.ignore)
    );
  };

  const installCoreStack = () => {
    appRuntime.runFork(
      Effect.flatMap(ToolchainService, (t) => t.installStack(CORE_DEV_STACK)).pipe(Effect.ignore)
    );
  };

  const installScienceRustOcaml = () => {
    appRuntime.runFork(
      Effect.flatMap(ToolchainService, (t) =>
        t.installStack(["rust", "ocaml", "py-science", "sqlite"])
      ).pipe(Effect.ignore)
    );
  };

  const refresh = () => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.refreshAll()));
  };

  const categories = ["vcs", "runtime", "science", "agent", "graphics"] as const;

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0c13]/94">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-cyan-500/10 border-b border-white/10 shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Package className="w-4 h-4 text-violet-400" />
            Dev &amp; AI Toolchain Installer
          </div>
          <p className="text-xs text-zinc-400">
            Installs native aarch64 binaries persistently into your Linux ext4 disk (<code className="text-zinc-300">/data</code>).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Scan
          </button>
          <button
            type="button"
            disabled={snap.busy}
            onClick={installScienceRustOcaml}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:brightness-110 disabled:opacity-45 shadow-lg shadow-orange-600/20 transition"
          >
            {snap.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Rust + OCaml + Science
          </button>
          <button
            type="button"
            disabled={snap.busy}
            onClick={installCoreStack}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 disabled:opacity-45 shadow-lg shadow-violet-600/20 transition"
          >
            {snap.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Install Full Stack
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {categories.map((cat) => {
            const items = TOOLCHAIN_SPECS.filter((t) => t.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {CATEGORY_LABEL[cat]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {items.map((spec) => {
                    const st = snap.tools[spec.id];
                    return (
                      <div
                        key={spec.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/18 transition"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-100">{spec.name}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{spec.approxSize}</span>
                            {spec.debianOnly && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">
                                Debian
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate">{spec.description}</p>
                          {st?.version && (
                            <p className="text-[10px] font-mono text-emerald-300 truncate">{st.version}</p>
                          )}
                          {st?.error && (
                            <p className="text-[10px] font-mono text-rose-400 truncate">{st.error}</p>
                          )}
                        </div>

                        <div className="shrink-0">
                          {st?.status === "installed" ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Ready
                            </span>
                          ) : st?.status === "installing" ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/20 border border-violet-400/35 text-violet-200">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Installing
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={snap.busy}
                              onClick={() => installOne(spec.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition disabled:opacity-40 ${
                                st?.status === "error"
                                  ? "bg-rose-500/15 border-rose-400/35 text-rose-200 hover:bg-rose-500/25"
                                  : "bg-white/8 hover:bg-white/15 border-white/12 text-zinc-200"
                              }`}
                            >
                              {st?.status === "error" ? (
                                <AlertCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              {st?.status === "error" ? "Retry" : "Install"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Installer Output Console */}
        <div className="h-44 shrink-0 flex flex-col bg-black/65 border-t border-white/10">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8 text-[11px] text-zinc-400">
            <span className="font-mono">Installer Console Output</span>
            <button
              type="button"
              onClick={() => appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.clearLogs()))}
              className="flex items-center gap-1 text-zinc-500 hover:text-zinc-200"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
          <pre className="flex-1 overflow-y-auto p-3 text-[11px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
            {snap.logs.length > 0
              ? snap.logs.join("\n")
              : "Ready. Click 'Install Full Stack' to install git, gh, python3, pip, node, bun, claude & pi-coding-agent."}
          </pre>
        </div>
      </div>
    </div>
  );
};
