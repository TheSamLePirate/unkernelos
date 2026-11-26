#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
export MACOSX_DEPLOYMENT_TARGET=14.0
mkdir -p .cache
bun run build > .cache/companion-web-build.log 2>&1
cargo +1.99.1 build --manifest-path companion/Cargo.toml --release --locked
bundle="$PWD/.cache/companion/unkernelOS Companion.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources/web" "$bundle/Contents/Resources/distros"
cp companion/target/release/unkernelos-companion "$bundle/Contents/MacOS/unkernelos-companion"
rsync -a --delete dist/ "$bundle/Contents/Resources/web/"
for distro in alpine debian; do
  image=".cache/distros/v0.2.0-261124-c08e977/$distro.erofs"
  if [[ ! -f "$image" ]]; then
    print -u2 "Missing $image — run bun run fetch-distros first."
    exit 1
  fi
  cp "$image" "$bundle/Contents/Resources/distros/"
done
iconset="$PWD/.cache/companion/Companion.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" public/icon-512.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" public/icon-512.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$bundle/Contents/Resources/Companion.icns"
cp "${CARGO_HOME:-$HOME/.cargo}"/registry/src/index.crates.io-*/wisp-mux-5.1.0/LICENSE "$bundle/Contents/Resources/WISP-LGPL-3.0.txt"
cp companion/THIRD_PARTY.md "$bundle/Contents/Resources/"
cp companion/README.md "$bundle/Contents/Resources/"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>unkernelOS Companion</string>
<key>CFBundleDisplayName</key><string>unkernelOS Companion</string>
<key>CFBundleIdentifier</key><string>com.unkernelos.companion</string>
<key>CFBundleExecutable</key><string>unkernelos-companion</string>
<key>CFBundleIconFile</key><string>Companion.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$bundle"
print "$bundle"
