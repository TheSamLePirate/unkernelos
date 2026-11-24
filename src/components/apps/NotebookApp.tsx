import { Effect } from "effect";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Code2,
  Copy,
  Download,
  Eraser,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Play,
  PlayCircle,
  Plus,
  Save,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { executeOsAction } from "../../core/agent-os-api.ts";
import { appRuntime, GuestFsService, VmService } from "../../core/runtime.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

export type CellLang =
  | "python"
  | "rust"
  | "ocaml"
  | "bun"
  | "sql"
  | "bash"
  | "osctl"
  | "markdown";

interface CellOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly images: readonly string[]; // data:image/png;base64,... or data:image/svg+xml;...
  readonly tables: readonly Record<string, unknown>[][];
  readonly json?: unknown;
}

interface NotebookCell {
  readonly id: string;
  readonly lang: CellLang;
  readonly source: string;
  readonly running?: boolean;
  readonly execCount?: number;
  readonly output?: CellOutput;
}

interface StarterNotebook {
  readonly id: string;
  readonly title: string;
  readonly badge: string;
  readonly description: string;
  readonly cells: readonly { lang: CellLang; source: string }[];
}

const LANG_META: Record<
  CellLang,
  { label: string; short: string; badge: string; dot: string }
> = {
  python: {
    label: "Python 3 (Science)",
    short: "PY",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-400/35",
    dot: "bg-emerald-400",
  },
  rust: {
    label: "Rust (rustc)",
    short: "RS",
    badge: "bg-orange-500/20 text-orange-300 border-orange-400/35",
    dot: "bg-orange-400",
  },
  ocaml: {
    label: "OCaml",
    short: "ML",
    badge: "bg-amber-500/20 text-amber-300 border-amber-400/35",
    dot: "bg-amber-400",
  },
  bun: {
    label: "Bun / TypeScript",
    short: "TS",
    badge: "bg-sky-500/20 text-sky-300 border-sky-400/35",
    dot: "bg-sky-400",
  },
  sql: {
    label: "SQLite SQL",
    short: "SQL",
    badge: "bg-cyan-500/20 text-cyan-300 border-cyan-400/35",
    dot: "bg-cyan-400",
  },
  bash: {
    label: "Bash Shell",
    short: "SH",
    badge: "bg-zinc-500/20 text-zinc-200 border-zinc-400/35",
    dot: "bg-zinc-300",
  },
  osctl: {
    label: "Agent OS API",
    short: "OS",
    badge: "bg-violet-500/20 text-violet-300 border-violet-400/35",
    dot: "bg-violet-400",
  },
  markdown: {
    label: "Markdown",
    short: "MD",
    badge: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/35",
    dot: "bg-fuchsia-400",
  },
};

