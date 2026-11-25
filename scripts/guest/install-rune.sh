#!/bin/sh
# Installs Rust Rune UI Framework (https://github.com/anomalyco/rune) into /opt/rune
# along with Rust 1.99.1 (via rustup), wasm32-unknown-unknown target, wasm-bindgen 0.2.130,
# Linux Wayland/xkb dev libraries, and helper CLIs (`rune-new`, `rune-web-build`).
#
# Used by the in-OS Toolchain Installer (src/core/toolchain-service.ts via `?raw` import).
set -eu

PREFIX="${RUNE_PREFIX:-/opt/rune}"
REPO="${RUNE_REPO:-https://github.com/anomalyco/rune.git}"
REF="${RUNE_REF:-ce1caa8ac79a15d0ea405fdc800a49d1e3351d4f}"
RUST_VER="${RUNE_RUST_VER:-1.99.1}"
WBG_VER="0.2.130"

export PATH="$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "install-rune: installing Linux Wayland/xkb dev libraries..."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends \
    git curl ca-certificates gcc g++ libc6-dev pkg-config \
    libxkbcommon-dev libwayland-dev libegl-dev python3
fi

# 1. Install rustup + Rust 1.99.1 + wasm32-unknown-unknown
if ! command -v rustup >/dev/null 2>&1; then
  echo "install-rune: installing rustup + Rust ${RUST_VER}..."
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain "$RUST_VER" --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
else
  echo "install-rune: ensuring Rust ${RUST_VER} toolchain..."
  rustup toolchain install "$RUST_VER" --profile minimal
fi
rustup target add --toolchain "$RUST_VER" wasm32-unknown-unknown

# 2. Install prebuilt wasm-bindgen 0.2.130 for Linux aarch64/x86_64
if ! command -v wasm-bindgen >/dev/null 2>&1 || [ "$(wasm-bindgen --version)" != "wasm-bindgen $WBG_VER" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    aarch64|arm64) TRIPLE="aarch64-unknown-linux-gnu" ;;
    x86_64) TRIPLE="x86_64-unknown-linux-musl" ;;
    *) echo "install-rune: unsupported arch $ARCH" >&2; exit 1 ;;
  esac
  echo "install-rune: installing wasm-bindgen ${WBG_VER} (${TRIPLE})..."
  TMPW="$(mktemp -d)"
  curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WBG_VER}/wasm-bindgen-${WBG_VER}-${TRIPLE}.tar.gz" \
    | tar -xz --strip-components=1 -C "$TMPW" "wasm-bindgen-${WBG_VER}-${TRIPLE}/wasm-bindgen"
  sudo install -m 755 "$TMPW/wasm-bindgen" /usr/local/bin/wasm-bindgen
  rm -rf "$TMPW"
fi

# 3. Fetch pinned anomalyco/rune source checkout into /opt/rune
echo "install-rune: fetching anomalyco/rune @ ${REF}..."
sudo rm -rf "$PREFIX"
sudo mkdir -p "$PREFIX"
sudo chown -R "$(id -u):$(id -g)" "$PREFIX"
git init -q "$PREFIX"
git -C "$PREFIX" remote add origin "$REPO"
git -C "$PREFIX" fetch -q --depth 1 origin "$REF"
git -C "$PREFIX" checkout -q FETCH_HEAD
# Trim heavy demo videos/recordings to keep disk lean
rm -rf "$PREFIX/demo" "$PREFIX/.git"
printf '%s\n' "${REF}" | cut -c1-7 > "$PREFIX/VERSION"

# 4. Install convenience wrappers: rune-web-build & rune-new
sudo sh -c "cat > /usr/local/bin/rune-web-build" <<WRAP
#!/bin/sh
set -eu
export PATH="\$HOME/.cargo/bin:/usr/local/bin:\$PATH"
PROJ="\${1:-.}"
OUT="\${2:-\$PROJ/dist}"
cd "\$PROJ"
rustup run "${RUST_VER}" cargo build --release --lib --target wasm32-unknown-unknown
WASM=\$(find target/wasm32-unknown-unknown/release -maxdepth 1 -name '*.wasm' ! -name '*.d' | head -n1)
mkdir -p "\$OUT"
wasm-bindgen --target web --out-dir "\$OUT" --out-name app --no-typescript "\$WASM"
if [ ! -f "\$OUT/index.html" ]; then
  cat > "\$OUT/index.html" <<'HTML'
