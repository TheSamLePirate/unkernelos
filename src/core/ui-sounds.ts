export type SoundProfileId = "crystal" | "mechanical" | "synth-retro" | "zen-wood" | "silent";

/**
 * Multi-Profile Synthesized WebAudio Micro-Sound Engine for AAA OS tactile feedback.
 * Supports 5 studio acoustic profiles (Crystal Glass, Mechanical Tactile, Cyber Synth, Zen Wood, Silent).
 */
class UiSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private profile: SoundProfileId = "crystal";

  public setEnabled(on: boolean): void {
    this.enabled = on;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setProfile(profile: SoundProfileId): void {
    this.profile = profile;
  }

  public getProfile(): SoundProfileId {
    return this.profile;
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled || this.profile === "silent" || typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  private tone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    gainPeak: number,
    type: OscillatorType = "sine"
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const p = this.profile;
      const effType: OscillatorType =
        p === "mechanical"
          ? "triangle"
          : p === "synth-retro"
          ? "sawtooth"
          : p === "zen-wood"
          ? "sine"
          : type;
      const pitchMult =
        p === "mechanical" ? 0.58 : p === "synth-retro" ? 1.12 : p === "zen-wood" ? 0.72 : 1.0;
      const durMult = p === "mechanical" ? 0.52 : p === "zen-wood" ? 1.45 : 1.0;
      const gainMult = p === "synth-retro" ? 0.65 : p === "mechanical" ? 1.25 : 1.0;

      osc.type = effType;
      osc.frequency.setValueAtTime(Math.max(40, freqStart * pitchMult), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd * pitchMult), now + durationSec * durMult);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak * gainMult, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * durMult);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec * durMult + 0.012);
    } catch {
      // ignore autoplay blocks before first user gesture
    }
  }

  public playClick(): void {
    this.tone(740, 420, 0.032, 0.022, "triangle");
  }

  public playWindowOpen(): void {
    this.tone(420, 680, 0.09, 0.026, "sine");
  }

  public playWindowClose(): void {
    this.tone(520, 280, 0.08, 0.022, "sine");
  }

  public playSnap(): void {
    this.tone(560, 840, 0.055, 0.025, "triangle");
  }

  public playShade(): void {
    this.tone(620, 480, 0.06, 0.02, "sine");
  }

  public playHotCorner(): void {
    this.tone(520, 920, 0.065, 0.024, "sine");
  }

  public playWorkspaceSwitch(): void {
    this.tone(360, 560, 0.075, 0.02, "sine");
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
