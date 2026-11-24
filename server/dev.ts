import { Effect } from "effect";
import { createServer } from "vite";
import { DistroRegistryLive, DistroRegistryService, type DistroName } from "./distro-service.ts";
import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const PORT = Number(process.env.PORT || 3080);

const startDev = Effect.gen(function* () {
  const registry = yield* DistroRegistryService;

  // Pre-warm alpine silently in background
  Effect.runFork(
    registry.ensureDistro("alpine").pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => console.warn(`[unkernelOS] Background alpine cache note: ${err.message}`))
      )
    )
  );

  const vite = yield* Effect.promise(() =>
    createServer({
      server: { port: PORT, host: true },
      plugins: [
        {
          name: "unkernelos-distro-range-middleware",
          configureServer(server) {
            server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
              const urlPath = (req.url || "").split("?")[0] || "";
              const m = /^\/distros\/(alpine|debian)\.erofs$/.exec(urlPath);
              if (!m) {
                if (urlPath === "/vm-sw.js") {
                  res.setHeader("Service-Worker-Allowed", "/vm/");
                }
                next();
                return;
              }
              const name = m[1] as DistroName;
              const either = await Effect.runPromise(Effect.either(registry.ensureDistro(name)));
              if (either._tag === "Left") {
                res.statusCode = 502;
                res.setHeader("Content-Type", "text/plain");
                res.end(`Failed to fetch distro ${name}: ${either.left.message}`);
                return;
              }
              const entry = either.right;
              res.setHeader("Content-Type", "application/octet-stream");
              res.setHeader("Accept-Ranges", "bytes");
              res.setHeader("ETag", entry.etag);
              res.setHeader("Cache-Control", "public, max-age=3600");
              res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
              res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

              if (req.headers["if-none-match"] === entry.etag) {
                res.statusCode = 304;
                res.end();
                return;
              }

              if (req.method === "HEAD") {
                res.statusCode = 200;
                res.setHeader("Content-Length", String(entry.size));
                res.end();
                return;
              }

              const range = req.headers.range;
              if (range) {
                const rm = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
                if (rm) {
                  let start = rm[1] ? Number(rm[1]) : 0;
                  let end = rm[2] ? Number(rm[2]) : entry.size - 1;
                  if (!rm[1] && rm[2]) {
                    start = Math.max(0, entry.size - Number(rm[2]));
                    end = entry.size - 1;
                  }
                  if (start >= entry.size || start > end) {
                    res.statusCode = 416;
                    res.setHeader("Content-Range", `bytes */${entry.size}`);
                    res.end();
                    return;
                  }
                  end = Math.min(end, entry.size - 1);
                  res.statusCode = 206;
                  res.setHeader("Content-Range", `bytes ${start}-${end}/${entry.size}`);
                  res.setHeader("Content-Length", String(end - start + 1));
                  createReadStream(entry.path, { start, end }).pipe(res);
                  return;
                }
              }

              res.statusCode = 200;
              res.setHeader("Content-Length", String(entry.size));
              createReadStream(entry.path).pipe(res);
            });
          },
        },
      ],
    })
  );

  yield* Effect.promise(() => vite.listen());
  console.log(`\n⚡ unkernelOS Dev Server ready at http://localhost:${PORT}`);
  console.log(`   COOP/COEP: enabled | Distros: /distros/{debian,alpine}.erofs (auto-cached via Effect-TS)\n`);
});

await Effect.runPromise(startDev.pipe(Effect.provide(DistroRegistryLive)));
