import { useEffect, useState } from "react";

export interface ViewportState {
  readonly isMobile: boolean;
  readonly isTablet: boolean;
  readonly isIPad: boolean;
  readonly isTouch: boolean;
  readonly width: number;
  readonly height: number;
  readonly visualHeight: number;
  readonly keyboardInset: number;
}

function readViewport(): ViewportState {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isTablet: false,
      isIPad: false,
      isTouch: false,
      width: 1280,
      height: 800,
      visualHeight: 800,
      keyboardInset: 0,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const vv = window.visualViewport;
  const visualHeight = vv ? Math.round(vv.height) : height;
  const rawKb = vv ? Math.max(0, Math.round(height - vv.height - vv.offsetTop)) : 0;
  // Ignore tiny Safari address bar deltas (< 90px)
  const keyboardInset = rawKb > 90 ? rawKb : 0;

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isTouch =
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;
  // iPadOS Safari reports desktop UA + touch points and widths 768..1366
  const isIPad = isTouch && width >= 768 && width <= 1400;

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--kb-inset", `${keyboardInset}px`);
    document.documentElement.style.setProperty("--vvh", `${visualHeight}px`);
  }

  return { isMobile, isTablet, isIPad, isTouch, width, height, visualHeight, keyboardInset };
}

export function useViewport(): ViewportState {
  const [vp, setVp] = useState<ViewportState>(readViewport);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVp(readViewport());
      });
    };

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
    const mq = window.matchMedia?.("(pointer: coarse)");
    mq?.addEventListener?.("change", schedule);

    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      mq?.removeEventListener?.("change", schedule);
    };
  }, []);

  return vp;
}

export function useIsMobile(): boolean {
  return useViewport().isMobile;
}
