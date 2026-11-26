import {
  BookText,
  Check,
  ClipboardCopy,
  FastForward,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { narrate, parseGlossary, type GlossaryEntry, type StoryLine } from "../../../core/poule-story.ts";
import { GlossaryEditor } from "./GlossaryEditor.tsx";
import { prettyFormula, type PouleTheorem } from "../../../core/poule.ts";

const plain = (t: string) => t.replace(/`/g, "");

/** Texte avec `identifiants` en police mono. */
const Rich: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-violet-500/15 border border-violet-400/20 text-violet-200 font-mono text-[0.86em]"
          >
            {p}
          </code>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
};

const LINE_STYLE: Record<StoryLine["kind"], string> = {
  open: "text-zinc-100 font-medium",
  step: "text-zinc-200/90",
  case: "text-amber-200 italic font-medium",
  close: "text-emerald-200 font-medium",
};

const DEPTH_RAILS = [
  "border-violet-400/35",
  "border-cyan-400/35",
  "border-emerald-400/35",
  "border-amber-400/35",
];

type Speed = "normal" | "fast" | "instant";

/** Le récit d'une preuve, qui s'écrit sous les yeux du lecteur. */
export const StoryView: React.FC<{
  theorem: PouleTheorem;
  source: string;
  glossarySource: string;
  onChangeSource: (source: string) => void;
  selectedId: number | null;
  onSelect: (nodeId: number) => void;
  onHover: (nodeId: number | null) => void;
}> = ({ theorem, source, glossarySource, onChangeSource, selectedId, onSelect, onHover }) => {
  // Unchecked code edits must not restart the last verified story. Only vocabulary
  // edits can change its wording immediately, independently of proof verification.
  const vocabulary = useMemo(() => JSON.stringify([...parseGlossary(glossarySource)]), [glossarySource]);
  const story = useMemo(() => narrate(theorem, source, new Map(JSON.parse(vocabulary) as [string, GlossaryEntry][])), [theorem, source, vocabulary]);
  const total = useMemo(() => (story ? story.lines.reduce((n, l) => n + l.text.length, 0) : 0), [story]);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [shown, setShown] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // (ré)écrire à chaque nouveau récit ; instantané si l'utilisateur préfère moins d'animations
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // ignore
    }
    setShown(reduce || speed === "instant" ? total : 0);
  }, [story, total, speed]);

  useEffect(() => {
    if (shown >= total) return;
    const stepChars = speed === "fast" ? 10 : 4;
    const t = setTimeout(() => setShown((s) => Math.min(total, s + stepChars)), 14);
    return () => clearTimeout(t);
  }, [shown, total, speed]);

  useEffect(() => {
    if (shown < total && !document.activeElement?.closest("[data-proof-glossary]"))
      endRef.current?.scrollIntoView({ block: "nearest" });
  }, [shown, total]);

  // arrêter la lecture à voix haute si on change de théorème ou quitte la vue
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [story]);

  if (!story) return null;

  const fullText = story.lines.map((l) => `${"  ".repeat(l.depth)}${plain(l.text)}`).join("\n");

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(
      story.lines.map((l) => plain(l.text).replace("C.Q.F.D. ∎", "Ce qu'il fallait démontrer.")).join(" ")
    );
    u.lang = "fr-FR";
    const fr = synth.getVoices().find((v) => v.lang.startsWith("fr"));
    if (fr) u.voice = fr;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${story.title}\n\n${fullText}\n`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable
    }
  };

  let budget = shown;
  const done = shown >= total;
  const progress = total > 0 ? Math.min(100, Math.round((shown / total) * 100)) : 100;
  const formula = theorem.formula ?? theorem.tree?.concl ?? "";

  return (
    <div className="max-w-3xl mx-auto px-5 py-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 to-emerald-500/25 border border-violet-400/30 flex items-center justify-center shrink-0">
            <BookText className="w-3.5 h-3.5 text-violet-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white truncate">{story.title}</h2>
            {formula && (
              <div className="font-mono text-[11px] text-zinc-400 truncate">
                {prettyFormula(formula)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center rounded-lg border border-white/10 bg-black/30 p-0.5 text-[10.5px]">
          {(
            [
              ["normal", "1×"],
              ["fast", "3×"],
              ["instant", "Direct"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSpeed(id)}
              className={`px-2 py-0.5 rounded-md transition ${
                speed === id ? "bg-violet-500/25 text-violet-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={`Vitesse d'écriture : ${label}`}
            >
              {label}
            </button>
          ))}
        </div>

        <Btn
          onClick={() => {
            if (speed === "instant") setSpeed("normal");
            setShown(0);
          }}
          title="Réécrire le récit"
          icon={<RotateCcw className="w-3.5 h-3.5" />}
          label="Réécrire"
        />
        {!done && (
          <Btn
            onClick={() => setShown(total)}
            title="Afficher tout le texte"
            icon={<FastForward className="w-3.5 h-3.5" />}
            label="Tout afficher"
          />
        )}
        {"speechSynthesis" in window && (
          <Btn
            onClick={speak}
            title={speaking ? "Arrêter la lecture" : "Lire le récit à voix haute"}
            icon={speaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            label={speaking ? "Arrêter" : "Écouter"}
            active={speaking}
          />
        )}
        <Btn
          onClick={() => void copy()}
          title="Copier le récit"
          icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
          label={copied ? "Copié" : "Copier"}
        />
      </div>

      {/* Manuscript Card */}
      <div className="relative rounded-2xl border border-white/12 bg-gradient-to-b from-[#0e111d]/95 via-[#0a0c15]/95 to-[#090b12]/95 shadow-2xl overflow-hidden">
        {/* Progress hairline */}
        <div className="h-[2px] w-full bg-white/[0.04]">
          <div
            style={{ width: `${progress}%` }}
            className="h-full bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 transition-all duration-150"
          />
        </div>

        <div className="px-6 py-5 font-serif text-[15.5px] leading-[1.85] space-y-1">
          {story.lines.map((l, i) => {
            if (budget <= 0) return null;
            const visible = l.text.slice(0, budget);
            budget -= l.text.length;
            const typing = budget < 0;
            const isEnd = l.text.startsWith("C.Q.F.D.");
            const isSelected = l.nodeId !== null && l.nodeId === selectedId;
            const railClass = DEPTH_RAILS[(Math.max(1, l.depth) - 1) % DEPTH_RAILS.length]!;

            return (
              <p
                key={i}
                onClick={() => l.nodeId !== null && onSelect(l.nodeId)}
                onMouseEnter={() => onHover(l.nodeId)}
                onMouseLeave={() => onHover(null)}
                style={{ paddingLeft: l.depth * 20 + 10 }}
                className={`relative py-1 pr-3 rounded-lg cursor-pointer transition-colors ${LINE_STYLE[l.kind]} ${
                  isEnd
                    ? "text-right text-emerald-300 font-semibold not-italic mt-3 pt-2 border-t border-emerald-400/15 tracking-wide"
                    : ""
                } ${
                  isSelected
                    ? "bg-amber-400/14 ring-1 ring-amber-300/35 text-amber-50"
                    : "hover:bg-white/[0.045]"
                }`}
              >
                {l.depth > 0 && (
                  <span
                    className={`absolute top-1.5 bottom-1.5 border-l-2 rounded-full ${railClass}`}
                    style={{ left: l.depth * 20 - 4 }}
                  />
                )}
                <Rich text={visible} />
                {typing && (
                  <span className="inline-block w-[0.45em] h-[1.05em] align-[-0.12em] ml-0.5 bg-violet-300/90 animate-pulse rounded-[1px]" />
                )}
              </p>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="flex items-center justify-between px-5 py-2 border-t border-white/6 bg-black/25 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-400" />
            Clique une phrase pour surligner l'étape correspondante dans le code
          </span>
          <span className="font-mono text-[10px] text-zinc-500">{story.lines.length} étapes</span>
        </div>
      </div>

      <GlossaryEditor
        source={glossarySource}
        usedKeys={story.vocabulary.map((entry) => entry.key)}
        onChange={onChangeSource}
      />
    </div>
  );
};

const Btn: React.FC<{ onClick: () => void; title: string; icon: React.ReactNode; label: string; active?: boolean }> = ({
  onClick,
  title,
  icon,
  label,
  active,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
      active
        ? "bg-violet-500/22 border-violet-400/45 text-violet-100 shadow-sm"
        : "bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
    }`}
  >
    {icon}
    {label}
  </button>
);
