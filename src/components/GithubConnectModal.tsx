import { Effect } from "effect";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  KeyRound,
  Loader2,
  LogOut,
  Wifi,
  X,
} from "lucide-react";
import React, { useState } from "react";
import {
  GITHUB_PAT_CREATE_URL,
  INITIAL_GITHUB_AUTH,
} from "../core/github-auth-service.ts";
import { appRuntime, GithubAuthService, useSubscriptionRef } from "../core/runtime.ts";
import { useWm, wmStore } from "../wm/wm-store.ts";

export const GithubConnectModal: React.FC = () => {
  const wm = useWm();
  const auth = useSubscriptionRef(
    Effect.map(GithubAuthService, (g) => g.stateRef),
    INITIAL_GITHUB_AUTH
  );

  const [mode, setMode] = useState<"device" | "token">("device");
  const [tokenInput, setTokenInput] = useState("");
  const [copied, setCopied] = useState(false);

  if (!wm.githubModalOpen) return null;

  const close = () => {
    if (auth.status === "requesting" || auth.status === "awaiting_user") {
      appRuntime.runFork(Effect.flatMap(GithubAuthService, (g) => g.cancelDeviceFlow()));
    }
    wmStore.setGithubModal(false);
  };

  const startDevice = () => {
    appRuntime.runFork(Effect.flatMap(GithubAuthService, (g) => g.startDeviceFlow()));
  };

  const copyAndOpen = () => {
    if (!auth.userCode) return;
    navigator.clipboard.writeText(auth.userCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    window.open(auth.verificationUri, "_blank", "noopener,noreferrer");
  };

  const submitToken = async () => {
    if (!tokenInput.trim()) return;
    const ok = await appRuntime.runPromise(
      Effect.flatMap(GithubAuthService, (g) => g.connectWithToken(tokenInput))
    );
    if (ok) {
      setTokenInput("");
    }
  };

  const signOut = () => {
    appRuntime.runFork(Effect.flatMap(GithubAuthService, (g) => g.signOut()));
  };

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[105] bg-black/60 backdrop-blur-md flex items-center justify-center px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl glass-surface-focused overflow-hidden animate-window-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/15 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Connect GitHub</h2>
              <p className="text-[11px] text-zinc-400">
                Sign in once for git push, gh CLI &amp; 1-click GitHub Pages
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {auth.status === "authenticated" && auth.user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/30">
                {auth.user.avatarUrl ? (
                  <img
                    src={auth.user.avatarUrl}
                    alt={auth.user.login}
                    className="w-11 h-11 rounded-full border border-white/20"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold">
                    {auth.user.login[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <span className="truncate">{auth.user.name}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                  <div className="text-xs font-mono text-emerald-300">@{auth.user.login}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{auth.user.email}</div>
                </div>
              </div>

              <div className="text-xs text-zinc-400 space-y-1">
                <p>✓ <code>gh</code> CLI authenticated &amp; <code>git</code> credential helper active</p>
                <p>✓ Token synced in browser storage &amp; guest <code>~/.unkernelos_env</code></p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("device")}
                  className={`py-1.5 rounded-lg font-medium transition ${
                    mode === "device"
                      ? "bg-violet-500/30 text-white border border-violet-400/35"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  1-Click OAuth Code
                </button>
                <button
                  type="button"
                  onClick={() => setMode("token")}
                  className={`py-1.5 rounded-lg font-medium transition ${
                    mode === "token"
                      ? "bg-violet-500/30 text-white border border-violet-400/35"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Personal Access Token
                </button>
              </div>

              {mode === "device" ? (
                <div className="space-y-4">
                  {auth.status === "awaiting_user" && auth.userCode ? (
                    <div className="space-y-4 text-center">
                      <p className="text-xs text-zinc-300">
                        Copy this one-time code and authorize <strong>GitHub CLI</strong> on GitHub:
                      </p>

                      <div className="py-3.5 px-4 rounded-2xl bg-black/60 border border-violet-400/40 font-mono text-2xl font-bold tracking-[0.22em] text-white select-all">
                        {auth.userCode}
                      </div>

                      <button
                        type="button"
                        onClick={copyAndOpen}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 shadow-lg shadow-violet-600/25 transition"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? "Copied! Opening github.com/login/device..." : "Copy Code & Open GitHub"}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center justify-center gap-2 text-xs text-cyan-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Waiting for authorization in GitHub...
                      </div>
                    </div>
                  ) : auth.status === "requesting" || auth.status === "verifying" ? (
                    <div className="py-6 flex flex-col items-center gap-3 text-center">
                      <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                        {auth.output || "Contacting GitHub..."}
                      </p>
                      {auth.status === "requesting" && (
                        <button
                          type="button"
                          onClick={() =>
                            appRuntime.runFork(
                              Effect.flatMap(GithubAuthService, (g) => g.cancelDeviceFlow())
                            )
                          }
                          className="px-3 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-white/15 border border-white/12 text-zinc-300 transition"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Sign in using GitHub&apos;s official <strong>OAuth Device Flow</strong> via <code>gh</code> inside your Linux VM — no backend, no manual token scopes.
                      </p>
                      <button
                        type="button"
                        onClick={startDevice}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 shadow-lg shadow-violet-600/20 transition"
                      >
                        <GitBranch className="w-4 h-4" />
                        Generate GitHub Sign-In Code
                      </button>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                        <span>Requires active Wisp network in VM</span>
                        <button
                          type="button"
                          onClick={() => {
                            wmStore.setGithubModal(false);
                            wmStore.openApp("settings", { tab: "network" });
                          }}
                          className="flex items-center gap-1 text-cyan-400 hover:underline"
                        >
                          <Wifi className="w-3 h-3" />
                          Wisp Settings
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Generate a pre-scoped token on GitHub (<code>repo</code>, <code>workflow</code>, <code>read:org</code> already checked) and paste it here:
                  </p>
                  <a
                    href={GITHUB_PAT_CREATE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-zinc-100 transition"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    Open Pre-Filled GitHub Token Page
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submitToken()}
                    placeholder="ghp_... or github_pat_..."
                    className="w-full px-3 py-2 rounded-xl bg-black/55 border border-white/15 focus:border-violet-400/60 text-xs font-mono text-zinc-100 outline-none"
                  />
                  <button
                    type="button"
                    disabled={!tokenInput.trim() || auth.status === "verifying"}
                    onClick={() => void submitToken()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-45 transition"
                  >
                    {auth.status === "verifying" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Connect with Token
                  </button>
                </div>
              )}

              {auth.error && (
                <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/30 flex items-start gap-2 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span className="break-words">{auth.error}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
