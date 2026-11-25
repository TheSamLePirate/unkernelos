/**
 * microML integration — https://github.com/coucou747/microML (by coucou747).
 *
 * The compiler is installed in the guest at /opt/microml (scripts/guest/install-microml.sh).
 * This module builds the guest shell script that drives every compiler pass, parses its
 * output into structured stages, and provides highlighting / diff / type-comparison helpers
 * shared by the Compiler Explorer app and the Notebook `microml` cells.
 * Pure logic only (no VM imports); the VM runner lives in microml-runner.ts.
 */

export const MICROML_REPO_URL = "https://github.com/coucou747/microML";
export const MICROML_AUTHOR = "coucou747";

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

export type PassId = "parsing" | "bindings" | "typer" | "fields" | "lazy" | "backend" | "inline";

export interface PassDef {
  readonly id: PassId;
  /** Exact `--debug` flag / label printed by microML. */
  readonly flag: string;
  readonly title: string;
  readonly short: string;
  readonly kind: "ml" | "ir";
  readonly description: string;
}

export const MICROML_PASSES: readonly PassDef[] = [
  {
    id: "parsing",
    flag: "parsing",
    title: "Parsing",
    short: "Parse",
    kind: "ml",
    description: "Menhir parser output: the raw AST, every name still a string.",
  },
  {
    id: "bindings",
    flag: "bindings",
    title: "Bindings",
    short: "Bind",
    kind: "ml",
    description: "Scope resolution: each identifier becomes a unique variable vN. Unbound names fail here.",
  },
  {
    id: "typer",
    flag: "typer",
    title: "Type inference",
    short: "Types",
    kind: "ml",
    description: "Polymorphic type inference (let-generalization), compared live against real OCaml (ocamlc -i).",
  },
  {
    id: "fields",
    flag: "fields",
    title: "Fields",
    short: "Fields",
    kind: "ml",
    description: "Constructors and record fields are numbered (f0, f1, …) for the runtime.",
  },
  {
    id: "lazy",
    flag: "lazy",
    title: "Lazy operators",
    short: "Lazy",
    kind: "ml",
    description: "&& and || are rewritten into short-circuit conditionals.",
  },
  {
    id: "backend",
    flag: "backend",
    title: "Backend IR",
    short: "IR",
    kind: "ir",
    description: "Lowered to a flat let-IR with explicit closures (clot-make / clot-call) and constructors.",
  },
  {
    id: "inline",
    flag: "inline backend",
    title: "Inline",
    short: "Inline",
    kind: "ir",
    description: "Backend inlining: trivial variable aliases are propagated away.",
  },
];

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export interface MicromlExample {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly source: string;
}

const PRINT_INT = 'external print_int : int -> unit = "prim_print_int_clot"';

