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
  readonly remoteUrl: string | null;
  readonly files: readonly GitFileStatus[];
  readonly commits: readonly { hash: string; subject: string; date: string; author: string }[];
  readonly pagesUrl: string | null;
}

export interface PagesDeployResult {
  readonly repoUrl: string;
  readonly pagesUrl: string;
  readonly output: string;
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

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
        uses: actions/configure-pages@v5
      - name: Build if package.json exists
        run: |
          if [ -f package.json ]; then
            if command -v bun >/dev/null 2>&1; then
              bun install && bun run build || true
            else
              npm install && npm run build || true
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
  readonly commit: (repoDir: string, message: string) => Effect.Effect<string, GitError>;
  readonly push: (repoDir: string) => Effect.Effect<string, GitError>;
  readonly cloneRepo: (url: string, targetDir: string) => Effect.Effect<string, GitError>;
  readonly deployToGitHubPages: (
    repoDir: string,
    repoName: string,
    commitMessage: string,
    isPrivate?: boolean
  ) => Effect.Effect<PagesDeployResult, GitError>;
}

export class GitService extends Context.Tag("GitService")<GitService, GitApi>() {}

export const GitLive = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const vm = yield* VmService;
    const settings = yield* SettingsService;

    const run = (op: string, script: string) =>
      Effect.gen(function* () {
        const creds = yield* settings.getCredentials;
        const envPrefix = [
          `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"`,
          `export GIT_TERMINAL_PROMPT=0`,
          creds.githubToken ? `export GH_TOKEN=${sq(creds.githubToken)}` : "",
          creds.githubToken ? `export GITHUB_TOKEN=${sq(creds.githubToken)}` : "",
        ]
          .filter(Boolean)
          .join("; ");

        const res = yield* vm.execShell(`${envPrefix}; ${script}`).pipe(
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

    return {
      getStatus: (repoDir) =>
        Effect.gen(function* () {
          const check = yield* run("check", `cd ${sq(repoDir)} && git rev-parse --is-inside-work-tree 2>/dev/null`);
          if (check.exitCode !== 0 || check.stdout.trim() !== "true") {
            return {
              isRepo: false,
              branch: "",
              remoteUrl: null,
              files: [],
              commits: [],
              pagesUrl: null,
            };
          }

          const [branchRes, remoteRes, statusRes, logRes] = yield* Effect.all([
            run("branch", `cd ${sq(repoDir)} && git branch --show-current 2>/dev/null || echo main`),
            run("remote", `cd ${sq(repoDir)} && git remote get-url origin 2>/dev/null || true`),
            run("status", `cd ${sq(repoDir)} && git status --porcelain=v1 2>/dev/null`),
            run("log", `cd ${sq(repoDir)} && git log -n 15 --format='%h%x09%s%x09%cr%x09%an' 2>/dev/null || true`),
          ]);

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

          const remoteUrl = remoteRes.stdout.trim() || null;
          let pagesUrl: string | null = null;
          if (remoteUrl) {
            const m = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i.exec(remoteUrl);
            if (m) {
              pagesUrl = `https://${m[1]}.github.io/${m[2]}/`;
            }
          }

          return {
            isRepo: true,
            branch: branchRes.stdout.trim() || "main",
            remoteUrl,
            files,
            commits,
            pagesUrl,
          };
        }),

      getDiff: (repoDir, filePath) =>
        run(
          "diff",
          filePath
            ? `cd ${sq(repoDir)} && git diff -- ${sq(filePath)} 2>/dev/null; git diff --cached -- ${sq(filePath)} 2>/dev/null`
            : `cd ${sq(repoDir)} && git diff 2>/dev/null; git diff --cached 2>/dev/null`
        ).pipe(Effect.map((r) => r.stdout)),

      initRepo: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run("init", `mkdir -p ${sq(repoDir)} && cd ${sq(repoDir)} && git init -b main`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "init", message: r.stderr || r.stdout }));
          }
        }),

      stageAll: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run("stage", `cd ${sq(repoDir)} && git add -A`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "stage", message: r.stderr || r.stdout }));
          }
        }),

      commit: (repoDir, message) =>
        Effect.gen(function* () {
          const creds = yield* settings.getCredentials;
          const name = creds.gitUserName || "unkernelOS User";
          const email = creds.gitUserEmail || "user@unkernel.os";
          const r = yield* run(
            "commit",
            `cd ${sq(repoDir)} && git config user.name ${sq(name)} && git config user.email ${sq(email)} && git add -A && git commit -m ${sq(message)}`
          );
          if (r.exitCode !== 0) {
            return yield* Effect.fail(
              new GitError({ operation: "commit", message: r.stderr || r.stdout || "Nothing to commit" })
            );
          }
          return r.stdout;
        }),

      push: (repoDir) =>
        Effect.gen(function* () {
          const r = yield* run("push", `cd ${sq(repoDir)} && git push -u origin HEAD`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "push", message: r.stderr || r.stdout }));
          }
          return r.stdout || r.stderr;
        }),

      cloneRepo: (url, targetDir) =>
        Effect.gen(function* () {
          const r = yield* run("clone", `git clone ${sq(url)} ${sq(targetDir)}`);
          if (r.exitCode !== 0) {
            return yield* Effect.fail(new GitError({ operation: "clone", message: r.stderr || r.stdout }));
          }
          return r.stdout || r.stderr;
        }),

      deployToGitHubPages: (repoDir, repoName, commitMessage, isPrivate = false) =>
        Effect.gen(function* () {
          const creds = yield* settings.getCredentials;
          if (!creds.githubToken) {
            return yield* Effect.fail(
              new GitError({
                operation: "deploy-pages",
                message: "GitHub Personal Access Token (GH_TOKEN) not configured. Add it in Settings → Credentials or Git → Auth.",
              })
            );
          }

          const name = creds.gitUserName || "unkernelOS Developer";
          const email = creds.gitUserEmail || "dev@unkernel.os";
          const safeRepo = repoName.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "unkernelos-app";
          const visibility = isPrivate ? "--private" : "--public";

          const script = `
set -e
command -v git >/dev/null 2>&1 || { echo "git is not installed. Open Toolchain Installer first." >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) is not installed. Open Toolchain Installer first." >&2; exit 1; }

cd ${sq(repoDir)}
if [ ! -d .git ]; then
  git init -b main
fi
git config user.name ${sq(name)}
git config user.email ${sq(email)}

# Add GitHub Pages Actions workflow if none exists
mkdir -p .github/workflows
if [ ! -f .github/workflows/pages.yml ]; then
  cat <<'PAGES_YAML_EOF' > .github/workflows/pages.yml
${PAGES_WORKFLOW_YAML}
PAGES_YAML_EOF
fi

git add -A
git diff --cached --quiet || git commit -m ${sq(commitMessage || "Deploy app from unkernelOS")}

GH_USER=$(gh api user --jq .login)
echo "GH_USER=$GH_USER"

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$GH_USER/${safeRepo}" >/dev/null 2>&1; then
    git remote add origin "https://x-access-token:\${GH_TOKEN}@github.com/$GH_USER/${safeRepo}.git"
  else
    gh repo create "${safeRepo}" ${visibility} --source=. --remote=origin --push
  fi
fi

git push -u origin HEAD:main --force-with-lease || git push -u origin HEAD:main

# Enable GitHub Pages via workflow build_type
gh api --method POST "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow 2>/dev/null || \
  gh api --method PUT "/repos/$GH_USER/${safeRepo}/pages" -f build_type=workflow 2>/dev/null || true

echo "REPO_URL=https://github.com/$GH_USER/${safeRepo}"
echo "PAGES_URL=https://$GH_USER.github.io/${safeRepo}/"
          `.trim();

          const res = yield* run("deploy-pages", script);
          if (res.exitCode !== 0) {
            return yield* Effect.fail(
              new GitError({
                operation: "deploy-pages",
                message: res.stderr || res.stdout || "GitHub Pages deployment failed",
                stderr: res.stderr,
              })
            );
          }

          const repoMatch = /^REPO_URL=(.+)$/m.exec(res.stdout);
          const pagesMatch = /^PAGES_URL=(.+)$/m.exec(res.stdout);
          const repoUrl = repoMatch?.[1]?.trim() || "";
          const pagesUrl = pagesMatch?.[1]?.trim() || "";

          yield* vm.notify("Deployed to GitHub Pages", `Live soon at ${pagesUrl}`, "success");
          return { repoUrl, pagesUrl, output: res.stdout };
        }),
    };
  })
);
