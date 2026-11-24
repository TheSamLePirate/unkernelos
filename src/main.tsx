import React from "react";
import ReactDOM from "react-dom/client";
import { Desktop } from "./components/Desktop.tsx";
import { pwaStore } from "./core/pwa-service.ts";
import "./index.css";

// Register unified PWA + COOP/COEP Isolation Service Worker before VM boot
// so SharedArrayBuffer + Web Worker + multi-vCPU SMP activate on static hosts (GitHub Pages).
void pwaStore.registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>
);
