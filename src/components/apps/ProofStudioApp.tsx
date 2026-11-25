import { Effect } from "effect";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCopy,
  Cpu,
  Download,
  ExternalLink,
  GitBranch,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListTree,
  Loader2,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  Sigma,
  SkipBack,
  Type,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MICROML_REPO_URL } from "../../core/microml.ts";
import {
  contextOf,
  declaredTypes,
  describeFormula,
  dischargedBy,
  explainError,
  globalFacts,
  nodeAtOffset,
  POULE_SYMBOLS,
  POULE_EXAMPLES,
  POULE_LEVELS,
  POULE_RULES,
  parseFormula,
  postOrder,
  prettyFormula,
  rangeToOffsets,
  ruleHelp,
  ruleName,
  ruleView,
  suggestSteps,
  toBussproofs,
  translateError,
  type DerivNode,
  type PouleLevel,
  type PouleResult,
  type PouleTheorem,
  type RuleFamily,
} from "../../core/poule.ts";
import { runPoule } from "../../core/poule-runner.ts";
import { appRuntime, useSubscriptionRef } from "../../core/runtime.ts";
import { ToolchainService, type ToolchainSnapshot } from "../../core/toolchain-service.ts";
import { VmService, type VmState } from "../../core/vm-service.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { CodeEditor, type CodeEditorHandle, type EditorMarker } from "./shared/CodeEditor.tsx";

const STORAGE_KEY = "unkernelos.poule.source.v1";
const GUIDE_KEY = "unkernelos.poule.guide.v1";
const WELCOME_KEY = "unkernelos.poule.welcome.v1";
const loadWelcome = (): boolean => {
  try {
    return window.localStorage.getItem(WELCOME_KEY) !== "seen";
  } catch {
    return true;
  }
};
const loadGuide = (): boolean => {
  try {
    return window.localStorage.getItem(GUIDE_KEY) !== "off";
  } catch {
    return true;
  }
};
const VM_PLACEHOLDER = { phase: "idle" } as VmState;
const TOOLCHAIN_PLACEHOLDER = { tools: {}, logs: [], busy: false } as unknown as ToolchainSnapshot;

const load = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const store = (src: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, src);
  } catch {
    // storage unavailable — editing still works
  }
};

const FAMILY_STYLE: Record<RuleFamily, { text: string; chip: string; bar: string }> = {
  intro: { text: "text-emerald-300", chip: "bg-emerald-500/15 border-emerald-400/35 text-emerald-200", bar: "bg-emerald-300/60" },
  elim: { text: "text-sky-300", chip: "bg-sky-500/15 border-sky-400/35 text-sky-200", bar: "bg-sky-300/60" },
  hyp: { text: "text-violet-300", chip: "bg-violet-500/15 border-violet-400/35 text-violet-200", bar: "bg-violet-300/60" },
};

type View = "tree" | "outline" | "rules";