<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rune App</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#070910}</style></head><body><script type="module">globalThis.RUNE_CPU_FIRST='off';import init from './app.js';await init();</script></body></html>
HTML
fi
echo "Rune web bundle ready in \$OUT (serve with: python3 -m http.server 8080 -d \$OUT)"
WRAP

sudo sh -c "cat > /usr/local/bin/rune-new" <<WRAP
#!/bin/sh
set -eu
NAME="\${1:-my-rune-app}"
DIR="\${2:-\$HOME/workspace/\$NAME}"
mkdir -p "\$DIR/src"
cat > "\$DIR/rust-toolchain.toml" <<'TC'
[toolchain]
channel = "${RUST_VER}"
targets = ["wasm32-unknown-unknown"]
TC
cat > "\$DIR/Cargo.toml" <<EOF
[package]
name = "\$NAME"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
rune = { path = "${PREFIX}/crates/rune", default-features = false, features = ["embedded-fonts", "webgl"] }
rune-fx = { path = "${PREFIX}/crates/rune-fx" }

[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "=${WBG_VER}"

[patch.crates-io]
winit = { path = "${PREFIX}/vendor/winit" }
sctk-adwaita = { path = "${PREFIX}/vendor/sctk-adwaita" }
parley_engine = { path = "${PREFIX}/vendor/parley_engine" }
wgpu-hal = { path = "${PREFIX}/vendor/wgpu-hal" }
naga = { path = "${PREFIX}/vendor/naga" }
accesskit_windows = { path = "${PREFIX}/vendor/accesskit_windows" }
accesskit_macos = { path = "${PREFIX}/vendor/accesskit_macos" }
accesskit_atspi_common = { path = "${PREFIX}/vendor/accesskit_atspi_common" }
EOF
cat > "\$DIR/src/lib.rs" <<'RS'
#![forbid(unsafe_code)]
use rune::{AppSpec, Cx, El, col, el, text, tok};
use rune::tok::{motion, type_};

#[derive(Default)]
struct State { on: bool }

fn view(s: &State, _: &mut Cx<State>) -> El {
    let t = tok::theme(true);
    let knob = el().key("knob").size(18.0, 18.0).radius(9.0).fill(t.knob)
        .absolute(if s.on { 18.0 } else { 2.0 }, 2.0);
    let sw = el().key("sw").size(38.0, 22.0).radius(11.0)
        .fill(if s.on { tok::accent(0, true) } else { t.control_off })
        .motion(motion::SNAPPY)
        .on_press(|s: &mut State| s.on = !s.on)
        .child(knob);
    col().w_full().h_full().center().gap(16.0).fill(t.bg)
        .child(text(if s.on { "Rune Native UI: ON" } else { "Rune Native UI: OFF" }).font(type_::TITLE).color(t.text))
        .child(sw)
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(start))]
pub fn start() {
    rune::run(AppSpec::new("Rune App", (640.0, 420.0), State::default, view));
}
RS
cat > "\$DIR/src/main.rs" <<EOF
fn main() { \$(echo "\$NAME" | tr '-' '_')::start(); }
EOF
echo "Created Rust Rune project in \$DIR"
echo "  Web build : cd \$DIR && rune-web-build \$NAME --out dist"
echo "  Linux run : cd \$DIR && cargo run"
WRAP

sudo chmod 755 /usr/local/bin/rune-web-build /usr/local/bin/rune-new
echo "install-rune: OK Rune $(cat "$PREFIX/VERSION") + Rust $(rustup run "$RUST_VER" rustc --version) + $(wasm-bindgen --version)"
