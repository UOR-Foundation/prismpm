#!/usr/bin/env bash
# The 32-bit Init: Lean 4.32.2's own Init, compiled from the pinned source by lean32 (build-wasm.sh, WIDTH=32), the
# same objects as the 32-bit engine, so its .olean files have exactly the layout that engine reads in place.
#
# Why: an .olean is a compacted heap image with the writer's pointer width. The release ships 64-bit ones, which a
# 32-bit engine cannot read, so the 32-bit build compiles its own, as upstream's 32-bit WebAssembly build did (a
# Lean of the target's width compiles the library). How: the release's Lake drives the build, with lean32 as its
# Lean (LEAN_SYSROOT names a sysroot whose bin/lean runs lean32 under Node), and Init's modules in Lean's own order
# and options (src/lakefile.toml.in: bootstrap, no extra options on Linux). What: $WORK/sys32/lib/lean/Init*, which
# the corpus gate admits only after every Init declaration equals the release's (gate/run-gate32.sh).
#   WORK=... bash build/build-init32.sh      (after build-wasm.sh with WIDTH=32)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${WORK:?}
# shellcheck disable=SC1091
source "$here/env.sh"
bash "$here/sysroot32.sh"
sys=$work/sys32
[ "$("$sys/bin/lean" --githash)" = "$(git -C "$work/lean4" rev-parse HEAD)" ] || { echo "lean32 is not the pinned commit"; exit 1; }

git -C "$work/lean4" checkout -q -- src
proj=$work/init32
mkdir -p "$proj"
cat > "$proj/lakefile.toml" <<EOF
name = "lean4"
bootstrap = true
srcDir = "$work/lean4/src"
irDir = "lib/temp"
leanLibDir = "lib/lean"

[[lean_lib]]
name = "Init"
EOF
echo "leanprover/lean4:v4.32.2" > "$proj/lean-toolchain"
start=$(date +%s)
( cd "$proj" && LEAN_SYSROOT=$sys LAKE_OVERRIDE_LEAN=true "$LEAN_BIN/lake" build Init )
echo "seconds $(( $(date +%s) - start ))"
out=$proj/.lake/build/lib/lean
( cd "$out" && find . -name 'Init*' -type f \( -name '*.olean' -o -name '*.olean.server' -o -name '*.olean.private' -o -name '*.ir' -o -name '*.ilean' \) -exec cp --parents {} "$sys/lib/lean/" \; )
find "$sys/lib/lean" -name '*.olean' | wc -l
du -sh "$sys/lib/lean"
