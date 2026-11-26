// Canonical skill documents shared by guest installation and API discovery.
export const SKILL_MODDING_MD = `---
name: unkernelos-modding
description: Mod everything in unkernelOS — themes, 16 OS variants (Win95..11, Linux GNOME/KDE/XFCE/Compiz/Hyprland, macOS/iOS/visionOS), 14 window decorators, Window FX, Eye-Candy, 3D WebGPU worlds & 4K HDRI, widgets, and CSS via osctl or MCP.
---

# unkernelOS Full OS Modding Skill

Use \`osctl call <method> '<json>'\` (or the \`unkernelos\` MCP tools) to customize any visual or structural aspect of unkernelOS live.

## 1. OS Variants & Themes
- List variants: \`osctl call mod.variants\`
- Apply variant: \`osctl call mod.variant.apply '{"id":"variant-visionos"}'\` (also: \`variant-win95\`, \`variant-winxp\`, \`variant-win11\`, \`variant-gnome\`, \`variant-kde\`, \`variant-xfce\`, \`variant-compiz\`, \`variant-hyprland\`, \`variant-macos-aqua\`, \`variant-ios\`, \`variant-cyberpunk\`, \`variant-swiss\`)
- Custom theme tokens: \`osctl call mod.theme.set '{"enabled":true,"accentPrimary":"#22d3ee","accentSecondary":"#f43f5e","blurPx":30,"glassOpacity":0.74}'\`
- Ultra-HD NASA/4K Backdrops (2D & 3D): \`osctl call mod.backdrop.set '{"id":"backdrop-earth-apollo"}'\` (\`backdrop-moon-nasa\`, \`backdrop-jupiter-hubble\`, \`backdrop-saturn-cassini\`, \`backdrop-galaxy-hubble\`, \`backdrop-venice-sunset\`, or \`{"id":"custom","url":"https://..."}\`, or \`{"id":null}\` to return to WebGPU shader).

## 2. 3D Spatial Desktop (Three.js WebGPU)
- \`osctl call mod.desktop3d.set '{"enabled":true,"scene":"earth-orbit","layout":"spatial-grid","hdriPreset":"auto","spatialChrome3d":true,"showControlsHud":false,"shadowsEnabled":true,"doubleSidedWindows":true}'\`
- Scenes: \`ocean-sunset\`, \`alpine-fjord\`, \`earth-orbit\`, \`jupiter-orbit\`, \`lunar-horizon\`, \`aurora-fjord\`
- Layouts: \`curved-cockpit\`, \`spatial-grid\`, \`compiz-cube\`, \`studio-desk\`, \`gallery-ring\`
- HDRI 4K presets: \`auto\`, \`venice-4k\`, \`alpine-4k\`, \`night-4k\`, \`clouds-4k\`, \`twilight-4k\`, \`clear-sky-4k\`, \`space-void\`, \`custom\`

## 3. Window Decorators, FX, Shell & Eye-Candy
- Decorators (14): \`osctl call mod.decorator.set '{"style":"compiz-emerald","radiusPx":18,"activeGlowPx":36,"buttonPosition":"left"}'\`
- Window FX: \`osctl call mod.fx.set '{"openAnimation":"flip3d","wobblyDrag":true,"genieMinimize":true,"burnClose":true,"hoverTilt3d":true,"chromaBorder":true}'\`
- Shell / Dock Pro / Taskbar: \`osctl call mod.shell.set '{"taskbarMode":"dock","dockStyle":"floating-glass","dockAutoHide":false,"dockMagStrength":0.5,"dockIconScale":1.0,"dockReflection":true,"topBarStyle":"glass"}'\`
- Eye-Candy, Audio & Hot Corners: \`osctl call mod.eyecandy.set '{"cursorSpotlight":true,"cursorTrail":"aurora","clickRipples":true,"ambientParticles":"sakura","nightShiftWarmth":15,"colorProfile":"oled-vivid","soundProfile":"crystal","motionSpeed":1.0,"hotCorners":{"topLeft":"mission-control","bottomRight":"desktop-3d"}}'\`
- Parameterize built-in CSS mods: \`osctl call mod.configure '{"id":"mod-rgb-chroma-borders","params":{"speed":3,"glow":40}}'\`
- Global CSS injection: \`osctl call mod.css.set '{"id":"my-css","name":"Custom Look","css":".glass-dock{border-color:#22d3ee!important}"}'\`
`;

