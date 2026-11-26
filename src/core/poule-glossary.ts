import { parseGlossary, type GlossaryEntry } from "./poule-story.ts";

const identifier = /^[A-Za-z_][\w']*$/;
const annotations = () => /\(\*@\s*([A-Za-z_][\w']*)\s*(?:\(([^)]*)\))?\s*:\s*([\s\S]*?)\*\)/g;
const compact = (text: string) => text.replace(/\s+/g, " ").trim();

export function glossaryEntry(signature: string, usual: string, rigorous: string): GlossaryEntry {
  const match = /^\s*([A-Za-z_][\w']*)\s*(?:\(([^)]*)\))?\s*$/.exec(signature);
  if (!match) throw new Error("Utilise un symbole comme Monde, p ou pair(n).");
  const params = match[2]?.trim() ? match[2].split(",").map((p) => p.trim()) : [];
  if (params.some((p) => !identifier.test(p)) || new Set(params).size !== params.length)
    throw new Error("Chaque paramètre doit être un nom distinct, séparé des autres par une virgule.");
  if (!compact(usual)) throw new Error("Écris une lecture usuelle pour ce symbole.");
  if (/\(\*|\*\)/.test(usual + rigorous))
    throw new Error("Les délimiteurs de commentaire (* et *) ne sont pas autorisés dans une définition.");
  return { key: match[1]!, params, usual: compact(usual), rigorous: compact(rigorous) || null };
}

export const glossarySignature = (entry: GlossaryEntry) =>
  entry.key + (entry.params.length ? `(${entry.params.join(", ")})` : "");

/** Only narrative annotations change; proof code and ordinary comments stay intact. */
export function writeGlossaryEntry(source: string, value: GlossaryEntry, originalKey?: string): string {
  const entry = glossaryEntry(glossarySignature(value), value.usual, value.rigorous ?? "");
  const existing = parseGlossary(source);
  if (entry.key !== originalKey && existing.has(entry.key))
    throw new Error(`Le symbole ${entry.key} possède déjà une définition. Modifie-la depuis sa carte.`);
  if (originalKey && !existing.has(originalKey))
    throw new Error("Cette définition a été retirée du code. Ferme le formulaire et ajoute-la à nouveau.");
  const usual = entry.usual.replace(/[—|]/g, "\\$&");
  const text = `(*@ ${glossarySignature(entry)} : ${usual}${entry.rigorous ? ` — ${entry.rigorous}` : ""} *)`;
  const matches = [...source.matchAll(annotations())].filter((m) => m[1] === originalKey);
  if (!matches.length) return source + (source && !source.endsWith("\n") ? "\n" : "") + text + "\n";
  // The parser uses the last occurrence. Editing consolidates duplicates there.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    source = source.slice(0, match.index) + (i === matches.length - 1 ? text : "") + source.slice(match.index + match[0].length);
  }
  return source;
}

export function removeGlossaryEntry(source: string, key: string): string {
  return source.replace(annotations(), (text, found: string) => found === key ? "" : text);
}
