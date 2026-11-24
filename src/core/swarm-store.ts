import { useSyncExternalStore } from "react";

export interface SwarmWorker {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly harness: "claude" | "pi" | "shell";
  readonly cwd: string;
  readonly status: "idle" | "running" | "done";
  readonly initialCommand?: string;
}

export interface SwarmTask {
  readonly id: string;
  readonly title: string;
  readonly assignee: string;
  readonly status: "todo" | "doing" | "done";
  readonly createdAt: number;
}

export interface SwarmMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly text: string;
  readonly timestamp: number;
}

export interface SwarmState {
  readonly workers: readonly SwarmWorker[];
  readonly tasks: readonly SwarmTask[];
  readonly messages: readonly SwarmMessage[];
}

const DEFAULT_SWARM: SwarmState = {
  workers: [
    {
      id: "agent-frontend",
      name: "Frontend",
      role: "UI / WebGPU / CSS",
      harness: "claude",
      cwd: "/home/user/workspace/my-ai-app",
      status: "idle",
    },
    {
      id: "agent-backend",
      name: "Backend",
      role: "Bun API / Tests / CLI",
      harness: "pi",
      cwd: "/home/user/workspace/my-ai-app",
      status: "idle",
    },
  ],
  tasks: [
    {
      id: "t-1",
      title: "Scaffold UI & responsive layout",
      assignee: "Frontend",
      status: "todo",
      createdAt: Date.now(),
    },
    {
      id: "t-2",
      title: "Build API endpoints & verify curl 200",
      assignee: "Backend",
      status: "todo",
      createdAt: Date.now(),
    },
  ],
  messages: [
    {
      id: "m-init",
      from: "coordinator",
      to: "all",
      text: "Swarm bus active. Agents can post updates via `osctl call swarm.post '{\"from\":\"Frontend\",\"to\":\"all\",\"text\":\"Ready!\"}'`.",
      timestamp: Date.now(),
    },
  ],
};

class SwarmStore {
  private state: SwarmState = DEFAULT_SWARM;
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): SwarmState => this.state;

  private setState(updater: (prev: SwarmState) => SwarmState): void {
    this.state = updater(this.state);
    for (const fn of this.listeners) fn();
  }

  public addWorker(w: Omit<SwarmWorker, "id" | "status">): SwarmWorker {
    const worker: SwarmWorker = {
      ...w,
      id: `agent-${Math.random().toString(36).slice(2, 7)}`,
      status: "idle",
    };
    this.setState((s) => ({ ...s, workers: [...s.workers, worker] }));
    return worker;
  }

  public removeWorker(id: string): void {
    this.setState((s) => ({
      ...s,
      workers: s.workers.length > 1 ? s.workers.filter((w) => w.id !== id) : s.workers,
    }));
  }

  public setWorkerStatus(id: string, status: SwarmWorker["status"]): void {
    this.setState((s) => ({
      ...s,
      workers: s.workers.map((w) => (w.id === id ? { ...w, status } : w)),
    }));
  }

  public loadPreset(preset: "fullstack" | "trio", baseDir: string): void {
    if (preset === "trio") {
      this.setState((s) => ({
        ...s,
        workers: [
          { id: `w-arch-${Date.now().toString(36)}`, name: "Architect", role: "Specs & Core", harness: "claude", cwd: baseDir, status: "idle" },
          { id: `w-build-${Date.now().toString(36)}`, name: "Builder", role: "Implementation", harness: "pi", cwd: baseDir, status: "idle" },
          { id: `w-qa-${Date.now().toString(36)}`, name: "QA Runner", role: "Tests & Server", harness: "shell", cwd: baseDir, status: "idle" },
        ],
      }));
      return;
    }
    this.setState((s) => ({
      ...s,
      workers: [
        { id: `w-fe-${Date.now().toString(36)}`, name: "Frontend", role: "UI / UX / WebGPU", harness: "claude", cwd: baseDir, status: "idle" },
        { id: `w-be-${Date.now().toString(36)}`, name: "Backend", role: "API / DB / Deploy", harness: "pi", cwd: baseDir, status: "idle" },
      ],
    }));
  }

  public addTask(title: string, assignee = "all"): SwarmTask {
    const task: SwarmTask = {
      id: `t-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim(),
      assignee: assignee || "all",
      status: "todo",
      createdAt: Date.now(),
    };
    this.setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    return task;
  }

  public moveTask(id: string, status: SwarmTask["status"]): void {
    this.setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  }

  public removeTask(id: string): void {
    this.setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  }

  public postMessage(from: string, to: string, text: string): SwarmMessage {
    const msg: SwarmMessage = {
      id: `m-${Math.random().toString(36).slice(2, 8)}`,
      from: from || "agent",
      to: to || "all",
      text,
      timestamp: Date.now(),
    };
    this.setState((s) => ({ ...s, messages: [msg, ...s.messages].slice(0, 80) }));
    return msg;
  }
}

export const swarmStore = new SwarmStore();

export function useSwarm(): SwarmState {
  return useSyncExternalStore(swarmStore.subscribe, swarmStore.getSnapshot);
}
