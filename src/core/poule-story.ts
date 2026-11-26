/**
 * Le « récit » d'une preuve : transforme l'arbre de dérivation de Poule en texte
 * français suivi, à la manière d'une démonstration rédigée.
 *
 * Vocabulaire : le fichier .poule peut déclarer, dans des commentaires spéciaux,
 * le mot usuel et la définition rigoureuse d'un prédicat, d'une constante, d'un
 * type ou d'un axiome :
 *
 *   (*@ etre_max(w) : Dieu existe dans {w} — un être maximalement grand existe dans le monde {w} *)
 *   (*@ Reel : notre monde — le monde actuel *)
 *   (*@ Monde : monde possible — une façon complète dont les choses auraient pu être *)
 *   (*@ p2_possibilite : la prémisse de possibilité (P2) *)
 *
 * À la première mention, le récit donne le mot usuel suivi de la définition entre
 * parenthèses ; ensuite seulement le mot usuel. Pur (aucun import VM).
 */
import { globalFacts, parseFormula, ruleView, type DerivNode, type Fm, type PouleTheorem } from "./poule.ts";

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  readonly key: string;
  /** Paramètres d'un prédicat (« w » dans etre_max(w)), vide sinon. */
  readonly params: readonly string[];
  readonly usual: string;
  readonly rigorous: string | null;
}

export type Glossary = ReadonlyMap<string, GlossaryEntry>;

