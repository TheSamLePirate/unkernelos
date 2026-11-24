import { useSyncExternalStore } from "react";

export interface DynamicAppDef {
  readonly id: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly emoji: string;
  readonly accent: string;
  readonly html?: string;
  readonly guestPath?: string;
  readonly createdBy: string;
  readonly createdAt: number;
}

const STORAGE_KEY = "unkernelos:custom-apps:v1";

const DEFAULT_CUSTOM_APPS: DynamicAppDef[] = [
  {
    id: "quantum-calc",
    title: "Quantum Scientific Calc",
    shortTitle: "Calc",
    description: "Agent-built glass scientific calculator demonstrating the Self-Extending OS App SDK",
    emoji: "🧮",
    accent: "from-cyan-500 to-indigo-600",
    createdBy: "unkernelOS SDK",
    createdAt: Date.now(),
    html: `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  body { margin: 0; padding: 16px; background: #090c14; color: #f4f4f5; display: flex; flex-direction: column; height: 100vh; gap: 10px; }
  #display { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px; text-align: right; font-size: 28px; color: #67e8f9; overflow: hidden; }
  #expr { font-size: 12px; color: #71717a; min-height: 16px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; flex: 1; }
  button { border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(255,255,255,0.06); color: #fff; font-size: 15px; cursor: pointer; transition: .12s; }
  button:hover { background: rgba(139,92,246,0.3); }
  .op { background: rgba(139,92,246,0.22); color: #ddd6fe; }
  .eq { background: linear-gradient(135deg,#8b5cf6,#06b6d4); border: none; font-weight: 700; }
</style>
</head>
<body>
  <div id="display"><div id="expr"></div><div id="val">0</div></div>
  <div class="grid" id="keys"></div>
  <script>
    const keys = ['C','(',')','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','sin(','='];
    let expr = '';
    const valEl = document.getElementById('val');
    const exprEl = document.getElementById('expr');
    const grid = document.getElementById('keys');
    keys.forEach(k => {
      const b = document.createElement('button');
      b.textContent = k;
      if (['C','(',')','/','*','-','+','sin('].includes(k)) b.className = 'op';
      if (k === '=') b.className = 'eq';
      b.onclick = () => {
        if (k === 'C') { expr = ''; valEl.textContent = '0'; exprEl.textContent = ''; return; }
        if (k === '=') {
          try {
            const safe = expr.replace(/sin\\(/g, 'Math.sin(').replace(/cos\\(/g, 'Math.cos(');
            const r = Function('"use strict"; return (' + safe + ')')();
            exprEl.textContent = expr + ' =';
            valEl.textContent = String(r);
            expr = String(r);
            window.unkernelOS?.call('system.sound', { cue: 'click' });
          } catch { valEl.textContent = 'ERR'; }
          return;
        }
        expr += k;
        valEl.textContent = expr;
      };
      grid.appendChild(b);
    });
  </script>
</body>
</html>`,
  },
];

function loadApps(): DynamicAppDef[] {
  if (typeof localStorage === "undefined") return DEFAULT_CUSTOM_APPS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_APPS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CUSTOM_APPS;
  } catch {
    return DEFAULT_CUSTOM_APPS;
  }
}

function saveApps(apps: readonly DynamicAppDef[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  } catch {
    // ignore
  }
}

class DynamicAppsStore {
  private apps: readonly DynamicAppDef[] = loadApps();
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): readonly DynamicAppDef[] => this.apps;

  private emit(): void {
    saveApps(this.apps);
    for (const fn of this.listeners) fn();
  }

  public getById(id: string): DynamicAppDef | undefined {
    return this.apps.find((a) => a.id === id);
  }

  public install(def: Omit<DynamicAppDef, "createdAt">): DynamicAppDef {
    const cleanId = def.id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-") || `app-${Date.now().toString(36)}`;
    const full: DynamicAppDef = {
      ...def,
      id: cleanId,
      shortTitle: def.shortTitle || def.title.slice(0, 12),
      emoji: def.emoji || "✨",
      accent: def.accent || "from-violet-500 to-cyan-500",
      createdAt: Date.now(),
    };
    this.apps = [full, ...this.apps.filter((a) => a.id !== cleanId)];
    this.emit();
    return full;
  }

  public uninstall(id: string): boolean {
    const before = this.apps.length;
    this.apps = this.apps.filter((a) => a.id !== id);
    if (this.apps.length !== before) {
      this.emit();
      return true;
    }
    return false;
  }
}

export const dynamicAppsStore = new DynamicAppsStore();

export function useDynamicApps(): readonly DynamicAppDef[] {
  return useSyncExternalStore(dynamicAppsStore.subscribe, dynamicAppsStore.getSnapshot);
}
