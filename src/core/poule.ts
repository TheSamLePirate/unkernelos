/**
 * Poule — the proof language shipped with microML (coucou747/microML, poulelib/).
 *
 * `poule --trace file.poule` checks every theorem and prints, per theorem, a JSON line
 * `TRACE {...}` holding its natural-deduction derivation. This module drives it inside the
 * guest and turns the output into a model for the Proof Studio and Notebook `poule` cells.
 * Pure logic only (no VM imports): the VM runner lives in poule-runner.ts.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface PouleRange {
  /** 1-based line, 0-based column, as printed by Poule. */
  readonly line: number;
  readonly col: number;
  readonly endLine: number;
  readonly endCol: number;
}

export interface DerivNode {
  readonly id: number;
  readonly rule: string;
  readonly concl: string;
  readonly loc: PouleRange | null;
  /** Hypotheses / variables that come into scope at this node ("h : A", "x : Nat"). */
  readonly intro: readonly string[];
  readonly children: readonly DerivNode[];
  readonly parent: DerivNode | null;
}

export interface PouleTheorem {
  readonly label: string; // "theorem and_comm" | "check"
  readonly name: string | null;
  readonly ok: boolean;
  readonly formula: string | null;
  readonly tree: DerivNode | null;
  readonly message: string | null;
  readonly errorLoc: PouleRange | null;
  /** Number of inference steps and depth (accepted theorems only). */
  readonly size: number;
  readonly depth: number;
}

export interface PouleResult {
  readonly installed: boolean;
  /** Installed Poule predates --trace / proof checking. */
  readonly outdated: boolean;
  readonly version: string | null;
  readonly theorems: readonly PouleTheorem[];
  /** Parse error or ill-formed declaration (stops the whole file). */
  readonly fatal: { readonly message: string; readonly loc: PouleRange | null } | null;
  readonly ms: number;
}

// ---------------------------------------------------------------------------
// Guest script
// ---------------------------------------------------------------------------

const b64 = (txt: string): string => {
  const bytes = new TextEncoder().encode(txt);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
};

export function buildPouleScript(source: string): { script: string; token: string } {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const script = `TOK='${token}'
sec(){ printf '\\n@@PL:%s:%s@@\\n' "$TOK" "$1"; }
nowms(){ date +%s%3N; }
P=/opt/microml/bin/poule.exe
if [ ! -x "$P" ]; then sec missing; exit 0; fi
W="$(mktemp -d /tmp/poule.XXXXXX)"
trap 'rm -rf "$W"' EXIT
cd "$W" || exit 1
printf '%s' '${b64(source)}' | base64 -d > proof.poule
sec version; cat /opt/microml/VERSION 2>/dev/null
T0=$(nowms)
timeout 20 "$P" --trace proof.poule > out.txt 2> err.txt
EC=$?
T1=$(nowms)
sec out; head -c 400000 out.txt
sec err; head -c 20000 err.txt
sec meta; echo "$EC $((T1 - T0))"
sec end
`;
  return { script, token };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function splitSections(raw: string, token: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(`\\n?@@PL:${token}:([^@\\n]+)@@\\n`, "g");
  let m: RegExpExecArray | null;
  let last: string | null = null;
  let idx = 0;
  while ((m = re.exec(raw)) !== null) {
    if (last !== null) out.set(last, raw.slice(idx, m.index));
    last = m[1]!;
    idx = m.index + m[0].length;
  }
  if (last !== null) out.set(last, raw.slice(idx));
  return out;
}

export function parseRange(s: string | null | undefined): PouleRange | null {
  if (!s) return null;
  const m = /<[^>]*>(\d+):(-?\d+)-(\d+):(-?\d+)/.exec(s);
  if (m && Number(m[1]) > 0) {
    return { line: Number(m[1]), col: Math.max(0, Number(m[2])), endLine: Number(m[3]), endCol: Math.max(0, Number(m[4])) };
  }
  // parse errors: "parse error at proof.poule:3:7 near \"=>\"" — column is the END of the token
  const p = /at [^\s:]+:(\d+):(\d+)(?: near "((?:[^"\\]|\\.)*)")?/.exec(s);
  if (p) {
    const len = Math.max(1, p[3]?.length ?? 1);
    const col = Math.max(0, Number(p[2]) - len);
    return { line: Number(p[1]), col, endLine: Number(p[1]), endCol: col + len };
  }
  return null;
}

const stripLocation = (msg: string): string =>
  msg
    .replace(/\n?\(location <[^>]*>[^)]*\)\s*$/, "")
    .replace(/ at proof\.poule:/g, " at line ")
    .trim();

interface RawDeriv {
  rule: string;
  concl: string;
  loc: string;
  intro: string[];
  children: RawDeriv[];
}

function buildTree(raw: RawDeriv): { root: DerivNode; size: number; depth: number } {
  let id = 0;
  let size = 0;
  let depth = 0;
  const go = (r: RawDeriv, parent: DerivNode | null, d: number): DerivNode => {
    size++;
    depth = Math.max(depth, d);
    const node: { -readonly [K in keyof DerivNode]: DerivNode[K] } = {
      id: id++,
      rule: r.rule,
      concl: r.concl,
      loc: parseRange(r.loc),
      intro: r.intro ?? [],
      children: [],
      parent,
    };
    node.children = (r.children ?? []).map((c) => go(c, node, d + 1));
    return node;
  };
  const root = go(raw, null, 1);
  return { root, size, depth };
}

