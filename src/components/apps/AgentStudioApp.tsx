import { Effect } from "effect";
import {
  Bot,
  ExternalLink,
  FolderPlus,
  GitBranch,
  Globe,
  Play,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  appRuntime,
  GitService,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_CREDENTIALS,
  DEFAULT_UNKERNEL_CONFIG,
  type AgentKind,
} from "../../core/schema.ts";
import { wmStore } from "../../wm/wm-store.ts";
import { KittyTerminalPane, type KittyTerminalHandle } from "./KittyTerminalPane.tsx";

const PROMPT_TEMPLATES = [
  {
    label: "SaaS Dashboard",
    prompt:
      "Create a stunning modern interactive SaaS analytics dashboard in HTML/CSS/JS (or Bun + Vite) with live charts, dark glass aesthetic, and responsive layout. Then start a web server on port 3000 and verify it returns HTTP 200.",
  },
  {
    label: "3D WebGL Game",
    prompt:
      "Build a smooth, fun 60fps browser arcade game using HTML5 Canvas / WebGL with keyboard controls, score counter, and neon cyber visuals in index.html. Serve it on port 3000 and test that it serves properly.",
  },
  {
    label: "Full-Stack Bun App",
    prompt:
      "Create a clean full-stack Notes & Kanban app using Bun.serve() with REST API + sleek frontend UI on port 3000. Run a quick curl test against the API to verify everything works.",
  },
  {
    label: "Portfolio + Blog",
    prompt:
      "Design and build a static AAA developer portfolio website ready for GitHub Pages (index.html, styles.css, app.js) with dark glass cards, project showcase and animations. Start a dev server on port 3000.",
  },
];

