#!/usr/bin/env bash
# The engine: Lean 4.32.2's elaborator, kernel and IR interpreter as single-threaded 64-bit WebAssembly, with the
# prover's driver. Every input is pinned (engine.lock.json, tools.lock [emsdk]); `engine-label.mjs` names the build
# by the BLAKE3 label of those inputs, so CI reruns it only when one of them changes.
#
#   WORK=/path/to/work bash build/build-engine.sh      (Linux x86-64; needs git, curl, python3, cmake, make, node)
#
# Steps, each skipped when its output exists: tools (Emscripten, elan and Lean 4.32.2, Lean's source at the pinned
# commit, the driver), the C of Init, Std and Lean (gen-c.sh), the driver natively with Lake, GMP and libuv as
# 64-bit WebAssembly (build-deps.sh), then the link (build-wasm.sh). Output: $WORK/dist/lean-elab.{mjs,wasm}.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
export WORK=${WORK:?set WORK to a work folder}
mkdir -p "$WORK"
bash "$here/fetch-tools.sh"
bash "$here/gen-c.sh"
bash "$here/build-driver.sh"
bash "$here/build-deps.sh"
bash "$here/build-wasm.sh"
node "$pkg/build/engine-label.mjs" > "$WORK/dist/engine-label.txt"
cat "$WORK/dist/engine-label.txt"
