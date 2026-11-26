import { getCompanionConfig } from "./companion-config.ts";
import { Context, Effect, Fiber, Layer, PubSub, Schedule, SubscriptionRef } from "effect";
import {
  checkSupport,
  ConsoleRouter,
  createKernel,
  dataDiskStore,
  DEFAULT_WISP_SERVERS,
  encodeKwsparse,
  importDataDisk,
  resetDataDisk,
  serveWasiPrograms,
  webCpuBlocker,
  type CreateKernelOptions,
  type DisplayMode,
  type ExecOptions,
  type ExecResult,
  type GlRendererStatus,
  type InputState,
  type InstanceStats,
  type KernelHandle,
  type KernelSnapshot,
  type NetSpec,
  type Pty,
  type PtyOptions,
  type SupportReport,
  type WasiExecServer,
  type DataDiskSpec,
} from "unkernel";
import { GuestAudioEngine } from "./audio-engine.ts";
import { GuestExecError, KernelBootError, KernelNotRunningError } from "./errors.ts";
import { GuestPreviewRelay } from "./preview-service.ts";
import type { CredentialsConfig, UnkernelConfig } from "./schema.ts";
import { SettingsService } from "./settings.ts";

export type VmPhase = "idle" | "booting" | "running" | "suspended" | "stopped" | "error";

export interface DetectedPort {
  readonly port: number;
  readonly process?: string;
}

export interface OsEvent {
  readonly _tag: "OpenPreview" | "Notify" | "DisplayMode" | "PortsChanged" | "BootLog";
  readonly payload: unknown;
}

export interface VmState {
  readonly phase: VmPhase;
  readonly bootStage: string;
  readonly bootProgress: number; // 0..100
  readonly error: string | null;
  readonly support: SupportReport | null;
  readonly crossOriginIsolated: boolean;
  readonly webgpuAvailable: boolean;
  readonly distro: string;
  readonly cpus: number;
  readonly memoryMiB: number;
  readonly transport: string;
  readonly stats: InstanceStats | null;
  readonly glStatus: GlRendererStatus | null;
  readonly displayMode: DisplayMode | null;
  readonly inputState: InputState;
  readonly detectedPorts: readonly DetectedPort[];
  readonly kernelLogs: readonly string[];
  readonly hasSnapshot: boolean;
  readonly audioMuted: boolean;
  readonly wispActiveUrl: string;
}

const INITIAL_VM_STATE: VmState = {
  phase: "idle",
  bootStage: "Ready to initialize",
  bootProgress: 0,
  error: null,
  support: null,
  crossOriginIsolated: typeof self !== "undefined" ? Boolean(self.crossOriginIsolated) : false,
  webgpuAvailable: typeof navigator !== "undefined" && "gpu" in navigator,
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
};

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export interface VmApi {
  readonly stateRef: SubscriptionRef.SubscriptionRef<VmState>;
  readonly events: PubSub.PubSub<OsEvent>;
  readonly previewRelay: GuestPreviewRelay;
  readonly audioEngine: GuestAudioEngine;
  readonly getHandle: () => KernelHandle | null;
  readonly boot: (override?: Partial<UnkernelConfig>) => Effect.Effect<void, KernelBootError>;
  readonly reboot: () => Effect.Effect<void, KernelBootError>;
  readonly stop: () => Effect.Effect<void>;
  readonly suspend: () => Effect.Effect<void, KernelNotRunningError | KernelBootError>;
  readonly resume: () => Effect.Effect<void, KernelBootError>;
  readonly exec: (
    file: string,
    args?: string[],
    opts?: ExecOptions
  ) => Effect.Effect<ExecResult, KernelNotRunningError | GuestExecError>;
  readonly execShell: (
    script: string,
    opts?: ExecOptions
  ) => Effect.Effect<ExecResult, KernelNotRunningError | GuestExecError>;
  readonly spawnPty: (
    file?: string,
    args?: string[],
    opts?: PtyOptions
  ) => Effect.Effect<Pty, KernelNotRunningError | GuestExecError>;
  readonly syncCredentials: (creds?: CredentialsConfig) => Effect.Effect<void>;
  readonly syncDisk: () => Effect.Effect<boolean>;
  readonly exportDataDiskImage: () => Effect.Effect<Uint8Array, KernelBootError>;
  readonly importDataDiskImage: (bytes: Uint8Array) => Effect.Effect<{ size: number; blocks: number }, KernelBootError>;
  readonly resetDataDiskStorage: () => Effect.Effect<void, KernelBootError>;
  readonly toggleMute: () => Effect.Effect<boolean>;
  readonly notify: (title: string, message: string, level?: "info" | "success" | "warn" | "error") => Effect.Effect<void>;
  readonly openPreviewPort: (port: number, path?: string) => Effect.Effect<void>;
  readonly testWispLatency: (url: string) => Effect.Effect<number, KernelBootError>;
}

