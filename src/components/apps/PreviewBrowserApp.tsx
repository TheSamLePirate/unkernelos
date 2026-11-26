import {
  useAppSurface,
  useSurfaceRevision,
} from "../../core/app-surface-registry.tsx";
import { Effect } from "effect";
import {
  ExternalLink,
  Globe,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Wifi,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import {
  appRuntime,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import { useWm } from "../../wm/wm-store.ts";

type ViewportMode = "desktop" | "tablet" | "mobile";

export const PreviewBrowserApp: React.FC = () => {
  const wm = useWm();
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
    },
  );

  const [port, setPort] = useState(wm.previewPort || 3000);
  const [path, setPath] = useState(wm.previewPath || "/");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [err, setErr] = useState<string | null>(null);
  const revision = useSurfaceRevision(iframeSrc, reloadKey, err);
  useAppSurface({
    document: iframeSrc ?? undefined,
    revision,
    status: err ? "disconnected" : "opaque",
    state: { url: iframeSrc, error: err, contentAccess: "opaque" },
    actions: {
      reload: {
        label: "Recharger cette prévisualisation",
        run: () => {
          setReloadKey((k) => k + 1);
          return { url: iframeSrc };
        },
      },
    },
  });

  const navigate = async (targetPort = port, targetPath = path) => {
    setErr(null);
    setPort(targetPort);
    setPath(targetPath);
    try {
      const url = await appRuntime.runPromise(
        Effect.gen(function* () {
          const vm = yield* VmService;
          yield* Effect.promise(() => vm.previewRelay.ready());
          return vm.previewRelay.previewUrl(targetPort, targetPath);
        }),
      );
      setIframeSrc(url);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void navigate(wm.previewPort, wm.previewPath);
  }, [wm.previewPort, wm.previewPath]);

  const widthClass =
    viewport === "mobile"
      ? "w-[390px] max-w-full rounded-2xl shadow-2xl border border-white/15"
      : viewport === "tablet"
        ? "w-[768px] max-w-full rounded-xl shadow-2xl border border-white/15"
        : "w-full";

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]">
      {/* Browser Address Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => navigate(port, path)}
          className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300 transition"
          title="Reload"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/55 border border-white/12 focus-within:border-emerald-400/50">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-mono text-zinc-500">http://guest:</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 80)}
            onKeyDown={(e) => e.key === "Enter" && navigate(port, path)}
            className="w-14 bg-transparent text-xs font-mono text-emerald-300 outline-none"
          />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && navigate(port, path)}
            className="flex-1 bg-transparent text-xs font-mono text-zinc-200 outline-none"
            placeholder="/"
          />
        </div>

        {/* Viewport Toggle */}
        <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
          {(
            [
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone],
            ] as const
          ).map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewport(mode)}
              className={`p-1.5 rounded-md transition ${
                viewport === mode
                  ? "bg-white/15 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={mode}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {iframeSrc && (
          <a
            href={iframeSrc}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-zinc-300 transition"
            title="Open in new browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Detected Listening Ports Ribbon */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/6 text-[11px] overflow-x-auto shrink-0">
        <span className="text-zinc-500 shrink-0">Listening guest ports:</span>
        {vmState.detectedPorts.length === 0 ? (
          <span className="text-zinc-500 italic">
            None detected yet — start a web server in Linux
          </span>
        ) : (
          vmState.detectedPorts.map((p) => (
            <button
              key={p.port}
              type="button"
              onClick={() => navigate(p.port, "/")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-mono border transition ${
                port === p.port
                  ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                  : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              localhost:{p.port}
            </button>
          ))
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex justify-center bg-[#06070c] p-0 overflow-auto">
        {err ? (
          <div className="m-auto p-6 max-w-md text-center space-y-2">
            <Globe className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-medium text-rose-300">
              Preview Unavailable
            </p>
            <p className="text-xs text-zinc-400">{err}</p>
          </div>
        ) : iframeSrc ? (
          <div
            className={`${widthClass} h-full overflow-hidden ${viewport !== "desktop" ? "my-3" : ""}`}
          >
            <iframe
              key={reloadKey}
              src={iframeSrc}
              title={`Guest Server Port ${port}`}
              className="w-full h-full bg-white border-0"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};
