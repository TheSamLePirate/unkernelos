import { describe, expect, test } from "bun:test";
import { CONTINGENCY_EXAMPLE } from "../src/core/poule-contingency.ts";
import { globalFacts, parseFormula, POULE_EXAMPLES } from "../src/core/poule.ts";
import { parseGlossary } from "../src/core/poule-story.ts";
import { finiteModel } from "./helpers/poule-model.ts";

const facts = globalFacts(CONTINGENCY_EXAMPLE.source);
const axioms = facts.filter((f) => f.kind === "axiom");
const goal = parseFormula(facts.find((f) => f.name === "etre_necessaire_et_raison")!.statement)!;

/** Finite predicate profiles: they extend to the unused constructor names by
 * assigning them no actual existence, and to further worlds like 'alternative'. */
function interpretation({ necessary, reason, contingent = true }: { necessary: boolean; reason: string | null; contingent?: boolean }) {
  const beings = ["c", "n", "unused"], worlds = ["actual", "alternative"];
  const exists = (being: string, world: string) => (necessary && being === "n") || (contingent && being === "c" && world === "actual");
  const isContingent = (being: string) => exists(being, "actual") && worlds.some((w) => !exists(being, w));
  const predicates: Record<string, (...args: string[]) => boolean> = {
    existe: exists,
    necessaire: (being) => worlds.every((w) => exists(being, w)),
    contingent: isContingent,
    membre_totalite: isContingent,
    raison_totale: (being) => reason === being,
  };
  return finiteModel({
    domains: { Etre: beings, Monde: worlds },
    constants: { Reel: "actual" },
    predicates,
  });
}

describe("necessary being example", () => {
  test("the example loads the main argument first and defines all symbols and facts", () => {
    expect(POULE_EXAMPLES.filter((e) => e.id === "necessary-being")).toEqual([CONTINGENCY_EXAMPLE]);
    const glossary = parseGlossary(CONTINGENCY_EXAMPLE.source);
    expect(glossary.get("Etre")?.usual).toBe("un être");
    expect(glossary.get("necessaire")?.rigorous).toContain("même individu");
    expect(CONTINGENCY_EXAMPLE.source).not.toContain("\\u00");
    for (const fact of facts) expect(glossary.has(fact.name)).toBe(true);
    for (const key of ["Etre", "Monde", "Temoin", "Reel", "AutreEtre", "AutreMonde", "existe", "necessaire", "contingent", "membre_totalite", "raison_totale"])
      expect(glossary.has(key)).toBe(true);
    expect(facts.find((f) => f.kind === "theorem")?.name).toBe("etre_necessaire_et_raison");
    expect(facts.filter((f) => f.kind === "theorem")).toHaveLength(7);
  });
  test("the formal premises have a consistent interpretation with a necessary being", () => {
    const evaluate = interpretation({ necessary: true, reason: "n" });
    expect(axioms).toHaveLength(7);
    for (const axiom of axioms) {
      const fm = parseFormula(axiom.statement);
      expect(fm).not.toBeNull();
      expect(evaluate(fm!)).toBe(true);
    }
    expect(evaluate(goal)).toBe(true);
  });
  test("contingency alone does not yield the conclusion without PSR or exteriority", () => {
    for (const [omitted, model] of [
      ["p2_raison_suffisante", { necessary: false, reason: null }],
      ["p3_exteriorite", { necessary: false, reason: "c" }],
      ["p1_contingence", { necessary: false, reason: null, contingent: false }],
    ] as const) {
      const evaluate = interpretation(model);
      for (const axiom of axioms) expect(evaluate(parseFormula(axiom.statement)!)).toBe(axiom.name !== omitted);
      expect(evaluate(goal)).toBe(false);
    }
  });
});
