#!/usr/bin/env bash
# GMP and libuv as 64-bit WebAssembly (MEMORY64). 64-bit because an .olean is a compacted heap image with 64-bit
# pointers and Lean's release reads it in place; GMP because the release stores big numbers in GMP's layout. Each is
# built from its upstream release, checked by hash, with generic C (no assembly) and no threads.
# WIDTH=32: libuv alone as 32-bit WebAssembly. The 32-bit engine reads only the Init it compiled itself, so it
# keeps Lean's own big-number code, as upstream's 32-bit WebAssembly build does.
#   [WIDTH=32] bash build-deps.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${WORK:?}
# shellcheck disable=SC1091
source "$here/env.sh"
mkdir -p "$work/deps" && cd "$work/deps"
width=${WIDTH:-64}
flags="-O2 -sMEMORY64=1 -fwasm-exceptions" uvbuild=build
[ "$width" = 64 ] || flags="-O2 -fwasm-exceptions" uvbuild=build32

# GMP 6.3.0, the GNU release tarball.
gmp_sha=a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898
if [ "$width" = 64 ] && [ ! -f gmp/lib/libgmp.a ]; then
  [ -f gmp-6.3.0.tar.xz ] || curl -fsSLO https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz
  echo "$gmp_sha  gmp-6.3.0.tar.xz" | sha256sum -c -
  rm -rf gmp-6.3.0 && tar xf gmp-6.3.0.tar.xz && cd gmp-6.3.0
  emconfigure ./configure --host=none --build="$(./config.guess)" --disable-assembly --enable-static --disable-shared \
    --prefix="$work/deps/gmp" CFLAGS="$flags" CC_FOR_BUILD=gcc > configure.log 2>&1 || { tail -30 configure.log; exit 1; }
  grep -E '^#define GMP_LIMB_BITS|^#define _LONG_LONG_LIMB' gmp.h
  emmake make -j"${JOBS:-6}" > make.log 2>&1 || { tail -30 make.log; exit 1; }
  emmake make install > /dev/null
  cd ..
fi
[ "$width" = 32 ] || grep -E 'GMP_LIMB_BITS' gmp/include/gmp.h | head -2

# libuv v1.48.0 at its pinned commit, with Lean's one CMake change, at the build's width.
if [ ! -f "libuv/$uvbuild/libuv.a" ]; then
  [ -d libuv ] || git clone -q --depth 1 --branch v1.48.0 https://github.com/libuv/libuv
  cd libuv && git reset -q --hard HEAD
  [ "$(git rev-parse HEAD)" = e9f29cb984231524e3931aa0ae2c5dae1a32884e ] || { echo "libuv is not at its pinned commit"; exit 1; }
  python3 - <<'EOF'
import pathlib
p = pathlib.Path("CMakeLists.txt")
t = p.read_text()
anchor = 'if(CMAKE_SYSTEM_NAME STREQUAL "Linux")\n  list(APPEND uv_defines _GNU_SOURCE _POSIX_C_SOURCE=200112)'
assert t.count(anchor) == 1
p.write_text(t.replace(anchor, 'if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")\n  list(APPEND uv_sources\n       src/unix/no-proctitle.c)\nendif()\n\n' + anchor))
EOF
  emcmake cmake -B "$uvbuild" -DCMAKE_BUILD_TYPE=Release -DLIBUV_BUILD_TESTS=OFF -DLIBUV_BUILD_SHARED=OFF \
    -DCMAKE_POSITION_INDEPENDENT_CODE=OFF "-DCMAKE_C_FLAGS=$flags" > build.log 2>&1
  emmake make -C "$uvbuild" -j"${JOBS:-6}" uv_a >> build.log 2>&1 || { tail -30 build.log; exit 1; }
  cd ..
fi
ls -l "libuv/$uvbuild/libuv.a"; [ "$width" = 32 ] || ls -l gmp/lib/libgmp.a
