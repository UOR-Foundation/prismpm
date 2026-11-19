#!/usr/bin/env bash
# The corpus gate: the engine equals native Lean 4.32.2 on every corpus declaration, and every planted defect is
# refused. Only then is the attestation written that names the engine, library, LexLean and corpus by BLAKE3 label.
#
#   WORK=... bash gate/run-gate.sh      (Linux x86-64, after build/build-engine.sh in the same WORK)
#
# Inputs: $WORK/dist (the engine), $WORK/driver/.lake/build/bin/elab (the same driver, native), elan's Lean 4.32.2.
# Output: $WORK/gate/{native,wasm}.jsonl, defects.json, gate.json, gate-label.txt and the manifest folder.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/.." && pwd)
: "${WORK:?}"
source "$pkg/build/env.sh"
out=$WORK/gate
rm -rf "$out" && mkdir -p "$out"
lock() { python3 -c 'import sys,json; v=json.load(open(sys.argv[1]))
for k in sys.argv[2:]: v=v[int(k)] if isinstance(v,list) else v[k]
print(v)' "$pkg/engine.lock.json" "$@"; }

# LexLean: the native release binary (sha256-pinned) renders the corpus and the runtime; its WASI build is named in
# the manifest by its BLAKE3 label.
ll=$WORK/lexlean
if [ ! -x "$ll/bin/x86_64-unknown-linux-gnu/lexlean" ]; then
  mkdir -p "$ll"
  curl -fsSL "$(lock lexlean binaries url)" -o "$ll/binaries.tar.gz"
  echo "$(lock lexlean binaries sha256)  $ll/binaries.tar.gz" | sha256sum -c -
  tar -xzf "$ll/binaries.tar.gz" -C "$ll"
fi
LEXLEAN=$ll/bin/x86_64-unknown-linux-gnu/lexlean
echo "$(lock lexlean binaries linux_x86_64_sha256)  $LEXLEAN" | sha256sum -c -
[ -s "$ll/lexlean.wasm" ] || curl -fsSL "$(lock lexlean wasi url)" | gunzip > "$ll/lexlean.wasm"
node --input-type=module -e '
  import { readFileSync } from "node:fs"; import { kappa } from "'"$pkg"'/src/vendor/blake3.mjs";
  const [f, want] = process.argv.slice(1); const got = kappa(readFileSync(f));
  if (got !== want) { console.error(`${f} is ${got}, not ${want}`); process.exit(1); }' "$ll/lexlean.wasm" "$(lock lexlean wasi kappa)"
semantics=$(lock lexlean compiler_semantics)

# LexLean's checkout at the release commit: the runtime's source and the fold-laws example.
src=$WORK/lexlean-src
if [ "$(git -C "$src" rev-parse HEAD 2>/dev/null || true)" != "$(lock lexlean commit)" ]; then
  rm -rf "$src" && git init -q "$src"
  git -C "$src" fetch -q --depth 1 https://github.com/UOR-Foundation/LexLean "$(lock lexlean commit)"
  git -C "$src" checkout -q FETCH_HEAD
fi

# Render one project with the native compiler; prints the build folder. Checks the language-1.2 semantics.
render() {
  ( cd "$1" && "$LEXLEAN" lock > /dev/null && "$LEXLEAN" build --diagnostic-format json > "$out/build-result.json" )
  local build
  build=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).artifacts[0])' "$out/build-result.json")
  node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (m.compiler.semantics_id !== process.argv[2]) { console.error(`compiler semantics ${m.compiler.semantics_id}, not ${process.argv[2]}`); process.exit(1); }' \
    "$1/$build/manifest.json" "$semantics"
  echo "$1/$build"
}

