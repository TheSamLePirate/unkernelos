import {
  Activity,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  AGENT_DOCS_MARKDOWN,
  AGENT_OS_SCHEMA,
  agentApiStore,
  executeOsAction,
  syncAgentOsDocsToGuest,
  useAgentApi,
  type OsApiCategory,
} from "../../core/agent-os-api.ts";
import { wmStore } from "../../wm/wm-store.ts";

type ApiTab = "explorer" | "logs" | "docs";

const CATEGORIES: readonly { id: "all" | OsApiCategory; label: string }[] = [
  { id: "all", label: "All (43)" },
  { id: "wm", label: "Window Manager" },
  { id: "workspace", label: "Workspace" },
  { id: "system", label: "System & IO" },
  { id: "preview", label: "Web Preview" },
  { id: "theme", label: "Themes & GPU" },
  { id: "browser", label: "Host Browser" },
  { id: "github", label: "GitHub & Pages" },
  { id: "wayland", label: "Wayland & GL" },
  { id: "services", label: "Services" },
  { id: "config", label: "VM Config" },
];

export const AgentApiApp: React.FC = () => {
  const api = useAgentApi();
  const [tab, setTab] = useState<ApiTab>("explorer");
  const [category, setCategory] = useState<"all" | OsApiCategory>("all");
  const [selectedMethod, setSelectedMethod] = useState(AGENT_OS_SCHEMA[0]!.method);
  const [paramsJson, setParamsJson] = useState(() =>
    JSON.stringify(AGENT_OS_SCHEMA[0]!.example, null, 2)
  );
  const [outputJson, setOutputJson] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [syncingDocs, setSyncingDocs] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const visibleMethods = useMemo(
    () =>
      category === "all"
        ? AGENT_OS_SCHEMA
        : AGENT_OS_SCHEMA.filter((m) => m.category === category),
    [category]
  );

  const activeDef =
    AGENT_OS_SCHEMA.find((m) => m.method === selectedMethod) ?? AGENT_OS_SCHEMA[0]!;

  const selectMethod = (method: string) => {
    setSelectedMethod(method);
    const def = AGENT_OS_SCHEMA.find((m) => m.method === method);
    if (def) {
      setParamsJson(JSON.stringify(def.example, null, 2));
      setOutputJson("");
    }
  };

  const runLive = async () => {
    setRunning(true);
    try {
      const parsed = paramsJson.trim() ? (JSON.parse(paramsJson) as Record<string, unknown>) : {};
      const res = await executeOsAction(activeDef.method, parsed, { source: "ui" });
      setOutputJson(JSON.stringify(res, null, 2));
    } catch (err) {
      setOutputJson(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
    } finally {
      setRunning(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSyncDocs = async () => {
    setSyncingDocs(true);
    await syncAgentOsDocsToGuest();
    setSyncingDocs(false);
    wmStore.pushToast(
      "Agent Docs & MCP Synced",
      "Updated ~/CLAUDE.md, ~/AGENTS.md, ~/.unkernelos/AGENT_OS_API.md & ~/.claude.json MCP",
      "success"
    );
  };

  const cliExample = `osctl call ${activeDef.method} '${JSON.stringify(activeDef.example)}'`;

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        unkernelos: {
          command: "osctl",
          args: ["mcp"],
        },
      },
    },
    null,
    2
  );

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96">
      {/* Top Status & Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Workflow className="w-4 h-4 text-cyan-400" />
            Full Agent OS API
          </div>
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
              api.bridgeAttached
                ? "bg-emerald-500/15 border-emerald-400/35 text-emerald-300"
                : "bg-amber-500/15 border-amber-400/35 text-amber-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                api.bridgeAttached ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            {api.bridgeAttached
              ? `kwcmd LIVE (${api.registeredCommands.length} host cmds)`
              : "Bridge Standby"}
          </span>

          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            {(
              [
                ["explorer", "API Explorer", Cpu],
                ["logs", `Live Audit (${api.totalCalls})`, Activity],
                ["docs", "Agent Docs & MCP", BookOpen],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  tab === id ? "bg-violet-500/25 text-white border border-violet-400/35" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={syncingDocs}
            onClick={() => void handleSyncDocs()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 transition"
            title="Sync CLAUDE.md, AGENTS.md & MCP config into Linux"
          >
            <RefreshCw className={`w-3 h-3 ${syncingDocs ? "animate-spin" : ""}`} />
            Sync CLAUDE.md &amp; MCP
          </button>
          <button
            type="button"
            onClick={() => wmStore.openTerminalInDir(wmStore.getSnapshot().activeWorkspaceDir, "osctl help", "osctl")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 transition"
          >
            <Terminal className="w-3 h-3" />
            Try in Terminal
          </button>
        </div>
      </div>

      {/* Tab 1: Interactive API Explorer & Live Tester */}
      {tab === "explorer" && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Categories & Methods List */}
          <div className="w-full md:w-72 max-h-56 md:max-h-none shrink-0 bg-black/30 border-b md:border-b-0 md:border-r border-white/10 flex flex-col min-h-0">
            <div className="flex items-center gap-1 p-2 border-b border-white/8 overflow-x-auto no-scrollbar shrink-0">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap border transition ${
                    category === c.id
                      ? "bg-white/15 border-white/30 text-white"
                      : "bg-white/[0.03] border-white/8 text-zinc-400 hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {visibleMethods.map((m) => {
                const active = m.method === activeDef.method;
                return (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => selectMethod(m.method)}
                    className={`w-full text-left px-2.5 py-2 rounded-xl border transition ${
                      active
                        ? "bg-violet-500/20 border-violet-400/40 text-white"
                        : "bg-transparent border-transparent hover:bg-white/6 text-zinc-300"
                    }`}
                  >
                    <div className="text-xs font-mono font-semibold text-cyan-300">{m.method}</div>
                    <div className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                      {m.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Method Inspector & Live Runner */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-mono font-bold text-white">{activeDef.method}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/8 text-zinc-300">
                  {activeDef.category}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{activeDef.summary}</p>
            </div>

            {/* Equivalent Linux CLI Command */}
            <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono text-emerald-300 truncate">$ {cliExample}</code>
              <button
                type="button"
                onClick={() => copyText("cli", cliExample)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-[10px] text-zinc-200 shrink-0"
              >
                {copied === "cli" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy
              </button>
            </div>

            {/* JSON Params Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  JSON Parameters
                </label>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void runLive()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 disabled:opacity-50 shadow transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  {running ? "Executing..." : "Execute Live on OS"}
                </button>
              </div>
              <textarea
                value={paramsJson}
                onChange={(e) => setParamsJson(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full p-3 rounded-2xl bg-black/60 border border-white/12 focus:border-violet-400/50 text-xs font-mono text-zinc-100 outline-none resize-y select-text"
              />
            </div>

            {/* Result Output */}
            {outputJson && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Live Host Response
                </div>
                <pre className="p-3 rounded-2xl bg-black/70 border border-emerald-400/25 text-xs font-mono text-cyan-200 overflow-x-auto whitespace-pre-wrap select-text">
                  {outputJson}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Live Agent Action Audit Stream */}
      {tab === "logs" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-black/35 border-b border-white/8 text-xs shrink-0">
            <span className="text-zinc-400">
              Every call made by Claude Code, Pi Agent, shell scripts, MCP or UI appears here in real time.
            </span>
            <button
              type="button"
              onClick={() => agentApiStore.clearLogs()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/6 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-200 text-[11px]"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {api.logs.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500 space-y-2">
                <Activity className="w-7 h-7 mx-auto opacity-40" />
                <p>No OS API calls recorded yet. Run <code className="text-cyan-300">osctl info</code> in Terminal or execute a method in API Explorer.</p>
              </div>
            ) : (
              api.logs.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-2xl border bg-white/[0.025] space-y-1.5 ${
                    rec.ok ? "border-white/10" : "border-rose-400/35"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {rec.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono font-semibold text-white">{rec.method}</span>
                      <span className="px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-200 text-[10px] font-mono">
                        {rec.source}
                      </span>
                      {rec.callerPid && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          pid:{rec.callerPid} {rec.callerCwd}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {rec.durationMs}ms · {new Date(rec.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="p-2 rounded-xl bg-black/55 text-[10px] font-mono text-zinc-300 overflow-x-auto select-text">
                    {JSON.stringify(
                      { params: rec.params, ...(rec.ok ? { result: rec.result } : { error: rec.error }) },
                      null,
                      2
                    )}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Agent Docs, Native Commands & MCP Server */}
      {tab === "docs" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
              <div className="text-xs font-semibold text-cyan-300">Native Linux Host Commands (`kwcmd` vsock:1020)</div>
              <div className="flex flex-wrap gap-1.5">
                {(api.registeredCommands.length > 0
                  ? api.registeredCommands
                  : ["osctl", "pbcopy", "pbpaste", "os-open", "os-notify", "os-download"]
                ).map((c) => (
                  <span
                    key={c}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-xs font-mono text-emerald-200"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Registered directly in <code>/run/kw/bin</code> via <code>unkernel</code>&apos;s native host command bridge. Executes synchronously on the browser host thread with sub-millisecond latency in both inline and multi-vCPU Web Worker modes.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-300">Built-In MCP Server (`osctl mcp`)</span>
                <button
                  type="button"
                  onClick={() => copyText("mcp", mcpSnippet)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/8 text-[10px] text-zinc-200"
                >
                  {copied === "mcp" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <pre className="p-2.5 rounded-xl bg-black/60 text-[11px] font-mono text-zinc-200 overflow-x-auto select-text">
                {mcpSnippet}
              </pre>
              <p className="text-[11px] text-zinc-400">
                Auto-configured in <code>~/.claude.json</code> on boot — exposes all {AGENT_OS_SCHEMA.length} host OS tools over standard MCP JSON-RPC 2.0 stdio.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Auto-Injected Agent Guide (<code>~/CLAUDE.md</code> &amp; <code>~/AGENTS.md</code>)
              </span>
              <button
                type="button"
                onClick={() => copyText("docs", AGENT_DOCS_MARKDOWN)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/8 text-[10px] text-zinc-200"
              >
                {copied === "docs" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy Markdown
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-black/60 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap select-text leading-relaxed">
              {AGENT_DOCS_MARKDOWN}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
