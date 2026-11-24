import { Context, Effect, Layer, SubscriptionRef } from "effect";
import { ToolchainError } from "./errors.ts";
import { VmService } from "./vm-service.ts";

export type ToolId =
  | "git"
  | "gh"
  | "python"
  | "pip"
  | "node"
  | "bun"
  | "claude"
  | "pi"
  | "mesa"
  | "wayland-apps";

export type ToolStatusKind = "unknown" | "missing" | "installing" | "installed" | "error";

export interface ToolSpec {
  readonly id: ToolId;
  readonly name: string;
  readonly category: "vcs" | "runtime" | "agent" | "graphics";
  readonly description: string;
  readonly approxSize: string;
  readonly debianOnly?: boolean;
  readonly checkCmd: string;
  readonly versionCmd: string;
  readonly installDebian: string;
  readonly installAlpine: string;
}

export interface ToolState {
  readonly id: ToolId;
  readonly status: ToolStatusKind;
  readonly version: string | null;
  readonly error: string | null;
}

export const TOOLCHAIN_SPECS: readonly ToolSpec[] = [
  {
    id: "git",
    name: "Git",
    category: "vcs",
    description: "Distributed version control system + curl/ca-certificates",
    approxSize: "~8 MB",
    checkCmd: "command -v git",
    versionCmd: "git --version",
    installDebian: "sudo apt-get update && sudo apt-get install -y git ca-certificates curl",
    installAlpine: "sudo apk add --no-cache git ca-certificates curl",
  },
  {
    id: "gh",
    name: "GitHub CLI (gh)",
    category: "vcs",
    description: "Create repos, manage PRs, configure & deploy GitHub Pages",
    approxSize: "~14 MB",
    checkCmd: "command -v gh",
    versionCmd: "gh --version | head -n1",
    installDebian: "sudo apt-get update && sudo apt-get install -y gh",
    installAlpine: "sudo apk add --no-cache github-cli",
  },
  {
    id: "python",
    name: "Python 3",
    category: "runtime",
    description: "Python 3 interpreter & standard library (aarch64 native)",
    approxSize: "~18 MB",
    checkCmd: "command -v python3",
    versionCmd: "python3 --version",
    installDebian: "sudo apt-get update && sudo apt-get install -y python3 python3-venv",
    installAlpine: "sudo apk add --no-cache python3",
  },
  {
    id: "pip",
    name: "pip (Python Package Installer)",
    category: "runtime",
    description: "Install Python packages & frameworks (FastAPI, Flask, etc.)",
    approxSize: "~6 MB",
    checkCmd: "command -v pip3 || python3 -m pip --version",
    versionCmd: "python3 -m pip --version 2>/dev/null || pip3 --version",
    installDebian: "sudo apt-get update && sudo apt-get install -y python3-pip",
    installAlpine: "sudo apk add --no-cache py3-pip",
  },
  {
    id: "node",
    name: "Node.js + npm",
    category: "runtime",
    description: "Official aarch64 Node.js LTS & npm (via unkernel shim)",
    approxSize: "~63 MB",
    checkCmd: '[ -x "$HOME/.local/bin/node" ] || command -v node | grep -vq "/usr/lib/kw/bin"',
    versionCmd: "node --version",
    installDebian: "node --version && npm --version",
    installAlpine: "node --version && npm --version",
  },
  {
    id: "bun",
    name: "Bun",
    category: "runtime",
    description: "Fast JS/TS runtime, bundler & package manager (aarch64)",
    approxSize: "~50 MB",
    checkCmd: '[ -x "/usr/local/bin/bun" ] || [ -x "$HOME/.local/bin/bun" ] || [ -x "$HOME/.bun/bin/bun" ]',
    versionCmd: 'PATH="/usr/local/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun --version',
    installDebian: 'bun --version',
    installAlpine: 'bun --version',
  },
  {
    id: "claude",
    name: "Claude Code",
    category: "agent",
    description: "Anthropic's autonomous coding agent CLI (~360 MB unpacked)",
    approxSize: "~130 MB dl",
    checkCmd: '[ -x "/usr/local/bin/claude" ] || [ -x "$HOME/.local/bin/claude" ]',
    versionCmd: 'PATH="/usr/local/bin:$HOME/.local/bin:$PATH" claude --version',
    installDebian: 'claude --version',
    installAlpine: 'claude --version',
  },
  {
    id: "pi",
    name: "Pi Coding Agent",
    category: "agent",
    description: "@earendil-works/pi-coding-agent installed globally via Bun",
    approxSize: "~15 MB",
    checkCmd: 'PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" command -v pi',
    versionCmd: 'PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" pi --version 2>/dev/null || echo "installed"',
    installDebian:
      'PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun --version && PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun add -g --ignore-scripts @earendil-works/pi-coding-agent',
    installAlpine:
      'PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun --version && PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun add -g --ignore-scripts @earendil-works/pi-coding-agent',
  },
  {
    id: "mesa",
    name: "Mesa VirGL + OpenGL ES Tools",
    category: "graphics",
    description: "Hardware 3D acceleration (/dev/dri) + eglinfo + kmscube",
    approxSize: "~45 MB",
    debianOnly: true,
    checkCmd: "command -v eglinfo && command -v kmscube",
    versionCmd: "eglinfo -B -p gbm 2>/dev/null | grep -i renderer | head -n1 || echo 'Mesa installed'",
    installDebian: "sudo apt-get update && sudo apt-get install -y mesa-utils libegl-mesa0 libgles2 kmscube",
    installAlpine: "echo 'Guest GL (Mesa VirGL) requires Debian distro' >&2; exit 1",
  },
  {
    id: "wayland-apps",
    name: "Wayland GUI Suite (foot, Thunar)",
    category: "graphics",
    description: "Native Linux desktop apps rendered via wland compositor",
    approxSize: "~35 MB",
    debianOnly: true,
    checkCmd: "command -v foot",
    versionCmd: "foot --version",
    installDebian: "sudo apt-get update && sudo apt-get install -y foot fonts-dejavu-core galculator",
    installAlpine: "echo 'Wayland wland compositor requires Debian distro' >&2; exit 1",
  },
];