export const MICROML_EXAMPLES: readonly MicromlExample[] = [
  {
    id: "closures",
    title: "Closures & currying",
    blurb: "Partial application, composition and higher-order functions",
    source: `${PRINT_INT}

let compose f g = fun x -> f (g x)
let twice f = compose f f
let add n = fun x -> x + n

let out =
  let add5 = add 5 in
  let quad = twice (twice (fun x -> x * 2)) in
  let _ = print_int (add5 10) in
  print_int (quad 3)
`,
  },
  {
    id: "peano",
    title: "Peano arithmetic",
    blurb: "Sum types and recursion: 6 × 7 with unary naturals",
    source: `${PRINT_INT}

type nat = Zero | Succ of nat

let rec of_int n = if n = 0 then Zero else Succ (of_int (n - 1))

let rec to_int n =
  match n with
  | Zero -> 0
  | Succ m -> 1 + to_int m

let rec add a b =
  match a with
  | Zero -> b
  | Succ m -> Succ (add m b)

let rec mul a b =
  match a with
  | Zero -> Zero
  | Succ m -> add b (mul m b)

let out = print_int (to_int (mul (of_int 6) (of_int 7)))
`,
  },
  {
    id: "lists",
    title: "Polymorphic lists",
    blurb: "map / fold / filter over a user-defined 'a mylist",
    source: `${PRINT_INT}

type 'a mylist = Nil | Cons of 'a * 'a mylist

let rec map f xs =
  match xs with
  | Nil -> Nil
  | Cons (x, tl) -> Cons (f x, map f tl)

let rec fold_left f acc xs =
  match xs with
  | Nil -> acc
  | Cons (x, tl) -> fold_left f (f acc x) tl

let rec filter p xs =
  match xs with
  | Nil -> Nil
  | Cons (x, tl) -> if p x then Cons (x, filter p tl) else filter p tl

let xs = Cons (1, Cons (2, Cons (3, Cons (4, Cons (5, Nil)))))

let out =
  let squares = map (fun x -> x * x) xs in
  let big = filter (fun x -> x > 5) squares in
  print_int (fold_left (fun acc x -> acc + x) 0 big)
`,
  },
  {
    id: "fib",
    title: "Fibonacci",
    blurb: "Naive double recursion vs tuples — interpreter vs native timing",
    source: `${PRINT_INT}

let rec fib n = if n < 2 then n else fib (n - 1) + fib (n - 2)

let rec fib_pair n =
  if n = 0 then (0, 1)
  else
    match fib_pair (n - 1) with
    | (a, b) -> (b, a + b)

let out =
  let _ = print_int (fib 22) in
  match fib_pair 30 with
  | (a, _) -> print_int a
`,
  },
  {
    id: "lazy",
    title: "Lazy && / ||",
    blurb: "Watch the Lazy pass turn boolean operators into conditionals",
    source: `${PRINT_INT}

let print_and_return = fun i -> fun r ->
  let _ = print_int i in r

let a = (print_and_return 1 true) || (print_and_return 2 false)
let b = (print_and_return 3 false) && (print_and_return 4 false)
`,
  },
  {
    id: "tour",
    title: "Feature tour (upstream)",
    blurb: "coucou747's own end-to-end test: lists, options, closures, polymorphism",
    source: `${PRINT_INT}

type 'a mylist =
  Nil
  | Cons of 'a * 'a mylist

type 'a option =
  None
  | Some of 'a

let print_bool b = print_int (if b then 1 else 0)

let rec length xs =
  match xs with
  | Nil -> 0
  | Cons (_, tl) -> 1 + length tl

let rec map f xs =
  match xs with
  | Nil -> Nil
  | Cons (x, tl) -> Cons (f x, map f tl)

let head_opt xs =
  match xs with
  | Nil -> None
  | Cons (x, _) -> Some x

let make_adder x =
  let add y = x + y in
  add

let id = fun x -> x

let xs = Cons (1, Cons (2, Cons (3, Cons (4, Nil))))

let test_poly =
  let a = id 42 in
  let b = id true in
  let _ = print_int a in
  print_bool b

let test_closure =
  let add10 = make_adder 10 in
  print_int (add10 5)

let test_nested_match =
  let v = Some (Cons (7, Cons (8, Nil))) in
  match v with
  | None -> print_int (-10)
  | Some (Nil) -> print_int (-11)
  | Some (Cons (x, Nil)) -> print_int (x + 1000)
  | Some (Cons (x, Cons (y, _))) -> print_int (x + y)
`,
  },
  {
    id: "type-error",
    title: "Type error: λ is monomorphic",
    blurb: "A lambda-bound f can't be used at int and bool (let-polymorphism only)",
    source: `let ok =
  let bad = fun f -> (f 0, f true) in
  bad
`,
  },
];

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

export interface MicromlLocation {
  /** 1-based line, 0-based column (as printed by microML). */
  readonly line: number;
  readonly col: number;
  readonly endLine: number;
  readonly endCol: number;
}

export interface MicromlError {
  readonly stage: PassId | null;
  readonly message: string;
  readonly loc: MicromlLocation | null;
}

export interface MicromlRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly ms: number;
  readonly timedOut: boolean;
}

export interface MicromlTypeRow {
  readonly vname: string;
  readonly name: string | null;
  readonly microml: string;
  readonly ocaml: string | null;
  /** null when OCaml has no counterpart (or rejected the program). */
  readonly agrees: boolean | null;
}

