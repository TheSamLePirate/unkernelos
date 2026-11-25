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

/** ASCII Poule formula → mathematical notation (∀ ∃ ∧ ∨ → ¬ ⊤ ⊥). */
export function prettyFormula(f: string): string {
  const ast = parseFormula(f);
  if (ast) return prettyFm(ast);
  return f
    .replace(/forall \(([^:()]+) : ([^)]*(?:\([^)]*\))?[^)]*)\)\.\s*/g, "∀$1 : $2. ")
    .replace(/exists \(([^:()]+) : ([^)]*(?:\([^)]*\))?[^)]*)\)\.\s*/g, "∃$1 : $2. ")
    .replace(/\/\\/g, "∧")
    .replace(/\\\//g, "∨")
    .replace(/->/g, "→")
    .replace(/\bTop\b/g, "⊤")
    .replace(/\bBottom\b/g, "⊥");
}

/** Mathematical rendering of a parsed formula; A → ⊥ is shown as ¬A. */
export function prettyFm(f: Fm, prec = 0): string {
  const wrap = (p: number, s: string) => (prec > p ? `(${s})` : s);
  switch (f.k) {
    case "top":
      return "⊤";
    case "bottom":
      return "⊥";
    case "pred":
      return `${f.name}(${f.args})`;
    case "eq":
      return wrap(2, `${f.a} = ${f.b}`);
    case "and":
      return wrap(2, `${prettyFm(f.a, 2)} ∧ ${prettyFm(f.b, 3)}`);
    case "or":
      return wrap(1, `${prettyFm(f.a, 1)} ∨ ${prettyFm(f.b, 2)}`);
    case "impl":
      if (f.b.k === "bottom") return `¬${prettyFm(f.a, 3)}`;
      return wrap(0, `${prettyFm(f.a, 1)} → ${prettyFm(f.b, 0)}`);
    case "forall":
      return wrap(0, `∀${f.x} : ${f.ty}. ${prettyFm(f.body, 0)}`);
    case "exists":
      return wrap(0, `∃${f.x} : ${f.ty}. ${prettyFm(f.body, 0)}`);
  }
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
    .replace(/¬/g, "\\lnot ")
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
  { rule: "→I", name: "Supposer (introduction du →)", syntax: "fun (h : A) => p", proves: "A → B", from: "p : B, en supposant h : A", snippet: "fun (h : A) => " },
  { rule: "→E", name: "Appliquer (modus ponens)", syntax: "p q", proves: "B", from: "p : A → B et q : A", snippet: "p q" },
  { rule: "∧I", name: "Les deux à la fois (introduction du ∧)", syntax: "(p, q)", proves: "A ∧ B", from: "p : A et q : B", snippet: "(p, q)" },
  { rule: "∧E", name: "Garder un côté (élimination du ∧)", syntax: "fst p · snd p", proves: "A · B", from: "p : A ∧ B", snippet: "fst p" },
  { rule: "∨I", name: "Choisir un côté (introduction du ∨)", syntax: "left p : B · right A p", proves: "A ∨ B", from: "p : A · p : B", snippet: "left p : B" },
  { rule: "∨E", name: "Raisonner par cas (élimination du ∨)", syntax: "match p with | left h1 => p1 | right h2 => p2", proves: "C", from: "p : A ∨ B, et p1, p2 : C", snippet: "match p with\n    | left h1 => p1\n    | right h2 => p2" },
  { rule: "∀I", name: "Généraliser (introduction du ∀)", syntax: "gen (x : T) => p", proves: "∀x : T. A", from: "p : A, pour un x quelconque (nouveau nom)", snippet: "gen (x : T) => " },
  { rule: "∀E", name: "Instancier (élimination du ∀)", syntax: "p [t]", proves: "A avec t à la place de x", from: "p : ∀x : T. A et t : T", snippet: "p [t]" },
  { rule: "∃I", name: "Donner un témoin (introduction du ∃)", syntax: "pack [T, t, p]", proves: "∃x : T. A", from: "p : A avec t à la place de x", snippet: "pack [T, t, p]" },
  { rule: "∃E", name: "Utiliser un témoin (élimination du ∃)", syntax: "unpack (h, x, hx, p)", proves: "C", from: "h : ∃y : T. A ; hx dit que x vérifie A", snippet: "unpack (h, x, hx, p)" },
  { rule: "⊤I", name: "Le vrai", syntax: "triv", proves: "⊤", from: "rien", snippet: "triv" },
  { rule: "⊥E", name: "Ex falso (de l'absurde, tout)", syntax: "abort p : F", proves: "F", from: "p : ⊥", snippet: "abort p : F" },
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

/** Lecture en français d'une formule, pour les débutants. */
export function describeFormula(f: Fm, top = true): string {
  const sub = (g: Fm) => {
    const s = describeFormula(g, false);
    return g.k === "pred" || g.k === "top" || g.k === "bottom" || g.k === "eq" ? s : `(${s})`;
  };
  let s: string;
  switch (f.k) {
    case "top":
      s = "vrai";
      break;
    case "bottom":
      s = "une contradiction";
      break;
    case "pred":
      s = `${f.name}(${f.args})`;
      break;
    case "eq":
      s = `${f.a} est égal à ${f.b}`;
      break;
    case "and":
      s = `${sub(f.a)} et ${sub(f.b)}`;
      break;
    case "or":
      s = `${sub(f.a)} ou ${sub(f.b)}`;
      break;
    case "impl":
      s = f.b.k === "bottom" ? `${sub(f.a)} est impossible` : `si ${sub(f.a)}, alors ${describeFormula(f.b, false)}`;
      break;
    case "forall":
      s = `pour tout ${f.x} de type ${f.ty}, ${describeFormula(f.body, false)}`;
      break;
    case "exists":
      s = `il existe un ${f.x} de type ${f.ty} tel que ${describeFormula(f.body, false)}`;
      break;
  }
  return top ? s.charAt(0).toUpperCase() + s.slice(1) + "." : s;
}

export interface Suggestion {
  readonly rule: string;
  readonly text: string;
  readonly snippet: string | null;
}

/** Ce qu'un débutant peut faire ensuite pour prouver `goal`, avec les hypothèses ("h : A") disponibles. */
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
      if (same(h.f!, goal)) out.push({ rule: "hyp", text: `Le but est exactement l'hypothèse ${h.name} : il suffit de l'écrire.`, snippet: h.name });
      if (h.f!.k === "and") {
        if (same(h.f!.a, goal)) out.push({ rule: "∧E₁", text: `Le but est le côté gauche de ${h.name}.`, snippet: `fst ${h.name}` });
        if (same(h.f!.b, goal)) out.push({ rule: "∧E₂", text: `Le but est le côté droit de ${h.name}.`, snippet: `snd ${h.name}` });
      }
    }
    switch (goal.k) {
      case "impl":
        out.push({
          rule: "→I",
          text:
            goal.b.k === "bottom"
              ? "Pour prouver qu'une chose est impossible, suppose-la et déduis-en une contradiction."
              : "Pour prouver « si A alors B », suppose A (donne-lui un nom) et prouve B.",
          snippet: `fun (h : ${printFormula(goal.a)}) => `,
        });
        break;
      case "and":
        out.push({ rule: "∧I", text: "Pour prouver « A et B », prouve les deux et mets-les en paire.", snippet: "(p, q)" });
        break;
      case "or":
        out.push({
          rule: "∨I",
          text: "Pour prouver « A ou B », choisis un côté. left p : B si tu sais prouver A ; right A p si tu sais prouver B.",
          snippet: `left p : ${printFormula(goal.b)}`,
        });
        break;
      case "forall":
        out.push({
          rule: "∀I",
          text: `Pour prouver « pour tout ${goal.x} », prends un ${goal.x} quelconque (un nom nouveau) et prouve la suite.`,
          snippet: `gen (${goal.x} : ${goal.ty}) => `,
        });
        break;
      case "exists":
        out.push({
          rule: "∃I",
          text: `Pour prouver « il existe », donne un exemple (un témoin de type ${goal.ty}) et prouve qu'il convient.`,
          snippet: `pack [${goal.ty}, temoin, preuve]`,
        });
        break;
      case "top":
        out.push({ rule: "⊤I", text: "⊤ (le vrai) se prouve toujours.", snippet: "triv" });
        break;
      case "bottom": {
        const neg = ctx.find((h) => h.f!.k === "impl" && (h.f as { b: Fm }).b.k === "bottom");
        out.push({
          rule: "→E",
          text: neg
            ? `Il faut une contradiction : ${neg.name} dit que ${printFormula((neg.f as { a: Fm }).a)} est impossible ; applique-la à une preuve de cela.`
            : "Il faut une contradiction : applique une hypothèse de la forme A → ⊥ à une preuve de A.",
          snippet: neg ? `${neg.name} p` : null,
        });
        break;
      }
      default: {
        const concl = (f: Fm): Fm => (f.k === "impl" ? concl(f.b) : f.k === "forall" ? concl(f.body) : f);
        const goalHead = goal.k === "pred" ? goal.name : null;
        for (const h of ctx) {
          const c = concl(h.f!);
          if (c !== h.f && goalHead && c.k === "pred" && c.name === goalHead) {
            const binders = (f: Fm): string => (f.k === "forall" ? ` [${f.x}?]` + binders(f.body) : "");
            out.push({
              rule: h.f!.k === "forall" ? "∀E →E" : "→E",
              text: `${h.name} conclut ${goalHead}(…) : ${h.f!.k === "forall" ? "instancie-le avec [terme] puis " : ""}applique-le à ses prémisses.`,
              snippet: `${h.name}${binders(h.f!)} p`,
            });
          }
        }
        if (out.length === 0) {
          out.push({ rule: "axiome", text: "Un but « atomique » se prouve par une hypothèse, un axiome ou un théorème précédent qui le conclut.", snippet: null });
        }
      }
    }
  }
  for (const h of ctx) {
    if (h.f!.k === "and") out.push({ rule: "∧E", text: `${h.name} est un « et » : fst ${h.name} et snd ${h.name} donnent chaque côté.`, snippet: `fst ${h.name}` });
    if (h.f!.k === "or")
      out.push({ rule: "∨E", text: `${h.name} est un « ou » : raisonne par cas.`, snippet: `match ${h.name} with\n    | left a => p1\n    | right b => p2` });
    if (h.f!.k === "exists")
      out.push({ rule: "∃E", text: `${h.name} fournit un témoin : déballe-le avec unpack.`, snippet: `unpack (${h.name}, x, hx, p)` });
  }
  return out.slice(0, 4);
}