export const CORE_DEV_STACK: readonly ToolId[] = [
  "git",
  "gh",
  "python",
  "pip",
  "node",
  "bun",
  "claude",
  "pi",
];

export interface ToolchainSnapshot {
  readonly tools: Record<ToolId, ToolState>;
  readonly logs: readonly string[];
  readonly busy: boolean;
}

const initialTools = (): Record<ToolId, ToolState> => {
  const out = {} as Record<ToolId, ToolState>;
  for (const t of TOOLCHAIN_SPECS) {
    out[t.id] = { id: t.id, status: "unknown", version: null, error: null };
  }
  return out;
};

export interface ToolchainApi {
  readonly stateRef: SubscriptionRef.SubscriptionRef<ToolchainSnapshot>;
  readonly refreshAll: () => Effect.Effect<void>;
  readonly installTool: (id: ToolId) => Effect.Effect<void, ToolchainError>;
  readonly installStack: (ids?: readonly ToolId[]) => Effect.Effect<void, ToolchainError>;
  readonly clearLogs: () => Effect.Effect<void>;
}

export class ToolchainService extends Context.Tag("ToolchainService")<
  ToolchainService,
  ToolchainApi
>() {}

export const ToolchainLive = Layer.effect(
  ToolchainService,
  Effect.gen(function* () {
    const vm = yield* VmService;
    const stateRef = yield* SubscriptionRef.make<ToolchainSnapshot>({
      tools: initialTools(),
      logs: [],
      busy: false,
    });

    const log = (line: string) =>
      SubscriptionRef.update(stateRef, (s) => ({
        ...s,
        logs: [...s.logs.slice(-249), line],
      }));

    const setTool = (id: ToolId, patch: Partial<ToolState>) =>
      SubscriptionRef.update(stateRef, (s) => ({
        ...s,
        tools: {
          ...s.tools,
          [id]: { ...s.tools[id], ...patch },
        },
      }));

    const detectDistro = Effect.gen(function* () {
      const res = yield* vm.execShell("cat /usr/lib/kw-distro 2>/dev/null || echo alpine").pipe(
        Effect.either
      );
      if (res._tag === "Right") {
        const d = res.right.stdout.trim();
        if (d === "debian" || d === "alpine") return d;
      }
      return "debian";
    });

    const checkOne = (spec: ToolSpec) =>
      Effect.gen(function* () {
        const check = yield* vm
          .execShell(`export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"; ${spec.checkCmd} >/dev/null 2>&1`)
          .pipe(Effect.either);

        if (check._tag === "Right" && check.right.exitCode === 0) {
          const ver = yield* vm
            .execShell(`export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"; ${spec.versionCmd} 2>/dev/null`)
            .pipe(Effect.either);
          const versionStr =
            ver._tag === "Right" && ver.right.stdout.trim()
              ? ver.right.stdout.trim().split("\n")[0]!.slice(0, 64)
              : "installed";
          yield* setTool(spec.id, { status: "installed", version: versionStr, error: null });
        } else {
          yield* setTool(spec.id, { status: "missing", version: null, error: null });
        }
      });

    const refreshAll = () =>
      Effect.gen(function* () {
        for (const spec of TOOLCHAIN_SPECS) {
          yield* checkOne(spec);
        }
      });

    const installTool = (id: ToolId): Effect.Effect<void, ToolchainError> =>
      Effect.gen(function* () {
        const spec = TOOLCHAIN_SPECS.find((t) => t.id === id);
        if (!spec) {
          return yield* Effect.fail(new ToolchainError({ tool: id, message: "Unknown tool" }));
        }
        const distro = yield* detectDistro;
        if (spec.debianOnly && distro !== "debian") {
          const msg = `${spec.name} requires Debian (current distro: ${distro}). Switch distro in Settings.`;
          yield* setTool(id, { status: "error", error: msg });
          yield* log(`[error] ${msg}`);
          return yield* Effect.fail(new ToolchainError({ tool: id, message: msg }));
        }

        yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, busy: true }));
        yield* setTool(id, { status: "installing", error: null });
        const cmd = distro === "debian" ? spec.installDebian : spec.installAlpine;
        yield* log(`\n$ # Installing ${spec.name} (${distro})`);
        yield* log(`$ ${cmd}`);

        const result = yield* vm
          .execShell(`export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"; ${cmd}`)
          .pipe(
            Effect.mapError(
              (e) =>
                new ToolchainError({
                  tool: id,
                  message: "stderr" in e ? e.stderr : `VM error: ${e._tag}`,
                  cause: e,
                })
            )
          );

        if (result.stdout.trim()) {
          for (const l of result.stdout.trim().split("\n").slice(-20)) {
            yield* log(l);
          }
        }
        if (result.stderr.trim()) {
          for (const l of result.stderr.trim().split("\n").slice(-12)) {
            yield* log(`[stderr] ${l}`);
          }
        }

        if (result.exitCode !== 0) {
          const errMsg = result.stderr.trim() || `Exit code ${result.exitCode}`;
          yield* setTool(id, { status: "error", error: errMsg });
          yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, busy: false }));
          return yield* Effect.fail(new ToolchainError({ tool: id, message: errMsg }));
        }

        yield* checkOne(spec);
        yield* vm.syncDisk();
        yield* vm.syncCredentials();
        yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, busy: false }));
        yield* vm.notify("Toolchain Installed", `${spec.name} is ready.`, "success");
      });

    const installStack = (ids: readonly ToolId[] = CORE_DEV_STACK): Effect.Effect<void, ToolchainError> =>
      Effect.gen(function* () {
        yield* log(`=== Installing Full Dev Stack (${ids.join(", ")}) ===`);
        for (const id of ids) {
          const cur = (yield* SubscriptionRef.get(stateRef)).tools[id];
          if (cur?.status === "installed") {
            yield* log(`[skip] ${id} already installed (${cur.version})`);
            continue;
          }
          yield* installTool(id).pipe(
            Effect.catchAll((err) => log(`[warn] Failed installing ${id}: ${err.message}`))
          );
        }
        yield* log("=== Stack installation complete ===");
      });

    return {
      stateRef,
      refreshAll,
      installTool,
      installStack,
      clearLogs: () => SubscriptionRef.update(stateRef, (s) => ({ ...s, logs: [] })),
    };
  })
);
