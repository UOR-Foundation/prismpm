# Sourced by the build steps: the pinned Emscripten and Lean, from fetch-tools.sh.
export EM_CONFIG="$WORK/emsdk/.emscripten"
export PATH="$WORK/emsdk/install/emscripten:$WORK/emsdk/install/bin:$HOME/.elan/bin:$PATH"
LEAN_BIN="$HOME/.elan/toolchains/leanprover--lean4---v4.32.2/bin"
export LEAN_BIN
