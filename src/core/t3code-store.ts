import { Effect } from "effect";
import { useSyncExternalStore } from "react";
import { reactiveEngine } from "./reactive-mod-engine.ts";
import { appRuntime, VmService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";
import installT3CodeScript from "../../scripts/guest/install-t3code.sh?raw";

export type T3ConnectionMode = "vm" | "remote";
export type T3DaemonStatus = "stopped" | "installing" | "starting" | "running" | "error";

export interface T3ProviderStatus {
  readonly id: "claude" | "pi" | "codex" | "antigravity";
  readonly name: string;
  readonly installed: boolean;
  readonly version: string | null;
  readonly limitPct: number; // 0..100 estimated or parsed window utilization
  readonly statusLabel: string;
}

export interface T3ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly provider: string;
  readonly updatedAt: string;
  readonly isSubagent: boolean;
}

export interface T3MetricsSnapshot {
  readonly threadsTotal: number;
  readonly threadsActive: number;
  readonly threadsWaiting: number;
  readonly subagentsActive: number;
  readonly tokensInput: number;
  readonly tokensOutput: number;
  readonly tokensCacheRead: number;
  readonly tokensTotal: number;
  readonly costSessionUsd: number;
  readonly costTodayUsd: number;
  readonly recentThreads: readonly T3ThreadSummary[];
  readonly providers: readonly T3ProviderStatus[];
  readonly lastProbeAt: number;
}

export interface T3CodeState {
  readonly mode: T3ConnectionMode;
  readonly status: T3DaemonStatus;
  readonly port: number;
  readonly remoteUrl: string;
  readonly embedUrl: string | null;
  readonly binaryInstalled: boolean;
  readonly version: string | null;
  readonly pid: number | null;
  readonly logs: string;
  readonly error: string | null;
  readonly metrics: T3MetricsSnapshot;
}

const STORAGE_KEY = "unkernelos:t3code-cfg:v1";

const DEFAULT_PROVIDERS: readonly T3ProviderStatus[] = [
  { id: "claude", name: "Claude Code", installed: false, version: null, limitPct: 0, statusLabel: "Checking…" },
  { id: "pi", name: "Pi Coding Agent", installed: false, version: null, limitPct: 0, statusLabel: "Checking…" },
  { id: "codex", name: "OpenAI Codex", installed: false, version: null, limitPct: 0, statusLabel: "Prêt à installer" },
  { id: "antigravity", name: "Google Antigravity", installed: false, version: null, limitPct: 0, statusLabel: "Prêt à installer" },
];

const EMPTY_METRICS: T3MetricsSnapshot = {
  threadsTotal: 0,
  threadsActive: 0,
  threadsWaiting: 0,
  subagentsActive: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensTotal: 0,
  costSessionUsd: 0,
  costTodayUsd: 0,
  recentThreads: [],
  providers: DEFAULT_PROVIDERS,
  lastProbeAt: 0,
};

function loadSavedConfig(): { mode: T3ConnectionMode; port: number; remoteUrl: string } {
  if (typeof localStorage === "undefined") {
    return { mode: "vm", port: 3773, remoteUrl: "http://127.0.0.1:3773" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "vm", port: 3773, remoteUrl: "http://127.0.0.1:3773" };
    const p = JSON.parse(raw) as Partial<{ mode: T3ConnectionMode; port: number; remoteUrl: string }>;
    return {
      mode: p.mode === "remote" ? "remote" : "vm",
      port: typeof p.port === "number" && p.port > 1024 ? p.port : 3773,
      remoteUrl: typeof p.remoteUrl === "string" && p.remoteUrl.trim() ? p.remoteUrl.trim() : "http://127.0.0.1:3773",
    };
  } catch {
    return { mode: "vm", port: 3773, remoteUrl: "http://127.0.0.1:3773" };
  }
}

/**
 * Python3 zero-dependency telemetry probe for T3 Code SQLite databases & installed agent providers.
 * Inspects ~/.t3/userdata/*.sqlite dynamically so it adapts seamlessly across T3 Code schema updates!
 */
