import { useEffect, useState } from "react";

export interface ViewportState {
  readonly isMobile: boolean;
  readonly isTablet: boolean;
  readonly isTouch: boolean;
  readonly width: number;
  readonly height: number;
}

function readViewport(): ViewportState {
  if (typeof window === "undefined") {
    return { isMobile: false, isTablet: false, isTouch: false, width: 1280, height: 800 };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isTouch =
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;
  return { isMobile, isTablet, isTouch, width, height };
}

export function useViewport(): ViewportState {
  const [vp, setVp] = useState<ViewportState>(readViewport);

  useEffect(() => {
    const update = () => setVp(readViewport());
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    const mq = window.matchMedia?.("(pointer: coarse)");
    mq?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mq?.removeEventListener?.("change", update);
    };
  }, []);

  return vp;
}

export function useIsMobile(): boolean {
  return useViewport().isMobile;
}