export const SKILL_REACTIVE_MD = `---
name: unkernelos-reactive-mods
description: Build real-time data-driven mods in unkernelOS — connect sh/python3/bun/node scripts or HTTP APIs to live signals, WGSL WebGPU shader uniforms, CSS --sig-* vars, visual bindings, unrestricted JS controllers, and injectable HTML/Iframe/Canvas surfaces on 7 OS slots including 3D space.
---

# unkernelOS Reactive Modding & Surfaces Skill

## 1. Live Signal Bus (\`mod.signal.list\` / \`mod.signal.set\`)
Built-in signals update every second and are mirrored to:
- **CSS Custom Properties** on \`:root\`: \`--sig-sys-cpu\`, \`--sig-sys-ram\`, \`--sig-weather-temp\`, \`--sig-agent-tokens\`, \`--sig-cpu-n\` (0..1), etc.
- **WebGPU WGSL Uniforms** (\`struct Uniforms\` — 20 floats, available in every custom WGSL shader via \`mod.shader.set\`):
  - \`u.time\`, \`u.width\`, \`u.height\`, \`u.mode\`
  - \`u.cpu\`, \`u.gpu\`, \`u.ram\`, \`u.disk\` (0..1)
  - \`u.procs\`, \`u.tokens\`, \`u.daylight\`, \`u.temp\` (0..1)
  - \`u.mouseX\`, \`u.mouseY\`, \`u.rain\`, \`u.agentActive\` (0..1)
  - \`u.custom0\`, \`u.custom1\`, \`u.custom2\`, \`u.custom3\` (set via bindings or scripts)

Push any custom signal instantly:
\`\`\`bash
osctl call mod.signal.set '{"key":"custom.buildHealth","value":1,"label":"CI"}'
osctl call mod.signal.set '{"signals":{"custom.score":95,"custom.mode":"turbo"}}'
\`\`\`

## 2. Programmable Data Sources (\`sh\` / \`python\` / \`bun\` / \`node\` / \`http\` / \`js\`)
Create periodic data collectors running directly inside unkernel Linux or fetching internet APIs:
\`\`\`bash
osctl call mod.source.upsert '{
  "id": "src-repo-metrics",
  "name": "Repo Metrics",
  "kind": "python",
  "enabled": true,
  "intervalMs": 8000,
  "outputPrefix": "repo",
  "code": "import json, os; print(json.dumps({\\"files\\": len(os.listdir(\\"/home/user/workspace\\"))}))"
}'
osctl call mod.source.run '{"id":"src-repo-metrics"}'
\`\`\`

## 3. Reactive Bindings (Expressions -> OS Properties / Shader Uniforms / CSS Vars)
Available expression helpers: \`sig(key, fallback)\`, \`sigRaw(key)\`, \`clamp(v, a, b)\`, \`lerp(a, b, t)\`, \`mapRange(v, i0, i1, o0, o1)\`, \`smoothstep(e0, e1, x)\`, \`lerpColor(hexA, hexB, t)\`, \`hsl(h, s, l)\`.
Targets: \`theme.accentPrimary\`, \`theme.accentSecondary\`, \`theme.blurPx\`, \`theme.glassOpacity\`, \`eyecandy.nightShiftWarmth\`, \`eyecandy.ambientParticles\`, \`eyecandy.ambientParticleDensity\`, \`eyecandy.vignetteStrength\`, \`eyecandy.motionSpeed\`, \`desktop3d.bloomIntensity\`, \`desktop3d.cameraSpeed\`, \`desktop3d.particleDensity\`, \`shell.dockMagStrength\`, \`shell.dockIconScale\`, \`decorator.activeGlowPx\`, \`shader.custom0..3\`, \`cssVar\`.
\`\`\`bash
osctl call mod.binding.upsert '{
  "id": "bind-cpu-accent",
  "name": "CPU Thermal Accent",
  "enabled": true,
  "target": "theme.accentPrimary",
  "expression": "lerpColor(\\"#22d3ee\\", \\"#f43f5e\\", clamp(sig(\\"sys.cpu\\") / 90, 0, 1))"
}'
\`\`\`

## 4. Unrestricted JS Reactive Controllers (\`mod.script.upsert\`)
Full access to \`signals\`, \`sig()\`, \`helpers\`, \`state\` (persisted per tick), \`document\`, \`window\`, \`fetch\`, and \`os\` (\`modStore\`, \`wmStore\`, \`reactiveEngine\`, \`execShell(cmd)\`, \`call(method, params)\`).
\`\`\`bash
osctl call mod.script.upsert '{
  "id": "script-ai-aura",
  "name": "AI Token Aura",
  "enabled": true,
  "intervalMs": 1500,
  "code": "const t = clamp(sig(\\"agent.tokens\\")/25000,0,1); os.reactiveEngine.setCustomUniform(1, t); os.modStore.setDecorator({ activeGlowPx: Math.round(16 + t * 44) });"
}'
\`\`\`

## 5. Injectable HTML / Iframe / Canvas Surfaces (7 OS Slots!)
Mount \`html\` (with \`{{signal.key}}\` interpolation + optional \`script\`), \`iframe\` (\`iframeUrl\` or \`html\` srcDoc receiving \`unkernelos-reactive-signals\` via \`postMessage\`), or 60fps \`canvas\` (\`canvasScript(ctx, canvas, t, signals, os, helpers, sig)\`) on any slot:
- \`wallpaper\` (full-screen behind windows)
- \`desktop\` (positioned x/y/w/h)
- \`overlay\` (floating HUD above windows)
- \`topbar\` (inline capsule in OS TopBar)
- \`dock\` (inline widget/meter in OS Dock)
- \`titlebar\` (inline badge in focused window titlebar)
- \`3d-panel\` (floating panel in 3D Three.js space using \`pose3d: {x,y,z,rx,ry,rz}\`)

\`\`\`bash
osctl call mod.surface.upsert '{
  "id": "surf-topbar-ai",
  "name": "TopBar AI Badge",
  "enabled": true,
  "contentType": "html",
  "slot": "topbar",
  "html": "<span style=\\"padding:2px 8px;border-radius:999px;background:rgba(139,92,246,0.22);color:#e9d5ff;font:10px monospace\\">AI {{agent.tokens}} tok</span>"
}'
\`\`\`
`;

