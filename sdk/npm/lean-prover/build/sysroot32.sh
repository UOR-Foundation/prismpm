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
"$work/sys32/bin/lean" --version
