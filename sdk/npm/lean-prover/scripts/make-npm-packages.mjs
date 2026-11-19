// The npm packages of a manifest folder (scripts/make-manifest.mjs): shard packages named by the BLAKE3 label of
// their content, and the library package named by the label of the manifest it carries (src/npm.mjs). Writes
// package folders only; publishing is a separate, approved step.
// The library package also carries the gate's attestation (gate.json) and the official Init listing
// (official-init.json) when given, so a host needs only the manifest's pinned label to open the prover.
//   node scripts/make-npm-packages.mjs MANIFEST_DIR OUT_DIR [--cap BYTES] [--gate FILE] [--official FILE]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { blake3Label } from "../src/blob.mjs";
import { checkManifest } from "../src/prover.mjs";
import { libraryName, npmSection, PACKAGE_VERSION, planShards, SHARD_CAP_BYTES } from "../src/npm.mjs";

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const capArg = option("--cap"), gateFile = option("--gate"), officialFile = option("--official");
const cap = capArg ? Number(capArg) : SHARD_CAP_BYTES;
const [dir, out] = args;
const manifest = checkManifest(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
const plan = planShards(manifest, cap);
const common = { version: PACKAGE_VERSION, license: "MIT", repository: { type: "git", url: "https://github.com/UOR-Foundation/PrismPM", directory: "sdk/npm/lean-prover" } };

for (const shard of plan) {
  const folder = join(out, "shards", shard.label.slice(7));
  mkdirSync(join(folder, "b"), { recursive: true });
  for (const e of shard.blobs) {
    const bytes = gunzipSync(readFileSync(join(dir, "blobs", e.kappa.slice(7))));
    if (blake3Label(bytes) !== e.kappa) throw new Error(`blob ${e.kappa} does not have its label`);
    writeFileSync(join(folder, "b", e.kappa.slice(7)), bytes);
  }
  writeFileSync(join(folder, "package.json"), JSON.stringify({
    name: shard.name, ...common,
    description: `Blobs of the WASM Lean prover, each named by the BLAKE3 label of its bytes; this package is named by the label of its listing.`,
    files: ["b"],
  }, null, 2) + "\n");
}

// The carried manifest names its gate by the label of the attestation's bytes, as src/gate.mjs checks it.
const carried = { ...manifest, ...(gateFile ? { gate: blake3Label(readFileSync(gateFile)) } : {}), npm: npmSection(plan) };
const bytes = new TextEncoder().encode(JSON.stringify(carried));
const label = blake3Label(bytes);
const library = join(out, "library");
mkdirSync(library, { recursive: true });
writeFileSync(join(library, "manifest.json"), bytes);
if (gateFile) copyFileSync(gateFile, join(library, "gate.json"));
if (officialFile) copyFileSync(officialFile, join(library, "official-init.json"));
writeFileSync(join(library, "package.json"), JSON.stringify({
  name: libraryName(label), ...common,
  description: "The manifest of the WASM Lean prover, named by its BLAKE3 label, and every shard it names at exactly one version.",
  files: ["manifest.json", ...(gateFile ? ["gate.json"] : []), ...(officialFile ? ["official-init.json"] : [])],
  dependencies: Object.fromEntries(plan.map((s) => [s.name, PACKAGE_VERSION])),
}, null, 2) + "\n");
writeFileSync(join(out, "npm-packages.json"), JSON.stringify({
  manifest: label, library: libraryName(label), cap,
  shards: plan.map((s) => ({ name: s.name, blobs: s.blobs.length, bytes: s.blobs.reduce((a, b) => a + b.bytes, 0), gzipEstimate: s.blobs.reduce((a, b) => a + b.encodedBytes, 0) })),
}, null, 1));
console.log(`${plan.length} shards under ${Math.round(cap / 1048576)} MiB each; library ${libraryName(label)}`);
