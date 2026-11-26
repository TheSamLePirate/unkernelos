import { Effect } from "effect";
import { appRuntime, VmService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";
import {
  BUILTIN_AGENT_SKILLS,
  describeSkill,
  filterSkills,
  mergeSkillCopies,
  type SkillEntry,
} from "./agent-skills-catalog.ts";
const LIMIT = 65536;
const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
const validPath = (s: unknown): s is string =>
  typeof s === "string" &&
  s.startsWith("/") &&
  !/[\0\r\n\t]/.test(s) &&
  s.length <= 4096;
const transport = {
  guest:
    "Inside Linux: osctl call METHOD 'JSON'. These paths belong to the VM, not the Mac.",
  cli: "On the Mac: unkernelos-companion call METHOD --params 'JSON' [--session ID]. Replace osctl call with this form. Use schema to find the methods corresponding to osctl shortcuts.",
  mcp: "Use companion_call {method,params,sessionId}. Discover the live schema with companion_schema. Read referenced guest files with guest.fs.read. Reading a skill never executes it.",
};
export async function listAgentSkills(p: Record<string, unknown> = {}) {
  const scope = p.scope ?? "all";
  if (!["all", "builtin", "guest"].includes(String(scope)))
    throw new Error("scope must be all, builtin or guest");
  if (p.query !== undefined && typeof p.query !== "string")
    throw new Error("query must be a string");
  if (
    p.roots !== undefined &&
    (!Array.isArray(p.roots) || p.roots.length > 8 || !p.roots.every(validPath))
  )
    throw new Error("roots must contain up to 8 absolute Linux paths");
  const entries: SkillEntry[] =
    scope === "guest"
      ? []
      : await Promise.all(
          BUILTIN_AGENT_SKILLS.map((content) =>
            describeSkill(content, "builtin"),
          ),
        );
  const warnings: string[] = [];
  let truncated = false;
  if (scope !== "builtin") {
    const state = await appRuntime.runPromise(
      Effect.flatMap(VmService, (v) => v.stateRef.get),
    );
    if (state.phase !== "running")
      warnings.push(
        "Guest VM is not running; only built-in skills are available.",
      );
    else {
      const project = wmStore.getSnapshot().activeWorkspaceDir;
      const defaults = [
        '"$HOME/.agents/skills"',
        '"$HOME/.claude/skills"',
        '"$HOME/.pi/agent/skills"',
        '"$HOME/.codex/skills"',
        sq(`${project}/.agents/skills`),
        sq(`${project}/.claude/skills`),
      ];
      const roots = p.roots ? (p.roots as string[]).map(sq) : defaults;
      if (roots.length) {
        try {
          const script = `for root in ${roots.join(" ")}; do
  if [ -d "$root" ]; then find -L "$root" -maxdepth 2 -type f -name SKILL.md 2>/dev/null; fi
done | sort -u | head -n 65 | (
count=0
while IFS= read -r file; do
  count=$((count + 1)); if [ "$count" -gt 64 ]; then printf '__TRUNCATED__\\n'; break; fi
  printf '%s\\t' "$file"
  head -c 65537 "$file" 2>/dev/null | base64 | tr -d '\\n'
  printf '\\n'
done
)`;
          const result = await appRuntime.runPromise(
            Effect.flatMap(VmService, (v) =>
              v.execShell(script, {
                maxBuffer: 8 * 1024 * 1024,
                signal: AbortSignal.timeout(20000),
              }),
            ),
          );
          if (result.exitCode !== 0)
            throw new Error(result.stderr || "Guest skill discovery failed");
          for (const line of result.stdout.split("\n").filter(Boolean)) {
            if (line === "__TRUNCATED__") {
              truncated = true;
              continue;
            }
            const tab = line.indexOf("\t"),
              path = line.slice(0, tab);
            if (tab < 0 || !validPath(path)) continue;
            try {
              const bytes = Uint8Array.from(atob(line.slice(tab + 1)), (c) =>
                c.charCodeAt(0),
              );
              if (bytes.length > LIMIT)
                throw new Error("SKILL.md exceeds 64 KiB");
              entries.push(
                await describeSkill(
                  new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                  "guest",
                  path,
                ),
              );
            } catch (e) {
              warnings.push(
                `${path}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  }
  return {
    skills: filterSkills(mergeSkillCopies(entries), String(p.query ?? "")),
    warnings,
    truncated,
    scope,
    transport,
  };
}
export async function readAgentSkill(id: string): Promise<unknown> {
  if (!id) throw new Error("A skill id or name is required");
  for (const content of BUILTIN_AGENT_SKILLS) {
    const entry = await describeSkill(content, "builtin");
    if (id === entry.id) return { ...entry, content, transport };
  }
  let path = id.startsWith("guest:") ? id.slice(6) : id;
  if (!validPath(path)) {
    const matches = (await listAgentSkills()).skills.filter(
      (s) => s.id === id || s.name === id,
    );
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? "Skill name is ambiguous; use its id."
          : "Skill not found",
      );
    if (matches[0].source === "builtin") {
      for (const content of BUILTIN_AGENT_SKILLS) {
        const entry = await describeSkill(content, "builtin");
        if (entry.id === matches[0].id)
          return { ...matches[0], content, transport };
      }
    }
    path = matches[0].locations[0];
  }
  if (!validPath(path) || !path.endsWith("/SKILL.md"))
    throw new Error("A discovered guest SKILL.md path is required");
  const result = await appRuntime.runPromise(
    Effect.flatMap(VmService, (v) =>
      v.execShell(
        `test -f ${sq(path)} && test -r ${sq(path)} && head -c 65537 ${sq(path)} | base64`,
        { maxBuffer: 100000, signal: AbortSignal.timeout(15000) },
      ),
    ),
  );
  if (result.exitCode !== 0) throw new Error("Cannot read guest skill");
  const bytes = Uint8Array.from(atob(result.stdout.replace(/\s/g, "")), (c) =>
    c.charCodeAt(0),
  );
  if (bytes.length > LIMIT) throw new Error("SKILL.md exceeds 64 KiB");
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    ...(await describeSkill(content, "guest", path)),
    content,
    transport,
  };
}
