import { Context, Data, Effect, Layer } from "effect";
import { fetchDistro } from "unkernel/node";
import { stat } from "node:fs/promises";
import path from "node:path";

export type DistroName = "alpine" | "debian";

export interface DistroEntry {
  readonly name: DistroName;
  readonly path: string;
  readonly size: number;
  readonly etag: string;
  readonly url: string;
}

export class DistroSyncError extends Data.TaggedError("DistroSyncError")<{
  readonly distro: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface DistroRegistry {
  readonly ensureDistro: (name: DistroName) => Effect.Effect<DistroEntry, DistroSyncError>;
  readonly getDistro: (name: DistroName) => Effect.Effect<DistroEntry | undefined>;
  readonly listDistros: () => Effect.Effect<readonly DistroEntry[]>;
  readonly serveRange: (entry: DistroEntry, req: Request) => Response;
}

export class DistroRegistryService extends Context.Tag("DistroRegistryService")<
  DistroRegistryService,
  DistroRegistry
>() {}

const CACHE_DIR = process.env.UNKERNEL_CACHE_DIR || path.join(process.cwd(), ".cache", "distros");

const computeEtag = (size: number, mtimeMs: number): string =>
  `"${Math.floor(mtimeMs).toString(16)}-${size.toString(16)}"`;

export const DistroRegistryLive = Layer.sync(DistroRegistryService, () => {
  const entries = new Map<DistroName, DistroEntry>();
  const inflight = new Map<DistroName, Promise<DistroEntry>>();

  const downloadAndRegister = async (name: DistroName): Promise<DistroEntry> => {
    const existing = entries.get(name);
    if (existing) return existing;

    const pending = inflight.get(name);
    if (pending) return pending;

    const promise = (async () => {
      console.log(`[unkernelOS] Ensuring distro image "${name}" (cache: ${CACHE_DIR})...`);
      const filePath = await fetchDistro(name, {
        cacheDir: CACHE_DIR,
        local: false,
        onProgress: (p) => {
          if (p.stage === "download" && p.total && p.loaded) {
            const pct = Math.round((p.loaded / p.total) * 100);
            if (pct % 20 === 0 || p.loaded === p.total) {
              process.stdout.write(`\r[unkernelOS] Downloading ${name}.erofs: ${pct}% (${(p.loaded / 1e6).toFixed(1)}/${(p.total / 1e6).toFixed(1)} MB)`);
            }
          } else if (p.stage === "done") {
            console.log(`\n[unkernelOS] Distro "${name}" ready (${p.cached ? "cached" : "downloaded"}): ${p.path}`);
          }
        },
      });
      const st = await stat(filePath);
      const entry: DistroEntry = {
        name,
        path: filePath,
        size: st.size,
        etag: computeEtag(st.size, st.mtimeMs),
        url: `/distros/${name}.erofs`,
      };
      entries.set(name, entry);
      return entry;
    })().finally(() => {
      inflight.delete(name);
    });

    inflight.set(name, promise);
    return promise;
  };

  return {
    ensureDistro: (name) =>
      Effect.tryPromise({
        try: () => downloadAndRegister(name),
        catch: (cause) =>
          new DistroSyncError({
            distro: name,
            message: `Failed to download or verify ${name}.erofs: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      }),

    getDistro: (name) => Effect.sync(() => entries.get(name)),

    listDistros: () => Effect.sync(() => Array.from(entries.values())),

    serveRange: (entry, req) => {
      const baseHeaders: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        "Accept-Ranges": "bytes",
        "ETag": entry.etag,
        "Cache-Control": "public, max-age=3600",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      };

      const inm = req.headers.get("if-none-match");
      if (inm && inm === entry.etag) {
        return new Response(null, { status: 304, headers: baseHeaders });
      }

      const file = Bun.file(entry.path);
      const rangeHeader = req.headers.get("range");

      if (req.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { ...baseHeaders, "Content-Length": String(entry.size) },
        });
      }

      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (match) {
          let start = match[1] ? Number(match[1]) : 0;
          let end = match[2] ? Number(match[2]) : entry.size - 1;
          if (!match[1] && match[2]) {
            const suffix = Number(match[2]);
            start = Math.max(0, entry.size - suffix);
            end = entry.size - 1;
          }
          if (start >= entry.size || start > end || Number.isNaN(start) || Number.isNaN(end)) {
            return new Response("Range Not Satisfiable", {
              status: 416,
              headers: { ...baseHeaders, "Content-Range": `bytes */${entry.size}` },
            });
          }
          end = Math.min(end, entry.size - 1);
          const length = end - start + 1;
          return new Response(file.slice(start, end + 1), {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Range": `bytes ${start}-${end}/${entry.size}`,
              "Content-Length": String(length),
            },
          });
        }
      }

      return new Response(file, {
        status: 200,
        headers: { ...baseHeaders, "Content-Length": String(entry.size) },
      });
    },
  };
});
