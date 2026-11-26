import {
  SKILL_MODDING_MD,
  SKILL_REACTIVE_MD,
  SKILL_OS_CONTROL_MD,
} from "./builtin-agent-skills.ts";
export const BUILTIN_AGENT_SKILLS = [
  SKILL_MODDING_MD,
  SKILL_REACTIVE_MD,
  SKILL_OS_CONTROL_MD,
];
export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "guest";
  locations: string[];
  sha256: string;
  bytes: number;
}
function scalar(s: string): string {
  const t = s.trim();
  if (t.startsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {}
  }
  return t.startsWith("'") && t.endsWith("'")
    ? t.slice(1, -1).replace(/''/g, "'")
    : t;
}
/** Only reads name/description; never interprets YAML tags, code or instructions. */
export function skillMetadata(content: string): {
  name: string;
  description: string;
} {
  const head = content
    .replace(/^\uFEFF/, "")
    .match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!head) throw new Error("Missing skill frontmatter");
  const name = scalar(head.match(/^name:\s*(.+)$/m)?.[1] ?? "");
  let description = scalar(head.match(/^description:[ \t]*(.*)$/m)?.[1] ?? "");
  if (/^[|>][-+]?\s*$/.test(description))
    description = (
      head.match(/^description:[^\n]*\n((?:[ \t]+[^\n]*(?:\n|$))*)/m)?.[1] ?? ""
    )
      .split("\n")
      .map((x) => x.trim())
      .join(" ")
      .trim();
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(name) || !description)
    throw new Error("Skill needs a valid name and description");
  return { name, description: description.slice(0, 4096) };
}
export function filterSkills(
  entries: SkillEntry[],
  query: string,
): SkillEntry[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((s) =>
    terms.every((t) =>
      `${s.name} ${s.description}`.toLocaleLowerCase().includes(t),
    ),
  );
}
export function mergeSkillCopies(entries: SkillEntry[]): SkillEntry[] {
  const result: SkillEntry[] = [];
  for (const entry of entries) {
    const same = result.find(
      (s) => s.name === entry.name && s.sha256 === entry.sha256,
    );
    if (same)
      same.locations = [...new Set([...same.locations, ...entry.locations])];
    else result.push({ ...entry, locations: [...entry.locations] });
  }
  return result;
}
export async function describeSkill(
  content: string,
  source: SkillEntry["source"],
  location?: string,
): Promise<SkillEntry> {
  const metadata = skillMetadata(content),
    bytes = new TextEncoder().encode(content);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    id: source === "builtin" ? `builtin:${metadata.name}` : `guest:${location}`,
    ...metadata,
    source,
    locations: location ? [location] : [],
    sha256: hash,
    bytes: bytes.byteLength,
  };
}
