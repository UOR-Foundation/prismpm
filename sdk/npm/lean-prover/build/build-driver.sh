#!/usr/bin/env bash
# The driver natively, with Lake at Lean 4.32.2: its C (linked into the engine) and `symlist`, which prints every
# extern of Init, Std and Lean for the symbol table. The Lake files are written here, in the work folder; the
# admitted driver directory holds only its two pinned files.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
: "${WORK:?}"
source "$here/env.sh"
cd "$WORK/driver"
echo "leanprover/lean4:v4.32.2" > lean-toolchain
cat > lakefile.toml <<'LAKE'
name = "elab"
defaultTargets = ["elab", "symlist"]

[[lean_exe]]
name = "elab"
root = "Elab"
supportInterpreter = true

[[lean_exe]]
name = "symlist"
root = "SymList"
supportInterpreter = true
LAKE
[ -x .lake/build/bin/elab ] || "$LEAN_BIN/lake" build
LEAN_SYSROOT=$("$LEAN_BIN/lean" --print-prefix) .lake/build/bin/symlist | sort -u > "$WORK/externs.txt"
wc -l < "$WORK/externs.txt"
