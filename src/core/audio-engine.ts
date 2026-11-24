import { pcmToFloat32, type SoundChunk } from "unkernel";

export class GuestAudioEngine {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private muted = false;
  private volume = 0.85;
  private gain: GainNode | null = null;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.value = muted ? 0 : this.volume;
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gain && !this.muted) {
      this.gain.gain.value = this.volume;
    }
  }

  public getState() {
    return { muted: this.muted, volume: this.volume, running: this.ctx?.state === "running" };
  }

  private ensureContext(sampleRate: number): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC({ sampleRate });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : this.volume;
      this.gain.connect(this.ctx.destination);
      this.nextTime = this.ctx.currentTime + 0.04;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public pushChunk(chunk: SoundChunk): void {
    const rate = chunk.format.rate || 44100;
    const channels = Math.max(1, Math.min(2, chunk.format.channels || 2));
    const ctx = this.ensureContext(rate);
    if (!ctx || !this.gain) return;

    const interleaved = pcmToFloat32(chunk.data, chunk.format);
    const frameCount = Math.floor(interleaved.length / channels);
    if (frameCount <= 0) return;

    const buffer = ctx.createBuffer(channels, frameCount, rate);
    for (let ch = 0; ch < channels; ch++) {
      const out = buffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        out[i] = interleaved[i * channels + ch] ?? 0;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);

    const now = ctx.currentTime;
    if (this.nextTime < now + 0.01 || this.nextTime > now + 0.4) {
      this.nextTime = now + 0.03;
    }
    src.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.gain = null;
    }
  }
}
