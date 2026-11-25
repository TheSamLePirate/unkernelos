import { Effect } from "effect";
import {
  AlertTriangle,
  ArrowRight,
  Binary,
  Check,
  ChevronDown,
  Cpu,
  Download,
  ExternalLink,
  GitCompare,
  Layers,
  Loader2,
  Play,
  Tags,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  highlight,
  lineDiff,
  MICROML_AUTHOR,
  MICROML_EXAMPLES,
  MICROML_PASSES,
  MICROML_REPO_URL,
  type MicromlExploreResult,
  type MicromlLocation,
  type MicromlRun,
  type PassId,
} from "../../core/microml.ts";
import { runMicroml } from "../../core/microml-runner.ts";
import { appRuntime, useSubscriptionRef } from "../../core/runtime.ts";
import { ToolchainService, type ToolchainSnapshot } from "../../core/toolchain-service.ts";
import { VmService, type VmState } from "../../core/vm-service.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { CodeEditor, type EditorMarker } from "./shared/CodeEditor.tsx";

type StageId = PassId | "c";

interface StageDef {
  readonly id: StageId;
  readonly title: string;
  readonly short: string;
  readonly description: string;
}

const STAGES: readonly StageDef[] = [
  ...MICROML_PASSES.map((p) => ({ id: p.id, title: p.title, short: p.short, description: p.description })),
  {
    id: "c",
    title: "Generated C",
    short: "C",
    description: "C source emitted against the microML runtime (rt.h), compiled with gcc and linked with libruntime.a.",
  },
];

const STORAGE_KEY = "unkernelos.microml.source.v1";

const loadSaved = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const save = (src: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, src);
  } catch {
    // storage unavailable (private mode) — editing still works
  }
};

/** Character offsets of a microML location inside `src` (1-based line, 0-based col). */
function locToRange(src: string, loc: MicromlLocation): [number, number] | null {
  const lines = src.split("\n");
  const offsetOf = (line: number, col: number) => {
    let off = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i]!.length + 1;
    return off + col;
  };
  if (loc.line < 1 || loc.line > lines.length) return null;
  const start = offsetOf(loc.line, loc.col);
  const end = Math.max(start + 1, offsetOf(loc.endLine, loc.endCol));
  return [Math.min(start, src.length), Math.min(end, src.length)];
}

const fmtBytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

const VM_PLACEHOLDER = { phase: "idle" } as VmState;
const TOOLCHAIN_PLACEHOLDER = { tools: {}, logs: [], busy: false } as unknown as ToolchainSnapshot;

