import type { Fm } from "../../src/core/poule.ts";

/** Interpreter for the first-order fragment used by the example counter-models. */
export function finiteModel(model: {
  domains: Record<string, readonly string[]>;
  constants: Record<string, string>;
  predicates: Record<string, (...args: string[]) => boolean>;
}) {
  const evaluate = (fm: Fm, env: Record<string, string> = {}): boolean => {
    switch (fm.k) {
      case "top": return true;
      case "bottom": return false;
      case "and": return evaluate(fm.a, env) && evaluate(fm.b, env);
      case "or": return evaluate(fm.a, env) || evaluate(fm.b, env);
      case "impl": return !evaluate(fm.a, env) || evaluate(fm.b, env);
      case "forall": case "exists": {
        const domain = model.domains[fm.ty];
        if (!domain) throw new Error("Unknown domain " + fm.ty);
        const values = domain.map((value) => evaluate(fm.body, { ...env, [fm.x]: value }));
        return fm.k === "forall" ? values.every(Boolean) : values.some(Boolean);
      }
      case "pred": {
        const pred = model.predicates[fm.name];
        if (!pred) throw new Error("Unknown predicate " + fm.name);
        const args = fm.args.split(",").filter(Boolean).map((arg) => {
          const key = arg.trim(), value = env[key] ?? model.constants[key];
          if (value === undefined) throw new Error("Unknown term " + key);
          return value;
        });
        return pred(...args);
      }
      case "eq": throw new Error("Equality is not used by these examples");
    }
  };
  return evaluate;
}
