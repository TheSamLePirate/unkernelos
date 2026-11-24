import { Effect } from "effect";
import {
  Bot,
  Kanban,
  MessageSquare,
  Network,
  Play,
  Plus,
  Send,
  Sparkles,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { SettingsService, useSubscriptionRef } from "../../core/runtime.ts";
import { DEFAULT_UNKERNEL_CONFIG } from "../../core/schema.ts";
import { swarmStore, useSwarm, type SwarmTask, type SwarmWorker } from "../../core/swarm-store.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { KittyTerminalPane, type KittyTerminalHandle } from "./KittyTerminalPane.tsx";

type SwarmTab = "grid" | "board";
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const AgentSwarmApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const wm = useWm();
  const swarm = useSwarm();
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );

  const [tab, setTab] = useState<SwarmTab>("grid");
  const [activeWorkerId, setActiveWorkerId] = useState<string>(() => swarm.workers[0]?.id ?? "");
  const [broadcastPrompt, setBroadcastPrompt] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("all");
  const [busMsg, setBusMsg] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Specialist");
  const [newHarness, setNewHarness] = useState<SwarmWorker["harness"]>("claude");

  const handlesRef = useRef<Map<string, KittyTerminalHandle>>(new Map());

  const runOnWorker = (w: SwarmWorker, promptText?: string) => {
    const h = handlesRef.current.get(w.id);
    if (!h) return;
    const dir = wm.activeWorkspaceDir || w.cwd || "/home/user/workspace";
    let cmd = "";
    if (w.harness === "claude") {
      cmd = promptText ? `claude ${sq(promptText)}` : "claude";
    } else if (w.harness === "pi") {
      cmd = promptText ? `pi ${sq(promptText)}` : "pi";
    } else {
      cmd = promptText || "ls -la";
    }
    h.write(
      `mkdir -p ${sq(dir)} && cd ${sq(dir)} && [ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env" && ${cmd}\n`
    );
    swarmStore.setWorkerStatus(w.id, "running");
  };

  const broadcastToAll = () => {
    const text = broadcastPrompt.trim();
    if (!text) return;
    for (const w of swarm.workers) {
      runOnWorker(w, `[Role: ${w.name} - ${w.role}] ${text}`);
    }
    swarmStore.postMessage("coordinator", "all", `Broadcasted mission: ${text}`);
    setBroadcastPrompt("");
    wmStore.pushToast("Swarm Mission Launched", `Dispatched to ${swarm.workers.length} parallel agents`, "success");
  };

  const handleAddWorker = () => {
    if (!newName.trim()) return;
    const w = swarmStore.addWorker({
      name: newName.trim(),
      role: newRole.trim() || "Worker",
      harness: newHarness,
      cwd: wm.activeWorkspaceDir || "/home/user/workspace",
    });
    setActiveWorkerId(w.id);
    setNewName("");
    setAddingWorker(false);
  };

  const colsClass =
    swarm.workers.length === 1
      ? "grid-cols-1"
      : swarm.workers.length === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96">
      {/* Top Swarm Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Network className="w-4 h-4 text-fuchsia-400" />
            Agent Swarm ({swarm.workers.length})
          </div>

          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setTab("grid")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                tab === "grid"
                  ? "bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/35"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Terminal className="w-3 h-3" />
              Live Agent Grid
            </button>
            <button
              type="button"
              onClick={() => setTab("board")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                tab === "board"
                  ? "bg-cyan-500/25 text-cyan-100 border border-cyan-400/35"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Kanban className="w-3 h-3" />
              Kanban &amp; Bus ({swarm.tasks.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => swarmStore.loadPreset("fullstack", wm.activeWorkspaceDir)}
            className="hidden sm:inline-flex px-2 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-white/12 border border-white/10 text-zinc-300"
          >
            2× Full-Stack
          </button>
          <button
            type="button"
            onClick={() => swarmStore.loadPreset("trio", wm.activeWorkspaceDir)}
            className="hidden sm:inline-flex px-2 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-white/12 border border-white/10 text-zinc-300"
          >
            3× Squad
          </button>
          <button
            type="button"
            onClick={() => setAddingWorker((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Spawn Agent
          </button>
        </div>
      </div>

      {/* Add Worker Bar */}
      {addingWorker && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-400/25 shrink-0">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddWorker()}
            placeholder="Agent name (e.g. Reviewer)"
            className="px-2.5 py-1 rounded-lg bg-black/55 border border-white/12 text-xs text-white outline-none w-36"
          />
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Role"
            className="px-2.5 py-1 rounded-lg bg-black/55 border border-white/12 text-xs text-zinc-200 outline-none w-36"
          />
          <select
            value={newHarness}
            onChange={(e) => setNewHarness(e.target.value as SwarmWorker["harness"])}
            className="px-2 py-1 rounded-lg bg-black/55 border border-white/12 text-xs text-zinc-200 outline-none"
          >
            <option value="claude" className="bg-[#12141f]">Claude Code</option>
            <option value="pi" className="bg-[#12141f]">Pi Agent</option>
            <option value="shell" className="bg-[#12141f]">Linux Shell</option>
          </select>
          <button
            type="button"
            onClick={handleAddWorker}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white"
          >
            Add to Grid
          </button>
        </div>
      )}

      {/* Broadcast Mission Composer */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.025] border-b border-white/8 shrink-0">
        <Sparkles className="w-4 h-4 text-fuchsia-400 shrink-0" />
        <input
          value={broadcastPrompt}
          onChange={(e) => setBroadcastPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && broadcastToAll()}
          placeholder={`Broadcast mission to all ${swarm.workers.length} parallel agents in ${wm.activeWorkspaceDir}...`}
          className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-white/12 focus:border-fuchsia-400/50 text-xs text-white placeholder:text-zinc-500 outline-none"
        />
        <button
          type="button"
          disabled={!broadcastPrompt.trim()}
          onClick={broadcastToAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white disabled:opacity-40 hover:brightness-110 transition shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          Dispatch All
        </button>
      </div>

      {/* Tab 1: Live Multi-Agent PTY Grid (always mounted so PTYs stay alive!) */}
      <div className={`flex-1 min-h-0 grid ${colsClass} gap-px bg-white/10 overflow-hidden ${tab === "grid" ? "" : "hidden"}`}>
        {swarm.workers.map((w) => {
          const focused = windowFocused && tab === "grid" && activeWorkerId === w.id;
          return (
            <div
              key={w.id}
              onMouseDown={() => setActiveWorkerId(w.id)}
              className="flex flex-col min-h-[220px] min-w-0 bg-[#080a10]"
            >
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-black/50 border-b border-white/8 text-[11px] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      w.status === "running" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                    }`}
                  />
                  <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="font-semibold text-white truncate">{w.name}</span>
                  <span className="px-1.5 py-0.2 rounded bg-white/8 text-[9px] font-mono text-cyan-300 uppercase">
                    {w.harness}
                  </span>
                  <span className="hidden xl:inline text-[10px] text-zinc-500 truncate">{w.role}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => runOnWorker(w)}
                    className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300"
                    title={`Launch interactive ${w.harness}`}
                  >
                    <Play className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlesRef.current.get(w.id)?.write("\x03");
                      swarmStore.setWorkerStatus(w.id, "idle");
                    }}
                    className="p-1 rounded bg-rose-500/18 hover:bg-rose-500/35 text-rose-300"
                    title="Stop (^C)"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                  {swarm.workers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => swarmStore.removeWorker(w.id)}
                      className="p-1 rounded hover:bg-rose-500/25 text-zinc-500 hover:text-rose-300"
                      title="Remove Agent"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <KittyTerminalPane
                  themeId={cfg.kittyTheme}
                  fontSize={Math.max(11, cfg.terminalFontSize - 1)}
                  preferWebGpu={cfg.webgpuTerminal}
                  cwd={wm.activeWorkspaceDir || w.cwd}
                  initialCommand={w.initialCommand}
                  focused={focused}
                  onFocus={() => setActiveWorkerId(w.id)}
                  onReady={(h) => handlesRef.current.set(w.id, h)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab 2: Kanban Task Board + Inter-Agent Message Bus */}
      {tab === "board" && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10 overflow-hidden">
          {/* Kanban 3 Columns */}
          <div className="lg:col-span-8 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
            <div className="flex gap-1.5">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskTitle.trim()) {
                    swarmStore.addTask(newTaskTitle, newTaskAssignee);
                    setNewTaskTitle("");
                  }
                }}
                placeholder="Add shared swarm task..."
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs text-white outline-none"
              />
              <select
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                className="px-2 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs text-zinc-200 outline-none"
              >
                <option value="all" className="bg-[#12141f]">Any Agent</option>
                {swarm.workers.map((w) => (
                  <option key={w.id} value={w.name} className="bg-[#12141f]">
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newTaskTitle.trim()) return;
                  swarmStore.addTask(newTaskTitle, newTaskAssignee);
                  setNewTaskTitle("");
                }}
                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
              >
                Add
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
              {(
                [
                  ["todo", "To Do", "text-zinc-300"],
                  ["doing", "In Progress", "text-amber-300"],
                  ["done", "Done", "text-emerald-300"],
                ] as const
              ).map(([col, label, color]) => {
                const items = swarm.tasks.filter((t) => t.status === col);
                const nextStatus: SwarmTask["status"] =
                  col === "todo" ? "doing" : col === "doing" ? "done" : "todo";
                return (
                  <div
                    key={col}
                    className="p-2.5 rounded-2xl bg-white/[0.025] border border-white/10 flex flex-col gap-2"
                  >
                    <div className={`text-[11px] font-semibold uppercase tracking-wider flex justify-between ${color}`}>
                      <span>{label}</span>
                      <span className="font-mono">{items.length}</span>
                    </div>
                    <div className="space-y-1.5 flex-1">
                      {items.map((t) => (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-black/45 border border-white/10 space-y-1.5"
                        >
                          <div className="text-xs text-white leading-snug">{t.title}</div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-200 font-mono">
                              @{t.assignee}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => swarmStore.moveTask(t.id, nextStatus)}
                                className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/16 text-zinc-200"
                              >
                                → {nextStatus}
                              </button>
                              <button
                                type="button"
                                onClick={() => swarmStore.removeTask(t.id)}
                                className="p-0.5 text-zinc-500 hover:text-rose-400"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inter-Agent Message Bus */}
          <div className="lg:col-span-4 flex flex-col min-h-0 p-3 space-y-2.5 bg-black/25">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <MessageSquare className="w-3.5 h-3.5" />
              Inter-Agent Message Bus (`osctl swarm.post`)
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {swarm.messages.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-xl bg-white/[0.03] border border-white/8 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-fuchsia-300">
                      {m.from} → {m.to}
                    </span>
                    <span className="text-zinc-500">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed break-words">{m.text}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 pt-1">
              <input
                value={busMsg}
                onChange={(e) => setBusMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && busMsg.trim()) {
                    swarmStore.postMessage("human", "all", busMsg.trim());
                    setBusMsg("");
                  }
                }}
                placeholder="Post to swarm bus..."
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-xs text-white outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!busMsg.trim()) return;
                  swarmStore.postMessage("human", "all", busMsg.trim());
                  setBusMsg("");
                }}
                className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