export const ProofStudioApp: React.FC = () => {
  const [source, setSource] = useState<string>(() => load() ?? POULE_EXAMPLES[0]!.source);
  const [result, setResult] = useState<PouleResult | null>(null);
  const [checkedSource, setCheckedSource] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [vmError, setVmError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [unicode, setUnicode] = useState(true);
  const [view, setView] = useState<View>("tree");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  /** Explicitly selected node, tied to its theorem (node ids are per theorem). */
  const [selection, setSelection] = useState<{ label: string; id: number } | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [guide, setGuideState] = useState<boolean>(loadGuide);
  const [helpOpen, setHelpOpenState] = useState<boolean>(loadWelcome);
  const setHelpOpen = (open: boolean) => {
    setHelpOpenState(open);
    if (!open) {
      try {
        window.localStorage.setItem(WELCOME_KEY, "seen");
      } catch {
        // per-viewer preference only
      }
    }
  };
  const setGuide = (on: boolean) => {
    setGuideState(on);
    try {
      window.localStorage.setItem(GUIDE_KEY, on ? "on" : "off");
    } catch {
      // per-viewer preference only
    }
  };

  const vm = useSubscriptionRef(Effect.map(VmService, (v) => v.stateRef), VM_PLACEHOLDER);
  const toolchain = useSubscriptionRef(Effect.map(ToolchainService, (t) => t.stateRef), TOOLCHAIN_PLACEHOLDER);
  const tool = toolchain.tools?.microml;
  const installing = tool?.status === "installing";
  const vmReady = vm.phase === "running";
  const { pouleDraft } = useWm();

  const editorRef = useRef<CodeEditorHandle>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const runSeq = useRef(0);

  const fmt = useCallback((f: string) => (unicode ? prettyFormula(f) : f), [unicode]);

  const check = useCallback(async (src: string) => {
    const seq = ++runSeq.current;
    setRunning(true);
    setVmError(null);
    const res = await appRuntime.runPromise(Effect.either(runPoule(src)));
    if (seq !== runSeq.current) return;
    setRunning(false);
    if (res._tag === "Left") {
      const e = res.left as { _tag?: string; message?: string; stderr?: string };
      setVmError(e._tag === "KernelNotRunningError" ? "Linux n'est pas encore démarré — lance la machine virtuelle d'abord." : e.stderr || e.message || String(e._tag));
      return;
    }
    setResult(res.right);
    setCheckedSource(src);
  }, []);

  const updateSource = (next: string) => {
    setSource(next);
    store(next);
  };

  // Live checking (debounced)
  useEffect(() => {
    if (!live || !vmReady || source === checkedSource) return;
    const t = setTimeout(() => void check(source), 550);
    return () => clearTimeout(t);
  }, [source, live, vmReady, check, checkedSource]);

  // First check once Linux is up (also covers live = off)
  const firstRun = useRef(false);
  useEffect(() => {
    if (vmReady && !firstRun.current) {
      firstRun.current = true;
      void check(source);
    }
  }, [vmReady, check, source]);

  // Draft from a Notebook `poule` cell
  useEffect(() => {
    if (!pouleDraft) return;
    updateSource(pouleDraft.source);
    wmStore.clearPouleDraft(pouleDraft.id);
    if (vmReady) {
      firstRun.current = true;
      void check(pouleDraft.source);
    }
  }, [pouleDraft, vmReady, check]);

  // Re-check after installing / updating microML
  const prevTool = useRef(tool?.status);
  useEffect(() => {
    if (prevTool.current === "installing" && tool?.status === "installed") void check(source);
    prevTool.current = tool?.status;
  }, [tool?.status, check, source]);

  const stale = checkedSource !== source;
  const theorems = result?.theorems ?? [];
  const theorem: PouleTheorem | null =
    theorems.find((t) => t.label === selectedLabel) ?? theorems.find((t) => !t.ok) ?? theorems[0] ?? null;

  const nodes = useMemo(() => (theorem?.tree ? postOrder(theorem.tree) : []), [theorem]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const explicitNode = selection && theorem && selection.label === theorem.label ? (nodeById.get(selection.id) ?? null) : null;
  const selectedNode = explicitNode ?? theorem?.tree ?? null;
  const hoverNode = hoverNodeId !== null ? (nodeById.get(hoverNodeId) ?? null) : null;

  // a new theorem starts with the whole proof visible
  useEffect(() => {
    setReplayStep(null);
    setPlaying(false);
  }, [theorem?.label]);

  // Replay animation: reveal the derivation leaf → root, one inference at a time
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setReplayStep((s) => (s ?? -1) + 1), 420);
    return () => clearInterval(t);
  }, [playing]);
  useEffect(() => {
    if (playing && replayStep !== null && replayStep >= nodes.length - 1) {
      setPlaying(false);
      setReplayStep(null);
    }
  }, [playing, replayStep, nodes.length]);
  const visible = useMemo(
    () => (replayStep === null ? null : new Set(nodes.slice(0, replayStep + 1).map((n) => n.id))),
    [replayStep, nodes]
  );

  // ---- editor markers -------------------------------------------------------
  const markers = useMemo<EditorMarker[]>(() => {
    if (!result || stale) return [];
    const out: EditorMarker[] = [];
    for (const t of result.theorems) {
      if (!t.ok && t.errorLoc) {
        const [a, b] = rangeToOffsets(source, t.errorLoc);
        out.push({ start: a, end: b, kind: "error" });
      }
    }
    if (result.fatal?.loc) {
      const [a, b] = rangeToOffsets(source, result.fatal.loc);
      out.push({ start: a, end: b, kind: "error" });
    }
    const focus = hoverNode ?? (view !== "rules" ? explicitNode : null);
    if (focus?.loc) {
      const [a, b] = rangeToOffsets(source, focus.loc);
      out.push({ start: a, end: b, kind: "focus" });
    }
    return out;
  }, [result, stale, source, hoverNode, explicitNode, view]);
  const errorLines = useMemo(() => {
    if (!result || stale) return [];
    const ls = result.theorems.filter((t) => !t.ok && t.errorLoc).map((t) => t.errorLoc!.line);
    if (result.fatal?.loc) ls.push(result.fatal.loc.line);
    return ls;
  }, [result, stale]);

  // ---- cursor → goal sync ----------------------------------------------------
  const onCursor = useCallback(
    (offset: number) => {
      if (!result || stale) return;
      let best: { t: PouleTheorem; n: DerivNode } | null = null;
      for (const t of result.theorems) {
        if (!t.tree) continue;
        const n = nodeAtOffset(source, t.tree, offset);
        if (n) {
          best = { t, n };
          break;
        }
      }
      if (best) {
        setSelectedLabel(best.t.label);
        setSelection({ label: best.t.label, id: best.n.id });
      }
    },
    [result, stale, source]
  );

  const selectTheorem = (t: PouleTheorem) => {
    setSelectedLabel(t.label);
    setSelection(null);
    const loc = t.tree?.loc ?? t.errorLoc;
    if (loc && !stale) {
      const [a, b] = rangeToOffsets(source, loc);
      editorRef.current?.reveal(a, b);
    }
  };

  const selectNode = (n: DerivNode) => {
    if (theorem) setSelection({ label: theorem.label, id: n.id });
    if (n.loc && !stale) {
      const [a] = rangeToOffsets(source, n.loc);
      editorRef.current?.reveal(a);
    }
  };

  const loadExample = (id: string) => {
    const ex = POULE_EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    updateSource(ex.source);
    setSelectedLabel(null);
    setExamplesOpen(false);
    if (vmReady) void check(ex.source);
  };

  const install = () => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.installTool("microml")).pipe(Effect.ignore));
  };

  const fit = () => {
    const c = canvasRef.current;
    const t = treeRef.current;
    if (!c || !t) return;
    const natural = t.scrollWidth / zoom;
    setZoom(Math.max(0.35, Math.min(1.6, (c.clientWidth - 48) / Math.max(1, natural))));
  };

  const copyLatex = async () => {
    if (!theorem?.tree) return;
    try {
      await navigator.clipboard.writeText(toBussproofs(theorem.tree, theorem.label));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      wmStore.pushToast("Presse-papiers indisponible", "Impossible de copier le code LaTeX.", "error");
    }
  };

  // Expert keyboard navigation: ↓ toward the conclusion, ↑ to a premise, ←/→ siblings, [ / ] theorems
  const onTreeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "[" || e.key === "]") {
      const i = theorems.findIndex((t) => t.label === theorem?.label);
      const next = theorems[(i + (e.key === "]" ? 1 : -1) + theorems.length) % Math.max(1, theorems.length)];
      if (next) selectTheorem(next);
      e.preventDefault();
      return;
    }
    const cur = selectedNode;
    if (!cur || !theorem?.ok) return;
    let target: DerivNode | null | undefined = null;
    if (e.key === "ArrowDown") target = cur.parent;
    else if (e.key === "ArrowUp") target = cur.children[0];
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const sibs = cur.parent?.children ?? [];
      const i = sibs.indexOf(cur);
      target = sibs[i + (e.key === "ArrowRight" ? 1 : -1)];
    } else if (e.key === "Home") target = theorem.tree;
    if (target) {
      e.preventDefault();
      selectNode(target);
    }
  };

  const proved = theorems.filter((t) => t.ok).length;
  const rejected = theorems.length - proved;
  const types = useMemo(() => declaredTypes(source), [source]);
  const facts = useMemo(() => globalFacts(source), [source]);

  // ---- render ---------------------------------------------------------------
  return (
    <div className="flex flex-col w-full h-full bg-[#06070c] text-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10 bg-gradient-to-r from-violet-600/12 via-transparent to-emerald-500/10 shrink-0">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-violet-600/25 shrink-0">
            <Sigma className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight">Studio de preuves</div>
            <div className="text-[10.5px] text-zinc-400 truncate">
              Déduction naturelle avec Poule ·{" "}
              <button type="button" onClick={() => window.open(MICROML_REPO_URL, "_blank", "noopener")} className="text-violet-300 hover:underline">
                coucou747/microML
              </button>
              {result?.version ? <span className="font-mono"> · {result.version}</span> : null}
            </div>
          </div>
        </div>

        {result?.installed && !result.outdated && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
              result.fatal || rejected > 0
                ? "bg-rose-500/12 border-rose-400/35 text-rose-200"
                : "bg-emerald-500/12 border-emerald-400/35 text-emerald-200"
            }`}
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : result.fatal || rejected > 0 ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {result.fatal ? "Fichier refusé" : `${proved}/${theorems.length} prouvé${proved > 1 ? "s" : ""}`}
            {stale && !running && <span className="font-normal text-zinc-400">· modifié</span>}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setExamplesOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/6 border border-white/10 text-[11.5px] hover:bg-white/10"
          >
            <BookOpen className="w-3.5 h-3.5 text-zinc-400" /> Exemples <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          {examplesOpen && (
            <>
              <button type="button" aria-label="Fermer" onClick={() => setExamplesOpen(false)} className="fixed inset-0 z-20 cursor-default" />
              <div className="absolute right-0 top-full mt-1.5 w-80 max-h-[70vh] overflow-auto z-30 rounded-xl bg-[#10121b] border border-white/12 shadow-2xl p-1.5">
                {(Object.keys(POULE_LEVELS) as PouleLevel[]).map((lvl) => (
                  <div key={lvl} className="mb-1">
                    <div className="px-2.5 pt-1.5 pb-1 text-[9.5px] uppercase tracking-wider text-zinc-500">{POULE_LEVELS[lvl]}</div>
                    {POULE_EXAMPLES.filter((ex) => ex.level === lvl).map((ex) => (
                      <button key={ex.id} type="button" onClick={() => loadExample(ex.id)} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/8">
                        <div className="text-[12px] text-white">{ex.title}</div>
                        <div className="text-[10.5px] text-zinc-400">{ex.blurb}</div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <ToggleButton on={guide} onClick={() => setGuide(!guide)} icon={<GraduationCap className="w-3.5 h-3.5" />} label="Guide" title="Mode Guide : formules lues en français, suggestions d'étapes, erreurs expliquées" />
        <ToggleButton on={unicode} onClick={() => setUnicode((v) => !v)} icon={<Type className="w-3.5 h-3.5" />} label={unicode ? "∀∧→" : "ASCII"} title="Notation mathématique ou texte brut" />
        <ToggleButton on={live} onClick={() => setLive((v) => !v)} icon={<Radio className="w-3.5 h-3.5" />} label="Direct" title="Revérifier automatiquement pendant la frappe" />
        <IconBtn onClick={() => setHelpOpen(!helpOpen)} title="Comment ça marche ?"><HelpCircle className="w-4 h-4" /></IconBtn>
        <button
          type="button"
          disabled={running || !vmReady}
          onClick={() => void check(source)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-emerald-500 text-white text-[12px] font-semibold shadow-lg shadow-violet-600/25 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Vérifier
          <kbd className="hidden sm:inline ml-1 px-1 rounded bg-black/25 text-[10px] font-mono">⌘↵</kbd>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Editor */}
        <div className="lg:w-[40%] h-[40%] lg:h-auto min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/8">
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10.5px] text-zinc-500 border-b border-white/6 bg-black/20 shrink-0">
            <span className="font-mono">preuves.poule</span>
            <span className="ml-auto truncate">place le curseur dans une preuve pour voir son but</span>
          </div>
          <CodeEditor
            ref={editorRef}
            value={source}
            onChange={updateSource}
            lang="poule"
            onRun={() => void check(source)}
            onCursor={onCursor}
            markers={markers}
            errorLines={errorLines}
          />
          {result?.fatal && !stale && (
            <div className="shrink-0 m-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Le fichier ne peut pas être vérifié
                {result.fatal.loc && <span className="font-mono font-normal text-rose-300/80">ligne {result.fatal.loc.line}</span>}
              </div>
              <pre className="mt-1 text-[11px] font-mono text-rose-100/90 whitespace-pre-wrap">{translateError(result.fatal.message)}</pre>
              {guide && explainError(result.fatal.message) && (
                <div className="mt-1.5 flex gap-1.5 text-[11.5px] text-zinc-200 leading-relaxed">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                  {explainError(result.fatal.message)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Proof side */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}
          {/* theorem chips + view tabs */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/8 bg-black/25 shrink-0">
            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
              {theorems.map((t) => {
                const active = t.label === theorem?.label;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => selectTheorem(t)}
                    title={`${t.ok ? "Prouvé" : "Refusé"}${t.formula ? ` — ${readable(t.formula)}` : ""}`}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-mono shrink-0 transition ${
                      active
                        ? t.ok
                          ? "bg-emerald-500/18 border-emerald-400/50 text-emerald-100"
                          : "bg-rose-500/18 border-rose-400/50 text-rose-100"
                        : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/8"
                    }`}
                  >
                    {t.ok ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-rose-400" />}
                    {t.name ?? "check"}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center rounded-lg border border-white/10 overflow-hidden shrink-0">
              {(
                [
                  ["tree", <GitBranch key="t" className="w-3.5 h-3.5" />, "Arbre"],
                  ["outline", <ListTree key="o" className="w-3.5 h-3.5" />, "Plan"],
                  ["rules", <Sigma key="r" className="w-3.5 h-3.5" />, "Règles"],
                ] as const
              ).map(([id, icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] ${view === id ? "bg-white/12 text-white" : "text-zinc-400 hover:bg-white/6"}`}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
            {/* canvas */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div
                ref={canvasRef}
                tabIndex={0}
                onKeyDown={onTreeKey}
                className="flex-1 min-h-0 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px]">
                {!vmReady ? (
                  <Empty icon={<Cpu className="w-6 h-6 text-zinc-500" />} title="Linux n'est pas démarré" body="Poule tourne dans la machine virtuelle Debian. Démarre-la, et tes preuves seront vérifiées pendant que tu tapes." />
                ) : result && !result.installed ? (
                  <Empty
                    icon={<Download className="w-6 h-6 text-violet-300" />}
                    title="Poule n'est pas installé dans cette machine"
                    body="Il est fourni avec microML dans l'image Debian préinstallée. Tu peux l'installer ici (Debian uniquement)."
                    action={<InstallButton installing={installing} onClick={install} label="Installer microML + Poule" />}
                  />
                ) : result?.outdated ? (
                  <Empty
                    icon={<Download className="w-6 h-6 text-amber-300" />}
                    title="Ce Poule ne sait pas encore vérifier les preuves"
                    body="Le microML installé est antérieur au vérificateur de preuves. Mets-le à jour vers la version fournie avec unkernelOS."
                    action={<InstallButton installing={installing} onClick={install} label="Mettre à jour microML" />}
                  />
                ) : vmError ? (
                  <Empty icon={<X className="w-6 h-6 text-rose-400" />} title="Impossible de lancer Poule" body={vmError} />
                ) : !result ? (
                  <Empty icon={<Loader2 className="w-6 h-6 text-violet-300 animate-spin" />} title="Vérification…" body="Le vérificateur de preuves tourne dans Linux." />
                ) : view === "rules" ? (
                  <RulesPanel onInsert={(s) => editorRef.current?.insert(s)} />
                ) : !theorem ? (
                  <Empty icon={<Sigma className="w-6 h-6 text-zinc-500" />} title="Aucun théorème pour l'instant" body="Écris « theorem nom : formule = preuve » ou charge un exemple (menu Exemples)." />
                ) : !theorem.ok ? (
                  <RejectedCard
                    theorem={theorem}
                    guide={guide}
                    fmt={fmt}
                    statement={facts.find((f) => f.kind === "theorem" && f.name === theorem.name)?.statement ?? null}
                    onInsert={(snippet) => editorRef.current?.insert(snippet)}
                    onJump={() => {
                      if (theorem.errorLoc && !stale) {
                        const [a, b] = rangeToOffsets(source, theorem.errorLoc);
                        editorRef.current?.reveal(a, b);
                      }
                    }}
                  />
                ) : view === "outline" ? (
                  <div className="p-3">
                    <OutlineNode node={theorem.tree!} depth={0} fmt={fmt} selectedId={selectedNode?.id ?? null} onSelect={selectNode} onHover={setHoverNodeId} />
                  </div>
                ) : (
                  <div className="min-w-full w-max">
                  {guide && (
                    <div className="sticky left-0 max-w-[min(100%,720px)] mx-4 mt-3 rounded-xl border border-white/10 bg-[#0c0e16]/90 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Théorème {theorem.name ?? ""} — prouvé</div>
                      <div className="font-mono text-[13px] text-white">{fmt(theorem.formula ?? theorem.tree!.concl)}</div>
                      <div className="text-[11.5px] text-zinc-400 italic">{readable(theorem.formula ?? theorem.tree!.concl)}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-zinc-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> construire (introduction)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> utiliser (élimination)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" /> hypothèse [h]</span>
                        <span className="text-zinc-500">On lit de haut en bas : chaque trait est une étape, la conclusion est tout en bas. Clique une formule.</span>
                      </div>
                    </div>
                  )}
                  <div className="px-8 py-10 flex justify-center">
                    <div ref={treeRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} className="transition-transform">
                      <GentzenNode
                        node={theorem.tree!}
                        fmt={fmt}
                        selectedId={selectedNode?.id ?? null}
                        hoverId={hoverNodeId}
                        visible={visible}
                        onSelect={selectNode}
                        onHover={setHoverNodeId}
                      />
                    </div>
                  </div>
                  </div>
                )}
              </div>

              {theorem?.ok && view === "tree" && result?.installed && !result.outdated && (
                <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-t border-white/8 bg-black/35 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (playing) setPlaying(false);
                      else {
                        setReplayStep(-1);
                        setPlaying(true);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/18 border border-violet-400/35 text-violet-100"
                    title="Rejouer la preuve étape par étape"
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} Rejouer
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, nodes.length - 1)}
                    value={replayStep === null ? nodes.length - 1 : Math.max(0, replayStep)}
                    onChange={(e) => {
                      setPlaying(false);
                      const v = Number(e.target.value);
                      setReplayStep(v >= nodes.length - 1 ? null : v);
                    }}
                    className="w-28 sm:w-40 accent-violet-400"
                  />
                  <span className="font-mono text-zinc-500">
                    {replayStep === null ? nodes.length : Math.max(0, replayStep + 1)}/{nodes.length} étapes · profondeur {theorem.depth}
                  </span>
                  {replayStep !== null && (
                    <button type="button" onClick={() => { setPlaying(false); setReplayStep(null); }} className="p-1 rounded hover:bg-white/8" title="Montrer toute la preuve">
                      <SkipBack className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  )}
                  <span className="hidden 2xl:inline text-[10px] text-zinc-600">clic sur l'arbre puis ↑↓←→ · [ ] théorèmes</span>
                  <div className="ml-auto flex items-center gap-1">
                    <IconBtn onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(2)))} title="Dézoomer"><Minus className="w-3.5 h-3.5" /></IconBtn>
                    <span className="font-mono w-10 text-center text-zinc-400">{Math.round(zoom * 100)}%</span>
                    <IconBtn onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} title="Zoomer"><Plus className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn onClick={fit} title="Ajuster à la largeur"><Maximize2 className="w-3.5 h-3.5" /></IconBtn>
                    <button
                      type="button"
                      onClick={() => void copyLatex()}
                      className="ml-1 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/6 border border-white/10 hover:bg-white/10"
                      title="Copier en LaTeX (bussproofs)"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                      LaTeX
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* goal panel */}
            {theorem?.ok && view !== "rules" && selectedNode && (
              <GoalPanel
                node={selectedNode}
                guide={guide}
                theorem={theorem}
                fmt={fmt}
                types={types}
                facts={facts}
                theorems={theorems}
                onSelect={selectNode}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Natural-deduction tree
// ---------------------------------------------------------------------------

const GentzenNode: React.FC<{
  node: DerivNode;
  fmt: (f: string) => string;
  selectedId: number | null;
  hoverId: number | null;
  visible: Set<number> | null;
  onSelect: (n: DerivNode) => void;
  onHover: (id: number | null) => void;
}> = ({ node, fmt, selectedId, hoverId, visible, onSelect, onHover }) => {
  const rv = ruleView(node.rule);
  const style = FAMILY_STYLE[rv.family];
  const shown = visible === null || visible.has(node.id);
  const selected = node.id === selectedId;
  const hovered = node.id === hoverId;
  const discharged = dischargedBy(node);
  const label = `${rv.label}${rv.arg ? ` [${rv.arg}]` : ""}`;
  // keep room on the right for the rule label so siblings never overlap it
  const labelRoom = rv.family === "hyp" ? 0 : 12 + (label.length + (discharged.length ? discharged.join(",").length + 2 : 0)) * 6.2;

  const conclusion = (
    <button
      type="button"
      onClick={() => onSelect(node)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      title={ruleHelp(node.rule)}
      className={`relative px-2 py-0.5 rounded-md font-mono text-[12px] whitespace-nowrap transition ${
        selected
          ? "bg-amber-400/20 ring-1 ring-amber-300/70 text-amber-50"
          : hovered
            ? "bg-white/10 text-white"
            : rv.family === "hyp"
              ? "text-violet-100 hover:bg-white/6"
              : "text-zinc-100 hover:bg-white/6"
      } ${shown ? "" : "opacity-0"}`}
    >
      {rv.family === "hyp" ? (
        <>
          <span className="text-violet-400/80">[</span>
          {fmt(node.concl)}
          <span className="text-violet-400/80">]</span>
          <sup className="ml-0.5 text-[9.5px] text-violet-300 font-semibold">{rv.label}</sup>
        </>
      ) : (
        fmt(node.concl)
      )}
    </button>
  );

  if (rv.family === "hyp") {
    return <div className={`inline-flex flex-col items-center transition-opacity duration-300 ${shown ? "" : "opacity-20"}`}>{conclusion}</div>;
  }

  return (
    <div className="inline-flex flex-col items-center" style={{ marginRight: labelRoom }}>
      {node.children.length > 0 && (
        <div className="flex items-end gap-6">
          {node.children.map((c) => (
            <GentzenNode key={c.id} node={c} fmt={fmt} selectedId={selectedId} hoverId={hoverId} visible={visible} onSelect={onSelect} onHover={onHover} />
          ))}
        </div>
      )}
      <div className={`relative self-stretch flex items-center my-1 transition-opacity duration-300 ${shown ? "" : "opacity-0"}`}>
        <div className={`flex-1 h-[1.5px] rounded-full ${selected ? "bg-amber-300" : style.bar}`} />
        <span title={ruleHelp(node.rule)} className={`absolute left-full ml-1.5 whitespace-nowrap text-[10.5px] font-semibold cursor-help ${style.text}`}>
          {rv.label}
          {rv.arg && <span className="font-mono font-normal text-zinc-400"> [{rv.arg}]</span>}
          {discharged.length > 0 && <sup className="ml-0.5 text-[9px] text-violet-300">{discharged.join(",")}</sup>}
        </span>
      </div>
      <div className={`transition-opacity duration-300 ${shown ? "" : "opacity-20"}`}>{conclusion}</div>
    </div>
  );
};

const OutlineNode: React.FC<{
  node: DerivNode;
  depth: number;
  fmt: (f: string) => string;
  selectedId: number | null;
  onSelect: (n: DerivNode) => void;
  onHover: (id: number | null) => void;
}> = ({ node, depth, fmt, selectedId, onSelect, onHover }) => {
  const rv = ruleView(node.rule);
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        style={{ paddingLeft: depth * 18 + 6 }}
        className={`w-full flex items-center gap-2 pr-2 py-1 rounded-md text-left border-l ${
          node.id === selectedId ? "bg-amber-400/15 border-amber-300/60" : "border-transparent hover:bg-white/5"
        }`}
      >
        <span className={`shrink-0 min-w-[2.6rem] text-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${FAMILY_STYLE[rv.family].chip}`}>
          {rv.label}
        </span>
        <span className="font-mono text-[12px] text-zinc-100 truncate">{fmt(node.concl)}</span>
        {rv.arg && <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">[{rv.arg}]</span>}
        {node.intro.map((i) => (
          <span key={i} className="shrink-0 px-1.5 py-0.5 rounded bg-violet-500/12 text-violet-200 text-[10px] font-mono">
            +{i.split(" : ")[0]}
          </span>
        ))}
      </button>
      {node.children.map((c) => (
        <OutlineNode key={c.id} node={c} depth={depth + 1} fmt={fmt} selectedId={selectedId} onSelect={onSelect} onHover={onHover} />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Goal panel (context ⊢ goal)
// ---------------------------------------------------------------------------

const GoalPanel: React.FC<{
  node: DerivNode;
  guide: boolean;
  theorem: PouleTheorem;
  fmt: (f: string) => string;
  types: Set<string>;
  facts: ReturnType<typeof globalFacts>;
  theorems: readonly PouleTheorem[];
  onSelect: (n: DerivNode) => void;
}> = ({ node, guide, theorem, fmt, types, facts, theorems, onSelect }) => {
  const { vars, hyps } = contextOf(node, types);
  const rv = ruleView(node.rule);
  const [showGlobals, setShowGlobals] = useState(false);
  // axioms and theorems proved before this one
  const idx = facts.findIndex((f) => f.kind === "theorem" && f.name === theorem.name);
  const proved = new Set(theorems.filter((t) => t.ok && t.name).map((t) => t.name!));
  const globals = (idx < 0 ? facts : facts.slice(0, idx)).filter((f) => f.kind === "axiom" || proved.has(f.name));
  const split = (s: string) => [s.slice(0, s.indexOf(" : ")), s.slice(s.indexOf(" : ") + 3)] as const;

  return (
    <div className="xl:w-[320px] h-60 xl:h-auto shrink-0 border-t xl:border-t-0 xl:border-l border-white/8 bg-[#090b12] overflow-auto">
      <div className="px-3 py-2 border-b border-white/6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Étape sélectionnée</span>
          <span className={`ml-auto px-1.5 py-0.5 rounded border text-[10px] font-semibold ${FAMILY_STYLE[rv.family].chip}`}>
            {rv.label}
            {rv.arg ? ` [${rv.arg}]` : ""}
          </span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-zinc-300">{ruleName(node.rule)}</div>
      </div>

      <Section title="Ce que tu sais">
        {vars.length === 0 && hyps.length === 0 && <div className="text-zinc-600 text-[11px]">Aucune hypothèse locale ici.</div>}
        {vars.map((v) => {
          const [n, t] = split(v);
          return (
            <div key={v} className="flex gap-2 font-mono text-[12px]" title={`${n} est un objet quelconque de type ${t}`}>
              <span className="text-cyan-300">{n}</span>
              <span className="text-zinc-500">:</span>
              <span className="text-cyan-100/80">{t}</span>
              {guide && <span className="ml-auto font-sans text-[10px] text-zinc-600">objet</span>}
            </div>
          );
        })}
        {hyps.map((h) => {
          const [n, f] = split(h);
          return (
            <div key={h} className="flex gap-2 font-mono text-[12px]" title={readable(f)}>
              <span className="text-violet-300 shrink-0">{n}</span>
              <span className="text-zinc-500">:</span>
              <span className="text-zinc-100 break-words min-w-0">{fmt(f)}</span>
              {guide && <span className="ml-auto font-sans text-[10px] text-zinc-600 shrink-0">supposé</span>}
            </div>
          );
        })}
        {globals.length > 0 && (
          <button type="button" onClick={() => setShowGlobals((v) => !v)} className="text-[10.5px] text-zinc-500 hover:text-zinc-300">
            {showGlobals ? "▾" : "▸"} {globals.length} axiome{globals.length > 1 ? "s" : ""} et théorème{globals.length > 1 ? "s" : ""} disponible{globals.length > 1 ? "s" : ""}
          </button>
        )}
        {showGlobals &&
          globals.map((g) => (
            <div key={g.name} className="flex gap-2 opacity-85 font-mono text-[11.5px]" title={readable(g.statement)}>
              <span className={g.kind === "axiom" ? "text-amber-300 shrink-0" : "text-emerald-300 shrink-0"}>{g.name}</span>
              <span className="text-zinc-500">:</span>
              <span className="text-zinc-300 break-words min-w-0">{fmt(g.statement)}</span>
            </div>
          ))}
      </Section>

      <div className="mx-3 h-px bg-gradient-to-r from-violet-400/60 via-white/25 to-transparent" />
      <Section title="À prouver à cette étape">
        <div className="flex gap-2 font-mono text-[13px]">
          <span className="text-violet-300">⊢</span>
          <span className="text-white break-words min-w-0">{fmt(node.concl)}</span>
        </div>
        {guide && readable(node.concl) && <div className="text-[11.5px] text-zinc-400 italic leading-relaxed">« {readable(node.concl)} »</div>}
      </Section>

      {guide && (
        <div className="mx-3 mb-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11.5px] text-zinc-300 leading-relaxed">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-200/80 mb-0.5">
            <GraduationCap className="w-3.5 h-3.5" /> Comment c'est justifié
          </div>
          {ruleHelp(node.rule)}
        </div>
      )}

      {node.children.length > 0 && (
        <Section title="Obtenu à partir de">
          {node.children.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c)} title={ruleName(c.rule)} className="w-full text-left flex items-center gap-2 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/8">
              <span className={`text-[10px] font-semibold shrink-0 ${FAMILY_STYLE[ruleView(c.rule).family].text}`}>{ruleView(c.rule).label}</span>
              <span className="font-mono text-[11.5px] text-zinc-200 truncate">{fmt(c.concl)}</span>
            </button>
          ))}
        </Section>
      )}
      {node.parent && (
        <div className="px-3 pb-3">
          <button type="button" onClick={() => onSelect(node.parent!)} className="text-[11px] text-zinc-400 hover:text-white">
            ↓ sert ensuite à : {ruleName(node.parent.rule)}
          </button>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="px-3 py-2 space-y-1.5">
    <div className="text-[10px] uppercase tracking-wider text-zinc-500">{title}</div>
    {children}
  </div>
);

const readable = (f: string) => {
  const ast = parseFormula(f);
  return ast ? describeFormula(ast) : "";
};

const HelpCard: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="shrink-0 m-2 rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.08] to-emerald-500/[0.05] p-3">
    <div className="flex items-start gap-2">
      <HelpCircle className="w-4 h-4 text-violet-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white">Comment ça marche ?</div>
        <ol className="mt-1.5 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11.5px] text-zinc-300 leading-relaxed">
          <li className="rounded-xl bg-black/25 px-2.5 py-2">
            <span className="text-violet-300 font-semibold">1. Énonce.</span> À gauche, écris ce que tu veux prouver :{" "}
            <code className="font-mono text-emerald-200">theorem nom : formule = preuve</code>
          </li>
          <li className="rounded-xl bg-black/25 px-2.5 py-2">
            <span className="text-violet-300 font-semibold">2. Prouve.</span> Une preuve se construit avec des règles (onglet Règles).
            Le mode <b>Guide</b> propose la prochaine étape.
          </li>
          <li className="rounded-xl bg-black/25 px-2.5 py-2">
            <span className="text-violet-300 font-semibold">3. Vérifie.</span> Le vérificateur répond aussitôt : ✓ prouvé, ou ✗ avec l'erreur
            soulignée et expliquée. L'arbre montre chaque étape.
          </li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {POULE_SYMBOLS.map((sy) => (
            <span key={sy.sym} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/25 border border-white/8 text-[11px]" title={`s'écrit ${sy.ascii}`}>
              <span className="font-mono text-[13px] text-white">{sy.sym}</span>
              <span className="text-zinc-400">{sy.reading}</span>
              <code className="font-mono text-[10px] text-zinc-500">{sy.ascii}</code>
            </span>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-zinc-500">
          Pas d'idée ? Ouvre <b className="text-zinc-300">Exemples → Pour commencer</b>. Experts : désactive le Guide pour un affichage compact.
        </div>
      </div>
      <button type="button" onClick={onClose} title="Fermer" className="p-1 rounded-md hover:bg-white/8 text-zinc-400">
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Rules palette
// ---------------------------------------------------------------------------

const RulesPanel: React.FC<{ onInsert: (snippet: string) => void }> = ({ onInsert }) => (
  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2">
    {POULE_RULES.map((r) => (
      <div key={r.rule} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold text-violet-200 w-9">{r.rule}</span>
          <span className="text-[12px] text-white">{r.name}</span>
          <button
            type="button"
            onClick={() => onInsert(r.snippet)}
            className="ml-auto px-2 py-0.5 rounded-md bg-violet-500/18 border border-violet-400/35 text-[10.5px] text-violet-100 hover:bg-violet-500/28"
          >
            Insérer
          </button>
        </div>
        <code className="text-[11.5px] font-mono text-emerald-200 bg-black/30 rounded-md px-2 py-1 whitespace-pre-wrap">{r.syntax}</code>
        <div className="text-[11px] text-zinc-400">
          prouve <span className="font-mono text-zinc-200">{r.proves}</span> · à partir de <span className="text-zinc-300">{r.from}</span>
        </div>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const RejectedCard: React.FC<{
  theorem: PouleTheorem;
  guide: boolean;
  fmt: (f: string) => string;
  statement: string | null;
  onInsert: (snippet: string) => void;
  onJump: () => void;
}> = ({ theorem, guide, fmt, statement, onInsert, onJump }) => {
  const hint = guide ? explainError(theorem.message ?? "") : "";
  const goal = statement && parseFormula(statement) ? statement : null;
  const steps = guide && goal ? suggestSteps(goal, []) : [];
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-3">
        <div className="rounded-2xl border border-rose-400/35 bg-rose-500/[0.07] p-4 shadow-xl">
          <div className="flex items-center gap-2 text-rose-200 text-[13px] font-semibold">
            <X className="w-4 h-4" /> {theorem.name ? `Le théorème « ${theorem.name} » est refusé` : "Ce check est refusé"}
          </div>
          <pre className="mt-2 text-[12px] font-mono text-rose-50/90 whitespace-pre-wrap leading-relaxed">{translateError(theorem.message ?? "")}</pre>
          {hint && (
            <div className="mt-3 flex gap-2 rounded-xl bg-black/25 border border-white/8 px-3 py-2 text-[12px] text-zinc-200 leading-relaxed">
              <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>
                <b className="text-amber-200">Pourquoi ? </b>
                {hint}
              </span>
            </div>
          )}
          {theorem.errorLoc && (
            <button type="button" onClick={onJump} className="mt-3 flex items-center gap-1.5 text-[11.5px] text-rose-200 hover:text-white">
              <ExternalLink className="w-3.5 h-3.5" /> Aller à la ligne {theorem.errorLoc.line}, colonne {theorem.errorLoc.col}
            </button>
          )}
          {translateError(theorem.message ?? "") !== theorem.message && (
            <details className="mt-2 text-[10.5px] text-zinc-500">
              <summary className="cursor-pointer">Message original du vérificateur</summary>
              <pre className="mt-1 font-mono whitespace-pre-wrap">{theorem.message}</pre>
            </details>
          )}
        </div>
        {guide && goal && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">L'énoncé à prouver</div>
            <div className="mt-1 font-mono text-[13px] text-white">{fmt(goal)}</div>
            <div className="mt-1 text-[12px] text-zinc-400 italic">{describeFormula(parseFormula(goal)!)}</div>
            {steps.length > 0 && (
              <>
                <div className="mt-3 text-[10px] uppercase tracking-wider text-zinc-500">Par où commencer</div>
                <Suggestions steps={steps} onInsert={onInsert} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Suggestions: React.FC<{ steps: ReturnType<typeof suggestSteps>; onInsert?: (s: string) => void }> = ({ steps, onInsert }) => (
  <div className="mt-1.5 space-y-1.5">
    {steps.map((st, i) => (
      <div key={i} className="flex items-start gap-2 text-[11.5px] text-zinc-300">
        <span className="shrink-0 px-1.5 py-0.5 rounded border border-emerald-400/35 bg-emerald-500/12 text-emerald-200 text-[10px] font-semibold">{st.rule}</span>
        <span className="flex-1 leading-relaxed">
          {st.text}
          {st.snippet && <code className="ml-1 px-1 rounded bg-black/35 text-emerald-200 font-mono text-[11px] whitespace-pre-wrap">{st.snippet}</code>}
        </span>
        {st.snippet && onInsert && (
          <button
            type="button"
            onClick={() => onInsert(st.snippet!)}
            className="shrink-0 px-1.5 py-0.5 rounded-md bg-violet-500/18 border border-violet-400/35 text-[10px] text-violet-100 hover:bg-violet-500/28"
          >
            Insérer
          </button>
        )}
      </div>
    ))}
  </div>
);

const Empty: React.FC<{ icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }> = ({ icon, title, body, action }) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
    {icon}
    <div className="mt-2 text-[13px] font-semibold text-zinc-200">{title}</div>
    <div className="mt-1 max-w-md text-[11.5px] text-zinc-400 leading-relaxed">{body}</div>
    {action}
  </div>
);

const InstallButton: React.FC<{ installing: boolean; onClick: () => void; label: string }> = ({ installing, onClick, label }) => (
  <button
    type="button"
    disabled={installing}
    onClick={onClick}
    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 text-white text-[12px] font-semibold disabled:opacity-60"
  >
    {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
    {installing ? "Installation…" : label}
  </button>
);

const ToggleButton: React.FC<{ on: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }> = ({ on, onClick, icon, label, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] ${
      on ? "bg-violet-500/15 border-violet-400/35 text-violet-100" : "bg-white/5 border-white/10 text-zinc-400"
    }`}
  >
    {icon}
    {label}
  </button>
);

const IconBtn: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button type="button" onClick={onClick} title={title} className="p-1 rounded-md hover:bg-white/8 text-zinc-300">
    {children}
  </button>
);
