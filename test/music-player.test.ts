import { describe, test, expect } from "bun:test";
import { Mp3Player, musicTags } from "../src/core/mp3-player.ts";
class AudioFake extends EventTarget {
  src = "";
  preload = "";
  volume = 1;
  muted = false;
  currentTime = 0;
  duration = 24;
  paused = true;
  blocked = false;
  load() {
    if (this.src) this.dispatchEvent(new Event("loadedmetadata"));
  }
  removeAttribute() {
    this.src = "";
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  async play() {
    if (this.blocked) throw new DOMException("blocked", "NotAllowedError");
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }
}
describe("Sonora transport", () => {
  test("real media events drive play/pause and numeric parameters are bounded", async () => {
    const player = new Mp3Player(),
      audio = new AudioFake();
    const detach = player.attach(audio as unknown as HTMLAudioElement);
    await player.addUrl("https://example.com/Artist%20-%20Track.mp3");
    await player.play();
    expect(player.getSnapshot().playing).toBe(true);
    expect(player.seek(100).position).toBe(24);
    expect(player.volume(3).volume).toBe(1);
    expect(() => player.seek(NaN)).toThrow();
    player.pause();
    expect(player.getSnapshot().playing).toBe(false);
    detach();
  });
  test("autoplay rejection reports failure instead of pretending playback started", async () => {
    const player = new Mp3Player(),
      audio = new AudioFake();
    audio.blocked = true;
    player.attach(audio as unknown as HTMLAudioElement);
    await player.addUrl("https://example.com/a.mp3");
    await expect(player.play()).rejects.toThrow();
    expect(player.getSnapshot().playing).toBe(false);
    expect(player.getSnapshot().error).toContain("clic");
  });
  test("end-of-queue stops, repeat-one restarts, and deleting current advances safely", async () => {
    const player = new Mp3Player(),
      audio = new AudioFake();
    player.attach(audio as unknown as HTMLAudioElement);
    const a = await player.addUrl("https://example.com/a.mp3"),
      b = await player.addUrl("https://example.com/b.mp3");
    await player.select(b.id, true);
    await player.advance(true);
    expect(player.getSnapshot().playing).toBe(false);
    player.repeat("one");
    audio.currentTime = 20;
    await player.advance(true);
    expect(audio.currentTime).toBe(0);
    expect(player.getSnapshot().currentId).toBe(b.id);
    await player.remove(b.id);
    expect(player.getSnapshot().currentId).toBe(a.id);
    await player.clear();
    expect(player.getSnapshot().tracks).toHaveLength(0);
    expect(player.getSnapshot().currentId).toBeNull();
  });
  test("rejects non-HTTP URLs and invalid repeat modes", async () => {
    const player = new Mp3Player();
    await expect(player.addUrl("javascript:alert(1)")).rejects.toThrow();
    expect(() => player.repeat("forever")).toThrow();
  });
  test("reads actual ID3v2 title text and preserves filename fallbacks", async () => {
    const text = new TextEncoder().encode("Signal étude");
    const frame = new Uint8Array(11 + text.length);
    frame.set(new TextEncoder().encode("TIT2"));
    new DataView(frame.buffer).setUint32(4, 1 + text.length);
    frame[10] = 3;
    frame.set(text, 11);
    const header = new Uint8Array([73, 68, 51, 3, 0, 0, 0, 0, 0, frame.length]);
    const tags = await musicTags(
      new Blob([header, frame]),
      "Artist - File.mp3",
    );
    expect(tags.title).toBe("Signal étude");
    expect(tags.artist).toBe("Artist");
  });
});
