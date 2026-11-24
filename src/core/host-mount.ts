import { Effect } from "effect";
import { useSyncExternalStore } from "react";
import {
  FS_DEFAULT_OWNER,
  FsError,
  type Fs,
  type FsAttr,
  type FsDirEntry,
  type FsFile,
  type FsOpenFlags,
  type FsSetAttr,
  type Mount,
} from "unkernel";
import { appRuntime, VmService } from "./runtime.ts";
import { wmStore } from "../wm/wm-store.ts";

interface DirHandleLike {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandleLike>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FileHandleLike>;
  removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
  entries: () => AsyncIterableIterator<[string, DirHandleLike | FileHandleLike]>;
}

interface WritableLike {
  write: (data: { type: "write"; position?: number; data: Uint8Array<ArrayBuffer> } | Uint8Array<ArrayBuffer>) => Promise<void>;
  truncate: (size: number) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile: () => Promise<File>;
  createWritable: (opts?: { keepExistingData?: boolean }) => Promise<WritableLike>;
}

export interface HostMountInfo {
  readonly id: string;
  readonly name: string;
  readonly mountPath: string;
  readonly mountedAt: number;
}

function splitPath(p: string): string[] {
  return p.split("/").filter(Boolean);
}

async function resolveHandle(
  root: DirHandleLike,
  path: string
): Promise<DirHandleLike | FileHandleLike> {
  const parts = splitPath(path);
  if (parts.length === 0) return root;
  let cur: DirHandleLike = root;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    const isLast = i === parts.length - 1;
    try {
      cur = await cur.getDirectoryHandle(seg);
      if (isLast) return cur;
    } catch {
      if (!isLast) throw new FsError("ENOENT", `No such directory: ${path}`);
      try {
        return await cur.getFileHandle(seg);
      } catch {
        throw new FsError("ENOENT", `No such file or directory: ${path}`);
      }
    }
  }
  return cur;
}

async function resolveParent(
  root: DirHandleLike,
  path: string
): Promise<{ parent: DirHandleLike; name: string }> {
  const parts = splitPath(path);
  if (parts.length === 0) throw new FsError("EINVAL", "Cannot operate on root");
  const name = parts[parts.length - 1]!;
  let cur: DirHandleLike = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      cur = await cur.getDirectoryHandle(parts[i]!);
    } catch {
      throw new FsError("ENOENT", `Parent missing for ${path}`);
    }
  }
  return { parent: cur, name };
}

function makeOpenFile(fh: FileHandleLike, flags: FsOpenFlags): FsFile {
  let cachedBytes: Uint8Array | null = null;
  let dirty = false;

  const ensureLoaded = async (): Promise<Uint8Array> => {
    if (cachedBytes) return cachedBytes;
    if (flags.truncate) {
      cachedBytes = new Uint8Array(0);
      dirty = true;
      return cachedBytes;
    }
    const f = await fh.getFile();
    cachedBytes = new Uint8Array(await f.arrayBuffer());
    return cachedBytes;
  };

  const flush = async (): Promise<void> => {
    if (!dirty || !cachedBytes) return;
    const writable = await fh.createWritable({ keepExistingData: false });
    const copy = new Uint8Array(cachedBytes.byteLength);
    copy.set(cachedBytes);
    await writable.write(copy);
    await writable.close();
    dirty = false;
  };

  return {
    async read(offset: number, length: number): Promise<Uint8Array> {
      const buf = await ensureLoaded();
      if (offset >= buf.byteLength) return new Uint8Array(0);
      return buf.slice(offset, Math.min(buf.byteLength, offset + length));
    },
    async write(offset: number, data: Uint8Array): Promise<number> {
      if (!flags.write) throw new FsError("EACCES", "File not opened for writing");
      const buf = await ensureLoaded();
      const start = flags.append ? buf.byteLength : offset;
      const needed = start + data.byteLength;
      if (needed > buf.byteLength) {
        const grown = new Uint8Array(needed);
        grown.set(buf);
        cachedBytes = grown;
      }
      cachedBytes!.set(data, start);
      dirty = true;
      return data.byteLength;
    },
    async getattr(): Promise<FsAttr> {
      const f = await fh.getFile();
      return {
        type: "file",
        mode: 0o644,
        size: cachedBytes ? cachedBytes.byteLength : f.size,
        uid: FS_DEFAULT_OWNER,
        gid: FS_DEFAULT_OWNER,
        mtimeMs: f.lastModified || Date.now(),
        atimeMs: f.lastModified || Date.now(),
        ctimeMs: f.lastModified || Date.now(),
      };
    },
    async setattr(attr: FsSetAttr): Promise<void> {
      if (attr.size !== undefined) {
        const buf = await ensureLoaded();
        if (attr.size < buf.byteLength) {
          cachedBytes = buf.slice(0, attr.size);
        } else if (attr.size > buf.byteLength) {
          const grown = new Uint8Array(attr.size);
          grown.set(buf);
          cachedBytes = grown;
        }
        dirty = true;
      }
    },
    async fsync(): Promise<void> {
      await flush();
    },
    async close(): Promise<void> {
      await flush();
    },
  };
}

