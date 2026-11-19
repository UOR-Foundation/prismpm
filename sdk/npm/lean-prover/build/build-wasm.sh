#!/usr/bin/env bash
# Lean 4.32.2's elaborator, kernel and IR interpreter as single-threaded 64-bit WebAssembly, with the prover's driver.
# What is linked: runtime, util, kernel, library, initialize (Lean's own C++ at the pinned commit, with the pinned
# patch), the C of Init, Std and Lean (gen-c.sh, linked from an archive so only the driver's import closure stays),
# the driver's C, GMP, libuv. Differences from upstream's Emscripten settings (src/CMakeLists.txt):
#   MEMORY64, so the release's .olean files load unchanged; no -pthread; LEAN_MULTI_THREAD kept for the task manager,
#   with LEAN_COOP_TASKS (upstream/make-coop-patch.py) so it never starts a thread; no mimalloc, Lean's own allocator.
# One module serves Node and the browser: an ES module factory with Emscripten's in-memory file system, which the
# host fills with label-checked bytes (src/engine-worker.mjs, web/elab-worker.mjs).
# WIDTH=32: the same objects as 32-bit WebAssembly, for browsers without 64-bit memory (Safari before 27.3, every
# iOS browser): no MEMORY64, no GMP (Lean's own big numbers, as upstream's 32-bit build), a 4 GB maximum. It also
# links `lean32`, Lean's own command line for Node (util/shell.cpp), which compiles the Init this engine reads
# (build-init32.sh): a 32-bit Lean cannot read the release's 64-bit .olean files.
#   WORK=... [WIDTH=32] bash build/build-wasm.sh   (after fetch-tools.sh, gen-c.sh, build-driver.sh, build-deps.sh)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
work=${WORK:?}
src=$work/lean4/src
width=${WIDTH:-64}
case $width in
  64) obj=$work/obj dist=$work/dist inc=$work/gen-include mem="-sMEMORY64=1" gmp="-DLEAN_USE_GMP" target=wasm64
      gmplib=$work/deps/gmp/lib/libgmp.a uvlib=$work/deps/libuv/build/libuv.a maxmem=8589934592 ;;
  32) obj=$work/obj32 dist=$work/dist32 inc=$work/gen-include32 mem="" gmp="" target=wasm32
      gmplib="" uvlib=$work/deps/libuv/build32/libuv.a maxmem=4294967296 ;;
  *) echo "WIDTH is 64 or 32"; exit 1 ;;
esac
opt=${OPT:--O2}
# shellcheck disable=SC1091
source "$here/env.sh"
emcc --version | head -1

# The pinned source with the pinned patch, admitted by its BLAKE3 label. The patch is never regenerated here
# (upstream/regenerate-patch.sh does that, for review).
node "$here/check-pins.mjs" patch
git -C "$work/lean4" checkout -q -- src
git -C "$work/lean4" apply "$pkg/upstream/lean-wasm-elaborator.patch"
git -C "$work/lean4" diff --stat | tail -1

mkdir -p "$obj/c" "$obj/cpp" "$dist" "$inc/lean"
cat > "$inc/lean/config.h" <<'EOF'
#pragma once
#include <lean/version.h>
#define LEAN_SMALL_ALLOCATOR
#define LEAN_IS_STAGE0 0
EOF
cat > "$inc/lean/version.h" <<EOF
#pragma once
#define LEAN_VERSION_MAJOR 4
#define LEAN_VERSION_MINOR 32
#define LEAN_VERSION_PATCH 2
#define LEAN_VERSION_IS_RELEASE 1
#define LEAN_SPECIAL_VERSION_DESC ""
#define LEAN_VERSION_STRING "4.32.2"
#define LEAN_PLATFORM_TARGET "$target-unknown-emscripten"
#define LEAN_MANUAL_ROOT "https://lean-lang.org/doc/reference/4.32.2/"
EOF
echo "#define LEAN_GITHASH \"$(git -C "$work/lean4" rev-parse HEAD)\"" > "$inc/githash.h"

common="$opt $mem -DNDEBUG -DLEAN_EMSCRIPTEN -DLEAN_MULTI_THREAD -DLEAN_COOP_TASKS $gmp -DLEAN_EXPORTING -fwasm-exceptions -ffp-contract=off -I$inc -I$src/include -I$src -I$work/deps/gmp/include -I$work/deps/libuv/include"
export common obj

