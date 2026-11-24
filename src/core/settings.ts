import { Context, Effect, Layer, Schema, SubscriptionRef } from "effect";
import {
  CredentialsSchema,
  DEFAULT_CREDENTIALS,
  DEFAULT_UNKERNEL_CONFIG,
  UnkernelConfigSchema,
  type CredentialsConfig,
  type UnkernelConfig,
} from "./schema.ts";

const CONFIG_KEY = "unkernelos:config:v1";
const CREDS_KEY = "unkernelos:credentials:v1";

function parseUrlOverrides(base: UnkernelConfig): UnkernelConfig {
  if (typeof window === "undefined") return base;
  const p = new URLSearchParams(window.location.search);
  const next: { -readonly [K in keyof UnkernelConfig]: UnkernelConfig[K] } = { ...base };

  const distro = p.get("distro");
  if (distro === "debian" || distro === "alpine" || distro === "none") next.distro = distro;

  const mem = Number(p.get("mem"));
  if (Number.isFinite(mem) && mem >= 128 && mem <= 4096) next.memoryMiB = Math.round(mem);

  const cpus = Number(p.get("cpus"));
  if (Number.isFinite(cpus) && cpus >= 1 && cpus <= 16) next.cpus = Math.round(cpus);

  const wisp = p.get("wisp");
  if (wisp !== null) {
    if (wisp === "0") next.net = false;
    else {
      next.wispUrl = wisp;
      next.net = true;
    }
  }

  if (p.has("net")) next.net = p.get("net") !== "0";
  if (p.has("jit")) next.jit = p.get("jit") !== "0";
  if (p.has("worker")) next.worker = p.get("worker") !== "0";
  if (p.has("shared")) next.shared = p.get("shared") !== "0";
  if (p.has("data")) next.dataDisk = p.get("data") !== "0";
  if (p.has("gl")) next.gl = p.get("gl") !== "0";
  if (p.has("gpu")) next.gpu = p.get("gpu") !== "0";
  if (p.has("wayland")) next.wayland = p.get("wayland") !== "0";
  if (p.has("sound")) next.sound = p.get("sound") !== "0";
  if (p.has("display")) next.display = p.get("display") !== "0";
  if (p.has("verbose")) next.verbose = p.get("verbose") === "1";
  if (p.has("safe")) next.safeMode = p.get("safe") === "1";

  const datasize = Number(p.get("datasize"));
  if (Number.isFinite(datasize) && datasize >= 4 && datasize <= 1024) next.dataSizeGiB = Math.round(datasize);

  const append = p.get("append");
  if (append) next.cmdlineAppend = append;

  return next;
}

function loadConfig(): UnkernelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return parseUrlOverrides(DEFAULT_UNKERNEL_CONFIG);
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_UNKERNEL_CONFIG, ...parsed };
    const decoded = Schema.decodeUnknownSync(UnkernelConfigSchema)(merged);
    return parseUrlOverrides(decoded);
  } catch {
    return parseUrlOverrides(DEFAULT_UNKERNEL_CONFIG);
  }
}

function loadCredentials(): CredentialsConfig {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return DEFAULT_CREDENTIALS;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CREDENTIALS, ...parsed };
    return Schema.decodeUnknownSync(CredentialsSchema)(merged);
  } catch {
    return DEFAULT_CREDENTIALS;
  }
}

export interface SettingsApi {
  readonly configRef: SubscriptionRef.SubscriptionRef<UnkernelConfig>;
  readonly credsRef: SubscriptionRef.SubscriptionRef<CredentialsConfig>;
  readonly getConfig: Effect.Effect<UnkernelConfig>;
  readonly updateConfig: (patch: Partial<UnkernelConfig>) => Effect.Effect<UnkernelConfig>;
  readonly resetConfig: Effect.Effect<UnkernelConfig>;
  readonly getCredentials: Effect.Effect<CredentialsConfig>;
  readonly updateCredentials: (patch: Partial<CredentialsConfig>) => Effect.Effect<CredentialsConfig>;
  readonly clearCredentials: Effect.Effect<CredentialsConfig>;
}

export class SettingsService extends Context.Tag("SettingsService")<
  SettingsService,
  SettingsApi
>() {}

export const SettingsLive = Layer.effect(
  SettingsService,
  Effect.gen(function* () {
    const configRef = yield* SubscriptionRef.make<UnkernelConfig>(loadConfig());
    const credsRef = yield* SubscriptionRef.make<CredentialsConfig>(loadCredentials());

    const persistConfig = (cfg: UnkernelConfig) =>
      Effect.sync(() => {
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
        } catch {
          // ignore storage quota errors
        }
      });

    const persistCreds = (creds: CredentialsConfig) =>
      Effect.sync(() => {
        try {
          localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
        } catch {
          // ignore
        }
      });

    return {
      configRef,
      credsRef,
      getConfig: SubscriptionRef.get(configRef),
      updateConfig: (patch) =>
        Effect.gen(function* () {
          const updated = yield* SubscriptionRef.updateAndGet(configRef, (cur) => ({
            ...cur,
            ...patch,
          }));
          yield* persistConfig(updated);
          return updated;
        }),
      resetConfig: Effect.gen(function* () {
        yield* SubscriptionRef.set(configRef, DEFAULT_UNKERNEL_CONFIG);
        yield* persistConfig(DEFAULT_UNKERNEL_CONFIG);
        return DEFAULT_UNKERNEL_CONFIG;
      }),
      getCredentials: SubscriptionRef.get(credsRef),
      updateCredentials: (patch) =>
        Effect.gen(function* () {
          const updated = yield* SubscriptionRef.updateAndGet(credsRef, (cur) => ({
            ...cur,
            ...patch,
          }));
          yield* persistCreds(updated);
          return updated;
        }),
      clearCredentials: Effect.gen(function* () {
        yield* SubscriptionRef.set(credsRef, DEFAULT_CREDENTIALS);
        yield* persistCreds(DEFAULT_CREDENTIALS);
        return DEFAULT_CREDENTIALS;
      }),
    };
  })
);
