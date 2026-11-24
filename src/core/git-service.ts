import { Context, Effect, Layer } from "effect";
import { GitError } from "./errors.ts";
import { SettingsService } from "./settings.ts";
import { VmService } from "./vm-service.ts";

export interface GitFileStatus {
  readonly path: string;
  readonly index: string;
  readonly worktree: string;
}

export interface GitRepoState {
  readonly isRepo: boolean;
  readonly branch: string;
  readonly branches: readonly string[];
  readonly stashCount: number;
  readonly remoteUrl: string | null;
  readonly files: readonly GitFileStatus[];
  readonly commits: readonly { hash: string; subject: string; date: string; author: string }[];
  readonly pagesUrl: string | null;
  readonly actionsUrl: string | null;
}

export interface PagesDeployResult {
  readonly repoUrl: string;
  readonly pagesUrl: string;
  readonly actionsUrl: string;
  readonly output: string;
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const stripRemoteCredentials = (url: string): string =>
  url.replace(/^(https?:\/\/)[^/@]+@/i, "$1");

const DEFAULT_GITIGNORE = `node_modules/
.DS_Store
.env
.env.local
.env.*.local
*.log
.cache/
__pycache__/
.venv/
`;

const PAGES_WORKFLOW_YAML = `name: Deploy to GitHub Pages

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5
      - name: Setup Bun (if bun lockfile exists)
        if: hashFiles('bun.lock', 'bun.lockb') != ''
        uses: oven-sh/setup-bun@v2
      - name: Setup Node (if package.json exists)
        if: hashFiles('package.json') != ''
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Build if package.json has a build script
        env:
          VITE_BASE_PATH: /\${{ github.event.repository.name }}/
          PUBLIC_URL: /\${{ github.event.repository.name }}/
        run: |
          if [ -f package.json ] && node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.build ? 0 : 1)"; then
            if command -v bun >/dev/null 2>&1 && { [ -f bun.lock ] || [ -f bun.lockb ]; }; then
              bun install
              bun run build
            else
              npm install
              npm run build
            fi
          fi
      - name: Determine publish directory
        id: pub
        run: |
          if [ -d dist ]; then echo "dir=dist" >> "$GITHUB_OUTPUT";
          elif [ -d build ]; then echo "dir=build" >> "$GITHUB_OUTPUT";
          elif [ -d out ]; then echo "dir=out" >> "$GITHUB_OUTPUT";
          else echo "dir=." >> "$GITHUB_OUTPUT"; fi
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: \${{ steps.pub.outputs.dir }}

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

export interface GitApi {
  readonly getStatus: (repoDir: string) => Effect.Effect<GitRepoState, GitError>;
  readonly getDiff: (repoDir: string, filePath?: string) => Effect.Effect<string, GitError>;
  readonly initRepo: (repoDir: string) => Effect.Effect<void, GitError>;
  readonly stageAll: (repoDir: string) => Effect.Effect<void, GitError>;
  readonly stageFile: (repoDir: string, filePath: string) => Effect.Effect<void, GitError>;
  readonly unstageFile: (repoDir: string, filePath: string) => Effect.Effect<void, GitError>;
  readonly discardFile: (repoDir: string, filePath: string) => Effect.Effect<void, GitError>;
  readonly checkoutBranch: (repoDir: string, branch: string, create?: boolean) => Effect.Effect<string, GitError>;
  readonly stash: (repoDir: string, pop?: boolean) => Effect.Effect<string, GitError>;
  readonly commit: (repoDir: string, message: string) => Effect.Effect<string, GitError>;
  readonly push: (repoDir: string) => Effect.Effect<string, GitError>;
  readonly pull: (repoDir: string) => Effect.Effect<string, GitError>;
  readonly setRemote: (repoDir: string, remoteUrl: string) => Effect.Effect<string, GitError>;
  readonly createGithubRepo: (
    repoDir: string,
    repoName: string,
    isPrivate?: boolean
  ) => Effect.Effect<string, GitError>;
  readonly cloneRepo: (url: string, targetDir: string) => Effect.Effect<string, GitError>;
  readonly deployToGitHubPages: (
    repoDir: string,
    repoName: string,
    commitMessage: string,
    isPrivate?: boolean
  ) => Effect.Effect<PagesDeployResult, GitError>;
}

export class GitService extends Context.Tag("GitService")<GitService, GitApi>() {}

/**
 * Generates an ephemeral GIT_ASKPASS shell snippet that authenticates HTTPS git pushes/pulls/clones
 * using GH_TOKEN (either from settings or `gh auth token`) without leaking tokens into `.git/config`.
 */
const GIT_AUTH_PROLOGUE = `
if [ -z "$GH_TOKEN" ] && command -v gh >/dev/null 2>&1; then
  GH_TOKEN="$(gh auth token 2>/dev/null || true)"
  export GH_TOKEN
  export GITHUB_TOKEN="$GH_TOKEN"
fi
if [ -n "$GH_TOKEN" ]; then
  _ASKPASS="/tmp/unkernel-git-askpass-$$.sh"
  cat <<'ASKPASS_EOF' > "$_ASKPASS"
#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*) printf '%s\\n' "$GH_TOKEN" ;;
  *) printf '%s\\n' '' ;;
