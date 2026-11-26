import { Effect } from "effect";
import {
  ArrowDownLeft,
  ArrowDownRight,
  Disc3,
  FolderOpen,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  WindowSessionContext,
  useAppSurface,
  useSurfaceRevision,
} from "../../core/app-surface-registry.tsx";
import { Mp3Player } from "../../core/mp3-player.ts";
import { appRuntime, GuestFsService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";
import "./music-player.css";
const time = (value: number) =>
  Number.isFinite(value)
    ? Math.floor(value / 60) +
      ":" +
      String(Math.floor(value % 60)).padStart(2, "0")
    : "0:00";
let mediaOwner: Mp3Player | null = null;
export function MusicPlayerApp() {
  const win = useContext(WindowSessionContext),
    [player] = useState(() => new Mp3Player()),
    state = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const audio = useRef<HTMLAudioElement>(null),
    picker = useRef<HTMLInputElement>(null),
    openedPath = useRef("");
  const [query, setQuery] = useState(""),
    [importValue, setImportValue] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState("");
  const current = state.tracks.find((t) => t.id === state.currentId),
    tracks = state.tracks.filter((t) =>
      [t.title, t.artist, t.album]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    );
  const perform = (fn: () => unknown | Promise<unknown>) => {
    setLocalError("");
    void Promise.resolve()
      .then(fn)
      .catch((e) => setLocalError(e instanceof Error ? e.message : String(e)));
  };
  const importSource = async (args: Record<string, unknown>) => {
    if (typeof args.path === "string" && args.path.startsWith("/")) {
      const bytes = await appRuntime.runPromise(
        Effect.flatMap(GuestFsService, (fs) =>
          fs.readFileBytes(args.path as string),
        ),
      );
      return player.add(
        new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }),
        args.path.split("/").at(-1) ?? "Audio.mp3",
        args.path,
      );
    }
    if (typeof args.url === "string") return player.addUrl(args.url);
    throw new Error("Indiquez path (fichier Linux) ou url (HTTP/S).");
  };
  useEffect(() => {
    const detach = player.attach(audio.current!);
    void player.initialize();
    return detach;
  }, [player]);
  useEffect(() => {
    const path = String(win?.props?.filePath ?? "");
    if (path && path !== openedPath.current) {
      openedPath.current = path;
      perform(() => importSource({ path }));
    }
  }, [win?.props?.filePath]);
  const revision = useSurfaceRevision(
    state.currentId,
    state.playing,
    state.volume,
    state.muted,
    state.shuffle,
    state.repeat,
    state.tracks.map((t) => t.id).join(","),
    state.error,
  );
  const number = (key: string, label: string) => ({
    type: "object",
    properties: { [key]: { type: "number", description: label } },
    required: [key],
  });
  const flag = (key: string) => ({
    type: "object",
    properties: { [key]: { type: "boolean" } },
    required: [key],
  });
  const byId = {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  };
  useAppSurface({
    document: "sonora:library",
    title: current ? current.title + " · Sonora" : "Sonora · Musique",
    revision,
    status: state.error
      ? "disconnected"
      : state.loading
        ? "loading"
        : state.playing
          ? "live"
          : "paused",
    dock: {
      label: state.playing ? "Mettre la musique en pause" : "Lire la musique",
      glyph: state.playing ? "pause" : "play",
      primaryAction: "toggle",
      value: current?.title ?? "Sonora",
      detail: current
        ? current.artist + " · " + current.title
        : "Ajoutez vos MP3",
      progress: state.duration ? state.position / state.duration : 0,
    },
    state: {
      ...state,
      current: current ? { ...current, url: undefined } : null,
      tracks: state.tracks.map(({ url, ...t }) => ({ ...t, remote: !!url })),
      formats: "MP3 et formats audio décodables par le navigateur",
    },
    actions: {
      play: { label: "Lire la musique", run: () => player.play() },
      pause: { label: "Mettre en pause", run: () => player.pause() },
      toggle: { label: "Basculer lecture/pause", run: () => player.toggle() },
      next: { label: "Piste suivante", run: () => player.advance() },
      previous: {
        label: "Piste précédente ou début",
        run: () => player.advance(false, true),
      },
      seek: {
        label: "Déplacer la tête de lecture (secondes)",
        paramsSchema: number("seconds", "Position en secondes"),
        run: (a) => player.seek(a.seconds),
      },
      volume: {
        label: "Régler le volume (0–1)",
        paramsSchema: number("value", "Volume entre 0 et 1"),
        run: (a) => player.volume(a.value),
      },
      mute: {
        label: "Couper ou rétablir le son",
        paramsSchema: flag("muted"),
        run: (a) => player.mute(a.muted),
      },
      shuffle: {
        label: "Lecture aléatoire",
        paramsSchema: flag("enabled"),
        run: (a) => player.shuffle(a.enabled),
      },
      repeat: {
        label: "Répétition",
        paramsSchema: {
          type: "object",
          properties: { mode: { enum: ["off", "all", "one"] } },
          required: ["mode"],
        },
        run: (a) => player.repeat(a.mode),
      },
      select: {
        label: "Sélectionner une piste",
        paramsSchema: {
          ...byId,
          properties: { id: { type: "string" }, play: { type: "boolean" } },
        },
        run: (a) => player.select(String(a.id), a.play === true),
      },
      remove: {
        label: "Retirer une piste de la bibliothèque",
        paramsSchema: byId,
        run: (a) => player.remove(String(a.id)),
      },
      clear: { label: "Vider la bibliothèque", run: () => player.clear() },
      import: {
        label: "Importer un audio Linux ou une URL",
        paramsSchema: {
          type: "object",
          properties: { path: { type: "string" }, url: { type: "string" } },
        },
        run: importSource,
      },
    },
  });
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.playing) return;
    mediaOwner = player;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current?.title ?? "Sonora",
      artist: current?.artist ?? "",
      album: current?.album ?? "",
    });
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => perform(() => player.play()),
      pause: () => player.pause(),
      nexttrack: () => perform(() => player.advance()),
      previoustrack: () => perform(() => player.advance(false, true)),
      seekto: (d) => {
        if (d.seekTime !== undefined) player.seek(d.seekTime);
      },
    };
    for (const [action, handler] of Object.entries(handlers))
      try {
        navigator.mediaSession.setActionHandler(
          action as MediaSessionAction,
          handler!,
        );
      } catch {}
    return () => {
      if (mediaOwner !== player) return;
      mediaOwner = null;
      for (const action of Object.keys(handlers))
        try {
          navigator.mediaSession.setActionHandler(
            action as MediaSessionAction,
            null,
          );
        } catch {}
    };
  }, [player, state.playing, current?.id]);
  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    setLocalError("");
    try {
      for (const file of Array.from(files)) await player.add(file, file.name);
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="sonora"
      data-music-player
      data-playing={state.playing}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        else {
          const raw = e.dataTransfer.getData("application/x-unkernel-file");
          if (raw)
            try {
              perform(() => importSource({ path: JSON.parse(raw).path }));
            } catch (error) {
              setLocalError(String(error));
            }
        }
      }}
    >
      <audio ref={audio} data-sonora-audio />
      <header className="sonora-header">
        <div className="sonora-brand">
          <Radio size={21} />
          <strong>
            sonora<span>YOUR SOUND, YOUR SPACE</span>
          </strong>
        </div>
        <div>
          <button
            title="Docker à gauche"
            aria-label="Docker Sonora à gauche"
            onClick={() =>
              win &&
              wmStore.placeHorizonWindow(win.id, "left", undefined, {
                depth: 1,
                y: 0.5,
                anchor: 0.5,
              })
            }
          >
            <ArrowDownLeft size={16} />
          </button>
          <button
            title="Docker à droite"
            aria-label="Docker Sonora à droite"
            onClick={() =>
              win &&
              wmStore.placeHorizonWindow(win.id, "right", undefined, {
                depth: 1,
                y: 0.5,
                anchor: 0.5,
              })
            }
          >
            <ArrowDownRight size={16} />
          </button>
          <button
            className="sonora-add"
            onClick={() => picker.current?.click()}
            disabled={busy}
          >
            <Plus size={15} />
            {busy ? "Import…" : "Ajouter des titres"}
          </button>
        </div>
      </header>
      <input
        ref={picker}
        type="file"
        accept="audio/*,.mp3"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {(localError || state.error || state.storageError) && (
        <div className="sonora-error" role="alert">
          {localError || state.error || state.storageError}
          <button
            onClick={() => setLocalError("")}
            aria-label="Masquer le message"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <main className="sonora-main">
        <section className="sonora-now">
          <div className="sonora-eyebrow">
            <i />
            {state.playing
              ? "À L’ÉCOUTE"
              : state.currentId
                ? "PRÊT À JOUER"
                : "VOTRE COLLECTION"}
          </div>
          <div className="sonora-art">
            <div className="sonora-record">
              <div className="sonora-record-label">
                <Music2 size={28} strokeWidth={1.3} />
                <span>SONORA</span>
                <small>33⅓ · PERSONAL COLLECTION</small>
              </div>
            </div>
            <div className="sonora-arm" />
            <span className="sonora-art-caption">
              A little space for your sound.
            </span>
          </div>
          <div className="sonora-track-info">
            <h1>{current?.title ?? "Faites entrer la musique."}</h1>
            <p>
              {current?.artist ??
                "Déposez vos MP3 ici et composez votre espace sonore."}
            </p>
            <small>
              {current?.album ?? "Local. Personnel. Toujours à portée de main."}
            </small>
          </div>
        </section>
        <section className="sonora-queue">
          <div className="sonora-queue-title">
            <div>
              <ListMusic size={16} />
              <h2>Votre collection</h2>
              <span>{state.tracks.length}</span>
            </div>
            <button
              aria-label="Importer un chemin Linux ou une URL"
              title="Fichier Linux ou URL"
              onClick={() => setImportOpen((v) => !v)}
            >
              <FolderOpen size={17} />
            </button>
          </div>
          {importOpen && (
            <form
              className="sonora-import"
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  await importSource(
                    importValue.startsWith("/")
                      ? { path: importValue }
                      : { url: importValue },
                  );
                  setImportValue("");
                  setImportOpen(false);
                });
              }}
            >
              <input
                aria-label="Chemin Linux ou URL audio"
                placeholder="/home/user/Musique/titre.mp3 ou https://…"
                value={importValue}
                onChange={(e) => setImportValue(e.target.value)}
              />
              <button type="submit" disabled={!importValue.trim()}>
                Importer
              </button>
            </form>
          )}
          <label className="sonora-search">
            <Search size={14} />
            <input
              aria-label="Rechercher une piste"
              placeholder="Un titre, un artiste…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="sonora-track-list">
            {tracks.map((track, index) => (
              <article
                key={track.id}
                className="sonora-track"
                data-current={track.id === state.currentId}
              >
                <button
                  className="sonora-track-select"
                  onClick={() => perform(() => player.select(track.id, true))}
                  aria-label={"Lire " + track.title}
                >
                  <span className="sonora-track-index">
                    {track.id === state.currentId && state.playing ? (
                      <span className="sonora-eq">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.artist}</small>
                  </span>
                  <time>
                    {track.duration
                      ? time(track.duration)
                      : track.bytes
                        ? (track.bytes / 1024 / 1024).toFixed(1) + " Mo"
                        : "URL"}
                  </time>
                </button>
                <button
                  className="sonora-remove"
                  aria-label={"Retirer " + track.title}
                  onClick={() => perform(() => player.remove(track.id))}
                >
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
            {!tracks.length && (
              <div className="sonora-empty">
                <Disc3 size={37} strokeWidth={1} />
                <h3>
                  {state.tracks.length
                    ? "Aucun résultat."
                    : "Vos morceaux ont une place ici."}
                </h3>
                <p>
                  {state.tracks.length
                    ? "Essayez un autre titre ou artiste."
                    : "Déposez des fichiers audio ou choisissez-les sur votre appareil."}
                </p>
                {!state.tracks.length && (
                  <button onClick={() => picker.current?.click()}>
                    <Plus size={14} />
                    Choisir mes MP3
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="sonora-queue-footer">
            <span>
              <i />
              Bibliothèque personnelle
            </span>
            <span>
              {state.storageError ? "Session temporaire" : "Stockage local"}
            </span>
          </div>
        </section>
      </main>
      <footer className="sonora-transport">
        <div className="sonora-timeline">
          <time>{time(state.position)}</time>
          <input
            type="range"
            min="0"
            max={state.duration || 1}
            step="0.1"
            value={Math.min(state.position, state.duration || 1)}
            disabled={!state.duration}
            aria-label="Position de lecture"
            onChange={(e) => perform(() => player.seek(e.target.value))}
          />
          <time>{time(state.duration)}</time>
        </div>
        <div className="sonora-controls">
          <div className="sonora-volume">
            <button
              aria-label={state.muted ? "Rétablir le son" : "Couper le son"}
              aria-pressed={state.muted}
              onClick={() => player.mute(!state.muted)}
            >
              {state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step=".01"
              value={state.volume}
              onChange={(e) => player.volume(e.target.value)}
            />
          </div>
          <div className="sonora-playback">
            <button
              title="Aléatoire"
              aria-label="Lecture aléatoire"
              aria-pressed={state.shuffle}
              onClick={() => player.shuffle(!state.shuffle)}
            >
              <Shuffle size={16} />
            </button>
            <button
              aria-label="Piste précédente"
              disabled={!current}
              onClick={() => perform(() => player.advance(false, true))}
            >
              <SkipBack size={21} />
            </button>
            <button
              className="sonora-play"
              aria-label={state.playing ? "Mettre en pause" : "Lire la musique"}
              disabled={!current || state.loading}
              onClick={() => perform(() => player.toggle())}
            >
              {state.playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
            </button>
            <button
              aria-label="Piste suivante"
              disabled={!current}
              onClick={() => perform(() => player.advance())}
            >
              <SkipForward size={21} />
            </button>
            <button
              title={"Répétition : " + state.repeat}
              aria-label={"Répétition : " + state.repeat}
              aria-pressed={state.repeat !== "off"}
              onClick={() =>
                player.repeat(
                  state.repeat === "off"
                    ? "all"
                    : state.repeat === "all"
                      ? "one"
                      : "off",
                )
              }
            >
              {state.repeat === "one" ? (
                <Repeat1 size={16} />
              ) : (
                <Repeat size={16} />
              )}
            </button>
          </div>
          <div className="sonora-format">
            {state.playing ? "LECTURE EN COURS" : "SONORA"}
            <span>
              {current?.name.split(".").at(-1)?.toUpperCase() ?? "MP3"} · VOTRE
              MUSIQUE
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
