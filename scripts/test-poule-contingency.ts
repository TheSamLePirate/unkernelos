/** Use the real, pinned Poule checker. Override POULE_BIN for another installation. */
import { mkdir } from "node:fs/promises";
import { CONTINGENCY_EXAMPLE } from "../src/core/poule-contingency.ts";
import { parsePouleOutput } from "../src/core/poule.ts";
import { narrate } from "../src/core/poule-story.ts";

const binary = process.env.POULE_BIN || ".cache/proof-qa/microml-source/_build/default/bin/poule.exe";
if (!await Bun.file(binary).exists()) throw new Error("Set POULE_BIN to a real Poule checker supporting --trace.");
const out = ".cache/proof-qa";
await mkdir(out, { recursive: true });
const file = `${out}/necessary-being.poule`;
await Bun.write(file, CONTINGENCY_EXAMPLE.source);
const child = Bun.spawn([binary, "--trace", file], { stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
const result = parsePouleOutput(`@@PL:qa:out@@\n${stdout}\n@@PL:qa:err@@\n${stderr}\n@@PL:qa:meta@@\n${code} 0\n`, "qa");
if (code !== 0 || result.fatal || result.theorems.length !== 7 || result.theorems.some((t) => !t.ok))
  throw new Error(JSON.stringify({ code, fatal: result.fatal, failures: result.theorems.filter((t) => !t.ok), stderr }));
const stories = result.theorems.map((theorem) => {
  const story = narrate(theorem, CONTINGENCY_EXAMPLE.source);
  if (!story || !story.lines.length) throw new Error("No narrative for " + theorem.name);
  const text = story.lines.map((line) => "  ".repeat(line.depth) + line.text).join("\n\n");
  if (/\\u[0-9a-f]{4}|\b(?:necessaire|contingent|raison_totale|membre_totalite)\(/i.test(text))
    throw new Error("Untranslated vocabulary in " + theorem.name);
  return { name: theorem.name, steps: theorem.size, title: story.title, text };
});
if (!stories[0]!.text.includes("hypothèse") || !stories[0]!.text.includes("P2") || !stories[0]!.text.includes("P3"))
  throw new Error("The main story must identify its philosophical premises.");
await Bun.write(`${out}/necessary-being-stories.txt`, stories.map((s) => s.title + "\n\n" + s.text).join("\n\n---\n\n"));
await Bun.write(`${out}/necessary-being-report.json`, JSON.stringify({ checkedBy: binary, proved: stories.length, stories }, null, 2));
console.log(JSON.stringify({ proved: stories.length, narratives: stories.length, theorems: stories.map(({ name, steps }) => ({ name, steps })) }, null, 2));
