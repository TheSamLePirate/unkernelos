import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const copyVirglWasmPlugin = () => ({
  name: "unkernelos-virgl-wasm",
  closeBundle() {
    const src = path.resolve(process.cwd(), "node_modules/unkernel/dist/virgl.wasm");
    const dstDir = path.resolve(process.cwd(), "dist/assets");
    if (existsSync(src)) {
      mkdirSync(dstDir, { recursive: true });
      copyFileSync(src, path.join(dstDir, "virgl.wasm"));
    }
  },
});

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), tailwindcss(), copyVirglWasmPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["unkernel", "wland"],
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
  },
});
