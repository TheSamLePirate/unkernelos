<img src="assets/icon.svg" width="64" height="64" alt="unkernelOS">

# unkernelOS

Full Graphical, **100% Moddable & Reactive** Linux Operating System & AI Coding Studio in the browser, powered by **[pithings/unkernel](https://github.com/pithings/unkernel)**, **Bun**, **TypeScript**, **Effect-TS**, **React 19**, **Tailwind CSS v4**, **Three.js WebGPU**, and **Rust/WASM**.

## Features

- **Real Linux 7.x Kernel in WebAssembly** (`unkernel`) with aarch64 `kwemu` JIT, real MMU, SMP multi-vCPU Web Workers (`1–16` cores), configurable RAM (`256–3072 MiB`), persistent ext4 IndexedDB storage (`4–1024 GiB`, export/import/reset), and live VM suspend/resume snapshots.
- **Pre-Installed Debian 13 & Alpine 3.24** served lazily via HTTP Range (`206 Partial Content`) with `git`, `gh`, `python3` (+ numpy/matplotlib), `node`, `bun`, `rustc`/`cargo`, `ocaml`, `microML`, `sqlite3`, **Claude Code**, **Pi Coding Agent**, Mesa VirGL 3D, and Wayland (`wland` + `foot`).
- **3D Spatial WebGPU Desktop (Three.js TSL)**:
  - Real interactive double-sided OS windows, Super Dock, Taskbar & Global Menu floating in 3D space.
  - 6 cinematic 3D worlds (Ocean Sunset, Alpine Fjord, NASA 4K Earth Orbit with Volumetric Rayleigh+Mie Atmosphere, Jupiter Orbit, Lunar Horizon & Earthrise, Aurora Borealis) + sharp 4K Poly Haven HDRIs + ZQSD/Arrows/Mouse/Trackpad/Touch controls + 5 spatial layouts (`curved-cockpit`, `spatial-grid`, `compiz-cube`, `studio-desk`, `gallery-ring`).
- **Complete OS Modding Engine & 16 OS Variants**:
  - Transform the entire desktop paradigm in 1 click: Windows 95 → XP → 11, Linux XFCE / GNOME / KDE Plasma / Compiz / Hyprland, macOS Sequoia / Aqua / iOS SpringBoard / visionOS, Cyberpunk, Swiss Minimal.
  - 14 window decorators, full Window FX (`spring`/`genie`/`zoom`/`flip3d`/`fade`, Wobbly, Burn, Hover Tilt 3D, Chroma), Eye-Candy Engine (Spotlight, Trails, 60fps Particles, Night Shift, 6 Color Profiles, 5 WebAudio Sound Packs, 4 Hot Corners), Dock Pro, and AAA Unified Settings Panel.
- **Reactive Real-Time Data Engine & Injectable Surfaces**:
  - **Programmable Data Sources**: run `sh`, `python3`, `bun`, `node` inside Linux, fetch Internet APIs (`http`), or run unrestricted browser `js` to feed the live Signal Bus (`sys.cpu`, `sys.gpu`, `sys.ram`, `sys.disk`, `sys.procs`, `agent.tokens`, `time.daylight`, `weather.*`, `custom.*`).
  - **20-Float Live WGSL Shader Uniforms** (`u.cpu..u.custom3`) + `:root` `--sig-*` CSS custom properties + live expression bindings (`lerpColor`, `mapRange`, `clamp`, `hsl`) + unrestricted JS controllers (`onTick`).
  - **Injectable HTML, Iframe & 60fps Canvas Surfaces** mountable on 7 OS slots: `wallpaper`, `desktop`, `overlay`, `topbar`, `dock`, `titlebar`, and `3d-panel`.
  - Full Mod Pack v3 `.json` export/import covering all static + reactive mods & surfaces.
- **Agent-Native OS API (`osctl` + MCP Server `osctl mcp` + Auto-Installed Guest Skills)**:
  - Automatically syncs `~/CLAUDE.md`, `~/AGENTS.md`, `~/.claude.json` MCP config, and 3 dedicated **Agent Skills** (`unkernelos-modding`, `unkernelos-reactive-mods`, `unkernelos-os-control`) into `~/.claude/skills/`, `~/.pi/agent/skills/`, and `~/.agents/skills/`.
- **WebGPU Acceleration & Rust Rune Liquid Metal**:
  - WebGPU Kitty Terminal, `/dev/fb0` Presenter (Crisp/Smooth/CRT), Live WGSL Wallpaper Engine, Guest 3D GL (`virgl.wasm`), Wayland Compositor (`wland`), and Rust WASM Liquid Metal Telemetry app.

## Quick Start

```bash
bun install
bun run dev
# Open http://localhost:3080 (requires Chrome/Edge 137+, Firefox 153+, or Safari 27+ for JSPI)
```

### Production Build & Server

```bash
bun run build
bun run start                   # Serves dist/ + Range /distros/*.erofs + COOP/COEP headers on :3080
```

## Horizon desktop

Horizon est l’interface principale : applications centrales, ailes vivantes, tiroirs de contexte persistants et actions agent limitées à une session. Voir [le guide Horizon](docs/horizon.md) pour les gestes, la reprise, les capacités exposées et les vérifications.

Les bureaux et variantes classiques restent disponibles dans Réglages et Mod Studio, avec bascule sans fermeture des apps. Thèmes, fonds, widgets et mods CSS fonctionnent aussi dans Horizon.

Sonora est le lecteur MP3 intégré avec dock play/pause et commandes agent. Voir [le lecteur](docs/sonora.md) et [le SDK d’applications Bun/Node/Rust](docs/app-sdk.md). Les applications compatibles partagent leur contexte et leurs actions par défaut.

## Companion macOS Rust : Wisp local, MCP et CLI

`bun run companion:build` produit `.cache/companion/unkernelOS Companion.app`, avec l’OS et Alpine/Debian embarqués. L’interface native Rune ouvre l’OS dans votre navigateur ; le service Wisp et la passerelle agents restent dans la barre de menus.

Le même binaire expose toute l’API en **MCP stdio/HTTP et CLI JSON** : `sessions`, `schema`, `call <méthode> --params '<JSON>'` et `--stdin`. Les appels externes conservent les permissions et l’historique de l’OS. Voir [companion/README.md](companion/README.md) pour les commandes, la configuration MCP, les limites et la migration du stockage vers l’origine locale.
