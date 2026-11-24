import { Effect } from "effect";
import {
  Eraser,
  Folder,
  Globe,
  Package,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { appRuntime, GuestFsService, VmService } from "../../core/runtime.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

interface ServiceDef {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly command: string;
  readonly port?: number;
}

const STORAGE_KEY = "unkernelos:services:v1";

const DEFAULT_SERVICES: ServiceDef[] = [
  {
    id: "svc-python-http",
    name: "Python Static Server",
    cwd: "/home/user/workspace",
    command: "python3 -m http.server 8000 --bind 0.0.0.0",
    port: 8000,
  },
  {
    id: "svc-bun-hello",
    name: "Bun Hello API",
    cwd: "/home/user/workspace",
    command: `bun -e 'Bun.serve({ port: 3000, fetch: () => Response.json({ ok: true, os: "unkernelOS", time: new Date().toISOString() }) }); console.log("Listening on :3000");'`,
    port: 3000,
  },
];

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function loadServices(): ServiceDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SERVICES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SERVICES;
  } catch {
    return DEFAULT_SERVICES;
  }
}

export const ServiceRunnerApp: React.FC = () => {
  const wm = useWm();
  const [services, setServices] = useState<ServiceDef[]>(loadServices);
  const [selectedId, setSelectedId] = useState<string>(() => services[0]?.id ?? "");
  const [runningPids, setRunningPids] = useState<Record<string, number | null>>({});
  const [logs, setLogs] = useState("");
  const [newName, setNewName] = useState("");
  const [newCmd, setNewCmd] = useState("");
  const [newPort, setNewPort] = useState("3000");
  const [creating, setCreating] = useState(false);
  const [pkgScripts, setPkgScripts] = useState<readonly { name: string; cmd: string }[]>([]);

  const selected = services.find((s) => s.id === selectedId) ?? services[0] ?? null;

  // Auto-detect package.json scripts from the Active Workspace!
  useEffect(() => {
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    void appRuntime
      .runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileText(`${dir}/package.json`)))
      )
      .then((res) => {
        if (res._tag === "Right") {
          try {
            const parsed = JSON.parse(res.right) as { scripts?: Record<string, string> };
            if (parsed.scripts && typeof parsed.scripts === "object") {
              setPkgScripts(
                Object.entries(parsed.scripts).map(([name, cmd]) => ({ name, cmd }))
              );
              return;
            }
          } catch {
            // invalid json
          }
        }
        setPkgScripts([]);
      });
  }, [wm.activeWorkspaceDir]);

  const persist = (next: ServiceDef[]) => {
    setServices(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const pollStatus = useCallback(async () => {
    if (services.length === 0) return;
    const checks = services
      .map(
        (s) =>
          `PID=$(cat /tmp/unkernel-svc-${s.id}.pid 2>/dev/null || true); if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then echo "${s.id}=$PID"; else echo "${s.id}="; fi`
      )
      .join("; ");
    const logCmd = selected
      ? `echo "===LOGS==="; tail -n 120 /tmp/unkernel-svc-${selected.id}.log 2>/dev/null || echo "(No logs yet — click Start to launch service)"`
      : "";

    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (vm) => vm.execShell(`${checks}; ${logCmd}`)))
    );
    if (res._tag === "Right") {
      const [statusPart = "", logPart = ""] = res.right.stdout.split("===LOGS===\n");
      const nextPids: Record<string, number | null> = {};
      for (const line of statusPart.split("\n")) {
        const [k, v] = line.split("=");
        if (k) nextPids[k.trim()] = v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null;
      }
      setRunningPids(nextPids);
      setLogs(logPart);
    }
  }, [services, selected]);

  useEffect(() => {
    void pollStatus();
    const id = setInterval(() => void pollStatus(), 2500);
    return () => clearInterval(id);
  }, [pollStatus]);

  const startService = async (svc: ServiceDef) => {
    const pidFile = `/tmp/unkernel-svc-${svc.id}.pid`;
    const logFile = `/tmp/unkernel-svc-${svc.id}.log`;
    const script = `
mkdir -p ${sq(svc.cwd)}
cd ${sq(svc.cwd)}
[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
OLD=$(cat ${pidFile} 2>/dev/null || true)
[ -n "$OLD" ] && kill "$OLD" 2>/dev/null || true
nohup /bin/sh -c ${sq(svc.command)} > ${logFile} 2>&1 < /dev/null &
echo $! > ${pidFile}
echo "Started PID $(cat ${pidFile})"
`;
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (vm) => vm.execShell(script)))
    );
    if (res._tag === "Right" && res.right.exitCode === 0) {
      wmStore.pushToast("Service Started", `${svc.name} running in background`, "success");
      setTimeout(() => void pollStatus(), 400);
    } else {
      wmStore.pushToast("Service Error", "Failed to start service", "error");
    }
  };

  const stopService = async (svc: ServiceDef) => {
    const pidFile = `/tmp/unkernel-svc-${svc.id}.pid`;
    await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.execShell(`PID=$(cat ${pidFile} 2>/dev/null || true); [ -n "$PID" ] && kill -TERM "$PID" 2>/dev/null || true; rm -f ${pidFile}`)
        )
      )
    );
    wmStore.pushToast("Service Stopped", svc.name, "info");
    setTimeout(() => void pollStatus(), 300);
  };

  const addService = () => {
    if (!newName.trim() || !newCmd.trim()) return;
    const svc: ServiceDef = {
      id: `svc-${Math.random().toString(36).slice(2, 8)}`,
      name: newName.trim(),
      cwd: wm.activeWorkspaceDir || "/home/user/workspace",
      command: newCmd.trim(),
      port: Number(newPort) > 0 ? Number(newPort) : undefined,
    };
    persist([...services, svc]);
    setSelectedId(svc.id);
    setNewName("");
    setNewCmd("");
    setCreating(false);
  };

  const addAndRunPkgScript = (name: string) => {
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    const proj = dir.split("/").filter(Boolean).pop() || "app";
    const svc: ServiceDef = {
      id: `svc-${Math.random().toString(36).slice(2, 8)}`,
      name: `${proj}: ${name}`,
      cwd: dir,
      command: `bun run ${name}`,
      port: name === "dev" || name === "start" || name === "preview" ? 3000 : undefined,
    };
    persist([...services, svc]);
    setSelectedId(svc.id);
    void startService(svc);
  };

  const clearSelectedLogs = async () => {
    if (!selected) return;
    await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) => vm.execShell(`: > /tmp/unkernel-svc-${selected.id}.log`))
      )
    );
    setLogs("");
  };

  const syncServiceCwd = () => {
    if (!selected) return;
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    persist(services.map((s) => (s.id === selected.id ? { ...s, cwd: dir } : s)));
    wmStore.pushToast("Working Dir Updated", `${selected.name} → ${dir}`, "info");
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-[#090b12]/96 overflow-hidden">
      {/* Left Services List */}
      <aside className="w-full md:w-64 max-h-52 md:max-h-none shrink-0 bg-black/35 border-b md:border-b-0 md:border-r border-white/10 p-3 flex flex-col gap-2.5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <PlayCircle className="w-4 h-4 text-emerald-400" />
            Linux Services
          </span>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="p-1 rounded-lg bg-violet-500/25 hover:bg-violet-500/40 text-violet-200"
            title="New Background Service"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {creating && (
          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/12 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Service name (e.g. Vite Dev)"
              className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-xs text-zinc-100 outline-none"
            />
            <input
              value={newCmd}
              onChange={(e) => setNewCmd(e.target.value)}
              placeholder="Command (e.g. bun run dev)"
              className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-100 outline-none"
            />
            <div className="flex gap-1.5">
              <input
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                placeholder="Port"
                className="w-20 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={addService}
                className="flex-1 py-1 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
              >
                Add Service
              </button>
            </div>
          </div>
        )}

        {pkgScripts.length > 0 && (
          <div className="p-2 rounded-2xl bg-emerald-500/8 border border-emerald-400/20 space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              <Package className="w-3 h-3" />
              package.json ({wm.activeWorkspaceDir.split("/").pop()})
            </div>
            <div className="flex flex-wrap gap-1">
              {pkgScripts.slice(0, 6).map((sc) => (
                <button
                  key={sc.name}
                  type="button"
                  onClick={() => addAndRunPkgScript(sc.name)}
                  title={sc.cmd}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/18 hover:bg-emerald-500/30 border border-emerald-400/30 text-[10px] font-mono text-emerald-100 transition"
                >
                  <Play className="w-2.5 h-2.5" />
                  {sc.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5 flex-1">
          {services.map((svc) => {
            const pid = runningPids[svc.id];
            const active = selected?.id === svc.id;
            return (
              <div
                key={svc.id}
                onClick={() => setSelectedId(svc.id)}
                className={`group p-2.5 rounded-2xl border cursor-pointer transition ${
                  active
                    ? "bg-violet-500/18 border-violet-400/40"
                    : "bg-white/[0.02] border-white/8 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        pid ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                      }`}
                    />
                    <span className="text-xs font-medium text-white truncate">{svc.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      persist(services.filter((x) => x.id !== svc.id));
                    }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>{pid ? `PID ${pid}` : "Stopped"}</span>
                  {svc.port && <span className="text-cyan-400">:{svc.port}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Detail + Live Logs */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-black/40 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{selected.name}</div>
                <div className="text-[11px] font-mono text-zinc-400 truncate max-w-xl">
                  {selected.cwd} $ {selected.command}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {runningPids[selected.id] ? (
                  <button
                    type="button"
                    onClick={() => void stopService(selected)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 text-rose-200 transition"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startService(selected)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Daemon
                  </button>
                )}

                {selected.port && (
                  <button
                    type="button"
                    onClick={() => wmStore.openPreview(selected.port!, "/")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-cyan-500/18 hover:bg-cyan-500/28 border border-cyan-400/35 text-cyan-200 transition"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Preview :{selected.port}
                  </button>
                )}

                <button
                  type="button"
                  onClick={syncServiceCwd}
                  className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-amber-300"
                  title={`Use Active Workspace (${wm.activeWorkspaceDir})`}
                >
                  <Folder className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void clearSelectedLogs()}
                  className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-zinc-300"
                  title="Clear Logs"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void pollStatus()}
                  className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-zinc-300"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-[#06080e]">
              <div className="px-3 py-1.5 bg-black/40 border-b border-white/8 flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <Terminal className="w-3 h-3 text-cyan-400" />
                LIVE LOG STREAM (/tmp/unkernel-svc-{selected.id}.log)
              </div>
              <pre className="flex-1 overflow-auto p-3.5 font-mono text-xs text-zinc-200 whitespace-pre-wrap select-text leading-relaxed">
                {logs}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
            Select or create a background Linux service.
          </div>
        )}
      </div>
    </div>
  );
};
