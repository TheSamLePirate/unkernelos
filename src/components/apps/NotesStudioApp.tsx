import {
  useAppSurface,
  useSurfaceRevision,
  WindowSessionContext,
} from "../../core/app-surface-registry.tsx";
import { Effect } from "effect";
import {
  Bold,
  CheckSquare,
  Code,
  Columns2,
  Download,
  Eye,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  PenLine,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { appRuntime, GuestFsService, VmService } from "../../core/runtime.ts";
import { wmStore } from "../../wm/wm-store.ts";

interface NoteEntry {
  readonly name: string;
  readonly path: string;
  readonly mtime: string;
}

const NOTES_DIR = "/home/user/notes";

const WELCOME_NOTE = `# Welcome to unkernelOS Notes Studio

Your Markdown notes are stored directly inside **\`~/notes/\`** on your persistent Linux \`/data\` ext4 disk.

## Highlights
- [x] Real-time split Markdown editor & live preview
- [x] Persisted across reloads via IndexedDB ext4
- [ ] Write architecture specs, prompts, or meeting notes

> Tip: Press **⌘S** to save and flush to disk immediately.

\`\`\`ts
// Example snippet
const os = "unkernelOS AAA WebOS";
console.log(\`Running on \${os}\`);
\`\`\`
`;

function renderInline(text: string): React.ReactNode {
  const tokens = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g,
  );
  return tokens.map((tok, i) => {
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 font-mono text-[11px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return (
        <em key={i} className="italic text-zinc-200">
          {tok.slice(1, -1)}
        </em>
      );
    }
    if (tok.startsWith("~~") && tok.endsWith("~~")) {
      return (
        <del key={i} className="line-through text-zinc-500">
          {tok.slice(2, -2)}
        </del>
      );
    }
    const linkM = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
    if (linkM) {
      return (
        <a
          key={i}
          href={linkM[2]}
          target="_blank"
          rel="noreferrer"
          className="text-violet-400 hover:underline"
        >
          {linkM[1]}
        </a>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

const MarkdownPreview: React.FC<{
  content: string;
  onToggleCheckbox: (lineIndex: number) => void;
}> = ({ content, onToggleCheckbox }) => {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      blocks.push(
        <div
          key={`code-${i}`}
          className="my-3 rounded-xl bg-black/55 border border-white/10 overflow-hidden"
        >
          {lang && (
            <div className="px-3 py-1 bg-white/[0.04] border-b border-white/8 text-[10px] font-mono uppercase text-zinc-400">
              {lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono text-cyan-200 overflow-x-auto leading-relaxed">
            {codeLines.join("\n")}
          </pre>
        </div>,
      );
      i++;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h3 key={i} className="text-sm font-semibold text-white mt-4 mb-1.5">
          {renderInline(line.replace(/^###\s+/, ""))}
        </h3>,
      );
    } else if (/^##\s+/.test(line)) {
      blocks.push(
        <h2
          key={i}
          className="text-base font-semibold text-white mt-5 mb-2 pb-1 border-b border-white/10"
        >
          {renderInline(line.replace(/^##\s+/, ""))}
        </h2>,
      );
    } else if (/^#\s+/.test(line)) {
      blocks.push(
        <h1
          key={i}
          className="text-xl font-bold text-white mt-2 mb-3 tracking-tight"
        >
          {renderInline(line.replace(/^#\s+/, ""))}
        </h1>,
      );
    } else if (/^>\s?/.test(line)) {
      blocks.push(
        <blockquote
          key={i}
          className="my-2 pl-3 border-l-2 border-violet-400/70 text-xs text-zinc-300 italic bg-violet-500/8 py-1.5 pr-2 rounded-r-lg"
        >
          {renderInline(line.replace(/^>\s?/, ""))}
        </blockquote>,
      );
    } else if (/^[-*]\s+\[([ xX])\]\s+/.test(line)) {
      const checked = /^[-*]\s+\[[xX]\]/.test(line);
      const lineIdx = i;
      const text = line.replace(/^[-*]\s+\[[ xX]\]\s+/, "");
      blocks.push(
        <label
          key={i}
          className="flex items-start gap-2 my-1 text-xs text-zinc-200 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleCheckbox(lineIdx)}
            className="mt-0.5 accent-violet-500"
          />
          <span className={checked ? "line-through text-zinc-500" : ""}>
            {renderInline(text)}
          </span>
        </label>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push(
        <div
          key={i}
          className="flex items-start gap-2 my-1 text-xs text-zinc-300 pl-1"
        >
          <span className="text-violet-400">•</span>
          <span>{renderInline(line.replace(/^[-*]\s+/, ""))}</span>
        </div>,
      );
    } else if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={i} className="my-4 border-white/10" />);
    } else if (line.trim()) {
      blocks.push(
        <p key={i} className="my-1.5 text-xs text-zinc-300 leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
    i++;
  }

  return <div className="p-5 overflow-y-auto h-full select-text">{blocks}</div>;
};

export const NotesStudioApp: React.FC = () => {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [activeNote, setActiveNote] = useState<NoteEntry | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [view, setView] = useState<"split" | "edit" | "preview">("split");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const session = React.useContext(WindowSessionContext);
  const revision = useSurfaceRevision(
    activeNote?.path,
    content,
    savedContent,
    saving,
  );
  useAppSurface({
    document: activeNote?.path,
    title: activeNote?.name,
    revision,
    status: "live",
    state: {
      document: activeNote?.path,
      content,
      dirty: content !== savedContent,
      saving,
    },
    actions: {
      save: {
        label: "Enregistrer cette note",
        run: async () => {
          if (!(await saveNote()))
            throw new Error("Échec de sauvegarde de la note");
          return { document: activeNote?.path };
        },
      },
    },
  });

  const loadNotes = useCallback(async () => {
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          yield* fs.mkdir(NOTES_DIR);
          let entries = yield* fs.listDir(NOTES_DIR);
          const mdFiles = entries.filter(
            (e) => !e.isDir && e.name.endsWith(".md"),
          );
          if (mdFiles.length === 0) {
            yield* fs.writeFileText(`${NOTES_DIR}/welcome.md`, WELCOME_NOTE);
            entries = yield* fs.listDir(NOTES_DIR);
          }
          return entries
            .filter((e) => !e.isDir && e.name.endsWith(".md"))
            .map((e) => ({ name: e.name, path: e.path, mtime: e.mtime }));
        }),
      ),
    );
    if (res._tag === "Right") {
      setNotes(res.right);
      if (!activeNote && res.right[0]) {
        void openNote(
          res.right.find((n) => n.path === session?.props?.documentPath) ??
            res.right[0],
        );
      }
    }
  }, [activeNote]);

  const openNote = async (n: NoteEntry) => {
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.flatMap(GuestFsService, (fs) => fs.readFileText(n.path)),
      ),
    );
    if (res._tag === "Right") {
      if (session)
        wmStore.updateWindowProps(session.id, { documentPath: n.path });
      setActiveNote(n);
      setContent(res.right);
      setSavedContent(res.right);
    }
  };

  useEffect(() => {
    void loadNotes();
  }, []);

  const saveNote = async () => {
    if (!activeNote) return;
    setSaving(true);
    const res = await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          const vm = yield* VmService;
          yield* fs.writeFileText(activeNote.path, content);
          yield* vm.syncDisk();
        }),
      ),
    );
    setSaving(false);
    if (res._tag === "Right") {
      setSavedContent(content);
      wmStore.pushToast("Note Saved", activeNote.name, "success");
    } else {
      wmStore.pushToast("Save Failed", res.left.message, "error");
    }
    return res._tag === "Right";
  };

  const createNote = async () => {
    const raw = window.prompt(
      "New note filename:",
      `note-${new Date().toISOString().slice(0, 10)}.md`,
    );
    if (!raw?.trim()) return;
    const name = raw.trim().endsWith(".md") ? raw.trim() : `${raw.trim()}.md`;
    const path = `${NOTES_DIR}/${name}`;
    const initial = `# ${name.replace(/\.md$/, "")}\n\n`;
    await appRuntime.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const fs = yield* GuestFsService;
          yield* fs.mkdir(NOTES_DIR);
          yield* fs.writeFileText(path, initial);
        }),
      ),
    );
    await loadNotes();
    const entry: NoteEntry = { name, path, mtime: "just now" };
    setActiveNote(entry);
    setContent(initial);
    setSavedContent(initial);
  };

  const deleteNote = async (n: NoteEntry) => {
    if (!window.confirm(`Delete ${n.name}?`)) return;
    await appRuntime.runPromise(
      Effect.either(Effect.flatMap(GuestFsService, (fs) => fs.remove(n.path))),
    );
    if (activeNote?.path === n.path) {
      setActiveNote(null);
      setContent("");
      setSavedContent("");
    }
    await loadNotes();
  };

  const insertSnippet = (before: string, after = "") => {
    const ta = editorRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = content.slice(s, e);
    const next =
      content.slice(0, s) + before + selected + after + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + selected.length;
    });
  };

  const toggleCheckboxLine = (lineIdx: number) => {
    const lines = content.split("\n");
    const l = lines[lineIdx];
    if (!l) return;
    lines[lineIdx] = /^[-*]\s+\[[xX]\]/.test(l)
      ? l.replace(/\[[xX]\]/, "[ ]")
      : l.replace(/\[ \]/, "[x]");
    setContent(lines.join("\n"));
  };

  const downloadNote = () => {
    if (!activeNote) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeNote.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredNotes = notes.filter((n) =>
    n.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const dirty = content !== savedContent;

  return (
    <div
      data-horizon-app="notes"
      className="flex w-full h-full bg-[#090b12]/96 overflow-hidden"
    >
      {/* Left Notes List */}
      <aside className="w-56 shrink-0 bg-black/35 border-r border-white/10 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            ~/notes
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadNotes()}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void createNote()}
              className="p-1 rounded bg-violet-500/25 hover:bg-violet-500/40 text-violet-200"
              title="New Note"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/50 border border-white/10">
          <Search className="w-3 h-3 text-zinc-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter notes..."
            className="flex-1 bg-transparent text-[11px] text-zinc-200 outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {filteredNotes.map((n) => {
            const active = activeNote?.path === n.path;
            return (
              <div
                key={n.path}
                onClick={() => void openNote(n)}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition ${
                  active
                    ? "bg-violet-500/22 border border-violet-400/35 text-white"
                    : "bg-white/[0.02] hover:bg-white/8 text-zinc-300"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {n.name.replace(/\.md$/, "")}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {n.mtime || n.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteNote(n);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Editor + Preview */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Markdown Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/40 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => insertSnippet("# ")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("## ")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("**", "**")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("*", "*")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("```\n", "\n```")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Code Block"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("- ")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("- [ ] ")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Checklist"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertSnippet("> ")}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Quote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setView("edit")}
                className={`p-1 rounded ${view === "edit" ? "bg-white/15 text-white" : "text-zinc-400"}`}
                title="Editor Only"
              >
                <PenLine className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView("split")}
                className={`p-1 rounded ${view === "split" ? "bg-white/15 text-white" : "text-zinc-400"}`}
                title="Split View"
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView("preview")}
                className={`p-1 rounded ${view === "preview" ? "bg-white/15 text-white" : "text-zinc-400"}`}
                title="Preview Only"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={downloadNote}
              disabled={!activeNote}
              className="p-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-zinc-300 disabled:opacity-40"
              title="Export .md"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={!activeNote || !dirty || saving}
              onClick={() => void saveNote()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition"
            >
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : dirty ? "Save*" : "Saved"}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div
          className={`hz-notes-content flex-1 min-h-0 grid ${
            view === "split"
              ? "grid-cols-2 divide-x divide-white/10"
              : "grid-cols-1"
          }`}
        >
          {(view === "edit" || view === "split") && (
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  void saveNote();
                }
              }}
              placeholder="Write Markdown..."
              className="w-full h-full p-5 bg-[#0b0d16] text-xs font-mono text-zinc-100 leading-relaxed outline-none resize-none select-text"
            />
          )}
          {(view === "preview" || view === "split") && (
            <div className="min-h-0 overflow-hidden bg-[#080a12]">
              <MarkdownPreview
                content={content}
                onToggleCheckbox={toggleCheckboxLine}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
