<img src="assets/icon.svg" width="64" height="64" alt="unkernelOS">

# unkernelOS

Full Graphical Linux Operating System & AI Coding Studio in the browser, powered by **[pithings/unkernel](https://github.com/pithings/unkernel)**, **Bun**, **TypeScript**, **Effect-TS**, **React 19**, **Tailwind CSS v4**, and **WebGPU**.

## Features

- **Real Linux 7.x Kernel in WebAssembly** (`unkernel`) with aarch64 `kwemu` JIT, real MMU, SMP multi-vCPU Web Workers (`1–16` cores), configurable RAM (`256–3072 MiB`), persistent ext4 IndexedDB storage (`4–1024 GiB`, export/import/reset), and live VM suspend/resume snapshots.
- **Alpine 3.24 & Debian 13** served lazily via HTTP Range (`206 Partial Content`) with automatic SHA-256 verification and local caching via Bun + Effect-TS.
- **WebGPU Acceleration**:
  - **Kitty-like Terminal**: `@xterm/headless` VT engine + custom WGSL instanced glyph atlas renderer (tabs, horizontal/vertical splits, 5 Kitty themes, clickable `localhost:<port>` badges, automatic Canvas2D fallback).
  - **`/dev/fb0` Framebuffer Presenter**: Direct WebGPU RGBA texture upload with Crisp, Smooth, and CRT shaders + `evdev` keyboard/mouse capture + ALSA Web Audio.
  - **Animated Dark Glass Aurora Wallpaper**: Low-power WGSL shader.
- **Guest 3D GL (`/dev/dri`) & Wayland (`wland`)** (Debian): Mesa VirGL hardware acceleration via `virgl.wasm` (WebGL2) + embedded `wland` Wayland compositor over `/dev/kwshm` + `vsock:1023`.
- **Agent Studio (Prompt → Build → Test → Preview → GitHub Pages)**:
  - Choose **Claude Code** or **Pi** (`@earendil-works/pi-coding-agent`).
  - Automatic listening port detection (`/proc/net/tcp`) + live embedded Webserver Preview (`/vm/<vmId>/<port>/` Service Worker + WebSocket HMR bridge over `vsock`).
  - Integrated **Git & 1-Click GitHub Pages** publisher (`git` + `gh` + automatic GitHub Actions workflow).
- **1-Click Toolchain Installer**: `git`, `gh`, `python3`, `pip`, `node`, `bun`, `claude`, `pi`, Mesa VirGL, and Wayland apps.
- **100% Client-Side Credentials & Custom Wisp Server**: Configure your `wss://` Wisp relay (or pass `?wisp=wss://...`), Anthropic/OpenAI/Gemini/OpenRouter keys, and GitHub PAT directly in **Settings**.

## Quick Start

```bash
bun install
bun run dev
# Open http://localhost:3080 (requires Chrome/Edge 137+, Firefox 153+, or Safari 27+ for JSPI)
```

### Pre-fetch Distro Images (Optional)

```bash
bun run fetch-distros           # Downloads & caches alpine.erofs and debian.erofs
```

### Production Build & Server

```bash
bun run build
bun run start                   # Serves dist/ + Range /distros/*.erofs + COOP/COEP headers on :3080
```
