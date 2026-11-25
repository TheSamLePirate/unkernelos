import { useSyncExternalStore } from "react";
import { executeOsAction } from "./agent-os-api.ts";
import { uiSounds } from "./ui-sounds.ts";
import { wmStore, type AppId, type WorkspaceId } from "../wm/wm-store.ts";

export interface VoiceState {
  readonly open: boolean;
  readonly listening: boolean;
  readonly supported: boolean;
  readonly transcript: string;
  readonly lastResponse: string;
  readonly audioLevel: number; // 0..1
  readonly error: string | null;
  readonly errorCode: string | null;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

const APP_KEYWORDS: readonly [RegExp, AppId, string][] = [
  [/\b(preuve|preuves|proof|poule|théorème|theoreme)\b/i, "proof-studio", "Studio de preuves"],
  [/\b(notebook|jupyter|science|python|rust|ocaml)\b/i, "notebook", "Polyglot Notebook"],
  [/\b(microml|micro ml|compilateur)\b/i, "microml", "microML Explorer"],
  [/\b(swarm|essaim|multi-agent)\b/i, "agent-swarm", "Agent Swarm"],
  [/\b(store|boutique|catalogue|templates?)\b/i, "app-store", "App Store"],
  [/\b(network|réseau|reseau|http|trafic|inspecteur)\b/i, "network-inspector", "Network Inspector"],
  [/\b(media|vidéo|video|pdf|webcam|recorder)\b/i, "media-studio", "Media Studio"],
  [/\b(automation|workflow|automatisation)\b/i, "automations", "Automations"],
  [/\b(studio|agent studio|claude|pi)\b/i, "agent-studio", "Agent Studio"],
  [/\b(api|osctl|bridge|mcp)\b/i, "agent-api", "Agent OS API"],
  [/\b(ide|code|editor|éditeur)\b/i, "ide", "Code IDE"],
  [/\b(terminal|kitty|shell|console)\b/i, "terminal", "Kitty Terminal"],
  [/\b(files|explorer|fichiers|dossier)\b/i, "explorer", "File Explorer"],
  [/\b(preview|browser|aperçu|navigateur)\b/i, "preview", "Web Preview"],
  [/\b(git|github|pages)\b/i, "git", "Git & Pages"],
  [/\b(screen|écran|wayland|framebuffer)\b/i, "screen", "Graphical Display"],
  [/\b(3d|gl|virgl|cube)\b/i, "gl-window", "3D GL Viewport"],
  [/\b(database|sql|sqlite|base)\b/i, "database", "SQL Studio"],
  [/\b(services|daemon|serveur)\b/i, "services", "Service Runner"],
  [/\b(notes|markdown)\b/i, "notes", "Notes Studio"],
  [/\b(whiteboard|sketch|dessin)\b/i, "whiteboard", "Whiteboard"],
  [/\b(shader|synth|audio|musique)\b/i, "shader-synth", "Shader & Synth"],
  [/\b(process|processus|htop)\b/i, "processes", "Process Manager"],
  [/\b(monitor|moniteur|system|système|cpu)\b/i, "monitor", "System Monitor"],
  [/\b(toolchain|install|installeur)\b/i, "toolchain", "Toolchain Installer"],
  [/\b(settings|paramètres|réglages|config)\b/i, "settings", "Settings"],
  [/\b(utils|outils|json|jwt)\b/i, "dev-utils", "Dev Utilities"],
];

const THEME_KEYWORDS: readonly [RegExp, string, string, string][] = [
  [/\b(cyber|tokyo|neon|néon|synthwave)\b/i, "cyber-tokyo", "neon-grid", "Cyber Tokyo"],
  [/\b(aurora|aurore|violet)\b/i, "aurora-glass", "aurora", "Aurora Glass"],
  [/\b(obsidian|noir|dark|sombre|pro)\b/i, "obsidian-pro", "obsidian-silk", "Obsidian Pro"],
  [/\b(emerald|matrix|vert|green|plasma)\b/i, "emerald-matrix", "emerald-plasma", "Emerald Matrix"],
  [/\b(solar|amber|orange|feu|nebula|nébuleuse)\b/i, "solar-amber", "solar-nebula", "Solar Amber"],
];

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

function normalizeBcp47(raw?: string): string {
  const l = (raw || "").trim();
  if (!l) return "fr-FR";
  if (l.includes("-")) return l;
  const map: Record<string, string> = {
    fr: "fr-FR",
    en: "en-US",
    es: "es-ES",
    de: "de-DE",
    it: "it-IT",
    pt: "pt-PT",
    ja: "ja-JP",
  };
  return map[l.toLowerCase()] ?? "fr-FR";
}

function friendlySpeechError(code: string): string {
  switch (code) {
    case "network":
      return "Reconnaissance vocale cloud bloquée par ce navigateur (Brave/Arc/Chrome sans service Google Speech) ou hors-ligne. Utilise la Dictée macOS (touche 🎤 / Fn×2) dans le champ ci-dessous ou tape ta commande.";
    case "not-allowed":
    case "service-not-allowed":
      return "Accès micro refusé — autorise le microphone dans les réglages du navigateur ou tape ta commande ci-dessous.";
    case "audio-capture":
      return "Aucun microphone détecté sur cet appareil.";
    case "no-speech":
      return "Aucune voix détectée — réessaie en parlant près du micro.";
    case "aborted":
      return "";
    default:
      return `Erreur vocale (${code}) — tu peux toujours taper ou dicter ta commande ci-dessous.`;
  }
}

class VoiceOsEngine {
  private state: VoiceState = {
    open: false,
    listening: false,
    supported: Boolean(getRecognitionCtor()),
    transcript: "",
    lastResponse: "",
    audioLevel: 0,
    error: null,
    errorCode: null,
  };
  private listeners = new Set<() => void>();
  private recognition: SpeechRecognitionLike | null = null;
  private pulseRaf = 0;
  private speechActive = false;

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): VoiceState => this.state;

