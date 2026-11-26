import { describe, it, expect } from "bun:test";
import {
  BUILTIN_AGENT_SKILLS,
  describeSkill,
  filterSkills,
  mergeSkillCopies,
  skillMetadata,
} from "../src/core/agent-skills-catalog.ts";
describe("agent skill discovery", () => {
  it("lists canonical metadata without loading instructions", async () => {
    const entries = await Promise.all(
      BUILTIN_AGENT_SKILLS.map((s) => describeSkill(s, "builtin")),
    );
    expect(entries.length).toBe(3);
    expect(
      entries.every((s) => s.sha256.length === 64 && s.description.length > 0),
    ).toBe(true);
    expect(filterSkills(entries, "desktop windows").map((s) => s.name)).toEqual(
      ["unkernelos-os-control"],
    );
    expect(entries.some((s) => "content" in s)).toBe(false);
  });
  it("merges exact copies while preserving changed versions", async () => {
    const builtin = await describeSkill(BUILTIN_AGENT_SKILLS[0], "builtin");
    const copy = await describeSkill(
      BUILTIN_AGENT_SKILLS[0],
      "guest",
      "/home/user/.agents/skills/test/SKILL.md",
    );
    const changed = await describeSkill(
      BUILTIN_AGENT_SKILLS[0] + "\nChanged instructions",
      "guest",
      "/home/user/.claude/skills/test/SKILL.md",
    );
    const merged = mergeSkillCopies([builtin, copy, changed]);
    expect(merged.length).toBe(2);
    expect(merged[0].locations).toEqual(copy.locations);
    expect(builtin.locations).toEqual([]);
  });
  it("reads folded descriptions and rejects incomplete frontmatter", () => {
    expect(
      skillMetadata(
        "---\nname: example\ndescription: >-\n  First line\n  second line\n---\n# Instructions",
      ).description,
    ).toBe("First line second line");
    expect(() => skillMetadata("# no metadata")).toThrow();
    expect(() =>
      skillMetadata("---\nname: invalid name\ndescription: hello\n---"),
    ).toThrow();
  });
});
