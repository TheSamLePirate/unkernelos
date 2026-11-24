import type { KernelHandle, ShmFile } from "unkernel";
import { createStreamLink, createWland, type BufferHandle, type HandleSource, type Wland } from "wland/client";

const WAYLAND_VSOCK_PORT = 1023;

/**
 * Hosts the wland Wayland compositor inside a DOM container, reading guest
 * window buffers directly from unkernel's /dev/kwshm over vsock:1023.
 */
export class WaylandDesktopHost {
  private wl: Wland | null = null;
  private listenerClose: (() => void) | null = null;
  private disposed = false;

  public async attach(vm: KernelHandle, container: HTMLElement): Promise<boolean> {
    this.dispose();
    if (!vm.vsock) return false;
    this.disposed = false;

    const listener = vm.vsock.listen(WAYLAND_VSOCK_PORT);
    this.listenerClose = () => listener.close();

    // Bridge guest /dev/kwshm handles for zero-copy / fast Wayland surface presentation
    const shm = vm.shm;
    const buffers: HandleSource<ShmFile> | undefined = shm
      ? {
          open: async (h: BufferHandle) => {
            if (h.kind !== "kwshm") throw new Error(`Unsupported buffer kind ${h.kind}`);
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
              })
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

    try {
      this.wl = await createWland({
        container,
        link,
        buffers,
        decorations: "client",
        clipboard: true,
        autoFocus: true,
        shortcuts: true,
      });
      return true;
    } catch (err) {
      console.warn("[unkernelOS] wland Wayland compositor init skipped:", err);
      this.dispose();
      return false;
    }
  }

  public dispose(): void {
    this.disposed = true;
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
  }
}
