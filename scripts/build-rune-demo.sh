#!/usr/bin/env bash
# Builds the real Rust Rune "Liquid Metal unkernelOS Réglages" app to WebAssembly (WebGPU + WebGL2)
# and outputs a self-contained static bundle into public/rune-apps/liquid-metal-settings/.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rune-apps/liquid-metal-settings"
OUT_DIR="${1:-$ROOT_DIR/public/rune-apps/liquid-metal-settings}"
TOOLCHAIN="${RUNE_RUST_TOOLCHAIN:-1.99.1}"
WBG_VER="0.2.130"

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if ! command -v wasm-bindgen >/dev/null 2>&1 || [ "$(wasm-bindgen --version)" != "wasm-bindgen $WBG_VER" ]; then
  echo "[build-rune-demo] Installing prebuilt wasm-bindgen $WBG_VER..."
  ARCH="$(uname -m)"
  OS="$(uname -s)"
  case "${OS}_${ARCH}" in
    Darwin_arm64|Darwin_aarch64) TRIPLE="aarch64-apple-darwin" ;;
    Darwin_x86_64) TRIPLE="x86_64-apple-darwin" ;;
    Linux_aarch64|Linux_arm64) TRIPLE="aarch64-unknown-linux-gnu" ;;
    Linux_x86_64) TRIPLE="x86_64-unknown-linux-musl" ;;
    *) echo "Unsupported platform: ${OS}_${ARCH}" >&2; exit 1 ;;
  esac
  mkdir -p "$HOME/.local/bin"
  curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WBG_VER}/wasm-bindgen-${WBG_VER}-${TRIPLE}.tar.gz" \
    | tar -xz --strip-components=1 -C "$HOME/.local/bin" "wasm-bindgen-${WBG_VER}-${TRIPLE}/wasm-bindgen"
  chmod +x "$HOME/.local/bin/wasm-bindgen"
fi

if command -v rustup >/dev/null 2>&1; then
  rustup target add --toolchain "$TOOLCHAIN" wasm32-unknown-unknown >/dev/null 2>&1 || true
  CARGO_CMD=(rustup run "$TOOLCHAIN" cargo)
else
  CARGO_CMD=(cargo)
fi

echo "[build-rune-demo] Compiling unkernel-liquid-settings (Rust Rune + rune-fx -> wasm32-unknown-unknown)..."
(
  cd "$CRATE_DIR"
  "${CARGO_CMD[@]}" build --release --lib --target wasm32-unknown-unknown
)

WASM_IN="$CRATE_DIR/target/wasm32-unknown-unknown/release/unkernel_liquid_settings.wasm"
mkdir -p "$OUT_DIR"

echo "[build-rune-demo] Running wasm-bindgen $WBG_VER..."
wasm-bindgen --target web --out-dir "$OUT_DIR" --out-name app --no-typescript "$WASM_IN"

cat > "$OUT_DIR/index.html" <<'HTML'
<!doctype html>
<html lang="fr" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>Liquid Metal Réglages — Rust Rune</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none;
      background: #070910;
      color: #e4e4e7;
      font-family: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    #boot {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: radial-gradient(circle at 50% 35%, rgba(139,92,246,0.18), #070910 65%);
      font-size: 13px;
      color: #a1a1aa;
      z-index: 10;
      transition: opacity 220ms ease;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 2.5px solid rgba(255,255,255,0.12);
      border-top-color: #22d3ee;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="boot">
    <div class="spinner"></div>
    <div>Initialisation du moteur GPU Rust Rune (Liquid Metal)…</div>
  </div>
  <script type="module">
    window.__UNKERNELOS_STATE_QUEUE__ = [];
    const hashState = new URLSearchParams(location.hash.replace(/^#/, '')).get('state');
    if (hashState) window.__UNKERNELOS_STATE_QUEUE__.push(hashState);

    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (d && d.source === 'unkernelos-host' && typeof d.snapshot === 'string') {
        window.__UNKERNELOS_STATE_QUEUE__.push(d.snapshot);
      }
    });

    // Prefer direct GPU so rune-fx Liquid Metal WGSL renders immediately on WebGPU or WebGL2
    globalThis.RUNE_CPU_FIRST = 'off';

    import init from './app.js';
    try {
      await init();
      const el = document.getElementById('boot');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 240);
      }
      window.parent.postMessage({ source: 'unkernelos-rune-settings', kind: 'ready' }, '*');
    } catch (err) {
      const el = document.getElementById('boot');
      if (el) {
        el.innerHTML = '<div style="color:#fda4af;max-width:420px;text-align:center;padding:16px">Erreur GPU Rune : ' +
          String(err && err.message ? err.message : err) + '</div>';
      }
      window.parent.postMessage({ source: 'unkernelos-rune-settings', kind: 'error', value: String(err) }, '*');
    }
  </script>
</body>
</html>
HTML

ls -lh "$OUT_DIR"
echo "[build-rune-demo] Built successfully into $OUT_DIR"
