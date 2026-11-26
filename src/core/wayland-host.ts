import { screenToElement } from "./spatial-pointer.ts";
import { useSyncExternalStore } from "react";
import type { KernelHandle, ShmFile } from "unkernel";
import {
  createStreamLink,
  createWland,
  type BufferHandle,
  type HandleSource,
  type ViewWindow,
  type Wland,
} from "wland/client";

const WAYLAND_VSOCK_PORT = 1023;

export interface WaylandWindowInfo {
  readonly key: string;
  readonly conn: number;
  readonly surface: number;
  readonly title: string;
  readonly appId: string;
  readonly decorated: boolean;
}

export interface WaylandDesktopCallbacks {
  readonly onMountWindow: (info: WaylandWindowInfo) => void;
  readonly onUnmountWindow: (key: string) => void;
  readonly onUpdateWindow: (info: WaylandWindowInfo) => void;
}

/**
 * Desktop-level Wayland compositor (wland) bridging guest /dev/kwshm & VirGL dmabuf
 * directly into native unkernelOS floating <WindowFrame> windows on the Desktop.
 */
class WaylandDesktopManager {
  private wl: Wland | null = null;
  private projectedInputCleanup: (() => void) | null = null;
  private listenerClose: (() => void) | null = null;
  private viewWindows = new Map<string, ViewWindow>();
  private snapshot: { ready: boolean; windows: readonly WaylandWindowInfo[] } =
    {
      ready: false,
      windows: [],
    };
  private listeners = new Set<() => void>();
  private callbacks: WaylandDesktopCallbacks | null = null;

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = () => this.snapshot;

  private emit(): void {
    const windows: WaylandWindowInfo[] = Array.from(
      this.viewWindows.values(),
    ).map((w) => ({
      key: w.key,
      conn: w.conn,
      surface: w.surface,
      title: w.title || w.appId || "Wayland App",
      appId: w.appId || "",
      decorated: w.decorated,
    }));
    this.snapshot = { ready: Boolean(this.wl), windows };
    for (const fn of this.listeners) fn();
  }

  public getViewWindow(key: string): ViewWindow | undefined {
    return this.viewWindows.get(key);
  }

  public async attach(
    vm: KernelHandle,
    container: HTMLElement,
    callbacks: WaylandDesktopCallbacks,
  ): Promise<boolean> {
    this.dispose();
    if (!vm.vsock) return false;
    this.callbacks = callbacks;

    const listener = vm.vsock.listen(WAYLAND_VSOCK_PORT);
    this.listenerClose = () => listener.close();

    const shm = vm.shm;
    const buffers: HandleSource<ShmFile> | undefined = shm
      ? {
          open: async (h: BufferHandle) => {
            if (h.kind !== "kwshm")
              throw new Error(`Unsupported buffer kind ${h.kind}`);
            return shm.openId(h.id);
          },
          read: async (file: ShmFile, offset: number, dst: Uint8Array) => {
            const bytes = await file.read(offset, dst.length);
            dst.set(bytes);
          },
          readv: async (file: ShmFile, reads) => {
            await Promise.all(
              reads.map(async (r) => {
                const bytes = await file.read(r.offset, r.dst.length);
                r.dst.set(bytes);
              }),
            );
          },
          view: shm.inPlace
            ? (file: ShmFile, offset: number, length: number) => {
                try {
                  return file.views(offset, length);
                } catch {
                  return null;
                }
              }
            : undefined,
          close: (file: ShmFile) => {
            try {
              file.close();
            } catch {
              // ignore
            }
          },
        }
      : undefined;

    const link = createStreamLink(listener);

    const gpu = vm.gl?.gpu
      ? {
          resolve: (ref: { resource: number }) =>
            vm.gl!.gpu!.image(ref.resource),
          release: (img: CanvasImageSource) => {
            if (
              typeof ImageBitmap !== "undefined" &&
              img instanceof ImageBitmap
            ) {
              img.close();
            }
          },
        }
      : undefined;

    try {
      this.wl = await createWland({
        container,
        link,
        buffers,
        gpu,
        decorations: "server",
        clipboard: true,
        autoFocus: false,
        manageDisplay: false,
        shortcuts: false,
        mount: (win: ViewWindow) => {
          this.viewWindows.set(win.key, win);
          const info: WaylandWindowInfo = {
            key: win.key,
            conn: win.conn,
            surface: win.surface,
            title: win.title || win.appId || "Linux Wayland App",
            appId: win.appId || "",
            decorated: win.decorated,
          };
          this.emit();
          this.callbacks?.onMountWindow(info);
        },
        unmount: (win: ViewWindow) => {
          this.viewWindows.delete(win.key);
          try {
            win.element.remove();
          } catch {
            // ignore
          }
          this.emit();
          this.callbacks?.onUnmountWindow(win.key);
        },
        onWindowsChange: () => {
          for (const win of this.viewWindows.values()) {
            this.callbacks?.onUpdateWindow({
              key: win.key,
              conn: win.conn,
              surface: win.surface,
              title: win.title || win.appId || "Linux Wayland App",
              appId: win.appId || "",
              decorated: win.decorated,
            });
          }
          this.emit();
        },
      });
      this.attachProjectedInput();
      this.emit();
      return true;
    } catch (err) {
      console.warn(
        "[unkernelOS] Desktop wland Wayland compositor init skipped:",
        err,
      );
      this.dispose();
      return false;
    }
  }

