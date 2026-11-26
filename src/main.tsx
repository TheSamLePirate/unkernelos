import React from "react";
import ReactDOM from "react-dom/client";
import { Desktop } from "./components/Desktop.tsx";
import { pwaStore } from "./core/pwa-service.ts";
import "./index.css";
import { bootstrapCompanion } from "./core/companion-config.ts";
import { startCompanionBridge } from "./core/companion-bridge.ts";

// Register unified PWA + COOP/COEP Isolation Service Worker before VM boot
// so SharedArrayBuffer + Web Worker + multi-vCPU SMP activate on static hosts (GitHub Pages).
void pwaStore.registerServiceWorker();

try {
  await bootstrapCompanion();
} catch (error) {
  const root = document.getElementById("root")!;
  root.style.cssText =
    "padding:48px;color:#e4eaf3;background:#101824;min-height:100vh;font:16px system-ui";
  root.textContent = `Companion indisponible. Rouvrez l’app native unkernelOS Companion puis rechargez cette page. ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
const stopCompanion = startCompanionBridge();
if (import.meta.hot) import.meta.hot.dispose(stopCompanion);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>,
);
