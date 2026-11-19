#!/usr/bin/env bash
# The sysroot lean32 serves: $WORK/sys32/bin/lean runs lean32 (build-wasm.sh, WIDTH=32) under Node, and
# $WORK/sys32/lib/lean holds the 32-bit Init (build-init32.sh). The release's Lake builds with it when LEAN_SYSROOT
# names it and LAKE_OVERRIDE_LEAN is true.
#   WORK=... bash build/sysroot32.sh
set -euo pipefail
work=${WORK:?}
case $work in /home/*|/tmp/*) ;; *) echo "lean32 sees only /home and /tmp (util/shell.cpp); WORK is $work"; exit 1 ;; esac
[ -s "$work/lean32/lean32.cjs" ] || { echo "no lean32: run build-wasm.sh with WIDTH=32 first"; exit 1; }
mkdir -p "$work/sys32/bin" "$work/sys32/lib/lean"
# Deep elaboration recurses on the host's stack: lift the soft limit and give V8 the room.
cat > "$work/sys32/bin/lean" <<EOF
#!/usr/bin/env bash
ulimit -s unlimited 2> /dev/null || ulimit -s 1048576
exec node --stack-size=262144 "$work/lean32/lean32.cjs" "\$@"
EOF
chmod +x "$work/sys32/bin/lean"
# On failure Node first echoes lean32.cjs's one minified line, longer than a CI log line holds, so only each line's
# start and the end of the output are printed: the thrown error and its stack.
# Its output, not its exit status, says it runs: --version ends in `throw 0` (EIO UInt32, Lean/Shell.lean), which
# util/shell.cpp reads with unbox(), and a 32-bit Lean boxes a UInt32 as an object, so the status is not 0.
v=$("$work/sys32/bin/lean" --version 2> "$work/lean32-stderr.txt") || true
echo "$v"
case $v in "Lean (version 4.32.2, wasm32-unknown-emscripten"*) ;; *) cut -c1-300 "$work/lean32-stderr.txt" | tail -c 6000; exit 1 ;; esac
