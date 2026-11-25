import React from "react";
import { useWm, type SnapZone } from "../wm/wm-store.ts";

const TOP_BAR_H = 38;
const DOCK_H = 82;

export function getSnapZoneStyle(zone: SnapZone): React.CSSProperties | null {
  // Use 100dvh + safe-area-inset so iPad Safari & desktop maximize/snap never clip under the Dock
  const topExpr = `calc(${TOP_BAR_H + 6}px + env(safe-area-inset-top))`;
  const usableH = `calc(100dvh - ${TOP_BAR_H + DOCK_H + 14}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`;
  const halfH = `calc((100dvh - ${TOP_BAR_H + DOCK_H + 22}px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2)`;
  const bottomTop = `calc(${TOP_BAR_H + 6}px + env(safe-area-inset-top) + (100dvh - ${TOP_BAR_H + DOCK_H + 22}px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2 + 8px)`;

  switch (zone) {
    case "maximize":
      return { left: 8, top: topExpr, width: "calc(100vw - 16px)", height: usableH };
    case "left":
      return { left: 8, top: topExpr, width: "calc(50vw - 12px)", height: usableH };
    case "right":
      return { left: "calc(50vw + 4px)", top: topExpr, width: "calc(50vw - 12px)", height: usableH };
    case "top-left":
      return { left: 8, top: topExpr, width: "calc(50vw - 12px)", height: halfH };
    case "top-right":
      return { left: "calc(50vw + 4px)", top: topExpr, width: "calc(50vw - 12px)", height: halfH };
    case "bottom-left":
      return { left: 8, top: bottomTop, width: "calc(50vw - 12px)", height: halfH };
    case "bottom-right":
      return { left: "calc(50vw + 4px)", top: bottomTop, width: "calc(50vw - 12px)", height: halfH };
    default:
      return null;
  }
}

export const SnapPreviewOverlay: React.FC = () => {
  const wm = useWm();
  if (!wm.dragSnapPreview || wm.dragSnapPreview === "none") return null;

  const rect = getSnapZoneStyle(wm.dragSnapPreview);
  if (!rect) return null;

  return (
    <div
      style={rect}
      className="fixed z-[45] rounded-2xl snap-zone-preview pointer-events-none transition-all duration-150 flex items-center justify-center"
    >
      <span className="px-3.5 py-1.5 rounded-full bg-black/60 border border-white/25 text-[11px] font-mono uppercase tracking-wider text-white/95 shadow-xl">
        {wm.dragSnapPreview.replace("-", " ")}
      </span>
    </div>
  );
};