  /** Correct the public input engine's surface coordinates for projected DOM planes.
   * wland currently derives local coordinates from an axis-aligned bounding rect.
   * Its routing, capture, clipboard, IME and popup lifecycle remain owned by wland.
   */
  private attachProjectedInput(): void {
    const wl = this.wl;
    if (!wl) return;
    let last: { x: number; y: number; target: HTMLElement } | null = null;
    const entered = new Map<number, number>(),
      touchSurfaces = new Map<string, number>();
    const track = (e: PointerEvent) => {
      if (e.target instanceof HTMLElement)
        last = { x: e.clientX, y: e.clientY, target: e.target };
    };
    window.addEventListener("pointermove", track, true);
    window.addEventListener("pointerdown", track, true);
    const local = (
      conn: number,
      surface: number,
      fallback: { x: number; y: number },
    ) => {
      const el =
        wl.view.hitTarget(conn, surface) ?? wl.view.canvas(conn, surface);
      if (
        !last ||
        !el?.closest("[data-horizon-window]") ||
        document.pointerLockElement
      )
        return fallback;
      return screenToElement(el, last.x, last.y);
    };
    const enter = wl.engine.pointerEnter.bind(wl.engine),
      motion = wl.engine.pointerMotion.bind(wl.engine),
      down = wl.engine.touchDown.bind(wl.engine),
      touch = wl.engine.touchMotion.bind(wl.engine),
      up = wl.engine.touchUp.bind(wl.engine);
    wl.engine.pointerEnter = (conn, surface, x, y) => {
      entered.set(conn, surface);
      const p = local(conn, surface, { x, y });
      enter(conn, surface, p.x, p.y);
    };
    wl.engine.pointerMotion = (conn, time, x, y, relative) => {
      const surface = entered.get(conn);
      const p =
        surface === undefined ? { x, y } : local(conn, surface, { x, y });
      motion(conn, time, p.x, p.y, relative);
    };
    wl.engine.touchDown = (conn, time, surface, id, x, y) => {
      touchSurfaces.set(conn + ":" + id, surface);
      const p = local(conn, surface, { x, y });
      down(conn, time, surface, id, p.x, p.y);
    };
    wl.engine.touchMotion = (conn, time, id, x, y) => {
      const surface = touchSurfaces.get(conn + ":" + id);
      const p =
        surface === undefined ? { x, y } : local(conn, surface, { x, y });
      touch(conn, time, id, p.x, p.y);
    };
    wl.engine.touchUp = (conn, time, id) => {
      touchSurfaces.delete(conn + ":" + id);
      up(conn, time, id);
    };
    const at = wl.view.surfaceAt.bind(wl.view);
    wl.view.surfaceAt = (x, y) => {
      const result = at(x, y);
      if (!result) return null;
      const el =
        wl.view.hitTarget(result.conn, result.surface) ??
        wl.view.canvas(result.conn, result.surface);
      if (!el?.closest("[data-horizon-window]")) return result;
      const p = screenToElement(el, x, y);
      return { ...result, x: p.x, y: p.y };
    };
    this.projectedInputCleanup = () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerdown", track, true);
    };
  }

  public focusWindow(key: string): void {
    const win = this.viewWindows.get(key);
    if (!win || !this.wl) return;
    try {
      this.wl.input.focus(win.conn, win.surface);
    } catch {
      // ignore
    }
  }

  public blur(): void {
    try {
      this.wl?.input.blur();
    } catch {
      // ignore
    }
  }

  public resizeWindow(key: string, width: number, height: number): void {
    const win = this.viewWindows.get(key);
    if (!win || !this.wl) return;
    const w = Math.max(120, Math.round(width));
    const h = Math.max(80, Math.round(height));
    try {
      this.wl.engine.requestResize(win.conn, win.surface, w, h);
    } catch {
      // ignore
    }
  }

  public setWindowPosition(key: string, x: number, y: number): void {
    const win = this.viewWindows.get(key);
    if (!win || !this.wl) return;
    try {
      this.wl.engine.setWindowPosition(
        win.conn,
        win.surface,
        Math.round(x),
        Math.round(y),
      );
    } catch {
      // ignore
    }
  }

  public setVisible(key: string, visible: boolean): void {
    const win = this.viewWindows.get(key);
    if (!win || !this.wl) return;
    try {
      this.wl.engine.setVisible(win.conn, win.surface, visible);
    } catch {
      // ignore
    }
  }

  public closeWindow(key: string): void {
    const win = this.viewWindows.get(key);
    if (!win || !this.wl) return;
    try {
      this.wl.engine.close(win.conn, win.surface);
    } catch {
      // ignore
    }
  }

  public dispose(): void {
    this.projectedInputCleanup?.();
    this.projectedInputCleanup = null;
    for (const w of this.viewWindows.values()) {
      try {
        w.element.remove();
      } catch {
        // ignore
      }
    }
    this.viewWindows.clear();
    try {
      this.wl?.dispose();
    } catch {
      // ignore
    }
    this.wl = null;
    try {
      this.listenerClose?.();
    } catch {
      // ignore
    }
    this.listenerClose = null;
    this.callbacks = null;
    this.emit();
  }
}

export const waylandDesktopManager = new WaylandDesktopManager();

export function useWaylandDesktop() {
  return useSyncExternalStore(
    waylandDesktopManager.subscribe,
    waylandDesktopManager.getSnapshot,
  );
}
