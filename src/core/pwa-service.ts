import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface PwaState {
  readonly installable: boolean;
  readonly installed: boolean;
  readonly swReady: boolean;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
}

class PwaStore {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private state: PwaState = {
    installable: false,
    installed:
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone)),
    swReady: false,
    crossOriginIsolated: typeof self !== "undefined" ? Boolean(self.crossOriginIsolated) : false,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
  };
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        this.update({ installable: true });
      });
      window.addEventListener("appinstalled", () => {
        this.deferredPrompt = null;
        this.update({ installable: false, installed: true });
      });
    }
  }

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): PwaState => this.state;

  private update(patch: Partial<PwaState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  public async registerServiceWorker(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js`, {
        scope: base,
        updateViaCache: "none",
      });
      this.update({
        swReady: Boolean(reg.active || navigator.serviceWorker.controller),
        crossOriginIsolated: Boolean(self.crossOriginIsolated),
        sharedArrayBuffer: typeof SharedArrayBuffer === "function",
      });

      // On static hosts (like GitHub Pages) that don't send COOP/COEP headers natively,
      // reload ONCE after our COOP/COEP Service Worker activates so SharedArrayBuffer + multi-vCPU SMP unlock!
      const COI_RELOAD_KEY = "unkernelos:coi-reloaded:v1";
      if (!self.crossOriginIsolated && !sessionStorage.getItem(COI_RELOAD_KEY)) {
        const triggerReloadOnce = () => {
          if (!self.crossOriginIsolated && !sessionStorage.getItem(COI_RELOAD_KEY)) {
            sessionStorage.setItem(COI_RELOAD_KEY, "1");
            window.location.reload();
          }
        };

        if (navigator.serviceWorker.controller) {
          triggerReloadOnce();
        } else {
          navigator.serviceWorker.addEventListener("controllerchange", triggerReloadOnce, {
            once: true,
          });
        }
      } else if (self.crossOriginIsolated) {
        sessionStorage.removeItem(COI_RELOAD_KEY);
      }
    } catch (err) {
      console.warn("[unkernelOS] PWA/COI service worker registration failed:", err);
    }
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    await this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      this.deferredPrompt = null;
      this.update({ installable: false, installed: true });
      return true;
    }
    return false;
  }
}

export const pwaStore = new PwaStore();

export function usePwa(): PwaState {
  return useSyncExternalStore(pwaStore.subscribe, pwaStore.getSnapshot);
}