  private setState(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  public setOpen(open: boolean): void {
    if (!open) this.stopListening();
    this.setState({ open, error: null, errorCode: null });
  }

  public toggleOpen(): void {
    if (this.state.open) {
      this.setOpen(false);
    } else {
      this.setState({ open: true, error: null, errorCode: null });
      if (this.state.supported) void this.startListening();
    }
  }

  /**
   * Animate the reactive orb smoothly WITHOUT grabbing a competing getUserMedia()
   * CoreAudio stream (calling getUserMedia alongside webkitSpeechRecognition on macOS/iOS
   * conflicts over the mic device and triggers premature disconnects/network errors!).
   */
  private startPulseMeter(): void {
    cancelAnimationFrame(this.pulseRaf);
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (!this.state.listening) return;
      if (now - lastUpdate > 55) {
        lastUpdate = now;
        const base = this.speechActive ? 0.52 : 0.18;
        const wave =
          Math.sin(now * 0.008) * (this.speechActive ? 0.25 : 0.08) +
          Math.cos(now * 0.017) * (this.speechActive ? 0.18 : 0.04);
        this.setState({ audioLevel: Math.max(0.06, Math.min(1, base + wave)) });
      }
      this.pulseRaf = requestAnimationFrame(tick);
    };
    this.pulseRaf = requestAnimationFrame(tick);
  }

  private stopPulseMeter(): void {
    cancelAnimationFrame(this.pulseRaf);
    this.pulseRaf = 0;
    this.speechActive = false;
    this.setState({ audioLevel: 0 });
  }

