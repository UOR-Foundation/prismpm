#!/bin/bash
# Builds base.ndjson.gz: the only Lean library the browser prover loads. It holds the lemma library the proof finder
# cites (LexReflect, from LexLean's reflect-library) and the Init and LexLeanRuntime constants the lowering writes by
# name, with everything they depend on, exported by lean4export. No app declaration: those come from the lowering.
#
#   RUNTIME=dir-with-LexLeanRuntime-oleans REFLECT=dir-with-LexReflect-olean LEAN4EXPORT=path/to/lean4export \
#     bash library/base.sh
# Needs Lean 4.32.2 (elan toolchain leanprover/lean4:v4.32.2).
set -euo pipefail
export ELAN_TOOLCHAIN=leanprover/lean4:v4.32.2
: "${RUNTIME:?}" "${REFLECT:?}" "${LEAN4EXPORT:?}" "${LEXLEAN_ROOTS:?}"
here=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export LEAN_PATH="$RUNTIME:$REFLECT"
cat > "$W/Names.lean" <<EOF
import Lean
import LexReflect
open Lean in
#eval show MetaM Unit from do
  let env ← getEnv
  let some idx := env.getModuleIdx? \`LexReflect | throwError "no module"
  let mut out := ""
  for (n, _) in env.constants.toList do
    if env.getModuleIdxFor? n == some idx && !n.isInternal then out := out ++ toString n ++ "\n"
  IO.FS.writeFile "$W/names.txt" out
EOF
lean "$W/Names.lean"
ROOTS=$(grep -v "[^A-Za-z0-9_.']" "$W/names.txt" | tr '\n' ' ')
# What src/lower.mjs and src/emit.mjs write by name.
INIT="Prod.mk Prod.fst Prod.snd List List.cons List.nil List.foldl List.append List.length List.rec List.toArray
Option Option.some Option.none Option.rec String Int Int.ofNat Int.negSucc Int.tdiv Int.tmod
Nat Nat.div Nat.mod Nat.add Nat.succ Nat.blt Nat.ble Nat.beq Nat.rec Eq Eq.refl Iff Iff.refl Eq.symm Eq.mpr congrArg
Bool Bool.true Bool.false Bool.and Bool.or Bool.not Bool.rec Bool.or_eq_false_iff And And.intro Or Or.elim
LE.le LT.lt Int.instLEInt Int.instLTInt instLTNat instLENat HAdd.hAdd instHAdd Int.instAdd instAddNat
HSub.hSub instHSub Int.instSub HMul.hMul instHMul Int.instMul OfNat.ofNat instOfNat instOfNatNat UInt8.toNat Int8.toInt
ite instDecidableEqBool instSubNat instMulNat instBEqOfDecidableEq instDecidableEqString
instDecidableEqUInt8 instDecidableEqUInt32 instDecidableEqUInt64 ByteArray ByteArray.mk UInt8 UInt32 UInt64
UInt8.ofNat UInt8.instOfNat UInt32.instOfNat UInt64.instOfNat Ordering
LexLeanRuntime.multiply LexLeanRuntime.subtract LexLeanRuntime.quotient LexLeanRuntime.remainder LexLeanRuntime.equal
LexLeanRuntime.length LexLeanRuntime.index LexLeanRuntime.instQuotientNat LexLeanRuntime.instLengthableByteArray
LexLeanRuntime.instIndexableByteArrayUInt8"
LEXLEAN=$(grep -v '^$' "$LEXLEAN_ROOTS" | tr '\n' ' ')
MODULES=$(cd "$RUNTIME" && find LexLeanRuntime -name '*.olean' | sed 's/\.olean$//; s#/#.#g' | sort | tr '\n' ' ')
ALL=$(printf '%s\n' $ROOTS $INIT $LEXLEAN | sort -u | tr '\n' ' ')
"$LEAN4EXPORT" LexReflect $MODULES -- $ALL > "$W/base.ndjson"
gzip -9 -n -c "$W/base.ndjson" > "$here/base.ndjson.gz"
echo "base library: $(wc -c < "$W/base.ndjson") bytes, $(wc -c < "$here/base.ndjson.gz") compressed"
