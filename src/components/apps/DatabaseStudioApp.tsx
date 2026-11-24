import { Effect } from "effect";
import {
  Database,
  Download,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { appRuntime, VmService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

interface TableMeta {
  readonly name: string;
  readonly rows: number;
  readonly columns: readonly { name: string; type: string }[];
}

interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | number | null)[])[];
  readonly rowCount: number;
  readonly durationMs: number;
}

const DEFAULT_DB = "/home/user/workspace/demo.db";

const SEED_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stack TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  deployed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO projects (name, stack, status) VALUES
  ('unkernelos', 'Bun + Effect-TS + WebGPU', 'live'),
  ('ai-dashboard', 'React 19 + Tailwind v4', 'building'),
  ('edge-api', 'TypeScript + SQLite', 'live');
INSERT INTO deployments (project_id, url, duration_sec) VALUES
  (1, 'https://thesamlepirate.github.io/unkernelos/', 54),
  (2, 'https://example.github.io/ai-dashboard/', 31),
  (3, 'https://example.github.io/edge-api/', 28);
`;

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const DatabaseStudioApp: React.FC = () => {
  const [dbPath, setDbPath] = useState(DEFAULT_DB);
  const [discoveredDbs, setDiscoveredDbs] = useState<string[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [sql, setSql] = useState("SELECT p.id, p.name, p.stack, p.status, d.url\nFROM projects p\nLEFT JOIN deployments d ON d.project_id = p.id\nORDER BY p.id;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const discoverDbs = useCallback(async () => {
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.execShell(
            `find /home/user -maxdepth 4 \\( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \\) 2>/dev/null | head -n 30`
          )
        )
      )
    );
    if (res._tag === "Right") {
      setDiscoveredDbs(res.right.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
    }
  }, []);

  const inspectSchema = useCallback(async (path = dbPath) => {
    const py = `
import json, os, sqlite3, sys
p = sys.argv[1]
if not os.path.exists(p):
  print(json.dumps({"exists": False, "tables": []}))
  sys.exit(0)
con = sqlite3.connect(p)
cur = con.cursor()
tbls = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()]
out = []
for t in tbls:
  cols = [{"name": c[1], "type": c[2] or "ANY"} for c in cur.execute(f'PRAGMA table_info("{t}")').fetchall()]
  cnt = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
  out.append({"name": t, "rows": cnt, "columns": cols})
print(json.dumps({"exists": True, "tables": out}))
`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.execShell(`python3 -c ${sq(py)} ${sq(path)}`)
        )
      )
    );
    if (res._tag === "Right" && res.right.exitCode === 0) {
      try {
        const parsed = JSON.parse(res.right.stdout.trim()) as { tables?: TableMeta[] };
        setTables(parsed.tables ?? []);
      } catch {
        setTables([]);
      }
    }
  }, [dbPath]);

  const executeSql = useCallback(async (queryText = sql, path = dbPath) => {
    setRunning(true);
    setError(null);
    const t0 = performance.now();
    const py = `
import json, os, sqlite3, sys
p = sys.argv[1]
q = sys.stdin.read().strip()
os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
con = sqlite3.connect(p)
cur = con.cursor()
try:
  stmts = [s.strip() for s in q.split(";") if s.strip()]
  if len(stmts) > 1:
    cur.executescript(q)
    con.commit()
    print(json.dumps({"columns": ["status"], "rows": [[f"Executed {len(stmts)} SQL statements."]], "rowCount": len(stmts)}))
  else:
    cur.execute(q)
    if cur.description:
      cols = [d[0] for d in cur.description]
      rows = [list(r) for r in cur.fetchmany(500)]
      print(json.dumps({"columns": cols, "rows": rows, "rowCount": len(rows)}, default=str))
    else:
      con.commit()
      print(json.dumps({"columns": ["affected_rows"], "rows": [[cur.rowcount]], "rowCount": cur.rowcount}))
except Exception as e:
  print(json.dumps({"error": str(e)}))
  sys.exit(1)
