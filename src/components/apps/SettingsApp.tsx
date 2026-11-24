import { Effect } from "effect";
import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  KeyRound,
  Monitor,
  Network,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Wifi,
} from "lucide-react";
import React, { useRef, useState } from "react";
import {
  appRuntime,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_CREDENTIALS,
  DEFAULT_UNKERNEL_CONFIG,
  type DistroKind,
} from "../../core/schema.ts";
import { wmStore } from "../../wm/wm-store.ts";

type SettingsTab = "compute" | "network" | "graphics" | "storage" | "credentials";

const RESOLUTIONS = [
  { label: "640 × 480 (VGA)", w: 640, h: 480 },
  { label: "800 × 600 (SVGA)", w: 800, h: 600 },
  { label: "1024 × 640 (HD Glass)", w: 1024, h: 640 },
  { label: "1280 × 720 (720p)", w: 1280, h: 720 },
];

export const SettingsApp: React.FC<{ initialTab?: SettingsTab }> = ({ initialTab }) => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
  );
  const creds = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.credsRef),
    DEFAULT_CREDENTIALS
  );
  const vmState = useSubscriptionRef(
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

  const [tab, setTab] = useState<SettingsTab>(initialTab ?? "compute");
  const [wispPing, setWispPing] = useState<string | null>(null);
  const [needsReboot, setNeedsReboot] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const maxHostCores = typeof navigator !== "undefined" ? Math.min(16, navigator.hardwareConcurrency || 8) : 8;

  const patchCfg = (patch: Partial<typeof cfg>, requiresReboot = true) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateConfig(patch)));
    if (requiresReboot) setNeedsReboot(true);
  };

  const patchCreds = (patch: Partial<typeof creds>) => {
    appRuntime.runFork(
      Effect.gen(function* () {
        const s = yield* SettingsService;
        const next = yield* s.updateCredentials(patch);
        const vm = yield* VmService;
        yield* vm.syncCredentials(next);
      })
    );
  };

  const applyAndReboot = () => {
    setNeedsReboot(false);
    appRuntime.runFork(
      Effect.flatMap(VmService, (v) => v.reboot()).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => wmStore.pushToast("Reboot Failed", err.message, "error"))
        )
      )
    );
  };

  const testWisp = async () => {
    const url = cfg.wispUrl.trim();
    if (!url) {
      setWispPing("Enter your wss:// Wisp URL first");
      return;
    }
    setWispPing("Testing handshake...");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.testWispLatency(url)))
    );
    if (res._tag === "Right") setWispPing(`Connected in ${res.right} ms`);
    else setWispPing(`Failed: ${res.left.message}`);
  };

  const handleExportDisk = async () => {
    wmStore.pushToast("Exporting Disk", "Packing persistent ext4 blocks...", "info");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.exportDataDiskImage()))
    );
    if (res._tag === "Right") {
      const bytes = new Uint8Array(res.right);
      const blob = new Blob([bytes.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unkernelos-data-${new Date().toISOString().slice(0, 10)}.kwsparse`;
      a.click();
      URL.revokeObjectURL(url);
      wmStore.pushToast("Disk Exported", `${(bytes.byteLength / 1e6).toFixed(2)} MB`, "success");
    } else {
      wmStore.pushToast("Export Failed", res.left.message, "error");
    }
  };

  const handleImportDisk = async (file: File | undefined) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.importDataDiskImage(bytes)))
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Disk Imported", `Restored ${res.right.blocks} blocks. Rebooting...`, "success");
      applyAndReboot();
    } else {
      wmStore.pushToast("Import Failed", res.left.message, "error");
    }
  };

  const handleResetDisk = async () => {
    if (!window.confirm("Erase the entire persistent /data disk in IndexedDB? All installed packages & files will be wiped.")) {
      return;
    }
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(VmService, (v) => v.resetDataDiskStorage()))
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Disk Wiped", "Persistent ext4 disk reset. Rebooting fresh...", "info");
      applyAndReboot();
    }
  };

  const tabs: readonly { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "compute", label: "Linux & Compute", icon: Cpu },
    { id: "network", label: "Network (Wisp)", icon: Network },
    { id: "graphics", label: "FB0, GL & WebGPU", icon: Monitor },
    { id: "storage", label: "Disk & Snapshots", icon: HardDrive },
    { id: "credentials", label: "API Keys & GitHub", icon: KeyRound },
  ];

  return (
    <div className="flex w-full h-full bg-[#0a0c13]/95 overflow-hidden">
      {/* Left Navigation */}
      <div className="w-52 shrink-0 bg-black/35 border-r border-white/10 p-3 flex flex-col justify-between">
        <div className="space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  active
                    ? "bg-violet-500/20 text-white border border-violet-400/35"
                    : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 pt-3 border-t border-white/10">
          {needsReboot && (
            <div className="text-[11px] text-amber-300 px-1">
              Kernel config changed — reboot to apply.
            </div>
          )}
          <button
            type="button"
            onClick={applyAndReboot}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Apply &amp; Reboot VM
          </button>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {tab === "compute" && (
          <div className="space-y-5 max-w-2xl">
            <h2 className="text-sm font-semibold text-white">Distribution, RAM &amp; vCPU Architecture</h2>

            {/* Distro Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  ["debian", "Debian 13", "Full glibc, Mesa VirGL 3D, Wayland wland, best for Claude & Pi"],
                  ["alpine", "Alpine 3.24", "Ultra-fast ~4 MB musl image, instant boot, lightweight CLI"],
                  ["none", "Base Shell", "Minimal BusyBox initramfs (zero download)"],
                ] as [DistroKind, string, string][]
              ).map(([id, name, desc]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => patchCfg({ distro: id })}
                  className={`text-left p-3 rounded-2xl border transition ${
                    cfg.distro === id
                      ? "bg-violet-500/20 border-violet-400/50 text-white"
                      : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-xs font-semibold">{name}</div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{desc}</p>
                </button>
              ))}
            </div>

            {/* RAM Slider */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-zinc-200">Guest Memory (RAM)</span>
                <span className="font-mono text-violet-300">{cfg.memoryMiB} MiB</span>
              </div>
              <input
                type="range"
                min={256}
                max={3072}
                step={128}
                value={cfg.memoryMiB}
                onChange={(e) => patchCfg({ memoryMiB: Number(e.target.value) })}
                className="w-full accent-violet-500"
              />
              <p className="text-[11px] text-zinc-500">
                Recommended: 2048 MiB for Claude Code, Bun, Pi &amp; Debian. WASM32 browsers cap SharedArrayBuffer around 2–3 GiB.
              </p>
            </div>

            {/* vCPU Slider */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-zinc-200">Virtual CPUs (SMP Web Workers)</span>
                <span className="font-mono text-cyan-300">
                  {cfg.cpus} / {maxHostCores} host cores
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={maxHostCores}
                step={1}
                value={Math.min(cfg.cpus, maxHostCores)}
                onChange={(e) => patchCfg({ cpus: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
              <p className="text-[11px] text-zinc-500">
                Multi-vCPU (SMP) requires Cross-Origin Isolation ({vmState.crossOriginIsolated ? "active" : "unavailable"}) and Web Worker mode.
              </p>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  ["jit", "kwemu WASM JIT", "Compile hot aarch64 blocks to WASM (1.6×–2.3× faster)"],
                  ["worker", "Web Worker Mode", "Run kernel off main UI thread (required for SMP)"],
                  ["shared", "SharedArrayBuffer Transport", "Zero-latency shared ring buffers for I/O & frames"],
                  ["wasi", "Host WASI Offloader", "Execute guest .wasm binaries natively on host engine"],
                  ["safeMode", "Safe Mode (kw.root=initramfs)", "Bypass broken overlay root while keeping /data mounted"],
                  ["verbose", "Verbose Kernel Logs", "Log all Linux kernel messages into console ring"],
                ] as const
              ).map(([key, title, desc]) => (
                <label
                  key={key}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{title}</div>
                    <div className="text-[11px] text-zinc-500">{desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cfg[key]}
                    onChange={(e) => patchCfg({ [key]: e.target.checked })}
                    className="mt-0.5 accent-violet-500"
                  />
                </label>
              ))}
            </div>

            {/* Custom Kernel Cmdline */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Extra Kernel Command Line (`append`)</label>
              <input
                value={cfg.cmdlineAppend}
                onChange={(e) => patchCfg({ cmdlineAppend: e.target.value })}
                placeholder="e.g. loglevel=7"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
              />
            </div>
          </div>
        )}

        {tab === "network" && (
          <div className="space-y-5 max-w-2xl">
            <h2 className="text-sm font-semibold text-white">Networking &amp; Custom Wisp Relay</h2>
            <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-zinc-200">Enable Guest TCP/IP Network (eth0)</div>
                <div className="text-[11px] text-zinc-500">Routes guest internet traffic (apt, apk, git, gh, Claude, Pi) via Wisp</div>
              </div>
              <input
                type="checkbox"
                checked={cfg.net}
                onChange={(e) => patchCfg({ net: e.target.checked })}
                className="accent-emerald-500"
              />
            </label>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <label className="text-xs font-medium text-zinc-200">Your Wisp Server URL (`wss://...`)</label>
              <div className="flex gap-2">
                <input
                  value={cfg.wispUrl}
                  onChange={(e) => patchCfg({ wispUrl: e.target.value })}
                  placeholder="wss://your-wisp-server.example.com/"
                  className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={testWisp}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  Ping
                </button>
              </div>
              {wispPing && <p className="text-xs font-mono text-cyan-300">{wispPing}</p>}
              <p className="text-[11px] text-zinc-500">
                Leave empty to use unkernel&apos;s default relay (restricted to localhost). Comma-separate multiple URLs to race them. Also configurable via <code>?wisp=wss://...</code>.
              </p>
            </div>
          </div>
        )}

        {tab === "graphics" && (
          <div className="space-y-5 max-w-2xl">
            <h2 className="text-sm font-semibold text-white">Framebuffer (/dev/fb0), Guest GL, Wayland &amp; WebGPU</h2>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">/dev/fb0 Display Resolution</label>
              <div className="grid grid-cols-2 gap-2">
                {RESOLUTIONS.map((r) => {
                  const active = cfg.displayWidth === r.w && cfg.displayHeight === r.h;
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => patchCfg({ displayWidth: r.w, displayHeight: r.h })}
                      className={`px-3 py-2 rounded-xl text-xs font-mono border text-left transition ${
                        active
                          ? "bg-pink-500/20 border-pink-400/45 text-pink-200"
                          : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  ["display", "/dev/fb0 + evdev Input", "Linux framebuffer & keyboard/mouse devices", true],
                  ["gpu", "VirtIO-GPU (/dev/dri)", "KMS & DRM render node (Debian)", true],
                  ["gl", "Guest 3D GL (virgl.wasm)", "Mesa VirGL over browser WebGL2 (Debian)", true],
                  ["glEager", "Eager GL Init", "Load virgl.wasm at boot instead of first GL use", true],
                  ["wayland", "Wayland Compositor (wland)", "Run native GTK/Qt/SDL apps via /dev/kwshm (Debian)", true],
                  ["sound", "ALSA Audio (/dev/dsp)", "Play guest PCM sound via Web Audio API", true],
                  ["webgpuTerminal", "WebGPU Kitty Terminal", "WGSL instanced glyph atlas (fallback Canvas2D)", false],
                  ["webgpuFb0", "WebGPU FB0 Presenter", "Direct GPU texture upload + CRT/Crisp shaders", false],
                  ["webgpuWallpaper", "WebGPU Aurora Wallpaper", "Animated dark glass mesh shader on desktop", false],
                ] as const
              ).map(([key, title, desc, reboot]) => (
                <label
                  key={key}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{title}</div>
                    <div className="text-[11px] text-zinc-500">{desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cfg[key]}
                    onChange={(e) => patchCfg({ [key]: e.target.checked }, reboot)}
                    className="mt-0.5 accent-violet-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === "storage" && (
          <div className="space-y-5 max-w-2xl">
            <h2 className="text-sm font-semibold text-white">Persistent IndexedDB Disk &amp; VM Snapshots</h2>

            <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-zinc-200">Persistent /data Disk (ext4 in IndexedDB)</div>
                <div className="text-[11px] text-zinc-500">Keeps all installed tools (bun, claude, pi, git), projects &amp; settings across reloads</div>
              </div>
              <input
                type="checkbox"
                checked={cfg.dataDisk}
                onChange={(e) => patchCfg({ dataDisk: e.target.checked })}
                className="accent-violet-500"
              />
            </label>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-zinc-200">Virtual Disk Capacity (Thin-Provisioned)</span>
                <span className="font-mono text-violet-300">{cfg.dataSizeGiB} GiB</span>
              </div>
              <input
                type="range"
                min={4}
                max={64}
                step={4}
                value={Math.min(64, cfg.dataSizeGiB)}
                onChange={(e) => patchCfg({ dataSizeGiB: Number(e.target.value) })}
                className="w-full accent-violet-500"
              />
              <p className="text-[11px] text-zinc-500">
                Space in IndexedDB is consumed only as files are written. Disks grow automatically on boot and never shrink.
              </p>
            </div>

            {/* Disk Operations */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={handleExportDisk}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Export .kwsparse
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 border border-white/10 text-zinc-200"
              >
                <Upload className="w-3.5 h-3.5 text-violet-400" />
                Import Image
              </button>
              <input
                ref={importRef}
                type="file"
                className="hidden"
                onChange={(e) => void handleImportDisk(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={handleResetDisk}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Disk
              </button>
            </div>

            {/* Live Suspend / Resume Snapshot */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="text-xs font-semibold text-zinc-200">VM Memory Snapshot (Suspend / Resume)</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={vmState.phase !== "running"}
                  onClick={() =>
                    appRuntime.runFork(
                      Effect.flatMap(VmService, (v) => v.suspend()).pipe(
                        Effect.tap(() => Effect.sync(() => wmStore.pushToast("VM Suspended", "Memory snapshot captured.", "info"))),
                        Effect.catchAll((e) => Effect.sync(() => wmStore.pushToast("Suspend Failed", String(e), "error")))
                      )
                    )
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 disabled:opacity-40"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Suspend VM
                </button>
                <button
                  type="button"
                  disabled={!vmState.hasSnapshot}
                  onClick={() =>
                    appRuntime.runFork(
                      Effect.flatMap(VmService, (v) => v.resume()).pipe(
                        Effect.tap(() => Effect.sync(() => wmStore.pushToast("VM Resumed", "Restored exact kernel state.", "success"))),
                        Effect.catchAll((e) => Effect.sync(() => wmStore.pushToast("Resume Failed", String(e), "error")))
                      )
                    )
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume Snapshot
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "credentials" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-white">AI Agent Keys &amp; GitHub Credentials</h2>
              <button
                type="button"
                onClick={() => wmStore.setGithubModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 transition"
              >
                Sign in with GitHub (1-Click OAuth)
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              100% Browser-Local (synced to ~/.unkernelos_env &amp; gh CLI)
            </div>

            <div className="space-y-3">
              {(
                [
                  ["anthropicApiKey", "Anthropic API Key (Claude Code / Pi)", "sk-ant-...", true],
                  ["openaiApiKey", "OpenAI API Key (Pi)", "sk-...", true],
                  ["geminiApiKey", "Gemini API Key (Pi)", "AIza...", true],
                  ["openrouterApiKey", "OpenRouter API Key (Pi)", "sk-or-...", true],
                  ["githubToken", "GitHub Personal Access Token (repo + workflow + pages)", "ghp_... / github_pat_...", true],
                  ["gitUserName", "Git Author Name", "Jane Developer", false],
                  ["gitUserEmail", "Git Author Email", "jane@example.com", false],
                ] as const
              ).map(([key, label, placeholder, secret]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">{label}</label>
                  <input
                    type={secret ? "password" : "text"}
                    value={creds[key]}
                    onChange={(e) => patchCreds({ [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/12 focus:border-violet-400/60 text-xs font-mono text-zinc-100 outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  appRuntime.runFork(Effect.flatMap(VmService, (v) => v.syncCredentials()));
                  wmStore.pushToast("Credentials Synced", "Exported into guest ~/.unkernelos_env & git config.", "success");
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
              >
                <Save className="w-3.5 h-3.5" />
                Sync into Running VM Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
