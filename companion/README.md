# unkernelOS Companion

Native Rust macOS app using Rune (pinned to the same revision as the existing Rune settings app). Runs a local Wisp relay, serves the browser OS and bridges **the complete live OS API** to external agents through **MCP and a JSON CLI**. The VM itself continues to execute in the browser.

## Build and run

```sh
bun install
bun run fetch-distros
scripts/build-companion.sh
open '.cache/companion/unkernelOS Companion.app'
```

Apple Silicon build on the current Mac. The bundle contains web assets, the kernel and Alpine/Debian images; Bun and Node are not needed to run it. It is signed ad hoc, not notarized. CLI binary: `.cache/companion/unkernelOS Companion.app/Contents/MacOS/unkernelos-companion`.

For development: `cargo run --manifest-path companion/Cargo.toml`, or `cargo run --manifest-path companion/Cargo.toml --no-default-features -- serve` for a headless service. Build web assets first with `bun run build`.

The native window can close while the menu bar service keeps running. Quit from the tray or Cmd-Q to stop it. Open the OS at **http://127.0.0.1:17891** using the native app. Keep its browser tab open and responsive for agents. The VM requires the browser capabilities checked by unkernel (including WebAssembly JSPI); opening the companion URL cannot add missing engine features. The end-to-end suite here is verified in Chromium, not Safari or Arc. The companion does not keep a suspended browser VM executing.

## Full JSON CLI

`unkernelos-companion` is the binary name; use its absolute bundle path or a symlink on your PATH.

```sh
unkernelos-companion sessions
unkernelos-companion schema
unkernelos-companion call system.info
unkernelos-companion system.info                     # shorthand
unkernelos-companion guest.exec --params '{"script":"pwd; uname -a"}'
unkernelos-companion guest.fs.list --params '{"path":"/home/user"}'
unkernelos-companion guest.fs.write --params '{"path":"/tmp/example.txt","content":"hello"}'
unkernelos-companion guest.fs.read --params '{"path":"/tmp/example.txt"}'
unkernelos-companion horizon.sessions
unkernelos-companion horizon.session.read --params '{"windowId":"<app-window-id>"}'
```

Use `--session <id>` to select a browser explicitly. Multiple sessions require a selection; the CLI never guesses. `--stdin` reads a JSON parameter object instead of `--params`. JSON result on stdout, JSON error on stderr with exit 1. No shell expansion or command generation by the companion. `guest.exec` explicitly targets the Linux VM; your agent's ordinary shell still targets the Mac. Guest exec has a 1–60 second timeout and 128 KiB limit per output stream. File reads support offset/length and UTF-8/base64, up to 256 KiB per call; writes are limited to 256 KiB. Use commands inside the guest for larger transfers or background jobs.

**Every method in `schema` is callable**, including UI/window control, clipboard, shared app context/actions, app installation, previews, Git, and capabilities published by future apps through `horizon.session.*`. No separate CLI list needs maintaining. App actions retain their revision/requestId replay checks. Private sessions require their existing explicit grants. All external calls are recorded with source `mcp` and pass the OS agent firewall (automatic/supervised/read-only).

## Discover skills (OS and VM only)

```sh
unkernelos-companion skills
unkernelos-companion skills list --scope builtin
unkernelos-companion skills search "desktop windows"
unkernelos-companion skills read unkernelos-os-control
unkernelos-companion skills list --scope guest --root /home/user/project/.agents/skills
unkernelos-companion skills read 'guest:/home/user/project/.agents/skills/my-skill/SKILL.md'
```

`list`/`search` return names, descriptions, ids, locations and content hashes; `read` returns one complete SKILL.md and a guide translating its guest `osctl` calls to the external CLI/MCP transport. Read does not execute instructions. Use `--session` to select a browser.

The canonical built-in skills cover OS control, visual modding and reactive mods. The guest scan discovers `$HOME/.agents/skills`, `$HOME/.claude/skills`, `$HOME/.pi/agent/skills`, `$HOME/.codex/skills` plus `.agents/skills` and `.claude/skills` in the active guest workspace. `--root` specifies Linux VM paths. **Mac skill folders are never scanned.** Exact copies merge by content hash; modified versions retain distinct ids. Discovery loads at most 64 guest skills per call, 64 KiB per file, returning truncation/warnings rather than pretending a partial scan is complete. Split large catalogs using explicit roots.

