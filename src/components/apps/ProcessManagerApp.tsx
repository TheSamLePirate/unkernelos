import { Effect } from "effect";
import {
  Activity,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Network,
  Pause,
  Play,
  RefreshCw,
  Search,
  Skull,
  Terminal,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { appRuntime, useSubscriptionRef, VmService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

interface ProcRow {
  readonly user: string;
  readonly pid: number;
  readonly cpu: string;
  readonly mem: string;
  readonly cmd: string;
}

export const ProcessManagerApp: React.FC = () => {
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

  const [tab, setTab] = useState<"procs" | "ports" | "env">("procs");
  const [procs, setProcs] = useState<ProcRow[]>([]);
  const [dfOutput, setDfOutput] = useState("");
  const [envLines, setEnvLines] = useState<string[]>([]);
  const [uname, setUname] = useState("");
  const [filter, setFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSecrets, setShowSecrets] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    if (vm.phase !== "running") return;
    setBusy(true);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (v) =>
          v.execShell(
            `echo "===UNAME==="; uname -a 2>/dev/null || true; echo "===PS==="; (ps aux 2>/dev/null || ps 2>/dev/null) | head -n 120; echo "===DF==="; df -h 2>/dev/null || true; echo "===ENV==="; [ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"; env | sort`
          )
        )
      )
    );
    setBusy(false);

    if (res._tag === "Right") {
      const out = res.right.stdout;
      const getSection = (name: string, next?: string) => {
        const start = out.indexOf(`===${name}===`);
        if (start === -1) return "";
        const bodyStart = start + name.length + 7;
        const end = next ? out.indexOf(`===${next}===`, bodyStart) : out.length;
        return out.slice(bodyStart, end === -1 ? out.length : end).trim();
      };

      setUname(getSection("UNAME", "PS"));
      setDfOutput(getSection("DF", "ENV"));
      setEnvLines(getSection("ENV").split("\n").filter(Boolean));

      const psLines = getSection("PS", "DF").split("\n").slice(1);
      const parsed: ProcRow[] = [];
      for (const line of psLines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length >= 11 && /^\d+$/.test(cols[1]!)) {
          parsed.push({
            user: cols[0]!,
            pid: Number(cols[1]),
            cpu: cols[2]!,
            mem: cols[3]!,
            cmd: cols.slice(10).join(" "),
          });
        } else if (cols.length >= 4 && /^\d+$/.test(cols[0]!)) {
          parsed.push({
            user: cols[1]!,
            pid: Number(cols[0]),
            cpu: "-",
            mem: "-",
            cmd: cols.slice(3).join(" "),
          });
        }
      }
      setProcs(parsed);
    }
  }, [vm.phase]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!autoRefresh || vm.phase !== "running") return;
    const id = setInterval(() => void fetchSnapshot(), 3500);
    return () => clearInterval(id);
  }, [autoRefresh, vm.phase, fetchSnapshot]);

  const killPid = async (pid: number, sig: "TERM" | "KILL") => {
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.execShell(`kill -${sig} ${pid}`)))
    );
    if (res._tag === "Right" && res.right.exitCode === 0) {
      wmStore.pushToast("Signal Sent", `Sent SIG${sig} to PID ${pid}`, "info");
      void fetchSnapshot();
    } else {
      wmStore.pushToast("Kill Failed", `Could not kill PID ${pid}`, "error");
    }
  };

  const filteredProcs = procs.filter(
    (p) =>
      !filter.trim() ||
      p.cmd.toLowerCase().includes(filter.toLowerCase()) ||
      String(p.pid).includes(filter)
  );

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96 overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5">
          {(
            [
              ["procs", "Processes", Cpu],
              ["ports", "Ports & Network", Network],
              ["env", "Disk & Env", HardDrive],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium transition ${
                tab === id
                  ? "bg-violet-500/25 border border-violet-400/40 text-white"
                  : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === "procs" && <span className="text-[10px] font-mono opacity-70">({procs.length})</span>}
              {id === "ports" && (
                <span className="text-[10px] font-mono text-emerald-300">({vm.detectedPorts.length})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {tab === "procs" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-white/10">
              <Search className="w-3 h-3 text-zinc-500" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter PID or cmd..."
                className="bg-transparent text-xs text-zinc-200 outline-none w-36"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border transition ${
              autoRefresh
                ? "bg-emerald-500/15 border-emerald-400/35 text-emerald-300"
                : "bg-white/6 border-white/10 text-zinc-400"
            }`}
          >
            {autoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            Live
          </button>
          <button
            type="button"
            onClick={() => void fetchSnapshot()}
            className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-zinc-300"
            title="Refresh Now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Kernel Banner */}
      {uname && (
        <div className="px-3 py-1 bg-white/[0.02] border-b border-white/8 text-[10px] font-mono text-zinc-400 truncate shrink-0">
          {uname}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {tab === "procs" && (
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-zinc-500 border-b border-white/10">
                <th className="py-1.5 px-2 w-16">PID</th>
                <th className="py-1.5 px-2 w-20">User</th>
                <th className="py-1.5 px-2 w-16">CPU%</th>
                <th className="py-1.5 px-2 w-16">MEM%</th>
                <th className="py-1.5 px-2">Command</th>
                <th className="py-1.5 px-2 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcs.map((p) => (
                <tr
                  key={p.pid}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] transition"
                >
                  <td className="py-1.5 px-2 text-cyan-300">{p.pid}</td>
                  <td className="py-1.5 px-2 text-zinc-400">{p.user}</td>
                  <td className="py-1.5 px-2 text-amber-300">{p.cpu}</td>
                  <td className="py-1.5 px-2 text-violet-300">{p.mem}</td>
                  <td className="py-1.5 px-2 text-zinc-200 max-w-md truncate" title={p.cmd}>
                    {p.cmd}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {p.pid > 1 && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void killPid(p.pid, "TERM")}
                          className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-[10px] text-amber-200"
                          title="Send SIGTERM"
                        >
                          TERM
                        </button>
                        <button
                          type="button"
                          onClick={() => void killPid(p.pid, "KILL")}
                          className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"
                          title="Force Kill (SIGKILL)"
                        >
                          <Skull className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "ports" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Wisp Network Relay
                </div>
                <div className="mt-1 text-xs font-mono text-white truncate">
                  {vm.wispActiveUrl || "Offline"}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="text-[11px] text-zinc-400">Bytes Received (RX)</div>
                <div className="mt-1 text-sm font-mono text-cyan-300">
                  {((vm.stats?.net?.rx ?? 0) / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="text-[11px] text-zinc-400">Bytes Sent (TX)</div>
                <div className="mt-1 text-sm font-mono text-violet-300">
                  {((vm.stats?.net?.tx ?? 0) / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-300">Listening Guest Ports (vsock forwarded)</div>
              {vm.detectedPorts.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">
                  No TCP services currently listening inside the VM. Start a dev server on port 3000 to see it appear live.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vm.detectedPorts.map((p) => (
                    <div
                      key={p.port}
                      className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/25"
                    >
                      <div className="font-mono text-xs text-emerald-200">
                        http://127.0.0.1:{p.port}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => wmStore.openPreview(p.port, "/")}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 text-[11px] text-white"
                        >
                          <Globe className="w-3 h-3" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => wmStore.openApp("api-client")}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-zinc-200"
                        >
                          <Terminal className="w-3 h-3" />
                          API
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "env" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-zinc-300">Mounted Filesystems (`df -h`)</div>
              <pre className="p-3 rounded-2xl bg-black/55 border border-white/10 font-mono text-[11px] text-cyan-200 overflow-x-auto select-text">
                {dfOutput || "Loading..."}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-zinc-300">Guest Environment Variables</div>
                <button
                  type="button"
                  onClick={() => setShowSecrets((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                >
                  {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showSecrets ? "Mask Secrets" : "Reveal Secrets"}
                </button>
              </div>
              <div className="rounded-2xl bg-black/55 border border-white/10 p-3 font-mono text-[11px] space-y-1 select-text">
                {envLines.map((line, i) => {
                  const idx = line.indexOf("=");
                  const k = idx >= 0 ? line.slice(0, idx) : line;
                  const v = idx >= 0 ? line.slice(idx + 1) : "";
                  const isSecret = /KEY|TOKEN|SECRET|PASS/i.test(k);
                  return (
                    <div key={`${k}-${i}`} className="flex gap-2 border-b border-white/[0.04] pb-0.5">
                      <span className="text-violet-300 shrink-0">{k}=</span>
                      <span className="text-zinc-300 break-all">
                        {isSecret && !showSecrets ? "••••••••••••••••" : v}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
