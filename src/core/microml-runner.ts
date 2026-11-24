import { Effect } from "effect";
import { buildMicromlScript, parseMicromlOutput, type MicromlMode } from "./microml.ts";
import { VmService } from "./vm-service.ts";

/** Run microML on `source` inside the guest and return the structured pipeline result. */
export const runMicroml = (source: string, mode: MicromlMode) =>
  Effect.gen(function* () {
    const vm = yield* VmService;
    const { script, token } = buildMicromlScript(source, mode);
    const res = yield* vm.execShell(script);
    return parseMicromlOutput(res.stdout, token);
  });
