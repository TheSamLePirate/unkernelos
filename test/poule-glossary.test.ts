import { describe, expect, test } from "bun:test";
import { glossaryEntry, removeGlossaryEntry, writeGlossaryEntry } from "../src/core/poule-glossary.ts";
import { narrate, parseGlossary } from "../src/core/poule-story.ts";
import type { PouleTheorem } from "../src/core/poule.ts";

describe("editable proof-story definitions", () => {
  const proof = "(* Ordinary proof comment *)\npred p : ()\naxiom hp : p()\ntheorem witness : p() = hp\n";
  test("new entries persist as comments without rewriting proof code", () => {
    const entry = glossaryEntry("pair(n)", "{n} est pair", "{n} est divisible par 2");
    const source = writeGlossaryEntry(proof, entry);
    expect(source.startsWith(proof)).toBe(true);
    expect(parseGlossary(source).get("pair")).toEqual(entry);
    expect(writeGlossaryEntry("", glossaryEntry("Monde", "un monde possible", ""))).toBe("(*@ Monde : un monde possible *)\n");
  });
  test("editing and renaming consolidate duplicate definitions and keep surrounding code", () => {
    const source = "(*@ p : first *)\n" + proof + "(*@ p : effective *)\n(*@ q : untouched *)";
    const entry = glossaryEntry("rain(x)", "il pleut dans {x}", "la pluie tombe dans {x}");
    const edited = writeGlossaryEntry(source, entry, "p");
    expect(edited).toContain(proof);
    expect(parseGlossary(edited).has("p")).toBe(false);
    expect(parseGlossary(edited).get("rain")).toEqual(entry);
    expect(parseGlossary(edited).get("q")?.usual).toBe("untouched");
    expect(() => writeGlossaryEntry(source, glossaryEntry("q", "collision", ""), "p")).toThrow("déjà");
    expect(() => writeGlossaryEntry(source, entry, "missing")).toThrow("retirée");
  });
  test("free-text separators roundtrip and multiline definitions are normalized", () => {
    const entry = glossaryEntry("p", "le jour — ou la nuit | choix \\— littéral", "une\n  proposition — rigoureuse | détaillée");
    expect(parseGlossary(writeGlossaryEntry(proof, entry)).get("p")).toEqual(entry);
    expect(entry.rigorous).toBe("une proposition — rigoureuse | détaillée");
  });
  test("invalid signatures and comment delimiters cannot corrupt proof syntax", () => {
    for (const signature of ["", "pair(n,)", "pair(n,n)", "pair(2)", "p : x", "pair(x y)"])
      expect(() => glossaryEntry(signature, "text", "")).toThrow();
    expect(() => glossaryEntry("p", "  ", "definition")).toThrow();
    expect(() => glossaryEntry("p", "texte *) theorem injected", "")).toThrow();
    expect(() => glossaryEntry("p", "text", "(* nested")).toThrow();
  });
  test("removal changes only the target annotations and can be undone by reinsertion", () => {
    const entry = glossaryEntry("p", "il pleut", "la proposition p est vraie");
    const source = "(*@ q : le vent *)\n" + proof + "(*@ p : old *)\n(*@ p : il pleut — la proposition p est vraie *)";
    const removed = removeGlossaryEntry(source, "p");
    expect(removed).toContain(proof);
    expect(parseGlossary(removed).has("p")).toBe(false);
    expect(parseGlossary(removed).get("q")?.usual).toBe("le vent");
    expect(parseGlossary(writeGlossaryEntry(removed, entry)).get("p")).toEqual(entry);
  });
  test("the checked proof can be narrated with the current vocabulary immediately", () => {
    const theorem: PouleTheorem = {
      label: "theorem witness", name: "witness", ok: true, formula: "p()", message: null,
      errorLoc: null, size: 1, depth: 1,
      tree: { id: 1, rule: "hyp hp", concl: "p()", loc: null, intro: [], children: [], parent: null },
    };
    const source = writeGlossaryEntry(proof, glossaryEntry("p", "il pleut", "la pluie tombe"));
    const story = narrate(theorem, proof, parseGlossary(source));
    expect(story?.lines.map((line) => line.text).join(" ")).toContain("il pleut");
    expect(story?.vocabulary.find((entry) => entry.key === "p")?.rigorous).toBe("la pluie tombe");
    expect(theorem.formula).toBe("p()");
  });
});
