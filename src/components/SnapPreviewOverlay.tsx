import React from "react";
import { useWm, type SnapZone } from "../wm/wm-store.ts";

const TOP_BAR_H = 36;
const DOCK_H = 78;

export function getSnapZoneStyle(zone: SnapZone): React.CSSProperties | null {
  const fullH = `calc(100vh - ${TOP_BAR_H + DOCK_H + 14}px)`;
  const halfH = `calc((100vh - ${TOP_BAR_H + DOCK_H + 22}px) / 2)`;
  const bottomTop = `calc(${TOP_BAR_H + 6}px + (100vh - ${TOP_BAR_H + DOCK_H + 22}px) / 2 + 8px)`;

  switch (zone) {
    case "maximize":
      return { left: 8, top: TOP_BAR_H + 6, width: "calc(100vw - 16px)", height: fullH };
    case "left":
      return { left: 8, top: TOP_BAR_H + 6, width: "calc(50vw - 12px)", height: fullH };
    case "right":
      return { left: "calc(50vw + 4px)", top: TOP_BAR_H + 6, width: "calc(50vw - 12px)", height: fullH };
    case "top-left":
      return { left: 8, top: TOP_BAR_H + 6, width: "calc(50vw - 12px)", height: halfH };
    case "top-right":
      return { left: "calc(50vw + 4px)", top: TOP_BAR_H + 6, width: "calc(50vw - 12px)", height: halfH };
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
      <span className="px-3 py-1 rounded-full bg-black/55 border border-white/20 text-[11px] font-mono uppercase tracking-wider text-white/90">
        {wm.dragSnapPreview.replace("-", " ")}
      </span>
    </div>
  );
};
