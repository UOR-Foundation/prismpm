#!/usr/bin/env bash
# The 32-bit engine and the Init it reads, for browsers without 64-bit WebAssembly memory (Safari before 27.3, every
# iOS browser). Same pinned inputs as build-engine.sh, plus WIDTH=32: libuv alone (build-deps.sh), the 32-bit link
# and lean32 (build-wasm.sh), then lean32 compiles Init (build-init32.sh). `engine-label.mjs 32` names the build.
#
#   WORK=/home/... bash build/build-engine32.sh     (Linux x86-64; WORK under /home or /tmp, where lean32 can see it)
#
# Output: $WORK/dist32/lean-elab.{mjs,wasm} and $WORK/sys32/lib/lean (Init, 32-bit).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
export WORK=${WORK:?set WORK to a work folder}
mkdir -p "$WORK"
bash "$here/fetch-tools.sh"
bash "$here/gen-c.sh"
bash "$here/build-driver.sh"
WIDTH=32 bash "$here/build-deps.sh"
WIDTH=32 bash "$here/build-wasm.sh"
bash "$here/build-init32.sh"
node "$pkg/build/engine-label.mjs" 32 > "$WORK/dist32/engine-label.txt"
cat "$WORK/dist32/engine-label.txt"
