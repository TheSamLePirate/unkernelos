export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  name: string;
  bytes: number;
  addedAt?: number;
  guestPath?: string;
  url?: string;
  duration?: number;
}
export interface MusicState {
  tracks: readonly MusicTrack[];
  currentId: string | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  ready: boolean;
  loading: boolean;
  error: string | null;
  storageError: string | null;
}
const initial: MusicState = {
  tracks: [],
  currentId: null,
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
  ready: false,
  loading: false,
  error: null,
  storageError: null,
};
const finite = (n: unknown, min: number, max: number) => {
  const value = Number(n);
  if (!Number.isFinite(value)) throw new Error("Valeur numérique invalide.");
  return Math.max(min, Math.min(max, value));
};
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
function completed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Écriture annulée"));
  });
}
export function musicFilename(name: string) {
  const clean = name.replace(/\.[^.]+$/, "");
  const parts = clean.split(/\s+-\s+/);
  return {
    title: parts.length > 1 ? parts.slice(1).join(" — ") : clean,
    artist: parts.length > 1 ? parts[0]! : "Artiste inconnu",
    album: "Collection personnelle",
  };
}
/** Bounded ID3v2 text tags; unsupported tag encodings fall back to the filename. */
export async function musicTags(blob: Blob, name: string) {
  const tags = musicFilename(name),
    bytes = new Uint8Array(await blob.slice(0, 2 * 1024 * 1024).arrayBuffer());
  if (
    String.fromCharCode(...bytes.slice(0, 3)) !== "ID3" ||
    ![3, 4].includes(bytes[3]!)
  )
    return tags;
  const sync = (i: number) =>
    ((bytes[i]! & 127) << 21) |
    ((bytes[i + 1]! & 127) << 14) |
    ((bytes[i + 2]! & 127) << 7) |
    (bytes[i + 3]! & 127);
  const end = Math.min(bytes.length, 10 + sync(6));
  let offset = 10;
  if (bytes[5]! & 0xc0) return tags; // Extended/unsynchronised headers are safely ignored.
  while (offset + 10 <= end) {
    const key = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size =
      bytes[3] === 4
        ? sync(offset + 4)
        : new DataView(bytes.buffer).getUint32(offset + 4);
    if (!size || offset + 10 + size > end) break;
    if (["TIT2", "TPE1", "TALB"].includes(key))
      try {
        const encoding = bytes[offset + 10],
          data = bytes.slice(offset + 11, offset + 10 + size);
        const value = new TextDecoder(
          encoding === 0
            ? "windows-1252"
            : encoding === 1
              ? "utf-16"
              : encoding === 2
                ? "utf-16be"
                : "utf-8",
        )
          .decode(data)
          .replace(/\0/g, "")
          .trim();
        if (value)
          tags[key === "TIT2" ? "title" : key === "TPE1" ? "artist" : "album"] =
            value;
      } catch {}
    offset += 10 + size;
  }
  return tags;
}
export class Mp3Player {
  private state: MusicState = { ...initial };
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private db: IDBDatabase | null = null;
  private boot: Promise<void> | null = null;
  private memory = new Map<string, Blob>();
  private objectUrl: string | null = null;
  private generation = 0;
  private cleanup: (() => void) | null = null;
  private writes = Promise.resolve();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<MusicState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  async initialize() {
    if (this.boot) return this.boot;
    this.boot = (async () => {
      try {
        if (typeof indexedDB === "undefined")
          throw new Error("IndexedDB indisponible");
        const open = indexedDB.open("unkernelos-sonora", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("tracks", { keyPath: "id" });
          open.result.createObjectStore("audio");
        };
        this.db = await request(open);
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.update({
            storageError:
              "La bibliothèque a changé dans un autre onglet. Rechargez.",
          });
        };
        const tracks = await request<MusicTrack[]>(
          this.db.transaction("tracks").objectStore("tracks").getAll(),
        );
        tracks.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
        this.update({ tracks, currentId: tracks[0]?.id ?? null, ready: true });
        if (tracks.length && this.audio)
          await this.select(tracks[0]!.id, false);
      } catch (error) {
        this.update({
          ready: true,
          storageError: "Bibliothèque en mémoire uniquement : " + String(error),
        });
      }
    })();
    return this.boot;
  }
  attach(audio: HTMLAudioElement) {
    this.audio = audio;
    audio.preload = "metadata";
    audio.volume = this.state.volume;
    audio.muted = this.state.muted;
    const events: Record<string, () => void> = {
      play: () => this.update({ playing: true, error: null }),
      pause: () => this.update({ playing: false }),
      timeupdate: () =>
        this.update({
          position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        }),
      loadedmetadata: () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        this.update({
          duration,
          loading: false,
          tracks: this.state.tracks.map((t) =>
            t.id === this.state.currentId ? { ...t, duration } : t,
          ),
        });
      },
      waiting: () => this.update({ loading: true }),
      canplay: () => this.update({ loading: false }),
      ended: () => {
        void this.advance(true).catch((e) => this.fail(e));
      },
      error: () =>
        this.fail(
          new Error(
            "Ce fichier ne peut pas être lu. Vérifiez son format et sa source.",
          ),
        ),
    };
    Object.entries(events).forEach(([name, fn]) =>
      audio.addEventListener(name, fn),
    );
    this.cleanup = () =>
      Object.entries(events).forEach(([name, fn]) =>
        audio.removeEventListener(name, fn),
      );
    if (this.state.ready && this.state.currentId)
      void this.select(this.state.currentId, false).catch((e) => this.fail(e));
    return () => {
      this.generation++;
      this.cleanup?.();
      this.cleanup = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      this.audio = null;
      this.revoke();
      this.update({ playing: false });
      queueMicrotask(() => {
        if (!this.audio)
          void Promise.allSettled([this.boot, this.writes]).then(() => {
            if (!this.audio) {
              this.db?.close();
              this.db = null;
              this.boot = null;
            }
          });
      });
    };
  }
  private revoke() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
  private fail(error: unknown) {
    this.update({
      error:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Le navigateur demande un clic sur Lecture pour autoriser le son."
          : error instanceof Error
            ? error.message
            : String(error),
      loading: false,
      playing: false,
    });
  }
  private persist(work: (tx: IDBTransaction) => void) {
    this.writes = this.writes
      .then(async () => {
        if (!this.db) throw new Error("Stockage indisponible");
        const tx = this.db.transaction(["tracks", "audio"], "readwrite");
        const done = completed(tx);
        work(tx);
        await done;
      })
      .catch((error) =>
        this.update({
          storageError: "Conservation interrompue : " + String(error),
        }),
      );
    return this.writes;
  }
  async add(blob: Blob, name: string, guestPath?: string) {
    if (
      !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(name) &&
      !blob.type.startsWith("audio/")
    )
      throw new Error(
        "Choisissez un fichier audio MP3 ou un autre format pris en charge.",
      );
    await this.initialize();
    const track: MusicTrack = {
      id: crypto.randomUUID(),
      ...(await musicTags(blob, name)),
      name,
      bytes: blob.size,
      addedAt: Date.now(),
      guestPath,
    };
    this.memory.set(track.id, blob);
    await this.persist((tx) => {
      tx.objectStore("tracks").put(track);
      tx.objectStore("audio").put(blob, track.id);
    });
    if (!this.state.storageError) this.memory.delete(track.id);
    this.update({ tracks: [...this.state.tracks, track] });
    if (!this.state.currentId) await this.select(track.id, false);
    return { id: track.id, title: track.title };
  }
  async addUrl(value: string) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("URL HTTP(S) requise.");
    await this.initialize();
    const name = decodeURIComponent(
      url.pathname.split("/").at(-1) || "Audio distant.mp3",
    );
    const track: MusicTrack = {
      id: crypto.randomUUID(),
      ...musicFilename(name),
      name,
      bytes: 0,
      addedAt: Date.now(),
      url: url.href,
    };
    await this.persist((tx) => tx.objectStore("tracks").put(track));
    this.update({ tracks: [...this.state.tracks, track] });
    if (!this.state.currentId) await this.select(track.id, false);
    return { id: track.id };
  }
  async select(id: string, play = false) {
    const track = this.state.tracks.find((t) => t.id === id);
    if (!track) throw new Error("Piste inconnue.");
    const generation = ++this.generation;
    this.audio?.pause();
    this.update({
      currentId: id,
      position: 0,
      duration: track.duration ?? 0,
      playing: false,
      loading: true,
      error: null,
    });
    try {
      let source = track.url;
      let blob = this.memory.get(id);
      if (!source && !blob && this.db)
        blob = await request<Blob | undefined>(
          this.db.transaction("audio").objectStore("audio").get(id),
        );
      if (generation !== this.generation) return { superseded: true };
      if (!source && !blob)
        throw new Error(
          "Le fichier audio n’est plus disponible. Réimportez-le.",
        );
      this.revoke();
      if (blob) source = this.objectUrl = URL.createObjectURL(blob);
      if (this.audio) {
        this.audio.src = source!;
        this.audio.load();
        if (play) await this.play();
      }
      this.update({ loading: false });
      return { currentId: id };
    } catch (e) {
      if (generation === this.generation) this.fail(e);
      throw e;
    }
  }
  async play() {
    const audio = this.audio;
    if (!audio || !this.state.currentId)
      throw new Error("Ajoutez une piste avant de lancer la lecture.");
    try {
      await audio.play();
      return { playing: !audio.paused };
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  pause() {
    this.audio?.pause();
    this.update({ playing: false });
    return { playing: false };
  }
  toggle() {
    return this.state.playing ? this.pause() : this.play();
  }
  async advance(ended = false, back = false) {
    const tracks = this.state.tracks;
    if (!tracks.length) throw new Error("La file est vide.");
    if (back && this.state.position > 3) {
      this.seek(0);
      return { restarted: true };
    }
    const index = tracks.findIndex((t) => t.id === this.state.currentId);
    if (ended && this.state.repeat === "one") {
      this.seek(0);
      return this.play();
    }
    let next = index + (back ? -1 : 1);
    if (this.state.shuffle && tracks.length > 1) {
      const choices = tracks.filter((t) => t.id !== this.state.currentId);
      next = tracks.indexOf(
        choices[Math.floor(Math.random() * choices.length)]!,
      );
    }
    if (ended && next >= tracks.length && this.state.repeat === "off") {
      this.pause();
      return { ended: true };
    }
    next = (next + tracks.length) % tracks.length;
    return this.select(tracks[next]!.id, ended || this.state.playing);
  }
  seek(seconds: unknown) {
    const position = finite(seconds, 0, this.state.duration || 0);
    if (this.audio) this.audio.currentTime = position;
    this.update({ position });
    return { position };
  }
  volume(value: unknown) {
    const volume = finite(value, 0, 1);
    if (this.audio) this.audio.volume = volume;
    this.update({ volume });
    return { volume };
  }
  mute(value: unknown) {
    const muted = Boolean(value);
    if (this.audio) this.audio.muted = muted;
    this.update({ muted });
    return { muted };
  }
  shuffle(value: unknown) {
    this.update({ shuffle: Boolean(value) });
    return { shuffle: this.state.shuffle };
  }
  repeat(value: unknown) {
    if (!["off", "all", "one"].includes(String(value)))
      throw new Error("repeat doit être off, all ou one.");
    this.update({ repeat: value as MusicState["repeat"] });
    return { repeat: this.state.repeat };
  }
  async remove(id: string) {
    if (!this.state.tracks.some((t) => t.id === id))
      throw new Error("Piste inconnue.");
    const wasCurrent = this.state.currentId === id,
      playing = this.state.playing;
    if (wasCurrent) this.pause();
    this.update({ tracks: this.state.tracks.filter((t) => t.id !== id) });
    await this.persist((tx) => {
      tx.objectStore("tracks").delete(id);
      tx.objectStore("audio").delete(id);
    });
    this.memory.delete(id);
    if (wasCurrent && this.state.currentId === id) {
      const next = this.state.tracks[0];
      if (next) await this.select(next.id, playing);
      else {
        this.generation++;
        this.revoke();
        this.audio?.removeAttribute("src");
        this.audio?.load();
        this.update({
          currentId: null,
          position: 0,
          duration: 0,
          loading: false,
        });
      }
    }
    return { removed: id };
  }
  async clear() {
    this.pause();
    this.generation++;
    this.revoke();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.memory.clear();
    this.update({
      tracks: [],
      currentId: null,
      position: 0,
      duration: 0,
      loading: false,
    });
    await this.persist((tx) => {
      tx.objectStore("tracks").clear();
      tx.objectStore("audio").clear();
    });
    return { cleared: true };
  }
}
