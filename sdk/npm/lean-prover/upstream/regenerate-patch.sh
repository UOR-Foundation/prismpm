#!/usr/bin/env bash
# Regenerates lean-wasm-elaborator.patch from its three parts, for review: the Emscripten stubs
# (lean-emscripten-stubs.patch), the cooperative task manager (make-coop-patch.py) and the C++ signatures corrected
# to match the C Lean emits (make-abi-patch.py). The build never runs this; it applies the pinned patch, admitted by
# its BLAKE3 label. A change to the patch is a change to its pin (engine.lock.json, model/dependencies.toml) and to
# the audit that allows exactly one kernel line (xtask audit).
#   WORK=... bash upstream/regenerate-patch.sh     (needs $WORK/lean4 at the pinned commit)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=${WORK:?}/lean4/src
git -C "$WORK/lean4" checkout -q -- src
git -C "$WORK/lean4" apply "$here/lean-emscripten-stubs.patch"
python3 "$here/make-coop-patch.py" "$src/runtime/object.cpp"
python3 "$here/make-abi-patch.py" "$src"
git -C "$WORK/lean4" diff > "$WORK/lean-wasm-elaborator.patch"
git -C "$WORK/lean4" checkout -q -- src
if cmp -s "$WORK/lean-wasm-elaborator.patch" "$here/lean-wasm-elaborator.patch"; then echo "the patch regenerates byte for byte"
else echo "the regenerated patch differs: diff $WORK/lean-wasm-elaborator.patch $here/lean-wasm-elaborator.patch"; exit 1; fi
