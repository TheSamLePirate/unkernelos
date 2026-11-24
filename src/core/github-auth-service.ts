import { Context, Effect, Layer, SubscriptionRef } from "effect";
import type { Pty } from "unkernel";
import { SettingsService } from "./settings.ts";
import { VmService } from "./vm-service.ts";

export interface GithubUser {
  readonly login: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string;
}

export type GithubAuthStatus =
  | "disconnected"
  | "requesting"
  | "awaiting_user"
  | "verifying"
  | "authenticated"
  | "error";

export interface GithubAuthState {
  readonly status: GithubAuthStatus;
  readonly userCode: string | null;
  readonly verificationUri: string;
  readonly user: GithubUser | null;
  readonly error: string | null;
  readonly output: string;
}

export const INITIAL_GITHUB_AUTH: GithubAuthState = {
  status: "disconnected",
  userCode: null,
  verificationUri: "https://github.com/login/device",
  user: null,
  error: null,
  output: "",
};

export const GITHUB_PAT_CREATE_URL =
  "https://github.com/settings/tokens/new?scopes=repo,workflow,read:org&description=unkernelOS";

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

async function fetchGithubUserFromApi(token: string): Promise<GithubUser | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      login?: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };
    if (!data.login) return null;
    return {
      login: data.login,
      name: data.name || data.login,
      email: data.email || `${data.login}@users.noreply.github.com`,
      avatarUrl: data.avatar_url || "",
    };
  } catch {
    return null;
  }
}

export interface GithubAuthApi {
  readonly stateRef: SubscriptionRef.SubscriptionRef<GithubAuthState>;
  readonly checkAuth: () => Effect.Effect<GithubUser | null>;
  readonly startDeviceFlow: () => Effect.Effect<void>;
  readonly cancelDeviceFlow: () => Effect.Effect<void>;
  readonly connectWithToken: (token: string) => Effect.Effect<boolean>;
  readonly signOut: () => Effect.Effect<void>;
}

export class GithubAuthService extends Context.Tag("GithubAuthService")<
  GithubAuthService,
  GithubAuthApi
>() {}

