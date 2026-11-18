#!/usr/bin/env bash
# Lean 4.32.2's elaborator, kernel and IR interpreter as single-threaded 64-bit WebAssembly, with the prover's driver.
# What is linked: runtime, util, kernel, library, initialize (Lean's own C++ at the pinned commit, with the pinned
# patch), the C of Init, Std and Lean (gen-c.sh, linked from an archive so only the driver's import closure stays),
# the driver's C, GMP, libuv. Differences from upstream's Emscripten settings (src/CMakeLists.txt):
#   MEMORY64, so the release's .olean files load unchanged; no -pthread; LEAN_MULTI_THREAD kept for the task manager,
#   with LEAN_COOP_TASKS (upstream/make-coop-patch.py) so it never starts a thread; no mimalloc, Lean's own allocator.
# One module serves Node and the browser: an ES module factory with Emscripten's in-memory file system, which the
# host fills with label-checked bytes (src/engine-worker.mjs, web/elab-worker.mjs).
#   WORK=... bash build/build-wasm.sh       (after fetch-tools.sh, gen-c.sh, build-driver.sh, build-deps.sh)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
work=${WORK:?}
src=$work/lean4/src
obj=$work/obj
dist=$work/dist
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

mkdir -p "$obj/c" "$obj/cpp" "$dist" "$work/gen-include/lean"
cat > "$work/gen-include/lean/config.h" <<'EOF'
#pragma once
#include <lean/version.h>
#define LEAN_SMALL_ALLOCATOR
#define LEAN_IS_STAGE0 0
EOF
cat > "$work/gen-include/lean/version.h" <<'EOF'
#pragma once
#define LEAN_VERSION_MAJOR 4
#define LEAN_VERSION_MINOR 32
#define LEAN_VERSION_PATCH 2
#define LEAN_VERSION_IS_RELEASE 1
#define LEAN_SPECIAL_VERSION_DESC ""
#define LEAN_VERSION_STRING "4.32.2"
#define LEAN_PLATFORM_TARGET "wasm64-unknown-emscripten"
#define LEAN_MANUAL_ROOT "https://lean-lang.org/doc/reference/4.32.2/"
EOF
echo "#define LEAN_GITHASH \"$(git -C "$work/lean4" rev-parse HEAD)\"" > "$work/gen-include/githash.h"

common="$opt -sMEMORY64=1 -DNDEBUG -DLEAN_EMSCRIPTEN -DLEAN_MULTI_THREAD -DLEAN_COOP_TASKS -DLEAN_USE_GMP -DLEAN_EXPORTING -fwasm-exceptions -ffp-contract=off -I$work/gen-include -I$src/include -I$src -I$work/deps/gmp/include -I$work/deps/libuv/include"
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
em++ $opt -sMEMORY64=1 -fwasm-exceptions "$obj/Elab.o" "$obj/symtab.o" "$obj/wasm-entry.o" "$obj"/cpp/*.o "$obj/libmods.a"   "$work/deps/gmp/lib/libgmp.a" "$work/deps/libuv/build/libuv.a" -o "$dist/lean-elab.mjs"   -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=8589934592 -sSTACK_SIZE=67108864   -sEXPORTED_FUNCTIONS=_main,_malloc,_free,_elab_ready,_elab_request -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker   -sMODULARIZE=1 -sEXPORT_ES6=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=FS,ENV,ccall ${LINK_EXTRA:-}
ls -l "$dist"
gzip -9 -c "$dist/lean-elab.wasm" | wc -c