const T3_TELEMETRY_PY = `
import glob, json, os, shutil, sqlite3, subprocess, time

def cmd_ver(bin_name, flag="--version"):
    p = shutil.which(bin_name)
    if not p:
        return (False, None)
    try:
        out = subprocess.check_output([p, flag], stderr=subprocess.STDOUT, timeout=2).decode("utf-8", "ignore").strip().splitlines()
        return (True, out[0][:48] if out else "installed")
    except Exception:
        return (True, "installed")

t3_ok, t3_ver = cmd_ver("t3")
cl_ok, cl_ver = cmd_ver("claude")
pi_ok, pi_ver = cmd_ver("pi")
cx_ok, cx_ver = cmd_ver("codex")
ag_ok, ag_ver = cmd_ver("agy")

# Check running t3 daemon PID
pid = None
try:
    for d in os.listdir("/proc"):
        if not d.isdigit(): continue
        try:
            cmd = open(f"/proc/{d}/cmdline", "rb").read().decode("utf-8", "ignore")
            if ("/t3" in cmd or cmd.startswith("t3\\x00")) and ("start" in cmd or "serve" in cmd or "--port" in cmd):
                pid = int(d)
                break
        except Exception:
            pass
except Exception:
    pass

threads_total = 0
threads_active = 0
threads_waiting = 0
subagents_active = 0
tok_in = 0
tok_out = 0
tok_cache = 0
cost_today = 0.0
cost_session = 0.0
recent = []

home = os.path.expanduser("~")
t3_home = os.environ.get("T3CODE_HOME", os.path.join(home, ".t3"))
db_paths = glob.glob(os.path.join(t3_home, "**", "*.sqlite*"), recursive=True) + glob.glob(os.path.join(t3_home, "**", "*.db"), recursive=True)
db_paths = [p for p in db_paths if not p.endswith("-wal") and not p.endswith("-shm") and os.path.isfile(p)]

for dbp in db_paths[:4]:
    try:
        con = sqlite3.connect(f"file:{dbp}?mode=ro", uri=True, timeout=0.5)
        cur = con.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        for tbl in tables:
            tl = tbl.lower()
            cols = [r[1] for r in cur.execute(f'PRAGMA table_info("{tbl}")').fetchall()]
            cl = [c.lower() for c in cols]
            if "thread" in tl and "id" in cl:
                try:
                    rows = cur.execute(f'SELECT * FROM "{tbl}" ORDER BY rowid DESC LIMIT 50').fetchall()
                    threads_total += len(rows)
                    for row in rows:
                        rec = dict(zip(cl, row))
                        st = str(rec.get("status") or rec.get("state") or "idle").lower()
                        is_sub = bool(rec.get("parent_thread_id") or rec.get("parentthreadid") or rec.get("delegated_from"))
                        if st in ("running", "working", "starting", "preparing", "queued"):
                            threads_active += 1
                            if is_sub:
                                subagents_active += 1
                        elif st in ("waiting", "approval", "pending"):
                            threads_waiting += 1
                        if len(recent) < 12:
                            recent.append({
                                "id": str(rec.get("id", ""))[:18],
                                "title": str(rec.get("title") or rec.get("name") or "Thread")[:44],
                                "status": st,
                                "provider": str(rec.get("provider") or rec.get("driver_kind") or "claude"),
                                "updatedAt": str(rec.get("updated_at") or rec.get("updatedat") or ""),
                                "isSubagent": is_sub,
                            })
                except Exception:
                    pass
            if any(k in tl for k in ("usage", "metric", "turn", "run", "cost", "token")):
                try:
                    for col in cl:
                        if "input_token" in col or col == "inputtokens":
                            v = cur.execute(f'SELECT COALESCE(SUM("{cols[cl.index(col)]}"),0) FROM "{tbl}"').fetchone()[0]
                            tok_in += int(v or 0)
                        elif "output_token" in col or col == "outputtokens":
                            v = cur.execute(f'SELECT COALESCE(SUM("{cols[cl.index(col)]}"),0) FROM "{tbl}"').fetchone()[0]
                            tok_out += int(v or 0)
                        elif "cache_read" in col or "cacheread" in col:
                            v = cur.execute(f'SELECT COALESCE(SUM("{cols[cl.index(col)]}"),0) FROM "{tbl}"').fetchone()[0]
                            tok_cache += int(v or 0)
                        elif "cost" in col and "usd" in col or col in ("cost", "cost_usd", "total_cost"):
                            v = cur.execute(f'SELECT COALESCE(SUM("{cols[cl.index(col)]}"),0) FROM "{tbl}"').fetchone()[0]
                            cost_today += float(v or 0.0)
                except Exception:
                    pass
        con.close()
    except Exception:
        pass

if cost_today == 0.0 and (tok_in + tok_out) > 0:
    cost_today = round((tok_in * 3.0 + tok_out * 15.0 + tok_cache * 0.3) / 1_000_000.0, 4)
cost_session = round(cost_today, 4)

log_tail = ""
if os.path.isfile("/tmp/t3code.log"):
    try:
        with open("/tmp/t3code.log", "r", errors="ignore") as f:
            log_tail = "".join(f.readlines()[-60:])
    except Exception:
        pass

print(json.dumps({
    "t3Installed": t3_ok,
    "t3Version": t3_ver,
    "pid": pid,
    "threadsTotal": threads_total,
    "threadsActive": threads_active,
    "threadsWaiting": threads_waiting,
    "subagentsActive": subagents_active,
    "tokensInput": tok_in,
    "tokensOutput": tok_out,
    "tokensCacheRead": tok_cache,
    "tokensTotal": tok_in + tok_out + tok_cache,
    "costTodayUsd": round(cost_today, 4),
    "costSessionUsd": cost_session,
    "recentThreads": recent,
    "logTail": log_tail,
    "providers": [
        {"id": "claude", "name": "Claude Code", "installed": cl_ok, "version": cl_ver, "limitPct": min(100, round((tok_in + tok_out) / 2000)), "statusLabel": "Connecté" if cl_ok else "Absent"},
        {"id": "pi", "name": "Pi Coding Agent", "installed": pi_ok, "version": pi_ver, "limitPct": min(100, round((tok_in + tok_out) / 4000)), "statusLabel": "Connecté" if pi_ok else "Absent"},
        {"id": "codex", "name": "OpenAI Codex", "installed": cx_ok, "version": cx_ver, "limitPct": 0, "statusLabel": "Connecté" if cx_ok else "Bientôt intégré"},
        {"id": "antigravity", "name": "Google Antigravity", "installed": ag_ok, "version": ag_ver, "limitPct": 0, "statusLabel": "Connecté" if ag_ok else "Bientôt intégré"},
    ],
}))
`.trim();

