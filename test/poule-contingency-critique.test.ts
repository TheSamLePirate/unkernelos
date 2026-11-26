import { describe, expect, test } from "bun:test";
import { CONTINGENCY_CRITIQUE_EXAMPLE as critique } from "../src/core/poule-contingency-critique.ts";
import { CONTINGENCY_EXAMPLE as argument } from "../src/core/poule-contingency.ts";
import { globalFacts, parseFormula, POULE_EXAMPLES } from "../src/core/poule.ts";
import { parseGlossary } from "../src/core/poule-story.ts";
import { finiteModel } from "./helpers/poule-model.ts";

const original = globalFacts(argument.source), critical = globalFacts(critique.source);
const formula = (source: typeof original, name: string) => {
  const fm = parseFormula(source.find((f) => f.name === name)!.statement);
  if (!fm) throw new Error("Unparsed formula: " + name);
  return fm;
};

/** The two inhabited-world profiles also extend to the original recursive sorts:
 * further individual names alternate profiles; further worlds use Autre's profile. */
function scenario(reason: string | null, addNecessary = false) {
  const beings = addNecessary ? ["c", "d", "n"] : ["c", "d"], worlds = ["actual", "alternative"];
  const exists = (being: string, world: string) =>
    (being === "c" && world === "actual") || (being === "d" && world === "alternative") || (addNecessary && being === "n");
  const contingent = (being: string) => exists(being, "actual") && worlds.some((w) => !exists(being, w));
  const evaluate = finiteModel({
    domains: { Etre: beings, Monde: worlds },
    constants: { Reel: "actual", Autre: "alternative", IndividuIci: "c", IndividuAilleurs: "d" },
    predicates: {
      existe: exists,
      necessaire: (being) => worlds.every((w) => exists(being, w)),
      contingent,
      membre_totalite: contingent,
      raison_totale: (being) => being === reason,
    },
  });
  return { evaluate, inhabited: worlds.every((w) => beings.some((x) => exists(x, w))) };
}

describe("critique of unconditional contingency inference", () => {
  test("the separate example keeps the same definitions and a complete narrative glossary", () => {
    expect(POULE_EXAMPLES.filter((e) => e.id === critique.id)).toEqual([critique]);
    const glossary = parseGlossary(critique.source);
    expect(glossary.get("Etre")?.usual).toBe("un individu du modèle");
    expect(critique.source).not.toContain("\\u00");
    for (const f of critical) expect(glossary.has(f.name)).toBe(true);
    for (const key of ["existe", "necessaire", "contingent", "membre_totalite", "raison_totale", "IndividuIci", "IndividuAilleurs", "Reel", "Autre", "Etre", "Monde"])
      expect(glossary.has(key)).toBe(true);
    for (const key of ["def_necessaire", "def_contingent", "def_totalite"])
      expect(formula(critical, key)).toEqual(formula(original, key));
    expect(critical.filter((f) => f.kind === "theorem")).toHaveLength(10);
    expect(critical.filter((f) => f.kind === "axiom")).toHaveLength(6);
  });
  test("each scenario consistently validates all critique axioms and all ten theorems", () => {
    for (const reason of [null, "c"]) {
      const { evaluate, inhabited } = scenario(reason);
      expect(inhabited).toBe(true);
      for (const fact of critical) expect(evaluate(formula(critical, fact.name))).toBe(true);
      expect(evaluate(parseFormula("exists (x : Etre). necessaire(x)")!)).toBe(false);
    }
  });
  test("scenario A refutes P2 while keeping the original definitions, P1, P3 and P4", () => {
    const { evaluate } = scenario(null);
    for (const fact of original.filter((f) => f.kind === "axiom"))
      expect(evaluate(formula(original, fact.name))).toBe(fact.name !== "p2_raison_suffisante");
    expect(evaluate(formula(original, "etre_necessaire_et_raison"))).toBe(false);
  });
  test("scenario B refutes P3 while keeping the original definitions, P1, P2 and P4", () => {
    const { evaluate } = scenario("c");
    expect(evaluate(parseFormula("raison_totale(IndividuIci)")!)).toBe(true);
    for (const fact of original.filter((f) => f.kind === "axiom"))
      expect(evaluate(formula(original, fact.name))).toBe(fact.name !== "p3_exteriorite");
    expect(evaluate(formula(original, "etre_necessaire_et_raison"))).toBe(false);
  });
  test("rejecting PSR alone does not prove that no necessary being exists", () => {
    const { evaluate } = scenario(null, true);
    for (const fact of original.filter((f) => f.kind === "axiom"))
      expect(evaluate(formula(original, fact.name))).toBe(fact.name !== "p2_raison_suffisante");
    expect(evaluate(parseFormula("exists (x : Etre). necessaire(x)")!)).toBe(true);
  });
});
