import { BookOpen, Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseGlossary, type GlossaryEntry } from "../../../core/poule-story.ts";
import { glossaryEntry, glossarySignature, removeGlossaryEntry, writeGlossaryEntry } from "../../../core/poule-glossary.ts";

type Draft = { original: GlossaryEntry | null; signature: string; usual: string; rigorous: string };
const fieldClass = "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-violet-400/70 focus:ring-1 focus:ring-violet-400/30";

export function GlossaryEditor({ source, usedKeys, onChange }: {
  source: string;
  usedKeys: readonly string[];
  onChange: (source: string) => void;
}) {
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const entries = useMemo(() => [...parseGlossary(source).values()], [source]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<{ entry: GlossaryEntry; after: string } | null>(null);
  useEffect(() => {
    if (removed && source !== removed.after) setRemoved(null);
  }, [source]);
  const edit = (entry: GlossaryEntry | null, button: HTMLButtonElement) => {
    trigger.current = button;
    setError("");
    setDraft({ original: entry, signature: entry ? glossarySignature(entry) : "", usual: entry?.usual ?? "", rigorous: entry?.rigorous ?? "" });
  };
  const close = () => {
    setDraft(null);
    setError("");
    requestAnimationFrame(() => {
      const button = trigger.current?.isConnected ? trigger.current : addButton.current;
      button?.focus({ preventScroll: true });
    });
  };
  const checkConflict = () => {
    if (draft?.original && JSON.stringify(parseGlossary(source).get(draft.original.key)) !== JSON.stringify(draft.original))
      throw new Error("Cette définition a changé dans le code. Annule puis rouvre-la pour modifier sa version actuelle.");
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    try {
      checkConflict();
      const entry = glossaryEntry(draft.signature, draft.usual, draft.rigorous);
      onChange(writeGlossaryEntry(source, entry, draft.original?.key));
      close();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const remove = () => {
    if (!draft?.original) return;
    try {
      checkConflict();
      const after = removeGlossaryEntry(source, draft.original.key);
      setRemoved({ entry: draft.original, after });
      onChange(after);
      close();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section data-proof-glossary aria-label="Vocabulaire du récit" className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 mr-auto">
          <BookOpen className="w-3.5 h-3.5 text-violet-300" /> Vocabulaire du récit
          <span className="font-mono text-zinc-500">{entries.length}</span>
        </h3>
        <button ref={addButton} type="button" onClick={(e) => edit(null, e.currentTarget)} disabled={!!draft}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-400/30 bg-violet-500/15 text-xs text-violet-100 hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-default">
          <Plus size={13} /> Ajouter une définition
        </button>
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Écris tes propres mots pour les symboles de la preuve. Les définitions sont conservées dans les commentaires du fichier Poule et utilisées dans le récit ; elles ne modifient pas les formules vérifiées.
      </p>
      {entries.length === 0 && !draft && <p className="text-xs text-zinc-400">Aucune définition pour l’instant. Ajoute un symbole, sa lecture usuelle et, si tu le souhaites, sa définition rigoureuse.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {entries.map((entry) => (
          <article key={entry.key} className="rounded-xl bg-black/30 border border-white/8 px-3 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] font-semibold text-violet-200 mr-auto">{glossarySignature(entry)}</code>
              <button type="button" aria-label={`Modifier la définition de ${entry.key}`} onClick={(e) => edit(entry, e.currentTarget)} disabled={!!draft}
                className="p-1.5 rounded-md text-zinc-400 hover:text-violet-100 hover:bg-white/10 disabled:opacity-30">
                <Pencil size={13} />
              </button>
            </div>
            <p className="text-xs text-zinc-100 break-words">{entry.usual}</p>
            {entry.rigorous && <p className="text-[11px] text-zinc-400 break-words">{entry.rigorous}</p>}
            {!usedKeys.includes(entry.key) && <p className="text-[10px] text-zinc-500">Disponible dans le fichier, non utilisé dans ce récit.</p>}
          </article>
        ))}
      </div>
      {draft && (
        <form onSubmit={save} onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }} className="space-y-3 p-3 rounded-xl border border-violet-400/30 bg-violet-500/[0.06]" aria-label={draft.original ? "Modifier une définition" : "Nouvelle définition"}>
          <label htmlFor={id + "-symbol"} className="block text-xs text-zinc-300">
            Symbole et paramètres
            <input id={id + "-symbol"} aria-label="Symbole et paramètres" autoFocus autoComplete="off" spellCheck={false} value={draft.signature}
              onChange={(e) => setDraft({ ...draft, signature: e.target.value })} placeholder="pair(n), Monde, aime(x, y)…"
              className={fieldClass + " mt-1 font-mono"} />
          </label>
          <label htmlFor={id + "-usual"} className="block text-xs text-zinc-300">
            Lecture usuelle
            <textarea id={id + "-usual"} aria-label="Lecture usuelle" rows={2} value={draft.usual} onChange={(e) => setDraft({ ...draft, usual: e.target.value })}
              placeholder="{n} est pair" className={fieldClass + " mt-1 resize-y"} />
          </label>
          <label htmlFor={id + "-rigorous"} className="block text-xs text-zinc-300">
            Définition rigoureuse <span className="text-zinc-500">(facultative)</span>
            <textarea id={id + "-rigorous"} aria-label="Définition rigoureuse" rows={2} value={draft.rigorous} onChange={(e) => setDraft({ ...draft, rigorous: e.target.value })}
              placeholder="{n} est divisible par 2" className={fieldClass + " mt-1 resize-y"} />
          </label>
          <p className="text-[11px] text-zinc-500">Utilise {"{n}"}, {"{x}"} ou {"{y}"} pour reprendre les paramètres. La définition rigoureuse apparaît à la première mention.</p>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/25 border border-violet-400/40 text-xs text-violet-100 hover:bg-violet-500/40"><Check size={13} /> Enregistrer</button>
            <button type="button" onClick={close} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-white/10"><X size={13} /> Annuler</button>
            {draft.original && <button type="button" onClick={remove} className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-rose-300 hover:bg-rose-500/10"><Trash2 size={13} /> Supprimer</button>}
          </div>
        </form>
      )}
      {removed && (
        <div role="status" className="flex items-center gap-2 text-xs text-zinc-400">
          Définition de {removed.entry.key} supprimée.
          <button type="button" onClick={() => {
            if (source !== removed.after) { setRemoved(null); return; }
            onChange(writeGlossaryEntry(source, removed.entry));
            setRemoved(null);
          }} className="flex items-center gap-1 text-violet-200 hover:underline"><RotateCcw size={12} /> Rétablir</button>
        </div>
      )}
    </section>
  );
}
