import { Effect } from "effect";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
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
  Move,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  Radio,
  Save,
  ScrollText,
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
import { appRuntime, GuestFsService, useSubscriptionRef } from "../../core/runtime.ts";
import { ToolchainService, type ToolchainSnapshot } from "../../core/toolchain-service.ts";
import { useViewport } from "../../core/use-viewport.ts";
import { VmService, type VmState } from "../../core/vm-service.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { StoryView } from "./proof/StoryView.tsx";
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

const FAMILY_STYLE: Record<RuleFamily, { text: string; chip: string; bar: string; glow: string }> = {
  intro: {
    text: "text-emerald-300",
    chip: "bg-emerald-500/15 border-emerald-400/35 text-emerald-200",
    bar: "bg-gradient-to-r from-emerald-400/40 via-emerald-300/85 to-emerald-400/40",
    glow: "border-emerald-400/20",
  },
  elim: {
    text: "text-sky-300",
    chip: "bg-sky-500/15 border-sky-400/35 text-sky-200",
    bar: "bg-gradient-to-r from-sky-400/40 via-sky-300/85 to-sky-400/40",
    glow: "border-sky-400/20",
  },
  hyp: {
    text: "text-violet-300",
    chip: "bg-violet-500/15 border-violet-400/35 text-violet-200",
    bar: "bg-gradient-to-r from-violet-400/40 via-violet-300/85 to-violet-400/40",
    glow: "border-violet-400/25",
  },
};

const QUICK_SYMBOLS: readonly { label: string; insert: string; title: string }[] = [
  { label: "∀", insert: "forall x : T, ", title: "Pour tout (forall)" },
  { label: "∃", insert: "exists x : T, ", title: "Il existe (exists)" },
  { label: "→", insert: " -> ", title: "Implique (->)" },
  { label: "∧", insert: " /\\ ", title: "Et (/\\)" },
  { label: "∨", insert: " \\/ ", title: "Ou (\\/)" },
  { label: "¬", insert: "~", title: "Non (~)" },
  { label: "⊥", insert: "Bot", title: "Absurde (Bot)" },
  { label: "(*@…*)", insert: "(*@ nom(x) : lecture usuelle — définition rigoureuse *)\n", title: "Ajouter un mot au vocabulaire du récit" },
];

/** Colorize logical connectives & quantifiers inside a formula string for instant legibility. */
const FormulaText: React.FC<{ text: string; className?: string }> = ({ text, className = "" }) => {
  const tokens = useMemo(() => {
    const out: { text: string; cls: string }[] = [];
    const re =
      /(∀|∃|→|↔|∧|∨|¬|⊥|<->|->|\/\\|\\\/|\b(?:forall|exists|Bot|False)\b|[(),.:~]|[A-Z][A-Za-z0-9_']*|[a-z_][A-Za-z0-9_']*|\s+|.)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const tok = m[0]!;
      let cls = "text-zinc-100";
      if (tok === "∀" || tok === "∃" || tok === "forall" || tok === "exists") {
        cls = "text-violet-300 font-semibold";
      } else if (tok === "→" || tok === "↔" || tok === "->" || tok === "<->") {
        cls = "text-cyan-300";
      } else if (tok === "∧" || tok === "∨" || tok === "/\\" || tok === "\\/") {
        cls = "text-emerald-300";
      } else if (tok === "¬" || tok === "⊥" || tok === "~" || tok === "Bot" || tok === "False") {
        cls = "text-rose-300 font-semibold";
      } else if (/^[(),.:]$/.test(tok)) {
        cls = "text-zinc-500";
      } else if (/^[A-Z]/.test(tok)) {
        cls = "text-amber-100";
      }
      out.push({ text: tok, cls });
    }
    return out;
  }, [text]);

  return (
    <span className={className}>
      {tokens.map((t, i) => (
        <span key={i} className={t.cls}>
          {t.text}
        </span>
      ))}
    </span>
  );
};