const STARTER_NOTEBOOKS: readonly StarterNotebook[] = [
  {
    id: "science-lab",
    title: "Python Data Science & Inline Plots",
    badge: "Science",
    description: "NumPy FFT spectrum, dark-theme Matplotlib chart & structured table output",
    cells: [
      {
        lang: "markdown",
        source:
          "# Polyglot Science Lab\nRun native **Python 3 + NumPy + Matplotlib**, **Rust**, **OCaml**, **SQL** & **osctl** directly inside your live aarch64 Linux kernel. Press **Shift+Enter** to execute any cell.",
      },
      {
        lang: "python",
        source: `import math, json
try:
    import numpy as np
    import matplotlib.pyplot as plt

    t = np.linspace(0, 2 * np.pi, 400)
    signal = np.sin(3 * t) + 0.45 * np.cos(11 * t) * np.exp(-0.25 * t)
    envelope = np.exp(-0.25 * t)

    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(7.5, 3.2), dpi=130)
    fig.patch.set_facecolor("#0b0f1a")
    ax.set_facecolor("#0b0f1a")
    ax.plot(t, signal, color="#22d3ee", lw=2.0, label="Composite Signal")
    ax.plot(t, envelope, color="#c084fc", lw=1.2, ls="--", label="Decay Envelope")
    ax.fill_between(t, signal, alpha=0.14, color="#22d3ee")
    ax.set_title("Damped Harmonic Spectrum (NumPy + Matplotlib)", color="#f8fafc", fontsize=11)
    ax.grid(alpha=0.18, color="#94a3b8")
    ax.legend(framealpha=0.2)
    plt.tight_layout()
    plt.show()

    show_table([
        {"metric": "Samples", "value": int(len(t)), "unit": "pts"},
        {"metric": "Mean", "value": round(float(np.mean(signal)), 5), "unit": "amp"},
        {"metric": "Std Dev", "value": round(float(np.std(signal)), 5), "unit": "amp"},
        {"metric": "Peak", "value": round(float(np.max(signal)), 5), "unit": "amp"},
    ])
except ImportError as e:
    print("NumPy/Matplotlib not installed yet — install Python Science in Toolchain or Store!", e)
    pts = [(i, round(math.sin(i * 0.4), 4)) for i in range(12)]
    show_table([{"x": x, "sin(0.4x)": y} for x, y in pts])`,
      },
      {
        lang: "sql",
        source: `CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lang TEXT NOT NULL,
  benchmark TEXT NOT NULL,
  latency_ms REAL NOT NULL
);
DELETE FROM experiments;
INSERT INTO experiments (lang, benchmark, latency_ms) VALUES
  ('Rust', 'Prime Sieve 1M', 4.2),
  ('OCaml', 'AST Evaluator 100k', 9.8),
  ('Bun/TS', 'JSON Pipeline', 12.1),
  ('Python', 'NumPy FFT 4096', 6.4);
SELECT lang, benchmark, latency_ms, ROUND(1000.0 / latency_ms, 1) AS ops_per_sec
FROM experiments ORDER BY latency_ms ASC;`,
      },
    ],
  },
  {
    id: "rust-systems",
    title: "Rust Systems & Algorithms",
    badge: "Rust",
    description: "Compile & run native aarch64 Rust snippets with ownership, iterators & sieve benchmarks",
    cells: [
      {
        lang: "markdown",
        source:
          "# Rust Native aarch64 Playground\nCells compile directly with `rustc -O` inside the Linux VM. Snippets without `fn main()` are automatically wrapped!",
      },
      {
        lang: "rust",
        source: `use std::time::Instant;

fn sieve(limit: usize) -> Vec<usize> {
    let mut is_prime = vec![true; limit + 1];
    is_prime[0] = false;
    is_prime[1] = false;
    let mut p = 2;
    while p * p <= limit {
        if is_prime[p] {
            let mut m = p * p;
            while m <= limit {
                is_prime[m] = false;
                m += p;
            }
        }
        p += 1;
    }
    is_prime.iter().enumerate().filter_map(|(i, &ok)| ok.then_some(i)).collect()
}

fn main() {
    let t0 = Instant::now();
    let primes = sieve(200_000);
    let dt = t0.elapsed();
    println!("Found {} primes <= 200,000 in {:.2?}", primes.len(), dt);
    println!("Largest 8 primes: {:?}", &primes[primes.len() - 8..]);
}`,
      },
      {
        lang: "rust",
        source: `// Quick expression cell (auto-wrapped in fn main)
let data = vec![("Rust", 100), ("OCaml", 98), ("Python", 95), ("Bun", 94)];
let avg: f64 = data.iter().map(|(_, v)| *v as f64).sum::<f64>() / data.len() as f64;
for (lang, score) in &data {
    println!("{:<8} | {} ({})", lang, "█".repeat(*score / 5), score);
}
println!("Average score: {:.1}", avg);`,
      },
    ],
  },
  {
    id: "ocaml-functional",
    title: "OCaml Functional & Type Theory",
    badge: "OCaml",
    description: "Algebraic Data Types, symbolic AST differentiation & tail-recursive pipelines",
    cells: [
      {
        lang: "markdown",
        source:
          "# OCaml Functional & Symbolic Math Lab\nNative `ocaml` interpreter running in Linux aarch64 — algebraic types, pattern matching, and symbolic calculus.",
      },
      {
        lang: "ocaml",
        source: `(* Symbolic Expression AST & Exact Differentiation in OCaml *)
type expr =
  | Const of float
  | Var of string
  | Add of expr * expr
  | Mul of expr * expr

let rec simplify = function
  | Add (Const 0., e) | Add (e, Const 0.) -> simplify e
  | Mul (Const 0., _) | Mul (_, Const 0.) -> Const 0.
  | Mul (Const 1., e) | Mul (e, Const 1.) -> simplify e
  | Add (Const a, Const b) -> Const (a +. b)
  | Mul (Const a, Const b) -> Const (a *. b)
  | Add (a, b) -> Add (simplify a, simplify b)
  | Mul (a, b) -> Mul (simplify a, simplify b)
  | e -> e

let rec deriv x = function
  | Const _ -> Const 0.
  | Var v -> Const (if v = x then 1. else 0.)
  | Add (a, b) -> simplify (Add (deriv x a, deriv x b))
  | Mul (a, b) -> simplify (Add (Mul (deriv x a, b), Mul (a, deriv x b)))

let rec show = function
  | Const c -> Printf.sprintf "%g" c
  | Var v -> v
  | Add (a, b) -> Printf.sprintf "(%s + %s)" (show a) (show b)
  | Mul (a, b) -> Printf.sprintf "(%s * %s)" (show a) (show b)

let () =
  (* f(x) = 3*x*x + 2*x + 5 *)
  let x = Var "x" in
  let f = Add (Add (Mul (Const 3., Mul (x, x)), Mul (Const 2., x)), Const 5.) in
  let df = simplify (deriv "x" f) in
  Printf.printf "f(x)  = %s\\n" (show f);
  Printf.printf "f'(x) = %s\\n" (show df);
  Printf.printf "f''(x)= %s\\n" (show (simplify (deriv "x" df)))
`,
      },
      {
        lang: "ocaml",
        source: `(* Functional Quicksort & Tail-Recursive Fibonacci *)
let rec qsort = function
  | [] -> []
  | p :: xs ->
    let lo, hi = List.partition (fun x -> x < p) xs in
    qsort lo @ (p :: qsort hi)

let fib n =
  let rec aux a b k = if k = 0 then a else aux b (a + b) (k - 1) in
  aux 0 1 n

let () =
  let sorted = qsort [42; 7; 19; 3; 88; 14; 1; 64] in
  Printf.printf "Sorted: [%s]\\n" (String.concat "; " (List.map string_of_int sorted));
  Printf.printf "Fib(0..14): %s\\n"
    (String.concat ", " (List.init 15 (fun i -> string_of_int (fib i))))
`,
      },
    ],
  },
  {
    id: "polyglot-agent",
    title: "Polyglot Pipeline (Rust + OCaml + Python + osctl)",
    badge: "Polyglot",
    description: "Combine system benchmarks, functional logic, visualization & live Agent OS telemetry",
    cells: [
      {
        lang: "osctl",
        source: JSON.stringify({ method: "system.info", params: {} }, null, 2),
      },
      {
        lang: "bun",
        source: `const langs = ["Rust", "OCaml", "Python", "TypeScript/Bun", "SQLite"];
console.log("Running on Bun", Bun.version, "— active polyglot stack:", langs.join(" · "));`,
      },
      {
        lang: "bash",
        source: `echo "=== Installed Compilers & Runtimes ==="
for cmd in rustc cargo ocaml dune python3 sqlite3 bun node; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "✓ %-9s %s\\n" "$cmd" "$("$cmd" --version 2>&1 | head -n1)"
  else
    printf "✗ %-9s (install via Store / Toolchain)\\n" "$cmd"
  fi
done`,
      },
    ],
  },
];

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const PYTHON_PREAMBLE = `
import base64 as _uk_b64, io as _uk_io, json as _uk_json, os as _uk_os
_uk_os.environ.setdefault("MPLBACKEND", "Agg")
def show_svg(svg_str):
    b64 = _uk_b64.b64encode(svg_str.encode("utf-8")).decode("ascii")
    print(f"@@UNKERNEL_IMG_SVG:{b64}@@")
def show_table(rows):
    print(f"@@UNKERNEL_TABLE:{_uk_json.dumps(rows, default=str)}@@")
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as _uk_plt
    def _uk_show(*args, **kwargs):
        for num in _uk_plt.get_fignums():
            fig = _uk_plt.figure(num)
            buf = _uk_io.BytesIO()
            fig.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor=fig.get_facecolor())
            b64 = _uk_b64.b64encode(buf.getvalue()).decode("ascii")
            print(f"@@UNKERNEL_IMG_PNG:{b64}@@")
        _uk_plt.close("all")
    _uk_plt.show = _uk_show
except Exception:
    pass
`;

