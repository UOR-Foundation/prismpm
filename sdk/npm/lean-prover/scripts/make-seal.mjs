// The seal (`lean-prover-seal/1`): one file that names every byte the browser prover runs or reads, by BLAKE3 label,
// plus SHA-256 for the BLAKE3 hasher itself. Its own BLAKE3 label is the seal a caller pins (sealed.html?seal=...).
//
//   node scripts/make-seal.mjs --manifest LIBDIR [--lexlean FILE --lexlean-url URL] [--runtime FILE --runtime-url URL]
//        [--semantics ID] [--out web/seal.json]
// URLs are as the page sees them (web/serve.mjs serves LIBDIR at /lib/). Without --lexlean, the manifest's LexLean.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { kappa } from "../src/vendor/blake3.mjs";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith("--") ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
if (!a.manifest) throw new Error("--manifest is required");
const sha = (b) => "sha256:" + createHash("sha256").update(b).digest("hex");
const at = (path) => readFileSync(join(pkg, path));

// Package path -> URL under web/serve.mjs.
const CODE = { "web/sealed-app.mjs": "/sealed-app.mjs", "web/sealed-worker.mjs": "/sealed-worker.mjs", "web/stack-probe.mjs": "/stack-probe.mjs", "src/verdict.mjs": "/src/verdict.mjs", "src/axioms.mjs": "/src/axioms.mjs", "src/wasi.mjs": "/src/wasi.mjs" };
const BOOT = { "hologram/hologram_store.js": "/hologram/hologram_store.js", "hologram/hologram_store_bg.wasm": "/hologram/hologram_store_bg.wasm" };

const manifestBytes = readFileSync(join(a.manifest, "manifest.json"));
const manifest = JSON.parse(manifestBytes);
const lexlean = a.lexlean ? { kappa: kappa(readFileSync(a.lexlean)), url: a["lexlean-url"] } : { kappa: manifest.lexlean.wasm.kappa, url: `/lib/blobs/${manifest.lexlean.wasm.kappa.slice(7)}`, encoding: "gzip" };
const seal = {
  schema: "lean-prover-seal/1",
  lean: manifest.lean,
  entry: "web/sealed-app.mjs",
  bootstrap: Object.fromEntries(Object.entries(BOOT).map(([p, url]) => [p, { url, sha256: sha(at(join("web", p))) }])),
  code: Object.fromEntries(Object.entries(CODE).map(([p, url]) => [p, { url, kappa: kappa(at(p)) }])),
  manifest: { url: "/lib/manifest.json", kappa: kappa(manifestBytes) },
  lexlean,
  runtime: a.runtime ? { url: a["runtime-url"], kappa: kappa(readFileSync(a.runtime)) } : null,
  semantics: a.semantics ?? manifest.lexlean.semantics_id,
};
const bytes = Buffer.from(JSON.stringify(seal, null, 1) + "\n");
writeFileSync(a.out ?? join(pkg, "web", "seal.json"), bytes);
console.log(`seal ${kappa(bytes)}`);