type View = "tree" | "story" | "outline" | "rules";

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

  // Resizable & collapsible panels + mobile/tablet focused mode
  const { isMobile, isTouch } = useViewport();
  const [mobilePane, setMobilePane] = useState<"proof" | "code" | "step">("proof");
  const [showEditor, setShowEditor] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [editorRatio, setEditorRatio] = useState(37); // percent width on desktop
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

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
  const { pouleDraft, activeWorkspaceDir } = useWm();

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const runSeq = useRef(0);

  const fmt = useCallback((f: string) => (unicode ? prettyFormula(f) : f), [unicode]);

  const activeExample = useMemo(
    () => POULE_EXAMPLES.find((ex) => ex.source.trim() === source.trim()) ?? null,
    [source]
  );

  // Draggable split pane handler
  useEffect(() => {
    if (!isDraggingSplit) return;
    const onMove = (e: PointerEvent) => {
      const box = splitContainerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const pct = ((e.clientX - box.left) / box.width) * 100;
      setEditorRatio(Math.max(22, Math.min(60, pct)));
    };
    const onUp = () => setIsDraggingSplit(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isDraggingSplit]);

  const check = useCallback(async (src: string) => {
    const seq = ++runSeq.current;
    setRunning(true);
    setVmError(null);
    const res = await appRuntime.runPromise(Effect.either(runPoule(src)));
    if (seq !== runSeq.current) return;
    setRunning(false);
    if (res._tag === "Left") {
      const e = res.left as { _tag?: string; message?: string; stderr?: string };
      setVmError(
        e._tag === "KernelNotRunningError"
          ? "Linux n'est pas encore démarré — lance la machine virtuelle d'abord."
          : e.stderr || e.message || String(e._tag)
      );
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
  const explicitNode =
    selection && theorem && selection.label === theorem.label ? (nodeById.get(selection.id) ?? null) : null;
  const selectedNode = explicitNode ?? theorem?.tree ?? null;
  const hoverNode = hoverNodeId !== null ? (nodeById.get(hoverNodeId) ?? null) : null;

  // a new theorem starts with the whole proof visible & auto-fits if wider than viewport
  useEffect(() => {
    setReplayStep(null);
    setPlaying(false);
    setZoom(1);
    const raf = requestAnimationFrame(() => {
      const c = canvasRef.current;
      const t = treeRef.current;
      if (!c || !t) return;
      const avail = c.clientWidth - 64;
      if (t.scrollWidth > avail && avail > 200) {
        setZoom(Math.max(0.45, Math.min(1, +(avail / t.scrollWidth).toFixed(2))));
      }
      c.scrollLeft = Math.max(0, (c.scrollWidth - c.clientWidth) / 2);
    });
    return () => cancelAnimationFrame(raf);
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

  const saveToWorkspace = async () => {
    const dir = activeWorkspaceDir || "/home/user/workspace";
    const defaultName = `${activeExample?.id || "preuves"}.poule`;
    const chosen = window.prompt(`Sauvegarder dans ${dir} :`, defaultName);
    if (!chosen?.trim()) return;
    const full = chosen.startsWith("/") ? chosen.trim() : `${dir}/${chosen.trim()}`.replace(/\/+/g, "/");
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.writeFileText(full, source)))
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Preuve sauvegardée", full, "success");
    } else {
      wmStore.pushToast("Échec de sauvegarde", res.left.message, "error");
    }
  };

  const install = () => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.installTool("microml")).pipe(Effect.ignore));
  };

  const fit = () => {
    const c = canvasRef.current;
    const t = treeRef.current;
    if (!c || !t) return;
    const natural = t.scrollWidth / zoom;
    const next = Math.max(0.35, Math.min(1.5, +((c.clientWidth - 64) / Math.max(1, natural)).toFixed(2)));
    setZoom(next);
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

  // Click-and-drag panning on the Gentzen tree canvas
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (view !== "tree" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, a, select")) return;
    const c = canvasRef.current;
    if (!c) return;
    panStateRef.current = { x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop };
    setIsPanning(true);
  };

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      const p = panStateRef.current;
      const c = canvasRef.current;
      if (!p || !c) return;
      c.scrollLeft = p.left - (e.clientX - p.x);
      c.scrollTop = p.top - (e.clientY - p.y);
    };
    const onUp = () => {
      panStateRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanning]);

  const onCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (view === "tree" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setZoom((z) => Math.max(0.35, Math.min(1.6, +(z - e.deltaY * 0.0015).toFixed(2))));
    }
  };

  // iPad & Mobile 1-finger pan + 2-finger pinch-to-zoom on Gentzen proof tree!
  const onCanvasTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (view !== "tree" || !theorem?.ok) return;
    if (e.touches.length === 2) {
      const a = e.touches[0]!;
      const b = e.touches[1]!;
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startZoom: zoom,
      };
      touchPanRef.current = null;
      return;
    }
    if (e.touches.length === 1 && !(e.target as HTMLElement).closest("button, input, a, select")) {
      const c = canvasRef.current;
      const t = e.touches[0]!;
      if (c) {
        touchPanRef.current = { x: t.clientX, y: t.clientY, left: c.scrollLeft, top: c.scrollTop };
      }
    }
  };

  const onCanvasTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (view !== "tree" || !theorem?.ok) return;
    if (e.touches.length === 2 && pinchRef.current) {
      const a = e.touches[0]!;
      const b = e.touches[1]!;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchRef.current.dist > 10) {
        const next = pinchRef.current.startZoom * (dist / pinchRef.current.dist);
        setZoom(Math.max(0.35, Math.min(1.8, +next.toFixed(2))));
      }
      return;
    }
    if (e.touches.length === 1 && touchPanRef.current && canvasRef.current) {
      const t = e.touches[0]!;
      canvasRef.current.scrollLeft = touchPanRef.current.left - (t.clientX - touchPanRef.current.x);
      canvasRef.current.scrollTop = touchPanRef.current.top - (t.clientY - touchPanRef.current.y);
    }
  };

  const onCanvasTouchEnd = () => {
    pinchRef.current = null;
    touchPanRef.current = null;
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
  const inspectorEligible = Boolean(theorem?.ok && view !== "rules" && view !== "story" && selectedNode);

  // ---- render ---------------------------------------------------------------
  return (
    <div className="flex flex-col w-full h-full bg-[#06070d] text-zinc-200 overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10 bg-gradient-to-r from-violet-600/14 via-[#0a0c15] to-emerald-500/10 shrink-0">
        <div className="flex items-center gap-2.5 mr-auto min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-violet-600/25 shrink-0">
            <Sigma className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-white leading-tight">Studio de preuves</span>
              {result?.installed && !result.outdated && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${
                    result.fatal || rejected > 0
                      ? "bg-rose-500/14 border-rose-400/35 text-rose-200"
                      : "bg-emerald-500/14 border-emerald-400/35 text-emerald-200"
                  }`}
                >
                  {running ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : result.fatal || rejected > 0 ? (
                    <X className="w-3 h-3" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  {result.fatal ? "Refusé" : `${proved}/${theorems.length} prouvé${proved > 1 ? "s" : ""}`}
                  {stale && !running && <span className="font-normal text-zinc-400">· modifié</span>}
                </span>
              )}
            </div>
            <div className="text-[10.5px] text-zinc-400 truncate">
              Déduction naturelle · Poule (
              <button
                type="button"
                onClick={() => window.open(MICROML_REPO_URL, "_blank", "noopener")}
                className="text-violet-300 hover:underline"
              >
                coucou747/microML
              </button>
              {result?.version ? <span className="font-mono"> · {result.version}</span> : null})
            </div>
          </div>
        </div>

        {/* Examples dropdown showing active example name */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setExamplesOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/12 text-[11.5px] text-zinc-100 hover:bg-white/12 transition max-w-[200px]"
          >
            <BookOpen className="w-3.5 h-3.5 text-violet-300 shrink-0" />
            <span className="truncate">{activeExample ? activeExample.title : "Exemples"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>
          {examplesOpen && (
            <>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setExamplesOpen(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="absolute right-0 top-full mt-1.5 w-84 max-h-[70vh] overflow-auto z-30 rounded-2xl bg-[#0f111c]/98 backdrop-blur-xl border border-white/14 shadow-2xl p-2 space-y-2">
                {(Object.keys(POULE_LEVELS) as PouleLevel[]).map((lvl) => (
                  <div key={lvl} className="space-y-0.5">
                    <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-violet-300/75">
                      {POULE_LEVELS[lvl]}
                    </div>
                    {POULE_EXAMPLES.filter((ex) => ex.level === lvl).map((ex) => {
                      const isCur = activeExample?.id === ex.id;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => loadExample(ex.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl transition ${
                            isCur
                              ? "bg-violet-500/20 border border-violet-400/35"
                              : "hover:bg-white/8 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-white">
                            <span>{ex.title}</span>
                            {isCur && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          </div>
                          <div className="text-[10.5px] text-zinc-400 leading-snug">{ex.blurb}</div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Grouped toggles */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/10">
          <ToggleButton
            on={guide}
            onClick={() => setGuide(!guide)}
            icon={<GraduationCap className="w-3.5 h-3.5" />}
            label="Guide"
            title="Mode Guide : formules lues en français, suggestions d'étapes, erreurs expliquées"
          />
          <ToggleButton
            on={unicode}
            onClick={() => setUnicode((v) => !v)}
            icon={<Type className="w-3.5 h-3.5" />}
            label={unicode ? "∀∧→" : "ASCII"}
            title="Notation mathématique Unicode ou ASCII"
          />
          <ToggleButton
            on={live}
            onClick={() => setLive((v) => !v)}
            icon={<Radio className="w-3.5 h-3.5" />}
            label="Direct"
            title="Revérifier automatiquement pendant la frappe"
          />
        </div>

        {/* Panel layout toggles */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/10">
          <IconBtn
            active={showEditor}
            onClick={() => setShowEditor((v) => !v)}
            title={showEditor ? "Masquer l'éditeur (plein écran preuve)" : "Afficher l'éditeur"}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn
            active={showInspector && inspectorEligible}
            onClick={() => setShowInspector((v) => !v)}
            title={showInspector ? "Masquer le panneau d'étape" : "Afficher le panneau d'étape"}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn active={helpOpen} onClick={() => setHelpOpen(!helpOpen)} title="Comment ça marche ?">
            <HelpCircle className="w-3.5 h-3.5" />
          </IconBtn>
        </div>

        <button
          type="button"
          disabled={running || !vmReady}
          onClick={() => void check(source)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-emerald-500 text-white text-[12px] font-semibold shadow-lg shadow-violet-600/25 hover:brightness-110 disabled:opacity-50 transition"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Vérifier
          <kbd className="hidden sm:inline ml-0.5 px-1 rounded bg-black/25 text-[10px] font-mono">⌘↵</kbd>
        </button>
      </div>

      {/* Mobile Pane Switcher (100% full-height Code / Preuve / Étape on phones) */}
      {isMobile && (
        <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-white/10 bg-black/40 shrink-0">
          {(
            [
              ["proof", "Preuve"],
              ["code", "Code"],
              ...(inspectorEligible ? ([["step", "Étape"]] as const) : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobilePane(id)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                mobilePane === id
                  ? "bg-gradient-to-r from-violet-500/30 to-emerald-500/25 border border-violet-400/40 text-white"
                  : "bg-white/[0.04] border border-white/8 text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Main Split Workspace */}
      <div ref={splitContainerRef} className="flex-1 min-h-0 flex flex-col lg:flex-row relative">
        {/* Left: Code Editor */}
        {((isMobile && mobilePane === "code") || (!isMobile && showEditor)) && (
          <div
            style={isMobile ? undefined : { flexBasis: `${editorRatio}%` }}
            className={`${
              isMobile ? "flex-1" : "lg:shrink-0 h-[38%] lg:h-auto"
            } min-h-0 flex flex-col border-b lg:border-b-0 border-white/8 bg-[#070910]`}
          >
            {/* File subheader */}
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10.5px] text-zinc-400 border-b border-white/8 bg-black/30 shrink-0">
              <span className="font-mono text-zinc-200">{activeExample ? `${activeExample.id}.poule` : "preuves.poule"}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500 truncate">{source.split("\n").length} lignes</span>
              <button
                type="button"
                onClick={() => void saveToWorkspace()}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/12 text-zinc-300 transition"
                title={`Sauvegarder dans ${activeWorkspaceDir}`}
              >
                <Save className="w-3 h-3 text-cyan-400" />
                Sauver
              </button>
            </div>

            {/* Quick-insert logical symbols bar */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-white/6 bg-black/20 overflow-x-auto no-scrollbar shrink-0">
              <span className="text-[9.5px] uppercase tracking-wider text-zinc-600 mr-1 shrink-0">Insérer</span>
              {QUICK_SYMBOLS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => editorRef.current?.insert(s.insert)}
                  title={s.title}
                  className="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-violet-500/20 border border-white/8 hover:border-violet-400/35 font-mono text-[11px] text-zinc-200 hover:text-violet-100 shrink-0 transition"
                >
                  {s.label}
                </button>
              ))}
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
                  {result.fatal.loc && (
                    <span className="font-mono font-normal text-rose-300/80">ligne {result.fatal.loc.line}</span>
                  )}
                </div>
                <pre className="mt-1 text-[11px] font-mono text-rose-100/90 whitespace-pre-wrap select-text">
                  {translateError(result.fatal.message)}
                </pre>
                {guide && explainError(result.fatal.message) && (
                  <div className="mt-1.5 flex gap-1.5 text-[11.5px] text-zinc-200 leading-relaxed">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                    {explainError(result.fatal.message)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Draggable Divider (Desktop & iPad) */}
        {!isMobile && showEditor && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setIsDraggingSplit(true);
            }}
            title="Glisser pour redimensionner l'éditeur"
            className={`hidden lg:flex shrink-0 cursor-col-resize items-center justify-center transition-colors touch-none ${
              isTouch ? "w-3" : "w-1.5"
            } ${
              isDraggingSplit ? "bg-violet-400/50" : "bg-white/[0.04] hover:bg-violet-400/35"
            }`}
          >
            <div className="w-0.5 h-10 rounded-full bg-white/25" />
          </div>
        )}

        {/* Right: Proof Display Area */}
        {(!isMobile || mobilePane !== "code") && (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}

          {/* Theorem Selector Chips + View Switcher */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 bg-black/30 shrink-0">
            <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {theorems.map((t) => {
                const active = t.label === theorem?.label;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => selectTheorem(t)}
                    title={`${t.ok ? "Prouvé" : "Refusé"}${t.formula ? ` — ${readable(t.formula)}` : ""}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11.5px] font-mono shrink-0 transition ${
                      active
                        ? t.ok
                          ? "bg-emerald-500/18 border-emerald-400/50 text-emerald-100 shadow-sm shadow-emerald-500/15"
                          : "bg-rose-500/18 border-rose-400/50 text-rose-100 shadow-sm shadow-rose-500/15"
                        : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {t.ok ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <X className="w-3 h-3 text-rose-400" />
                    )}
                    <span>{t.name ?? "check"}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center rounded-xl bg-white/[0.04] border border-white/10 p-0.5 shrink-0">
              {(
                [
                  ["tree", <GitBranch key="t" className="w-3.5 h-3.5" />, "Arbre"],
                  ["story", <ScrollText key="s" className="w-3.5 h-3.5" />, "Récit"],
                  ["outline", <ListTree key="o" className="w-3.5 h-3.5" />, "Plan"],
                  ["rules", <Sigma key="r" className="w-3.5 h-3.5" />, "Règles"],
                ] as const
              ).map(([id, icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition ${
                    view === id
                      ? "bg-gradient-to-r from-violet-500/30 to-cyan-500/20 text-white border border-violet-400/30 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/6 border border-transparent"
                  }`}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
            {/* Proof Stage */}
            {(!isMobile || mobilePane === "proof") && (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {/* Fixed Theorem Banner above the Tree canvas (never scrolls away or steals space inside the tree) */}
              {theorem?.ok && view === "tree" && result?.installed && !result.outdated && (
                <div className="shrink-0 px-4 py-2.5 border-b border-white/8 bg-gradient-to-r from-[#0d101b]/95 via-[#0a0c14]/95 to-[#0b1218]/95">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/18 border border-emerald-400/35 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 shrink-0">
                        Prouvé
                      </span>
                      <span className="font-mono text-[13px] font-medium truncate">
                        <FormulaText text={fmt(theorem.formula ?? theorem.tree!.concl)} />
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10.5px] text-zinc-400 shrink-0">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" /> Construire
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-sky-400" /> Utiliser
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-violet-400" /> Hypothèse
                      </span>
                    </div>
                  </div>
                  {guide && readable(theorem.formula ?? theorem.tree!.concl) && (
                    <div className="mt-1 text-[11.5px] text-zinc-400 italic truncate">
                      « {readable(theorem.formula ?? theorem.tree!.concl)} »
                    </div>
                  )}
                </div>
              )}

              {/* Scrollable / Pannable / Pinch-Zoomable Canvas */}
              <div
                ref={canvasRef}
                tabIndex={0}
                onKeyDown={onTreeKey}
                onMouseDown={onCanvasMouseDown}
                onWheel={onCanvasWheel}
                onTouchStart={onCanvasTouchStart}
                onTouchMove={onCanvasTouchMove}
                onTouchEnd={onCanvasTouchEnd}
                className={`flex-1 min-h-0 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 bg-[#06080f] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.055)_1px,transparent_0)] [background-size:24px_24px] ${
                  view === "tree" && theorem?.ok
                    ? isPanning
                      ? "cursor-grabbing touch-none"
                      : "cursor-grab touch-none"
                    : ""
                }`}
              >
                {!vmReady ? (
                  <Empty
                    icon={<Cpu className="w-7 h-7 text-zinc-500" />}
                    title="Linux n'est pas démarré"
                    body="Poule tourne dans la machine virtuelle Debian. Démarre-la, et tes preuves seront vérifiées en direct."
                  />
                ) : result && !result.installed ? (
                  <Empty
                    icon={<Download className="w-7 h-7 text-violet-300" />}
                    title="Poule n'est pas installé dans cette machine"
                    body="Il est fourni avec microML dans l'image Debian préinstallée. Tu peux l'installer ici (Debian uniquement)."
                    action={<InstallButton installing={installing} onClick={install} label="Installer microML + Poule" />}
                  />
                ) : result?.outdated ? (
                  <Empty
                    icon={<Download className="w-7 h-7 text-amber-300" />}
                    title="Ce Poule ne sait pas encore vérifier les preuves"
                    body="Le microML installé est antérieur au vérificateur de preuves. Mets-le à jour vers la version fournie avec unkernelOS."
                    action={<InstallButton installing={installing} onClick={install} label="Mettre à jour microML" />}
                  />
                ) : vmError ? (
                  <Empty icon={<X className="w-7 h-7 text-rose-400" />} title="Impossible de lancer Poule" body={vmError} />
                ) : !result ? (
                  <Empty
                    icon={<Loader2 className="w-7 h-7 text-violet-300 animate-spin" />}
                    title="Vérification en cours…"
                    body="Le vérificateur Poule analyse les dérivations dans Linux."
                  />
                ) : view === "rules" ? (
                  <RulesPanel onInsert={(s) => editorRef.current?.insert(s)} />
                ) : !theorem ? (
                  <Empty
                    icon={<Sigma className="w-7 h-7 text-zinc-500" />}
                    title="Aucun théorème pour l'instant"
                    body="Écris « theorem nom : formule = preuve » ou charge un exemple (menu Exemples)."
                  />
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
                ) : view === "story" ? (
                  <StoryView
                    theorem={theorem}
                    source={checkedSource ?? source}
                    selectedId={explicitNode?.id ?? null}
                    onSelect={(id) => {
                      const n = nodeById.get(id);
                      if (n) selectNode(n);
                    }}
                    onHover={setHoverNodeId}
                  />
                ) : view === "outline" ? (
                  <div className="p-4 max-w-4xl mx-auto">
                    <OutlineNode
                      node={theorem.tree!}
                      depth={0}
                      guide={guide}
                      fmt={fmt}
                      selectedId={selectedNode?.id ?? null}
                      onSelect={selectNode}
                      onHover={setHoverNodeId}
                    />
                  </div>
                ) : (
                  <div className="min-w-full w-max px-10 py-10">
                    <div
                      ref={treeRef}
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                      className="mx-auto w-fit transition-transform duration-150"
                    >
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
                )}
              </div>

              {/* Bottom Tree Control Bar */}
              {theorem?.ok && view === "tree" && result?.installed && !result.outdated && (
                <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-t border-white/10 bg-[#090b12]/95 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (playing) setPlaying(false);
                      else {
                        setReplayStep(-1);
                        setPlaying(true);
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-100 font-medium transition"
                    title="Rejouer la preuve étape par étape"
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    Rejouer
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
                  <span className="font-mono text-zinc-400">
                    {replayStep === null ? nodes.length : Math.max(0, replayStep + 1)}/{nodes.length} étapes
                    <span className="text-zinc-600"> · prof. {theorem.depth}</span>
                  </span>
                  {replayStep !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setReplayStep(null);
                      }}
                      className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white"
                      title="Montrer toute la preuve"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <span className="hidden 2xl:inline-flex items-center gap-1 text-[10px] text-zinc-500 ml-1">
                    <Move className="w-3 h-3" /> glisser pour déplacer · ⌘+molette zoom
                  </span>

                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/10 p-0.5">
                      <IconBtn
                        onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(2)))}
                        title="Dézoomer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </IconBtn>
                      <button
                        type="button"
                        onClick={() => setZoom(1)}
                        className="font-mono text-[10.5px] w-11 text-center text-zinc-300 hover:text-white"
                        title="Réinitialiser à 100%"
                      >
                        {Math.round(zoom * 100)}%
                      </button>
                      <IconBtn
                        onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
                        title="Zoomer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn onClick={fit} title="Ajuster à la largeur">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyLatex()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/12 text-zinc-200 transition"
                      title="Copier en LaTeX (bussproofs)"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ClipboardCopy className="w-3.5 h-3.5" />
                      )}
                      LaTeX
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Right: Goal / Step Inspector Panel */}
            {((isMobile && mobilePane === "step") || (!isMobile && showInspector)) && inspectorEligible && selectedNode && (
              <GoalPanel
                node={selectedNode}
                guide={guide}
                theorem={theorem!}
                fmt={fmt}
                types={types}
                facts={facts}
                theorems={theorems}
                fullHeight={isMobile}
                onSelect={(n) => {
                  selectNode(n);
                }}
              />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Natural-deduction tree (Gentzen)
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
  // keep room on the right for the rule badge so siblings never overlap it
  const labelRoom =
    rv.family === "hyp"
      ? 0
      : 22 + (label.length + (discharged.length ? discharged.join(",").length + 2 : 0)) * 6.4;

  const conclusion = (
    <button
      type="button"
      onClick={() => onSelect(node)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      title={ruleHelp(node.rule)}
      className={`relative px-2.5 py-1 rounded-lg font-mono text-[12.5px] whitespace-nowrap transition-all border ${
        selected
          ? "bg-amber-400/18 border-amber-300/75 text-amber-50 shadow-[0_0_20px_rgba(251,191,36,0.2)] scale-[1.02]"
          : hovered
            ? "bg-white/12 border-white/25 text-white"
            : rv.family === "hyp"
              ? "bg-violet-500/[0.08] border-violet-400/25 border-dashed hover:bg-violet-500/16"
              : "bg-white/[0.025] border-white/[0.07] hover:bg-white/[0.08] hover:border-white/18"
      } ${shown ? "" : "opacity-0"}`}
    >
      {rv.family === "hyp" ? (
        <>
          <span className="text-violet-400/90">[</span>
          <FormulaText text={fmt(node.concl)} />
          <span className="text-violet-400/90">]</span>
          <sup className="ml-1 text-[9.5px] text-violet-300 font-semibold">{rv.label}</sup>
        </>
      ) : (
        <FormulaText text={fmt(node.concl)} />
      )}
    </button>
  );

  if (rv.family === "hyp") {
    return (
      <div className={`inline-flex flex-col items-center transition-opacity duration-300 ${shown ? "" : "opacity-20"}`}>
        {conclusion}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center" style={{ marginRight: labelRoom }}>
      {node.children.length > 0 && (
        <div className="flex items-end gap-7">
          {node.children.map((c) => (
            <GentzenNode
              key={c.id}
              node={c}
              fmt={fmt}
              selectedId={selectedId}
              hoverId={hoverId}
              visible={visible}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </div>
      )}
      <div
        className={`relative self-stretch flex items-center my-1.5 transition-opacity duration-300 ${
          shown ? "" : "opacity-0"
        }`}
      >
        <div
          className={`flex-1 h-[2px] rounded-full ${
            selected ? "bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.7)]" : style.bar
          }`}
        />
        <span
          title={ruleHelp(node.rule)}
          className={`absolute left-full ml-2 whitespace-nowrap px-1.5 py-0.5 rounded-md border text-[10px] font-semibold cursor-help backdrop-blur-sm ${style.chip}`}
        >
          {rv.label}
          {rv.arg && <span className="font-mono font-normal opacity-80"> [{rv.arg}]</span>}
          {discharged.length > 0 && (
            <sup className="ml-0.5 text-[9px] text-violet-200">{discharged.join(",")}</sup>
          )}
        </span>
      </div>
      <div className={`transition-opacity duration-300 ${shown ? "" : "opacity-20"}`}>{conclusion}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Outline view (Plan)
// ---------------------------------------------------------------------------

const OutlineNode: React.FC<{
  node: DerivNode;
  depth: number;
  guide: boolean;
  fmt: (f: string) => string;
  selectedId: number | null;
  onSelect: (n: DerivNode) => void;
  onHover: (id: number | null) => void;
}> = ({ node, depth, guide, fmt, selectedId, onSelect, onHover }) => {
  const rv = ruleView(node.rule);
  const active = node.id === selectedId;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        style={{ paddingLeft: depth * 20 + 10 }}
        className={`relative w-full flex flex-col gap-0.5 pr-3 py-1.5 my-0.5 rounded-xl text-left border transition ${
          active
            ? "bg-amber-400/14 border-amber-300/50 shadow-sm"
            : "border-transparent hover:bg-white/[0.045]"
        }`}
      >
        {depth > 0 && (
          <span
            className="absolute top-1 bottom-1 border-l border-white/12"
            style={{ left: depth * 20 - 4 }}
          />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 min-w-[2.7rem] text-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${FAMILY_STYLE[rv.family].chip}`}
          >
            {rv.label}
          </span>
          <span className="font-mono text-[12.5px] truncate">
            <FormulaText text={fmt(node.concl)} />
          </span>
          {rv.arg && <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">[{rv.arg}]</span>}
          {node.intro.map((i) => (
            <span
              key={i}
              className="shrink-0 px-1.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-400/25 text-violet-200 text-[10px] font-mono"
            >
              +{i.split(" : ")[0]}
            </span>
          ))}
        </div>
        {guide && active && readable(node.concl) && (
          <div className="pl-12 text-[11px] text-zinc-400 italic truncate">
            « {readable(node.concl)} »
          </div>
        )}
      </button>
      {node.children.map((c) => (
        <OutlineNode
          key={c.id}
          node={c}
          depth={depth + 1}
          guide={guide}
          fmt={fmt}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
        />
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
  fullHeight?: boolean;
  onSelect: (n: DerivNode) => void;
}> = ({ node, guide, theorem, fmt, types, facts, theorems, fullHeight = false, onSelect }) => {
  const { vars, hyps } = contextOf(node, types);
  const rv = ruleView(node.rule);
  const [showGlobals, setShowGlobals] = useState(false);

  // Interactive breadcrumb from conclusion up to current node
  const trail = useMemo(() => {
    const chain: DerivNode[] = [];
    let cur: DerivNode | null = node;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent;
    }
    return chain;
  }, [node]);

  const idx = facts.findIndex((f) => f.kind === "theorem" && f.name === theorem.name);
  const proved = new Set(theorems.filter((t) => t.ok && t.name).map((t) => t.name!));
  const globals = (idx < 0 ? facts : facts.slice(0, idx)).filter(
    (f) => f.kind === "axiom" || proved.has(f.name)
  );
  const split = (s: string) => [s.slice(0, s.indexOf(" : ")), s.slice(s.indexOf(" : ") + 3)] as const;

  return (
    <div
      className={`${
        fullHeight ? "flex-1 min-h-0" : "xl:w-[330px] h-64 xl:h-auto shrink-0 border-t xl:border-t-0 xl:border-l border-white/10"
      } bg-[#090b13] overflow-auto select-text`}
    >
      {/* Header + Breadcrumb */}
      <div className="px-3.5 py-2.5 border-b border-white/8 bg-black/25 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Étape sélectionnée
          </span>
          <span
            className={`ml-auto px-2 py-0.5 rounded-md border text-[10px] font-semibold ${FAMILY_STYLE[rv.family].chip}`}
          >
            {rv.label}
            {rv.arg ? ` [${rv.arg}]` : ""}
          </span>
        </div>
        <div className="text-[12px] font-medium text-zinc-100">{ruleName(node.rule)}</div>
        {trail.length > 1 && (
          <div className="flex items-center gap-0.5 flex-wrap pt-0.5">
            {trail.map((step, i) => {
              const sRv = ruleView(step.rule);
              const isLast = i === trail.length - 1;
              return (
                <React.Fragment key={step.id}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => onSelect(step)}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono transition ${
                      isLast
                        ? "bg-amber-400/20 text-amber-200 font-semibold"
                        : "bg-white/[0.04] text-zinc-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {sRv.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Context (Hypotheses) */}
      <Section title="Contexte (Ce que tu sais)">
        {vars.length === 0 && hyps.length === 0 && (
          <div className="text-zinc-500 text-[11px] italic">Aucune hypothèse locale à cette étape.</div>
        )}
        <div className="space-y-1">
          {vars.map((v) => {
            const [n, t] = split(v);
            return (
              <div
                key={v}
                className="flex items-baseline gap-2 px-2 py-1 rounded-lg bg-cyan-500/[0.06] border border-cyan-400/15 font-mono text-[11.5px]"
                title={`${n} est un objet quelconque de type ${t}`}
              >
                <span className="text-cyan-300 font-semibold">{n}</span>
                <span className="text-zinc-500">:</span>
                <span className="text-cyan-100/90">{t}</span>
                {guide && <span className="ml-auto font-sans text-[9.5px] text-cyan-300/60">objet</span>}
              </div>
            );
          })}
          {hyps.map((h) => {
            const [n, f] = split(h);
            return (
              <div
                key={h}
                className="flex items-baseline gap-2 px-2 py-1 rounded-lg bg-violet-500/[0.07] border border-violet-400/18 font-mono text-[11.5px]"
                title={readable(f)}
              >
                <span className="text-violet-300 font-semibold shrink-0">{n}</span>
                <span className="text-zinc-500">:</span>
                <span className="break-words min-w-0">
                  <FormulaText text={fmt(f)} />
                </span>
                {guide && (
                  <span className="ml-auto font-sans text-[9.5px] text-violet-300/60 shrink-0">supposé</span>
                )}
              </div>
            );
          })}
        </div>
        {globals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowGlobals((v) => !v)}
            className="mt-1 text-[10.5px] text-zinc-400 hover:text-zinc-200 transition"
          >
            {showGlobals ? "▾" : "▸"} {globals.length} axiome{globals.length > 1 ? "s" : ""} / théorème
            {globals.length > 1 ? "s" : ""} disponible{globals.length > 1 ? "s" : ""}
          </button>
        )}
        {showGlobals && (
          <div className="space-y-1 pt-1">
            {globals.map((g) => (
              <div
                key={g.name}
                className="flex gap-2 px-2 py-1 rounded-lg bg-white/[0.025] font-mono text-[11px]"
                title={readable(g.statement)}
              >
                <span className={g.kind === "axiom" ? "text-amber-300 shrink-0" : "text-emerald-300 shrink-0"}>
                  {g.name}
                </span>
                <span className="text-zinc-500">:</span>
                <span className="break-words min-w-0">
                  <FormulaText text={fmt(g.statement)} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Sequent Turnstile Bar */}
      <div className="mx-3.5 my-1 flex items-center gap-2">
        <span className="font-mono text-sm font-bold text-violet-300">⊢</span>
        <div className="flex-1 h-[1.5px] bg-gradient-to-r from-violet-400/70 via-cyan-400/40 to-transparent" />
      </div>

      {/* Goal */}
      <Section title="But à prouver">
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/12 font-mono text-[13px] leading-relaxed break-words">
          <FormulaText text={fmt(node.concl)} />
        </div>
        {guide && readable(node.concl) && (
          <div className="text-[11.5px] text-zinc-300/85 italic leading-relaxed px-0.5">
            « {readable(node.concl)} »
          </div>
        )}
      </Section>

      {/* Explanation */}
      {guide && (
        <div className="mx-3.5 mb-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2.5 text-[11.5px] text-zinc-200 leading-relaxed">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200/90 mb-1">
            <GraduationCap className="w-3.5 h-3.5" /> Comment c'est justifié
          </div>
          {ruleHelp(node.rule)}
        </div>
      )}

      {/* Premises */}
      {node.children.length > 0 && (
        <Section title="Obtenu à partir de">
          <div className="space-y-1">
            {node.children.map((c) => {
              const cRv = ruleView(c.rule);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  title={ruleName(c.rule)}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/10 border border-white/6 transition"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9.5px] font-semibold shrink-0 ${FAMILY_STYLE[cRv.family].chip}`}
                  >
                    {cRv.label}
                  </span>
                  <span className="font-mono text-[11.5px] truncate">
                    <FormulaText text={fmt(c.concl)} />
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {node.parent && (
        <div className="px-3.5 pb-3.5">
          <button
            type="button"
            onClick={() => onSelect(node.parent!)}
            className="w-full text-left px-2.5 py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/8 border border-white/6 text-[11px] text-zinc-400 hover:text-white transition"
          >
            ↓ sert ensuite à : <span className="text-zinc-200">{ruleName(node.parent.rule)}</span>
          </button>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="px-3.5 py-2 space-y-1.5">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
    {children}
  </div>
);

const readable = (f: string) => {
  const ast = parseFormula(f);
  return ast ? describeFormula(ast) : "";
};

const HelpCard: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="shrink-0 m-2.5 rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.1] via-[#0c0e18]/95 to-emerald-500/[0.07] p-3.5 shadow-xl">
    <div className="flex items-start gap-2.5">
      <HelpCircle className="w-4 h-4 text-violet-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white">Comment ça marche ?</div>
        <ol className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11.5px] text-zinc-300 leading-relaxed">
          <li className="rounded-xl bg-black/30 border border-white/8 px-3 py-2">
            <span className="text-violet-300 font-semibold">1. Énonce.</span> À gauche, écris ce que tu veux prouver :{" "}
            <code className="font-mono text-emerald-200">theorem nom : formule = preuve</code>
          </li>
          <li className="rounded-xl bg-black/30 border border-white/8 px-3 py-2">
            <span className="text-cyan-300 font-semibold">2. Prouve.</span> Utilise les règles (onglet <b>Règles</b>) ou la
            barre d'insertion rapide. Le mode <b>Guide</b> propose la prochaine étape.
          </li>
          <li className="rounded-xl bg-black/30 border border-white/8 px-3 py-2">
            <span className="text-emerald-300 font-semibold">3. Explore.</span> L'<b>Arbre</b> se déplace à la souris,
            le <b>Récit</b> raconte la preuve en français, et chaque clic suit le code.
          </li>
        </ol>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {POULE_SYMBOLS.map((sy) => (
            <span
              key={sy.sym}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/30 border border-white/8 text-[11px]"
              title={`s'écrit ${sy.ascii}`}
            >
              <span className="font-mono text-[13px] text-violet-200">{sy.sym}</span>
              <span className="text-zinc-300">{sy.reading}</span>
              <code className="font-mono text-[10px] text-zinc-500">{sy.ascii}</code>
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Fermer"
        className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Rules palette (with Intro / Elim filter)
// ---------------------------------------------------------------------------

const RulesPanel: React.FC<{ onInsert: (snippet: string) => void }> = ({ onInsert }) => {
  const [familyFilter, setFamilyFilter] = useState<"all" | "intro" | "elim">("all");
  const filtered = POULE_RULES.filter((r) => {
    if (familyFilter === "all") return true;
    const isIntro = r.rule.endsWith("I") || r.rule === "Ax" || r.rule === "Refl";
    return familyFilter === "intro" ? isIntro : !isIntro;
  });

  return (
    <div className="p-4 space-y-3 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-zinc-400">
          Clique <b className="text-zinc-200">Insérer</b> pour coller le modèle de règle directement à la position du curseur.
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/10 p-0.5 text-[11px]">
          {(
            [
              ["all", "Toutes"],
              ["intro", "Construire (Intro)"],
              ["elim", "Utiliser (Élim)"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFamilyFilter(id)}
              className={`px-2.5 py-1 rounded-lg transition ${
                familyFilter === id ? "bg-white/14 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
        {filtered.map((r) => {
          const isIntro = r.rule.endsWith("I") || r.rule === "Ax" || r.rule === "Refl";
          const tone = isIntro ? FAMILY_STYLE.intro : FAMILY_STYLE.elim;
          return (
            <div
              key={r.rule}
              className={`rounded-2xl border bg-white/[0.03] hover:bg-white/[0.05] p-3.5 flex flex-col gap-2 transition ${tone.glow}`}
            >
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-lg border text-[13px] font-semibold font-mono ${tone.chip}`}>
                  {r.rule}
                </span>
                <span className="text-[12.5px] font-medium text-white truncate">{r.name}</span>
                <button
                  type="button"
                  onClick={() => onInsert(r.snippet)}
                  className="ml-auto px-2.5 py-0.5 rounded-lg bg-violet-500/20 border border-violet-400/35 text-[10.5px] font-medium text-violet-100 hover:bg-violet-500/35 transition shrink-0"
                >
                  Insérer
                </button>
              </div>
              <code className="text-[11.5px] font-mono text-emerald-200 bg-black/40 border border-white/6 rounded-xl px-2.5 py-1.5 whitespace-pre-wrap select-text">
                {r.syntax}
              </code>
              <div className="text-[11px] text-zinc-400 leading-snug">
                prouve <FormulaText text={r.proves} className="font-mono" /> · à partir de{" "}
                <span className="text-zinc-300">{r.from}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
    <div className="min-h-full flex items-center justify-center p-6 select-text">
      <div className="max-w-xl w-full space-y-3">
        <div className="rounded-2xl border border-rose-400/35 bg-gradient-to-b from-rose-500/[0.1] to-rose-950/[0.15] p-4 shadow-xl">
          <div className="flex items-center gap-2 text-rose-200 text-[13.5px] font-semibold">
            <X className="w-4 h-4" />{" "}
            {theorem.name ? `Le théorème « ${theorem.name} » est refusé` : "Ce check est refusé"}
          </div>
          <pre className="mt-2 p-2.5 rounded-xl bg-black/35 border border-rose-400/15 text-[12px] font-mono text-rose-50/90 whitespace-pre-wrap leading-relaxed">
            {translateError(theorem.message ?? "")}
          </pre>
          {hint && (
            <div className="mt-3 flex gap-2 rounded-xl bg-black/30 border border-amber-400/20 px-3 py-2.5 text-[12px] text-zinc-200 leading-relaxed">
              <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>
                <b className="text-amber-200">Pourquoi ? </b>
                {hint}
              </span>
            </div>
          )}
          {theorem.errorLoc && (
            <button
              type="button"
              onClick={onJump}
              className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-[11.5px] text-rose-100 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Aller à la ligne {theorem.errorLoc.line}, colonne{" "}
              {theorem.errorLoc.col}
            </button>
          )}
          {translateError(theorem.message ?? "") !== theorem.message && (
            <details className="mt-2.5 text-[10.5px] text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">Message original du vérificateur</summary>
              <pre className="mt-1 font-mono whitespace-pre-wrap">{theorem.message}</pre>
            </details>
          )}
        </div>
        {guide && goal && (
          <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              L'énoncé à prouver
            </div>
            <div className="font-mono text-[13.5px]">
              <FormulaText text={fmt(goal)} />
            </div>
            <div className="text-[12px] text-zinc-400 italic">« {describeFormula(parseFormula(goal)!)} »</div>
            {steps.length > 0 && (
              <div className="pt-2 border-t border-white/8">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  Par où commencer
                </div>
                <Suggestions steps={steps} onInsert={onInsert} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Suggestions: React.FC<{ steps: ReturnType<typeof suggestSteps>; onInsert?: (s: string) => void }> = ({
  steps,
  onInsert,
}) => (
  <div className="space-y-2">
    {steps.map((st, i) => (
      <div
        key={i}
        className="flex items-start gap-2 p-2 rounded-xl bg-black/25 border border-white/6 text-[11.5px] text-zinc-300"
      >
        <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 text-[10px] font-semibold font-mono">
          {st.rule}
        </span>
        <span className="flex-1 leading-relaxed">
          {st.text}
          {st.snippet && (
            <code className="ml-1.5 px-1.5 py-0.5 rounded bg-black/45 text-emerald-200 font-mono text-[11px] whitespace-pre-wrap">
              {st.snippet}
            </code>
          )}
        </span>
        {st.snippet && onInsert && (
          <button
            type="button"
            onClick={() => onInsert(st.snippet!)}
            className="shrink-0 px-2 py-0.5 rounded-lg bg-violet-500/20 border border-violet-400/35 text-[10.5px] font-medium text-violet-100 hover:bg-violet-500/35 transition"
          >
            Insérer
          </button>
        )}
      </div>
    ))}
  </div>
);

const Empty: React.FC<{ icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }> = ({
  icon,
  title,
  body,
  action,
}) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
      {icon}
    </div>
    <div className="mt-3 text-[13.5px] font-semibold text-zinc-100">{title}</div>
    <div className="mt-1 max-w-md text-[12px] text-zinc-400 leading-relaxed">{body}</div>
    {action}
  </div>
);

const InstallButton: React.FC<{ installing: boolean; onClick: () => void; label: string }> = ({
  installing,
  onClick,
  label,
}) => (
  <button
    type="button"
    disabled={installing}
    onClick={onClick}
    className="mt-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-500 text-white text-[12px] font-semibold disabled:opacity-60 shadow-lg"
  >
    {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
    {installing ? "Installation…" : label}
  </button>
);

const ToggleButton: React.FC<{
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
}> = ({ on, onClick, icon, label, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition ${
      on
        ? "bg-violet-500/22 text-violet-100 shadow-sm"
        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/6"
    }`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const IconBtn: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-lg transition ${
      active
        ? "bg-violet-500/22 text-violet-100"
        : "text-zinc-400 hover:bg-white/10 hover:text-white"
    }`}
  >
    {children}
  </button>
);
