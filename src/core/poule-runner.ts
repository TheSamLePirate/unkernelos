import { Effect } from "effect";
import { buildPouleScript, parsePouleOutput } from "./poule.ts";
import { VmService } from "./vm-service.ts";

/** Check a Poule source inside the guest (`poule --trace`) and return theorems + derivations. */
export const runPoule = (source: string) =>
  Effect.gen(function* () {
    const vm = yield* VmService;
    const { script, token } = buildPouleScript(source);
    const res = yield* vm.execShell(script);
    return parsePouleOutput(res.stdout, token);
  });
