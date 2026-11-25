import { BookText, Check, ClipboardCopy, FastForward, RotateCcw, Square, Volume2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { narrate, type StoryLine } from "../../../core/poule-story.ts";
import type { PouleTheorem } from "../../../core/poule.ts";

const plain = (t: string) => t.replace(/`/g, "");

/** Texte avec `identifiants` en police mono. */
const Rich: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="px-1 rounded bg-violet-500/12 text-violet-200 font-mono text-[0.9em]">
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
  open: "text-zinc-100",
  step: "text-zinc-300",
  case: "text-amber-200 italic",
  close: "text-emerald-200",
};

/** Le récit d'une preuve, qui s'écrit sous les yeux du lecteur. */
export const StoryView: React.FC<{
  theorem: PouleTheorem;
  source: string;
  selectedId: number | null;
  onSelect: (nodeId: number) => void;
  onHover: (nodeId: number | null) => void;
}> = ({ theorem, source, selectedId, onSelect, onHover }) => {
  const story = useMemo(() => narrate(theorem, source), [theorem, source]);
  const total = useMemo(() => (story ? story.lines.reduce((n, l) => n + l.text.length, 0) : 0), [story]);
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
    setShown(reduce ? total : 0);
  }, [story, total]);
  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((s) => Math.min(total, s + 3)), 14);
    return () => clearTimeout(t);
  }, [shown, total]);
  useEffect(() => {
    if (shown < total) endRef.current?.scrollIntoView({ block: "nearest" });
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

  return (
    <div className="max-w-3xl mx-auto px-5 py-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <BookText className="w-4 h-4 text-violet-300" />
        <h2 className="text-[15px] font-semibold text-white mr-auto">{story.title}</h2>
        <Btn onClick={() => setShown(0)} title="Réécrire le récit" icon={<RotateCcw className="w-3.5 h-3.5" />} label="Réécrire" />
        {!done && <Btn onClick={() => setShown(total)} title="Afficher tout le texte" icon={<FastForward className="w-3.5 h-3.5" />} label="Tout afficher" />}
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
          label="Copier"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0d15]/90 px-5 py-4 font-serif text-[15px] leading-[1.75] shadow-xl">
        {story.lines.map((l, i) => {
          if (budget <= 0) return null;
          const visible = l.text.slice(0, budget);
          budget -= l.text.length;
          const typing = budget < 0;
          const isEnd = l.text.startsWith("C.Q.F.D.");
          return (
            <p
              key={i}
              onClick={() => l.nodeId !== null && onSelect(l.nodeId)}
              onMouseEnter={() => onHover(l.nodeId)}
              onMouseLeave={() => onHover(null)}
              style={{ paddingLeft: l.depth * 18 }}
              className={`relative my-0.5 rounded-md cursor-pointer transition ${LINE_STYLE[l.kind]} ${
                isEnd ? "text-right text-emerald-300 font-semibold not-italic mt-2" : ""
              } ${l.nodeId !== null && l.nodeId === selectedId ? "bg-amber-400/10" : "hover:bg-white/[0.04]"}`}
            >
              {l.depth > 0 && <span className="absolute top-1 bottom-1 border-l border-white/10" style={{ left: l.depth * 18 - 10 }} />}
              <Rich text={visible} />
              {typing && <span className="inline-block w-[0.5em] h-[1.1em] align-[-0.15em] ml-0.5 bg-violet-300/80 animate-pulse" />}
            </p>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="mt-3 text-[11px] text-zinc-500">Clique une phrase pour voir l'étape correspondante dans le code.</div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Vocabulaire du récit</div>
        {story.vocabulary.length === 0 ? (
          <div className="text-[12px] text-zinc-400 leading-relaxed">
            Aucun mot n'est défini : le récit utilise les noms bruts. Ajoute dans le fichier des commentaires comme
            <code className="mx-1 px-1 rounded bg-black/35 text-emerald-200 font-mono text-[11px]">(*@ pair(n) : {"{n}"} est pair — {"{n}"} est divisible par 2 *)</code>
            pour que la preuve soit racontée avec des mots de tous les jours ; la définition rigoureuse est donnée entre parenthèses à la première mention.
          </div>
        ) : (
          <dl className="space-y-1">
            {story.vocabulary.map((v) => (
              <div key={v.key} className="flex flex-wrap gap-x-2 text-[12px]">
                <dt className="font-mono text-violet-200">
                  {v.key}
                  {v.params.length ? `(${v.params.join(", ")})` : ""}
                </dt>
                <dd className="text-zinc-200">
                  {v.usual}
                  {v.rigorous && <span className="text-zinc-500"> — {v.rigorous}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
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
    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] ${
      active ? "bg-violet-500/20 border-violet-400/40 text-violet-100" : "bg-white/6 border-white/10 text-zinc-300 hover:bg-white/10"
    }`}
  >
    {icon}
    {label}
  </button>
);
