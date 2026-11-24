import { Effect } from "effect";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  DistroRegistryLive,
  DistroRegistryService,
  type DistroName,
} from "./distro-service.ts";

const PORT = Number(process.env.PORT || 3080);
const DIST_DIR = path.join(process.cwd(), "dist");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UNKERNEL_DIST = path.join(process.cwd(), "node_modules", "unkernel", "dist");

const COOP_COEP_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const withIsolationHeaders = (res: Response): Response => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(COOP_COEP_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
};

const mimeFor = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  return map[ext] || "application/octet-stream";
};

const startServer = Effect.gen(function* () {
  const registry = yield* DistroRegistryService;

  // Pre-warm alpine in the background so first boot is instant; debian downloads on demand or via fetch-distros
  Effect.runFork(
    registry.ensureDistro("alpine").pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => console.warn(`[unkernelOS] Alpine pre-warm skipped: ${err.message}`))
      )
    )
  );

  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = decodeURIComponent(url.pathname);

      // 1. API: list & ensure distros
      if (pathname === "/api/distros") {
        const list = await Effect.runPromise(
          registry.listDistros().pipe(Effect.provide(DistroRegistryLive))
        ).catch(() => []);
        return withIsolationHeaders(
          Response.json({
            available: ["debian", "alpine"],
            cached: list.map((d) => ({ name: d.name, size: d.size, url: d.url })),
          })
        );
      }

      if (pathname === "/api/health") {
        return withIsolationHeaders(
          Response.json({
            status: "ok",
            runtime: `Bun ${Bun.version}`,
            crossOriginIsolated: true,
          })
        );
      }

      // 2. Distro images with strict HTTP Range support (206) & no compression
      const distroMatch = /^\/distros\/(alpine|debian)\.erofs$/.exec(pathname);
      if (distroMatch) {
        const name = distroMatch[1] as DistroName;
        const result = await Effect.runPromise(
          Effect.either(registry.ensureDistro(name))
        );
        if (result._tag === "Left") {
          return withIsolationHeaders(
            new Response(`Distro fetch failed: ${result.left.message}\n`, { status: 502 })
          );
        }
        return registry.serveRange(result.right, req);
      }

      // 3. unkernel bundled assets (unkernel.wasm, virgl.mjs, virgl.wasm)
      if (pathname.startsWith("/_unkernel/")) {
        const rel = pathname.slice("/_unkernel/".length);
        const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
        const candidate = path.join(UNKERNEL_DIST, safe);
        if (existsSync(candidate)) {
          return withIsolationHeaders(
            new Response(Bun.file(candidate), {
              headers: {
                "Content-Type": mimeFor(candidate),
                "Cache-Control": "public, max-age=86400",
              },
            })
          );
        }
      }

      // 4. Service Worker & WebSocket preview shims (must have Service-Worker-Allowed: /vm/)
      if (pathname === "/vm-sw.js" || pathname === "/vm-ws.js") {
        const p = existsSync(path.join(DIST_DIR, pathname.slice(1)))
          ? path.join(DIST_DIR, pathname.slice(1))
          : path.join(PUBLIC_DIR, pathname.slice(1));
        if (existsSync(p)) {
          return withIsolationHeaders(
            new Response(Bun.file(p), {
              headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "no-cache",
                ...(pathname === "/vm-sw.js" ? { "Service-Worker-Allowed": "/vm/" } : {}),
              },
            })
          );
        }
      }

      // 5. Static built SPA files from dist/
      const cleanPath = pathname === "/" ? "/index.html" : pathname;
      const staticPath = path.join(DIST_DIR, path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, ""));
      if (existsSync(staticPath) && !staticPath.endsWith(path.sep)) {
        const file = Bun.file(staticPath);
        if (file.size > 0) {
          return withIsolationHeaders(
            new Response(file, {
              headers: {
                "Content-Type": mimeFor(staticPath),
                "Cache-Control": cleanPath.startsWith("/assets/")
                  ? "public, max-age=31536000, immutable"
                  : "no-cache",
              },
            })
          );
        }
      }

      // 6. SPA fallback
      const indexFile = path.join(DIST_DIR, "index.html");
      if (existsSync(indexFile)) {
        return withIsolationHeaders(
          new Response(Bun.file(indexFile), {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          })
        );
      }

      return withIsolationHeaders(
        new Response("unkernelOS build not found. Run `bun run build` or `bun run dev`.", { status: 404 })
      );
    },
  });

  console.log(`\n🚀 unkernelOS server running at http://localhost:${server.port}`);
  console.log(`   COOP/COEP Isolation: enabled (SharedArrayBuffer + SMP + kwshm ready)`);
  console.log(`   Distro Range Proxy:  /distros/{alpine,debian}.erofs\n`);
});

await Effect.runPromise(startServer.pipe(Effect.provide(DistroRegistryLive)));