export interface MicromlExploreResult {
  readonly installed: boolean;
  readonly version: string | null;
  readonly stages: Partial<Record<PassId, string>>;
  readonly error: MicromlError | null;
  readonly nameMap: Readonly<Record<string, string>>;
  readonly types: readonly MicromlTypeRow[];
  readonly ocamlOutput: string | null;
  readonly ocamlOk: boolean | null;
  readonly cSource: string | null;
  readonly compile: { readonly ok: boolean; readonly ms: number; readonly log: string } | null;
  readonly evalRun: MicromlRun | null;
  readonly nativeRun: (MicromlRun & { readonly sizeBytes: number }) | null;
  readonly totalMs: number;
}

export type MicromlMode = "full" | "cell";

// ---------------------------------------------------------------------------
// Guest script
// ---------------------------------------------------------------------------

const b64 = (txt: string): string => {
  const bytes = new TextEncoder().encode(txt);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
};

const OUT_CAP = 100_000;

export function buildMicromlScript(source: string, mode: MicromlMode): { script: string; token: string } {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Cell mode only needs names + types; full mode dumps every pass.
  const passes =
    mode === "full" ? MICROML_PASSES : MICROML_PASSES.filter((p) => p.id === "parsing" || p.id === "bindings" || p.id === "typer");
  const passList = passes.map((p) => `'${p.flag}'`).join(" ");
  const script = `TOK='${token}'
sec(){ printf '\\n@@MLX:%s:%s@@\\n' "$TOK" "$1"; }
nowms(){ date +%s%3N; }
M=/opt/microml/bin/microml.exe
if [ ! -x "$M" ]; then sec missing; exit 0; fi
export PATH="/opt/microml/shim:/usr/local/bin:/usr/bin:/bin:$PATH"
RTL=/opt/microml/lib/libruntime.a
RTI=/opt/microml/include
W="$(mktemp -d /tmp/mlx.XXXXXX)"
trap 'rm -rf "$W"' EXIT
cd "$W" || exit 1
printf '%s' '${b64(source)}' | base64 -d > prog.ml
T_ALL=$(nowms)
sec version; cat /opt/microml/VERSION 2>/dev/null
MICROML_DRY=1 timeout 20 "$M" --runtime "$RTL" -I "$RTI" prog.ml -o dry.bin > check.out 2> check.err
CHECK=$?
sec check-exit; echo "$CHECK"
if [ "$CHECK" -ne 0 ]; then sec check-out; head -c ${OUT_CAP} check.out; fi
# A timed-out compile would time out again for every pass: skip the dumps.
[ "$CHECK" -eq 124 ] && PASSES="" || PASSES="${passList}"
eval "set -- $PASSES"
for P in "$@"; do
  MICROML_DRY=1 timeout 20 "$M" --runtime "$RTL" -I "$RTI" --debug "$P" prog.ml -o dry.bin > pass.out 2> /dev/null
  sec "pass:$P"; head -c ${OUT_CAP} pass.out
done
${
  mode === "full"
    ? `if command -v ocamlc >/dev/null 2>&1; then
  cp prog.ml ref.ml
  timeout 30 ocamlc -i ref.ml > ocaml.out 2>&1
  OEC=$?
  sec ocaml; head -c ${OUT_CAP} ocaml.out
  sec ocaml-exit; echo "$OEC"
fi`
    : ""
}
if [ "$CHECK" -eq 0 ]; then
  T0=$(nowms); timeout 10 "$M" --eval prog.ml > eval.out 2> eval.err; EC=$?; T1=$(nowms)
  sec eval-out; head -c ${OUT_CAP} eval.out
  sec eval-err; head -c ${OUT_CAP} eval.err
  sec eval-meta; echo "$EC $((T1 - T0))"
${
  mode === "full"
    ? `  T0=$(nowms); MICROML_C_OUT="$W/prog.c" timeout 120 "$M" --runtime "$RTL" -I "$RTI" prog.ml -o prog.bin > cc.out 2> cc.err; EC=$?; T1=$(nowms)
  sec c-source; head -c ${OUT_CAP} prog.c 2>/dev/null
  sec cc-log; grep -E '(error|warning):|undefined reference|ld returned' cc.err | grep -v 'MPFR header' | head -n 40
  sec cc-meta; echo "$EC $((T1 - T0))"
  if [ "$EC" -eq 0 ] && [ -x prog.bin ]; then
    T0=$(nowms); timeout 10 ./prog.bin > run.out 2> run.err; EC=$?; T1=$(nowms)
    sec run-out; head -c ${OUT_CAP} run.out
    sec run-err; head -c ${OUT_CAP} run.err
    sec run-meta; echo "$EC $((T1 - T0)) $(stat -c %s prog.bin)"
  fi`
    : ""
}
fi
sec total; echo "$(( $(nowms) - T_ALL ))"
sec end
`;
  return { script, token };
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

function splitSections(raw: string, token: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(`\\n?@@MLX:${token}:([^@\\n]+)@@\\n`, "g");
  let m: RegExpExecArray | null;
  let lastName: string | null = null;
  let lastIdx = 0;
  while ((m = re.exec(raw)) !== null) {
    if (lastName !== null) out.set(lastName, raw.slice(lastIdx, m.index));
    lastName = m[1]!;
    lastIdx = m.index + m[0].length;
  }
  if (lastName !== null) out.set(lastName, raw.slice(lastIdx));
  return out;
}

const parseLoc = (msg: string): MicromlLocation | null => {
  const range = /<[^>]*>(\d+):(\d+)-(\d+):(\d+)/.exec(msg);
  if (range) {
    return { line: Number(range[1]), col: Number(range[2]), endLine: Number(range[3]), endCol: Number(range[4]) };
  }
  // Parser errors: "parse error at prog.ml:2:3 near \"let\"" — the column is the END of the token.
  const parse = /at [^\s:]+:(\d+):(\d+)(?: near "((?:[^"\\]|\\.)*)")?/.exec(msg);
  if (parse) {
    const line = Number(parse[1]);
    const tokLen = Math.max(1, parse[3]?.length ?? 1);
    const end = Number(parse[2]);
    const col = Math.max(0, end - tokLen);
    return { line, col, endLine: line, endCol: col + tokLen };
  }
  return null;
};

