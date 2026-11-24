import { Effect } from "effect";
import {
  Camera,
  Download,
  FileAudio,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Save,
  Square,
  Timer,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { appRuntime, GuestFsService, VmService } from "../../core/runtime.ts";
import { uiSounds } from "../../core/ui-sounds.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";

type StudioTab = "viewer" | "recorder" | "focus";

interface LoadedMedia {
  readonly name: string;
  readonly path?: string;
  readonly kind: "image" | "video" | "audio" | "pdf" | "unknown";
  readonly url: string;
  readonly size: number;
}

function detectMediaKind(name: string): LoadedMedia["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "mkv", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "unknown";
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

export const MediaStudioApp: React.FC = () => {
  const wm = useWm();
  const [tab, setTab] = useState<StudioTab>("viewer");
  const [guestPath, setGuestPath] = useState("");
  const [media, setMedia] = useState<LoadedMedia | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Screen / Camera Recorder state
  const [recording, setRecording] = useState(false);
  const [recordMode, setRecordMode] = useState<"screen" | "camera">("screen");
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const filePickerRef = useRef<HTMLInputElement>(null);

  // Focus Pomodoro Timer state
  const [focusDuration, setFocusDuration] = useState(25 * 60);
  const [focusRemaining, setFocusRemaining] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);

  // Open file requested by File Explorer or osctl
  useEffect(() => {
    if (wm.mediaOpenFilePath) {
      const target = wm.mediaOpenFilePath;
      wmStore.clearMediaOpenFile();
      setTab("viewer");
      setGuestPath(target);
      void openGuestFile(target);
    }
  }, [wm.mediaOpenFilePath]);

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Pomodoro timer
  useEffect(() => {
    if (!focusRunning) return;
    const id = setInterval(() => {
      setFocusRemaining((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          uiSounds.playNotify();
          wmStore.pushToast("Focus Session Complete!", "Time for a quick break.", "success");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [focusRunning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (media?.url) URL.revokeObjectURL(media.url);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, []);

  const openGuestFile = async (filePath: string) => {
    const clean = filePath.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    const res = await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.readFileBytes(clean)))
    );
    setLoading(false);
    if (res._tag === "Left") {
      setError(res.left.message);
      return;
    }
    if (media?.url) URL.revokeObjectURL(media.url);
    const name = clean.split("/").pop() || clean;
    const bytes = new Uint8Array(res.right);
    const blob = new Blob([bytes.buffer], { type: guessMime(name) });
    setMedia({
      name,
      path: clean,
      kind: detectMediaKind(name),
      url: URL.createObjectURL(blob),
      size: bytes.byteLength,
    });
    setZoom(1);
  };

  const openLocalFile = (file: File | undefined) => {
    if (!file) return;
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia({
      name: file.name,
      kind: detectMediaKind(file.name),
      url: URL.createObjectURL(file),
      size: file.size,
    });
    setZoom(1);
    setError(null);
  };

  const startRecording = async (mode: "screen" | "camera") => {
    setRecordMode(mode);
    setError(null);
    try {
      const stream =
        mode === "screen"
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        void liveVideoRef.current.play().catch(() => {});
      }
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });
      mediaRecRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedBlob(blob);
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (rec.state !== "inactive") rec.stop();
      });
      setRecordSecs(0);
      setRecordedBlob(null);
      rec.start(500);
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  };

  const saveRecordingToLinux = async () => {
    if (!recordedBlob) return;
    const dir = `${wm.activeWorkspaceDir || "/home/user/workspace"}/recordings`;
    const fileName = `capture-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    const fullPath = `${dir}/${fileName}`.replace(/\/+/g, "/");
    const bytes = new Uint8Array(await recordedBlob.arrayBuffer());
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          const vm = yield* VmService;
          yield* fs.mkdir(dir);
          yield* fs.writeFileBytes(fullPath, bytes);
          yield* vm.syncDisk();
        })
      )
    );
    if (res._tag === "Right") {
      wmStore.pushToast("Saved to Linux", fullPath, "success");
    } else {
      wmStore.pushToast("Save Failed", res.left.message, "error");
    }
  };

  const downloadBlob = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col w-full h-full bg-[#090b12]/96">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
          {(
            [
              ["viewer", "Media & PDF Viewer", Film],
              ["recorder", "Screen & Cam Recorder", Video],
              ["focus", "Focus Timer", Timer],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                tab === id
                  ? "bg-pink-500/25 text-pink-100 border border-pink-400/35"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === "viewer" && (
          <div className="flex items-center gap-1.5">
            <input
              value={guestPath}
              onChange={(e) => setGuestPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void openGuestFile(guestPath)}
              placeholder="/home/user/workspace/file.pdf"
              className="w-48 sm:w-64 px-2.5 py-1 rounded-lg bg-black/50 border border-white/12 text-[11px] font-mono text-zinc-100 outline-none"
            />
            <button
              type="button"
              onClick={() => void openGuestFile(guestPath)}
              className="px-2.5 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/16 text-white transition"
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => filePickerRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              Local File
            </button>
            <input
              ref={filePickerRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf"
              className="hidden"
              onChange={(e) => openLocalFile(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {/* Tab 1: Universal Media & PDF Viewer */}
      {tab === "viewer" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            openLocalFile(e.dataTransfer.files?.[0]);
          }}
          className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-auto relative"
        >
          {error && <div className="mb-3 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/30 text-xs text-rose-200">{error}</div>}
          {loading && <div className="text-xs text-zinc-400">Loading media from Linux filesystem...</div>}

          {!media && !loading && (
            <div className="text-center space-y-3 max-w-sm">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 border border-pink-400/30 flex items-center justify-center">
                <Film className="w-7 h-7 text-pink-400" />
              </div>
              <div className="text-sm font-semibold text-white">Universal Media &amp; PDF Studio</div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Drop any <strong>Image, PDF, Video, or Audio</strong> file here, pick a local file, or enter a Linux guest path above.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-violet-600 hover:bg-violet-500 text-white transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Open Local Media
                </button>
                <button
                  type="button"
                  onClick={() => wmStore.openDirInExplorer(wm.activeWorkspaceDir)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-white/8 hover:bg-white/14 text-zinc-200 transition"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse Linux Files
                </button>
              </div>
            </div>
          )}

          {media && (
            <div className="w-full h-full flex flex-col min-h-0 gap-2">
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs shrink-0">
                <div className="flex items-center gap-2 truncate">
                  {media.kind === "image" ? (
                    <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                  ) : media.kind === "audio" ? (
                    <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
                  ) : media.kind === "pdf" ? (
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Film className="w-3.5 h-3.5 text-violet-400" />
                  )}
                  <span className="font-mono text-white truncate">{media.name}</span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {(media.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {media.kind === "image" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                        className="p-1 rounded bg-white/8 hover:bg-white/15 text-zinc-300"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono text-zinc-400 w-10 text-center">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                        className="p-1 rounded bg-white/8 hover:bg-white/15 text-zinc-300"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadBlob(media.url, media.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/8 hover:bg-white/15 text-[11px] text-zinc-200"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto rounded-2xl bg-black/50 border border-white/10 p-3">
                {media.kind === "image" && (
                  <img
                    src={media.url}
                    alt={media.name}
                    style={{ transform: `scale(${zoom})` }}
                    className="max-w-full max-h-full object-contain transition-transform"
                  />
                )}
                {media.kind === "video" && (
                  <video src={media.url} controls className="max-w-full max-h-full rounded-xl" />
                )}
                {media.kind === "audio" && (
                  <div className="w-full max-w-md p-6 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3 text-center">
                    <FileAudio className="w-12 h-12 text-cyan-400 mx-auto" />
                    <div className="text-sm font-semibold text-white">{media.name}</div>
                    <audio src={media.url} controls className="w-full" />
                  </div>
                )}
                {media.kind === "pdf" && (
                  <iframe
                    src={media.url}
                    title={media.name}
                    className="w-full h-full rounded-xl bg-white border-0"
                  />
                )}
                {media.kind === "unknown" && (
                  <div className="text-xs text-zinc-400">
                    Unsupported preview format for <code>{media.name}</code>. Use Download above or open in Code IDE.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Screen & Webcam Recorder */}
      {tab === "recorder" && (
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-4 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-2">
              {recording ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-rose-300">
                    REC {recordMode.toUpperCase()} · {fmtTime(recordSecs)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-zinc-300">
                  Capture screen, browser tab or webcam directly into Linux <code>~/workspace/recordings/</code> or download <code>.webm</code>.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!recording ? (
                <>
                  <button
                    type="button"
                    onClick={() => void startRecording("screen")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:brightness-110 transition"
                  >
                    <MonitorPlay className="w-3.5 h-3.5" />
                    Record Screen
                  </button>
                  <button
                    type="button"
                    onClick={() => void startRecording("camera")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/35 text-violet-200 transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Record Camera
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Recording
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[220px] rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden p-2">
            {recording ? (
              <video ref={liveVideoRef} muted autoPlay playsInline className="max-w-full max-h-full rounded-xl" />
            ) : recordedUrl ? (
              <video src={recordedUrl} controls className="max-w-full max-h-full rounded-xl" />
            ) : (
              <div className="text-xs text-zinc-500">Click Record Screen or Record Camera to begin capturing.</div>
            )}
          </div>

          {recordedBlob && recordedUrl && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void saveRecordingToLinux()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 transition"
              >
                <Save className="w-3.5 h-3.5" />
                Save to Linux Workspace
              </button>
              <button
                type="button"
                onClick={() => downloadBlob(recordedUrl, `unkernelos-capture.webm`)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
              >
                <Download className="w-3.5 h-3.5" />
                Download .webm
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Focus Pomodoro Timer */}
      {tab === "focus" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex items-center gap-2">
            {[
              { label: "Deep Focus (25m)", secs: 25 * 60 },
              { label: "Sprint (50m)", secs: 50 * 60 },
              { label: "Short Break (5m)", secs: 5 * 60 },
              { label: "Long Break (15m)", secs: 15 * 60 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFocusRunning(false);
                  setFocusDuration(p.secs);
                  setFocusRemaining(p.secs);
                }}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  focusDuration === p.secs
                    ? "bg-violet-500/25 border-violet-400/45 text-white"
                    : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-56 h-56 rounded-full glass-surface-focused border-2 border-violet-400/35 flex flex-col items-center justify-center gap-2 shadow-[0_0_60px_rgba(139,92,246,0.28)]">
            <div className="text-5xl font-mono font-bold text-white tabular-nums">
              {fmtTime(focusRemaining)}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-cyan-300">
              {focusRunning ? "In Focus" : "Paused"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFocusRunning((r) => !r)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 shadow-lg transition"
            >
              {focusRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {focusRunning ? "Pause" : "Start Focus"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFocusRunning(false);
                setFocusRemaining(focusDuration);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs bg-white/8 hover:bg-white/15 border border-white/12 text-zinc-200 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
