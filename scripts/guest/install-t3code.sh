#!/usr/bin/env bash
# Installs pingdotgg/t3code self-contained linux-arm64 CLI + Web Server into /opt/t3code
# and links /usr/local/bin/t3. Safe to run inside Debian EROFS chroot OR live unkernelOS VM!
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) KEY="linux-arm64" ;;
  x86_64|amd64)  KEY="linux-x64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

TAG="${T3CODE_VERSION:-}"
if [ -z "$TAG" ]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/pingdotgg/t3code/releases/latest" \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
fi
if [ -z "$TAG" ]; then
  TAG="v0.1.12"
fi

VER="${TAG#v}"
ARCHIVE="t3-${VER}-${KEY}.tar.gz"
BASE_URL="https://github.com/pingdotgg/t3code/releases/download/${TAG}"

TMP_DIR="$(mktemp -d /tmp/t3code-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[t3code] Installing T3 Code ${VER} (${KEY})..."
curl -fsSL "${BASE_URL}/${ARCHIVE}" -o "${TMP_DIR}/${ARCHIVE}"

# Verify SHA-256 when SHA256SUMS is available
if curl -fsSL "${BASE_URL}/SHA256SUMS" -o "${TMP_DIR}/SHA256SUMS" 2>/dev/null; then
  EXPECTED="$(grep -E "[[:space:]]\*?${ARCHIVE}\$" "${TMP_DIR}/SHA256SUMS" | awk '{print $1}' | head -n1 || true)"
  if [ -n "$EXPECTED" ] && command -v sha256sum >/dev/null 2>&1; then
    ACTUAL="$(sha256sum "${TMP_DIR}/${ARCHIVE}" | awk '{print $1}')"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "[t3code] SHA-256 mismatch! expected=${EXPECTED} actual=${ACTUAL}" >&2
      exit 1
    fi
    echo "[t3code] SHA-256 verified (${ACTUAL:0:12}...)"
  fi
fi

rm -rf /opt/t3code.new
mkdir -p /opt/t3code.new
tar -xzf "${TMP_DIR}/${ARCHIVE}" -C /opt/t3code.new --strip-components=1

if [ ! -x /opt/t3code.new/t3 ]; then
  echo "[t3code] Expected /opt/t3code.new/t3 executable not found!" >&2
  ls -la /opt/t3code.new >&2
  exit 1
fi

echo "${VER}" > /opt/t3code.new/VERSION
rm -rf /opt/t3code
mv /opt/t3code.new /opt/t3code
ln -sf /opt/t3code/t3 /usr/local/bin/t3

echo "[t3code] Installed: $(/usr/local/bin/t3 --version 2>&1 | head -n1)"
