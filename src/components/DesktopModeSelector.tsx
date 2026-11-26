import React from "react";
import { useWm, wmStore } from "../wm/wm-store.ts";

export function DesktopModeSelector() {
  const { horizonEnabled } = useWm();
  return (
    <section aria-label="Mode de bureau" className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Votre bureau</h2>
        <p className="text-xs text-zinc-400 mt-1">
          Changez de bureau en conservant vos applications ouvertes.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { horizon: true, title: "Horizon", detail: "Par défaut · profondeur, docks vivants et tiroirs" },
          { horizon: false, title: "Bureau classique", detail: "Décors, dock, taskbar et scènes 3D personnalisables" },
        ].map(({ horizon, title, detail }) => (
          <button
            key={title}
            type="button"
            aria-pressed={horizonEnabled === horizon}
            onClick={() => wmStore.setHorizonEnabled(horizon)}
            className={`text-left p-3 rounded-xl border cursor-pointer transition ${horizonEnabled === horizon
              ? "border-cyan-400/60 bg-cyan-400/10 text-white"
              : "border-white/10 text-zinc-300 hover:bg-white/5"}`}
          >
            <strong className="block text-xs">{title}</strong>
            <span className="block text-[11px] text-zinc-400 mt-1">{detail}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">
        Thèmes, couleurs, fonds, widgets et mods CSS sont communs aux deux bureaux.
        Une variante, une décoration ou un effet de fenêtres classique active son bureau automatiquement.
      </p>
    </section>
  );
}
