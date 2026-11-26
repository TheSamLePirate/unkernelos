// unkernelOS Unified PWA + Cross-Origin Isolation (COOP/COEP) Service Worker
// Unlocks SharedArrayBuffer, Web Worker kernel mode, and multi-vCPU SMP on static hosts (GitHub Pages)
// while providing PWA app-shell caching and leaving /vm/ strictly untouched for vm-sw.js.
"use strict";

const CACHE_NAME = "unkernelos-pwa-v1";
const BASE = new URL("./", self.location.href).pathname.replace(/\/?$/, "/");
const VM_PREFIX = `${BASE}vm/`;
const DISTRO_PREFIX = `${BASE}distros/`;

const IS_SAFARI =
  typeof navigator !== "undefined" &&
  /Safari/i.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|Firefox/i.test(navigator.userAgent);

// Use credentialless on Chromium/Firefox (allows third-party avatars/fonts seamlessly)
// and require-corp on Safari (which doesn't support credentialless yet).
const COEP_VALUE = IS_SAFARI ? "require-corp" : "credentialless";

const SHELL_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("unkernelos-pwa-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function withIsolationHeaders(response) {
  if (!response || response.type === "opaque" || response.status === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", COEP_VALUE);
  if (!headers.has("Cross-Origin-Resource-Policy")) {
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Authentication and control must always reach the running native service.
  if (url.pathname.startsWith("/__companion/") || url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) return;

  // Never interfere with guest preview Service Worker scope (/vm/)
  if (url.pathname.startsWith(VM_PREFIX)) return;

  // Stream huge .erofs distro images & Range requests directly (never buffer/cache in CacheStorage)
  if (url.pathname.startsWith(DISTRO_PREFIX) || req.headers.has("range")) {
    event.respondWith(
      fetch(req).then((res) => withIsolationHeaders(res))
    );
    return;
  }

  // Navigation requests: network-first with offline cache fallback + COOP/COEP headers
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return withIsolationHeaders(res);
        })
        .catch(async () => {
          const cached = (await caches.match(req)) || (await caches.match(`${BASE}index.html`));
          return cached ? withIsolationHeaders(cached) : new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // Hashed static assets (JS/CSS/WASM/icons): stale-while-revalidate + COOP/COEP headers
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const netPromise = fetch(req)
        .then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(netPromise);
        return withIsolationHeaders(cached);
      }
      const fresh = await netPromise;
      return fresh ? withIsolationHeaders(fresh) : new Response("Network error", { status: 504 });
    })()
  );
});
