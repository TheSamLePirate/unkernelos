import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  Play,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { dynamicAppsStore, useDynamicApps } from "../../core/dynamic-apps-store.ts";
import { useWorkflows, workflowsStore } from "../../core/workflows-store.ts";
import { wmStore } from "../../wm/wm-store.ts";

type Tab = "workflows" | "apps";

export const AutomationsApp: React.FC = () => {
  const workflows = useWorkflows();
  const customApps = useDynamicApps();
  const [tab, setTab] = useState<Tab>("workflows");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedWfId, setSelectedWfId] = useState<string>(() => workflows[0]?.id ?? "");

  // New Workflow Form
  const [wfOpen, setWfOpen] = useState(false);
  const [wfName, setWfName] = useState("");
  const [wfCmd, setWfCmd] = useState("");
  const [wfTrigger, setWfTrigger] = useState<"manual" | "interval" | "port-detected">("manual");
  const [wfIntervalSec, setWfIntervalSec] = useState(60);
  const [wfNotify, setWfNotify] = useState(true);

  // New Custom OS App Form
  const [appOpen, setAppOpen] = useState(false);
  const [appTitle, setAppTitle] = useState("");
  const [appEmoji, setAppEmoji] = useState("🚀");
  const [appGuestPath, setAppGuestPath] = useState("");
  const [appHtml, setAppHtml] = useState("");

  const selectedWf = workflows.find((w) => w.id === selectedWfId) ?? workflows[0] ?? null;

  const handleRunWf = async (id: string) => {
    setRunningId(id);
    setSelectedWfId(id);
    try {
      await workflowsStore.run(id);
    } finally {
      setRunningId(null);
    }
  };

  const handleCreateWf = () => {
    if (!wfName.trim() || !wfCmd.trim()) return;
    const wf = workflowsStore.create({
      name: wfName.trim(),
      description: `Trigger: ${wfTrigger}${wfTrigger === "interval" ? ` (${wfIntervalSec}s)` : ""} · ${wfCmd.trim().slice(0, 48)}`,
      trigger: wfTrigger,
      intervalSec: wfTrigger === "interval" ? Math.max(15, wfIntervalSec) : undefined,
      enabled: true,
      steps: [
        { kind: "shell", command: wfCmd.trim() },
        ...(wfNotify
          ? [
              {
                kind: "os-api" as const,
                method: "system.notify",
                params: { title: wfName.trim(), message: "Workflow completed.", level: "success" },
              },
            ]
          : []),
      ],
    });
    setSelectedWfId(wf.id);
    setWfName("");
    setWfCmd("");
    setWfOpen(false);
  };

  const handleInstallApp = () => {
    if (!appTitle.trim()) return;
    const def = dynamicAppsStore.install({
      id: appTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: appTitle.trim(),
      shortTitle: appTitle.trim().slice(0, 12),
      description: appGuestPath.trim()
        ? `Live WebOS app loaded from ${appGuestPath.trim()}`
        : "Custom WebOS app installed via Self-Extending App SDK",
      emoji: appEmoji || "✨",
      accent: "from-violet-500 to-cyan-500",
      guestPath: appGuestPath.trim() || undefined,
      html: appGuestPath.trim()
        ? undefined
        : appHtml.trim() ||
          `<html><body style="margin:0;background:#0a0c14;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:100vh"><h1>${appTitle.trim()}</h1></body></html>`,
      createdBy: "User / Studio",
    });
    setAppTitle("");
    setAppGuestPath("");
    setAppHtml("");
    setAppOpen(false);
    wmStore.openDynamicApp(def);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setTab("workflows")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              tab === "workflows"
                ? "bg-amber-500/25 text-amber-100 border border-amber-400/35"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Workflows ({workflows.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("apps")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              tab === "apps"
                ? "bg-violet-500/25 text-violet-100 border border-violet-400/35"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Blocks className="w-3.5 h-3.5" />
            Agent-Built Apps ({customApps.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => (tab === "workflows" ? setWfOpen((v) => !v) : setAppOpen((v) => !v))}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          {tab === "workflows" ? "New Workflow" : "Install Custom App"}
        </button>
      </div>

      {/* Tab 1: Workflows */}
      {tab === "workflows" && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <aside className="w-full md:w-72 max-h-60 md:max-h-none shrink-0 bg-black/30 border-b md:border-b-0 md:border-r border-white/10 p-3 space-y-2 overflow-y-auto">
            {wfOpen && (
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/12 space-y-2">
                <input
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  placeholder="Workflow name (e.g. Build & Test)"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white outline-none"
                />
                <input
                  value={wfCmd}
                  onChange={(e) => setWfCmd(e.target.value)}
                  placeholder="Linux command (e.g. bun test)"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-white outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <select
                    value={wfTrigger}
                    onChange={(e) => setWfTrigger(e.target.value as "manual" | "interval" | "port-detected")}
                    className="flex-1 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] text-zinc-200 outline-none"
                  >
                    <option value="manual" className="bg-[#12141f]">Trigger: Manual</option>
                    <option value="interval" className="bg-[#12141f]">Trigger: Every N sec</option>
                    <option value="port-detected" className="bg-[#12141f]">Trigger: On New Port</option>
                  </select>
                  {wfTrigger === "interval" && (
                    <input
                      type="number"
                      min={15}
                      value={wfIntervalSec}
                      onChange={(e) => setWfIntervalSec(Number(e.target.value) || 60)}
                      className="w-16 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-white outline-none"
                    />
                  )}
                </div>
                <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={wfNotify}
                    onChange={(e) => setWfNotify(e.target.checked)}
                    className="accent-violet-500"
                  />
                  Notify OS when finished
                </label>
                <button
                  type="button"
                  onClick={handleCreateWf}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Save Workflow
                </button>
              </div>
            )}

            {workflows.map((wf) => {
              const active = wf.id === selectedWf?.id;
              return (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWfId(wf.id)}
                  className={`group p-3 rounded-2xl border cursor-pointer transition space-y-1.5 ${
                    active
                      ? "bg-amber-500/15 border-amber-400/35"
                      : "bg-white/[0.02] border-white/8 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">{wf.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={runningId === wf.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRunWf(wf.id);
                        }}
                        className="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300"
                        title="Run Workflow Now"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          workflowsStore.remove(wf.id);
                        }}
                        className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-500/25 text-zinc-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2">{wf.description}</p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>{wf.steps.length} steps</span>
                    {wf.lastOk !== undefined && (
                      <span className={wf.lastOk ? "text-emerald-400" : "text-rose-400"}>
                        {wf.lastOk ? "PASS" : "FAIL"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </aside>

          <div className="flex-1 min-w-0 flex flex-col p-4 overflow-y-auto space-y-4">
            {selectedWf ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-white">{selectedWf.name}</h2>
                    <p className="text-xs text-zinc-400">{selectedWf.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={runningId === selectedWf.id}
                    onClick={() => void handleRunWf(selectedWf.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {runningId === selectedWf.id ? "Running..." : "Run Workflow"}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Pipeline Steps
                  </div>
                  {selectedWf.steps.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono text-zinc-200"
                    >
                      <span className="text-amber-400 mr-2">#{idx + 1}</span>
                      {st.kind === "shell" ? `$ ${st.command}` : `osctl call ${st.method} ${JSON.stringify(st.params ?? {})}`}
                    </div>
                  ))}
                </div>

                {selectedWf.lastOutput && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                      {selectedWf.lastOk ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      Last Execution Output
                    </div>
                    <pre className="p-3 rounded-2xl bg-black/65 border border-white/10 text-[11px] font-mono text-cyan-200 overflow-x-auto whitespace-pre-wrap select-text">
                      {selectedWf.lastOutput}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div className="m-auto text-xs text-zinc-500">Select or create a workflow.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Self-Extending Agent-Built Apps */}
      {tab === "apps" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3.5 rounded-2xl bg-violet-500/10 border border-violet-400/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                Self-Extending OS App SDK
              </div>
              <p className="text-[11px] text-zinc-300">
                Claude Code &amp; Pi can install brand-new native WebOS apps at runtime via{" "}
                <code className="text-cyan-300">osctl call app.install &#39;{`{"id":"my-app","title":"My App","guestPath":"/home/user/workspace/app.html"}`}&#39;</code>.
                They appear immediately in Launchpad with full <code>window.unkernelOS.call()</code> access!
              </p>
            </div>
          </div>

          {appOpen && (
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/12 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  value={appEmoji}
                  onChange={(e) => setAppEmoji(e.target.value)}
                  placeholder="🚀"
                  className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-center text-white outline-none"
                />
                <input
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  placeholder="App Title (e.g. Stock Radar)"
                  className="sm:col-span-3 px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white outline-none"
                />
              </div>
              <input
                value={appGuestPath}
                onChange={(e) => setAppGuestPath(e.target.value)}
                placeholder="Optional Linux HTML path (e.g. /home/user/workspace/my-app/index.html)"
                className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
              />
              {!appGuestPath.trim() && (
                <textarea
                  value={appHtml}
                  onChange={(e) => setAppHtml(e.target.value)}
                  rows={4}
                  placeholder="Or paste inline HTML/JS/CSS..."
                  className="w-full p-2.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
                />
              )}
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white"
              >
                Install &amp; Launch App
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customApps.map((app) => (
              <div
                key={app.id}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${app.accent} flex items-center justify-center text-lg shadow shrink-0`}
                    >
                      {app.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{app.title}</div>
                      <div className="text-[10px] font-mono text-zinc-500 truncate">{app.id}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dynamicAppsStore.uninstall(app.id)}
                    className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-300"
                    title="Uninstall"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 leading-snug">{app.description}</p>

                <button
                  type="button"
                  onClick={() => wmStore.openDynamicApp(app)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-violet-500/30 border border-white/12 text-white transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Launch in OS Window
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
