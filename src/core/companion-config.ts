/** Set once before the desktop boots. Local mode never falls back to a public relay. */
export interface CompanionConfig {
  version: string;
  origin: string;
  wispUrl: string;
  bridgeUrl: string;
}
let config: CompanionConfig | null = null;
export const getCompanionConfig = () => config;
export async function bootstrapCompanion(): Promise<void> {
  if (!document.querySelector('meta[name="unkernelos-companion"][content="1"]'))
    return;
  const response = await fetch("/__companion/bootstrap", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Companion unavailable (${response.status}). Reopen its native app.`,
    );
  const value = (await response.json()) as CompanionConfig;
  const expected = new URL(location.origin);
  expected.protocol = "ws:";
  if (
    value.origin !== location.origin ||
    value.wispUrl !== `${expected.origin}/wisp` ||
    value.bridgeUrl !== `${expected.origin}/__companion/connect`
  )
    throw new Error("Invalid companion bootstrap");
  config = Object.freeze(value);
}