export const GithubAuthLive = Layer.effect(
  GithubAuthService,
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const vm = yield* VmService;
    const stateRef = yield* SubscriptionRef.make<GithubAuthState>(INITIAL_GITHUB_AUTH);

    let activePty: Pty | null = null;

    const closeActivePty = () => {
      if (activePty) {
        try {
          activePty.close();
        } catch {
          // ignore
        }
        activePty = null;
      }
    };

    const hydrateUserFromToken = (token: string) =>
      Effect.gen(function* () {
        const user = yield* Effect.promise(() => fetchGithubUserFromApi(token));
        if (!user) return null;

        const creds = yield* settings.getCredentials;
        const updated = yield* settings.updateCredentials({
          githubToken: token,
          gitUserName: creds.gitUserName || user.name,
          gitUserEmail: creds.gitUserEmail || user.email,
        });
        yield* vm.syncCredentials(updated);

        // Configure gh CLI & git credential helper inside the VM if running
        yield* vm
          .execShell(
            `export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; command -v gh >/dev/null 2>&1 && printf '%s\\n' '${token.replace(/'/g, `'\\''`)}' | gh auth login --hostname github.com --with-token 2>/dev/null && gh auth setup-git 2>/dev/null || true`
          )
          .pipe(Effect.ignore);

        yield* SubscriptionRef.set(stateRef, {
          status: "authenticated" as const,
          userCode: null,
          verificationUri: "https://github.com/login/device",
          user,
          error: null,
          output: `Connected as @${user.login}`,
        });
        return user;
      });

    const checkAuth = (): Effect.Effect<GithubUser | null> =>
      Effect.gen(function* () {
        const creds = yield* settings.getCredentials;
        if (creds.githubToken) {
          const user = yield* hydrateUserFromToken(creds.githubToken);
          if (user) return user;
        }

        // Also check if user already ran `gh auth login` inside persistent /data disk
        const tokenRes = yield* vm
          .execShell(`export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; command -v gh >/dev/null 2>&1 && gh auth token 2>/dev/null`)
          .pipe(Effect.either);

        if (tokenRes._tag === "Right" && tokenRes.right.exitCode === 0) {
          const token = tokenRes.right.stdout.trim();
          if (token) {
            const user = yield* hydrateUserFromToken(token);
            if (user) return user;
          }
        }

        return null;
      });

    const startDeviceFlow = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        closeActivePty();

        const cfg = yield* settings.getConfig;
        if (!cfg.net) {
          yield* SubscriptionRef.set(stateRef, {
            ...INITIAL_GITHUB_AUTH,
            status: "error" as const,
            error: "Network is disabled. Enable Wisp networking in Settings first.",
          });
          return;
        }

        yield* SubscriptionRef.set(stateRef, {
          ...INITIAL_GITHUB_AUTH,
          status: "requesting" as const,
          output: "Requesting one-time device code from github.com...",
        });

        // Ensure gh is available
        const hasGh = yield* vm
          .execShell(`export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; command -v gh`)
          .pipe(Effect.either);

        if (hasGh._tag === "Left" || hasGh.right.exitCode !== 0) {
          yield* SubscriptionRef.set(stateRef, {
            ...INITIAL_GITHUB_AUTH,
            status: "error" as const,
            error: "GitHub CLI (gh) is not installed yet. Install it from Toolchain Installer or use a Personal Access Token below.",
          });
          return;
        }

        const ptyEither = yield* vm
          .spawnPty(
            "/bin/sh",
            [
              "-c",
              `export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; export BROWSER=/bin/true; unset GH_TOKEN GITHUB_TOKEN; gh auth login --hostname github.com --git-protocol https --scopes repo,workflow,read:org --web`,
            ],
            {
              cols: 100,
              rows: 24,
              env: {
                TERM: "xterm-256color",
                BROWSER: "/bin/true",
              },
            }
          )
          .pipe(Effect.either);

        if (ptyEither._tag === "Left") {
          yield* SubscriptionRef.set(stateRef, {
            ...INITIAL_GITHUB_AUTH,
            status: "error" as const,
            error: `Could not start gh auth login: ${ptyEither.left._tag}`,
          });
          return;
        }

        const pty = ptyEither.right;
        activePty = pty;

        // Drive the device flow stream asynchronously
        Effect.runFork(
          Effect.promise(async () => {
            const reader = pty.output.getReader();
            const decoder = new TextDecoder();
            let fullLog = "";
            let sentEnter = false;
            let gotCode = false;

            try {
              while (activePty === pty) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value || value.byteLength === 0) continue;

                fullLog += stripAnsi(decoder.decode(value, { stream: true }));

                const codeMatch = /([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(fullLog);
                if (codeMatch && !gotCode) {
                  gotCode = true;
                  const code = codeMatch[1]!;
                  await Effect.runPromise(
                    SubscriptionRef.update(stateRef, (s) => ({
                      ...s,
                      status: "awaiting_user" as const,
                      userCode: code,
                      output: fullLog.trim(),
                    }))
                  );
                }

                // Auto-press Enter when gh asks "Press Enter to open github.com in your browser..."
                if (!sentEnter && /Press Enter/i.test(fullLog)) {
                  sentEnter = true;
                  await pty.write("\r").catch(() => {});
                }
              }

              const ended = await pty.ended;
              if (activePty !== pty) return;
              activePty = null;

              if (ended.type === "exit" && ended.code === 0) {
                await Effect.runPromise(
                  SubscriptionRef.update(stateRef, (s) => ({
                    ...s,
                    status: "verifying" as const,
                    output: "Authorized! Syncing token & git config...",
                  }))
                );

                const tok = await Effect.runPromise(
                  vm
                    .execShell(`export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; gh auth setup-git 2>/dev/null || true; gh auth token`)
                    .pipe(Effect.either)
                );

                if (tok._tag === "Right" && tok.right.stdout.trim()) {
                  const token = tok.right.stdout.trim();
                  const user = await Effect.runPromise(hydrateUserFromToken(token));
                  await Effect.runPromise(vm.syncDisk());
                  if (user) {
                    await Effect.runPromise(
                      vm.notify("GitHub Connected", `Signed in as @${user.login}`, "success")
                    );
                    return;
                  }
                }
              }

              await Effect.runPromise(
                SubscriptionRef.update(stateRef, (s) => ({
                  ...s,
                  status: "error" as const,
                  error:
                    fullLog.includes("network") || fullLog.includes("lookup") || fullLog.includes("dial")
                      ? "Cannot reach github.com from the VM. Check your Wisp server URL in Settings → Network (Wisp)."
                      : fullLog.trim().split("\n").slice(-3).join(" ") || "GitHub authentication cancelled or failed.",
                  output: fullLog.trim(),
                }))
              );
            } catch (err) {
              if (activePty === pty) {
                activePty = null;
                await Effect.runPromise(
                  SubscriptionRef.update(stateRef, (s) => ({
                    ...s,
                    status: "error" as const,
                    error: err instanceof Error ? err.message : String(err),
                  }))
                );
              }
            } finally {
              reader.cancel().catch(() => {});
            }
          })
        );
      });

    const cancelDeviceFlow = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        closeActivePty();
        const cur = yield* SubscriptionRef.get(stateRef);
        if (cur.status !== "authenticated") {
          yield* SubscriptionRef.set(stateRef, INITIAL_GITHUB_AUTH);
        }
      });

    const connectWithToken = (rawToken: string): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        const token = rawToken.trim();
        if (!token) return false;
        closeActivePty();
        yield* SubscriptionRef.update(stateRef, (s) => ({
          ...s,
          status: "verifying" as const,
          error: null,
        }));

        const user = yield* hydrateUserFromToken(token);
        if (!user) {
          yield* SubscriptionRef.update(stateRef, (s) => ({
            ...s,
            status: "error" as const,
            error: "Invalid GitHub token or unable to reach api.github.com.",
          }));
          return false;
        }
        yield* vm.syncDisk();
        yield* vm.notify("GitHub Connected", `Signed in as @${user.login}`, "success");
        return true;
      });

    const signOut = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        closeActivePty();
        yield* settings.updateCredentials({ githubToken: "" });
        yield* vm.syncCredentials();
        yield* vm
          .execShell(
            `export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"; gh auth logout --hostname github.com 2>/dev/null <<< y || true; git config --global --unset-all url."https://github.com/".insteadOf 2>/dev/null || true`
          )
          .pipe(Effect.ignore);
        yield* vm.syncDisk();
        yield* SubscriptionRef.set(stateRef, INITIAL_GITHUB_AUTH);
        yield* vm.notify("GitHub Disconnected", "Removed GitHub credentials from unkernelOS.", "info");
      });

    return {
      stateRef,
      checkAuth,
      startDeviceFlow,
      cancelDeviceFlow,
      connectWithToken,
      signOut,
    };
  })
);