export function parsePouleOutput(raw: string, token: string): PouleResult {
  const s = splitSections(raw, token);
  const base: PouleResult = { installed: false, outdated: false, version: null, theorems: [], fatal: null, ms: 0 };
  if (s.has("missing") || !s.has("meta")) return base;
  const out = s.get("out") ?? "";
  const err = s.get("err") ?? "";
  const [ecRaw, msRaw] = (s.get("meta") ?? "").trim().split(/\s+/);
  const exitCode = Number(ecRaw);
  const version = (s.get("version") ?? "").trim() || null;

  if (/unknown option ['`]?--trace/.test(out + err)) {
    return { ...base, installed: true, outdated: true, version };
  }

  const theorems: PouleTheorem[] = [];
  let afterLastTrace = out;
  for (const line of out.split("\n")) {
    if (!line.startsWith("TRACE ")) continue;
    try {
      const j = JSON.parse(line.slice(6)) as {
        theorem: string;
        ok: boolean;
        formula?: string;
        tree?: RawDeriv;
        message?: string;
      };
      const name = j.theorem.startsWith("theorem ") ? j.theorem.slice(8) : null;
      if (j.ok && j.tree) {
        const { root, size, depth } = buildTree(j.tree);
        theorems.push({ label: j.theorem, name, ok: true, formula: j.formula ?? root.concl, tree: root, message: null, errorLoc: null, size, depth });
      } else {
        const msg = j.message ?? "rejected";
        theorems.push({ label: j.theorem, name, ok: false, formula: null, tree: null, message: stripLocation(msg), errorLoc: parseRange(msg), size: 0, depth: 0 });
      }
    } catch {
      // ignore a truncated line
    }
    afterLastTrace = out.slice(out.lastIndexOf(line) + line.length);
  }

  let fatal: PouleResult["fatal"] = null;
  if (exitCode === 124) {
    fatal = { message: "Poule did not finish within 20 s.", loc: null };
  } else if (exitCode !== 0) {
    const tail = afterLastTrace
      .split("\n")
      .filter((l) => !/^(theorem \S+|check) : (OK|FAILED)$/.test(l))
      .join("\n")
      .replace(/\d+ proof\(s\) rejected/, "")
      .trim();
    if (tail && !theorems.some((t) => !t.ok && t.message && tail.includes(t.message))) {
      fatal = { message: stripLocation(tail), loc: parseRange(tail) };
    } else if (theorems.length === 0) {
      const e = err.replace(/^Fatal error: exception Failure\("?/m, "").trim();
      fatal = { message: e || `poule exited with code ${exitCode}`, loc: parseRange(e) };
    }
  }

  return { installed: true, outdated: false, version, theorems, fatal, ms: Number(msRaw) || 0 };
}

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

export function rangeToOffsets(src: string, r: PouleRange): [number, number] {
  const lines = src.split("\n");
  const off = (line: number, col: number) => {
    let o = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) o += lines[i]!.length + 1;
    return Math.min(src.length, o + col);
  };
  const a = off(r.line, r.col);
  return [a, Math.max(a + 1, off(r.endLine, r.endCol))];
}

export function postOrder(root: DerivNode): DerivNode[] {
  const out: DerivNode[] = [];
  const go = (n: DerivNode) => {
    n.children.forEach(go);
    out.push(n);
  };
  go(root);
  return out;
}

/** Deepest node whose source range contains `offset`. */
export function nodeAtOffset(src: string, root: DerivNode, offset: number): DerivNode | null {
  let best: DerivNode | null = null;
  let bestLen = Infinity;
  const go = (n: DerivNode) => {
    if (n.loc) {
      const [a, b] = rangeToOffsets(src, n.loc);
      if (offset >= a && offset <= b && b - a <= bestLen) {
        best = n;
        bestLen = b - a;
      }
    }
    n.children.forEach(go);
  };
  go(root);
  return best;
}

/** Type names declared in the source (`type 'a List = ...`). */
export function declaredTypes(src: string): Set<string> {
  const out = new Set<string>();
  const re = /^\s*type\s+(?:'[\w']+\s+)*([A-Za-z_][\w']*)\s*=/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.add(m[1]!);
  return out;
}

/** Hypotheses and variables in scope at `node` (union of intro from the root down to it). */
export function contextOf(node: DerivNode, types: Set<string>): { vars: string[]; hyps: string[] } {
  const chain: DerivNode[] = [];
  for (let n: DerivNode | null = node; n; n = n.parent) chain.unshift(n);
  const vars: string[] = [];
  const hyps: string[] = [];
  for (const n of chain) {
    for (const i of n.intro) {
      const rhs = i.slice(i.indexOf(" : ") + 3).trim();
      const head = /^'|^\(*([A-Za-z_][\w']*)/.exec(rhs);
      const isType = rhs.startsWith("'") || rhs.startsWith("(") || (head?.[1] !== undefined && types.has(head[1]));
      (isType ? vars : hyps).push(i);
    }
  }
  return { vars, hyps };
}

export interface GlobalFact {
  readonly kind: "axiom" | "theorem";
  readonly name: string;
  readonly statement: string;
}

/** Axioms and theorem statements declared in the source, in order. */
export function globalFacts(src: string): GlobalFact[] {
  const clean = src.replace(/\(\*[\s\S]*?\*\)/g, (m) => m.replace(/[^\n]/g, " "));
  const re = /^\s*(axiom|theorem)\s+([A-Za-z_][\w']*)\s*:\s*([\s\S]*?)(?=^\s*(?:type|fundecl|pred|axiom|theorem|check)\b|$(?![\s\S]))/gm;
  const facts: GlobalFact[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    let statement = m[3]!.trim();
    if (m[1] === "theorem") {
      // statement ends at the top-level "=" that introduces the proof (not "=>")
      const idx = statement.search(/=(?!>)\s*(?:\n|fun|gen|\(|[a-z_]|triv|pack|unpack|abort|left|right|match|fst|snd)/);
      if (idx >= 0) statement = statement.slice(0, idx).trim();
    }
    facts.push({ kind: m[1] as "axiom" | "theorem", name: m[2]!, statement: statement.replace(/\s+/g, " ") });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

/** ASCII Poule formula → mathematical notation. */
export function prettyFormula(f: string): string {
  return f
    .replace(/forall \(([^:()]+) : ([^)]*(?:\([^)]*\))?[^)]*)\)\.\s*/g, "∀$1 : $2. ")
    .replace(/exists \(([^:()]+) : ([^)]*(?:\([^)]*\))?[^)]*)\)\.\s*/g, "∃$1 : $2. ")
    .replace(/\/\\/g, "∧")
    .replace(/\\\//g, "∨")
    .replace(/->/g, "→")
    .replace(/\bTop\b/g, "⊤")
    .replace(/\bBottom\b/g, "⊥");
}

export type RuleFamily = "intro" | "elim" | "hyp";

export interface RuleView {
  readonly label: string;
  /** Instantiated term for ∀E / ∃I, e.g. "Zero". */
  readonly arg: string | null;
  readonly family: RuleFamily;
}

const RULE_LABELS: Record<string, [string, RuleFamily]> = {
  "Top-I": ["⊤I", "intro"],
  "Bottom-E": ["⊥E", "elim"],
  "And-I": ["∧I", "intro"],
  "And-E1": ["∧E₁", "elim"],
  "And-E2": ["∧E₂", "elim"],
  "Or-I1": ["∨I₁", "intro"],
  "Or-I2": ["∨I₂", "intro"],
  "Or-E": ["∨E", "elim"],
  "Impl-I": ["→I", "intro"],
  "Impl-E": ["→E", "elim"],
  "Forall-I": ["∀I", "intro"],
  "Forall-E": ["∀E", "elim"],
  "Exists-I": ["∃I", "intro"],
  "Exists-E": ["∃E", "elim"],
};

export function ruleView(rule: string): RuleView {
  if (rule.startsWith("hyp ")) return { label: rule.slice(4), arg: null, family: "hyp" };
  const m = /^(\S+)(?: \[(.*)\])?$/.exec(rule);
  const key = m?.[1] ?? rule;
  const [label, family] = RULE_LABELS[key] ?? [rule, "intro"];
  return { label, arg: m?.[2] ?? null, family };
}

/** Names discharged / bound by a node (introduced in its children). */
export function dischargedBy(node: DerivNode): string[] {
  return node.children.flatMap((c) => c.intro.map((i) => i.split(" : ")[0]!));
}

// ---------------------------------------------------------------------------
// LaTeX (bussproofs) export
// ---------------------------------------------------------------------------

const latexFormula = (f: string): string =>
  prettyFormula(f)
    .replace(/\\/g, "\\backslash ")
    .replace(/_/g, "\\_")
    .replace(/∀([^:]+) : ([^.]+)\. /g, "\\forall $1{:}$2.\\, ")
    .replace(/∃([^:]+) : ([^.]+)\. /g, "\\exists $1{:}$2.\\, ")
    .replace(/∧/g, "\\land ")
    .replace(/∨/g, "\\lor ")
    .replace(/→/g, "\\to ")
    .replace(/⊤/g, "\\top ")
    .replace(/⊥/g, "\\bot ")
    .replace(/'/g, "'");

const INF = ["UnaryInfC", "BinaryInfC", "TrinaryInfC", "QuaternaryInfC", "QuinaryInfC"];

export function toBussproofs(root: DerivNode, theorem: string): string {
  const lines: string[] = [];
  const go = (n: DerivNode) => {
    const rv = ruleView(n.rule);
    if (rv.family === "hyp") {
      // hypothesis / axiom leaf, labelled with its name: [A]^h
      lines.push(`\\AxiomC{$[${latexFormula(n.concl)}]^{\\mathrm{${rv.label.replace(/_/g, "\\_")}}}$}`);
      return;
    }
    if (n.children.length === 0) {
      lines.push("\\AxiomC{}");
    } else {
      n.children.slice(0, 5).forEach(go);
    }
    const label = rv.label.replace(/₁/g, "_1").replace(/₂/g, "_2");
    const discharged = dischargedBy(n);
    const lab = `$${label.replace("∧", "\\land ").replace("∨", "\\lor ").replace("→", "\\to ").replace("∀", "\\forall ").replace("∃", "\\exists ").replace("⊤", "\\top ").replace("⊥", "\\bot ")}$${rv.arg ? ` [${rv.arg}]` : ""}${discharged.length ? ` (${discharged.join(", ")})` : ""}`;
    lines.push(`\\RightLabel{\\scriptsize ${lab.replace(/_(?!\d)/g, "\\_")}}`);
    lines.push(`\\${INF[Math.max(0, Math.min(4, n.children.length - 1))]}{$${latexFormula(n.concl)}$}`);
  };
  go(root);
  return `% ${theorem} — generated by unkernelOS Proof Studio (Poule)\n% \\usepackage{bussproofs}\n\\begin{prooftree}\n${lines.join("\n")}\n\\end{prooftree}\n`;
}

// ---------------------------------------------------------------------------
// Rules catalogue (palette + cheatsheet)
// ---------------------------------------------------------------------------

export interface RuleDoc {
  readonly rule: string;
  readonly name: string;
  readonly syntax: string;
  readonly proves: string;
  readonly from: string;
  readonly snippet: string;
}

export const POULE_RULES: readonly RuleDoc[] = [
  { rule: "→I", name: "Implication intro", syntax: "fun (h : A) => p", proves: "A → B", from: "p : B with h : A", snippet: "fun (h : A) => " },
  { rule: "→E", name: "Modus ponens", syntax: "p q", proves: "B", from: "p : A → B, q : A", snippet: "p q" },
  { rule: "∧I", name: "Conjunction intro", syntax: "(p, q)", proves: "A ∧ B", from: "p : A, q : B", snippet: "(p, q)" },
  { rule: "∧E", name: "Projections", syntax: "fst p · snd p", proves: "A · B", from: "p : A ∧ B", snippet: "fst p" },
  { rule: "∨I", name: "Disjunction intro", syntax: "left p : B · right A p", proves: "A ∨ B", from: "p : A · p : B", snippet: "left p : B" },
  { rule: "∨E", name: "Case analysis", syntax: "match p with | left h1 => p1 | right h2 => p2", proves: "C", from: "p : A ∨ B, p1 p2 : C", snippet: "match p with\n    | left h1 => p1\n    | right h2 => p2" },
  { rule: "∀I", name: "Generalisation", syntax: "gen (x : T) => p", proves: "∀x : T. A", from: "p : A, x fresh", snippet: "gen (x : T) => " },
  { rule: "∀E", name: "Instantiation", syntax: "p [t]", proves: "A[x := t]", from: "p : ∀x : T. A, t : T", snippet: "p [t]" },
  { rule: "∃I", name: "Witness", syntax: "pack [T, t, p]", proves: "∃x : T. A", from: "p : A[x := t]", snippet: "pack [T, t, p]" },
  { rule: "∃E", name: "Unpack a witness", syntax: "unpack (h, x, hx, p)", proves: "C", from: "h : ∃y : T. A, hx : A[y := x]", snippet: "unpack (h, x, hx, p)" },
  { rule: "⊤I", name: "Truth", syntax: "triv", proves: "⊤", from: "—", snippet: "triv" },
  { rule: "⊥E", name: "Ex falso", syntax: "abort p : F", proves: "F", from: "p : ⊥", snippet: "abort p : F" },
];

// ---------------------------------------------------------------------------
// Guide: formula reading, next-step suggestions, error explanations
// ---------------------------------------------------------------------------

export type Fm =
  | { k: "top" }
  | { k: "bottom" }
  | { k: "pred"; name: string; args: string }
  | { k: "eq"; a: string; b: string }
  | { k: "and" | "or" | "impl"; a: Fm; b: Fm }
  | { k: "forall" | "exists"; x: string; ty: string; body: Fm };

/** Parse a Poule formula (ASCII syntax, as written or as printed by Poule). */
export function parseFormula(src: string): Fm | null {
  const toks = src.match(/->|\/\\|\\\/|[A-Za-z_][\w']*|'[\w']+|[(),:.=]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const expect = (t: string) => {
    if (next() !== t) throw new Error(`expected ${t}`);
  };
  // balanced text until a top-level token in `stops`
  const until = (stops: string[]) => {
    let depth = 0;
    const out: string[] = [];
    while (i < toks.length) {
      const t = peek()!;
      if (depth === 0 && stops.includes(t)) break;
      if (t === "(") depth++;
      if (t === ")") {
        if (depth === 0) break;
        depth--;
      }
      out.push(next()!);
    }
    return out.join(" ").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")").replace(/\s*,\s*/g, ", ");
  };
  const impl = (): Fm => {
    const a = or();
    if (peek() === "->") {
      next();
      return { k: "impl", a, b: impl() };
    }
    return a;
  };
  const or = (): Fm => {
    let a = and();
    while (peek() === "\\/") {
      next();
      a = { k: "or", a, b: and() };
    }
    return a;
  };
  const and = (): Fm => {
    let a = atom();
    while (peek() === "/\\") {
      next();
      a = { k: "and", a, b: atom() };
    }
    return a;
  };
  const term = () => {
    const t = next();
    if (!t || !/^[A-Za-z_]/.test(t)) throw new Error("term");
    if (peek() === "(") {
      next();
      const args = until([")"]);
      expect(")");
      return `${t}(${args})`;
    }
    return t;
  };
  const atom = (): Fm => {
    const t = peek();
    if (t === "Top") return next(), { k: "top" };
    if (t === "Bottom") return next(), { k: "bottom" };
    if (t === "forall" || t === "exists") {
      next();
      expect("(");
      const x = next()!;
      expect(":");
      const ty = until([")"]);
      expect(")");
      expect(".");
      return { k: t, x, ty, body: impl() };
    }
    if (t === "(") {
      next();
      const f = impl();
      expect(")");
      return f;
    }
    // pred(args)  |  term = term
    const save = i;
    const name = next();
    if (!name || !/^[A-Za-z_]/.test(name)) throw new Error("atom");
    if (peek() === "(") {
      next();
      const args = until([")"]);
      expect(")");
      if (peek() === "=") {
        next();
        return { k: "eq", a: `${name}(${args})`, b: term() };
      }
      return { k: "pred", name, args };
    }
    if (peek() === "=") {
      next();
      return { k: "eq", a: name, b: term() };
    }
    i = save;
    throw new Error("atom");
  };
  try {
    const f = impl();
    return i === toks.length ? f : null;
  } catch {
    return null;
  }
}

const PREC = { impl: 0, or: 1, and: 2 } as const;

/** Print a parsed formula back in Poule's ASCII syntax (minimal parentheses). */
export function printFormula(f: Fm, prec = 0): string {
  const wrap = (p: number, s: string) => (prec > p ? `(${s})` : s);
  switch (f.k) {
    case "top":
      return "Top";
    case "bottom":
      return "Bottom";
    case "pred":
      return `${f.name}(${f.args})`;
    case "eq":
      return wrap(2, `${f.a} = ${f.b}`);
    case "and":
      return wrap(PREC.and, `${printFormula(f.a, 2)} /\\ ${printFormula(f.b, 3)}`);
    case "or":
      return wrap(PREC.or, `${printFormula(f.a, 1)} \\/ ${printFormula(f.b, 2)}`);
    case "impl":
      return wrap(PREC.impl, `${printFormula(f.a, 1)} -> ${printFormula(f.b, 0)}`);
    case "forall":
    case "exists":
      return wrap(0, `${f.k} (${f.x} : ${f.ty}). ${printFormula(f.body, 0)}`);
  }
}

/** Plain-English reading of a formula, for beginners. */
export function describeFormula(f: Fm, top = true): string {
  const sub = (g: Fm) => {
    const s = describeFormula(g, false);
    return g.k === "pred" || g.k === "top" || g.k === "bottom" || g.k === "eq" ? s : `(${s})`;
  };
  let s: string;
  switch (f.k) {
    case "top":
      s = "true";
      break;
    case "bottom":
      s = "a contradiction";
      break;
    case "pred":
      s = `${f.name}(${f.args})`;
      break;
    case "eq":
      s = `${f.a} equals ${f.b}`;
      break;
    case "and":
      s = `${sub(f.a)} and ${sub(f.b)}`;
      break;
    case "or":
      s = `${sub(f.a)} or ${sub(f.b)}`;
      break;
    case "impl":
      s = f.b.k === "bottom" ? `${sub(f.a)} is impossible` : `if ${sub(f.a)}, then ${describeFormula(f.b, false)}`;
      break;
    case "forall":
      s = `for every ${f.x} of type ${f.ty}, ${describeFormula(f.body, false)}`;
      break;
    case "exists":
      s = `there is some ${f.x} of type ${f.ty} such that ${describeFormula(f.body, false)}`;
      break;
  }
  return top ? s.charAt(0).toUpperCase() + s.slice(1) + "." : s;
}

export interface Suggestion {
  readonly rule: string;
  readonly text: string;
  readonly snippet: string | null;
}

/** What a beginner could do next to prove `goal`, given hypotheses in scope ("h : A"). */
export function suggestSteps(goalAscii: string, hyps: readonly string[]): Suggestion[] {
  const goal = parseFormula(goalAscii);
  const out: Suggestion[] = [];
  const ctx = hyps
    .map((h) => {
      const at = h.indexOf(" : ");
      return { name: h.slice(0, at), text: h.slice(at + 3), f: parseFormula(h.slice(at + 3)) };
    })
    .filter((h) => h.f);
  const same = (a: Fm, b: Fm) => printFormula(a) === printFormula(b);

  if (goal) {
    for (const h of ctx) {
      if (same(h.f!, goal)) out.push({ rule: "hyp", text: `The goal is exactly hypothesis ${h.name}: just write it.`, snippet: h.name });
      if (h.f!.k === "and") {
        if (same(h.f!.a, goal)) out.push({ rule: "∧E₁", text: `The goal is the left side of ${h.name}.`, snippet: `fst ${h.name}` });
        if (same(h.f!.b, goal)) out.push({ rule: "∧E₂", text: `The goal is the right side of ${h.name}.`, snippet: `snd ${h.name}` });
      }
    }
    switch (goal.k) {
      case "impl":
        out.push({
          rule: "→I",
          text: `To prove an implication, assume the premise and prove the conclusion.`,
          snippet: `fun (h : ${printFormula(goal.a)}) => `,
        });
        break;
      case "and":
        out.push({ rule: "∧I", text: "To prove a conjunction, prove both sides and pair them.", snippet: "(p, q)" });
        break;
      case "or":
        out.push({
          rule: "∨I",
          text: "To prove a disjunction, pick a side. left p : B needs p of the left side; right A p needs p of the right side.",
          snippet: `left p : ${printFormula(goal.b)}`,
        });
        break;
      case "forall":
        out.push({
          rule: "∀I",
          text: `To prove it for every ${goal.x}, take an arbitrary one (a fresh name) and prove the body.`,
          snippet: `gen (${goal.x} : ${goal.ty}) => `,
        });
        break;
      case "exists":
        out.push({
          rule: "∃I",
          text: `Give a witness of type ${goal.ty} and prove the body for it.`,
          snippet: `pack [${goal.ty}, witness, proof]`,
        });
        break;
      case "top":
        out.push({ rule: "⊤I", text: "Top is always true.", snippet: "triv" });
        break;
      case "bottom": {
        const neg = ctx.find((h) => h.f!.k === "impl" && (h.f as { b: Fm }).b.k === "bottom");
        out.push({
          rule: "→E",
          text: neg
            ? `You need a contradiction: ${neg.name} says ${printFormula((neg.f as { a: Fm }).a)} is impossible, so apply it to a proof of that.`
            : "You need a contradiction: apply a hypothesis of the form A -> Bottom to a proof of A.",
          snippet: neg ? `${neg.name} p` : null,
        });
        break;
      }
      default: {
        // atom: look for something that concludes it
        const concl = (f: Fm): Fm => (f.k === "impl" ? concl(f.b) : f.k === "forall" ? concl(f.body) : f);
        const goalHead = goal.k === "pred" ? goal.name : null;
        for (const h of ctx) {
          const c = concl(h.f!);
          if (c !== h.f && goalHead && c.k === "pred" && c.name === goalHead) {
            const binders = (f: Fm): string => (f.k === "forall" ? ` [${f.x}?]` + binders(f.body) : "");
            out.push({
              rule: h.f!.k === "forall" ? "∀E →E" : "→E",
              text: `${h.name} concludes ${goalHead}(…): instantiate it${h.f!.k === "forall" ? " with [t]" : ""} and apply it to its premises.`,
              snippet: `${h.name}${binders(h.f!)} p`,
            });
          }
        }
        if (out.length === 0) {
          out.push({ rule: "axiom", text: "An atomic goal is proved by a hypothesis, an axiom or an earlier theorem that concludes it.", snippet: null });
        }
      }
    }
  }
  for (const h of ctx) {
    if (h.f!.k === "and") out.push({ rule: "∧E", text: `${h.name} is a conjunction: fst ${h.name} and snd ${h.name} give each side.`, snippet: `fst ${h.name}` });
    if (h.f!.k === "or")
      out.push({ rule: "∨E", text: `${h.name} is a disjunction: reason by cases.`, snippet: `match ${h.name} with\n    | left a => p1\n    | right b => p2` });
    if (h.f!.k === "exists")
      out.push({ rule: "∃E", text: `${h.name} gives a witness: unpack it.`, snippet: `unpack (${h.name}, x, hx, p)` });
  }
  return out.slice(0, 4);
}

/** Beginner-friendly explanation of a Poule error message. */
export function explainError(message: string): string {
  const m = message;
  if (/^this proof proves/.test(m))
    return "Your proof is well-formed, but it proves a different formula. Compare the two: usually the outermost connective of the goal tells you which rule should come first (→ fun, ∧ pair, ∀ gen, ∃ pack, ∨ left/right).";
  if (/^unknown hypothesis/.test(m))
    return "This name is not in scope. Check the spelling, that it was introduced by fun / match / unpack above this point, or that the axiom/theorem is declared earlier in the file (and was itself accepted).";
  if (/is not fresh/.test(m))
    return "gen (x : T) means “for an arbitrary x”. That only works if nothing you already know mentions x — otherwise x is not arbitrary. Pick a new name.";
  if (/escapes/.test(m)) return "The witness obtained by unpack is only known inside the unpack: the final conclusion must not mention it.";
  if (/^type mismatch/.test(m))
    return "A term has the wrong type here (e.g. a list where a Nat is expected). The types of predicate and function arguments come from their pred / fundecl declarations.";
  if (/expects \d+ argument/.test(m)) return "Wrong number of arguments: compare with the declaration of this predicate, function or constructor.";
  if (/^unbound term variable/.test(m))
    return "This variable is not bound. Quantify it in the statement (forall / exists) or introduce it with gen / unpack. A constant must be declared: fundecl c : () -> T.";
  if (/^left: the annotation|^right: the annotation/.test(m))
    return "In left p : B the annotation B is the OTHER side of the disjunction (the one you are not proving). Same for right A p, where A is the left side.";
  if (/^fun: the annotation/.test(m)) return "In fun (h : A) => p, A must be exactly the premise of the implication you are proving.";
  if (/^abort: the annotation/.test(m)) return "abort p : F must be annotated with the formula you are proving.";
  if (/^(fst|snd) expects/.test(m)) return "fst / snd only work on a proof of a conjunction A /\\ B.";
  if (/^match expects/.test(m)) return "match … with | left … | right … needs a proof of a disjunction A \\/ B.";
  if (/^application expects/.test(m)) return "Only a proof of an implication A -> B can be applied to an argument.";
  if (/^instantiation/.test(m)) return "p [t] instantiates a universal: p must prove forall (x : T). …";
  if (/cannot infer what pack proves/.test(m))
    return "pack needs to know which ∃ it proves: use it where the goal is known (directly as a theorem's proof, or under fun / gen / unpack), not as the function of an application.";
  if (/^unpack expects/.test(m)) return "unpack's first argument must be the NAME of a hypothesis that proves an exists. Bind it first with fun (h : exists …) => … or state a lemma.";
  if (/^gen: variable/.test(m)) return "The type in gen (x : T) must match the type the goal quantifies over.";
  if (/^pack: witness type/.test(m)) return "The type in pack [T, t, p] must match the type the goal's exists quantifies over.";
  if (/parse error/.test(m))
    return "Syntax error near this token. Common causes: a missing parenthesis, a predicate called without () — write p() — or a proof that starts where a formula is expected.";
  if (/declared twice/.test(m)) return "Two declarations use the same name.";
  if (/^unknown (type|predicate|function|constructor)/.test(m)) return "Declare it before use (type / pred / fundecl), or check the spelling.";
  return "";
}

const RULE_HELP: Record<string, string> = {
  "Top-I": "⊤ introduction: Top is true, no premise needed.",
  "Bottom-E": "⊥ elimination (ex falso): from a contradiction, anything follows.",
  "And-I": "∧ introduction: a proof of A and a proof of B give A ∧ B.",
  "And-E1": "∧ elimination: from A ∧ B, keep A.",
  "And-E2": "∧ elimination: from A ∧ B, keep B.",
  "Or-I1": "∨ introduction: from A, conclude A ∨ B.",
  "Or-I2": "∨ introduction: from B, conclude A ∨ B.",
  "Or-E": "∨ elimination: if C follows from A and C follows from B, then C follows from A ∨ B.",
  "Impl-I": "→ introduction: assuming A, B was proved — so A → B (the assumption is discharged).",
  "Impl-E": "→ elimination (modus ponens): from A → B and A, conclude B.",
  "Forall-I": "∀ introduction: proved for an arbitrary x, hence for every x.",
  "Forall-E": "∀ elimination: what holds for every x holds for this term.",
  "Exists-I": "∃ introduction: this witness satisfies the property.",
  "Exists-E": "∃ elimination: name the witness and use its property (it must not escape).",
};

export function ruleHelp(rule: string): string {
  if (rule.startsWith("hyp ")) return `Hypothesis ${rule.slice(4)}: an assumption in scope, an axiom or an earlier theorem.`;
  return RULE_HELP[rule.split(" ")[0]!] ?? rule;
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export type PouleLevel = "beginner" | "intermediate" | "expert" | "puzzle";

export interface PouleExample {
  readonly id: string;
  readonly level: PouleLevel;
  readonly title: string;
  readonly blurb: string;
  readonly source: string;
}

export const POULE_LEVELS: Record<PouleLevel, string> = {
  beginner: "Start here",
  intermediate: "Classics",
  expert: "Expert — paradoxes & modal metaphysics",
  puzzle: "Puzzles",
};

export const POULE_EXAMPLES: readonly PouleExample[] = [
  {
    id: "first-steps",
    level: "beginner",
    title: "First steps",
    blurb: "Your first proofs: assume, pair, project",
    source: `(* Welcome to Poule!  A PROOF is a little program, and its TYPE is the
   formula it proves. Turn on Guide mode (top bar) for hints.

   - pred p : ()        declares a proposition p().
   - theorem name : FORMULA = PROOF
   - Move the caret inside a proof: the panel on the right shows what
     is known (hypotheses) and what remains to prove (the goal ⊢).    *)

pred p : ()
pred q : ()

(* "If p, then p." Assume h : p() and give it back. *)
theorem identity : p() -> p() = fun (h : p()) => h

(* Two assumptions; we only need the first one. *)
theorem keep_first : p() -> q() -> p() =
  fun (a : p()) => fun (b : q()) => a

(* A pair (x, y) proves a conjunction  p() /\\ q(). *)
theorem both : p() -> q() -> p() /\\ q() =
  fun (a : p()) => fun (b : q()) => (a, b)

(* fst / snd take a conjunction apart. *)
theorem swap : p() /\\ q() -> q() /\\ p() =
  fun (h : p() /\\ q()) => (snd h, fst h)

(* EXERCISE — rejected on purpose. Replace "triv" by a real proof of
   q() /\\ p() -> p().  Guide mode suggests the first step; the panel
   turns green when you are right.  (Solution: fun (h : q() /\\ p()) => snd h) *)
theorem exercise : q() /\\ p() -> p() = triv
`,
  },
  {
    id: "syllogism",
    level: "beginner",
    title: "Socrates is mortal",
    blurb: "Aristotle's syllogism: ∀ and →, step by step",
    source: `(* The most famous syllogism ("Barbara"):
     All men are mortal.  Socrates is a man.  Therefore Socrates is mortal. *)

type Being = Socrates | Plato
pred man : (Being)
pred mortal : (Being)

axiom all_men_are_mortal : forall (x : Being). man(x) -> mortal(x)
axiom socrates_is_a_man : man(Socrates)

(* all_men_are_mortal [Socrates]  :  man(Socrates) -> mortal(Socrates)
   ... applied to socrates_is_a_man gives mortal(Socrates).        *)
theorem socrates_is_mortal : mortal(Socrates) =
  all_men_are_mortal [Socrates] socrates_is_a_man

(* The general rule, re-proved for an arbitrary y. *)
theorem barbara : forall (y : Being). man(y) -> mortal(y) =
  gen (y : Being) => fun (h : man(y)) => all_men_are_mortal [y] h
`,
  },
  {
    id: "propositional",
    level: "intermediate",
    title: "Propositional logic",
    blurb: "∧, ∨, → : commutativity, transitivity, currying, distributivity",
    source: `(* Propositional logic in natural deduction. *)

pred p : ()
pred q : ()
pred r : ()

theorem or_comm : p() \\/ q() -> q() \\/ p() =
  fun (h : p() \\/ q()) =>
    match h with
    | left a => right q() a
    | right b => left b : p()

theorem trans : (p() -> q()) -> (q() -> r()) -> p() -> r() =
  fun (f : p() -> q()) => fun (g : q() -> r()) => fun (x : p()) => g (f x)

theorem curry : (p() /\\ q() -> r()) -> p() -> q() -> r() =
  fun (f : p() /\\ q() -> r()) => fun (a : p()) => fun (b : q()) => f (a, b)

theorem uncurry : (p() -> q() -> r()) -> p() /\\ q() -> r() =
  fun (f : p() -> q() -> r()) => fun (h : p() /\\ q()) => f (fst h) (snd h)

theorem distrib : p() /\\ (q() \\/ r()) -> (p() /\\ q()) \\/ (p() /\\ r()) =
  fun (h : p() /\\ (q() \\/ r())) =>
    match snd h with
    | left hq => left (fst h, hq) : p() /\\ r()
    | right hr => right p() /\\ q() (fst h, hr)
`,
  },
  {
    id: "negation",
    level: "intermediate",
    title: "Negation & De Morgan",
    blurb: "¬A is A → ⊥ : contraposition, double negation, De Morgan",
    source: `(* Poule's logic is constructive: "not A" is written  A -> Bottom
   ("A leads to a contradiction"). Many classical laws still hold. *)

pred a : ()
pred b : ()

theorem contrapositive : (a() -> b()) -> (b() -> Bottom) -> a() -> Bottom =
  fun (f : a() -> b()) => fun (nb : b() -> Bottom) => fun (x : a()) => nb (f x)

(* A  →  ¬¬A  (the converse needs classical logic) *)
theorem double_negation : a() -> (a() -> Bottom) -> Bottom =
  fun (x : a()) => fun (na : a() -> Bottom) => na x

(* ¬¬¬A → ¬A : triple negation collapses, even constructively *)
theorem triple_negation : (((a() -> Bottom) -> Bottom) -> Bottom) -> a() -> Bottom =
  fun (h : ((a() -> Bottom) -> Bottom) -> Bottom) => fun (x : a()) =>
    h (fun (na : a() -> Bottom) => na x)

(* De Morgan, both directions for ∨ *)
theorem de_morgan : ((a() \\/ b()) -> Bottom) -> (a() -> Bottom) /\\ (b() -> Bottom) =
  fun (h : (a() \\/ b()) -> Bottom) =>
    (fun (x : a()) => h (left x : b()), fun (y : b()) => h (right a() y))

theorem de_morgan_back : (a() -> Bottom) /\\ (b() -> Bottom) -> (a() \\/ b()) -> Bottom =
  fun (h : (a() -> Bottom) /\\ (b() -> Bottom)) => fun (o : a() \\/ b()) =>
    match o with
    | left x => (fst h) x
    | right y => (snd h) y

(* Ex falso quodlibet: from a contradiction, anything. *)
theorem ex_falso : Bottom -> a() = fun (h : Bottom) => abort h : a()
`,
  },
  {
    id: "even",
    level: "intermediate",
    title: "Even numbers (∀)",
    blurb: "Peano naturals, axioms, instantiation and generalisation",
    source: `(* First-order logic over Peano naturals. *)

type Nat = Zero | Succ of Nat
pred even : (Nat)

axiom even_zero : even(Zero)
axiom even_ss : forall (n : Nat). even(n) -> even(Succ(Succ(n)))

(* ∀E : instantiate the axiom with a concrete term *)
theorem even_two : even(Succ(Succ(Zero))) = even_ss [Zero] even_zero

theorem even_four : even(Succ(Succ(Succ(Succ(Zero))))) =
  even_ss [Succ(Succ(Zero))] even_two

(* ∀I : the bound variable may be renamed (k instead of n) *)
theorem even_plus_four : forall (n : Nat). even(n) -> even(Succ(Succ(Succ(Succ(n))))) =
  gen (k : Nat) => fun (h : even(k)) => even_ss [Succ(Succ(k))] (even_ss [k] h)
`,
  },
  {
    id: "quantifiers",
    level: "intermediate",
    title: "Quantifier laws",
    blurb: "∀ over ∧, ∃ over ∨, and ∃∀ → ∀∃",
    source: `type D = A | B
pred p : (D)
pred q : (D)
pred r : (D, D)

theorem forall_and : (forall (x : D). p(x) /\\ q(x)) -> (forall (x : D). p(x)) /\\ (forall (x : D). q(x)) =
  fun (h : forall (x : D). p(x) /\\ q(x)) =>
    (gen (y : D) => fst (h [y]), gen (z : D) => snd (h [z]))

theorem exists_or : (exists (x : D). p(x) \\/ q(x)) -> (exists (x : D). p(x)) \\/ (exists (x : D). q(x)) =
  fun (h : exists (x : D). p(x) \\/ q(x)) =>
    unpack (h, w, hw,
      match hw with
      | left hp => left pack [D, w, hp] : exists (x : D). q(x)
      | right hq => right exists (x : D). p(x) pack [D, w, hq])

(* "Someone loves everybody" implies "everybody is loved by someone".
   (The converse is false — try to prove it and watch it fail.) *)
theorem swap : (exists (x : D). forall (y : D). r(x, y)) -> forall (y : D). exists (x : D). r(x, y) =
  fun (h : exists (x : D). forall (y : D). r(x, y)) =>
    gen (y : D) => unpack (h, w, hw, pack [D, w, hw [y]])
`,
  },
  {
    id: "barber",
    level: "expert",
    title: "Russell's barber",
    blurb: "No barber shaves exactly those who don't shave themselves",
    source: `(* The barber paradox (Russell, 1918). In a village, could there be a
   barber who shaves all and only those who do not shave themselves?
   No — and the proof is constructive: no excluded middle needed.     *)

type Person = Barber | Villager
pred shaves : (Person, Person)

theorem no_such_barber :
  (exists (b : Person). forall (x : Person).
      (shaves(b, x) -> shaves(x, x) -> Bottom) /\\ ((shaves(x, x) -> Bottom) -> shaves(b, x)))
  -> Bottom =
  fun (h : exists (b : Person). forall (x : Person).
      (shaves(b, x) -> shaves(x, x) -> Bottom) /\\ ((shaves(x, x) -> Bottom) -> shaves(b, x))) =>
    unpack (h, b, hb,
      (* first: the barber cannot shave himself ... *)
      (fun (not_self : shaves(b, b) -> Bottom) =>
         (* ... but then, by his own rule, he must. *)
         not_self ((snd (hb [b])) not_self))
      (fun (self : shaves(b, b)) => (fst (hb [b])) self self))
`,
  },
  {
    id: "modal",
    level: "expert",
    title: "Modal logic K · T · D · 4 · B",
    blurb: "□ and ◇ through Kripke semantics: the classic modal axioms",
    source: `(* Modal logic, encoded by its Kripke semantics (the "standard translation"):
   worlds have type W, acc(w, v) means "v is accessible from w", and a
   proposition is a predicate over worlds.
       □A at w  :=  forall (v : W). acc(w, v) -> A(v)      (necessarily A)
       ◇A at w  :=  exists (v : W). acc(w, v) /\\ A(v)      (possibly A)
   Each axiom of modal logic corresponds to a property of acc.          *)

type W = Here | There
pred acc : (W, W)
pred a : (W)
pred b : (W)

(* K — valid in every frame: □(A → B) → □A → □B *)
theorem k : forall (w : W).
    (forall (v : W). acc(w, v) -> a(v) -> b(v)) ->
    (forall (v : W). acc(w, v) -> a(v)) ->
    forall (v : W). acc(w, v) -> b(v) =
  gen (w : W) =>
    fun (hab : forall (v : W). acc(w, v) -> a(v) -> b(v)) =>
    fun (ha : forall (v : W). acc(w, v) -> a(v)) =>
      gen (v : W) => fun (r : acc(w, v)) => hab [v] r (ha [v] r)

(* T — reflexive frames: what is necessary is true (knowledge implies truth) *)
axiom refl : forall (w : W). acc(w, w)
theorem t : forall (w : W). (forall (v : W). acc(w, v) -> a(v)) -> a(w) =
  gen (w : W) => fun (h : forall (v : W). acc(w, v) -> a(v)) => h [w] (refl [w])

(* D — serial frames: what is obligatory is permitted (□A → ◇A) *)
axiom serial : forall (w : W). exists (v : W). acc(w, v)
theorem d_lemma : forall (w : W). (exists (v : W). acc(w, v)) ->
    (forall (v : W). acc(w, v) -> a(v)) -> exists (v : W). acc(w, v) /\\ a(v) =
  gen (w : W) => fun (s : exists (v : W). acc(w, v)) =>
    fun (h : forall (v : W). acc(w, v) -> a(v)) =>
      unpack (s, v, r, pack [W, v, (r, h [v] r)])
theorem d : forall (w : W). (forall (v : W). acc(w, v) -> a(v)) -> exists (v : W). acc(w, v) /\\ a(v) =
  gen (w : W) => d_lemma [w] (serial [w])

(* 4 — transitive frames: positive introspection (□A → □□A) *)
axiom trans : forall (w : W). forall (v : W). forall (u : W). acc(w, v) -> acc(v, u) -> acc(w, u)
theorem four : forall (w : W). (forall (v : W). acc(w, v) -> a(v)) ->
    forall (v : W). acc(w, v) -> forall (u : W). acc(v, u) -> a(u) =
  gen (w : W) => fun (h : forall (v : W). acc(w, v) -> a(v)) =>
    gen (v : W) => fun (r1 : acc(w, v)) => gen (u : W) => fun (r2 : acc(v, u)) =>
      h [u] (trans [w] [v] [u] r1 r2)

(* B — symmetric frames: what is true is necessarily possible (A → □◇A) *)
axiom sym : forall (w : W). forall (v : W). acc(w, v) -> acc(v, w)
theorem brouwer : forall (w : W). a(w) -> forall (v : W). acc(w, v) -> exists (u : W). acc(v, u) /\\ a(u) =
  gen (w : W) => fun (h : a(w)) => gen (v : W) => fun (r : acc(w, v)) =>
    pack [W, w, (sym [w] [v] r, h)]
`,
  },
  {
    id: "ontological",
    level: "expert",
    title: "Modal ontological argument",
    blurb: "Plantinga's argument — valid — and its equally valid parody",
    source: `(* The modal ontological argument (Plantinga, 1974), in its valid core.
     g(w) : "a maximally great being exists in world w"
   P1  maximal greatness includes NECESSARY existence: if such a being exists
       in a world, it exists in every world accessible from it.
   P2  it is POSSIBLE that it exists: some world accessible from ours has one.
   In modal logic S5 (here symmetry of accessibility is enough) it follows
   that it exists in the actual world.

   Poule certifies that the conclusion FOLLOWS from the premises — the
   argument is VALID. Whether it is SOUND (whether P2 is true) is where the
   philosophy starts: see the parody below.                                  *)

type W = Actual | Other
pred acc : (W, W)
pred g : (W)

axiom s5_symmetry : forall (w : W). forall (v : W). acc(w, v) -> acc(v, w)
axiom p1_necessity : forall (w : W). g(w) -> forall (v : W). acc(w, v) -> g(v)
axiom p2_possibility : exists (v : W). acc(Actual, v) /\\ g(v)

(* Possibly-necessarily-g, hence g:  ◇□g → g  in a symmetric frame. *)
theorem it_exists : g(Actual) =
  unpack (p2_possibility, v, hv,
    (p1_necessity [v] (snd hv)) [Actual] (s5_symmetry [Actual] [v] (fst hv)))

(* THE PARODY. Replace P2 by "it is possible that NO such being exists".
   The very same reasoning now proves that it does NOT exist...          *)
axiom p2_parody : exists (v : W). acc(Actual, v) /\\ (g(v) -> Bottom)

theorem it_does_not_exist : g(Actual) -> Bottom =
  fun (ga : g(Actual)) =>
    unpack (p2_parody, v, hv, (snd hv) ((p1_necessity [Actual] ga) [v] (fst hv)))

(* ...so P2 and its parody cannot both hold: together they are inconsistent.
   Logic alone does not choose between them — that is the real debate.    *)
theorem the_premises_clash : Bottom = it_does_not_exist it_exists
`,
  },
  {
    id: "broken",
    level: "puzzle",
    title: "Spot the bugs",
    blurb: "Five subtly wrong proofs — read the explanations, then fix them",
    source: `(* Every theorem below is rejected. Click one: the error is located in the
   source and explained in plain words (Guide mode). Can you fix them all? *)

type Nat = Zero | Succ of Nat
pred p : ()
pred q : ()
pred even : (Nat)
axiom ap : p()
axiom even_zero : even(Zero)

(* 1. the proof proves something else *)
theorem wrong_goal : p() /\\ p() = ap

(* 2. left's annotation is the OTHER side of the disjunction *)
theorem wrong_side : p() \\/ q() = left ap : p()

(* 3. gen's variable must be fresh: n already occurs in h *)
theorem not_fresh : forall (n : Nat). even(n) -> forall (m : Nat). even(m) =
  gen (n : Nat) => fun (h : even(n)) => gen (n : Nat) => h

(* 4. p is a predicate, not a term of type Nat *)
theorem ill_typed : even(p) = ap

(* 5. a lambda's annotation must match the goal's premise *)
theorem wrong_premise : p() -> p() = fun (h : q()) => ap
`,
  },
];
