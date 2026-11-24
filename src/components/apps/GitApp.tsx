import { Effect } from "effect";
import {
  CheckCircle2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommit,
  Globe,
  RefreshCw,
  Rocket,
  UploadCloud,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import type { GitRepoState } from "../../core/git-service.ts";
import { INITIAL_GITHUB_AUTH } from "../../core/github-auth-service.ts";
import { appRuntime, GithubAuthService, GitService, SettingsService, useSubscriptionRef } from "../../core/runtime.ts";
import { DEFAULT_CREDENTIALS } from "../../core/schema.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

export const GitApp: React.FC = () => {
  const wm = useWm();
  const creds = useSubscriptionRef(
    Effect.map(SettingsService, (s) => s.credsRef),
    DEFAULT_CREDENTIALS
  );
  const ghAuth = useSubscriptionRef(
    Effect.map(GithubAuthService, (g) => g.stateRef),
    INITIAL_GITHUB_AUTH
  );

  const [repoDir, setRepoDir] = useState(wm.activeWorkspaceDir || "/home/user/workspace");
  const [state, setState] = useState<GitRepoState | null>(null);
  const [diff, setDiff] = useState("");
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | undefined>(undefined);
  const [commitMsg, setCommitMsg] = useState("Update app from unkernelOS");
  const [repoName, setRepoName] = useState(() => repoDir.split("/").pop() || "unkernelos-app");
  const [cloneUrl, setCloneUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [pagesUrl, setPagesUrl] = useState<string | null>(null);

  const refresh = useCallback(async (dir = repoDir) => {
    setBusy(true);
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GitService, (g) => g.getStatus(dir)))
    );
    setBusy(false);
    if (res._tag === "Right") {
      setState(res.right);
      if (res.right.pagesUrl) setPagesUrl(res.right.pagesUrl);
      if (res.right.isRepo) {
        const d = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(GitService, (g) => g.getDiff(dir, selectedDiffFile)))
        );
        if (d._tag === "Right") setDiff(d.right);
      }
    } else {
      setOutput(`Error: ${res.left.message}`);
    }
  }, [repoDir, selectedDiffFile]);

  useEffect(() => {
    void refresh(repoDir);
  }, []);

  const runAction = async (label: string, eff: Effect.Effect<unknown, { message: string }, GitService>) => {
    setBusy(true);
    setOutput(`Running ${label}...`);
    const res = await appRuntime.runPromise(Effect.either(eff));
    setBusy(false);
    if (res._tag === "Left") {
      setOutput(`Error (${label}): ${res.left.message}`);
      wmStore.pushToast(`Git ${label} Failed`, res.left.message, "error");
    } else {
      setOutput(typeof res.right === "string" ? res.right || `${label} succeeded.` : `${label} succeeded.`);
      await refresh(repoDir);
    }
  };

  const handleDeployPages = async () => {
    setBusy(true);
    setOutput("Initializing repo, adding GitHub Pages workflow, pushing & activating Pages...");
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(GitService, (g) => g.deployToGitHubPages(repoDir, repoName, commitMsg))
      )
    );
    setBusy(false);
    if (res._tag === "Left") {
      setOutput(`Deploy failed: ${res.left.message}`);
      wmStore.pushToast("GitHub Pages Error", res.left.message, "error");
    } else {
      setPagesUrl(res.right.pagesUrl);
      setOutput(`Published!\nRepo: ${res.right.repoUrl}\nPages: ${res.right.pagesUrl}\n\n${res.right.output}`);
      await refresh(repoDir);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0c13]/94">
      {/* Top Repository Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/45 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <FolderGit2 className="w-4 h-4 text-orange-400 shrink-0" />
          <input
            value={repoDir}
            onChange={(e) => {
              setRepoDir(e.target.value);
              const name = e.target.value.split("/").filter(Boolean).pop();
              if (name) setRepoName(name);
            }}
            onKeyDown={(e) => e.key === "Enter" && refresh(repoDir)}
            className="flex-1 px-2.5 py-1 rounded-lg bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
          />
          <button
            type="button"
            onClick={() => refresh(repoDir)}
            className="p-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-zinc-300"
            title="Refresh Git Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {ghAuth.status === "authenticated" && ghAuth.user ? (
            <button
              type="button"
              onClick={() => wmStore.setGithubModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25 transition"
            >
              {ghAuth.user.avatarUrl ? (
                <img src={ghAuth.user.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              @{ghAuth.user.login}
            </button>
          ) : creds.githubToken ? (
            <button
              type="button"
              onClick={() => wmStore.setGithubModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-300"
            >
              <CheckCircle2 className="w-3 h-3" />
              GitHub Connected
            </button>
          ) : (
            <button
              type="button"
              onClick={() => wmStore.setGithubModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:brightness-110 shadow transition"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Connect GitHub
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden">
        {/* Left: Status, Commit & GitHub Pages Publisher */}
        <div className="md:col-span-5 flex flex-col min-h-0 overflow-y-auto p-3.5 space-y-4">
          {!state?.isRepo ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <p className="text-xs text-zinc-300">
                <code className="text-amber-300">{repoDir}</code> is not a Git repository yet.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction("init", Effect.flatMap(GitService, (g) => g.initRepo(repoDir)))
                }
                className="w-full py-2 rounded-xl text-xs font-medium bg-orange-500/80 hover:bg-orange-500 text-white transition"
              >
                Initialize Git Repository (main)
              </button>

              <div className="pt-2 border-t border-white/8 space-y-2">
                <label className="text-[11px] text-zinc-400">Or clone an existing GitHub repo:</label>
                <div className="flex gap-1.5">
                  <input
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
                  />
                  <button
                    type="button"
                    disabled={!cloneUrl.trim() || busy}
                    onClick={() =>
                      runAction(
                        "clone",
                        Effect.flatMap(GitService, (g) => g.cloneRepo(cloneUrl.trim(), repoDir))
                      )
                    }
                    className="px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-white disabled:opacity-40"
                  >
                    Clone
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Branch & Remote */}
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10">
                <span className="flex items-center gap-1.5 font-mono text-orange-300">
                  <GitBranch className="w-3.5 h-3.5" />
                  {state.branch}
                </span>
                <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                  {state.remoteUrl ?? "No remote yet"}
                </span>
              </div>

              {/* Changed Files */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Changes ({state.files.length})
                </div>
                {state.files.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">Working tree clean.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {state.files.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setSelectedDiffFile(f.path)}
                        className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                          selectedDiffFile === f.path
                            ? "bg-white/12 text-white"
                            : "bg-white/[0.02] text-zinc-300 hover:bg-white/8"
                        }`}
                      >
                        <span className="truncate">{f.path}</span>
                        <span className="text-[10px] text-amber-300 ml-2">
                          {(f.index + f.worktree).trim() || "M"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Commit & Push */}
              <div className="space-y-2 pt-2 border-t border-white/8">
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Commit message..."
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/12 text-xs text-zinc-100 outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy || !commitMsg.trim()}
                    onClick={() =>
                      runAction(
                        "commit",
                        Effect.flatMap(GitService, (g) => g.commit(repoDir, commitMsg))
                      )
                    }
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/16 text-white disabled:opacity-40"
                  >
                    <GitCommit className="w-3.5 h-3.5" />
                    Commit All
                  </button>
                  <button
                    type="button"
                    disabled={busy || !state.remoteUrl}
                    onClick={() =>
                      runAction("push", Effect.flatMap(GitService, (g) => g.push(repoDir)))
                    }
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 disabled:opacity-40"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Push
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 1-Click GitHub Pages Publisher */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/12 to-teal-500/5 border border-emerald-400/25 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Rocket className="w-4 h-4" />
              GitHub Pages Hosting (1-Click)
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Automatically creates a GitHub repository via <code>gh</code>, adds a GitHub Actions Pages workflow, commits, pushes, and activates GitHub Pages.
            </p>
            <input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Repository name"
              className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/12 text-xs font-mono text-zinc-100 outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleDeployPages}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-45 shadow-lg shadow-emerald-500/20 transition"
            >
              <Globe className="w-3.5 h-3.5" />
              {busy ? "Deploying..." : "Commit, Push & Host on GitHub Pages"}
            </button>
            {pagesUrl && (
              <a
                href={pagesUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 border border-emerald-400/30 text-[11px] font-mono text-emerald-300 hover:bg-black/60"
              >
                <span className="truncate">{pagesUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0 ml-2" />
              </a>
            )}
          </div>

          {/* Recent Commits */}
          {state && state.commits.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Recent Commits
              </div>
              <div className="space-y-1">
                {state.commits.slice(0, 6).map((c) => (
                  <div
                    key={c.hash}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/6 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-violet-300">{c.hash}</span>
                      <span className="text-zinc-500 text-[10px]">{c.date}</span>
                    </div>
                    <p className="text-zinc-200 truncate">{c.subject}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Diff & Command Output */}
        <div className="md:col-span-7 flex flex-col min-h-0 bg-[#07090f]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/8 text-xs text-zinc-400">
            <span className="font-mono">{selectedDiffFile ? `Diff: ${selectedDiffFile}` : "Working Diff"}</span>
            {selectedDiffFile && (
              <button
                type="button"
                onClick={() => setSelectedDiffFile(undefined)}
                className="text-[11px] text-cyan-400 hover:underline"
              >
                Show all diffs
              </button>
            )}
          </div>
          <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono leading-relaxed select-text">
            {diff ? (
              diff.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+") && !line.startsWith("+++")
                      ? "text-emerald-300 bg-emerald-500/10"
                      : line.startsWith("-") && !line.startsWith("---")
                      ? "text-rose-300 bg-rose-500/10"
                      : line.startsWith("@@")
                      ? "text-cyan-300"
                      : "text-zinc-400"
                  }
                >
                  {line}
                </div>
              ))
            ) : (
              <span className="text-zinc-600">No unstaged or staged diff to show.</span>
            )}
          </pre>

          {output && (
            <div className="max-h-40 overflow-y-auto p-3 bg-black/60 border-t border-white/10 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap select-text">
              {output}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
