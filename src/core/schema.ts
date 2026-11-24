import { Schema } from "effect";

export const DistroSchema = Schema.Literal("debian", "alpine", "none");
export type DistroKind = typeof DistroSchema.Type;

export const KittyThemeSchema = Schema.Literal(
  "tokyo-night",
  "catppuccin-mocha",
  "dracula",
  "obsidian-glass",
  "nord"
);
export type KittyThemeId = typeof KittyThemeSchema.Type;

export const FbScalingSchema = Schema.Literal("crisp", "smooth", "crt");
export type FbScalingMode = typeof FbScalingSchema.Type;

export const AgentKindSchema = Schema.Literal("claude", "pi");
export type AgentKind = typeof AgentKindSchema.Type;

export const UnkernelConfigSchema = Schema.Struct({
  // Distribution & Boot
  distro: DistroSchema,
  safeMode: Schema.Boolean,
  cmdlineAppend: Schema.String,
  verbose: Schema.Boolean,

  // Compute & Runtime
  memoryMiB: Schema.Number, // 256 .. 3072
  cpus: Schema.Number, // 1 .. 16 (clamped to hardwareConcurrency)
  jit: Schema.Boolean,
  worker: Schema.Boolean,
  shared: Schema.Boolean,
  wasi: Schema.Boolean,

  // Persistent Storage (IndexedDB ext4)
  dataDisk: Schema.Boolean,
  dataSizeGiB: Schema.Number, // 4 .. 1024

  // Networking (User Wisp Server)
  net: Schema.Boolean,
  wispUrl: Schema.String,
  fetchRoutes: Schema.Boolean,

  // Graphics, FB0, GL (virgl), Wayland (wland) & Sound
  display: Schema.Boolean,
  displayWidth: Schema.Number,
  displayHeight: Schema.Number,
  gpu: Schema.Boolean,
  gl: Schema.Boolean,
  glEager: Schema.Boolean,
  glStrictWaits: Schema.Boolean,
  wayland: Schema.Boolean,
  sound: Schema.Boolean,

  // Host Renderer & Desktop UX
  webgpuTerminal: Schema.Boolean,
  webgpuFb0: Schema.Boolean,
  webgpuWallpaper: Schema.Boolean,
  fbScaling: FbScalingSchema,
  kittyTheme: KittyThemeSchema,
  terminalFontSize: Schema.Number,
  terminalOpacity: Schema.Number,
  autosuspendSec: Schema.Number, // 0 = off
});

export type UnkernelConfig = typeof UnkernelConfigSchema.Type;

export const CredentialsSchema = Schema.Struct({
  anthropicApiKey: Schema.String,
  openaiApiKey: Schema.String,
  geminiApiKey: Schema.String,
  openrouterApiKey: Schema.String,
  githubToken: Schema.String,
  gitUserName: Schema.String,
  gitUserEmail: Schema.String,
  defaultAgent: AgentKindSchema,
});

export type CredentialsConfig = typeof CredentialsSchema.Type;

export const defaultCpus = (): number => {
  if (typeof navigator === "undefined") return 2;
  const hc = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(4, Math.floor(hc / 2) || 1));
};

export const DEFAULT_UNKERNEL_CONFIG: UnkernelConfig = {
  distro: "debian",
  safeMode: false,
  cmdlineAppend: "",
  verbose: false,

  memoryMiB: 2048,
  cpus: defaultCpus(),
  jit: true,
  worker: true,
  shared: true,
  wasi: true,

  dataDisk: true,
  dataSizeGiB: 8,

  net: true,
  wispUrl: "",
  fetchRoutes: true,

  display: true,
  displayWidth: 1024,
  displayHeight: 640,
  gpu: true,
  gl: true,
  glEager: false,
  glStrictWaits: false,
  wayland: true,
  sound: true,

  webgpuTerminal: true,
  webgpuFb0: true,
  webgpuWallpaper: true,
  fbScaling: "crisp",
  kittyTheme: "tokyo-night",
  terminalFontSize: 13.5,
  terminalOpacity: 0.88,
  autosuspendSec: 0,
};

export const DEFAULT_CREDENTIALS: CredentialsConfig = {
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  openrouterApiKey: "",
  githubToken: "",
  gitUserName: "",
  gitUserEmail: "",
  defaultAgent: "claude",
};
