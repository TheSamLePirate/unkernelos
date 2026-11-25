#!/usr/bin/env bash
# Builds a full-featured Debian 13 aarch64 EROFS image for unkernelOS with:
#   git, gh, python3, pip, node, npm, bun, pi (@earendil-works/pi-coding-agent),
#   claude (Claude Code), mesa/virgl (kmscube, eglinfo) & Wayland (foot)
# Must run on Linux aarch64 (e.g. GitHub Actions ubuntu-24.04-arm) with sudo.
set -euo pipefail

BASE_EROFS="${1:?Usage: $0 <input-debian.erofs> <output-debian.erofs>}"
OUT_EROFS="${2:?Usage: $0 <input-debian.erofs> <output-debian.erofs>}"

WORK_DIR="$(mktemp -d /tmp/unkernelos-img.XXXXXX)"
ROOTFS="$WORK_DIR/rootfs"
EROFS_BIN_DIR="$WORK_DIR/erofs-bin"
mkdir -p "$ROOTFS" "$EROFS_BIN_DIR"

cleanup() {
  set +e
  for m in dev/pts dev proc sys; do
    if mountpoint -q "$ROOTFS/$m" 2>/dev/null; then
      sudo umount -lf "$ROOTFS/$m" 2>/dev/null || true
    fi
  done
  sudo rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "=== [1/7] Ensuring erofs-utils with zstd support ==="
MKFS_EROFS="$(command -v mkfs.erofs || true)"
FSCK_EROFS="$(command -v fsck.erofs || true)"

needs_erofs_build=1
if [ -n "$MKFS_EROFS" ] && [ -n "$FSCK_EROFS" ]; then
  if "$MKFS_EROFS" --help 2>&1 | grep -q "zstd"; then
    needs_erofs_build=0
  fi
fi

if [ "$needs_erofs_build" = "1" ]; then
  echo "Building erofs-utils 1.9.4 with libzstd support..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq build-essential autoconf automake libtool pkg-config uuid-dev libzstd-dev liblz4-dev zlib1g-dev libxxhash-dev curl tar xz-utils
  curl -fsSL "https://git.kernel.org/pub/scm/linux/kernel/git/xiang/erofs-utils.git/snapshot/erofs-utils-1.9.4.tar.gz" | tar -xz -C "$WORK_DIR"
  (
    cd "$WORK_DIR/erofs-utils-1.9.4"
    ./autogen.sh >/dev/null
    ./configure --prefix="$EROFS_BIN_DIR" --with-libzstd --disable-lz4 --without-selinux >/dev/null
    make -j"$(nproc)" >/dev/null
    make install >/dev/null
  )
  MKFS_EROFS="$EROFS_BIN_DIR/bin/mkfs.erofs"
  FSCK_EROFS="$EROFS_BIN_DIR/bin/fsck.erofs"
fi
echo "Using mkfs.erofs: $MKFS_EROFS ($("$MKFS_EROFS" -V 2>&1 | head -n1))"
"$MKFS_EROFS" --help 2>&1 | grep -i zstd || { echo "ERROR: mkfs.erofs built without zstd!" >&2; exit 1; }

echo "=== [2/7] Extracting base Debian EROFS ($BASE_EROFS) ==="
sudo "$FSCK_EROFS" --extract="$ROOTFS" --overwrite "$BASE_EROFS"

echo "=== [3/7] Mounting chroot pseudo-filesystems ==="
sudo cp /etc/resolv.conf "$ROOTFS/etc/resolv.conf"
sudo mount --bind /dev "$ROOTFS/dev"
sudo mount --bind /dev/pts "$ROOTFS/dev/pts"
sudo mount -t proc proc "$ROOTFS/proc"
sudo mount -t sysfs sysfs "$ROOTFS/sys"

echo "=== [4/7] Installing Debian packages (git, gh, python3, science, rust, ocaml+menhir, sqlite3, mesa/gl, foot) ==="
sudo chroot "$ROOTFS" /bin/bash -euxo pipefail <<'CHROOT_APT'
export DEBIAN_FRONTEND=noninteractive
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

apt-get update
apt-get install -y --no-install-recommends \
  git \
  gh \
  python3 \
  python3-pip \
  python3-venv \
  python3-numpy \
  python3-matplotlib \
  sqlite3 \
  gcc \
  libc6-dev \
  pkg-config \
  rustc \
  cargo \
  ocaml \
  ocaml-dune \
  menhir \
  libmenhir-ocaml-dev \
  curl \
  ca-certificates \
  jq \
  ripgrep \
  zstd \
  unzip \
  tar \
  gzip \
  xz-utils \
  mesa-utils \
  libegl-mesa0 \
  libgles2 \
  kmscube \
  foot \
  fonts-dejavu-core

# Allow pip install globally in userland without PEP 668 friction
rm -f /usr/lib/python3.*/EXTERNALLY-MANAGED || true

apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /tmp/*
CHROOT_APT

echo "=== [5/7] Installing Node.js LTS, Bun, Pi Coding Agent & Claude Code (aarch64) ==="
sudo chroot "$ROOTFS" /bin/bash -euxo pipefail <<'CHROOT_TOOLS'
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 1. Node.js LTS (official linux-arm64)
NODE_VER=$(curl -fsSL https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts != false)][0].version')
echo "Installing Node.js ${NODE_VER} (linux-arm64)..."
curl -fsSL "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-arm64.tar.xz" \
  | tar -xJ --strip-components=1 -C /usr/local \
    --exclude="CHANGELOG.md" --exclude="README.md" --exclude="LICENSE"

# 2. Bun (official linux-aarch64 via npm package, same binary as bun.sh/install)
BUN_VER=$(curl -fsSL https://registry.npmjs.org/@oven/bun-linux-aarch64/latest | jq -r '.version')
echo "Installing Bun ${BUN_VER} (linux-aarch64)..."
mkdir -p /tmp/bun-dl
curl -fsSL "https://registry.npmjs.org/@oven/bun-linux-aarch64/-/bun-linux-aarch64-${BUN_VER}.tgz" \
  | tar -xz -C /tmp/bun-dl
install -m 755 /tmp/bun-dl/package/bin/bun /usr/local/bin/bun
ln -sf /usr/local/bin/bun /usr/local/bin/bunx
rm -rf /tmp/bun-dl

# 3. Pi Coding Agent (@earendil-works/pi-coding-agent) via Bun globally into /usr/local
echo "Installing @earendil-works/pi-coding-agent..."
export BUN_INSTALL=/usr/local
/usr/local/bin/bun add -g --ignore-scripts @earendil-works/pi-coding-agent
rm -rf /root/.bun /tmp/bun-* || true

# 4. Claude Code (official linux-arm64 zstd release)
CLAUDE_VER=$(curl -fsSL https://downloads.claude.ai/claude-code-releases/latest)
echo "Installing Claude Code ${CLAUDE_VER} (linux-arm64)..."
mkdir -p /usr/local/share/claude/versions
curl -fsSL "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VER}/linux-arm64/claude.zst" \
  | zstd -dc > "/usr/local/share/claude/versions/${CLAUDE_VER}"
chmod 755 "/usr/local/share/claude/versions/${CLAUDE_VER}"
ln -sf "/usr/local/share/claude/versions/${CLAUDE_VER}" /usr/local/bin/claude

# Ensure /usr/local/bin precedes shims and default user workspace exists
mkdir -p /home/user/workspace
chown -R 1000:1000 /home/user/workspace || true

echo "=== Installed versions inside chroot ==="
git --version
gh --version | head -n1
python3 --version
pip3 --version
python3 -c "import numpy, matplotlib; print('science:', numpy.__version__, matplotlib.__version__)"
sqlite3 --version
rustc --version
cargo --version
ocaml -version
dune --version
node --version
npm --version
bun --version
which pi && (pi --version || true)
claude --version
which eglinfo kmscube foot
CHROOT_TOOLS

echo "=== [5b/7] Building microML compiler (github.com/coucou747/microML) into /opt/microml ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo install -m 755 "$SCRIPT_DIR/guest/install-microml.sh" "$ROOTFS/tmp/install-microml.sh"
sudo chroot "$ROOTFS" /bin/sh -c 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; sh /tmp/install-microml.sh && rm -f /tmp/install-microml.sh'

echo "=== [5c/7] Installing T3 Code Agent Harness (pingdotgg/t3code linux-arm64) into /opt/t3code ==="
sudo install -m 755 "$SCRIPT_DIR/guest/install-t3code.sh" "$ROOTFS/tmp/install-t3code.sh"
sudo chroot "$ROOTFS" /bin/bash -c 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; bash /tmp/install-t3code.sh && rm -f /tmp/install-t3code.sh'

echo "=== [6/7] Updating image metadata & unmounting chroot ==="
NEW_ID="debian-unkernelos-$(date -u +%Y%m%d%H%M)"
echo "$NEW_ID" | sudo tee "$ROOTFS/usr/lib/kw-image" >/dev/null

for m in dev/pts dev proc sys; do
  sudo umount -lf "$ROOTFS/$m"
done

echo "=== [7/7] Packing zstd EROFS image (-L kwroot) ==="
mkdir -p "$(dirname "$OUT_EROFS")"
sudo "$MKFS_EROFS" -zzstd,level=15 -C131072 -Efragments -L kwroot "$OUT_EROFS" "$ROOTFS"
sudo chown "$(id -u):$(id -g)" "$OUT_EROFS"

echo "Verifying EROFS integrity..."
"$FSCK_EROFS" "$OUT_EROFS"

# Stamp KWDISTRO header (bytes 0..127, unused by EROFS) with 4 MiB boot prefetch hint
OUT_EROFS="$OUT_EROFS" NEW_ID="$NEW_ID" bun -e '
import { openSync, writeSync, closeSync, statSync } from "node:fs";
const p = process.env.OUT_EROFS!;
const id = process.env.NEW_ID!;
const size = statSync(p).size;
const hdr = new Uint8Array(136);
const enc = new TextEncoder();
hdr.set(enc.encode("KWDISTRO"), 0);
const dv = new DataView(hdr.buffer);
dv.setUint32(8, 1, true);                      // version = 1
dv.setUint32(12, 136, true);                   // header length
dv.setBigUint64(16, BigInt(size), true);       // image size
dv.setBigUint64(24, BigInt(Math.min(size, 4 * 1024 * 1024)), true); // 4 MiB prefetch
hdr.set(enc.encode("debian").subarray(0, 31), 32);
hdr.set(enc.encode(id).subarray(0, 63), 64);
dv.setBigUint64(128, 0n, true);                // background = 0 (pure on-demand)
const fd = openSync(p, "r+");
writeSync(fd, hdr, 0, hdr.length, 0);
closeSync(fd);
console.log(`Stamped KWDISTRO header: id=${id}, size=${(size / 1e6).toFixed(2)} MB`);
'

ls -lh "$OUT_EROFS"