esac
ASKPASS_EOF
  chmod 700 "$_ASKPASS"
  export GIT_ASKPASS="$_ASKPASS"
  trap 'rm -f "$_ASKPASS"' EXIT
fi
`.trim();

const ENSURE_GITIGNORE_SNIPPET = `
if [ ! -f .gitignore ]; then
  cat <<'GITIGNORE_EOF' > .gitignore
${DEFAULT_GITIGNORE}GITIGNORE_EOF
fi
`.trim();

export const GitLive = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const vm = yield* VmService;
    const settings = yield* SettingsService;

    const run = (op: string, script: string, withAuth = false) =>
      Effect.gen(function* () {
        const creds = yield* settings.getCredentials;
        const envPrefix = [
          `export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"`,
          `export GIT_TERMINAL_PROMPT=0`,
          creds.githubToken ? `export GH_TOKEN=${sq(creds.githubToken)}` : "",
          creds.githubToken ? `export GITHUB_TOKEN=${sq(creds.githubToken)}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const fullScript = withAuth
          ? `${envPrefix}\n${GIT_AUTH_PROLOGUE}\n${script}`
          : `${envPrefix}\n${script}`;

        const res = yield* vm.execShell(fullScript).pipe(
          Effect.mapError(
            (e) =>
              new GitError({
                operation: op,
                message: "stderr" in e ? e.stderr : `VM error: ${e._tag}`,
                cause: e,
              })
          )
        );
        return res;
      });

    const parseGithubMeta = (remoteUrl: string | null): { pagesUrl: string | null; actionsUrl: string | null } => {
      if (!remoteUrl) return { pagesUrl: null, actionsUrl: null };
      const clean = stripRemoteCredentials(remoteUrl);
      const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i.exec(clean);
      if (!m) return { pagesUrl: null, actionsUrl: null };
      const owner = m[1]!;
      const repo = m[2]!;
      return {
        pagesUrl: `https://${owner.toLowerCase()}.github.io/${repo}/`,
        actionsUrl: `https://github.com/${owner}/${repo}/actions`,
      };
    };

    return {
      getStatus: (repoDir) =>
        Effect.gen(function* () {
          const check = yield* run(
            "check",
            `[ -d ${sq(repoDir)} ] && cd ${sq(repoDir)} && git rev-parse --is-inside-work-tree 2>/dev/null`
          );
          if (check.exitCode !== 0 || check.stdout.trim() !== "true") {
            return {
              isRepo: false,
              branch: "",
              branches: [],
              stashCount: 0,
              remoteUrl: null,
              files: [],
              commits: [],
              pagesUrl: null,
              actionsUrl: null,
            };
          }

          const [branchRes, branchesRes, stashRes, remoteRes, statusRes, logRes] = yield* Effect.all([
            run("branch", `cd ${sq(repoDir)} && git branch --show-current 2>/dev/null || echo main`),
            run("branches", `cd ${sq(repoDir)} && git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null || true`),
            run("stash", `cd ${sq(repoDir)} && git stash list 2>/dev/null | wc -l`),
            run("remote", `cd ${sq(repoDir)} && git remote get-url origin 2>/dev/null || true`),
            run("status", `cd ${sq(repoDir)} && git status --porcelain=v1 2>/dev/null`),
            run(
              "log",
              `cd ${sq(repoDir)} && git log -n 15 --format='%h%x09%s%x09%cr%x09%an' 2>/dev/null || true`
            ),
          ]);

          const branches = branchesRes.stdout
            .split("\n")
            .map((b) => b.trim())
            .filter(Boolean);
          const stashCount = Number(stashRes.stdout.trim()) || 0;

          const files: GitFileStatus[] = statusRes.stdout
            .split("\n")
            .filter((l) => l.length >= 4)
            .map((l) => ({
              index: l[0]!,
              worktree: l[1]!,
              path: l.slice(3).trim(),
            }));

          const commits = logRes.stdout
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .map((l) => {
              const [hash = "", subject = "", date = "", author = ""] = l.split("\t");
              return { hash, subject, date, author };
            });

          const rawRemote = remoteRes.stdout.trim() || null;
          const remoteUrl = rawRemote ? stripRemoteCredentials(rawRemote) : null;
          const { pagesUrl, actionsUrl } = parseGithubMeta(remoteUrl);
          const curBranch = branchRes.stdout.trim() || "main";

          return {
            isRepo: true,
            branch: curBranch,
            branches: branches.length > 0 ? branches : [curBranch],
            stashCount,
            remoteUrl,
            files,
            commits,
            pagesUrl,
            actionsUrl,
          };
        }),

      getDiff: (repoDir, filePath) =>
        run(
          "diff",
          filePath
            ? `cd ${sq(repoDir)} && { git diff -- ${sq(filePath)} 2>/dev/null; git diff --cached -- ${sq(filePath)} 2>/dev/null; git ls-files --others --exclude-standard -- ${sq(filePath)} | while IFS= read -r f; do echo "=== New untracked file: $f ==="; head -c 16384 "$f" 2>/dev/null; done; }`
            : `cd ${sq(repoDir)} && { git diff 2>/dev/null; git diff --cached 2>/dev/null; }`
        ).pipe(Effect.map((r) => r.stdout)),

      initRepo: (repoDir) =>
        Effect.gen(function* () {
          const creds = yield* settings.getCredentials;
          const name = creds.gitUserName || "unkernelOS Developer";
          const email = creds.gitUserEmail || "dev@unkernel.os";
          const r = yield* run(
            "init",
            `set -e
mkdir -p ${sq(repoDir)}
cd ${sq(repoDir)}
git init -b main
git config user.name ${sq(name)}
git config user.email ${sq(email)}
${ENSURE_GITIGNORE_SNIPPET}`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "init", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
        }),

      stageAll: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run("stage", `cd ${sq(repoDir)} && git add -A`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "stage", message: r.stderr || r.stdout }));
          }
        }),

      stageFile: (repoDir, filePath) =>
        Effect.gen(function* () {
          const r = yield* run("stage-file", `cd ${sq(repoDir)} && git add -- ${sq(filePath)}`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "stage-file", message: r.stderr || r.stdout }));
          }
        }),

      unstageFile: (repoDir, filePath) =>
        Effect.gen(function* () {
          const r = yield* run(
            "unstage-file",
            `cd ${sq(repoDir)} && (git restore --staged -- ${sq(filePath)} 2>/dev/null || git reset HEAD -- ${sq(filePath)})`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "unstage-file", message: r.stderr || r.stdout }));
          }
        }),

      discardFile: (repoDir, filePath) =>
        Effect.gen(function* () {
          const r = yield* run(
            "discard-file",
            `cd ${sq(repoDir)} && (git checkout -- ${sq(filePath)} 2>/dev/null || rm -rf -- ${sq(filePath)})`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "discard-file", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
        }),

      checkoutBranch: (repoDir, branch, create = false) =>
        Effect.gen(function* () {
          const clean = branch.trim();
          const flag = create ? "-b" : "";
          const r = yield* run(
            "checkout",
            `cd ${sq(repoDir)} && git checkout ${flag} ${sq(clean)} 2>&1`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "checkout", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout || r.stderr || `Switched to ${clean}`;
        }),

      stash: (repoDir, pop = false) =>
        Effect.gen(function* () {
          const r = yield* run(
            "stash",
            `cd ${sq(repoDir)} && git stash ${pop ? "pop" : "push -u"} 2>&1`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "stash", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout || r.stderr || (pop ? "Stash popped" : "Changes stashed");
        }),

      commit: (repoDir, message) =>
        Effect.gen(function* () {
          const creds = yield* settings.getCredentials;
          const name = creds.gitUserName || "unkernelOS Developer";
          const email = creds.gitUserEmail || "dev@unkernel.os";
          const r = yield* run(
            "commit",
            `set -e
cd ${sq(repoDir)}
git config user.name ${sq(name)}
git config user.email ${sq(email)}
${ENSURE_GITIGNORE_SNIPPET}
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit (working tree clean)."
  exit 0
fi
git commit -m ${sq(message)}`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(
              new GitError({ operation: "commit", message: r.stderr || r.stdout || "Commit failed" })
            );
          }
          yield* vm.syncDisk();
          return r.stdout;
        }),

      push: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run(
            "push",
            `set -e
cd ${sq(repoDir)}
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "No commits yet. Commit your changes before pushing." >&2
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No 'origin' remote configured. Click 'Create GitHub Repo' or set a remote URL first." >&2
  exit 1
fi
# Strip any legacy embedded credentials from origin URL before pushing with GIT_ASKPASS
CUR_URL="$(git remote get-url origin)"
CLEAN_URL="$(printf '%s' "$CUR_URL" | sed -E 's#^(https?://)[^/@]+@#\\1#')"
if [ "$CUR_URL" != "$CLEAN_URL" ]; then
  git remote set-url origin "$CLEAN_URL"
fi
BRANCH="$(git branch --show-current 2>/dev/null || echo main)"
[ -z "$BRANCH" ] && BRANCH="main"
git push -u origin "HEAD:$BRANCH" 2>&1`,
            true
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "push", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout || r.stderr || "Pushed successfully.";
        }),

      pull: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run(
            "pull",
            `set -e
cd ${sq(repoDir)}
git pull --rebase 2>&1`,
            true
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "pull", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout || r.stderr || "Up to date.";
        }),

      setRemote: (repoDir, remoteUrl) =>
        Effect.gen(function* () {
          const clean = stripRemoteCredentials(remoteUrl.trim());
          const r = yield* run(
            "remote",
            `set -e
cd ${sq(repoDir)}
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin ${sq(clean)}
else
  git remote add origin ${sq(clean)}
fi
echo "origin -> ${clean}"`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "remote", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout.trim();
        }),

      createGithubRepo: (repoDir, repoName, isPrivate = false) =>
        Effect.gen(function* () {
          const safeRepo = repoName.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "unkernelos-app";
          const visibility = isPrivate ? "--private" : "--public";
          const r = yield* run(
            "create-repo",
            `set -e
command -v gh >/dev/null 2>&1 || { echo "gh CLI is not installed." >&2; exit 1; }
[ -n "$GH_TOKEN" ] || { echo "GitHub not connected. Click 'Connect GitHub' in the top bar first." >&2; exit 1; }
cd ${sq(repoDir)}
GH_USER="$(gh api user --jq .login)"
if ! gh repo view "$GH_USER/${safeRepo}" >/dev/null 2>&1; then
  gh repo create "$GH_USER/${safeRepo}" ${visibility} --description "Created in unkernelOS"
fi
REMOTE_URL="https://github.com/$GH_USER/${safeRepo}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi
echo "Connected origin -> $REMOTE_URL"`,
            true
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "create-repo", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout.trim();
        }),

      cloneRepo: (url, targetDir) =>
        Effect.gen(function* () {
          const clean = stripRemoteCredentials(url.trim());
          const r = yield* run(
            "clone",
            `set -e
mkdir -p "$(dirname ${sq(targetDir)})"
git clone ${sq(clean)} ${sq(targetDir)} 2>&1`,
            true
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "clone", message: r.stderr || r.stdout }));
          }
          yield* vm.syncDisk();
          return r.stdout || r.stderr;
        }),

      deployToGitHubPages: (repoDir, repoName, commitMessage, isPrivate = false) =>
        Effect.gen(function* () {
          const creds = yield* settings.getCredentials;
          const name = creds.gitUserName || "unkernelOS Developer";
          const email = creds.gitUserEmail || "dev@unkernel.os";
          const safeRepo = repoName.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "unkernelos-app";
          const visibility = isPrivate ? "--private" : "--public";

          const script = `
set -e
command -v git >/dev/null 2>&1 || { echo "git is not installed. Open Toolchain Installer first." >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) is not installed. Open Toolchain Installer first." >&2; exit 1; }

if [ -z "$GH_TOKEN" ]; then
  echo "GitHub account not connected. Click 'Connect GitHub' in the top bar first." >&2
  exit 1
fi

mkdir -p ${sq(repoDir)}
cd ${sq(repoDir)}

# Verify directory has at least one project file (ignoring .git)
if [ -z "$(find . -maxdepth 2 -mindepth 1 ! -name '.git' ! -name '.gitignore' 2>/dev/null | head -n1)" ]; then
  echo "Workspace ${repoDir} has no project files yet. Build or create files first." >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main
fi
git config user.name ${sq(name)}
git config user.email ${sq(email)}
${ENSURE_GITIGNORE_SNIPPET}

# Ensure branch is named main
CUR_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ -n "$CUR_BRANCH" ] && [ "$CUR_BRANCH" != "main" ]; then
  git branch -M main
fi

# Add GitHub Pages Actions workflow if none exists
mkdir -p .github/workflows
if [ ! -f .github/workflows/pages.yml ] && [ ! -f .github/workflows/deploy-pages.yml ]; then
  cat <<'PAGES_YAML_EOF' > .github/workflows/pages.yml
${PAGES_WORKFLOW_YAML}PAGES_YAML_EOF
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m ${sq(commitMessage || "Deploy app from unkernelOS")}
elif ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Nothing to commit in ${repoDir}." >&2
  exit 1
fi

GH_USER="$(gh api user --jq .login)"
if [ -z "$GH_USER" ]; then
  echo "Could not resolve GitHub username. Verify your GitHub connection and Wisp network." >&2
  exit 1
fi
echo "GH_USER=$GH_USER"

# Create GitHub repo if it does not exist yet
if ! gh repo view "$GH_USER/${safeRepo}" >/dev/null 2>&1; then
  echo "Creating repository $GH_USER/${safeRepo} (${visibility})..."
  gh repo create "$GH_USER/${safeRepo}" ${visibility} --description "Built & hosted via unkernelOS"
fi

REMOTE_URL="https://github.com/$GH_USER/${safeRepo}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

# Enable GitHub Pages (workflow build_type) BEFORE push so the first push deploys cleanly
gh api --method POST "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow >/dev/null 2>&1 || \
  gh api --method PUT "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow >/dev/null 2>&1 || true

echo "Pushing branch main to $REMOTE_URL..."
if ! git push -u origin HEAD:main 2>&1; then
  echo "Remote main diverged, updating with --force-with-lease..."
  git fetch origin main >/dev/null 2>&1 || true
  git push -u origin HEAD:main --force-with-lease 2>&1
fi

# Ensure Pages is active after push too (required on some accounts until first branch exists)
gh api --method POST "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow >/dev/null 2>&1 || \
  gh api --method PUT "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow >/dev/null 2>&1 || true

ACTUAL_PAGES="$(gh api "/repos/$GH_USER/${safeRepo}/pages" --jq .html_url 2>/dev/null || true)"
if [ -z "$ACTUAL_PAGES" ]; then
  ACTUAL_PAGES="https://$(printf '%s' "$GH_USER" | tr '[:upper:]' '[:lower:]').github.io/${safeRepo}/"
fi

echo "REPO_URL=https://github.com/$GH_USER/${safeRepo}"
echo "PAGES_URL=$ACTUAL_PAGES"
echo "ACTIONS_URL=https://github.com/$GH_USER/${safeRepo}/actions"
          `.trim();

          const res = yield* run("deploy-pages", script, true);
          if (res.exitCode !== 0) {
            return yield* Effect.fail(
              new GitError({
                operation: "deploy-pages",
                message: res.stderr || res.stdout || "GitHub Pages deployment failed",
                stderr: res.stderr,
              })
            );
          }

          yield* vm.syncDisk();

          const repoMatch = /^REPO_URL=(.+)$/m.exec(res.stdout);
          const pagesMatch = /^PAGES_URL=(.+)$/m.exec(res.stdout);
          const actionsMatch = /^ACTIONS_URL=(.+)$/m.exec(res.stdout);
          const repoUrl = repoMatch?.[1]?.trim() || "";
          const pagesUrl = pagesMatch?.[1]?.trim() || "";
          const actionsUrl = actionsMatch?.[1]?.trim() || `${repoUrl}/actions`;

          yield* vm.notify("Deployed to GitHub Pages", `Workflow triggered — live soon at ${pagesUrl}`, "success");
          return { repoUrl, pagesUrl, actionsUrl, output: res.stdout };
        }),
    };
  })
);