export const SKILL_OS_CONTROL_MD = `---
name: unkernelos-os-control
description: Control unkernelOS desktop windows, 2D/3D tiling grids, workspaces, Code IDE, live web previews, Wayland/VirGL 3D apps, clipboard, notifications, human prompts, and 1-click GitHub Pages deployments via osctl or MCP.
---

# unkernelOS Core Control Skill

- Discover all methods: \`osctl schema\`
- Live OS & port status: \`osctl info\`
- Open/focus apps: \`osctl open ide\`, \`osctl open mod-studio\`, \`osctl open settings '{"tab":"desktop3d"}'\`
- Arrange windows: \`osctl call wm.grid '{"mode":"master-stack"}'\` (\`grid\`, \`split-2\`, \`master-stack\`, \`columns-3\`, \`cascade\`) or \`osctl tile focus-ide-preview\`
- Open files & web servers: \`osctl edit /home/user/workspace/app.ts\`, \`osctl preview 3000 /\`, \`os-open :5173\`
- Human interaction: \`osctl notify "Done" "Build succeeded" success\`, \`osctl ask "API endpoint?"\`, \`osctl confirm "Deploy?"\`
- Host I/O: \`pbcopy\`, \`pbpaste\`, \`os-download ./dist/app.zip\`
- Deploy: \`osctl deploy-pages /home/user/workspace/my-app my-app\`
`;