# The runtime, rendered from LexLean's own source and compiled by native Lean 4.32.2.
rt_src=$WORK/runtime-copy
rm -rf "$rt_src" && mkdir -p "$rt_src"
git -C "$src" archive HEAD language/runtime-1.2/library | tar -x -C "$rt_src"
rt_build=$(render "$rt_src/language/runtime-1.2/library")
consumer=$WORK/runtime-consumer
rm -rf "$consumer" && mkdir -p "$consumer"
echo "leanprover/lean4:v4.32.2" > "$consumer/lean-toolchain"
roots=$(cd "$rt_build/modules" && find . -name '*.lean' | sed 's|^\./||; s|\.lean$||; s|/|.|g' | sort | sed 's/.*/"&"/' | paste -sd, -)
printf 'name = "consumer"\ndefaultTargets = ["Runtime"]\n\n[[lean_lib]]\nname = "Runtime"\nroots = [%s]\nsrcDir = "%s"\n' "$roots" "$rt_build/modules" > "$consumer/lakefile.toml"
( cd "$consumer" && "$LEAN_BIN/lake" build )
rt=$consumer/.lake/build/lib/lean
export LEAN_SYSROOT LEAN_PATH
LEAN_SYSROOT=$("$LEAN_BIN/lean" --print-prefix)
LEAN_PATH=$rt

# The manifest and its blobs, as soon as the engine and the library exist, so a browser trial has them even
# if a later step fails.
node "$pkg/scripts/make-manifest.mjs" --sysroot "$LEAN_SYSROOT" --runtime "$rt" --engine "$WORK/dist" \
  --lexlean "$ll/lexlean.wasm" --semantics "$semantics" --out "$out/manifest"

# The same blobs as npm packages, packed and held to the shard cap, never published here.

# The corpus: each project rendered natively, its modules in elaboration order.
corpus_dirs=()
n=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["corpus"]))' "$pkg/engine.lock.json")
for i in $(seq 0 $((n - 1))); do
  name=$(lock corpus "$i" name)
  dest=$WORK/corpus/$name
  rm -rf "$dest" && mkdir -p "$dest"
  if python3 -c 'import json,sys; sys.exit(0 if "lean_module" in json.load(open(sys.argv[1]))["corpus"][int(sys.argv[2])] else 1)' "$pkg/engine.lock.json" "$i"; then
    # A Lean module, not a LexLean project: fetched and admitted by its BLAKE3 label.
    module=$(lock corpus "$i" lean_module)
    file=$dest/$(echo "$module" | tr . /).lean
    mkdir -p "$(dirname "$file")"
    curl -fsSL "https://raw.githubusercontent.com/$(lock corpus "$i" repository)/$(lock corpus "$i" commit)/$(lock corpus "$i" file)" -o "$file"
    node --input-type=module -e '
      import { readFileSync } from "node:fs"; import { kappa } from "'"$pkg"'/src/vendor/blake3.mjs";
      const [f, want] = process.argv.slice(1); const got = kappa(readFileSync(f));
      if (got !== want) { console.error(`${f} is ${got}, not ${want}`); process.exit(1); }' "$file" "$(lock corpus "$i" kappa)"
    corpus_dirs+=("$dest")
    continue
  elif python3 -c 'import json,sys; sys.exit(0 if "repository" in json.load(open(sys.argv[1]))["corpus"][int(sys.argv[2])] else 1)' "$pkg/engine.lock.json" "$i"; then
    git -C "$src" archive HEAD "$(lock corpus "$i" path)" | tar -x -C "$dest" --strip-components=$(lock corpus "$i" path | awk -F/ '{print NF}')
  else
    cp -r "$pkg/$(lock corpus "$i" path)/." "$dest/"
    rm -rf "$dest/.lexlean" "$dest/.lake"
    if python3 -c 'import json,sys; sys.exit(0 if "relock" in json.load(open(sys.argv[1]))["corpus"][int(sys.argv[2])] else 1)' "$pkg/engine.lock.json" "$i"; then
      toolchain=$(lock corpus "$i" relock)
      sed -i "s|^lean_toolchain = .*|lean_toolchain = \"$toolchain\"|" "$dest/lexlean.toml"
      echo "$toolchain" > "$dest/lean-toolchain"
      rm -f "$dest/lexlean.lock"
    fi
  fi
  corpus_dirs+=("$(render "$dest")/modules")
