#!/bin/sh
# Installs microML (https://github.com/coucou747/microML, by coucou747) into /opt/microml.
#
# Pinned to the `unkernelos` branch of the TheSamLePirate/microML fork: upstream main plus
# the fixes proposed upstream (coucou747/microML PRs #1-#6: typer, runtime comparisons,
# --debug dumps, heap allocation, Poule proof checker + --trace). Switch REPO/REF back to
# upstream once they are merged.
#
# Used both by the Debian image build (scripts/build-debian-dev.sh, inside the chroot)
# and by the in-OS Toolchain Installer (src/core/toolchain-service.ts, via `?raw` import).
# Requires (Debian): ocaml ocaml-dune menhir libmenhir-ocaml-dev gcc libc6-dev git ca-certificates
#
# Layout:
#   /opt/microml/src            upstream checkout (pinned), build artifacts removed
#   /opt/microml/bin            microml.exe (compiler) + poule.exe (proof language front-end)
#   /opt/microml/lib            libruntime.a
#   /opt/microml/include        rt.h
#   /opt/microml/shim/clang     microML hard-codes `clang`: route to clang if present, else gcc.
#                               MICROML_C_OUT=<file> tees the generated C there,
#                               MICROML_DRY=1 skips the C compiler entirely (pass inspection).
#   /opt/microml/examples       upstream test programs
#   /usr/local/bin/microml      wrapper with runtime paths preset
#   /usr/local/bin/poule        wrapper
set -eu

PREFIX="${MICROML_PREFIX:-/opt/microml}"
REPO="${MICROML_REPO:-https://github.com/TheSamLePirate/microML.git}"
REF="${MICROML_REF:-25d39a3de26a52afb7c92d5f6a7f9b945dcb76de}"

for bin in dune menhir gcc git; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "install-microml: missing '$bin' (apt-get install ocaml ocaml-dune menhir libmenhir-ocaml-dev gcc libc6-dev git)" >&2
    exit 1
  fi
done

rm -rf "$PREFIX"
mkdir -p "$PREFIX/bin" "$PREFIX/lib" "$PREFIX/include" "$PREFIX/shim" "$PREFIX/examples"

cat > "$PREFIX/shim/clang" <<'SHIM'
#!/bin/sh
# microML calls `clang`; use a real clang when installed, otherwise gcc (same flags).
CC_BIN=gcc
for c in /usr/bin/clang /usr/local/bin/clang; do
  if [ -x "$c" ]; then CC_BIN="$c"; break; fi
done
if [ -n "${MICROML_DRY:-}" ]; then
  # Pass-inspection mode: swallow the generated C (optionally keep it) and succeed.
  cat > "${MICROML_C_OUT:-/dev/null}"
  exit 0
fi
if [ -n "${MICROML_C_OUT:-}" ]; then
  tee "$MICROML_C_OUT" | "$CC_BIN" "$@"
  exit $?
fi
exec "$CC_BIN" "$@"
SHIM
chmod 755 "$PREFIX/shim/clang"

echo "install-microml: fetching $REPO @ $REF"
git init -q "$PREFIX/src"
git -C "$PREFIX/src" remote add origin "$REPO"
git -C "$PREFIX/src" fetch -q --depth 1 origin "$REF"
git -C "$PREFIX/src" checkout -q FETCH_HEAD

echo "install-microml: building with dune"
(
  cd "$PREFIX/src"
  PATH="$PREFIX/shim:$PATH" dune build --profile release bin/main.exe bin/poule.exe runtime/libruntime.a 2>&1 \
    | grep -v -E '^(Warning: |File ".*\.mly", line)' || true
  test -x _build/default/bin/main.exe
)

install -m 755 "$PREFIX/src/_build/default/bin/main.exe" "$PREFIX/bin/microml.exe"
install -m 755 "$PREFIX/src/_build/default/bin/poule.exe" "$PREFIX/bin/poule.exe"
install -m 644 "$PREFIX/src/_build/default/runtime/libruntime.a" "$PREFIX/lib/libruntime.a"
cp "$PREFIX/src/runtime/include/"*.h "$PREFIX/include/"
cp "$PREFIX/src/test/"*.ml "$PREFIX/src/test/"*.poule "$PREFIX/examples/" 2>/dev/null || true
git -C "$PREFIX/src" rev-parse --short HEAD > "$PREFIX/VERSION"
rm -rf "$PREFIX/src/_build" "$PREFIX/src/.git"

cat > /usr/local/bin/microml <<WRAP
#!/bin/sh
PATH="$PREFIX/shim:\$PATH" exec "$PREFIX/bin/microml.exe" --runtime "$PREFIX/lib/libruntime.a" -I "$PREFIX/include" "\$@"
WRAP
cat > /usr/local/bin/poule <<WRAP
#!/bin/sh
exec "$PREFIX/bin/poule.exe" "\$@"
WRAP
chmod 755 /usr/local/bin/microml /usr/local/bin/poule
chmod -R a+rX "$PREFIX"

# Smoke test: interpreter and native backend must agree.
T="$(mktemp -d)"
printf 'external print_int : int -> unit = "prim_print_int_clot"\nlet out = print_int (6 * 7)\n' > "$T/t.ml"
EVAL_OUT="$(microml --eval "$T/t.ml")"
microml "$T/t.ml" -o "$T/t.bin" >/dev/null 2>&1
NATIVE_OUT="$("$T/t.bin")"
rm -rf "$T"
if [ "$EVAL_OUT" != "42" ] || [ "$NATIVE_OUT" != "42" ]; then
  echo "install-microml: smoke test failed (eval='$EVAL_OUT' native='$NATIVE_OUT')" >&2
  exit 1
fi
# Poule must accept a valid proof and reject a false one.
T="$(mktemp -d)"
printf 'pred p : ()\naxiom a : p()\ntheorem ok : p() = a\n' > "$T/ok.poule"
printf 'pred p : ()\npred q : ()\naxiom a : p()\ntheorem bad : q() = a\n' > "$T/bad.poule"
if ! poule "$T/ok.poule" >/dev/null 2>&1 || poule "$T/bad.poule" >/dev/null 2>&1; then
  rm -rf "$T"
  echo "install-microml: Poule smoke test failed" >&2
  exit 1
fi
rm -rf "$T"
echo "install-microml: OK microML $(cat "$PREFIX/VERSION") (eval=42 native=42, poule checks proofs)"