  public async startListening(): Promise<void> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.setState({
        open: true,
        supported: false,
        errorCode: "unsupported",
        error: "Web Speech Recognition indisponible dans ce navigateur — tape ou dicte (Fn×2) ta commande ci-dessous.",
      });
      return;
    }

    this.stopListening();
    uiSounds.playClick();

    const rec = new Ctor();
    rec.lang = normalizeBcp47(navigator.language);
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.recognition = rec;

    this.setState({ open: true, listening: true, transcript: "", error: null, errorCode: null });
    this.startPulseMeter();

    rec.onaudiostart = () => {
      if (this.recognition !== rec) return;
      this.speechActive = false;
    };
    rec.onsoundstart = () => {
      if (this.recognition !== rec) return;
      this.speechActive = true;
    };
    rec.onspeechstart = () => {
      if (this.recognition !== rec) return;
      this.speechActive = true;
    };
    rec.onspeechend = () => {
      if (this.recognition !== rec) return;
      this.speechActive = false;
    };

    rec.onresult = (e) => {
      if (this.recognition !== rec) return;
      this.speechActive = true;
      let full = "";
      let isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res) {
          full += res[0].transcript;
          if (res.isFinal) isFinal = true;
        }
      }
      this.setState({ transcript: full });
      if (isFinal && full.trim()) {
        this.stopListening();
        void this.executeNaturalCommand(full.trim());
      }
    };

    rec.onerror = (e) => {
      if (this.recognition !== rec) return;
      const code = e.error || "unknown";
      this.stopListening();
      const friendly = friendlySpeechError(code);
      this.setState({
        errorCode: code,
        error: friendly || null,
      });
    };

    rec.onend = () => {
      if (this.recognition !== rec) return;
      if (this.state.listening) {
        const t = this.state.transcript.trim();
        this.stopListening();
        if (t) void this.executeNaturalCommand(t);
      }
    };

    try {
      rec.start();
    } catch (err) {
      this.stopListening();
      this.setState({
        errorCode: "start-failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  public stopListening(): void {
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    this.stopPulseMeter();
    this.setState({ listening: false });
  }

  public async executeNaturalCommand(raw: string): Promise<string> {
    const text = raw.trim();
    if (!text) return "";
    this.setState({ transcript: text, error: null, errorCode: null });

    let reply = "";

    // 1. Theme switching
    if (/\b(thème|theme|shader|ambiance|couleurs?|style)\b/i.test(text)) {
      for (const [re, osTheme, wallpaperShader, label] of THEME_KEYWORDS) {
        if (re.test(text)) {
          await executeOsAction("theme.set", { osTheme, wallpaperShader }, { source: "ui" });
          reply = `Theme switched to ${label}`;
          break;
        }
      }
    }

    // 2. Virtual Desktop Switch (workspace 1..4)
    if (!reply && /\b(bureau|desktop|workspace|espace)\s*([1-4])\b/i.test(text)) {
      const m = /\b(bureau|desktop|workspace|espace)\s*([1-4])\b/i.exec(text)!;
      const ws = Number(m[2]) as WorkspaceId;
      await executeOsAction("wm.workspace.switch", { workspace: ws }, { source: "ui" });
      reply = `Switched to Desktop ${ws}`;
    }

    // 3. Preview Port
    if (!reply && /\b(preview|aperçu|port)\b.*?(\d{2,5})/i.test(text)) {
      const m = /(\d{2,5})/.exec(text)!;
      const port = Number(m[1]);
      await executeOsAction("preview.open", { port, path: "/" }, { source: "ui" });
      reply = `Opened live preview on port ${port}`;
    }

    // 4. Smart Tiling
    if (!reply && /\b(tile|split|range|organise|côte à côte|grille|grid|minimize all|cache tout)\b/i.test(text)) {
      const layout = /\b(grille|grid)\b/i.test(text)
        ? "grid-4"
        : /\b(minimize|cache)\b/i.test(text)
        ? "minimize-all"
        : /\b(studio|terminal)\b/i.test(text)
        ? "focus-studio-terminal"
        : "focus-ide-preview";
      await executeOsAction("wm.tile", { layout }, { source: "ui" });
      reply = `Applied window layout: ${layout}`;
    }

    // 5. Lock Screen
    if (!reply && /\b(lock|verrouille|verrouiller)\b/i.test(text)) {
      await executeOsAction("system.lock", { locked: true }, { source: "ui" });
      reply = "Screen locked";
    }

    // 6. Clipboard History
    if (!reply && /\b(clipboard|presse-?papiers)\b/i.test(text)) {
      wmStore.setClipboardOpen(true);
      reply = "Opened Clipboard History";
    }

    // 7. Open App
    if (!reply) {
      for (const [re, appId, label] of APP_KEYWORDS) {
        if (re.test(text)) {
          await executeOsAction("wm.open", { appId }, { source: "ui" });
          reply = `Opened ${label}`;
          break;
        }
      }
    }

    // 8. Fallback: open Agent Studio
    if (!reply) {
      await executeOsAction("wm.open", { appId: "agent-studio" }, { source: "ui" });
      await executeOsAction(
        "system.notify",
        { title: "Voice Command Ready", message: text, level: "info" },
        { source: "ui" }
      );
      reply = `Opened Agent Studio for: "${text}"`;
    }

    this.setState({ lastResponse: reply });
    wmStore.pushToast("Voice OS", reply, "success");
    return reply;
  }
}

export const voiceOsEngine = new VoiceOsEngine();

export function useVoiceOs(): VoiceState {
  return useSyncExternalStore(voiceOsEngine.subscribe, voiceOsEngine.getSnapshot);
}
