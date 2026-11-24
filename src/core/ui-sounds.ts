/**
 * Subtle synthesized WebAudio micro-sound engine for AAA OS tactile feedback.
 * Zero external assets, zero network fetches, whisper-quiet studio glass chimes.
 */
class UiSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  public setEnabled(on: boolean): void {
    this.enabled = on;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") {
        void this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freqStart: number, freqEnd: number, durationSec: number, gainPeak: number, type: OscillatorType = "sine"): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.01);
    } catch {
      // ignore autoplay blocks before first user gesture
    }
  }

  public playClick(): void {
    this.tone(720, 420, 0.032, 0.022, "triangle");
  }

  public playWindowOpen(): void {
    this.tone(420, 660, 0.09, 0.026, "sine");
  }

  public playWindowClose(): void {
    this.tone(520, 290, 0.08, 0.022, "sine");
  }

  public playSnap(): void {
    this.tone(560, 820, 0.055, 0.025, "triangle");
  }

  public playWorkspaceSwitch(): void {
    this.tone(360, 540, 0.075, 0.02, "sine");
  }

  public playNotify(): void {
    this.tone(660, 880, 0.09, 0.024, "sine");
    setTimeout(() => this.tone(880, 1175, 0.12, 0.02, "sine"), 65);
  }

  public playLock(): void {
    this.tone(620, 310, 0.14, 0.028, "sine");
  }

  public playUnlock(): void {
    this.tone(440, 660, 0.1, 0.024, "sine");
    setTimeout(() => this.tone(660, 990, 0.14, 0.024, "sine"), 75);
  }
}

export const uiSounds = new UiSoundEngine();
