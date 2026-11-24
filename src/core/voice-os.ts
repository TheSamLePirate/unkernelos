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
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const APP_KEYWORDS: readonly [RegExp, AppId, string][] = [
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

class VoiceOsEngine {
  private state: VoiceState = {
    open: false,
    listening: false,
    supported: Boolean(getRecognitionCtor()),
    transcript: "",
    lastResponse: "",
    audioLevel: 0,
    error: null,
  };
  private listeners = new Set<() => void>();
  private recognition: SpeechRecognitionLike | null = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private rafId = 0;

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
    this.setState({ open, error: null });
  }

  public toggleOpen(): void {
    if (this.state.open) {
      this.setOpen(false);
    } else {
      this.setState({ open: true, error: null });
      if (this.state.supported) void this.startListening();
    }
  }

  private async startMicMeter(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      const ctx = new AudioContext();
      this.audioCtx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!this.state.listening) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i]!;
        const avg = sum / data.length / 128;
        this.setState({ audioLevel: Math.min(1, avg) });
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      // Mic meter optional — recognition can still run
    }
  }

  private stopMicMeter(): void {
    cancelAnimationFrame(this.rafId);
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.setState({ audioLevel: 0 });
  }

  public async startListening(): Promise<void> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.setState({
        open: true,
        supported: false,
        error: "Web Speech Recognition unavailable in this browser — type a natural command below!",
      });
      return;
    }

    this.stopListening();
    uiSounds.playClick();
    const rec = new Ctor();
    rec.lang = navigator.language || "fr-FR";
    rec.continuous = false;
    rec.interimResults = true;
    this.recognition = rec;

    this.setState({ open: true, listening: true, transcript: "", error: null });
    void this.startMicMeter();

    rec.onresult = (e) => {
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
      this.stopListening();
      this.setState({ error: `Voice error: ${e.error}` });
    };

    rec.onend = () => {
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
      this.setState({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  public stopListening(): void {
    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }
    this.recognition = null;
    this.stopMicMeter();
    this.setState({ listening: false });
  }

  public async executeNaturalCommand(raw: string): Promise<string> {
    const text = raw.trim();
    if (!text) return "";
    this.setState({ transcript: text, error: null });

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

    // 8. Fallback: run as shell/agent command notification or open Agent Studio
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