function parseRichOutput(rawStdout: string): {
  cleanStdout: string;
  images: string[];
  tables: Record<string, unknown>[][];
} {
  const images: string[] = [];
  const tables: Record<string, unknown>[][] = [];
  const kept: string[] = [];

  for (const line of rawStdout.split("\n")) {
    const pngMatch = /^@@UNKERNEL_IMG_PNG:([A-Za-z0-9+/=]+)@@$/.exec(line.trim());
    if (pngMatch) {
      images.push(`data:image/png;base64,${pngMatch[1]}`);
      continue;
    }
    const svgMatch = /^@@UNKERNEL_IMG_SVG:([A-Za-z0-9+/=]+)@@$/.exec(line.trim());
    if (svgMatch) {
      images.push(`data:image/svg+xml;base64,${svgMatch[1]}`);
      continue;
    }
    const tblMatch = /^@@UNKERNEL_TABLE:(.*)@@$/.exec(line.trim());
    if (tblMatch) {
      try {
        const parsed = JSON.parse(tblMatch[1]!);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
          tables.push(parsed as Record<string, unknown>[]);
          continue;
        }
      } catch {
        // fallback to stdout
      }
    }
    kept.push(line);
  }
  return { cleanStdout: kept.join("\n").replace(/\n+$/, ""), images, tables };
}