export const AgentStudioApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
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

  const [agent, setAgent] = useState<AgentKind>(creds.defaultAgent);
  const [projectName, setProjectName] = useState("my-ai-app");
  const [prompt, setPrompt] = useState("");
  const [previewPort, setPreviewPort] = useState<number>(3000);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  const termHandleRef = useRef<KittyTerminalHandle | null>(null);

  const workspaceDir = `/home/user/workspace/${projectName.replace(/[^a-zA-Z0-9._-]/g, "-") || "my-ai-app"}`;

  // Auto-select first detected listening port from the guest VM!
  useEffect(() => {
    const firstPort = vmState.detectedPorts[0]?.port;
    if (firstPort) {
      setPreviewPort(firstPort);
      appRuntime
        .runPromise(
          Effect.gen(function* () {
            const vm = yield* VmService;
            yield* Effect.promise(() => vm.previewRelay.ready());
            return vm.previewRelay.previewUrl(firstPort, "/");
          })
        )
        .then((url) => {
          setPreviewUrl(url);
          setPreviewKey((k) => k + 1);
        })
        .catch(() => {});
    }
  }, [vmState.detectedPorts.map((p) => p.port).join(",")]);

  const loadPreviewPort = async (port: number) => {
    setPreviewPort(port);
    try {
      const url = await appRuntime.runPromise(
        Effect.gen(function* () {
          const vm = yield* VmService;
          yield* Effect.promise(() => vm.previewRelay.ready());
          return vm.previewRelay.previewUrl(port, "/");
        })
      );
      setPreviewUrl(url);
      setPreviewKey((k) => k + 1);
    } catch (err) {
      wmStore.pushToast("Preview Error", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const launchAgentPrompt = () => {
    const text = prompt.trim();
    if (!text || !termHandleRef.current) return;

    wmStore.setWorkspaceDir(workspaceDir);
    const escaped = text.replace(/'/g, `'\\''`);
    const agentCmd =
      agent === "claude"
        ? `claude '${escaped}'`
        : `pi '${escaped}'`;

    const fullCmd = [
      `mkdir -p '${workspaceDir}' && cd '${workspaceDir}'`,
      `[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"`,
      `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"`,
      agentCmd,
    ].join(" && ");

    termHandleRef.current.write(`${fullCmd}\n`);
    termHandleRef.current.focus();
  };

  const launchInteractiveAgent = () => {
    if (!termHandleRef.current) return;
    wmStore.setWorkspaceDir(workspaceDir);
    const fullCmd = [
      `mkdir -p '${workspaceDir}' && cd '${workspaceDir}'`,
      `[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"`,
      `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"`,
      agent === "claude" ? "claude" : "pi",
    ].join(" && ");
    termHandleRef.current.write(`${fullCmd}\n`);
    termHandleRef.current.focus();
  };

  const handleDeployPages = async () => {
    setDeploying(true);
    setDeployError(null);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const git = yield* GitService;
          return yield* git.deployToGitHubPages(
            workspaceDir,
            projectName,
            `Build & publish ${projectName} via unkernelOS (${agent})`
          );
        })
      )
    );
    setDeploying(false);
    if (res._tag === "Left") {
      setDeployError(res.left.message);
      wmStore.pushToast("GitHub Pages Deploy Failed", res.left.message, "error");
    } else {
      setDeployedUrl(res.right.pagesUrl);
      wmStore.pushToast("GitHub Pages Deployed!", res.right.pagesUrl, "success");
    }
  };

  const hasAgentKey =
    agent === "claude"
      ? Boolean(creds.anthropicApiKey)
      : Boolean(creds.anthropicApiKey || creds.openaiApiKey || creds.geminiApiKey || creds.openrouterApiKey);

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0c13]/92">
      {/* Top Workflow Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/40 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          {/* Agent Selector */}
          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setAgent("claude")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                agent === "claude"
                  ? "bg-gradient-to-r from-orange-500/80 to-amber-500/80 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              Claude Code
            </button>
            <button
              type="button"
              onClick={() => setAgent("pi")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                agent === "pi"
                  ? "bg-gradient-to-r from-violet-500/80 to-cyan-500/80 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Pi Agent
            </button>
          </div>

          {/* Workspace Name */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] text-zinc-500 font-mono">~/workspace/</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-transparent text-xs font-mono text-zinc-100 outline-none w-32"
              placeholder="my-app"
            />
          </div>

          {!hasAgentKey && (
            <button
              type="button"
              onClick={() => wmStore.openApp("settings", { tab: "credentials" })}
              className="text-[11px] px-2 py-1 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 transition"
            >
              Set API Key
            </button>
          )}
        </div>

        {/* Pipeline Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => wmStore.openApp("toolchain")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
          >
            <Wrench className="w-3.5 h-3.5 text-indigo-400" />
            Toolchain
          </button>
          <button
            type="button"
            onClick={() => {
              wmStore.setWorkspaceDir(workspaceDir);
              wmStore.openApp("git");
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
          >
            <GitBranch className="w-3.5 h-3.5 text-orange-400" />
            Git
          </button>
          <button
            type="button"
            disabled={deploying}
            onClick={handleDeployPages}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition"
          >
            <Rocket className="w-3.5 h-3.5" />
            {deploying ? "Publishing..." : "Publish to GitHub Pages"}
          </button>
        </div>
      </div>

      {/* Prompt Composer Bar */}
      <div className="px-3 py-2.5 bg-white/[0.025] border-b border-white/8 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                launchAgentPrompt();
              }
            }}
            placeholder={`Describe the app you want ${agent === "claude" ? "Claude Code" : "Pi"} to build, test & serve on localhost:3000...`}
            className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/12 focus:border-violet-400/60 outline-none text-xs text-zinc-100 placeholder:text-zinc-500 transition"
          />
          <button
            type="button"
            onClick={launchAgentPrompt}
            disabled={!prompt.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 disabled:opacity-40 transition"
          >
            <Send className="w-3.5 h-3.5" />
            Run Prompt
          </button>
          <button
            type="button"
            onClick={launchInteractiveAgent}
            title="Start Interactive Agent Session"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-200 transition"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            Interactive
          </button>
        </div>

        {/* Starter Templates + Deployment Banner */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Presets:</span>
            {PROMPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => setPrompt(tpl.prompt)}
                className="px-2 py-0.5 rounded-full text-[11px] bg-white/5 hover:bg-violet-500/20 border border-white/8 hover:border-violet-400/35 text-zinc-300 transition"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          {deployedUrl && (
            <a
              href={deployedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 hover:bg-emerald-500/25"
            >
              <Globe className="w-3 h-3" />
              Live: {deployedUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {deployError && (
            <span className="text-[11px] text-rose-400 truncate max-w-md">{deployError}</span>
          )}
        </div>
      </div>

      {/* Main Split: Agent Kitty Terminal (Left) | Live Webserver Preview (Right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
        {/* Left: Agent PTY */}
        <div className="relative flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 border-b border-white/6 text-[11px] text-zinc-400">
            <span className="font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Agent PTY · {workspaceDir}
            </span>
            <span className="text-[10px] text-zinc-500">WebGPU Kitty Engine</span>
          </div>
          <div className="flex-1 min-h-0">
            <KittyTerminalPane
              themeId={cfg.kittyTheme}
              fontSize={cfg.terminalFontSize}
              preferWebGpu={cfg.webgpuTerminal}
              focused={windowFocused}
              onReady={(h) => {
                termHandleRef.current = h;
              }}
            />
          </div>
        </div>

        {/* Right: Embedded Guest Webserver Preview */}
        <div className="flex flex-col min-h-0 bg-[#07090f]">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-black/40 border-b border-white/8">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-200">Live App Preview</span>
              {vmState.detectedPorts.map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => loadPreviewPort(p.port)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition ${
                    previewPort === p.port && previewUrl
                      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  :{p.port}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <input
                type="number"
                value={previewPort}
                onChange={(e) => setPreviewPort(Number(e.target.value) || 3000)}
                onKeyDown={(e) => e.key === "Enter" && loadPreviewPort(previewPort)}
                className="w-16 px-1.5 py-0.5 rounded bg-white/8 border border-white/10 text-[11px] font-mono text-zinc-200 outline-none"
              />
              <button
                type="button"
                onClick={() => loadPreviewPort(previewPort)}
                className="p-1 rounded bg-white/8 hover:bg-white/15 text-zinc-300 transition"
                title="Load / Reload Guest Server"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded bg-white/8 hover:bg-white/15 text-zinc-300 transition"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            {previewUrl ? (
              <iframe
                key={previewKey}
                src={previewUrl}
                title="Guest App Live Preview"
                className="w-full h-full bg-white border-0"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-400/25 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-sm font-medium text-zinc-200">Waiting for Guest Web Server</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    When {agent === "claude" ? "Claude Code" : "Pi"} starts a dev server (Bun, Vite, Python, Node), unkernelOS detects the port automatically and streams it here over <code className="text-cyan-300">vsock</code>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadPreviewPort(previewPort)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 border border-white/12 text-zinc-200 transition"
                >
                  Connect to localhost:{previewPort}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