/**
 * Wraps a browser File System Access API DirectoryHandle as a full read/write unkernel 9P Fs.
 */
function createDirectoryHandleFs(root: DirHandleLike): Fs {
  return {
    async getattr(path: string): Promise<FsAttr> {
      const h = await resolveHandle(root, path);
      if (h.kind === "directory") {
        return {
          type: "dir",
          mode: 0o755,
          size: 4096,
          uid: FS_DEFAULT_OWNER,
          gid: FS_DEFAULT_OWNER,
          mtimeMs: Date.now(),
          atimeMs: Date.now(),
          ctimeMs: Date.now(),
        };
      }
      const f = await h.getFile();
      return {
        type: "file",
        mode: 0o644,
        size: f.size,
        uid: FS_DEFAULT_OWNER,
        gid: FS_DEFAULT_OWNER,
        mtimeMs: f.lastModified || Date.now(),
        atimeMs: f.lastModified || Date.now(),
        ctimeMs: f.lastModified || Date.now(),
      };
    },

    async readdir(path: string): Promise<FsDirEntry[]> {
      const h = await resolveHandle(root, path);
      if (h.kind !== "directory") throw new FsError("ENOTDIR", `${path} is not a directory`);
      const out: FsDirEntry[] = [];
      for await (const [name, child] of h.entries()) {
        out.push({ name, type: child.kind === "directory" ? "dir" : "file" });
      }
      return out;
    },

    async open(path: string, flags: FsOpenFlags): Promise<FsFile> {
      const h = await resolveHandle(root, path);
      if (h.kind !== "file") throw new FsError("EISDIR", `${path} is a directory`);
      return makeOpenFile(h, flags);
    },

    async create(path: string, _mode: number): Promise<FsFile> {
      const { parent, name } = await resolveParent(root, path);
      const fh = await parent.getFileHandle(name, { create: true });
      return makeOpenFile(fh, { read: true, write: true, truncate: true, append: false });
    },

    async mkdir(path: string, _mode: number): Promise<void> {
      const { parent, name } = await resolveParent(root, path);
      await parent.getDirectoryHandle(name, { create: true });
    },

    async remove(path: string, dir: boolean): Promise<void> {
      const { parent, name } = await resolveParent(root, path);
      try {
        await parent.removeEntry(name, { recursive: dir });
      } catch {
        throw new FsError("ENOENT", `Cannot remove ${path}`);
      }
    },

    async rename(from: string, to: string): Promise<void> {
      const src = await resolveHandle(root, from);
      if (src.kind !== "file") throw new FsError("EXDEV", "Directory rename across 9P not supported by browser handle");
      const bytes = new Uint8Array(await (await src.getFile()).arrayBuffer());
      const { parent: dstParent, name: dstName } = await resolveParent(root, to);
      const dstFh = await dstParent.getFileHandle(dstName, { create: true });
      const w = await dstFh.createWritable({ keepExistingData: false });
      await w.write(bytes);
      await w.close();
      const { parent: srcParent, name: srcName } = await resolveParent(root, from);
      await srcParent.removeEntry(srcName);
    },

    async setattr(path: string, attr: FsSetAttr): Promise<void> {
      if (attr.size === undefined) return;
      const h = await resolveHandle(root, path);
      if (h.kind !== "file") return;
      const w = await h.createWritable({ keepExistingData: true });
      await w.truncate(attr.size);
      await w.close();
    },

    statfs() {
      return { bsize: 4096, blocks: 1024 * 1024, bfree: 512 * 1024, bavail: 512 * 1024 };
    },
  };
}

