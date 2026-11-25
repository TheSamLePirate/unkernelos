import { Effect } from "effect";
import {
  Check,
  Code2,
  FolderPlus,
  Gem,
  Loader2,
  Package,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import runeCargoToml from "../../../rune-apps/liquid-metal-settings/Cargo.toml?raw";
import runeToolchainToml from "../../../rune-apps/liquid-metal-settings/rust-toolchain.toml?raw";
import runeGfxRs from "../../../rune-apps/liquid-metal-settings/src/gfx.rs?raw";
import runeLibRs from "../../../rune-apps/liquid-metal-settings/src/lib.rs?raw";
import runeMainRs from "../../../rune-apps/liquid-metal-settings/src/main.rs?raw";
import {
  appRuntime,
  GuestFsService,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_UNKERNEL_CONFIG,
  type OsThemeId,
  type UnkernelConfig,
  type WallpaperShaderId,
} from "../../core/schema.ts";
import { wmStore } from "../../wm/wm-store.ts";

const VALID_THEMES = new Set<OsThemeId>([
  "obsidian-aurora",
  "liquid-glass",
  "cyberpunk-neon",
  "nordic-frost",
  "warm-amber",
]);

const VALID_SHADERS = new Set<WallpaperShaderId>([
  "aurora",
  "liquid-prism",
  "cyber-grid",
  "nordic-borealis",
  "solar-ember",
]);

const SOURCE_TABS = [
  { id: "lib.rs", label: "src/lib.rs", code: runeLibRs },
  { id: "gfx.rs", label: "src/gfx.rs", code: runeGfxRs },
  { id: "Cargo.toml", label: "Cargo.toml", code: runeCargoToml },
] as const;

function buildSnapshot(cfg: UnkernelConfig, statusLine: string): string {
  const safeStatus = statusLine.replace(/[;=]/g, " ");
  return [
    `osTheme=${cfg.osTheme}`,
    `wallpaperShader=${cfg.wallpaperShader}`,
    `glassBlur=${cfg.glassBlur}`,
    `webgpuWallpaper=${cfg.webgpuWallpaper}`,
    `dockMagnification=${cfg.dockMagnification}`,
    `uiSounds=${cfg.uiSounds}`,
    `desktopWidgets=${cfg.desktopWidgets}`,
    `cpus=${cfg.cpus}`,
    `memoryMiB=${cfg.memoryMiB}`,
    `jit=${cfg.jit}`,
    `worker=${cfg.worker}`,
    `shared=${cfg.shared}`,
    `gl=${cfg.gl}`,
    `wayland=${cfg.wayland}`,
    `display=${cfg.display}`,
    `sound=${cfg.sound}`,
    `net=${cfg.net}`,
    `status=${safeStatus}`,
  ].join(";");
}

interface RuneBridgeMessage {
  source?: string;
  kind?: string;
  key?: string;
  value?: string;
}

export const RuneLiquidSettingsApp: React.FC = () => {
  const cfg = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.configRef),
    DEFAULT_UNKERNEL_CONFIG
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
      cpus: 2,
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

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [codeTab, setCodeTab] = useState<(typeof SOURCE_TABS)[number]["id"]>("lib.rs");
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(false);

  const statusLine = useMemo(() => {
    const distro = cfg.distro === "debian" ? "Debian" : cfg.distro === "alpine" ? "Alpine" : "Kernel";
    const gpu = vmState.webgpuAvailable ? "WebGPU" : "WebGL2";
    const phase =
      vmState.phase === "running"
        ? "En ligne"
        : vmState.phase === "booting"
        ? "Démarrage..."
        : vmState.phase;
    return `Linux 7.x ${distro} · ${phase} · ${gpu}`;
  }, [cfg.distro, vmState.phase, vmState.webgpuAvailable]);

  const snapshot = useMemo(() => buildSnapshot(cfg, statusLine), [cfg, statusLine]);
  const initialSnapshotRef = useRef(snapshot);

  const iframeSrc = useMemo(() => {
    const rawBase = import.meta.env.BASE_URL ?? "/";
    const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
    const nonce = reloadNonce > 0 ? `?r=${reloadNonce}` : "";
    return `${base}rune-apps/liquid-metal-settings/index.html${nonce}#state=${encodeURIComponent(
      initialSnapshotRef.current
    )}`;
  }, [reloadNonce]);

  const pushSnapshot = useCallback(
    (snap: string) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage({ source: "unkernelos-host", snapshot: snap }, "*");
    },
    []
  );

  // Sync live OS config changes into the Rust Rune GPU app
  useEffect(() => {
    if (!ready) return;
    pushSnapshot(snapshot);
  }, [ready, snapshot, pushSnapshot]);

  // Listen for live setting mutations & VM commands from Rust Rune
  useEffect(() => {
    const onMessage = (ev: MessageEvent<RuneBridgeMessage>) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data;
      if (!msg || msg.source !== "unkernelos-rune-settings") return;

      if (msg.kind === "ready") {
        setReady(true);
        setGpuError(null);
        pushSnapshot(snapshot);
        return;
      }

      if (msg.kind === "error") {
        setGpuError(msg.value || "Impossible d'initialiser le rendu GPU Rust Rune.");
        return;
      }

      if (msg.kind === "vm" && msg.key === "reboot") {
        wmStore.pushToast(
          "Liquid Metal Réglages (Rune)",
          "Redémarrage du noyau Linux avec les nouveaux paramètres...",
          "info"
        );
        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.boot()).pipe(Effect.ignore));
        return;
      }

      if (msg.kind === "config" && msg.key && typeof msg.value === "string") {
        const key = msg.key;
        const val = msg.value;
        const patch: { -readonly [K in keyof UnkernelConfig]?: UnkernelConfig[K] } = {};

        switch (key) {
          case "osTheme":
            if (VALID_THEMES.has(val as OsThemeId)) patch.osTheme = val as OsThemeId;
            break;
          case "wallpaperShader":
            if (VALID_SHADERS.has(val as WallpaperShaderId)) {
              patch.wallpaperShader = val as WallpaperShaderId;
            }
            break;
          case "glassBlur": {
            const n = Number(val);
            if (Number.isFinite(n)) patch.glassBlur = Math.max(8, Math.min(48, Math.round(n)));
            break;
          }
          case "cpus": {
            const n = Number(val);
            if (Number.isFinite(n)) patch.cpus = Math.max(1, Math.min(16, Math.round(n)));
            break;
          }
          case "memoryMiB": {
            const n = Number(val);
            if (Number.isFinite(n)) patch.memoryMiB = Math.max(256, Math.min(3072, Math.round(n)));
            break;
          }
          case "webgpuWallpaper":
            patch.webgpuWallpaper = val === "true";
            break;
          case "dockMagnification":
            patch.dockMagnification = val === "true";
            break;
          case "uiSounds":
            patch.uiSounds = val === "true";
            break;
          case "desktopWidgets":
            patch.desktopWidgets = val === "true";
            break;
          case "jit":
            patch.jit = val === "true";
            break;
          case "worker":
            patch.worker = val === "true";
            break;
          case "shared":
            patch.shared = val === "true";
            break;
          case "gl":
            patch.gl = val === "true";
            break;
          case "wayland":
            patch.wayland = val === "true";
            break;
          case "display":
            patch.display = val === "true";
            break;
          case "sound":
            patch.sound = val === "true";
            break;
          case "net":
            patch.net = val === "true";
            break;
          default:
            return;
        }

        if (Object.keys(patch).length > 0) {
          appRuntime.runFork(
            Effect.flatMap(SettingsService, (s) => s.updateConfig(patch)).pipe(Effect.ignore)
          );
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushSnapshot, snapshot]);

  const cloneToWorkspace = () => {
    setCloning(true);
    const dest = "/home/user/workspace/rune-liquid-settings";
    appRuntime.runFork(
      Effect.gen(function* () {
        const fs = yield* GuestFsService;
        yield* fs.mkdir(`${dest}/src`);
        yield* fs.writeFileText(`${dest}/Cargo.toml`, runeCargoToml);
        yield* fs.writeFileText(`${dest}/rust-toolchain.toml`, runeToolchainToml);
        yield* fs.writeFileText(`${dest}/src/gfx.rs`, runeGfxRs);
        yield* fs.writeFileText(`${dest}/src/lib.rs`, runeLibRs);
        yield* fs.writeFileText(`${dest}/src/main.rs`, runeMainRs);
        yield* Effect.sync(() => {
          setCloning(false);
          setCloned(true);
          wmStore.setWorkspaceDir(dest);
          wmStore.openFileInIde(`${dest}/src/lib.rs`);
          wmStore.pushToast(
            "Projet Rust Rune créé",
            `Code source copié dans ${dest} et ouvert dans Code IDE.`,
            "success"
          );
        });
      }).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            setCloning(false);
            wmStore.pushToast(
              "Erreur copie workspace",
              "message" in err ? err.message : String(err),
              "error"
            );
          })
        )
      )
    );
  };

  const activeSource = SOURCE_TABS.find((t) => t.id === codeTab) ?? SOURCE_TABS[0];

  return (
    <div className="flex flex-col w-full h-full bg-[#070910] text-zinc-100 select-none">
      {/* Slim Native Toolbar Ribbon */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0a0d16]/95 border-b border-white/10 shrink-0 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-slate-200 via-cyan-300 to-violet-400 flex items-center justify-center text-[#070910] shadow">
            <Gem className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-white truncate">Rust Rune GPU</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-mono text-cyan-300">
            {ready ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                rune-fx · Liquid Metal
              </>
            ) : (
              <>
                <Loader2 className="w-2.5 h-2.5 animate-spin text-violet-400" />
                WASM GPU…
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition cursor-pointer ${
              showCode
                ? "bg-violet-500/25 border-violet-400/45 text-violet-100"
                : "bg-white/[0.05] hover:bg-white/10 border-white/10 text-zinc-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code Rust</span>
          </button>

          <button
            type="button"
            disabled={cloning}
            onClick={cloneToWorkspace}
            title="Copier la crate Rust Rune dans /home/user/workspace/rune-liquid-settings"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-200 disabled:opacity-50 transition cursor-pointer"
          >
            {cloning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : cloned ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <FolderPlus className="w-3.5 h-3.5 text-cyan-300" />
            )}
            <span className="hidden md:inline">~/workspace</span>
          </button>

          <button
            type="button"
            onClick={() => wmStore.openApp("toolchain")}
            title="Installer le SDK Rust Rune (anomalyco/rune) dans Linux"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-200 transition cursor-pointer"
          >
            <Package className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden lg:inline">Installer Rune</span>
          </button>

          <button
            type="button"
            onClick={() => wmStore.openApp("settings")}
            title="Ouvrir les réglages classiques"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-300 transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              initialSnapshotRef.current = snapshot;
              setReady(false);
              setGpuError(null);
              setReloadNonce((n) => n + 1);
            }}
            title="Recharger le runtime WASM Rune"
            className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-300 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split: Live Rust Rune GPU Canvas + Optional Source Inspector */}
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        <div className="relative flex-1 min-w-0 h-full bg-[#070910]">
          <iframe
            key={reloadNonce}
            ref={iframeRef}
            src={iframeSrc}
            title="Liquid Metal unkernelOS Réglages (Rust Rune)"
            className="w-full h-full border-0 block"
            allow="cross-origin-isolated"
          />

          {gpuError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-[#070910]/95 text-center">
              <div className="text-sm font-semibold text-rose-300">
                Moteur GPU Rust Rune indisponible
              </div>
              <p className="text-xs text-zinc-400 max-w-md break-words">{gpuError}</p>
              <button
                type="button"
                onClick={() => wmStore.openApp("settings")}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-semibold text-white cursor-pointer"
              >
                Ouvrir les réglages classiques
              </button>
            </div>
          )}
        </div>

        {showCode && (
          <aside className="w-full sm:w-[420px] shrink-0 h-full bg-[#090c14] border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-1">
                {SOURCE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCodeTab(t.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                      codeTab === t.id
                        ? "bg-violet-500/25 text-white border border-violet-400/40"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowCode(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="flex-1 min-h-0 overflow-auto p-3 text-[11px] leading-relaxed font-mono text-zinc-300 select-text whitespace-pre">
              {activeSource.code}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
};
