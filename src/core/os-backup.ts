import { Effect } from "effect";
import { appRuntime, SettingsService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

const BACKUP_KEYS = [
  "unkernelos:config:v1",
  "unkernelos:workspace:v1",
  "unkernelos:custom-apps:v1",
  "unkernelos:workflows:v1",
  "unkernelos:services:v1",
  "unkernelos:desktop-profiles:v1",
  "unkernelos:clipboard:v1",
] as const;

export interface OsProfileBundle {
  readonly format: "unkernelos-profile-v1";
  readonly exportedAt: string;
  readonly storage: Record<string, unknown>;
}

/**
 * Exports all non-secret WebOS settings, themes, custom agent-built apps,
 * workflows, services, desktop layouts & workspace history as a portable JSON bundle.
 * (API keys & GitHub tokens are intentionally excluded for security.)
 */
export function exportOsProfileBundle(): void {
  const storage: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) storage[key] = JSON.parse(raw);
    } catch {
      // skip malformed key
    }
  }
  const bundle: OsProfileBundle = {
    format: "unkernelos-profile-v1",
    exportedAt: new Date().toISOString(),
    storage,
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unkernelos-profile-${new Date().toISOString().slice(0, 10)}.unkernelos.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  wmStore.pushToast("OS Profile Exported", "Saved themes, workflows, agent apps & layouts (.unkernelos.json)", "success");
}

export async function importOsProfileBundle(file: File | undefined): Promise<boolean> {
  if (!file) return false;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<OsProfileBundle>;
    if (parsed.format !== "unkernelos-profile-v1" || !parsed.storage || typeof parsed.storage !== "object") {
      throw new Error("Invalid .unkernelos.json profile file");
    }
    let count = 0;
    for (const key of BACKUP_KEYS) {
      if (key in parsed.storage) {
        localStorage.setItem(key, JSON.stringify(parsed.storage[key]));
        count++;
      }
    }
    if (parsed.storage["unkernelos:config:v1"] && typeof parsed.storage["unkernelos:config:v1"] === "object") {
      await appRuntime.runPromise(
        Effect.flatMap(SettingsService, (s) =>
          s.updateConfig(parsed.storage!["unkernelos:config:v1"] as Record<string, unknown>)
        ).pipe(Effect.ignore)
      );
    }
    wmStore.pushToast(
      "OS Profile Restored",
      `Restored ${count} sections — reload page to hydrate all stores.`,
      "success"
    );
    return true;
  } catch (err) {
    wmStore.pushToast("Import Failed", err instanceof Error ? err.message : String(err), "error");
    return false;
  }
}