export const MicromlExplorerApp: React.FC = () => {
  const [source, setSource] = useState<string>(() => loadSaved() ?? MICROML_EXAMPLES[0]!.source);
  const [result, setResult] = useState<MicromlExploreResult | null>(null);
  const [ranSource, setRanSource] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [vmError, setVmError] = useState<string | null>(null);
  const [stage, setStage] = useState<StageId>("typer");
  const [showDiff, setShowDiff] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const vm = useSubscriptionRef(Effect.map(VmService, (v) => v.stateRef), VM_PLACEHOLDER);
  const toolchain = useSubscriptionRef(Effect.map(ToolchainService, (t) => t.stateRef), TOOLCHAIN_PLACEHOLDER);
  const micromlTool = toolchain.tools?.microml;
  const installing = micromlTool?.status === "installing";
  const vmReady = vm.phase === "running";

  const { micromlDraft } = useWm();

  const runSeq = useRef(0);

  const run = useCallback(async (src: string) => {
    const seq = ++runSeq.current;
    setRunning(true);
    setVmError(null);
    const res = await appRuntime.runPromise(Effect.either(runMicroml(src, "full")));
    if (seq !== runSeq.current) return;
    setRunning(false);
    if (res._tag === "Left") {
      const e = res.left as { _tag?: string; message?: string; stderr?: string };
      setVmError(
        e._tag === "KernelNotRunningError" ? "Linux is not running yet — boot the VM first." : e.stderr || e.message || String(e._tag)
      );
      return;
    }
    setResult(res.right);
    setRanSource(src);
    if (res.right.error?.stage) setStage(res.right.error.stage);
  }, []);

  const autoRan = useRef(false);

  // Draft pushed from the Notebook ("Explore" on a microML cell)
  useEffect(() => {
    if (!micromlDraft) return;
    setSource(micromlDraft.source);
    save(micromlDraft.source);
    wmStore.clearMicromlDraft(micromlDraft.id);
    if (vmReady) {
      autoRan.current = true; // the draft run supersedes the initial auto-run
      void run(micromlDraft.source);
    }
  }, [micromlDraft, vmReady, run]);

  // First compile as soon as Linux is up
  useEffect(() => {
    if (vmReady && !autoRan.current) {
      autoRan.current = true;
      void run(source);
    }
  }, [vmReady, run, source]);

  // Re-run once the toolchain install finishes
  const prevToolStatus = useRef(micromlTool?.status);
  useEffect(() => {
    if (prevToolStatus.current === "installing" && micromlTool?.status === "installed") void run(source);
    prevToolStatus.current = micromlTool?.status;
  }, [micromlTool?.status, run, source]);

  const updateSource = (next: string) => {
    setSource(next);
    save(next);
  };

  const loadExample = (id: string) => {
    const ex = MICROML_EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    updateSource(ex.source);
    setExamplesOpen(false);
    if (vmReady) void run(ex.source);
  };

  const install = () => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.installTool("microml")).pipe(Effect.ignore));
  };

  const stale = result !== null && ranSource !== source;
  const error = result?.error ?? null;
  const errorRange = useMemo(
    () => (error?.loc && !stale ? locToRange(source, error.loc) : null),
    [error, source, stale]
  );
  const errorLine = error?.loc && !stale ? error.loc.line : null;
  const markers = useMemo<EditorMarker[]>(
    () => (errorRange ? [{ start: errorRange[0], end: errorRange[1], kind: "error" }] : []),
    [errorRange]
  );
  const errorLines = useMemo(() => (errorLine ? [errorLine] : []), [errorLine]);
  const lineCount = source.split("\n").length;

  // ---- stage status --------------------------------------------------------
  const errorIdx = error?.stage ? STAGES.findIndex((s) => s.id === error.stage) : -1;
  const stageStatus = (id: StageId, idx: number): "ok" | "error" | "skipped" | "idle" => {
    if (!result || !result.installed) return "idle";
    if (error) {
      if (errorIdx < 0) return id === "parsing" ? "error" : "skipped";
      if (idx < errorIdx) return "ok";
      if (idx === errorIdx) return "error";
      return "skipped";
    }
    if (id === "c") return result.compile?.ok ? "ok" : result.compile ? "error" : "idle";
    return result.stages[id as PassId] !== undefined ? "ok" : "idle";
  };

  const stageDef = STAGES.find((s) => s.id === stage)!;
  const stageIdx = STAGES.findIndex((s) => s.id === stage);
  const passDef = MICROML_PASSES.find((p) => p.id === stage);
  const stageText = stage === "c" ? (result?.cSource ?? "") : (result?.stages[stage as PassId] ?? "");
  const prevPass = passDef
    ? [...MICROML_PASSES.slice(0, MICROML_PASSES.findIndex((p) => p.id === passDef.id))]
        .reverse()
        .find((p) => p.kind === passDef.kind && p.id !== "typer" && result?.stages[p.id] !== undefined)
    : undefined;
  const diffAvailable = Boolean(passDef && stage !== "typer" && prevPass);
  const diff = useMemo(() => {
    if (!diffAvailable || !showDiff || !prevPass || !result) return null;
    return lineDiff(result.stages[prevPass.id] ?? "", stageText);
  }, [diffAvailable, showDiff, prevPass, result, stageText]);
  const diffStats = diff
    ? { add: diff.filter((d) => d.kind === "add").length, del: diff.filter((d) => d.kind === "del").length }
    : null;
  const lang = stage === "c" ? "c" : passDef?.kind === "ir" ? "ir" : "ml";
  const hlOpts = { nameMap: result?.nameMap ?? {}, showNames };

  const evalRun = result?.evalRun ?? null;
  const nativeRun = result?.nativeRun ?? null;
  const agree =
    evalRun && nativeRun ? evalRun.stdout === nativeRun.stdout && evalRun.exitCode === nativeRun.exitCode : null;
  const typeAgree = result ? result.types.filter((t) => t.agrees === true).length : 0;
  const typeCompared = result ? result.types.filter((t) => t.agrees !== null).length : 0;

  const notInstalled = result !== null && !result.installed;

  return (
    <div className="flex flex-col w-full h-full bg-[#07080d] text-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-transparent to-violet-500/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0 mr-auto">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight">microML Explorer</div>
            <div className="text-[10.5px] text-zinc-400 truncate">
              Mini-OCaml compiler by{" "}
              <button
                type="button"
                onClick={() => window.open(MICROML_REPO_URL, "_blank", "noopener")}
                className="text-amber-300 hover:underline"
              >
                {MICROML_AUTHOR}
              </button>
              {result?.version ? <span className="font-mono"> · {result.version}</span> : null}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setExamplesOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/6 border border-white/10 text-[11.5px] hover:bg-white/10"
          >
            Examples <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          {examplesOpen && (
            <button
              type="button"
              aria-label="Close examples"
              onClick={() => setExamplesOpen(false)}
              className="fixed inset-0 z-20 cursor-default"
            />
          )}
          {examplesOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 z-30 rounded-xl bg-[#10131c] border border-white/12 shadow-2xl p-1.5">
              {MICROML_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => loadExample(ex.id)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/8"
                >
                  <div className="text-[12px] text-white">{ex.title}</div>
                  <div className="text-[10.5px] text-zinc-400">{ex.blurb}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.open(MICROML_REPO_URL, "_blank", "noopener")}
          title="Open microML on GitHub"
          className="p-1.5 rounded-lg bg-white/6 border border-white/10 hover:bg-white/10"
        >
          <ExternalLink className="w-3.5 h-3.5 text-zinc-300" />
        </button>
        <button
          type="button"
          disabled={running || !vmReady}
          onClick={() => void run(source)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[12px] font-semibold shadow-lg shadow-orange-600/25 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Compile & run
          <kbd className="hidden sm:inline ml-1 px-1 rounded bg-black/25 text-[10px] font-mono">⌘↵</kbd>
        </button>
      </div>

      {/* Pipeline rail */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/8 bg-black/30 overflow-x-auto shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1 shrink-0">Source</span>
        {STAGES.map((s, idx) => {
          const st = stageStatus(s.id, idx);
          const active = s.id === stage;
          return (
            <React.Fragment key={s.id}>
              <ArrowRight className={`w-3 h-3 shrink-0 ${st === "ok" ? "text-amber-400/70" : "text-zinc-700"}`} />
              <button
                type="button"
                onClick={() => setStage(s.id)}
                title={s.description}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium shrink-0 transition ${
                  active
                    ? "bg-amber-500/20 border-amber-400/50 text-amber-100"
                    : st === "error"
                      ? "bg-rose-500/10 border-rose-400/40 text-rose-200 hover:bg-rose-500/20"
                      : st === "skipped"
                        ? "bg-white/[0.02] border-white/6 text-zinc-600"
                        : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/8"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    running
                      ? "bg-amber-300 animate-pulse"
                      : st === "ok"
                        ? "bg-emerald-400"
                        : st === "error"
                          ? "bg-rose-400"
                          : "bg-zinc-600"
                  }`}
                />
                <span className="font-mono text-[9.5px] text-zinc-500">{idx + 1}</span>
                {s.short}
              </button>
            </React.Fragment>
          );
        })}
        <ArrowRight className={`w-3 h-3 shrink-0 ${nativeRun ? "text-amber-400/70" : "text-zinc-700"}`} />
        <span
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] shrink-0 ${
            nativeRun ? "text-emerald-300" : "text-zinc-600"
          }`}
        >
          <Binary className="w-3.5 h-3.5" /> {nativeRun ? fmtBytes(nativeRun.sizeBytes) : "binary"}
        </span>
      </div>

      {/* Main */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Editor */}
        <div className="lg:w-[44%] h-[42%] lg:h-auto min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/8">
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10.5px] text-zinc-500 border-b border-white/6 bg-black/20 shrink-0">
            <span className="font-mono">main.ml</span>
            {stale && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">edited · ⌘↵ to recompile</span>}
            <span className="ml-auto">{lineCount} lines</span>
          </div>
          <CodeEditor
            value={source}
            onChange={updateSource}
            lang="ml"
            onRun={() => void run(source)}
            markers={markers}
            errorLines={errorLines}
          />
          {error && !stale && (
            <div className="shrink-0 m-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                {error.stage ? `${STAGES.find((s) => s.id === error.stage)?.title ?? error.stage} error` : "Compilation error"}
                {error.loc && (
                  <span className="font-mono font-normal text-rose-300/80">
                    line {error.loc.line}:{error.loc.col}
                  </span>
                )}
              </div>
              <pre className="mt-1 text-[11px] font-mono text-rose-100/90 whitespace-pre-wrap">{error.message}</pre>
            </div>
          )}
        </div>

        {/* Stage viewer */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-white/6 bg-black/20 shrink-0">
            <div className="min-w-0 mr-auto">
              <div className="text-[12px] font-semibold text-white">
                <span className="font-mono text-zinc-500 mr-1.5">{stageIdx + 1}</span>
                {stageDef.title}
                {diffStats && (diffStats.add > 0 || diffStats.del > 0) && (
                  <span className="ml-2 font-mono text-[10.5px]">
                    <span className="text-emerald-400">+{diffStats.add}</span>{" "}
                    <span className="text-rose-400">−{diffStats.del}</span>
                    <span className="text-zinc-500"> vs {prevPass?.short}</span>
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-zinc-400">{stageDef.description}</div>
            </div>
            {diffAvailable && (
              <button
                type="button"
                onClick={() => setShowDiff((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10.5px] ${
                  showDiff ? "bg-emerald-500/15 border-emerald-400/35 text-emerald-200" : "bg-white/5 border-white/10 text-zinc-400"
                }`}
              >
                <GitCompare className="w-3 h-3" /> Diff
              </button>
            )}
            {stage !== "parsing" && stage !== "c" && Object.keys(result?.nameMap ?? {}).length > 0 && (
              <button
                type="button"
                onClick={() => setShowNames((v) => !v)}
                title="Show source names instead of vN"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10.5px] ${
                  showNames ? "bg-violet-500/15 border-violet-400/35 text-violet-200" : "bg-white/5 border-white/10 text-zinc-400"
                }`}
              >
                <Tags className="w-3 h-3" /> Names
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {!vmReady ? (
              <EmptyState
                icon={<Cpu className="w-6 h-6 text-zinc-500" />}
                title="Linux is not running"
                body="microML runs natively inside the Debian VM. Boot it from the Dock or Control Center, then compile."
              />
            ) : notInstalled ? (
              <EmptyState
                icon={<Download className="w-6 h-6 text-amber-400" />}
                title="microML is not installed in this VM"
                body="It ships in the pre-built Debian image. On another image, install it here: ocaml + dune + menhir, then a pinned build of coucou747/microML (~14 MB, Debian only)."
                action={
                  <button
                    type="button"
                    disabled={installing}
                    onClick={install}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-[12px] font-semibold disabled:opacity-60"
                  >
                    {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {installing ? "Installing…" : "Install microML"}
                  </button>
                }
                footer={
                  installing || micromlTool?.status === "error" ? (
                    <pre className="mt-3 max-h-32 overflow-auto text-left text-[10px] font-mono text-zinc-400 bg-black/40 rounded-lg p-2 w-full">
                      {micromlTool?.error ?? toolchain.logs.slice(-8).join("\n")}
                    </pre>
                  ) : null
                }
              />
            ) : vmError ? (
              <EmptyState icon={<X className="w-6 h-6 text-rose-400" />} title="Could not run microML" body={vmError} />
            ) : !result ? (
              <EmptyState
                icon={<Loader2 className="w-6 h-6 text-amber-400 animate-spin" />}
                title="Compiling…"
                body="Running every pass inside Linux."
              />
            ) : stage === "typer" ? (
              <TypesView result={result} showNames={showNames} />
            ) : stage === "c" ? (
              <CView result={result} />
            ) : stageText ? (
              diff ? (
                <pre className="m-0 py-2 font-mono text-[12px] leading-[1.6]">
                  {diff.map((d, i) => (
                    <div
                      key={i}
                      className={`flex px-3 ${
                        d.kind === "add" ? "bg-emerald-500/12" : d.kind === "del" ? "bg-rose-500/10 opacity-60" : ""
                      }`}
                    >
                      <span
                        className={`w-4 shrink-0 select-none ${
                          d.kind === "add" ? "text-emerald-400" : d.kind === "del" ? "text-rose-400" : "text-zinc-700"
                        }`}
                      >
                        {d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "}
                      </span>
                      <span
                        className={`whitespace-pre ${d.kind === "del" ? "line-through decoration-rose-400/50" : ""}`}
                        dangerouslySetInnerHTML={{ __html: highlight(d.text, lang, hlOpts) || " " }}
                      />
                    </div>
                  ))}
                </pre>
              ) : (
                <pre
                  className="m-0 p-3 font-mono text-[12px] leading-[1.6] whitespace-pre text-zinc-100"
                  dangerouslySetInnerHTML={{ __html: highlight(stageText, lang, hlOpts) }}
                />
              )
            ) : (
              <EmptyState
                icon={<AlertTriangle className="w-6 h-6 text-zinc-500" />}
                title={error ? "Not reached" : "No output"}
                body={error ? "Compilation stopped at an earlier pass." : "This pass printed nothing for this program."}
              />
            )}
          </div>
        </div>
      </div>

      {/* Run results */}
      {result?.installed && !error && (
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 p-2 border-t border-white/10 bg-black/35">
          <RunCard title="Interpreter" subtitle="microml --eval" run={evalRun} />
          <RunCard
            title="Native"
            subtitle={nativeRun ? `gcc -O0 · ${fmtBytes(nativeRun.sizeBytes)}` : "gcc -O0"}
            run={nativeRun}
          />
          <div
            className={`flex sm:flex-col items-center justify-center gap-1.5 px-4 py-2 rounded-xl border text-center ${
              agree === null
                ? "border-white/10 text-zinc-500"
                : agree
                  ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            {agree === null ? <Loader2 className="w-4 h-4" /> : agree ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <div className="text-[11px] font-semibold">{agree === null ? "—" : agree ? "Outputs agree" : "Divergence!"}</div>
            {typeCompared > 0 && (
              <div className="text-[10px] text-zinc-400">
                types vs OCaml {typeAgree}/{typeCompared}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ icon, title, body, action, footer }) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
    {icon}
    <div className="mt-2 text-[13px] font-semibold text-zinc-200">{title}</div>
    <div className="mt-1 max-w-md text-[11.5px] text-zinc-400 leading-relaxed">{body}</div>
    {action}
    {footer}
  </div>
);

const RunCard: React.FC<{ title: string; subtitle: string; run: MicromlRun | null }> = ({ title, subtitle, run }) => (
  <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-semibold text-white">{title}</span>
      <span className="text-zinc-500 font-mono truncate">{subtitle}</span>
      {run && (
        <span
          className={`ml-auto font-mono text-[10px] ${run.exitCode === 0 ? "text-emerald-400" : "text-rose-400"}`}
        >
          {run.timedOut ? "timeout" : `exit ${run.exitCode}`} · {run.ms} ms
        </span>
      )}
    </div>
    <pre className="mt-1 max-h-16 overflow-auto font-mono text-[12px] text-amber-100 whitespace-pre-wrap break-all">
      {run ? run.stdout || <span className="text-zinc-600">(no output)</span> : <span className="text-zinc-600">…</span>}
      {run?.stderr ? <span className="block text-rose-300 text-[11px]">{run.stderr}</span> : null}
    </pre>
  </div>
);

const TypesView: React.FC<{ result: MicromlExploreResult; showNames: boolean }> = ({ result, showNames }) => {
  const [raw, setRaw] = useState(false);
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[11px] text-zinc-400">
          {result.ocamlOk === false
            ? "OCaml rejects this program (microML accepts a few non-OCaml forms), so only microML's types are shown."
            : "Top-level bindings: microML's inferred type next to real OCaml's (ocamlc -i), α-renamed for comparison."}
        </div>
        <button
          type="button"
          onClick={() => setRaw((v) => !v)}
          className="ml-auto shrink-0 px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[10.5px] text-zinc-300"
        >
          {raw ? "Table" : "Raw dump"}
        </button>
      </div>
      {raw ? (
        <pre
          className="m-0 font-mono text-[12px] leading-[1.6] whitespace-pre"
          dangerouslySetInnerHTML={{
            __html: highlight(result.stages.typer ?? "", "ml", { nameMap: result.nameMap, showNames }),
          }}
        />
      ) : result.types.length === 0 ? (
        <div className="text-[11.5px] text-zinc-500">No top-level bindings were typed.</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Binding</th>
                <th className="text-left px-3 py-1.5 font-medium">microML</th>
                <th className="text-left px-3 py-1.5 font-medium">OCaml</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {result.types.map((t, i) => (
                <tr key={`${t.vname}-${i}`} className="border-t border-white/6 align-top">
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                    <span className="text-violet-200">{t.name ?? t.vname}</span>
                    {t.name && <span className="ml-1 text-[10px] text-zinc-600">{t.vname}</span>}
                  </td>
                  <td
                    className="px-3 py-1.5 font-mono"
                    dangerouslySetInnerHTML={{ __html: highlight(t.microml, "ml") }}
                  />
                  <td className="px-3 py-1.5 font-mono">
                    {t.ocaml ? (
                      <span dangerouslySetInnerHTML={{ __html: highlight(t.ocaml, "ml") }} />
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {t.agrees === true ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 inline" />
                    ) : t.agrees === false ? (
                      <span
                        title="microML and OCaml infer different types"
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[10px] font-semibold"
                      >
                        ≠
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.ocamlOk === false && result.ocamlOutput && (
        <details className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <summary className="text-[11px] text-zinc-400 cursor-pointer">What OCaml says</summary>
          <pre className="mt-1.5 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap">{result.ocamlOutput}</pre>
        </details>
      )}
    </div>
  );
};

const CView: React.FC<{ result: MicromlExploreResult }> = ({ result }) => (
  <div className="flex flex-col min-h-full">
    {result.compile && (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-white/6 ${
          result.compile.ok ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {result.compile.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        {result.compile.ok ? "Compiled & linked" : "C compilation failed"} in {result.compile.ms} ms
        {result.nativeRun && <span className="text-zinc-500">· {fmtBytes(result.nativeRun.sizeBytes)} aarch64 ELF</span>}
        <span className="ml-auto text-zinc-500">{(result.cSource ?? "").split("\n").length} lines of C</span>
      </div>
    )}
    {result.compile?.log && (
      <pre className="m-2 p-2 rounded-lg bg-rose-500/10 border border-rose-400/25 text-[11px] font-mono text-rose-100 whitespace-pre-wrap">
        {result.compile.log}
      </pre>
    )}
    {result.cSource ? (
      <pre
        className="m-0 p-3 font-mono text-[12px] leading-[1.6] whitespace-pre text-zinc-100"
        dangerouslySetInnerHTML={{ __html: highlight(result.cSource, "c") }}
      />
    ) : (
      <div className="p-6 text-center text-[11.5px] text-zinc-500">
        {result.error ? "Not reached: compilation stopped at an earlier pass." : "No C was generated."}
      </div>
    )}
  </div>
);