/** Traduit en français un message du vérificateur Poule (qui est en anglais). */
export function translateError(message: string): string {
  const rules: [RegExp, string][] = [
    [/^this proof proves\n([\s\S]*?)\nbut the goal is\n([\s\S]*)$/, "Cette preuve démontre\n$1\nalors que l'énoncé demande\n$2"],
    [/^unknown hypothesis (\S+)/, "Hypothèse inconnue : $1"],
    [/^variable (\S+) is not fresh: it occurs free in hypothesis (.*)$/, "La variable $1 n'est pas « fraîche » : elle apparaît déjà dans l'hypothèse $2"],
    [/^variable (\S+) is not fresh: it occurs free in the goal (.*)$/, "La variable $1 n'est pas « fraîche » : elle apparaît déjà dans le but $2"],
    [/^the witness (\S+) escapes: it occurs in the conclusion (.*)$/, "Le témoin $1 s'échappe : il apparaît dans la conclusion $2"],
    [/^type mismatch: (.*) vs (.*)$/, "Types incompatibles : $1 et $2"],
    [/^(predicate|function|constructor) (\S+) expects (\d+) argument\(s\), got (\d+)/, "$1 $2 : $3 argument(s) attendu(s), $4 donné(s)"],
    [/^unbound term variable (\S+)/, "Variable non liée : $1"],
    [/^unbound type variable (\S+)/, "Variable de type non liée : $1"],
    [/^(left|right|fun|abort): the annotation\n([\s\S]*?)\ndoes not match the goal's\n([\s\S]*)$/, "$1 : l'annotation\n$2\nne correspond pas à ce que demande le but :\n$3"],
    [/^(fst|snd|match|application|instantiation \[t\]|unpack) expects a proof of (.*), but this proves\n([\s\S]*)$/, "$1 attend une preuve de $2, mais ceci démontre\n$3"],
    [/^cannot infer what pack proves.*$/, "Impossible de deviner ce que prouve pack : utilise-le là où la formule « il existe » attendue est connue."],
    [/^unpack expects the name of a hypothesis proving an exists, got (.*)$/, "unpack attend le NOM d'une hypothèse qui prouve un « il existe » (reçu : $1)"],
    [/^gen: variable (\S+) has type (.*) but the goal quantifies over (.*)$/, "gen : la variable $1 est de type $2 mais le but porte sur $3"],
    [/^pack: witness type (.*) but the goal is exists over (.*)$/, "pack : témoin de type $1 mais le but porte sur $2"],
    [/^parse error at line (\d+):(\d+) near "(.*)"/, "Erreur de syntaxe ligne $1, colonne $2, près de « $3 »"],
    [/^(\S+) (\S+) is declared twice/, "$1 $2 est déclaré deux fois"],
    [/^unknown (type|predicate|function|constructor) (\S+)/, "$1 inconnu : $2"],
  ];
  for (const [re, fr] of rules) if (re.test(message)) return message.replace(re, fr);
  return message;
}

/** Explication pédagogique d'une erreur du vérificateur. */
export function explainError(message: string): string {
  const m = message;
  if (/^this proof proves/.test(m))
    return "Ta preuve est bien écrite, mais elle démontre une autre formule que celle demandée. Compare les deux : en général, le symbole principal de l'énoncé dit par quelle règle commencer (→ : fun, ∧ : une paire, ∀ : gen, ∃ : pack, ∨ : left / right).";
  if (/^unknown hypothesis/.test(m))
    return "Ce nom n'est pas connu à cet endroit. Vérifie l'orthographe, qu'il a bien été introduit plus haut (par fun, match ou unpack), ou que l'axiome / le théorème est déclaré AVANT cette ligne (et qu'il a lui-même été accepté).";
  if (/is not fresh/.test(m))
    return "gen (x : T) veut dire « pour un x quelconque ». Ça ne marche que si rien de ce que tu sais déjà ne parle de x — sinon x n'est pas quelconque. Choisis un nom nouveau.";
  if (/escapes/.test(m)) return "Le témoin obtenu par unpack n'existe qu'à l'intérieur du unpack : la conclusion finale ne doit pas le mentionner.";
  if (/^type mismatch/.test(m))
    return "Un terme n'a pas le bon type ici (par exemple une liste là où un Nat est attendu). Le type des arguments vient des déclarations pred / fundecl.";
  if (/expects \d+ argument/.test(m)) return "Mauvais nombre d'arguments : compare avec la déclaration de ce prédicat, de cette fonction ou de ce constructeur.";
  if (/^unbound term variable/.test(m))
    return "Cette variable n'est liée nulle part. Quantifie-la dans l'énoncé (forall / exists) ou introduis-la avec gen / unpack. Une constante se déclare : fundecl c : () -> T.";
  if (/^left: the annotation|^right: the annotation/.test(m))
    return "Dans left p : B, l'annotation B est l'AUTRE côté du « ou » (celui que tu ne prouves pas). Pareil pour right A p, où A est le côté gauche.";
  if (/^fun: the annotation/.test(m)) return "Dans fun (h : A) => p, A doit être exactement la prémisse (la partie avant →) de ce que tu prouves.";
  if (/^abort: the annotation/.test(m)) return "abort p : F doit être annoté avec la formule que tu prouves.";
  if (/^(fst|snd) expects/.test(m)) return "fst et snd ne s'appliquent qu'à une preuve d'un « et » (A ∧ B).";
  if (/^match expects/.test(m)) return "match … with | left … | right … demande une preuve d'un « ou » (A ∨ B).";
  if (/^application expects/.test(m)) return "On ne peut appliquer à un argument qu'une preuve d'une implication A → B.";
  if (/^instantiation/.test(m)) return "p [t] instancie un « pour tout » : p doit prouver forall (x : T). …";
  if (/cannot infer what pack proves/.test(m))
    return "pack doit savoir quel « il existe » il prouve : place-le là où le but est connu (directement comme preuve d'un théorème, ou sous fun / gen / unpack), pas comme fonction d'une application.";
  if (/^unpack expects/.test(m)) return "Le premier argument de unpack doit être le NOM d'une hypothèse qui prouve un « il existe ». Nomme-la d'abord avec fun (h : exists …) => …, ou énonce un lemme.";
  if (/^gen: variable/.test(m)) return "Le type écrit dans gen (x : T) doit être celui sur lequel porte le « pour tout » du but.";
  if (/^pack: witness type/.test(m)) return "Le type écrit dans pack [T, t, p] doit être celui sur lequel porte le « il existe » du but.";
  if (/parse error/.test(m))
    return "Erreur de syntaxe près de ce mot. Causes fréquentes : une parenthèse manquante, un prédicat sans () — écris p() — ou une preuve placée là où on attend une formule.";
  if (/declared twice/.test(m)) return "Deux déclarations portent le même nom.";
  if (/^unknown (type|predicate|function|constructor)/.test(m)) return "Déclare-le avant de l'utiliser (type / pred / fundecl), ou vérifie l'orthographe. Attention : les noms de prédicats commencent par une minuscule.";
  return "";
}

const RULE_HELP: Record<string, [string, string]> = {
  "Top-I": ["Introduction du ⊤", "⊤ (le vrai) se prouve sans rien."],
  "Bottom-E": ["Élimination du ⊥ (ex falso)", "D'une contradiction, on peut déduire n'importe quoi."],
  "And-I": ["Introduction du ∧", "Une preuve de A et une preuve de B donnent A ∧ B."],
  "And-E1": ["Élimination du ∧ (gauche)", "De A ∧ B, on garde A."],
  "And-E2": ["Élimination du ∧ (droite)", "De A ∧ B, on garde B."],
  "Or-I1": ["Introduction du ∨ (gauche)", "De A, on conclut A ∨ B."],
  "Or-I2": ["Introduction du ∨ (droite)", "De B, on conclut A ∨ B."],
  "Or-E": ["Élimination du ∨ (par cas)", "Si C découle de A et C découle de B, alors C découle de A ∨ B."],
  "Impl-I": ["Introduction du →", "En supposant A, on a prouvé B — donc A → B (l'hypothèse est « déchargée »)."],
  "Impl-E": ["Élimination du → (modus ponens)", "De A → B et de A, on conclut B."],
  "Forall-I": ["Introduction du ∀", "Prouvé pour un x quelconque, donc pour tout x."],
  "Forall-E": ["Élimination du ∀", "Ce qui vaut pour tout x vaut pour ce terme-ci."],
  "Exists-I": ["Introduction du ∃", "Ce témoin vérifie la propriété, donc il en existe un."],
  "Exists-E": ["Élimination du ∃", "On nomme le témoin et on utilise sa propriété (sans qu'il s'échappe)."],
};

/** Nom français de la règle (ex. « Introduction du → »). */
export function ruleName(rule: string): string {
  if (rule.startsWith("hyp ")) return `Hypothèse ${rule.slice(4)}`;
  return RULE_HELP[rule.split(" ")[0]!]?.[0] ?? rule;
}

/** Explication française d'une étape. */
export function ruleHelp(rule: string): string {
  if (rule.startsWith("hyp ")) return `Hypothèse ${rule.slice(4)} : une supposition disponible, un axiome ou un théorème déjà prouvé.`;
  const h = RULE_HELP[rule.split(" ")[0]!];
  return h ? `${h[0]} — ${h[1]}` : rule;
}

/** Les symboles, pour la légende. */
export const POULE_SYMBOLS: readonly { sym: string; ascii: string; reading: string }[] = [
  { sym: "∀", ascii: "forall (x : T).", reading: "pour tout" },
  { sym: "∃", ascii: "exists (x : T).", reading: "il existe" },
  { sym: "∧", ascii: "/\\", reading: "et" },
  { sym: "∨", ascii: "\\/", reading: "ou" },
  { sym: "→", ascii: "->", reading: "si … alors / implique" },
  { sym: "¬", ascii: "A -> Bottom", reading: "non (A est impossible)" },
  { sym: "⊤", ascii: "Top", reading: "vrai" },
  { sym: "⊥", ascii: "Bottom", reading: "faux / contradiction" },
];

// ---------------------------------------------------------------------------
// Exemples
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
  beginner: "Pour commencer",
  intermediate: "Les classiques",
  expert: "Expert — paradoxes et métaphysique modale",
  puzzle: "Énigmes",
};

