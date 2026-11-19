#!/usr/bin/env bash
# The npm packages of the gate's manifest, packed as npm would publish them, each tarball held to the shard cap.
# Nothing is published here.
#   bash gate/npm-pack.sh MANIFEST_DIR OUT_DIR [make-npm-packages options]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
manifest=$1 out=$2
shift 2
rm -rf "$out" && mkdir -p "$out/tarballs"
node "$here/../scripts/make-npm-packages.mjs" "$manifest" "$out" "$@"
for d in "$out"/shards/* "$out/library"; do
  ( cd "$d" && npm pack --silent --pack-destination "$out/tarballs" > /dev/null )
done
node --input-type=module -e '
  import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"; import { join } from "node:path";
  const out = process.argv[1]; const summary = JSON.parse(readFileSync(join(out, "npm-packages.json"), "utf8"));
  const sizes = readdirSync(join(out, "tarballs")).map((f) => ({ tarball: f, bytes: statSync(join(out, "tarballs", f)).size }));
  const over = sizes.filter((s) => s.bytes > summary.cap);
  writeFileSync(join(out, "npm-sizes.json"), JSON.stringify({ cap: summary.cap, library: summary.library, tarballs: sizes }, null, 1));
  for (const s of sizes) console.log(`${s.tarball}: ${(s.bytes / 1048576).toFixed(1)} MiB`);
  if (over.length) { console.error(`over the ${summary.cap}-byte cap: ${over.map((s) => s.tarball).join(", ")}`); process.exit(1); }' "$out"