cc_one() { f=$1; o=$obj/c/$(basename "$f" .c).o; [ "$o" -nt "$f" ] || emcc -c $common -Wno-everything "$f" -o "$o"; }
cxx_one() { f=$1; o=$obj/cpp/$(echo "$f" | sed "s|$2/||; s|/|_|g; s|\.cpp$|.o|"); [ "$o" -nt "$f" ] || em++ -c -std=c++20 $common -DLEAN_BUILD_TYPE=\"Release\" -Wno-everything "$f" -o "$o"; }
export -f cc_one cxx_one

ls "$work"/c/*.c | xargs -P "${JOBS:-6}" -I{} bash -c 'cc_one "$@"' _ {}
rm -f "$obj/libmods.a"; ls "$obj"/c/*.o | xargs emar rcs "$obj/libmods.a"
{ ls "$src"/runtime/*.cpp "$src"/runtime/uv/*.cpp "$src"/kernel/*.cpp "$src"/library/*.cpp "$src"/library/constructions/*.cpp "$src"/initialize/*.cpp
  ls "$src"/util/*.cpp | grep -v -E '/shell\.cpp$'; } | xargs -P "${JOBS:-6}" -I{} bash -c 'cxx_one "$@"' _ {} "$src"
emcc -c $common -Wno-everything "$work/driver/.lake/build/ir/Elab.c" -o "$obj/Elab.o"
emcc -c $common -Wno-everything "$here/wasm-entry.c" -o "$obj/wasm-entry.o"
# dlsym's stand-in: every module initializer the archive defines (gen-symtab.py).
emnm --defined-only -g "$obj/libmods.a" 2> /dev/null | awk '$2=="T"{print $3}' > "$obj/defsyms.txt"
python3 "$here/gen-symtab.py" "$obj/defsyms.txt" "$work/c" "$work/externs.txt" /dev/null "$obj/symtab.c"
emcc -c $common -Wno-everything "$obj/symtab.c" -o "$obj/symtab.o"

# The engine keeps one Lean for the life of the prover: wasm-entry.c initializes it once and serves requests.
mkdir -p "$dist"
em++ $opt $mem -fwasm-exceptions "$obj/Elab.o" "$obj/symtab.o" "$obj/wasm-entry.o" "$obj"/cpp/*.o "$obj/libmods.a"   $gmplib "$uvlib" -o "$dist/lean-elab.mjs"   -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=$maxmem -sSTACK_SIZE=67108864   -sEXPORTED_FUNCTIONS=_main,_malloc,_free,_elab_ready,_elab_request -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker   -sMODULARIZE=1 -sEXPORT_ES6=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=FS,ENV,ccall ${LINK_EXTRA:-}
ls -l "$dist"
gzip -9 -c "$dist/lean-elab.wasm" | wc -c

# lean32: Lean's command line under Node, from the same objects, for compiling the 32-bit Init (build-init32.sh).
# Lean mounts /home and /tmp from the host when it runs as WebAssembly (util/shell.cpp), so its work stays there.
if [ "$width" = 32 ]; then
  echo 'extern int lean_main(int, char **); int main(int argc, char **argv) { return lean_main(argc, argv); }' > "$obj/lean-main.c"
  emcc -c $common -Wno-everything "$obj/lean-main.c" -o "$obj/lean-main.o"
  [ "$obj/shell.o" -nt "$src/util/shell.cpp" ] || em++ -c -std=c++20 $common -DLEAN_BUILD_TYPE=\"Release\" -Wno-everything "$src/util/shell.cpp" -o "$obj/shell.o"
  mkdir -p "$work/lean32"
  em++ $opt -fwasm-exceptions "$obj/lean-main.o" "$obj/shell.o" "$obj/symtab.o" "$obj"/cpp/*.o "$obj/libmods.a" "$uvlib" -o "$work/lean32/lean32.cjs" \
    -lnodefs.js -sENVIRONMENT=node -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=$maxmem -sSTACK_SIZE=67108864 -sFORCE_FILESYSTEM=1
  ls -l "$work/lean32"
fi
