#!/usr/bin/env bash
# The build's tools and sources, each checked against its pin before use:
#   Emscripten 6.0.13, the release archive itself (tools.lock [emsdk], sha256), configured without emsdk's installer;
#   elan (tools.lock [elan], sha256) and the Lean 4.32.2 toolchain, for the C of Init, Std and Lean and the driver;
#   Lean's source at the pinned commit (engine.lock.json);
#   the driver, admitted by BLAKE3 label (fetch-driver.mjs).
# TOOLS=lean fetches elan and Lean only, for the corpus gate, which reuses a cached engine.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
root=$(cd "$pkg/../../.." && pwd)
: "${WORK:?}"
toml() { python3 -c 'import sys,tomllib; print(tomllib.load(open(sys.argv[1],"rb"))[sys.argv[2]][sys.argv[3]])' "$root/tools.lock" "$1" "$2"; }
lock() { python3 -c 'import sys,json; v=json.load(open(sys.argv[1]))
for k in sys.argv[2:]: v=v[k]
print(v)' "$pkg/engine.lock.json" "$@"; }

if [ "${TOOLS:-all}" = all ] && [ ! -x "$WORK/emsdk/install/emscripten/emcc" ]; then
  url=$(toml emsdk url); sha=$(toml emsdk sha256)
  mkdir -p "$WORK/emsdk"
  curl -fsSL "$url" -o "$WORK/emsdk/wasm-binaries.tar.xz"
  echo "$sha  $WORK/emsdk/wasm-binaries.tar.xz" | sha256sum -c -
  tar -xJf "$WORK/emsdk/wasm-binaries.tar.xz" -C "$WORK/emsdk"
  rm "$WORK/emsdk/wasm-binaries.tar.xz"
  cat > "$WORK/emsdk/.emscripten" <<CFG
LLVM_ROOT = '$WORK/emsdk/install/bin'
BINARYEN_ROOT = '$WORK/emsdk/install'
NODE_JS = '$(command -v node)'
CFG
fi

if [ ! -x "$HOME/.elan/bin/elan" ]; then
  url=$(toml elan url); sha=$(toml elan sha256)
  curl -fsSL "$url" -o "$WORK/elan.tar.gz"
  echo "$sha  $WORK/elan.tar.gz" | sha256sum -c -
  tar -xzf "$WORK/elan.tar.gz" -C "$WORK"
  "$WORK/elan-init" -y --default-toolchain none --no-modify-path
  rm -f "$WORK/elan.tar.gz" "$WORK/elan-init"
fi
"$HOME/.elan/bin/elan" toolchain install "$(lock lean toolchain)"

source "$here/env.sh"
"$LEAN_BIN/lean" --version
[ "${TOOLS:-all}" = all ] || exit 0

commit=$(lock lean commit)
if [ "$(git -C "$WORK/lean4" rev-parse HEAD 2>/dev/null || true)" != "$commit" ]; then
  rm -rf "$WORK/lean4"
  git init -q "$WORK/lean4"
  git -C "$WORK/lean4" fetch -q --depth 1 "$(lock lean repository)" "$commit"
  git -C "$WORK/lean4" checkout -q FETCH_HEAD
fi
[ "$(git -C "$WORK/lean4" rev-parse HEAD)" = "$commit" ]

node "$here/fetch-driver.mjs" "$WORK/driver"
emcc --version | head -1
