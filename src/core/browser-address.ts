export type BrowserAddress =
  | { kind: "guest"; port: number; path: string; address: string }
  | { kind: "web"; url: string; address: string }
  | { kind: "home"; address: string };
/** Browser OS localhost means the Linux guest. Other HTTP(S) hosts use the native engine. */
export function parseBrowserAddress(input: string): BrowserAddress {
  const raw = input.trim();
  if (!raw || raw === "about:blank" || raw === "unkernel:newtab")
    return { kind: "home", address: "unkernel:newtab" };
  const shorthand = /^:(\d+)(\/.*)?$/.exec(raw);
  if (shorthand) {
    const port = Number(shorthand[1]);
    if (port < 1 || port > 65535) throw new Error("Port invalide");
    return {
      kind: "guest",
      port,
      path: shorthand[2] || "/",
      address: `http://guest:${port}${shorthand[2] || "/"}`,
    };
  }
  const explicit = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  if (
    !explicit &&
    /^[a-z][a-z\d+.-]*:/i.test(raw) &&
    !/^([^/:]+):\d+/.test(raw)
  )
    throw new Error("Utilisez une adresse HTTP ou HTTPS.");
  const url = new URL(
    explicit
      ? raw
      : `${/^(localhost|guest|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(raw) ? "http" : "https"}://${raw}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Utilisez une adresse HTTP ou HTTPS sans identifiants dans l’URL.",
    );
  if (["guest", "localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    if (url.protocol === "https:")
      throw new Error(
        "Les aperçus Linux utilisent HTTP. Pour un serveur HTTPS du Mac, utilisez host.localhost.",
      );

    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    const path = url.pathname + url.search + url.hash;
    return {
      kind: "guest",
      port,
      path,
      address: `http://guest:${port}${path}`,
    };
  }
  return { kind: "web", url: url.href, address: url.href };
}