`;
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(VmService, (vm) =>
          vm.exec("/bin/sh", ["-c", `python3 -c ${sq(py)} ${sq(path)}`], { input: queryText })
        )
      )
    );
    setRunning(false);

    if (res._tag === "Left") {
      setError(String(res.left));
      return;
    }

    const durationMs = Math.round(performance.now() - t0);
    try {
      const parsed = JSON.parse(res.right.stdout.trim()) as {
        columns?: string[];
        rows?: (string | number | null)[][];
        rowCount?: number;
        error?: string;
      };
      if (parsed.error) {
        setError(parsed.error);
        setResult(null);
      } else {
        setResult({
          columns: parsed.columns ?? [],
          rows: parsed.rows ?? [],
          rowCount: parsed.rowCount ?? 0,
          durationMs,
        });
        await inspectSchema(path);
        await discoverDbs();
        appRuntime.runFork(Effect.flatMap(VmService, (v) => v.syncDisk()));
      }
    } catch {
      setError(res.right.stderr || res.right.stdout || "SQLite execution error");
    }
  }, [sql, dbPath, inspectSchema, discoverDbs]);

  const seedDemoDb = async () => {
    setDbPath(DEFAULT_DB);
    await executeSql(SEED_SQL, DEFAULT_DB);
    wmStore.pushToast("Demo SQLite DB Ready", DEFAULT_DB, "success");
    await executeSql("SELECT * FROM projects;", DEFAULT_DB);
  };

  useEffect(() => {
    void discoverDbs();
    void inspectSchema(dbPath);
  }, []);

  const exportCsv = () => {
    if (!result) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      result.columns.map(esc).join(","),
      ...result.rows.map((r) => r.map(esc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-result.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full h-full bg-[#090b12]/96 overflow-hidden">
      {/* Sidebar: Databases & Tables */}
      <aside className="w-60 shrink-0 bg-black/35 border-r border-white/10 p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              SQLite Database
            </span>
            <button
              type="button"
              onClick={() => {
                void discoverDbs();
                void inspectSchema(dbPath);
              }}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            value={dbPath}
            onChange={(e) => setDbPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void inspectSchema(dbPath)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 text-[11px] font-mono text-zinc-100 outline-none"
          />
          <button
            type="button"
            onClick={() => void seedDemoDb()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 transition"
          >
            <Sparkles className="w-3 h-3" />
            Create / Seed Demo DB
          </button>
        </div>

        {discoveredDbs.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Found on Disk
            </div>
            {discoveredDbs.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setDbPath(p);
                  void inspectSchema(p);
                }}
                className={`w-full text-left px-2 py-1 rounded-lg text-[11px] font-mono truncate transition ${
                  dbPath === p ? "bg-cyan-500/20 text-cyan-200" : "text-zinc-400 hover:bg-white/8"
                }`}
              >
                {p.replace("/home/user/", "~/")}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Tables ({tables.length})
          </div>
          {tables.length === 0 ? (
            <p className="text-[11px] text-zinc-500 italic">
              No tables yet. Click &ldquo;Create / Seed Demo DB&rdquo; or run a CREATE TABLE query.
            </p>
          ) : (
            tables.map((t) => (
              <div
                key={t.name}
                className="p-2 rounded-xl bg-white/[0.03] border border-white/8 space-y-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    const q = `SELECT * FROM "${t.name}" LIMIT 100;`;
                    setSql(q);
                    void executeSql(q, dbPath);
                  }}
                  className="w-full flex items-center justify-between text-xs font-mono text-white hover:text-cyan-300 transition"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Table2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {t.name}
                  </span>
                  <span className="text-[10px] text-zinc-500">{t.rows}</span>
                </button>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {t.columns.map((c) => (
                    <span
                      key={c.name}
                      className="px-1.5 py-0.5 rounded bg-black/40 text-[9px] font-mono text-zinc-400"
                    >
                      {c.name}:{c.type}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main SQL Editor + Data Grid */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="p-3 bg-black/30 border-b border-white/10 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300 font-mono">SQL Query Editor</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSql("CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT);\nINSERT INTO notes (title, body) VALUES ('Hello', 'From unkernelOS SQL Studio');")
                }
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/6 hover:bg-white/12 text-[11px] text-zinc-300"
              >
                <Plus className="w-3 h-3" />
                Template
              </button>
              <button
                type="button"
                disabled={running || !sql.trim()}
                onClick={() => void executeSql()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:brightness-110 disabled:opacity-45 transition"
              >
                <Play className="w-3.5 h-3.5" />
                {running ? "Running..." : "Run SQL (⌘↵)"}
              </button>
            </div>
          </div>

          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void executeSql();
              }
            }}
            rows={5}
            spellCheck={false}
            className="w-full p-3 rounded-2xl bg-[#0b0d16] border border-white/12 focus:border-cyan-400/60 font-mono text-xs text-cyan-100 outline-none resize-none select-text"
          />
        </div>

        {/* Results Grid */}
        <div className="flex-1 min-h-0 flex flex-col bg-[#070910]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/8 text-[11px] font-mono text-zinc-400 shrink-0">
            <span>
              {result
                ? `${result.rowCount} row(s) · ${result.durationMs} ms`
                : "Query Results"}
            </span>
            {result && result.rows.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1 text-cyan-300 hover:underline"
              >
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-3">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/30 text-xs font-mono text-rose-200">
                {error}
              </div>
            )}

            {result && (
              <table className="w-full text-left border-collapse font-mono text-xs select-text">
                <thead>
                  <tr className="border-b border-white/12 text-[10px] uppercase text-cyan-300 bg-white/[0.03]">
                    {result.columns.map((c) => (
                      <th key={c} className="py-2 px-2.5">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="py-1.5 px-2.5 text-zinc-200 max-w-xs truncate">
                          {cell === null ? <span className="text-zinc-600 italic">NULL</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