export class VmService extends Context.Tag("VmService")<VmService, VmApi>() {}

export const VmLive = Layer.effect(
  VmService,
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const stateRef = yield* SubscriptionRef.make<VmState>(INITIAL_VM_STATE);
    const events = yield* PubSub.unbounded<OsEvent>();
    const previewRelay = new GuestPreviewRelay();
    const audioEngine = new GuestAudioEngine();

    let handle: KernelHandle | null = null;
    let wasiServer: WasiExecServer | null = null;
    let savedSnapshot: KernelSnapshot | null = null;
    let savedBootConfig: UnkernelConfig | null = null;
    let telemetryFiber: Fiber.RuntimeFiber<void, never> | null = null;
    let portScannerFiber: Fiber.RuntimeFiber<void, never> | null = null;
    let consoleUnsub: (() => void) | null = null;

    const appendLog = (line: string) => {
      const clean = line.replace(/\r?\n$/, "");
      if (!clean) return;
      Effect.runFork(
        SubscriptionRef.update(stateRef, (s) => ({
          ...s,
          kernelLogs: [...s.kernelLogs.slice(-399), clean],
        }))
      );
    };

    const stopBackgroundFibers = Effect.gen(function* () {
      if (telemetryFiber) {
        yield* Fiber.interrupt(telemetryFiber);
        telemetryFiber = null;
      }
      if (portScannerFiber) {
        yield* Fiber.interrupt(portScannerFiber);
        portScannerFiber = null;
      }
    });

    const cleanupHandle = Effect.gen(function* () {
      yield* stopBackgroundFibers;
      if (consoleUnsub) {
        consoleUnsub();
        consoleUnsub = null;
      }
      if (wasiServer) {
        try {
          wasiServer.close();
        } catch {
          // ignore
        }
        wasiServer = null;
      }
      previewRelay.attach(null);
      if (handle) {
        const old = handle;
        handle = null;
        yield* Effect.promise(() => old.stop({ code: 0, reason: "reboot" }).catch(() => {}));
      }
    });

    const execRaw = (
      file: string,
      args: string[] = [],
      opts?: ExecOptions
    ): Effect.Effect<ExecResult, KernelNotRunningError | GuestExecError> =>
      Effect.gen(function* () {
        if (!handle) {
          return yield* Effect.fail(new KernelNotRunningError({ operation: `exec ${file}` }));
        }
        const vm = handle;
        return yield* Effect.tryPromise({
          try: () =>
            vm.exec(
              file,
              args,
              opts as (ExecOptions & { encoding?: "utf8" }) | undefined
            ) as Promise<ExecResult>,
          catch: (cause) =>
            new GuestExecError({
              command: [file, ...args].join(" "),
              exitCode: -1,
              stderr: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        });
      });

    const execShell = (
      script: string,
      opts?: ExecOptions
    ): Effect.Effect<ExecResult, KernelNotRunningError | GuestExecError> =>
      execRaw("/bin/sh", ["-c", script], opts);

    const syncCredentials = (overrideCreds?: CredentialsConfig) =>
      Effect.gen(function* () {
        if (!handle) return;
        const creds = overrideCreds ?? (yield* settings.getCredentials);
        const lines: string[] = [
          "# Generated by unkernelOS (browser-local settings)",
          'export PATH="/run/kw/bin:$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"',
          'export TERM="xterm-256color"',
          'export COLORTERM="truecolor"',
          'export BROWSER="$HOME/.local/bin/unkernel-open"',
        ];
        if (creds.anthropicApiKey) lines.push(`export ANTHROPIC_API_KEY=${shellQuote(creds.anthropicApiKey)}`);
        if (creds.openaiApiKey) lines.push(`export OPENAI_API_KEY=${shellQuote(creds.openaiApiKey)}`);
        if (creds.geminiApiKey) lines.push(`export GEMINI_API_KEY=${shellQuote(creds.geminiApiKey)}`);
        if (creds.openrouterApiKey) lines.push(`export OPENROUTER_API_KEY=${shellQuote(creds.openrouterApiKey)}`);
        if (creds.githubToken) {
          lines.push(`export GH_TOKEN=${shellQuote(creds.githubToken)}`);
          lines.push(`export GITHUB_TOKEN=${shellQuote(creds.githubToken)}`);
        }

        const envContent = `${lines.join("\n")}\n`;
        const gitCmds: string[] = [];
        if (creds.gitUserName) {
          gitCmds.push(`command -v git >/dev/null 2>&1 && git config --global user.name ${shellQuote(creds.gitUserName)} || true`);
        }
        if (creds.gitUserEmail) {
          gitCmds.push(`command -v git >/dev/null 2>&1 && git config --global user.email ${shellQuote(creds.gitUserEmail)} || true`);
        }
        if (creds.githubToken) {
          gitCmds.push(
            `command -v git >/dev/null 2>&1 && git config --global url."https://x-access-token:${creds.githubToken.replace(/"/g, "")}@github.com/".insteadOf "https://github.com/" || true`
          );
        }

        const script = [
          `mkdir -p "$HOME/workspace" "$HOME/.local/bin"`,
          `cat <<'UNKERNEL_OPEN_EOF' > "$HOME/.local/bin/unkernel-open"`,
          `#!/bin/sh`,
          `URL="$1"`,
          `[ -z "$URL" ] && exit 0`,
          `if [ -w /dev/tty ]; then`,
          `  printf '\\033]9999;open;%s\\007' "$URL" > /dev/tty 2>/dev/null || printf '\\033]9999;open;%s\\007' "$URL"`,
          `else`,
          `  printf '\\033]9999;open;%s\\007' "$URL"`,
          `fi`,
          `UNKERNEL_OPEN_EOF`,
          `chmod +x "$HOME/.local/bin/unkernel-open"`,
          `cp -f "$HOME/.local/bin/unkernel-open" /tmp/unkernel-open 2>/dev/null && chmod +x /tmp/unkernel-open 2>/dev/null || true`,
          `ln -sf "$HOME/.local/bin/unkernel-open" "$HOME/.local/bin/xdg-open"`,
          `cat <<'UNKERNEL_ENV_EOF' > "$HOME/.unkernelos_env"`,
          envContent,
          `UNKERNEL_ENV_EOF`,
          `chmod 600 "$HOME/.unkernelos_env"`,
          `for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.ashrc"; do`,
          `  touch "$rc"`,
          `  grep -q '.unkernelos_env' "$rc" || printf '\\n[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"\\n' >> "$rc"`,
          `done`,
          ...gitCmds,
        ].join("\n");

        yield* execShell(script).pipe(Effect.ignore);
      });

    const startBackgroundFibers = Effect.gen(function* () {
      yield* stopBackgroundFibers;

      // 1. Telemetry fiber (1s cadence)
      telemetryFiber = yield* Effect.forkDaemon(
        Effect.repeat(
          Effect.sync(() => {
            if (!handle) return;
            try {
              const stats = handle.stats();
              const glStatus = handle.gl?.status ?? null;
              Effect.runFork(
                SubscriptionRef.update(stateRef, (s) => ({
                  ...s,
                  stats,
                  glStatus,
                  cpus: stats.cpus || s.cpus,
                }))
              );
            } catch {
              // ignore transient stats error during shutdown
            }
          }),
          Schedule.spaced("1 second")
        ).pipe(Effect.asVoid)
      );

      // 2. Port scanner fiber (every 3s, scans /proc/net/tcp & /proc/net/tcp6 for listening ports)
      portScannerFiber = yield* Effect.forkDaemon(
        Effect.repeat(
          Effect.gen(function* () {
            if (!handle) return;
            const res = yield* execShell(
              `awk 'NR>1 && $4=="0A" { split($2,a,":"); printf "%d\\n", strtonum("0x" a[2]) }' /proc/net/tcp /proc/net/tcp6 2>/dev/null || awk 'NR>1 && $4=="0A" { split($2,a,":"); print a[2] }' /proc/net/tcp /proc/net/tcp6 2>/dev/null`
            ).pipe(Effect.either);

            if (res._tag === "Right" && res.right.exitCode === 0) {
              const ports = new Set<number>();
              for (const raw of res.right.stdout.split(/\s+/)) {
                const line = raw.trim();
                if (!line) continue;
                const val = /^[0-9]+$/.test(line) ? Number(line) : parseInt(line, 16);
                if (val > 0 && val < 65536 && val !== 22 && val !== 53) {
                  ports.add(val);
                }
              }
              const list: DetectedPort[] = Array.from(ports)
                .sort((a, b) => a - b)
                .map((port) => ({ port }));

              const cur = yield* SubscriptionRef.get(stateRef);
              const same =
                cur.detectedPorts.length === list.length &&
                cur.detectedPorts.every((p, i) => p.port === list[i]?.port);

              if (!same) {
                yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, detectedPorts: list }));
                yield* PubSub.publish(events, { _tag: "PortsChanged", payload: list });
              }
            }
          }),
          Schedule.spaced("3 seconds")
        ).pipe(Effect.asVoid)
      );
    });

    const buildKernelOptions = (cfg: UnkernelConfig, restore?: KernelSnapshot): CreateKernelOptions & { worker?: boolean; shared?: boolean } => {
      const canWorker = cfg.worker && typeof Worker !== "undefined";
      const cpuBlocker = webCpuBlocker({ worker: canWorker });
      const effectiveCpus = !cpuBlocker && canWorker
        ? Math.max(1, Math.min(cfg.cpus, navigator.hardwareConcurrency || 4, 16))
        : 1;

      const isDebian = cfg.distro === "debian";
      const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
      const distroUrl =
        cfg.distro === "none"
          ? undefined
          : new URL(`${base}distros/${cfg.distro}.erofs`, window.location.href).href;

      const cmdParts: string[] = [];
      if (cfg.safeMode) cmdParts.push("kw.root=initramfs");
      if (cfg.wayland && isDebian) cmdParts.push("kw.wayland=1");
      if (cfg.gl && isDebian && !cfg.gpu) cmdParts.push("kw.gl=1");
      if (cfg.cmdlineAppend.trim()) cmdParts.push(cfg.cmdlineAppend.trim());

      const localCompanion = getCompanionConfig();
      const wispServers = localCompanion ? [localCompanion.wispUrl] : cfg.wispUrl.trim()
        ? cfg.wispUrl.split(",").map((s) => s.trim()).filter(Boolean)
        : [...DEFAULT_WISP_SERVERS];

      const netSpec: NetSpec | undefined = cfg.net
        ? {
            kind: "net",
            backend: {
              kind: "wisp",
              servers: wispServers,
            },
          }
        : undefined;

      const disks: DataDiskSpec[] = cfg.dataDisk
        ? [
            {
              kind: "data",
              template: "bundled",
              mode: "persistent",
              size: Math.max(4, Math.min(1024, cfg.dataSizeGiB)) * 1024 * 1024 * 1024,
            },
          ]
        : [];

      const opts: CreateKernelOptions & { worker?: boolean; shared?: boolean } = {
        restore,
        distro: distroUrl,
        memoryMiB: Math.max(256, Math.min(3072, cfg.memoryMiB)),
        cpus: effectiveCpus,
        jit: cfg.jit,
        worker: canWorker,
        shared: canWorker ? cfg.shared && Boolean(self.crossOriginIsolated) : false,
        disks,
        net: netSpec,
        vsock: true,
        shm: cfg.wayland || cfg.display || cfg.gpu,
        display: cfg.display ? { width: cfg.displayWidth, height: cfg.displayHeight } : false,
        gpu: cfg.gpu && isDebian,
        gl: cfg.gl && isDebian
          ? {
              eager: cfg.glEager,
              strictWaits: cfg.glStrictWaits,
            }
          : false,
        sound: cfg.sound
          ? {
              onChunk: (chunk) => audioEngine.pushChunk(chunk),
            }
          : false,
        cmdline: cmdParts.length > 0 ? undefined : undefined,
        onDisplay: (mode: DisplayMode | null) => {
          Effect.runFork(
            Effect.gen(function* () {
              yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, displayMode: mode }));
              yield* PubSub.publish(events, { _tag: "DisplayMode", payload: mode });
            })
          );
        },
        onInput: (inputState: InputState) => {
          Effect.runFork(SubscriptionRef.update(stateRef, (s) => ({ ...s, inputState })));
        },
        onDiskError: (_idx, err) => {
          const msg = err instanceof Error ? err.message : String(err);
          appendLog(`[disk error] ${msg}`);
          Effect.runFork(
            PubSub.publish(events, {
              _tag: "Notify",
              payload: { title: "Disk Flush Warning", message: msg, level: "warn" },
            })
          );
        },
        onProgress: (p) => {
          let label = "Initialisation du noyau Linux…";
          let pct = 50;

          if (p.stage === "worker") {
            label = p.jspi
              ? "Initialisation des Web Workers SMP (JSPI actif)…"
              : "Initialisation du Web Worker noyau…";
            pct = 12;
          } else if (p.stage === "download") {
            const loaded = "loaded" in p && typeof p.loaded === "number" ? p.loaded : 0;
            const total = "total" in p && typeof p.total === "number" ? p.total : 0;
            if (total > 0) {
              const mbL = (loaded / (1024 * 1024)).toFixed(1);
              const mbT = (total / (1024 * 1024)).toFixed(1);
              label = `Téléchargement unkernel.wasm (${mbL} / ${mbT} Mo)…`;
              pct = Math.round(14 + (loaded / total) * 30);
            } else {
              label = "Téléchargement du noyau unkernel.wasm…";
              pct = 26;
            }
          } else if (p.stage === "compile") {
            label = "Compilation WebAssembly du noyau Linux 7.x…";
            pct = 48;
          } else if (p.stage === "compiled") {
            const ms = "ms" in p && typeof p.ms === "number" ? Math.round(p.ms) : 0;
            const bits = "memory64" in p && p.memory64 ? "wasm64" : "wasm32";
            label = `Module ${bits} compilé (${ms} ms) — préparation mémoire…`;
            pct = 58;
          } else if (p.stage === "memory") {
            label = "Allocation RAM invité & tables de pages…";
            pct = 66;
          } else if (p.stage === "instantiate") {
            label = "Instanciation de la VM & périphériques virtio…";
            pct = 74;
          } else if (p.stage === "start") {
            label = "Démarrage Linux & montage du système EROFS…";
            pct = 84;
          } else {
            label = `Boot: ${String((p as { stage: string }).stage)}…`;
            pct = 62;
          }

          Effect.runFork(
            SubscriptionRef.update(stateRef, (s) => ({
              ...s,
              bootStage: label,
              // Never regress backwards if worker/download events interleave
              bootProgress: Math.max(s.bootProgress, pct),
            }))
          );
        },
      };

      // Preserve bundled initramfs boot command line (console=hvc0 rdinit=/init)
      if (cmdParts.length > 0) {
        opts.cmdline = `console=hvc0 rdinit=/init ${cmdParts.join(" ")}`;
      }

      // Host commands (only supported in inline mode; in worker mode we handle via vsock/CLI)
      if (!canWorker) {
        opts.commands = {
          "open-preview": async (ctx) => {
            const port = Number(ctx.args[0] || 3000);
            const path = ctx.args[1] || "/";
            if (port > 0 && port < 65536) {
              await Effect.runPromise(
                PubSub.publish(events, { _tag: "OpenPreview", payload: { port, path } })
              );
              return { stdout: `Opened unkernelOS Preview for http://localhost:${port}${path}\n`, exitCode: 0 };
            }
            return { stderr: "Usage: open-preview <port> [path]\n", exitCode: 1 };
          },
          "os-notify": async (ctx) => {
            const title = ctx.args[0] || "unkernelOS";
            const message = ctx.args.slice(1).join(" ") || "";
            await Effect.runPromise(
              PubSub.publish(events, {
                _tag: "Notify",
                payload: { title, message, level: "info" },
              })
            );
            return { exitCode: 0 };
          },
        };
      }

      return opts;
    };

    const boot = (override?: Partial<UnkernelConfig>): Effect.Effect<void, KernelBootError> =>
      Effect.gen(function* () {
        const support = yield* Effect.promise(() => checkSupport());
        const cfg = override
          ? yield* settings.updateConfig(override)
          : yield* settings.getConfig;

        yield* cleanupHandle;

        const wispDisplay = cfg.net
          ? getCompanionConfig()?.wispUrl || cfg.wispUrl.trim() || DEFAULT_WISP_SERVERS[0] || "default"
          : "offline";

        const coi = Boolean(self.crossOriginIsolated);
        const blocker = webCpuBlocker({ worker: cfg.worker && typeof Worker !== "undefined" });

        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          phase: "booting",
          bootStage: "Checking browser JSPI, SharedArrayBuffer & Web Worker support...",
          bootProgress: 8,
          error: null,
          support,
          crossOriginIsolated: coi,
          distro: cfg.distro,
          memoryMiB: cfg.memoryMiB,
          cpus: cfg.cpus,
          wispActiveUrl: wispDisplay,
          kernelLogs: [
            `[unkernelOS] Booting ${cfg.distro} (${cfg.memoryMiB} MiB RAM, target ${cfg.cpus} vCPU, worker=${cfg.worker}, COI=${coi}, JIT=${cfg.jit ? "on" : "off"}, Wisp=${wispDisplay})`,
            ...(blocker ? [`[unkernelOS] Multi-vCPU note: ${blocker}`] : [`[unkernelOS] SMP multi-vCPU ready (SharedArrayBuffer + Web Workers active)`]),
          ],
        }));

        if (!support.ok) {
          const msg = `Browser missing required capabilities: ${support.problems.join(", ")}. Chrome/Edge 137+, Firefox 153+, or Safari 27+ required.`;
          yield* SubscriptionRef.update(stateRef, (s): VmState => ({ ...s, phase: "error", error: msg }));
          return yield* Effect.fail(new KernelBootError({ stage: "support", message: msg }));
        }

        const opts = buildKernelOptions(cfg);

        const vm = yield* Effect.tryPromise({
          try: async () => {
            try {
              return await createKernel(opts as CreateKernelOptions);
            } catch (err) {
              const firstMsg = err instanceof Error ? err.message : String(err);
              // Stage 1 fallback: if multi-vCPU SMP failed, keep Web Worker mode on 1 vCPU!
              if (opts.worker && opts.cpus && opts.cpus > 1) {
                appendLog(`[unkernelOS] SMP ${opts.cpus}-vCPU boot failed (${firstMsg}), retrying 1-vCPU Web Worker...`);
                try {
                  return await createKernel({
                    ...opts,
                    cpus: 1,
                  } as CreateKernelOptions);
                } catch (err2) {
                  appendLog(`[unkernelOS] Web Worker boot failed (${err2 instanceof Error ? err2.message : String(err2)}), retrying inline 1-CPU...`);
                }
              } else if (opts.worker) {
                appendLog(`[unkernelOS] Web Worker boot failed (${firstMsg}), retrying inline 1-CPU...`);
              } else {
                throw err;
              }
              const fallbackOpts: CreateKernelOptions = {
                ...opts,
                cpus: 1,
              };
              delete (fallbackOpts as { worker?: boolean }).worker;
              delete (fallbackOpts as { shared?: boolean }).shared;
              return await createKernel(fallbackOpts);
            }
          },
          catch: (cause) =>
            new KernelBootError({
              stage: "boot",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }).pipe(
          Effect.tapError((e) =>
            SubscriptionRef.update(stateRef, (s): VmState => ({
              ...s,
              phase: "error",
              error: e.message,
              bootStage: "Boot failed",
            }))
          )
        );

        handle = vm;
        savedBootConfig = cfg;
        previewRelay.attach(vm);

        // Route kernel logs cleanly
        const router = new ConsoleRouter({
          onKernelLine: (line) => appendLog(line),
          onUserOutput: () => {},
        });
        consoleUnsub = vm.onOutput((bytes) => router.write(bytes));

        // Optional WASI offloader
        if (cfg.wasi && vm.vsock) {
          try {
            wasiServer = serveWasiPrograms(vm.vsock);
          } catch {
            // optional
          }
        }

        // Watch unexpected VM exit
        vm.exited.then((res) => {
          if (handle === vm) {
            handle = null;
            previewRelay.attach(null);
            Effect.runFork(stopBackgroundFibers);
            Effect.runFork(
              SubscriptionRef.update(stateRef, (s): VmState => ({
                ...s,
                phase: res.code === 0 ? "stopped" : "error",
                error: res.code === 0 ? null : `Kernel exited (${res.kind}, code ${res.code}): ${res.reason || ""}`,
              }))
            );
          }
        });

        const initialStats = vm.stats();
        const transport = "transport" in vm ? String((vm as { transport: string }).transport) : "inline";

        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          bootStage: "Synchronisation de l'environnement & des ponts vsock…",
          bootProgress: Math.max(s.bootProgress, 92),
          stats: initialStats,
          cpus: initialStats.cpus,
          transport,
          glStatus: vm.gl?.status ?? null,
        }));

        // Inject user credentials/env & start telemetry/port fibers
        yield* syncCredentials();

        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          bootStage: "Activation du bureau WebGPU & des services…",
          bootProgress: Math.max(s.bootProgress, 97),
        }));

        yield* startBackgroundFibers;

        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          phase: "running",
          bootStage: "Système Linux prêt",
          bootProgress: 100,
        }));
      });

    const suspend = (): Effect.Effect<void, KernelNotRunningError | KernelBootError> =>
      Effect.gen(function* () {
        if (!handle) {
          return yield* Effect.fail(new KernelNotRunningError({ operation: "suspend" }));
        }
        const vm = handle;
        const snap = yield* Effect.tryPromise({
          try: () => vm.snapshot({ stop: true }),
          catch: (cause) =>
            new KernelBootError({
              stage: "snapshot",
              message: `Suspend failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
        });
        savedSnapshot = snap;
        handle = null;
        previewRelay.attach(null);
        yield* stopBackgroundFibers;
        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          phase: "suspended",
          hasSnapshot: true,
        }));
      });

    const resume = (): Effect.Effect<void, KernelBootError> =>
      Effect.gen(function* () {
        if (!savedSnapshot || !savedBootConfig) {
          return yield* Effect.fail(
            new KernelBootError({ stage: "resume", message: "No suspended VM snapshot available." })
          );
        }
        const cfg = savedBootConfig;
        const snap = savedSnapshot;
        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          phase: "booting",
          bootStage: "Restoring VM memory snapshot...",
          bootProgress: 60,
        }));
        const opts = buildKernelOptions(cfg, snap);
        const vm = yield* Effect.tryPromise({
          try: () => createKernel(opts as CreateKernelOptions),
          catch: (cause) =>
            new KernelBootError({
              stage: "resume",
              message: `Resume failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
        });
        savedSnapshot = null;
        handle = vm;
        previewRelay.attach(vm);
        yield* SubscriptionRef.update(stateRef, (s): VmState => ({
          ...s,
          phase: "running",
          bootProgress: 100,
          hasSnapshot: false,
          stats: vm.stats(),
        }));
        yield* startBackgroundFibers;
      });

    return {
      stateRef,
      events,
      previewRelay,
      audioEngine,
      getHandle: () => handle,
      boot,
      reboot: () => boot(),
      stop: () =>
        Effect.gen(function* () {
          if (handle) {
            yield* Effect.promise(() => handle!.sync({ timeout: 2000 }).catch(() => false));
          }
          yield* cleanupHandle;
          yield* SubscriptionRef.update(stateRef, (s): VmState => ({
            ...s,
            phase: "stopped",
            detectedPorts: [],
          }));
        }),
      suspend,
      resume,
      exec: execRaw,
      execShell,
      spawnPty: (file, args, opts) =>
        Effect.gen(function* () {
          if (!handle) {
            return yield* Effect.fail(new KernelNotRunningError({ operation: "spawnPty" }));
          }
          const vm = handle;
          return yield* Effect.tryPromise({
            try: () => vm.spawn(file, args, opts),
            catch: (cause) =>
              new GuestExecError({
                command: file || "login-shell",
                exitCode: -1,
                stderr: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          });
        }),
      syncCredentials,
      syncDisk: () =>
        Effect.promise(async () => {
          if (!handle) return false;
          return handle.sync({ timeout: 5000 }).catch(() => false);
        }),
      exportDataDiskImage: () =>
        Effect.gen(function* () {
          const cfg = yield* settings.getConfig;
          const sizeBytes = Math.max(4, Math.min(1024, cfg.dataSizeGiB)) * 1024 * 1024 * 1024;
          return yield* Effect.tryPromise({
            try: async () => {
              if (handle) await handle.sync({ timeout: 4000 }).catch(() => {});
              const { store } = dataDiskStore(sizeBytes);
              try {
                const blocks = await store.readAll();
                return encodeKwsparse({
                  size: sizeBytes,
                  blockSize: 4096,
                  blocks,
                });
              } finally {
                store.close();
              }
            },
            catch: (cause) =>
              new KernelBootError({
                stage: "disk-export",
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          });
        }),
      importDataDiskImage: (bytes) =>
        Effect.tryPromise({
          try: async () => {
            if (handle) {
              await handle.stop({ code: 0, reason: "import-disk" }).catch(() => {});
              handle = null;
            }
            return await importDataDisk(bytes);
          },
          catch: (cause) =>
            new KernelBootError({
              stage: "disk-import",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
      resetDataDiskStorage: () =>
        Effect.tryPromise({
          try: async () => {
            if (handle) {
              await handle.stop({ code: 0, reason: "reset-disk" }).catch(() => {});
              handle = null;
            }
            await resetDataDisk();
          },
          catch: (cause) =>
            new KernelBootError({
              stage: "disk-reset",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
      toggleMute: () =>
        Effect.gen(function* () {
          const cur = yield* SubscriptionRef.get(stateRef);
          const next = !cur.audioMuted;
          audioEngine.setMuted(next);
          yield* SubscriptionRef.update(stateRef, (s) => ({ ...s, audioMuted: next }));
          return next;
        }),
      notify: (title, message, level = "info") =>
        PubSub.publish(events, { _tag: "Notify", payload: { title, message, level } }),
      openPreviewPort: (port, path = "/") =>
        PubSub.publish(events, { _tag: "OpenPreview", payload: { port, path } }),
      testWispLatency: (url) =>
        Effect.tryPromise({
          try: () =>
            new Promise<number>((resolve, reject) => {
              const start = performance.now();
              const ws = new WebSocket(url);
              const timer = setTimeout(() => {
                ws.close();
                reject(new Error("Connection timeout (5s)"));
              }, 5000);
              ws.onopen = () => {
                clearTimeout(timer);
                const ms = Math.round(performance.now() - start);
                ws.close();
                resolve(ms);
              };
              ws.onerror = () => {
                clearTimeout(timer);
                reject(new Error("WebSocket handshake failed"));
              };
            }),
          catch: (cause) =>
            new KernelBootError({
              stage: "wisp-test",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
    };
  })
);
