import { Effect } from "effect";
import { useSyncExternalStore } from "react";
import { appRuntime, VmService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

export interface WorkflowStep {
  readonly kind: "shell" | "os-api";
  readonly command?: string;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

export interface WorkflowDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: "manual" | "interval" | "port-detected";
  readonly intervalSec?: number;
  readonly enabled: boolean;
  readonly steps: readonly WorkflowStep[];
  readonly lastRunAt?: number;
  readonly lastOutput?: string;
  readonly lastOk?: boolean;
}

const STORAGE_KEY = "unkernelos:workflows:v1";

const DEFAULT_WORKFLOWS: WorkflowDef[] = [
  {
    id: "wf-dev-split",
    name: "Auto-Dev Workspace Layout",
    description: "Arranges Code IDE + Live Web Preview side-by-side and sends a ready toast",
    trigger: "manual",
    enabled: true,
    steps: [
      { kind: "os-api", method: "wm.tile", params: { layout: "focus-ide-preview" } },
      {
        kind: "os-api",
        method: "system.notify",
        params: { title: "Dev Layout Ready", message: "IDE + Web Preview tiled side-by-side.", level: "success" },
      },
    ],
  },
  {
    id: "wf-disk-sync",
    name: "Linux Disk Health & IndexedDB Sync",
    description: "Checks persistent ext4 free space and flushes all dirty blocks to IndexedDB",
    trigger: "manual",
    enabled: true,
    steps: [
      { kind: "shell", command: "df -h / /data 2>/dev/null || df -h" },
      { kind: "os-api", method: "system.syncDisk", params: {} },
      {
        kind: "os-api",
        method: "system.notify",
        params: { title: "Disk Synced", message: "Persistent ext4 disk flushed to IndexedDB.", level: "info" },
      },
    ],
  },
  {
    id: "wf-env-audit",
    name: "Workspace & Toolchain Audit",
    description: "Inspects active project git status, Bun/Node/Claude/Pi versions & listening ports",
    trigger: "manual",
    enabled: true,
    steps: [
      {
        kind: "shell",
        command: `export PATH="/run/kw/bin:$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"; echo "CWD: $(pwd)"; git status -sb 2>/dev/null || echo "Not a git repo"; for t in bun node python3 git gh claude pi osctl; do printf "%-8s %s\\n" "$t:" "$(command -v $t || echo missing)"; done`,
      },
      { kind: "os-api", method: "system.info", params: {} },
    ],
  },
];

function loadWorkflows(): WorkflowDef[] {
  if (typeof localStorage === "undefined") return DEFAULT_WORKFLOWS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKFLOWS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WORKFLOWS;
  } catch {
    return DEFAULT_WORKFLOWS;
  }
}

function saveWorkflows(list: readonly WorkflowDef[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

type OsExecutor = (
  method: string,
  params?: Record<string, unknown>,
  meta?: { source: "guest-cli" | "mcp" | "ui" | "window-api" }
) => Promise<unknown>;

class WorkflowsStore {
  private workflows: readonly WorkflowDef[] = loadWorkflows();
  private listeners = new Set<() => void>();
  private osExecutor: OsExecutor | null = null;
  private schedulerTimer: number | null = null;
  private seenPorts = new Set<number>();

  public setOsExecutor(fn: OsExecutor): void {
    this.osExecutor = fn;
  }

  public startScheduler(): () => void {
    if (this.schedulerTimer !== null) return () => {};
    this.schedulerTimer = window.setInterval(() => {
      const now = Date.now();
      for (const wf of this.workflows) {
        if (!wf.enabled || wf.trigger !== "interval") continue;
        const ms = Math.max(15, wf.intervalSec ?? 60) * 1000;
        if (!wf.lastRunAt || now - wf.lastRunAt >= ms) {
          void this.run(wf.id).catch(() => {});
        }
      }
    }, 5000);
    return () => {
      if (this.schedulerTimer !== null) {
        window.clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
      }
    };
  }

  public handlePortsChanged(ports: readonly { port: number }[]): void {
    const newlyOpened = ports.filter((p) => !this.seenPorts.has(p.port));
    this.seenPorts = new Set(ports.map((p) => p.port));
    if (newlyOpened.length === 0) return;
    for (const wf of this.workflows) {
      if (wf.enabled && wf.trigger === "port-detected") {
        void this.run(wf.id).catch(() => {});
      }
    }
  }

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): readonly WorkflowDef[] => this.workflows;

  private emit(): void {
    saveWorkflows(this.workflows);
    for (const fn of this.listeners) fn();
  }

  public create(def: Omit<WorkflowDef, "id">): WorkflowDef {
    const wf: WorkflowDef = {
      ...def,
      id: `wf-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.workflows = [wf, ...this.workflows];
    this.emit();
    return wf;
  }

  public remove(id: string): void {
    this.workflows = this.workflows.filter((w) => w.id !== id);
    this.emit();
  }

  public toggleEnabled(id: string): void {
    this.workflows = this.workflows.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    this.emit();
  }

  public async run(id: string): Promise<{ ok: boolean; output: string }> {
    const wf = this.workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`Workflow '${id}' not found`);

    const logs: string[] = [];
    let ok = true;
    const cwd = wmStore.getSnapshot().activeWorkspaceDir || "/home/user/workspace";
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

    for (let i = 0; i < wf.steps.length; i++) {
      const step = wf.steps[i]!;
      if (step.kind === "shell" && step.command) {
        const res = await appRuntime.runPromise(
          Effect.either(
            Effect.flatMap(VmService, (vm) =>
              vm.execShell(`mkdir -p ${sq(cwd)} && cd ${sq(cwd)} && ${step.command}`)
            )
          )
        );
        if (res._tag === "Right") {
          logs.push(`[Step ${i + 1} shell exit=${res.right.exitCode}]\n${res.right.stdout || res.right.stderr || "(ok)"}`);
          if (res.right.exitCode !== 0) ok = false;
        } else {
          ok = false;
          logs.push(`[Step ${i + 1} shell ERROR] ${String(res.left)}`);
        }
      } else if (step.kind === "os-api" && step.method && this.osExecutor) {
        try {
          const r = await this.osExecutor(step.method, step.params ?? {}, { source: "ui" });
          logs.push(`[Step ${i + 1} ${step.method}]\n${JSON.stringify(r, null, 2)}`);
        } catch (err) {
          ok = false;
          logs.push(`[Step ${i + 1} ${step.method} ERROR] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const output = logs.join("\n\n");
    this.workflows = this.workflows.map((w) =>
      w.id === id ? { ...w, lastRunAt: Date.now(), lastOutput: output, lastOk: ok } : w
    );
    this.emit();
    return { ok, output };
  }
}

export const workflowsStore = new WorkflowsStore();

export function useWorkflows(): readonly WorkflowDef[] {
  return useSyncExternalStore(workflowsStore.subscribe, workflowsStore.getSnapshot);
}