class HostMountManager {
  private mounts = new Map<string, { info: HostMountInfo; handle: Mount }>();
  private snapshot: readonly HostMountInfo[] = [];
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): readonly HostMountInfo[] => this.snapshot;

  private emit(): void {
    this.snapshot = Array.from(this.mounts.values()).map((m) => m.info);
    for (const fn of this.listeners) fn();
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  }

  public async mountLocalFolder(): Promise<HostMountInfo | null> {
    if (!this.isSupported()) {
      wmStore.pushToast(
        "File System Access API Unavailable",
        "Use Chrome, Edge, Arc or Brave desktop to mount real local folders into /mnt/host via 9P.",
        "warn"
      );
      return null;
    }

    const vm = appRuntime.runSync(Effect.map(VmService, (v) => v.getHandle()));
    if (!vm) {
      wmStore.pushToast("Linux Not Ready", "Wait for the Linux kernel to finish booting first.", "warn");
      return null;
    }

    try {
      const picker = (window as unknown as {
        showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<DirHandleLike>;
      }).showDirectoryPicker;
      const dirHandle = await picker({ mode: "readwrite" });
      const safeName = dirHandle.name.replace(/[^a-zA-Z0-9._-]/g, "-") || "host-folder";
      const mountPath = `/mnt/host/${safeName}`;

      // Ensure mount point exists inside guest Linux
      await appRuntime.runPromise(
        Effect.either(Effect.flatMap(VmService, (v) => v.exec("mkdir", ["-p", mountPath])))
      );

      const fs = createDirectoryHandleFs(dirHandle);
      const mount = await vm.mount(mountPath, fs);

      const info: HostMountInfo = {
        id: `${safeName}-${Date.now().toString(36)}`,
        name: dirHandle.name,
        mountPath,
        mountedAt: Date.now(),
      };
      this.mounts.set(mountPath, { info, handle: mount });
      this.emit();

      wmStore.setWorkspaceDir(mountPath);
      wmStore.pushToast(
        "Local Folder Mounted (9P)",
        `${dirHandle.name} is now live at ${mountPath} for Claude, Pi, IDE & Terminal!`,
        "success"
      );
      return info;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return null;
      wmStore.pushToast(
        "Mount Failed",
        err instanceof Error ? err.message : String(err),
        "error"
      );
      return null;
    }
  }

  public async unmount(mountPath: string): Promise<void> {
    const entry = this.mounts.get(mountPath);
    if (!entry) return;
    try {
      await entry.handle.unmount();
    } catch {
      // ignore
    }
    this.mounts.delete(mountPath);
    this.emit();
    wmStore.pushToast("Unmounted", `${mountPath} detached cleanly`, "info");
  }
}

export const hostMountManager = new HostMountManager();

export function useHostMounts(): readonly HostMountInfo[] {
  return useSyncExternalStore(hostMountManager.subscribe, hostMountManager.getSnapshot);
}