The same discovery is available through `skills.list` and `skills.read` in `schema`, `call`, the internal guest CLI and MCP `companion_call`. Skills remain available in OS read-only mode. The VM must run to scan guest files; built-in metadata remains available through the connected browser while it boots.

## MCP

Use the **same binary** as a stdio MCP server:

```json
{
  "mcpServers": {
    "unkernelOS": {
      "command": "/absolute/path/unkernelOS Companion.app/Contents/MacOS/unkernelos-companion",
      "args": ["mcp"]
    }
  }
}
```

The native Agents & CLI page copies the actual absolute-path configuration. This works with agents that support stdio MCP; paste it into that agent's configuration format. No agent config is modified automatically.

Tools: `companion_sessions`, `companion_schema`, `companion_call`. These expose the whole live API through three stable tools, keeping schemas current across app additions. A local Streamable HTTP MCP endpoint also exists at `/mcp` and requires the bearer in the connection descriptor. The official Rust MCP SDK handles negotiation and transport framing. The stdio adapter reads the descriptor on every tool call, so native restarts/key rotation do not require restarting the agent adapter.

## Local networking and authorization

- Binds **127.0.0.1 only**, stable port 17891. Exact Host and browser Origin checks reject other websites and DNS rebinding.
- A same-origin bootstrap issues a separate HttpOnly, SameSite=Strict browser cookie. WebSockets require that cookie and the exact Origin. Agent endpoints require a bearer; no token in URLs or browser JavaScript.
- Descriptor: `~/Library/Application Support/unkernelOS Companion/connection.json`, directory mode 0700, file mode 0600. This trusts processes running under the same Mac user. It is not a sandbox against malicious programs already running as you.
- Native key renewal disconnects browser/agent calls and invalidates old HTTP credentials. Local CLI/MCP adapters automatically load the replacement owner credential.
- Local mode forces the VM's sole Wisp URL to `/wisp` on this companion. **No remote fallback.** The relay supports Wisp 1.2 TCP/UDP with library flow control, per-connection stream limits, socket cleanup and a native network pause switch. It intentionally allows VM access to the Mac/LAN as a local relay; do not pair untrusted guest workloads expecting network isolation.
- COOP/COEP and range requests support SharedArrayBuffer, workers and distro streaming. Authentication and MCP routes bypass the PWA cache.
- Pending calls fail when a browser disconnects. No mutations are retried. A lost reply or timeout may mean a mutation already executed; inspect state before retrying.

## Storage and migration

The local address is a **new browser origin**. It does not inherit your public site's IndexedDB, cookies, settings or session context. Each browser profile has its own VM data.

To migrate Linux files, export `.kwsparse` from the old OS's Settings → Disque & Snapshots VM, then import that image from the local OS's same settings. This covers the persistent data disk; browser settings, Sonora's audio library and desktop context are separate and are not automatically transferred. Keep the old origin/profile until you verify the import. Do not clear browser storage expecting the companion to hold a backup.

Developer overrides: `UNKERNELOS_COMPANION_PORT`, `UNKERNELOS_COMPANION_HOME`, `UNKERNELOS_COMPANION_WEB`, `UNKERNELOS_COMPANION_DISTROS`. Changing the port changes browser origin/storage. Tests should use an isolated support directory and browser profile.

## Verification

```sh
cargo test --manifest-path companion/Cargo.toml --no-default-features
cargo clippy --manifest-path companion/Cargo.toml --all-targets -- -D warnings
bun run typecheck
bun test test
```

See `scripts/test-companion.mjs` for real-browser, Wisp and external-agent integration checks. No native login auto-start or system-wide installation is performed.

Sources consulted: Rune's pinned source/README (AppSpec, tray, app lifetime and tooling), wisp-mux 5.1.0 source and Wisp protocol, rmcp 3.11.0 source/tests, Axum 0.8.9 WebSocket and tower-http static-serving documentation. See THIRD_PARTY.md for licenses and relinking instructions.