const classifyError = (msg: string): PassId | null => {
  if (/parse error|syntax|lexing|unexpected/i.test(msg)) return "parsing";
  if (/unbound/i.test(msg)) return "bindings";
  if (/unify|type|occurs/i.test(msg)) return "typer";
  return null;
};

const cleanError = (txt: string): string =>
  txt
    .split("\n")
    .filter((l) => !/^Fatal error: exception/.test(l) && !/^(Raised|Called) (at|from)/.test(l))
    .join("\n")
    .replace(/\(location <[^>]*>/g, "(at ")
    .replace(/ at <[^>]*>/g, " at ")
    .replace(/ at prog\.ml:/g, " at line ")
    .replace(/\s*\n\s*vs :\s*\n\s*/g, " vs ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * microML prints `<label>` before each top-level item (the first item is unlabelled) and
 * indents continuation lines by the label width. Strip both, and cut the generated C and
 * the trailing error message that compile-mode runs append.
 */
export function cleanPassOutput(raw: string, flag: string, errorMsg: string | null): string {
  let text = raw;
  const cIdx = text.search(/^#include <assert\.h>/m);
  if (cIdx >= 0) text = text.slice(0, cIdx);
  if (errorMsg) {
    const head = errorMsg.trim().split("\n")[0]?.trim();
    if (head) {
      const i = text.lastIndexOf(head);
      if (i >= 0) text = text.slice(0, i);
    }
  }
  const pad = " ".repeat(flag.length);
  let dedent = false;
  const out: string[] = [];
  for (let line of text.split("\n")) {
    if (line.startsWith(flag)) {
      line = line.slice(flag.length);
      dedent = true;
    } else if (dedent && line.startsWith(pad)) {
      line = line.slice(pad.length);
    }
    out.push(line.replace(/\s+$/, ""));
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  while (out.length && out[0] === "") out.shift();
  return out.join("\n");
}

const TOKEN_RE = /"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_']*|\d+|\S/g;

/** Split a pass dump into top-level items (an item starts at a non-indented line). */
function splitItems(dump: string): string[] {
  const items: string[] = [];
  for (const line of dump.split("\n")) {
    if (line.trim() === "") continue;
    if (/^\S/.test(line) && !/^(in|\||then|else|with)\b/.test(line.trim()) || items.length === 0) items.push(line);
    else items[items.length - 1] += `\n${line}`;
  }
  return items;
}

/** Align two items token-by-token; returns the vN -> name pairs, or null if shapes differ. */
function alignItem(parsed: string, bound: string): Record<string, string> | null {
  const a = parsed.match(TOKEN_RE) ?? [];
  const b = bound.match(TOKEN_RE) ?? [];
  if (a.length !== b.length) return null;
  const pairs: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) continue;
    if (/^v\d+$/.test(y) && /^"[^"]*"$/.test(x)) {
      const name = x.slice(1, -1);
      if (pairs[y] !== undefined && pairs[y] !== name) return null;
      pairs[y] = name;
      continue;
    }
    return null;
  }
  return pairs;
}

/**
 * Recover `vN -> source name` by aligning the Parsing and Bindings dumps item by item
 * (dumps may omit items such as externals/types, so unmatched items are skipped).
 */
export function buildNameMap(parsing: string, bindings: string): Record<string, string> {
  const pItems = splitItems(parsing);
  const bItems = splitItems(bindings);
  const map: Record<string, string> = {};
  let j = 0;
  for (const bi of bItems) {
    for (let k = j; k < pItems.length; k++) {
      const pairs = alignItem(pItems[k]!, bi);
      if (pairs) {
        Object.assign(map, pairs);
        j = k + 1;
        break;
      }
    }
  }
  return map;
}

// --- type canonicalisation ---------------------------------------------------

type TyNode =
  | { k: "var"; n: string }
  | { k: "con"; n: string; args: TyNode[] }
  | { k: "arrow"; a: TyNode; b: TyNode }
  | { k: "tuple"; items: TyNode[] };

function parseType(src: string): TyNode | null {
  const toks = src.match(/->|'[^\s()*,'-]+|[A-Za-z_][\w.']*|[()*,]/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const parseAtomGroup = (): TyNode[] | null => {
    const t = next();
    if (t === undefined) return null;
    if (t.startsWith("'")) return [{ k: "var", n: t }];
    if (t === "(") {
      if (peek() === ")") {
        next();
        return [{ k: "con", n: "unit", args: [] }];
      }
      const items: TyNode[] = [];
      for (;;) {
        const it = parseArrow();
        if (!it) return null;
        items.push(it);
        const sep = next();
        if (sep === ")") break;
        if (sep !== ",") return null;
      }
      return items;
    }
    if (/^[A-Za-z_]/.test(t)) return [{ k: "con", n: t, args: [] }];
    return null;
  };
  const parseApp = (): TyNode | null => {
    let group = parseAtomGroup();
    if (!group) return null;
    while (peek() !== undefined && /^[A-Za-z_]/.test(peek()!)) {
      const name = next()!;
      group = [{ k: "con", n: name, args: group }];
    }
    return group.length === 1 ? group[0]! : null;
  };
  const parseTuple = (): TyNode | null => {
    const first = parseApp();
    if (!first) return null;
    const items = [first];
    while (peek() === "*") {
      next();
      const it = parseApp();
      if (!it) return null;
      items.push(it);
    }
    return items.length === 1 ? first : { k: "tuple", items };
  };
  const parseArrow = (): TyNode | null => {
    const a = parseTuple();
    if (!a) return null;
    if (peek() === "->") {
      next();
      const b = parseArrow();
      if (!b) return null;
      return { k: "arrow", a, b };
    }
    return a;
  };
  const t = parseArrow();
  return t && i === toks.length ? t : null;
}

function printType(t: TyNode, names: Map<string, string>): string {
  const varName = (n: string) => {
    let v = names.get(n);
    if (!v) {
      const idx = names.size;
      v = `'${String.fromCharCode(97 + (idx % 26))}${idx >= 26 ? Math.floor(idx / 26) : ""}`;
      names.set(n, v);
    }
    return v;
  };
  const go = (n: TyNode, ctx: "top" | "arrowL" | "tuple" | "arg"): string => {
    switch (n.k) {
      case "var":
        return varName(n.n);
      case "con": {
        if (n.args.length === 0) return n.n;
        const args =
          n.args.length === 1 ? go(n.args[0]!, "arg") : `(${n.args.map((x) => go(x, "top")).join(", ")})`;
        return `${args} ${n.n}`;
      }
      case "tuple": {
        const s = n.items.map((x) => go(x, "tuple")).join(" * ");
        return ctx === "tuple" || ctx === "arg" ? `(${s})` : s;
      }
      case "arrow": {
        const s = `${go(n.a, "arrowL")} -> ${go(n.b, "top")}`;
        return ctx === "top" ? s : `(${s})`;
      }
    }
  };
  return go(t, "top");
}

/** Turn microML's printer output (`('ψ) "mylist" -> () "unit"`) into canonical OCaml syntax. */
export function canonicalType(raw: string): string {
  const pre = raw
    .replace(/\s+/g, " ")
    .replace(/\(\)\s*"([\w']+)"/g, "$1")
    .replace(/"([\w']+)"/g, "$1")
    .trim();
  const t = parseType(pre);
  return t ? printType(t, new Map()) : pre;
}

function parseValLines(text: string): { name: string; type: string }[] {
  const joined: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s+\S/.test(line) && joined.length) joined[joined.length - 1] += ` ${line.trim()}`;
    else joined.push(line);
  }
  const rows: { name: string; type: string }[] = [];
  for (const l of joined) {
    const m = /^val\s+(\S+)\s*:\s*(.+)$/.exec(l.trim());
    if (m) rows.push({ name: m[1]!, type: m[2]! });
  }
  return rows;
}