done
node "$here/order.mjs" "${corpus_dirs[@]}" > "$out/corpus.txt"
echo "corpus: $(wc -l < "$out/corpus.txt") modules"

# Native: the driver built from the same pinned source, in resident mode, the way the engine serves.
ELAB=$WORK/driver/.lake/build/bin/elab
mapfile -t specs < "$out/corpus.txt"
# Timed by GNU time: wall seconds and peak resident kilobytes.
/usr/bin/time -f '%e %M' -o "$out/time-native.txt" "$ELAB" --resident "$out/native-out" "${specs[@]}" > "$out/native.jsonl"

# The browser corpus: each module's rendered Lean as <Module>.lean, their order, and native Lean's answers.
mkdir -p "$out/browser-corpus"
for spec in "${specs[@]}"; do cp "${spec#*=}" "$out/browser-corpus/${spec%%=*}.lean"; done
node -e 'console.log(JSON.stringify(require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((l) => l.slice(0, l.indexOf("=")))))' "$out/corpus.txt" > "$out/browser-corpus/modules.json"
cp "$out/native.jsonl" "$out/browser-corpus/native.jsonl"

# The engine on the same modules in the same order.
# The official release's Init files by label, as elan installed them from the release, for the library check.
node --input-type=module -e '
  import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"; import { join, relative } from "node:path";
  import { kappa } from "'"$pkg"'/src/vendor/blake3.mjs";
  const [root, out] = process.argv.slice(1); const lib = join(root, "lib", "lean"); const listing = {};
  for (const f of readdirSync(lib, { recursive: true }).map(String)) {
    const p = join(lib, f); const rel = relative(root, p).replaceAll("\\", "/");
    if (/^lib\/lean\/Init(\.|\/)/.test(rel) && statSync(p).isFile()) listing[rel] = kappa(readFileSync(p));
  }
  writeFileSync(out, JSON.stringify(listing));' "$LEAN_SYSROOT" "$out/official-init.json"
# Cold: an empty module store, every module elaborated. Warm: the store the cold run filled, every module checked
# again by the kernel instead of elaborated. Both must agree with native Lean.
rm -rf "$out/store"
node "$here/run-wasm.mjs" "$out/manifest" --store "$out/store" --timings "$out/timing-wasm-cold.json" "${specs[@]}" > "$out/wasm.jsonl"
node "$here/run-wasm.mjs" "$out/manifest" --store "$out/store" --timings "$out/timing-wasm-warm.json" "${specs[@]}" > "$out/wasm-warm.jsonl"
node "$here/agree.mjs" "$out/native.jsonl" "$out/wasm-warm.jsonl" | tee "$out/agree-warm.txt"

node "$here/agree.mjs" "$out/native.jsonl" "$out/wasm.jsonl" | tee "$out/agree.txt"
node "$here/defects.mjs" --manifest "$out/manifest" --native "$out/native.jsonl" --wasm "$out/wasm.jsonl" \
  --elab "$ELAB" --official "$out/official-init.json" --module "$(grep -m1 '^Leap.' "$out/corpus.txt")" --work "$out/defect" --out "$out/defects.json"
node "$here/attest.mjs" --manifest "$out/manifest" --native "$out/native.jsonl" --wasm "$out/wasm.jsonl" \
  --corpus "$out/corpus.txt" --lexlean-sha256 "$(lock lexlean binaries linux_x86_64_sha256)" \
  --defects "$out/defects.json" --out "$out/gate.json" | tee "$out/gate-label.txt"
node "$here/speed.mjs" "$out/speed.json" native="$out/time-native.txt" wasm-cold="$out/timing-wasm-cold.json" wasm-warm="$out/timing-wasm-warm.json"

# The same blobs as npm packages, with the gate attestation and the official Init listing in the library package,
# packed and held to the shard cap. Nothing is published here.
bash "$here/npm-pack.sh" "$out/manifest" "$out/npm" --gate "$out/gate.json" --official "$out/official-init.json"
