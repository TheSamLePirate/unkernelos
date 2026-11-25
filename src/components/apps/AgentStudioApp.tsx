import { Effect } from "effect";
import {
  Activity,
  Bot,
  Brain,
  Code2,
  Cpu,
  Eraser,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Send,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  appRuntime,
  GitService,
  GuestFsService,
  SettingsService,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import {
  DEFAULT_CREDENTIALS,
  DEFAULT_UNKERNEL_CONFIG,
  type AgentKind,
  type ClaudeEffort,
  type ClaudePermissionMode,
  type CredentialsConfig,
  type PiThinking,
} from "../../core/schema.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
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

const CLAUDE_MODELS: readonly { value: string; label: string }[] = [
  { value: "", label: "Default (Auto)" },
  { value: "sonnet", label: "Claude Sonnet (latest)" },
  { value: "opus", label: "Claude Opus (latest)" },
  { value: "haiku", label: "Claude Haiku (fast)" },
  { value: "__custom__", label: "Custom model ID..." },
];

const CLAUDE_EFFORTS: readonly { value: ClaudeEffort; label: string }[] = [
  { value: "default", label: "Thinking: Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

const CLAUDE_PERMISSIONS: readonly { value: ClaudePermissionMode; label: string }[] = [
  { value: "default", label: "Perms: Default" },
  { value: "auto", label: "Auto" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "plan", label: "Plan Only" },
  { value: "dontAsk", label: "Don't Ask" },
  { value: "bypassPermissions", label: "Bypass All" },
];

const PI_PROVIDERS: readonly { value: string; label: string }[] = [
  { value: "", label: "Provider: Auto" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "xai", label: "xAI" },
  { value: "groq", label: "Groq" },
];

const PI_MODELS: readonly { value: string; label: string }[] = [
  { value: "", label: "Model: Default" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { value: "claude-opus-4-6", label: "claude-opus-4-6" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4-5" },
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5", label: "gpt-5" },
  { value: "o3", label: "o3" },
  { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
  { value: "__custom__", label: "Custom model..." },
];

const PI_THINKING_LEVELS: readonly { value: PiThinking; label: string }[] = [
  { value: "default", label: "Thinking: Default" },
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function buildAgentCliCommand(agent: AgentKind, creds: CredentialsConfig, promptText?: string): string {
  const parts: string[] = [];

  if (agent === "claude") {
    parts.push("claude");
    if (creds.claudeModel.trim()) {
      parts.push("--model", sq(creds.claudeModel.trim()));
    }
    if (creds.claudeEffort !== "default") {
      parts.push("--effort", creds.claudeEffort);
    }
    if (creds.claudePermissionMode !== "default") {
      parts.push("--permission-mode", creds.claudePermissionMode);
    }
    if (creds.claudeContinue) {
      parts.push("--continue");
    }
  } else {
    parts.push("pi");
    if (creds.piProvider.trim()) {
      parts.push("--provider", sq(creds.piProvider.trim()));
    }
    if (creds.piModel.trim()) {
      parts.push("--model", sq(creds.piModel.trim()));
    }
    if (creds.piThinking !== "default") {
      parts.push("--thinking", creds.piThinking);
    }
    if (creds.piContinue) {
      parts.push("--continue");
    }
    if (creds.piApprove) {
      parts.push("--approve");
    }
  }

  if (promptText && promptText.trim()) {
    parts.push(sq(promptText.trim()));
  }

  return parts.join(" ");
}

export const AgentStudioApp: React.FC<{ windowFocused?: boolean }> = ({ windowFocused = true }) => {
  const wm = useWm();
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
  const [workspaceDir, setWorkspaceDirState] = useState<string>(
    wm.activeWorkspaceDir || "/home/user/workspace"
  );
  const [knownProjects, setKnownProjects] = useState<readonly string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [previewPort, setPreviewPort] = useState<number>(3000);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [deployedActionsUrl, setDeployedActionsUrl] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"terminal" | "preview">("terminal");
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

  const isCustomClaudeModel =
    Boolean(creds.claudeModel) &&
    !CLAUDE_MODELS.some((m) => m.value !== "__custom__" && m.value === creds.claudeModel);
  const isCustomPiModel =
    Boolean(creds.piModel) &&
    !PI_MODELS.some((m) => m.value !== "__custom__" && m.value === creds.piModel);

  const [customClaudeInput, setCustomClaudeInput] = useState(isCustomClaudeModel);
  const [customPiInput, setCustomPiInput] = useState(isCustomPiModel);

  const termHandleRef = useRef<KittyTerminalHandle | null>(null);
  const lastCdDirRef = useRef<string>(workspaceDir);

  const projectName = workspaceDir.split("/").filter(Boolean).pop() || "workspace";

  const updateCreds = (patch: Partial<CredentialsConfig>) => {
    appRuntime.runFork(Effect.flatMap(SettingsService, (s) => s.updateCredentials(patch)));
  };

  const cliPreview = useMemo(() => buildAgentCliCommand(agent, creds), [agent, creds]);

  // Discover existing projects under ~/workspace
  useEffect(() => {
    if (vmState.phase !== "running") return;
    void appRuntime
      .runPromise(Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.listProjects("/home/user/workspace"))))
      .then((res) => {
        if (res._tag === "Right") setKnownProjects(res.right);
      });
  }, [vmState.phase, wm.activeWorkspaceDir]);

  // Bidirectional sync when active workspace changes from TopBar / Files / IDE / Git
  useEffect(() => {
    if (wm.activeWorkspaceDir && wm.activeWorkspaceDir !== workspaceDir) {
      setWorkspaceDirState(wm.activeWorkspaceDir);
      if (termHandleRef.current && lastCdDirRef.current !== wm.activeWorkspaceDir) {
        lastCdDirRef.current = wm.activeWorkspaceDir;
        termHandleRef.current.write(`mkdir -p ${sq(wm.activeWorkspaceDir)} && cd ${sq(wm.activeWorkspaceDir)}\n`);
      }
    }
  }, [wm.activeWorkspaceDir]);

  const switchProjectDir = (dir: string) => {
    const clean = dir.trim().replace(/\/+/g, "/") || "/home/user/workspace";
    setWorkspaceDirState(clean);
    wmStore.setWorkspaceDir(clean);
    if (termHandleRef.current && lastCdDirRef.current !== clean) {
      lastCdDirRef.current = clean;
      termHandleRef.current.write(`mkdir -p ${sq(clean)} && cd ${sq(clean)}\n`);
    }
  };

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
    const agentCmd = buildAgentCliCommand(agent, creds, text);

    const fullCmd = [
      `mkdir -p ${sq(workspaceDir)} && cd ${sq(workspaceDir)}`,
      `[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"`,
      `export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"`,
      agentCmd,
    ].join(" && ");

    termHandleRef.current.write(`${fullCmd}\n`);
    termHandleRef.current.focus();
  };

  const launchInteractiveAgent = () => {
    if (!termHandleRef.current) return;
    wmStore.setWorkspaceDir(workspaceDir);
    const agentCmd = buildAgentCliCommand(agent, creds);
    const fullCmd = [
      `mkdir -p ${sq(workspaceDir)} && cd ${sq(workspaceDir)}`,
      `[ -f "$HOME/.unkernelos_env" ] && . "$HOME/.unkernelos_env"`,
      `export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"`,
      agentCmd,
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
      setDeployedActionsUrl(res.right.actionsUrl);
      wmStore.pushToast("GitHub Pages Deployed!", res.right.pagesUrl, "success", {
        label: "Open Pages",
        url: res.right.pagesUrl,
      });
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Agent Selector */}
          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => {
                setAgent("claude");
                updateCreds({ defaultAgent: "claude" });
              }}
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
              onClick={() => {
                setAgent("pi");
                updateCreds({ defaultAgent: "pi" });
              }}
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

          {/* Bidirectional Project / Working Directory Selector */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <select
              aria-label="Select Project Workspace"
              value={workspaceDir}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  const name = window.prompt("New project folder name inside ~/workspace:", "new-app");
                  if (name?.trim()) {
                    const safe = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
                    switchProjectDir(`/home/user/workspace/${safe}`);
                  }
                } else {
                  switchProjectDir(e.target.value);
                }
              }}
              className="bg-transparent text-xs font-mono text-zinc-100 outline-none cursor-pointer max-w-[165px]"
              title={workspaceDir}
            >
              {Array.from(new Set([workspaceDir, ...knownProjects, ...wm.recentWorkspaces])).map((d) => (
                <option key={d} value={d} className="bg-[#12141f] text-zinc-100">
                  {d.replace(/^\/home\/user\/workspace\//, "~/workspace/")}
                </option>
              ))}
              <option value="__new__" className="bg-[#12141f] text-amber-300">
                + New Project Folder...
              </option>
            </select>
          </div>

          {!creds.githubToken && (
            <button
              type="button"
              onClick={() => wmStore.setGithubModal(true)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-violet-500/20 border border-violet-400/35 text-violet-200 hover:bg-violet-500/30 transition"
            >
              <GitBranch className="w-3 h-3" />
              Connect GitHub
            </button>
          )}
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
            onClick={() => setMobileOptionsOpen((v) => !v)}
            className={`flex md:hidden items-center gap-1 px-2 py-1 rounded-lg text-xs border transition ${
              mobileOptionsOpen
                ? "bg-violet-500/25 border-violet-400/40 text-white"
                : "bg-white/5 border-white/10 text-zinc-300"
            }`}
            title="Model & Thinking Options"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInIde(workspaceDir)}
            className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
            title="Open project in Code IDE"
          >
            <Code2 className="w-3.5 h-3.5 text-sky-400" />
            IDE
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInExplorer(workspaceDir)}
            className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
            title="Browse project in File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            Files
          </button>
          <button
            type="button"
            onClick={() => wmStore.openApp("toolchain")}
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
          >
            <Wrench className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xl:inline">Toolchain</span>
          </button>
          <button
            type="button"
            onClick={() => wmStore.openDirInGit(workspaceDir)}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
          >
            <GitBranch className="w-3.5 h-3.5 text-orange-400" />
            Git
          </button>
          <button
            type="button"
            disabled={deploying}
            onClick={handleDeployPages}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{deploying ? "Publishing..." : "Publish to GitHub Pages"}</span>
            <span className="sm:hidden">{deploying ? "..." : "Publish"}</span>
          </button>
        </div>
      </div>

      {/* Harness Options Bar (Model, Thinking/Effort, Permissions, Provider, Session flags) */}
      <div
        className={`${
          mobileOptionsOpen ? "flex" : "hidden md:flex"
        } flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-black/25 border-b border-white/8 shrink-0`}
      >
        {agent === "claude" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Claude Model */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Cpu className="w-3 h-3 text-orange-400 shrink-0" />
              <select
                aria-label="Claude Model"
                value={customClaudeInput ? "__custom__" : creds.claudeModel}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomClaudeInput(true);
                  } else {
                    setCustomClaudeInput(false);
                    updateCreds({ claudeModel: e.target.value });
                  }
                }}
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.value} value={m.value} className="bg-[#12141f] text-zinc-100">
                    {m.label}
                  </option>
                ))}
              </select>
              {customClaudeInput && (
                <input
                  value={creds.claudeModel}
                  onChange={(e) => updateCreds({ claudeModel: e.target.value })}
                  placeholder="claude-opus-4-7"
                  className="w-32 px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-[11px] font-mono text-zinc-100 outline-none"
                />
              )}
            </div>

            {/* Claude Thinking / Effort */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Brain className="w-3 h-3 text-fuchsia-400 shrink-0" />
              <select
                aria-label="Claude Thinking Effort"
                value={creds.claudeEffort}
                onChange={(e) => updateCreds({ claudeEffort: e.target.value as ClaudeEffort })}
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {CLAUDE_EFFORTS.map((ef) => (
                  <option key={ef.value} value={ef.value} className="bg-[#12141f] text-zinc-100">
                    {ef.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Claude Permission Mode */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Shield className="w-3 h-3 text-amber-400 shrink-0" />
              <select
                aria-label="Claude Permission Mode"
                value={creds.claudePermissionMode}
                onChange={(e) =>
                  updateCreds({ claudePermissionMode: e.target.value as ClaudePermissionMode })
                }
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {CLAUDE_PERMISSIONS.map((pm) => (
                  <option key={pm.value} value={pm.value} className="bg-[#12141f] text-zinc-100">
                    {pm.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Continue Session */}
            <button
              type="button"
              onClick={() => updateCreds({ claudeContinue: !creds.claudeContinue })}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition ${
                creds.claudeContinue
                  ? "bg-orange-500/20 border-orange-400/40 text-orange-200"
                  : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Continue most recent conversation (--continue)"
            >
              <RotateCcw className="w-3 h-3" />
              Continue
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Pi Provider */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <select
                aria-label="Pi Provider"
                value={creds.piProvider}
                onChange={(e) => updateCreds({ piProvider: e.target.value })}
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {PI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value} className="bg-[#12141f] text-zinc-100">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Pi Model */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Cpu className="w-3 h-3 text-violet-400 shrink-0" />
              <select
                aria-label="Pi Model"
                value={customPiInput ? "__custom__" : creds.piModel}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomPiInput(true);
                  } else {
                    setCustomPiInput(false);
                    updateCreds({ piModel: e.target.value });
                  }
                }}
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {PI_MODELS.map((m) => (
                  <option key={m.value} value={m.value} className="bg-[#12141f] text-zinc-100">
                    {m.label}
                  </option>
                ))}
              </select>
              {customPiInput && (
                <input
                  value={creds.piModel}
                  onChange={(e) => updateCreds({ piModel: e.target.value })}
                  placeholder="provider/model-id"
                  className="w-36 px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-[11px] font-mono text-zinc-100 outline-none"
                />
              )}
            </div>

            {/* Pi Thinking Level */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10">
              <Brain className="w-3 h-3 text-fuchsia-400 shrink-0" />
              <select
                aria-label="Pi Thinking Level"
                value={creds.piThinking}
                onChange={(e) => updateCreds({ piThinking: e.target.value as PiThinking })}
                className="bg-transparent text-[11px] text-zinc-200 outline-none cursor-pointer"
              >
                {PI_THINKING_LEVELS.map((lv) => (
                  <option key={lv.value} value={lv.value} className="bg-[#12141f] text-zinc-100">
                    {lv.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Pi Continue */}
            <button
              type="button"
              onClick={() => updateCreds({ piContinue: !creds.piContinue })}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition ${
                creds.piContinue
                  ? "bg-violet-500/20 border-violet-400/40 text-violet-200"
                  : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Continue most recent session (--continue)"
            >
              <RotateCcw className="w-3 h-3" />
              Continue
            </button>

            {/* Pi Approve */}
            <button
              type="button"
              onClick={() => updateCreds({ piApprove: !creds.piApprove })}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition ${
                creds.piApprove
                  ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                  : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Trust project-local files for this run (--approve)"
            >
              <Shield className="w-3 h-3" />
              Approve
            </button>
          </div>
        )}

        {/* Exact CLI Invocation Preview */}
        <code
          title={cliPreview}
          className="hidden xl:inline-block max-w-[320px] truncate px-2 py-0.5 rounded bg-black/50 border border-white/8 text-[10px] font-mono text-zinc-400"
        >
          $ {cliPreview}
        </code>
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
            title="Start Interactive Agent Session with selected options"
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

          <div className="flex items-center gap-1.5 flex-wrap">
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
            {deployedActionsUrl && (
              <a
                href={deployedActionsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-cyan-500/12 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/20"
              >
                <Activity className="w-3 h-3" />
                Actions
              </a>
            )}
            {deployError && (
              <span className="text-[11px] text-rose-400 truncate max-w-md">{deployError}</span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Pane Switcher (< 1024px) */}
      <div className="flex lg:hidden items-center gap-1 px-2.5 py-1.5 bg-black/45 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane("terminal")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
            mobilePane === "terminal"
              ? "bg-violet-500/25 border border-violet-400/40 text-white"
              : "bg-white/[0.04] text-zinc-400"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Agent Terminal
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("preview")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
            mobilePane === "preview"
              ? "bg-emerald-500/25 border border-emerald-400/40 text-emerald-100"
              : "bg-white/[0.04] text-zinc-400"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Live Preview
          {vmState.detectedPorts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-[10px] font-mono text-emerald-200">
              :{vmState.detectedPorts[0]!.port}
            </span>
          )}
        </button>
      </div>

      {/* Main Split: Agent Kitty Terminal (Left) | Live Webserver Preview (Right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-white/10">
        {/* Left: Agent PTY */}
        <div
          className={`relative flex-col min-h-0 ${
            mobilePane === "terminal" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="hidden sm:flex items-center justify-between px-3 py-1 bg-black/30 border-b border-white/6 text-[11px] text-zinc-400">
            <span className="font-mono flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              Agent PTY · {workspaceDir}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => termHandleRef.current?.write("\x03")}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/30 text-[10px] font-mono text-rose-200"
                title="Interrupt Running Agent (Ctrl+C)"
              >
                <Square className="w-2.5 h-2.5" />
                Stop
              </button>
              <button
                type="button"
                onClick={() => termHandleRef.current?.clear()}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                title="Clear PTY"
              >
                <Eraser className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <KittyTerminalPane
              themeId={cfg.kittyTheme}
              fontSize={cfg.terminalFontSize}
              preferWebGpu={cfg.webgpuTerminal}
              cwd={workspaceDir}
              focused={windowFocused && mobilePane === "terminal"}
              onReady={(h) => {
                termHandleRef.current = h;
              }}
            />
          </div>
        </div>

        {/* Right: Embedded Guest Webserver Preview */}
        <div
          className={`flex-col min-h-0 bg-[#07090f] ${
            mobilePane === "preview" ? "flex" : "hidden lg:flex"
          }`}
        >
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
