// The seal (`lean-prover-seal/2`): one file that names every byte the browser prover runs or reads, by BLAKE3 label,
// plus SHA-256 for the BLAKE3 hasher itself. Its own BLAKE3 label is the seal a caller pins (sealed.html?seal=...).
//
//   node scripts/make-seal.mjs --lexlean FILE --lexlean-url URL [--out web/seal.json]
//
// The prover is the kernel path: LexLean (WebAssembly) for the model, the lowering and proof finder (JavaScript), and
// Lean 4.32.2's kernel (WebAssembly) with a small base library. URLs are as web/serve.mjs serves them.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { kappa } from "../src/vendor/blake3.mjs";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith("--") ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
if (!a.lexlean || !a["lexlean-url"]) throw new Error("--lexlean and --lexlean-url are required");
const sha = (b) => "sha256:" + createHash("sha256").update(b).digest("hex");
const at = (path) => readFileSync(join(pkg, path));
const gz = (path, url) => ({ url, encoding: "gzip", kappa: kappa(gunzipSync(at(path))) });

// Package path -> URL under web/serve.mjs.
const CODE = {
  "web/sealed-app.mjs": "/sealed-app.mjs", "web/sealed-worker.mjs": "/sealed-worker.mjs", "web/judge-worker.mjs": "/judge-worker.mjs", "web/lexlean-worker.mjs": "/lexlean-worker.mjs", "web/sealed-store.mjs": "/sealed-store.mjs",
  "src/wasi.mjs": "/src/wasi.mjs", "src/axioms.mjs": "/src/axioms.mjs",
  "kernel-path/src/emit.mjs": "/kernel-path/src/emit.mjs", "kernel-path/src/lower.mjs": "/kernel-path/src/lower.mjs", "kernel-path/src/plan.mjs": "/kernel-path/src/plan.mjs",
};
const BOOT = { "hologram/hologram_store.js": "/hologram/hologram_store.js", "hologram/hologram_store_bg.wasm": "/hologram/hologram_store_bg.wasm" };

const seal = {
  schema: "lean-prover-seal/2",
  lean: "4.32.2",
  entry: "web/sealed-app.mjs",
  bootstrap: Object.fromEntries(Object.entries(BOOT).map(([p, url]) => [p, { url, sha256: sha(at(join("web", p))) }])),
  code: Object.fromEntries(Object.entries(CODE).map(([p, url]) => [p, { url, kappa: kappa(at(p)) }])),
  kernel: {
    loader: { url: "/kernel-path/kernel/lean-kernel.mjs", kappa: kappa(at("kernel-path/kernel/lean-kernel.mjs")) },
    wasm: gz("kernel-path/kernel/lean-kernel.wasm.gz", "/kernel-path/kernel/lean-kernel.wasm.gz"),
  },
  base: gz("kernel-path/library/base.ndjson.gz", "/kernel-path/library/base.ndjson.gz"),
  lexlean: { url: a["lexlean-url"], kappa: kappa(readFileSync(a.lexlean)) },
};
const bytes = Buffer.from(JSON.stringify(seal, null, 1) + "\n");
writeFileSync(a.out ?? join(pkg, "web", "seal.json"), bytes);
console.log(`seal ${kappa(bytes)}`);