function makeCells(starter: StarterNotebook): NotebookCell[] {
  return starter.cells.map((c, idx) => ({
    id: `cell-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    lang: c.lang,
    source: c.source,
  }));
}

function renderMarkdownSimple(src: string): React.ReactNode {
  return src.split("\n").map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h3 key={i} className="text-sm font-semibold text-cyan-200 mt-2 mb-1">
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="text-base font-bold text-white mt-2 mb-1">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-violet-300 mb-1.5">
          {line.slice(2)}
        </h1>
      );
    }
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <p key={i} className="text-xs text-zinc-300 leading-relaxed">
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold text-white">
                {p.slice(2, -2)}
              </strong>
            );
          }
          if (p.startsWith("`") && p.endsWith("`")) {
            return (
              <code key={j} className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px] text-cyan-300">
                {p.slice(1, -1)}
              </code>
            );
          }
          return <React.Fragment key={j}>{p}</React.Fragment>;
        })}
      </p>
    );
  });
}

function toIpynbJson(title: string, cells: readonly NotebookCell[]): string {
  return JSON.stringify(
    {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        unkernelOS: { title, version: 1 },
        kernelspec: { name: "unkernelos-polyglot", display_name: "unkernelOS Polyglot" },
      },
      cells: cells.map((c) => ({
        cell_type: c.lang === "markdown" ? "markdown" : "code",
        metadata: { unkernel_lang: c.lang },
        execution_count: c.execCount ?? null,
        source: c.source.split("\n").map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l)),
        ...(c.lang === "markdown"
          ? {}
          : {
              outputs: c.output?.stdout
                ? [{ output_type: "stream", name: "stdout", text: c.output.stdout.split("\n") }]
                : [],
            }),
      })),
    },
    null,
    2
  );
}

function fromIpynbJson(raw: string): { title?: string; cells: NotebookCell[] } {
  const parsed = JSON.parse(raw) as {
    metadata?: { unkernelOS?: { title?: string } };
    cells?: Array<{
      cell_type?: string;
      metadata?: { unkernel_lang?: CellLang };
      source?: string | string[];
    }>;
  };
  const cells: NotebookCell[] = (parsed.cells ?? []).map((c, idx) => {
    const src = Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "");
    const lang: CellLang =
      c.cell_type === "markdown"
        ? "markdown"
        : c.metadata?.unkernel_lang && c.metadata.unkernel_lang in LANG_META
        ? c.metadata.unkernel_lang
        : "python";
    return {
      id: `imp-${Date.now().toString(36)}-${idx}`,
      lang,
      source: src,
    };
  });
  return {
    title: parsed.metadata?.unkernelOS?.title,
    cells: cells.length > 0 ? cells : makeCells(STARTER_NOTEBOOKS[0]!),
  };
}

export const NotebookApp: React.FC = () => {
  const wm = useWm();
  const [title, setTitle] = useState(STARTER_NOTEBOOKS[0]!.title);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [cells, setCells] = useState<NotebookCell[]>(() => makeCells(STARTER_NOTEBOOKS[0]!));
  const [editingMd, setEditingMd] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const execCounterRef = useRef(1);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Open .ipynb file when routed from File Explorer
  useEffect(() => {
    const targetPath = wm.notebookOpenFilePath;
    if (!targetPath) return;
    wmStore.clearNotebookOpenFile();
    void appRuntime
      .runPromise(
        Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileText(targetPath)))
      )
      .then((res) => {
        if (res._tag === "Right") {
          try {
            const loaded = fromIpynbJson(res.right);
            setCells(loaded.cells);
            setTitle(loaded.title || targetPath.split("/").pop() || "Notebook");
            setFilePath(targetPath);
            wmStore.pushToast("Notebook Opened", targetPath, "success");
          } catch (e) {
            wmStore.pushToast("Invalid .ipynb", e instanceof Error ? e.message : String(e), "error");
          }
        }
      });
  }, [wm.notebookOpenFilePath]);

  const runCell = useCallback(
    async (cell: NotebookCell) => {
      if (cell.lang === "markdown") {
        setEditingMd((prev) => ({ ...prev, [cell.id]: false }));
        return;
      }
      setCells((prev) => prev.map((c) => (c.id === cell.id ? { ...c, running: true } : c)));
      const t0 = performance.now();
      const cwd = wm.activeWorkspaceDir || "/home/user/workspace";
      const execNo = execCounterRef.current++;

      try {
        if (cell.lang === "osctl") {
          let method = "system.info";
          let params: Record<string, unknown> = {};
          const trimmed = cell.source.trim();
          if (trimmed.startsWith("{")) {
            const parsed = JSON.parse(trimmed) as { method?: string; params?: Record<string, unknown> };
            method = parsed.method || "system.info";
            params = parsed.params || {};
          } else {
            const [m, ...rest] = trimmed.split(/\s+/);
            method = m || "system.info";
            if (rest.length > 0) params = JSON.parse(rest.join(" "));
          }
          let res: { ok: true; result: unknown } | { ok: false; error: string };
          try {
            res = { ok: true, result: await executeOsAction(method, params, { source: "ui" }) };
          } catch (err) {
            res = { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
          const durationMs = Math.round(performance.now() - t0);
          setCells((prev) =>
            prev.map((c) =>
              c.id === cell.id
                ? {
                    ...c,
                    running: false,
                    execCount: execNo,
                    output: {
                      stdout: res.ok ? JSON.stringify(res.result, null, 2) : "",
                      stderr: res.ok ? "" : res.error || "API call failed",
                      exitCode: res.ok ? 0 : 1,
                      durationMs,
                      images: [],
                      tables: [],
                      json: res.ok ? res.result : undefined,
                    },
                  }
                : c
            )
          );
          return;
        }

        const token = `nb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const b64 = (txt: string) => {
          const bytes = new TextEncoder().encode(txt);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
          return btoa(bin);
        };

        let script = `mkdir -p ${sq(cwd)} /tmp/unkernel-nb && cd ${sq(cwd)}\nexport PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"\n`;
        if (cell.lang === "python") {
          const fullPy = `${PYTHON_PREAMBLE}\n${cell.source}\n`;
          script += `printf '%s' ${sq(b64(fullPy))} | base64 -d > /tmp/unkernel-nb/${token}.py && python3 /tmp/unkernel-nb/${token}.py; EC=$?; rm -f /tmp/unkernel-nb/${token}.py; exit $EC`;
        } else if (cell.lang === "rust") {
          const hasMain = /\bfn\s+main\s*\(/.test(cell.source);
          const rustCode = hasMain
            ? cell.source
            : `fn main() {\n${cell.source}\n}\n`;
          script += `if ! command -v rustc >/dev/null 2>&1; then echo "rustc not installed. Install Rust in App Store or Toolchain Installer." >&2; exit 127; fi\nprintf '%s' ${sq(b64(rustCode))} | base64 -d > /tmp/unkernel-nb/${token}.rs && rustc -O /tmp/unkernel-nb/${token}.rs -o /tmp/unkernel-nb/${token}.bin && /tmp/unkernel-nb/${token}.bin; EC=$?; rm -f /tmp/unkernel-nb/${token}.rs /tmp/unkernel-nb/${token}.bin; exit $EC`;
        } else if (cell.lang === "ocaml") {
          script += `if ! command -v ocaml >/dev/null 2>&1; then echo "ocaml not installed. Install OCaml in App Store or Toolchain Installer." >&2; exit 127; fi\nprintf '%s' ${sq(b64(cell.source))} | base64 -d > /tmp/unkernel-nb/${token}.ml && ocaml /tmp/unkernel-nb/${token}.ml; EC=$?; rm -f /tmp/unkernel-nb/${token}.ml; exit $EC`;
        } else if (cell.lang === "bun") {
          script += `printf '%s' ${sq(b64(cell.source))} | base64 -d > /tmp/unkernel-nb/${token}.ts && bun run /tmp/unkernel-nb/${token}.ts; EC=$?; rm -f /tmp/unkernel-nb/${token}.ts; exit $EC`;
        } else if (cell.lang === "sql") {
          const dbPath = `${cwd}/.notebook.db`;
          script += `if ! command -v sqlite3 >/dev/null 2>&1; then echo "sqlite3 not installed. Install SQLite 3 in Store or Toolchain." >&2; exit 127; fi\nprintf '%s' ${sq(b64(cell.source))} | base64 -d > /tmp/unkernel-nb/${token}.sql && sqlite3 -json ${sq(dbPath)} < /tmp/unkernel-nb/${token}.sql; EC=$?; rm -f /tmp/unkernel-nb/${token}.sql; exit $EC`;
        } else {
          // bash
          script += `printf '%s' ${sq(b64(cell.source))} | base64 -d > /tmp/unkernel-nb/${token}.sh && /bin/bash /tmp/unkernel-nb/${token}.sh; EC=$?; rm -f /tmp/unkernel-nb/${token}.sh; exit $EC`;
        }

        const res = await appRuntime.runPromise(
          Effect.either(Effect.flatMap(VmService, (vm) => vm.execShell(script)))
        );
        const durationMs = Math.round(performance.now() - t0);

        if (res._tag === "Left") {
          setCells((prev) =>
            prev.map((c) =>
              c.id === cell.id
                ? {
                    ...c,
                    running: false,
                    execCount: execNo,
                    output: {
                      stdout: "",
                      stderr: String(res.left),
                      exitCode: 1,
                      durationMs,
                      images: [],
                      tables: [],
                    },
                  }
                : c
            )
          );
          return;
        }

        const { stdout, stderr, exitCode } = res.right;
        let tables: Record<string, unknown>[][] = [];
        let cleanStdout = stdout;
        let images: string[] = [];

        if (cell.lang === "sql" && exitCode === 0 && stdout.trim().startsWith("[")) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (Array.isArray(parsed)) {
              tables = [parsed as Record<string, unknown>[]];
              cleanStdout = `${parsed.length} row(s) returned`;
            }
          } catch {
            // keep raw stdout
          }
        } else {
          const rich = parseRichOutput(stdout);
          cleanStdout = rich.cleanStdout;
          images = rich.images;
          tables = rich.tables;
        }

        setCells((prev) =>
          prev.map((c) =>
            c.id === cell.id
              ? {
                  ...c,
                  running: false,
                  execCount: execNo,
                  output: {
                    stdout: cleanStdout,
                    stderr: stderr.trim(),
                    exitCode: exitCode ?? -1,
                    durationMs,
                    images,
                    tables,
                  },
                }
              : c
          )
        );
      } catch (err) {
        const durationMs = Math.round(performance.now() - t0);
        setCells((prev) =>
          prev.map((c) =>
            c.id === cell.id
              ? {
                  ...c,
                  running: false,
                  execCount: execNo,
                  output: {
                    stdout: "",
                    stderr: err instanceof Error ? err.message : String(err),
                    exitCode: 1,
                    durationMs,
                    images: [],
                    tables: [],
                  },
                }
              : c
          )
        );
      }
    },
    [wm.activeWorkspaceDir]
  );

  const runAllCells = async () => {
    setRunningAll(true);
    for (const cell of cells) {
      if (cell.lang !== "markdown") {
        await runCell(cell);
      }
    }
    setRunningAll(false);
  };

  const addCell = (lang: CellLang, afterId?: string) => {
    const defaults: Record<CellLang, string> = {
      python: "import math\nprint('π =', round(math.pi, 6))",
      rust: 'println!("Hello from native aarch64 Rust!");',
      ocaml: 'Printf.printf "Hello from OCaml! 6 * 7 = %d\\n" (6 * 7);;',
      bun: 'console.log("Bun", Bun.version, new Date().toISOString());',
      sql: "SELECT sqlite_version() AS version, datetime('now') AS utc_now;",
      bash: "uname -a && ls -la",
      osctl: JSON.stringify({ method: "system.info", params: {} }, null, 2),
      markdown: "## Section Notes\nWrite **Markdown** documentation here.",
    };
    const nextCell: NotebookCell = {
      id: `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      lang,
      source: defaults[lang],
    };
    if (lang === "markdown") {
      setEditingMd((prev) => ({ ...prev, [nextCell.id]: true }));
    }
    setCells((prev) => {
      if (!afterId) return [...prev, nextCell];
      const idx = prev.findIndex((c) => c.id === afterId);
      if (idx === -1) return [...prev, nextCell];
      return [...prev.slice(0, idx + 1), nextCell, ...prev.slice(idx + 1)];
    });
  };

  const moveCell = (id: string, delta: -1 | 1) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const target = idx + delta;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item!);
      return copy;
    });
  };

  const saveToWorkspace = async () => {
    const dir = wm.activeWorkspaceDir || "/home/user/workspace";
    const defaultName =
      filePath?.split("/").pop() ||
      `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "notebook"}.ipynb`;
    const chosen = window.prompt(`Save .ipynb notebook in ${dir}:`, defaultName);
    if (!chosen?.trim()) return;
    const target = chosen.startsWith("/") ? chosen.trim() : `${dir}/${chosen.trim()}`.replace(/\/+/g, "/");
    const json = toIpynbJson(title, cells);
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.writeFileText(target, json)))
    );
    if (res._tag === "Right") {
      setFilePath(target);
      wmStore.pushToast("Notebook Saved", target, "success");
    } else {
      wmStore.pushToast("Save Failed", res.left.message, "error");
    }
  };

  const exportIpynbDownload = () => {
    const json = toIpynbJson(title, cells);
    const blob = new Blob([json], { type: "application/x-ipynb+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "notebook"}.ipynb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = fromIpynbJson(text);
      setCells(loaded.cells);
      setTitle(loaded.title || file.name.replace(/\.ipynb$/i, ""));
      setFilePath(null);
      wmStore.pushToast("Notebook Imported", `${loaded.cells.length} cells loaded`, "success");
    } catch (err) {
      wmStore.pushToast("Import Error", err instanceof Error ? err.message : String(err), "error");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-[#080a11]/96 overflow-hidden">
      {/* Left Sidebar: Starter Labs + Quick Add Kernels */}
      <aside className="w-full md:w-60 max-h-44 md:max-h-none shrink-0 bg-black/35 border-b md:border-b-0 md:border-r border-white/10 p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-white">Polyglot Notebooks</span>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Starter Labs
          </div>
          {STARTER_NOTEBOOKS.map((nb) => (
            <button
              key={nb.id}
              type="button"
              onClick={() => {
                setTitle(nb.title);
                setFilePath(null);
                setCells(makeCells(nb));
              }}
              className="w-full text-left p-2 rounded-xl bg-white/[0.03] hover:bg-white/10 border border-white/8 transition space-y-0.5"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-medium text-zinc-100 truncate">{nb.title}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                  {nb.badge}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 line-clamp-2">{nb.description}</p>
            </button>
          ))}
        </div>

        <div className="space-y-1.5 pt-1 border-t border-white/8">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Add Kernel Cell
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(LANG_META) as CellLang[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => addCell(lang)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-medium hover:brightness-125 transition ${LANG_META[lang].badge}`}
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span className="truncate">{LANG_META[lang].short}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-2 border-t border-white/8 text-[10px] text-zinc-500 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Shortcuts:</span>
          </div>
          <div><kbd className="px-1 rounded bg-white/10 text-zinc-300 font-mono">⇧Enter</kbd> Run cell</div>
          <div><code className="text-emerald-300">plt.show()</code> → inline PNG</div>
          <div><code className="text-cyan-300">show_table(rows)</code> → table</div>
        </div>
      </aside>

      {/* Main Notebook Canvas */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-black/40 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent focus:border-cyan-400/60 truncate max-w-sm"
            />
            {filePath && (
              <span className="text-[10px] font-mono text-zinc-500 truncate hidden sm:inline">
                {filePath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={runningAll}
              onClick={() => void runAllCells()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:brightness-110 disabled:opacity-50 shadow transition"
            >
              {runningAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
              Run All
            </button>
            <button
              type="button"
              onClick={() =>
                setCells((prev) => prev.map((c) => ({ ...c, output: undefined, execCount: undefined })))
              }
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200 transition"
              title="Clear All Outputs"
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear
            </button>
            <button
              type="button"
              onClick={() => void saveToWorkspace()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200 transition"
              title="Save .ipynb to Active Linux Workspace"
            >
              <Save className="w-3.5 h-3.5 text-cyan-400" />
              Save
            </button>
            <button
              type="button"
              onClick={exportIpynbDownload}
              className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-zinc-300"
              title="Download .ipynb"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="p-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-zinc-300"
              title="Import .ipynb"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".ipynb,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => wmStore.openApp("toolchain")}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] bg-orange-500/15 hover:bg-orange-500/25 border border-orange-400/30 text-orange-200 transition"
              title="Check / Install Rust, OCaml, NumPy & Matplotlib"
            >
              <FolderOpen className="w-3 h-3" />
              Kernels
            </button>
          </div>
        </div>

        {/* Cells Scroll Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
          {cells.map((cell, idx) => {
            const meta = LANG_META[cell.lang];
            const isMdPreview = cell.lang === "markdown" && !editingMd[cell.id];
            const lineCount = Math.max(2, Math.min(26, cell.source.split("\n").length));

            return (
              <div
                key={cell.id}
                className="rounded-2xl bg-white/[0.025] border border-white/10 hover:border-white/18 overflow-hidden transition shadow-sm"
              >
                {/* Cell Header */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/40 border-b border-white/8">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 w-9">
                      [{cell.running ? "*" : cell.execCount ?? " "}]
                    </span>
                    <select
                      value={cell.lang}
                      onChange={(e) =>
                        setCells((prev) =>
                          prev.map((c) =>
                            c.id === cell.id ? { ...c, lang: e.target.value as CellLang } : c
                          )
                        )
                      }
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-medium outline-none cursor-pointer ${meta.badge}`}
                    >
                      {(Object.keys(LANG_META) as CellLang[]).map((l) => (
                        <option key={l} value={l} className="bg-[#10131e] text-white">
                          {LANG_META[l].label}
                        </option>
                      ))}
                    </select>
                    {cell.output && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          cell.output.exitCode === 0
                            ? "text-emerald-300 bg-emerald-500/12"
                            : "text-rose-300 bg-rose-500/15"
                        }`}
                      >
                        {cell.output.exitCode === 0 ? "OK" : `exit ${cell.output.exitCode}`} · {cell.output.durationMs}ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {cell.lang !== "markdown" ? (
                      <button
                        type="button"
                        disabled={cell.running}
                        onClick={() => void runCell(cell)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/32 border border-emerald-400/35 text-emerald-200 disabled:opacity-50 transition"
                        title="Run Cell (Shift+Enter)"
                      >
                        {cell.running ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Run
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingMd((prev) => ({ ...prev, [cell.id]: !prev[cell.id] }))
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-white/14 text-zinc-200"
                      >
                        <Code2 className="w-3 h-3" />
                        {isMdPreview ? "Edit" : "Preview"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(cell.source).catch(() => {});
                        setCopiedId(cell.id);
                        setTimeout(() => setCopiedId(null), 1200);
                      }}
                      className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
                      title="Copy Cell Source"
                    >
                      {copiedId === cell.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveCell(cell.id, -1)}
                      className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === cells.length - 1}
                      onClick={() => moveCell(cell.id, 1)}
                      className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => addCell(cell.lang, cell.id)}
                      className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-cyan-300"
                      title="Insert Cell Below"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCells((prev) =>
                          prev.length > 1 ? prev.filter((c) => c.id !== cell.id) : prev
                        )
                      }
                      className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                      title="Delete Cell"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cell Body */}
                {isMdPreview ? (
                  <div
                    onDoubleClick={() => setEditingMd((prev) => ({ ...prev, [cell.id]: true }))}
                    className="p-4 space-y-1 cursor-text"
                  >
                    {renderMarkdownSimple(cell.source)}
                  </div>
                ) : (
                  <textarea
                    value={cell.source}
                    rows={lineCount}
                    spellCheck={false}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCells((prev) =>
                        prev.map((c) => (c.id === cell.id ? { ...c, source: val } : c))
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void runCell(cell);
                      }
                    }}
                    className="w-full bg-[#06080f] p-3.5 font-mono text-xs text-zinc-100 leading-relaxed outline-none resize-y"
                  />
                )}

                {/* Cell Rich Output */}
                {cell.output && (
                  <div className="border-t border-white/10 bg-[#05070c] p-3 space-y-3">
                    {cell.output.images.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                          <ImageIcon className="w-3 h-3" />
                          Rendered Figure ({cell.output.images.length})
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {cell.output.images.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt={`Cell figure ${i + 1}`}
                              className="max-w-full rounded-xl border border-white/12 bg-[#0b0f1a] shadow-lg"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {cell.output.tables.map((rows, tIdx) => {
                      const cols = Array.from(
                        new Set(rows.flatMap((r) => Object.keys(r)))
                      );
                      return (
                        <div key={tIdx} className="space-y-1.5 overflow-x-auto">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
                            <Table2 className="w-3 h-3" />
                            Data Table ({rows.length} rows)
                          </div>
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                              <tr className="border-b border-white/15 bg-white/[0.04]">
                                {cols.map((col) => (
                                  <th key={col} className="px-2.5 py-1.5 text-cyan-300 font-semibold">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.slice(0, 100).map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-white/6 hover:bg-white/[0.03]">
                                  {cols.map((col) => (
                                    <td key={col} className="px-2.5 py-1 text-zinc-200">
                                      {row[col] === null || row[col] === undefined
                                        ? "NULL"
                                        : typeof row[col] === "object"
                                        ? JSON.stringify(row[col])
                                        : String(row[col])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}

                    {cell.output.stdout && (
                      <pre className="text-xs font-mono text-emerald-200/95 whitespace-pre-wrap break-words select-text leading-relaxed">
                        {cell.output.stdout}
                      </pre>
                    )}

                    {cell.output.stderr && (
                      <pre className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs font-mono text-rose-300 whitespace-pre-wrap break-words select-text">
                        {cell.output.stderr}
                      </pre>
                    )}

                    {!cell.output.stdout &&
                      !cell.output.stderr &&
                      cell.output.images.length === 0 &&
                      cell.output.tables.length === 0 && (
                        <div className="text-[11px] font-mono text-zinc-500 italic">
                          (Completed with no stdout output)
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom Quick-Add Bar */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2 pb-6">
            {(["python", "rust", "ocaml", "bun", "sql", "bash", "osctl", "markdown"] as CellLang[]).map(
              (lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => addCell(lang)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/12 border border-white/10 text-[11px] text-zinc-300 transition"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${LANG_META[lang].dot}`} />
                  + {LANG_META[lang].label}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