export function parseGlossary(src: string): Glossary {
  const out = new Map<string, GlossaryEntry>();
  const re = /\(\*@\s*([A-Za-z_][\w']*)\s*(?:\(([^)]*)\))?\s*:\s*([\s\S]*?)\*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const key = m[1]!;
    const params = m[2] ? m[2].split(",").map((p) => p.trim()).filter(Boolean) : [];
    const body = m[3]!.replace(/\s+/g, " ").trim();
    const sep = body.search(/\s(?:—|\|)\s/);
    const usual = (sep >= 0 ? body.slice(0, sep) : body).trim().replace(/\\([—|])/g, "$1");
    const rigorous = sep >= 0 ? body.slice(sep + 3).trim() : null;
    out.set(key, { key, params, usual, rigorous: rigorous || null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Termes
// ---------------------------------------------------------------------------

interface Term {
  readonly head: string;
  readonly args: readonly Term[];
}

function parseTerm(s: string): Term | null {
  let i = 0;
  const src = s.trim();
  const ws = () => {
    while (src[i] === " ") i++;
  };
  const go = (): Term | null => {
    ws();
    const m = /^[A-Za-z_][\w']*/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    ws();
    const args: Term[] = [];
    if (src[i] === "(") {
      i++;
      ws();
      if (src[i] !== ")") {
        for (;;) {
          const a = go();
          if (!a) return null;
          args.push(a);
          ws();
          if (src[i] === ",") {
            i++;
            continue;
          }
          break;
        }
      }
      if (src[i] !== ")") return null;
      i++;
    }
    return { head: m[0], args };
  };
  const t = go();
  return t && i === src.length ? t : null;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const humanize = (name: string) => name.replace(/_/g, " ").replace(/'/g, "′");

// ---------------------------------------------------------------------------
// Rendu en prose (avec définitions à la première mention)
// ---------------------------------------------------------------------------

class Prose {
  private readonly defined = new Set<string>();
  readonly used = new Map<string, GlossaryEntry>();
  constructor(
    private readonly gl: Glossary,
    private readonly facts: Map<string, "axiom" | "theorem">
  ) {}

  private note(e: GlossaryEntry) {
    this.used.set(e.key, e);
  }

  /** Terme en prose. mode : usuel (définition à la 1re mention), usuel sans définition, ou rigoureux. */
  term(src: string, mode: "usual" | "plain" | "rigorous" = "usual"): string {
    const rigorous = mode === "rigorous";
    const t = parseTerm(src);
    if (!t) return src;
    // entiers de Peano : Succ(Succ(Zero)) → 2
    const peano = (x: Term): number | null => {
      if (x.head === "Zero" && x.args.length === 0) return 0;
      if (x.head === "Succ" && x.args.length === 1) {
        const n = peano(x.args[0]!);
        return n === null ? null : n + 1;
      }
      return null;
    };
    const go = (x: Term): string => {
      const n = peano(x);
      if (n !== null) return String(n);
      // Succ(k) → k + 1, Succ(Succ(k)) → k + 2
      if (x.head === "Succ") {
        let k = 0;
        let y: Term = x;
        while (y.head === "Succ" && y.args.length === 1) {
          k++;
          y = y.args[0]!;
        }
        return `${go(y)} + ${k}`;
      }
      const e = this.gl.get(x.head);
      if (e && x.args.length === 0) {
        this.note(e);
        if (rigorous && e.rigorous) {
          // la définition rigoureuse vient d'être donnée : inutile de la répéter ensuite
          this.defined.add(e.key);
          return e.rigorous;
        }
        if (mode === "usual" && !this.defined.has(e.key) && e.rigorous) {
          this.defined.add(e.key);
          return `${e.usual} (${e.rigorous})`;
        }
        return e.usual;
      }
      if (x.args.length === 0) return x.head;
      return `${x.head}(${x.args.map(go).join(", ")})`;
    };
    return go(t);
  }

  /** Mot pour un type : « monde possible », « entier naturel »… avec son genre. */
  typeWord(ty: string): { word: string; fem: boolean; known: boolean } {
    const e = this.gl.get(ty.trim());
    if (!e) return { word: ty.trim(), fem: false, known: false };
    this.note(e);
    let word = e.usual;
    let fem = false;
    if (/^une\s/.test(word)) {
      fem = true;
      word = word.slice(4);
    } else if (/^un\s/.test(word)) word = word.slice(3);
    if (!this.defined.has(e.key) && e.rigorous) {
      this.defined.add(e.key);
      word = `${word} (${e.rigorous})`;
    }
    return { word, fem, known: true };
  }

  /** « tout monde possible v » / « tout v de type T » */
  binder(x: string, ty: string, quant: "forall" | "exists"): string {
    const { word, fem, known } = this.typeWord(ty);
    if (quant === "forall") return known ? `${fem ? "toute" : "tout"} ${word} ${x}` : `tout ${x} de type ${word}`;
    return known ? `${fem ? "une" : "un"} ${word} ${x} tel${fem ? "le" : ""} que` : `un ${x} de type ${word} tel que`;
  }

  private atom(name: string, args: string): string {
    const e = this.gl.get(name);
    const argList = splitArgs(args);
    if (!e) {
      if (argList.length === 0) return name;
      return `${name}(${argList.map((a) => this.term(a)).join(", ")})`;
    }
    this.note(e);
    const fill = (tpl: string, mode: "usual" | "plain" | "rigorous") =>
      e.params.reduce((acc, p, i) => acc.split(`{${p}}`).join(this.term(argList[i] ?? p, mode)), tpl);
    if (e.rigorous && !this.defined.has(e.key)) {
      // première mention : mot usuel, puis la définition rigoureuse entre parenthèses
      this.defined.add(e.key);
      return `${fill(e.usual, "plain")} (c.-à-d. ${fill(e.rigorous, "rigorous")})`;
    }
    return fill(e.usual, "usual");
  }

  formula(src: string): string {
    const f = parseFormula(src);
    return f ? this.fm(f) : src;
  }

  /** Une proposition placée après « que », « donc »… : ⊥ devient « l'on aboutit à une contradiction ». */
  prop(src: string | Fm): string {
    const f = typeof src === "string" ? parseFormula(src) : src;
    if (!f) return String(src);
    return f.k === "bottom" ? "l'on aboutit à une contradiction" : this.fm(f);
  }

  fm(f: Fm, nested = false): string {
    const wrap = (s: string) => (nested ? `(${s})` : s);
    switch (f.k) {
      case "top":
        return "le vrai";
      case "bottom":
        return "une contradiction";
      case "pred":
        return this.atom(f.name, f.args);
      case "eq":
        return `${this.term(f.a)} est égal à ${this.term(f.b)}`;
      case "and":
        return wrap(`${this.fm(f.a, f.a.k !== "pred" && f.a.k !== "and" && f.a.k !== "eq")} et ${this.fm(f.b, f.b.k !== "pred" && f.b.k !== "and" && f.b.k !== "eq")}`);
      case "or":
        return wrap(`${this.fm(f.a, f.a.k !== "pred" && f.a.k !== "or" && f.a.k !== "eq")} ou ${this.fm(f.b, f.b.k !== "pred" && f.b.k !== "or" && f.b.k !== "eq")}`);
      case "impl":
        if (f.b.k === "bottom") return `il est faux que ${this.fm(f.a, true)}`;
        if (f.a.k === "bottom") return wrap(`si l'on a une contradiction, alors ${this.fm(f.b)}`);
        {
          // A → B → C se lit « si A, et si B, alors C » ; un antécédent complexe est mis entre guillemets
          const ants: Fm[] = [f.a];
          let c: Fm = f.b;
          while (c.k === "impl" && c.a.k !== "bottom" && c.b.k !== "bottom") {
            ants.push(c.a);
            c = c.b;
          }
          const ant = (a: Fm) => (a.k === "forall" || a.k === "exists" || a.k === "impl" ? `« ${this.fm(a)} »` : this.fm(a));
          return wrap(`si ${ants.map(ant).join(", et si ")}, alors ${this.fm(c)}`);
        }
      case "forall":
        return wrap(`pour ${this.binder(f.x, f.ty, "forall")}, ${this.fm(f.body)}`);
      case "exists":
        return wrap(`il existe ${this.binder(f.x, f.ty, "exists")} ${this.fm(f.body)}`);
    }
  }

  /** Nom d'un fait cité : axiome, théorème ou hypothèse locale. */
  fact(name: string): string {
    const e = this.gl.get(name);
    if (e) {
      this.note(e);
      return e.usual;
    }
    const kind = this.facts.get(name);
    if (kind === "axiom") return `l'axiome « ${humanize(name)} »`;
    if (kind === "theorem") return `le théorème « ${humanize(name)} »`;
    return `\`${name}\``;
  }

  isLocal(name: string): boolean {
    return !this.facts.has(name) && !this.gl.has(name);
  }
}

// ---------------------------------------------------------------------------
// Récit
// ---------------------------------------------------------------------------

export interface StoryLine {
  readonly text: string;
  readonly nodeId: number | null;
  readonly depth: number;
  readonly kind: "open" | "step" | "case" | "close";
}

export interface Story {
  readonly title: string;
  readonly lines: readonly StoryLine[];
  readonly vocabulary: readonly GlossaryEntry[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Élisions du français : que il → qu'il, si il → s'il, que un → qu'un… */
const elide = (t: string) =>
  t
    .replace(/\b([Qq])ue (il|ils|elle|elles|on|un|une|en|aucun|aucune|à)\b/g, "$1u'$2")
    .replace(/\b([Ss])i (il|ils)\b/g, "$1'$2")
    .replace(/\bque l'on\b/g, "que l'on")
    .replace(/\b([Ll])orsque (il|elle|on)\b/g, "$1orsqu'$2");
const intro = (n: DerivNode) => n.intro.map((i) => ({ name: i.slice(0, i.indexOf(" : ")), what: i.slice(i.indexOf(" : ") + 3) }));

/** Une citation : un fait (hypothèse / axiome / théorème), éventuellement instancié. */
interface Cite {
  readonly base: string;
  readonly insts: readonly string[];
  readonly local: boolean;
}

export function narrate(theorem: PouleTheorem, source: string, gl: Glossary = parseGlossary(source)): Story | null {
  if (!theorem.tree) return null;
  const facts = new Map(globalFacts(source).map((f) => [f.name, f.kind] as const));
  const P = new Prose(gl, facts);
  const lines: StoryLine[] = [];
  const say = (text: string, node: DerivNode | null, depth: number, kind: StoryLine["kind"] = "step") =>
    lines.push({ text, nodeId: node?.id ?? null, depth, kind });

  /** Le nœud est-il une simple citation (pas besoin de phrase à lui) ? */
  const citation = (n: DerivNode): Cite | null => {
    const rv = ruleView(n.rule);
    if (rv.family === "hyp") return { base: rv.label, insts: [], local: P.isLocal(rv.label) };
    if (n.rule.startsWith("Forall-E") && n.children.length === 1) {
      const c = citation(n.children[0]!);
      if (c && rv.arg) return { ...c, insts: [...c.insts, rv.arg] };
    }
    if ((n.rule === "And-E1" || n.rule === "And-E2") && n.children.length === 1) {
      const c = citation(n.children[0]!);
      if (c && c.local && c.insts.length === 0) return c;
    }
    return null;
  };
  const citeText = (c: Cite) => {
    const base = P.fact(c.base);
    return c.insts.length ? `${base}, pour ${c.insts.map((t) => P.term(t)).join(" et ")}` : base;
  };

  const go = (n: DerivNode, depth: number): void => {
    const rv = ruleView(n.rule);
    const C = () => P.prop(n.concl);
    const cite = citation(n);
    const kids = n.children;

    // nœud réduit à une citation (rare à la racine)
    if (cite && depth === 0) {
      say(`C'est exactement ce que dit ${citeText(cite)} : ${C()}.`, n, depth);
      return;
    }
    if (cite) {
      // une citation isolée (ex. premier côté d'une paire)
      say(cite.local && cite.insts.length === 0 ? `Par hypothèse (\`${cite.base}\`), ${C()}.` : `D'après ${citeText(cite)}, ${C()}.`, n, depth);
      return;
    }

    switch (n.rule.split(" ")[0]) {
      case "Top-I":
        say("Le vrai est trivialement vrai.", n, depth);
        return;
      case "Impl-I": {
        const h = intro(kids[0]!)[0];
        const f = parseFormula(n.concl);
        const premise = f && f.k === "impl" ? P.fm(f.a) : h ? P.formula(h.what) : "";
        const isAbsurd = f && f.k === "impl" && f.a.k === "bottom";
        say(
          isAbsurd
            ? `Supposons une contradiction${h ? ` (appelons-la \`${h.name}\`)` : ""}.`
            : `Supposons que ${premise}${h ? ` (appelons \`${h.name}\` cette hypothèse)` : ""}.`,
          n,
          depth,
          "open"
        );
        go(kids[0]!, depth + 1);
        if (f && f.k === "impl" && f.b.k === "bottom") say(`C'est une contradiction : il est donc faux que ${P.fm(f.a, true)}.`, n, depth, "close");
        else say(`Ainsi, ${C()}.`, n, depth, "close");
        return;
      }
      case "Forall-I": {
        const x = intro(kids[0]!)[0];
        const tw = x ? P.typeWord(x.what) : null;
        say(
          x && tw
            ? tw.known
              ? `Soit ${x.name} ${tw.fem ? "une" : "un"} ${tw.word} quelconque.`
              : `Soit ${x.name} un élément quelconque de type ${tw.word}.`
            : "Prenons un élément quelconque.",
          n,
          depth,
          "open"
        );
        go(kids[0]!, depth + 1);
        say(`Comme ${x?.name ?? "il"} était quelconque, ${C()}.`, n, depth, "close");
        return;
      }
      case "Impl-E": {
        const [fnN, argN] = kids as [DerivNode, DerivNode];
        const fc = citation(fnN);
        const ac = citation(argN);
        if (!ac) go(argN, depth);
        if (!fc) go(fnN, depth);
        const f = parseFormula(fnN.concl);
        const A = f && f.k === "impl" ? P.prop(f.a) : P.prop(argN.concl);
        const impl = P.formula(fnN.concl);
        const source = fc ? `D'après ${citeText(fc)}, ${impl}` : `Nous avons vu que ${impl}`;
        const because = ac ? (ac.local && ac.insts.length === 0 ? ` (\`${ac.base}\`)` : `, d'après ${citeText(ac)}`) : "";
        if (f && f.k === "impl" && f.b.k === "bottom") {
          say(`${source} ; or ${A}${because}. C'est une contradiction.`, n, depth);
        } else {
          say(`${source} ; or ${A}${because}. Donc ${C()}.`, n, depth);
        }
        return;
      }
      case "Forall-E":
        go(kids[0]!, depth);
        say(`En particulier, pour ${P.term(rv.arg ?? "")}, ${C()}.`, n, depth);
        return;
      case "And-I":
        kids.forEach((k) => go(k, depth));
        say(`Nous avons donc à la fois : ${C()}.`, n, depth);
        return;
      case "And-E1":
      case "And-E2":
        go(kids[0]!, depth);
        say(`En particulier, ${C()}.`, n, depth);
        return;
      case "Or-I1":
      case "Or-I2":
        go(kids[0]!, depth);
        say(`A fortiori, ${C()}.`, n, depth);
        return;
      case "Or-E": {
        const [scrut, c1, c2] = kids as [DerivNode, DerivNode, DerivNode];
        const sc = citation(scrut);
        if (!sc) go(scrut, depth);
        const f = parseFormula(scrut.concl);
        say(
          `Nous savons que ${P.formula(scrut.concl)}${sc ? (sc.local ? ` (\`${sc.base}\`)` : `, d'après ${citeText(sc)}`) : ""}. Distinguons les deux cas.`,
          n,
          depth,
          "open"
        );
        const h1 = intro(c1)[0];
        const h2 = intro(c2)[0];
        say(`Premier cas : ${f && f.k === "or" ? P.fm(f.a) : ""}${h1 ? ` (\`${h1.name}\`)` : ""}.`, c1, depth + 1, "case");
        go(c1, depth + 2);
        say(`Second cas : ${f && f.k === "or" ? P.fm(f.b) : ""}${h2 ? ` (\`${h2.name}\`)` : ""}.`, c2, depth + 1, "case");
        go(c2, depth + 2);
        say(`Dans les deux cas, ${C()}.`, n, depth, "close");
        return;
      }
      case "Exists-I":
        go(kids[0]!, depth);
        say(`Ainsi, ${P.term(rv.arg ?? "")} est un exemple qui convient : ${C()}.`, n, depth);
        return;
      case "Exists-E": {
        const [x, h] = intro(kids[0]!);
        const src = rv.arg ?? "";
        const fem = x ? P.typeWord(x.what).fem : false;
        const from = P.isLocal(src) ? `par hypothèse (\`${src}\`)` : `d'après ${P.fact(src)}`;
        say(
          `${cap(from)}, il existe ${x ? P.binder(x.name, x.what, "exists") : "un x tel que"} ${h ? P.formula(h.what) : "…"}. Prenons-en ${fem ? "une" : "un"}${h ? ` (appelons \`${h.name}\` ce fait)` : ""}.`,
          n,
          depth,
          "open"
        );
        go(kids[0]!, depth + 1);
        say(`Ainsi, ${C()}.`, n, depth, "close");
        return;
      }
      case "Bottom-E":
        go(kids[0]!, depth);
        say(`C'est absurde ; or de l'absurde on peut tout déduire, en particulier ${C()}.`, n, depth);
        return;
      default:
        kids.forEach((k) => go(k, depth));
        say(`Donc ${C()}.`, n, depth);
    }
  };

  const statement = P.prop(theorem.formula ?? theorem.tree.concl);
  say(`Montrons que ${statement}.`, theorem.tree, 0, "open");
  go(theorem.tree, 0);
  say("C.Q.F.D. ∎", theorem.tree, 0, "close");

  const title = theorem.name ? `Théorème « ${humanize(theorem.name)} »` : "Vérification";
  return { title, lines: lines.map((l) => ({ ...l, text: elide(l.text) })), vocabulary: [...P.used.values()] };
}
