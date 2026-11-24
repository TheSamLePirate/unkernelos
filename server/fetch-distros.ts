import { Effect } from "effect";
import { DistroRegistryLive, DistroRegistryService, type DistroName } from "./distro-service.ts";

const requested = (process.argv.slice(2) as DistroName[]);
const distros: DistroName[] = requested.length > 0 ? requested : ["alpine", "debian"];

const program = Effect.gen(function* () {
  const registry = yield* DistroRegistryService;
  for (const name of distros) {
    const entry = yield* registry.ensureDistro(name);
    console.log(`[unkernelOS] Verified ${entry.name}: ${(entry.size / 1e6).toFixed(2)} MB (${entry.etag})`);
  }
});

await Effect.runPromise(program.pipe(Effect.provide(DistroRegistryLive)));