const parseMeta = (txt: string | undefined): number[] =>
  (txt ?? "")
    .trim()
    .split(/\s+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));

export function parseMicromlOutput(raw: string, token: string): MicromlExploreResult {
  const s = splitSections(raw, token);
  const empty: MicromlExploreResult = {
    installed: false,
    version: null,
    stages: {},
    error: null,
    nameMap: {},
    types: [],
    ocamlOutput: null,
    ocamlOk: null,
    cSource: null,
    compile: null,
    evalRun: null,
    nativeRun: null,
    totalMs: 0,
  };
  if (s.has("missing") || !s.has("check-exit")) return empty;

  const checkExit = Number((s.get("check-exit") ?? "1").trim());
  let error: MicromlError | null = null;
  if (checkExit !== 0) {
    const raw = s.get("check-out") ?? "";
    const message =
      checkExit === 124
        ? "microML did not finish within 20 s."
        : cleanError(raw) || `microML exited with code ${checkExit}`;
    error = { stage: classifyError(message), message, loc: parseLoc(raw) };
  }

  const stages: Partial<Record<PassId, string>> = {};
  for (const p of MICROML_PASSES) {
    const txt = s.get(`pass:${p.flag}`);
    if (txt === undefined) continue;
    stages[p.id] = cleanPassOutput(txt, p.flag, error ? (s.get("check-out") ?? null) : null);
  }

  const nameMap = buildNameMap(stages.parsing ?? "", stages.bindings ?? "");

  const ocamlRaw = s.get("ocaml");
  const ocamlOk = s.has("ocaml-exit") ? Number(s.get("ocaml-exit")!.trim()) === 0 : null;
  const ocamlVals = ocamlOk ? parseValLines(ocamlRaw ?? "") : [];
  const ocamlQueue = new Map<string, string[]>();
  for (const v of ocamlVals) {
    const q = ocamlQueue.get(v.name) ?? [];
    q.push(canonicalType(v.type));
    ocamlQueue.set(v.name, q);
  }
  const types: MicromlTypeRow[] = parseValLines(stages.typer ?? "").map((r) => {
    const name = nameMap[r.name] ?? null;
    const microml = canonicalType(r.type);
    const ocaml = name ? (ocamlQueue.get(name)?.shift() ?? null) : null;
    return { vname: r.name, name, microml, ocaml, agrees: ocaml === null ? null : ocaml === microml };
  });

  const evalMeta = parseMeta(s.get("eval-meta"));
  const evalRun: MicromlRun | null = s.has("eval-meta")
    ? {
        stdout: s.get("eval-out") ?? "",
        stderr: cleanError(s.get("eval-err") ?? ""),
        exitCode: evalMeta[0] ?? -1,
        ms: evalMeta[1] ?? 0,
        timedOut: evalMeta[0] === 124,
      }
    : null;

  const ccMeta = parseMeta(s.get("cc-meta"));
  const compile = s.has("cc-meta")
    ? { ok: ccMeta[0] === 0, ms: ccMeta[1] ?? 0, log: (s.get("cc-log") ?? "").trim() }
    : null;

  const runMeta = parseMeta(s.get("run-meta"));
  const nativeRun = s.has("run-meta")
    ? {
        stdout: s.get("run-out") ?? "",
        stderr: (s.get("run-err") ?? "").trim(),
        exitCode: runMeta[0] ?? -1,
        ms: runMeta[1] ?? 0,
        timedOut: runMeta[0] === 124,
        sizeBytes: runMeta[2] ?? 0,
      }
    : null;

  return {
    installed: true,
    version: (s.get("version") ?? "").trim() || null,
    stages,
    error,
    nameMap,
    types,
    ocamlOutput: ocamlRaw?.trim() ?? null,
    ocamlOk,
    cSource: s.has("c-source") ? (s.get("c-source") ?? "").replace(/\n{3,}/g, "\n\n").trim() : null,
    compile,
    evalRun,
    nativeRun,
    totalMs: parseMeta(s.get("total"))[0] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Highlighting (returns HTML; input is escaped)
// ---------------------------------------------------------------------------

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ML_KEYWORDS = new Set([
  "let", "rec", "in", "fun", "function", "match", "with", "type", "of", "if", "then", "else",
  "external", "val", "and", "begin", "end", "when", "as", "true", "false", "not",
]);
const POULE_KEYWORDS = new Set([
  "type", "of", "fundecl", "pred", "axiom", "theorem", "check", "forall", "exists", "fun", "gen",
  "match", "with", "left", "right", "fst", "snd", "triv", "abort", "pack", "unpack",
]);
const IR_KEYWORDS = new Set(["function", "return", "let", "in", "if", "then", "else", "native"]);
const C_KEYWORDS = new Set([
  "int", "return", "if", "else", "for", "while", "struct", "void", "typedef", "static", "extern", "const",
]);

export type HighlightLang = "ml" | "ir" | "c" | "poule";

export interface HighlightOptions {
  /** vN -> source name; when `showNames` is set, vN renders as the source name. */
  readonly nameMap?: Readonly<Record<string, string>>;
  readonly showNames?: boolean;
}

export function highlight(code: string, lang: HighlightLang, opts: HighlightOptions = {}): string {
  const kw = lang === "c" ? C_KEYWORDS : lang === "ir" ? IR_KEYWORDS : lang === "poule" ? POULE_KEYWORDS : ML_KEYWORDS;
  const nameMap = opts.nameMap ?? {};
  let out = "";
  let i = 0;
  let inComment = false;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    // comments
    if (inComment || ((lang === "ml" || lang === "poule") && ch === "(" && code[i + 1] === "*") || (lang === "c" && ch === "/" && code[i + 1] === "*")) {
      const close = lang === "c" ? "*/" : "*)";
      const startSkip = inComment ? 0 : 2;
      const endIdx = code.indexOf(close, i + startSkip);
      const end = endIdx < 0 ? n : endIdx + 2;
      out += `<span class="text-zinc-500 italic">${esc(code.slice(i, end))}</span>`;
      inComment = false;
      i = end;
      continue;
    }
    if (lang === "c" && ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const e = end < 0 ? n : end;
      out += `<span class="text-zinc-500 italic">${esc(code.slice(i, e))}</span>`;
      i = e;
      continue;
    }
    if (lang === "c" && ch === "#" && (i === 0 || code[i - 1] === "\n")) {
      const end = code.indexOf("\n", i);
      const e = end < 0 ? n : end;
      out += `<span class="text-rose-300">${esc(code.slice(i, e))}</span>`;
      i = e;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < n && code[j] !== '"' && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      j = Math.min(n, j + 1);
      const s = code.slice(i, j);
      // In AST dumps, quoted capitalised names are constructors / type names.
      const cls = lang !== "c" && /^"[A-Z]/.test(s) ? "text-cyan-300" : "text-emerald-300";
      out += `<span class="${cls}">${esc(s)}</span>`;
      i = j;
      continue;
    }
    if (ch === "'" && lang !== "c" && /[a-zA-ZͰ-Ͽ]/.test(code[i + 1] ?? "")) {
      let j = i + 1;
      while (j < n && /[\wͰ-Ͽ]/.test(code[j]!)) j++;
      if (code[j] !== "'") {
        out += `<span class="text-pink-300">${esc(code.slice(i, j))}</span>`;
        i = j;
        continue;
      }
    }
    if (/[0-9]/.test(ch) && (i === 0 || !/[\w]/.test(code[i - 1]!))) {
      let j = i;
      while (j < n && /[0-9]/.test(code[j]!)) j++;
      out += `<span class="text-amber-300">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[\w'-]/.test(code[j]!)) {
        // allow `clot-make` style IR words but not `x-1`
        if (code[j] === "-" && !(lang === "ir" && /^(clot|construct)$/.test(code.slice(i, j)))) break;
        j++;
      }
      const word = code.slice(i, j);
      if (/^v\d+$/.test(word) && lang !== "c") {
        const src = nameMap[word];
        if (src && opts.showNames) {
          out += `<span class="text-violet-300" title="${esc(word)}">${esc(src)}<sub class="text-[0.7em] text-violet-400/70">${esc(word.slice(1))}</sub></span>`;
        } else {
          out += `<span class="text-violet-300"${src ? ` title="${esc(src)}"` : ""}>${esc(word)}</span>`;
        }
      } else if (/^v\d+(_clot)?$/.test(word) && lang === "c") {
        out += `<span class="text-violet-300">${esc(word)}</span>`;
      } else if (/^f\d+$/.test(word) && lang !== "c") {
        out += `<span class="text-cyan-300">${esc(word)}</span>`;
      } else if (/^(clot-make|clot-call|construct-\d+)$/.test(word) || /^construct$/.test(word)) {
        out += `<span class="text-orange-300 font-medium">${esc(word)}</span>`;
      } else if (kw.has(word)) {
        out += `<span class="text-fuchsia-400 font-medium">${esc(word)}</span>`;
      } else if (lang === "c" && (word === "MLV" || word === "ml_fun")) {
        out += `<span class="text-cyan-300">${esc(word)}</span>`;
      } else if (lang === "c" && code[j] === "(") {
        out += `<span class="text-sky-300">${esc(word)}</span>`;
      } else if (/^[A-Z]/.test(word)) {
        out += `<span class="text-cyan-300">${esc(word)}</span>`;
      } else {
        out += esc(word);
      }
      i = j;
      continue;
    }
    if (lang === "poule") {
      const op = ["/\\", "\\/", "->", "=>"].find((o) => code.startsWith(o, i));
      if (op) {
        out += `<span class="text-fuchsia-300">${esc(op)}</span>`;
        i += op.length;
        continue;
      }
    }
    if ("→∀∧∨⇒λ".includes(ch)) {
      out += `<span class="text-fuchsia-300">${esc(ch)}</span>`;
      i++;
      continue;
    }
    out += esc(ch);
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Line diff (LCS)
// ---------------------------------------------------------------------------

export interface DiffLine {
  readonly kind: "same" | "add" | "del";
  readonly text: string;
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 1_500_000) return b.map((text) => ({ kind: "same", text }));
  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: b[j]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < m) out.push({ kind: "del", text: a[i++]! });
  while (j < n) out.push({ kind: "add", text: b[j++]! });
  return out;
}