const toB64 = (txt: string): string => {
  const bytes = new TextEncoder().encode(txt);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
};

class T3CodeStore {
  private state: T3CodeState;
  private listeners = new Set<() => void>();
  private pollTimer = 0;
  private probing = false;
  private prevWaiting = 0;

  constructor() {
    const saved = loadSavedConfig();
    this.state = {
      mode: saved.mode,
      status: saved.mode === "remote" ? "running" : "stopped",
      port: saved.port,
      remoteUrl: saved.remoteUrl,
      embedUrl: saved.mode === "remote" ? saved.remoteUrl : null,
      binaryInstalled: false,
      version: null,
      pid: null,
      logs: "",
      error: null,
      metrics: EMPTY_METRICS,
    };
  }

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): T3CodeState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: this.state.mode,
          port: this.state.port,
          remoteUrl: this.state.remoteUrl,
        })
      );
    } catch {
      // ignore
    }
  }

  private setState(patch: Partial<T3CodeState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  public startPolling(): void {
    if (this.pollTimer || typeof window === "undefined") return;
    void this.refreshProbe();
    this.pollTimer = window.setInterval(() => {
      if (!document.hidden) void this.refreshProbe();
    }, 5000);
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = 0;
    }
  }

  public setMode(mode: T3ConnectionMode): void {
    this.setState({
      mode,
      error: null,
      embedUrl: mode === "remote" ? this.state.remoteUrl : this.state.pid ? this.state.embedUrl : null,
      status: mode === "remote" ? "running" : this.state.pid ? "running" : "stopped",
    });
    this.persist();
    this.pushReactiveSignals();
  }

  public setPort(port: number): void {
    const clean = Math.max(1025, Math.min(65535, Math.round(port || 3773)));
    this.setState({ port: clean });
    this.persist();
  }

  public setRemoteUrl(url: string): void {
    const clean = url.trim();
    this.setState({
      remoteUrl: clean,
      embedUrl: this.state.mode === "remote" ? clean : this.state.embedUrl,
    });
    this.persist();
  }

  private pushReactiveSignals(): void {
    const m = this.state.metrics;
    const claude = m.providers.find((p) => p.id === "claude");
    const pi = m.providers.find((p) => p.id === "pi");
    const codex = m.providers.find((p) => p.id === "codex");
    const agy = m.providers.find((p) => p.id === "antigravity");

    reactiveEngine.pushSignals(
      {
        "t3.status": this.state.mode === "remote" ? "remote" : this.state.status,
        "t3.threads.total": m.threadsTotal,
        "t3.threads.active": m.threadsActive,
        "t3.threads.waiting": m.threadsWaiting,
        "t3.subagents": m.subagentsActive,
        "t3.tokens.input": m.tokensInput,
        "t3.tokens.output": m.tokensOutput,
        "t3.tokens.cache": m.tokensCacheRead,
        "t3.tokens.total": m.tokensTotal,
        "t3.cost.today": Number(m.costTodayUsd.toFixed(4)),
        "t3.cost.session": Number(m.costSessionUsd.toFixed(4)),
        "t3.limits.claude": claude?.limitPct ?? 0,
        "t3.limits.pi": pi?.limitPct ?? 0,
        "t3.limits.codex": codex?.limitPct ?? 0,
        "t3.limits.antigravity": agy?.limitPct ?? 0,
      },
      "t3code"
    );

    if (m.tokensTotal > reactiveEngine.getSignalNumeric("agent.tokens", 0)) {
      reactiveEngine.pushSignal("agent.tokens", m.tokensTotal, {
        unit: "tok",
        label: "Tokens T3 Code",
        sourceId: "t3code",
      });
    }
  }

  public async refreshProbe(): Promise<void> {
    if (this.probing) return;
    const vmSnap = appRuntime.runSync(
      Effect.flatMap(VmService, (v) => v.stateRef.get).pipe(Effect.catchAll(() => Effect.succeed(null)))
    );
    if (!vmSnap || vmSnap.phase !== "running") return;

    this.probing = true;
    try {
      const b64 = toB64(T3_TELEMETRY_PY);
      const res = await appRuntime.runPromise(
        Effect.either(
          Effect.flatMap(VmService, (v) =>
            v.execShell(`printf '%s' '${b64}' | base64 -d | python3`)
          )
        )
      );
      if (res._tag !== "Right" || !res.right.stdout.trim()) return;
      const parsed = JSON.parse(res.right.stdout.trim()) as {
        t3Installed: boolean;
        t3Version: string | null;
        pid: number | null;
        threadsTotal: number;
        threadsActive: number;
        threadsWaiting: number;
        subagentsActive: number;
        tokensInput: number;
        tokensOutput: number;
        tokensCacheRead: number;
        tokensTotal: number;
        costTodayUsd: number;
        costSessionUsd: number;
        recentThreads: T3ThreadSummary[];
        logTail: string;
        providers: T3ProviderStatus[];
      };

      let embedUrl = this.state.embedUrl;
      if (this.state.mode === "vm" && parsed.pid) {
        try {
          embedUrl = await appRuntime.runPromise(
            Effect.gen(function* () {
              const vm = yield* VmService;
              yield* Effect.promise(() => vm.previewRelay.ready());
              return vm.previewRelay.previewUrl(t3CodeStore.getSnapshot().port, "/");
            })
          );
        } catch {
          // keep previous embedUrl
        }
      }

      if (parsed.threadsWaiting > this.prevWaiting) {
        wmStore.pushToast(
          "T3 Code — Action Requise",
          `${parsed.threadsWaiting} thread(s) en attente de validation ou réponse.`,
          "warn"
        );
      }
      this.prevWaiting = parsed.threadsWaiting;

      const nextStatus: T3DaemonStatus =
        this.state.mode === "remote"
          ? "running"
          : this.state.status === "installing" || this.state.status === "starting"
          ? parsed.pid
            ? "running"
            : this.state.status
          : parsed.pid
          ? "running"
          : "stopped";

      this.setState({
        binaryInstalled: parsed.t3Installed,
        version: parsed.t3Version,
        pid: parsed.pid,
        status: nextStatus,
        embedUrl: this.state.mode === "remote" ? this.state.remoteUrl : parsed.pid ? embedUrl : null,
        logs: parsed.logTail || this.state.logs,
        metrics: {
          threadsTotal: parsed.threadsTotal,
          threadsActive: parsed.threadsActive,
          threadsWaiting: parsed.threadsWaiting,
          subagentsActive: parsed.subagentsActive,
          tokensInput: parsed.tokensInput,
          tokensOutput: parsed.tokensOutput,
          tokensCacheRead: parsed.tokensCacheRead,
          tokensTotal: parsed.tokensTotal,
          costTodayUsd: parsed.costTodayUsd,
          costSessionUsd: parsed.costSessionUsd,
          recentThreads: parsed.recentThreads,
          providers: parsed.providers,
          lastProbeAt: Date.now(),
        },
      });
      this.pushReactiveSignals();
    } catch {
      // silent probe failure
    } finally {
      this.probing = false;
    }
  }

  public async installInVm(): Promise<{ ok: boolean; error?: string }> {
    this.setState({ status: "installing", error: null });
    wmStore.pushToast("Installation T3 Code", "Téléchargement du binaire linux-arm64 officiel…", "info");
    try {
      const b64 = toB64(installT3CodeScript);
      const res = await appRuntime.runPromise(
        Effect.either(
          Effect.flatMap(VmService, (v) =>
            v.execShell(`printf '%s' '${b64}' | base64 -d | sudo bash 2>&1 | tee /tmp/t3code.log`)
          )
        )
      );
      if (res._tag === "Left") throw new Error(String(res.left));
      if (res.right.exitCode !== 0) {
        throw new Error(res.right.stdout.slice(-300) || res.right.stderr.slice(-300) || "Install failed");
      }
      this.setState({ status: "stopped", binaryInstalled: true, logs: res.right.stdout });
      await this.refreshProbe();
      wmStore.pushToast("T3 Code Installé", "Harnais multi-agents prêt à démarrer !", "success");
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ status: "error", error: msg });
      wmStore.pushToast("Échec Installation T3 Code", msg.slice(0, 140), "error");
      return { ok: false, error: msg };
    }
  }

  public async startVmDaemon(cwd?: string): Promise<{ ok: boolean; url?: string; error?: string }> {
    this.setState({ mode: "vm", status: "starting", error: null });
    this.persist();

    // Ensure installed first
    await this.refreshProbe();
    if (!this.state.binaryInstalled) {
      const inst = await this.installInVm();
      if (!inst.ok) return inst;
      this.setState({ status: "starting" });
    }

    const workDir = cwd || wmStore.getSnapshot().activeWorkspaceDir || "/home/user/workspace";
    const port = this.state.port;
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

    const cmd = [
      `mkdir -p ${sq(workDir)} "$HOME/.t3"`,
      `[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env" || true`,
      `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"`,
      `export NODE_OPTIONS="--max-old-space-size=512"`,
      `export T3CODE_HOME="$HOME/.t3"`,
      `pkill -f "t3 start.*--port ${port}" 2>/dev/null || true`,
      `nohup t3 start --mode web --port ${port} --host 127.0.0.1 --no-browser --auto-bootstrap-project-from-cwd ${sq(workDir)} >/tmp/t3code.log 2>&1 </dev/null &`,
      `sleep 1.2`,
      `cat /tmp/t3code.log | tail -n 25`,
    ].join("\n");

    try {
      const res = await appRuntime.runPromise(
        Effect.either(Effect.flatMap(VmService, (v) => v.execShell(cmd)))
      );
      if (res._tag === "Left") throw new Error(String(res.left));

      const url = await appRuntime.runPromise(
        Effect.gen(function* () {
          const vm = yield* VmService;
          yield* Effect.promise(() => vm.previewRelay.ready());
          return vm.previewRelay.previewUrl(port, "/");
        })
      );

      this.setState({
        status: "running",
        embedUrl: url,
        logs: res.right.stdout || this.state.logs,
        error: null,
      });
      await this.refreshProbe();
      wmStore.pushToast("T3 Code En Ligne", `Harnais démarré sur :${port} (${workDir})`, "success");
      return { ok: true, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ status: "error", error: msg });
      wmStore.pushToast("Erreur Démarrage T3 Code", msg.slice(0, 140), "error");
      return { ok: false, error: msg };
    }
  }

  public async stopVmDaemon(): Promise<void> {
    await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (v) =>
          v.execShell(`pkill -f "t3 start" 2>/dev/null || pkill -f "/opt/t3code/t3" 2>/dev/null || true`)
        )
      )
    );
    this.setState({ status: "stopped", pid: null, embedUrl: null });
    this.pushReactiveSignals();
    wmStore.pushToast("T3 Code Arrêté", "Daemon Linux stoppé proprement.", "info");
  }

  public async addProject(dir: string): Promise<{ ok: boolean; output?: string }> {
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (v) =>
          v.execShell(`T3CODE_HOME="$HOME/.t3" t3 project add ${sq(dir)} 2>&1`)
        )
      )
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Projet T3 Code Ajouté", dir, "success");
      return { ok: true, output: res.right.stdout };
    }
    return { ok: false, output: String(res.left) };
  }
}

export const t3CodeStore = new T3CodeStore();

export function useT3Code(): T3CodeState {
  return useSyncExternalStore(t3CodeStore.subscribe, t3CodeStore.getSnapshot);
}