export const POULE_EXAMPLES: readonly PouleExample[] = [
  {
    id: "first-steps",
    level: "beginner",
    title: "Premiers pas",
    blurb: "Tes premières preuves : supposer, assembler, séparer",
    source: `(* Bienvenue dans Poule !
   Une PREUVE est un petit programme, et la formule qu'elle prouve est son TYPE.

   - pred p : ()             déclare une proposition p().
   - theorem nom : FORMULE = PREUVE
   - Place le curseur dans une preuve : le panneau de droite montre
     ce que tu sais (les hypothèses) et ce qu'il reste à prouver.     *)

pred p : ()
pred q : ()

(* « Si p, alors p. »  On suppose h : p() et on le rend tel quel. *)
theorem identite : p() -> p() = fun (h : p()) => h

(* Deux suppositions ; seule la première sert. *)
theorem garder_le_premier : p() -> q() -> p() =
  fun (a : p()) => fun (b : q()) => a

(* Une paire (x, y) prouve un « et » :  p() /\\ q(). *)
theorem les_deux : p() -> q() -> p() /\\ q() =
  fun (a : p()) => fun (b : q()) => (a, b)

(* fst et snd séparent un « et ». *)
theorem echange : p() /\\ q() -> q() /\\ p() =
  fun (h : p() /\\ q()) => (snd h, fst h)

(* EXERCICE — refusé exprès. Remplace « triv » par une vraie preuve de
   q() /\\ p() -> p().  Le Guide propose la première étape, et le théorème
   passe au vert quand c'est juste.  (Solution : fun (h : q() /\\ p()) => snd h) *)
theorem exercice : q() /\\ p() -> p() = triv
`,
  },
  {
    id: "syllogism",
    level: "beginner",
    title: "Socrate est mortel",
    blurb: "Le syllogisme d'Aristote : ∀ et → pas à pas",
    source: `(* Le syllogisme le plus célèbre (« Barbara ») :
     Tous les hommes sont mortels.  Socrate est un homme.  Donc Socrate est mortel. *)

type Etre = Socrate | Platon
pred homme : (Etre)
pred mortel : (Etre)

axiom tous_les_hommes_sont_mortels : forall (x : Etre). homme(x) -> mortel(x)
axiom socrate_est_un_homme : homme(Socrate)

(* tous_les_hommes_sont_mortels [Socrate]  :  homme(Socrate) -> mortel(Socrate)
   ... appliqué à socrate_est_un_homme, cela donne mortel(Socrate).        *)
theorem socrate_est_mortel : mortel(Socrate) =
  tous_les_hommes_sont_mortels [Socrate] socrate_est_un_homme

(* La règle générale, re-prouvée pour un y quelconque. *)
theorem barbara : forall (y : Etre). homme(y) -> mortel(y) =
  gen (y : Etre) => fun (h : homme(y)) => tous_les_hommes_sont_mortels [y] h
`,
  },
  {
    id: "propositional",
    level: "intermediate",
    title: "Logique propositionnelle",
    blurb: "∧, ∨, → : commutativité, transitivité, curryfication, distributivité",
    source: `(* La logique des propositions en déduction naturelle. *)

pred p : ()
pred q : ()
pred r : ()

theorem ou_commutatif : p() \\/ q() -> q() \\/ p() =
  fun (h : p() \\/ q()) =>
    match h with
    | left a => right q() a
    | right b => left b : p()

theorem transitivite : (p() -> q()) -> (q() -> r()) -> p() -> r() =
  fun (f : p() -> q()) => fun (g : q() -> r()) => fun (x : p()) => g (f x)

theorem curryfication : (p() /\\ q() -> r()) -> p() -> q() -> r() =
  fun (f : p() /\\ q() -> r()) => fun (a : p()) => fun (b : q()) => f (a, b)

theorem decurryfication : (p() -> q() -> r()) -> p() /\\ q() -> r() =
  fun (f : p() -> q() -> r()) => fun (h : p() /\\ q()) => f (fst h) (snd h)

theorem distributivite : p() /\\ (q() \\/ r()) -> (p() /\\ q()) \\/ (p() /\\ r()) =
  fun (h : p() /\\ (q() \\/ r())) =>
    match snd h with
    | left hq => left (fst h, hq) : p() /\\ r()
    | right hr => right p() /\\ q() (fst h, hr)
`,
  },
  {
    id: "negation",
    level: "intermediate",
    title: "Négation et De Morgan",
    blurb: "¬A s'écrit A → ⊥ : contraposée, double négation, De Morgan",
    source: `(* La logique de Poule est constructive : « non A » s'écrit  A -> Bottom
   (« A mène à une contradiction »). Beaucoup de lois classiques restent vraies. *)

pred a : ()
pred b : ()

theorem contraposee : (a() -> b()) -> (b() -> Bottom) -> a() -> Bottom =
  fun (f : a() -> b()) => fun (nb : b() -> Bottom) => fun (x : a()) => nb (f x)

(* A  →  ¬¬A  (la réciproque demande la logique classique) *)
theorem double_negation : a() -> (a() -> Bottom) -> Bottom =
  fun (x : a()) => fun (na : a() -> Bottom) => na x

(* ¬¬¬A → ¬A : la triple négation se simplifie, même constructivement *)
theorem triple_negation : (((a() -> Bottom) -> Bottom) -> Bottom) -> a() -> Bottom =
  fun (h : ((a() -> Bottom) -> Bottom) -> Bottom) => fun (x : a()) =>
    h (fun (na : a() -> Bottom) => na x)

(* De Morgan pour le « ou », dans les deux sens *)
theorem de_morgan : ((a() \\/ b()) -> Bottom) -> (a() -> Bottom) /\\ (b() -> Bottom) =
  fun (h : (a() \\/ b()) -> Bottom) =>
    (fun (x : a()) => h (left x : b()), fun (y : b()) => h (right a() y))

theorem de_morgan_retour : (a() -> Bottom) /\\ (b() -> Bottom) -> (a() \\/ b()) -> Bottom =
  fun (h : (a() -> Bottom) /\\ (b() -> Bottom)) => fun (o : a() \\/ b()) =>
    match o with
    | left x => (fst h) x
    | right y => (snd h) y

(* Ex falso quodlibet : d'une contradiction, on déduit n'importe quoi. *)
theorem ex_falso : Bottom -> a() = fun (h : Bottom) => abort h : a()
`,
  },
  {
    id: "even",
    level: "intermediate",
    title: "Nombres pairs (∀)",
    blurb: "Entiers de Peano, axiomes, instanciation et généralisation",
    source: `(* Logique du premier ordre sur les entiers de Peano :
   Zero, Succ(Zero) = 1, Succ(Succ(Zero)) = 2, ... *)

type Nat = Zero | Succ of Nat
pred pair : (Nat)

axiom zero_pair : pair(Zero)
axiom plus_deux : forall (n : Nat). pair(n) -> pair(Succ(Succ(n)))

(* ∀E : on instancie l'axiome avec un terme précis *)
theorem deux_pair : pair(Succ(Succ(Zero))) = plus_deux [Zero] zero_pair

theorem quatre_pair : pair(Succ(Succ(Succ(Succ(Zero))))) =
  plus_deux [Succ(Succ(Zero))] deux_pair

(* ∀I : la variable liée peut être renommée (k au lieu de n) *)
theorem plus_quatre : forall (n : Nat). pair(n) -> pair(Succ(Succ(Succ(Succ(n))))) =
  gen (k : Nat) => fun (h : pair(k)) => plus_deux [Succ(Succ(k))] (plus_deux [k] h)
`,
  },
  {
    id: "quantifiers",
    level: "intermediate",
    title: "Lois des quantificateurs",
    blurb: "∀ et ∧, ∃ et ∨, et ∃∀ → ∀∃",
    source: `type D = A | B
pred p : (D)
pred q : (D)
pred aime : (D, D)

theorem pour_tout_et : (forall (x : D). p(x) /\\ q(x)) -> (forall (x : D). p(x)) /\\ (forall (x : D). q(x)) =
  fun (h : forall (x : D). p(x) /\\ q(x)) =>
    (gen (y : D) => fst (h [y]), gen (z : D) => snd (h [z]))

theorem il_existe_ou : (exists (x : D). p(x) \\/ q(x)) -> (exists (x : D). p(x)) \\/ (exists (x : D). q(x)) =
  fun (h : exists (x : D). p(x) \\/ q(x)) =>
    unpack (h, w, hw,
      match hw with
      | left hp => left pack [D, w, hp] : exists (x : D). q(x)
      | right hq => right exists (x : D). p(x) pack [D, w, hq])

(* « Quelqu'un aime tout le monde » implique « tout le monde est aimé par quelqu'un ».
   (La réciproque est fausse — essaie de la prouver et regarde-la échouer.) *)
theorem echange_quantificateurs : (exists (x : D). forall (y : D). aime(x, y)) -> forall (y : D). exists (x : D). aime(x, y) =
  fun (h : exists (x : D). forall (y : D). aime(x, y)) =>
    gen (y : D) => unpack (h, w, hw, pack [D, w, hw [y]])
`,
  },
  {
    id: "barber",
    level: "expert",
    title: "Le barbier de Russell",
    blurb: "Aucun barbier ne rase exactement ceux qui ne se rasent pas eux-mêmes",
    source: `(* Le paradoxe du barbier (Russell, 1918). Dans un village, peut-il exister un
   barbier qui rase tous ceux, et seulement ceux, qui ne se rasent pas eux-mêmes ?
   Non — et la preuve est constructive : pas besoin du tiers exclu.            *)

type Personne = Barbier | Villageois
pred rase : (Personne, Personne)

theorem pas_de_tel_barbier :
  (exists (b : Personne). forall (x : Personne).
      (rase(b, x) -> rase(x, x) -> Bottom) /\\ ((rase(x, x) -> Bottom) -> rase(b, x)))
  -> Bottom =
  fun (h : exists (b : Personne). forall (x : Personne).
      (rase(b, x) -> rase(x, x) -> Bottom) /\\ ((rase(x, x) -> Bottom) -> rase(b, x))) =>
    unpack (h, b, hb,
      (* d'abord : le barbier ne peut pas se raser lui-même ... *)
      (fun (pas_lui : rase(b, b) -> Bottom) =>
         (* ... mais alors, d'après sa propre règle, il doit se raser. *)
         pas_lui ((snd (hb [b])) pas_lui))
      (fun (lui : rase(b, b)) => (fst (hb [b])) lui lui))
`,
  },
  {
    id: "modal",
    level: "expert",
    title: "Logique modale K · T · D · 4 · B",
    blurb: "□ et ◇ par la sémantique de Kripke : les axiomes modaux classiques",
    source: `(* Logique modale, codée par sa sémantique de Kripke (la « traduction standard ») :
   les mondes ont le type M, acc(w, v) veut dire « v est accessible depuis w »,
   et une proposition est un prédicat sur les mondes.
       □A en w  :=  forall (v : M). acc(w, v) -> A(v)      (nécessairement A)
       ◇A en w  :=  exists (v : M). acc(w, v) /\\ A(v)      (possiblement A)
   Chaque axiome modal correspond à une propriété de acc.                      *)

type M = Ici | Ailleurs
pred acc : (M, M)
pred a : (M)
pred b : (M)

(* K — vrai dans tous les cadres : □(A → B) → □A → □B *)
theorem k : forall (w : M).
    (forall (v : M). acc(w, v) -> a(v) -> b(v)) ->
    (forall (v : M). acc(w, v) -> a(v)) ->
    forall (v : M). acc(w, v) -> b(v) =
  gen (w : M) =>
    fun (hab : forall (v : M). acc(w, v) -> a(v) -> b(v)) =>
    fun (ha : forall (v : M). acc(w, v) -> a(v)) =>
      gen (v : M) => fun (r : acc(w, v)) => hab [v] r (ha [v] r)

(* T — cadres réflexifs : ce qui est nécessaire est vrai (savoir implique vérité) *)
axiom reflexivite : forall (w : M). acc(w, w)
theorem t : forall (w : M). (forall (v : M). acc(w, v) -> a(v)) -> a(w) =
  gen (w : M) => fun (h : forall (v : M). acc(w, v) -> a(v)) => h [w] (reflexivite [w])

(* D — cadres sériels : ce qui est obligatoire est permis (□A → ◇A) *)
axiom serialite : forall (w : M). exists (v : M). acc(w, v)
theorem lemme_d : forall (w : M). (exists (v : M). acc(w, v)) ->
    (forall (v : M). acc(w, v) -> a(v)) -> exists (v : M). acc(w, v) /\\ a(v) =
  gen (w : M) => fun (s : exists (v : M). acc(w, v)) =>
    fun (h : forall (v : M). acc(w, v) -> a(v)) =>
      unpack (s, v, r, pack [M, v, (r, h [v] r)])
theorem d : forall (w : M). (forall (v : M). acc(w, v) -> a(v)) -> exists (v : M). acc(w, v) /\\ a(v) =
  gen (w : M) => lemme_d [w] (serialite [w])

(* 4 — cadres transitifs : introspection positive (□A → □□A) *)
axiom transitivite : forall (w : M). forall (v : M). forall (u : M). acc(w, v) -> acc(v, u) -> acc(w, u)
theorem quatre : forall (w : M). (forall (v : M). acc(w, v) -> a(v)) ->
    forall (v : M). acc(w, v) -> forall (u : M). acc(v, u) -> a(u) =
  gen (w : M) => fun (h : forall (v : M). acc(w, v) -> a(v)) =>
    gen (v : M) => fun (r1 : acc(w, v)) => gen (u : M) => fun (r2 : acc(v, u)) =>
      h [u] (transitivite [w] [v] [u] r1 r2)

(* B — cadres symétriques : ce qui est vrai est nécessairement possible (A → □◇A) *)
axiom symetrie : forall (w : M). forall (v : M). acc(w, v) -> acc(v, w)
theorem brouwer : forall (w : M). a(w) -> forall (v : M). acc(w, v) -> exists (u : M). acc(v, u) /\\ a(u) =
  gen (w : M) => fun (h : a(w)) => gen (v : M) => fun (r : acc(w, v)) =>
    pack [M, w, (symetrie [w] [v] r, h)]
`,
  },
  {
    id: "ontological",
    level: "expert",
    title: "L'argument ontologique modal",
    blurb: "L'argument de Plantinga — valide — et sa parodie, tout aussi valide",
    source: `(* L'argument ontologique modal (Plantinga, 1974), dans son noyau valide.
     etre_max(w) : « un être maximalement grand existe dans le monde w »
   P1  la grandeur maximale inclut l'existence NÉCESSAIRE : si un tel être existe
       dans un monde, il existe dans tous les mondes accessibles depuis celui-ci.
   P2  il est POSSIBLE qu'il existe : un monde accessible depuis le nôtre en contient un.
   En logique modale S5 (ici la symétrie de l'accessibilité suffit), il s'ensuit
   qu'il existe dans le monde réel.

   Poule certifie que la conclusion DÉCOULE des prémisses : l'argument est VALIDE.
   Savoir s'il est CORRECT (si P2 est vraie), c'est là que commence la philosophie :
   voir la parodie plus bas.                                                       *)

type Monde = Reel | Autre
pred acc : (Monde, Monde)
pred etre_max : (Monde)

axiom symetrie_s5 : forall (w : Monde). forall (v : Monde). acc(w, v) -> acc(v, w)
axiom p1_necessite : forall (w : Monde). etre_max(w) -> forall (v : Monde). acc(w, v) -> etre_max(v)
axiom p2_possibilite : exists (v : Monde). acc(Reel, v) /\\ etre_max(v)

(* Possiblement-nécessairement, donc réellement :  ◇□g → g  dans un cadre symétrique. *)
theorem il_existe : etre_max(Reel) =
  unpack (p2_possibilite, v, hv,
    (p1_necessite [v] (snd hv)) [Reel] (symetrie_s5 [Reel] [v] (fst hv)))

(* LA PARODIE. Remplaçons P2 par « il est possible qu'AUCUN tel être n'existe ».
   Exactement le même raisonnement prouve maintenant qu'il n'existe PAS...      *)
axiom p2_parodie : exists (v : Monde). acc(Reel, v) /\\ (etre_max(v) -> Bottom)

theorem il_n_existe_pas : etre_max(Reel) -> Bottom =
  fun (ga : etre_max(Reel)) =>
    unpack (p2_parodie, v, hv, (snd hv) ((p1_necessite [Reel] ga) [v] (fst hv)))

(* ...donc P2 et sa parodie ne peuvent pas être vraies ensemble : elles sont
   contradictoires. La logique seule ne choisit pas entre elles — c'est là le vrai débat. *)
theorem les_premisses_se_contredisent : Bottom = il_n_existe_pas il_existe
`,
  },
  {
    id: "broken",
    level: "puzzle",
    title: "Trouve les erreurs",
    blurb: "Cinq preuves subtilement fausses : lis les explications, puis corrige-les",
    source: `(* Tous les théorèmes ci-dessous sont refusés. Clique dessus : l'erreur est
   soulignée dans le code et expliquée en clair (mode Guide). Sauras-tu tous les réparer ? *)

type Nat = Zero | Succ of Nat
pred p : ()
pred q : ()
pred pair : (Nat)
axiom ap : p()
axiom zero_pair : pair(Zero)

(* 1. la preuve démontre autre chose que l'énoncé *)
theorem mauvais_but : p() /\\ p() = ap

(* 2. l'annotation de left est l'AUTRE côté du « ou » *)
theorem mauvais_cote : p() \\/ q() = left ap : p()

(* 3. la variable de gen doit être nouvelle : n apparaît déjà dans h *)
theorem pas_frais : forall (n : Nat). pair(n) -> forall (m : Nat). pair(m) =
  gen (n : Nat) => fun (h : pair(n)) => gen (n : Nat) => h

(* 4. p est un prédicat, pas un terme de type Nat *)
theorem mal_type : pair(p) = ap

(* 5. l'annotation d'un fun doit être la prémisse du but *)
theorem mauvaise_premisse : p() -> p() = fun (h : q()) => ap
`,
  },
];
