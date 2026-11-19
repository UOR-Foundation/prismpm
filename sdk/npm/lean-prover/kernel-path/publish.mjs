// node publish.mjs fallback | pin
//
// fallback   Which theorems of the example need Lean's own proof: those for which no proof is found here, and those
//            for which one is found but on other axioms than declared. Written to examples/fold-laws/fallback.txt.
//            (lean/export.sh then has Lean export exactly those proofs.)
// pin        Writes pin.json, the one document that says what this prover is. Its κ-label is the environment.
//              bootstrap  the hashing code, by SHA-256, which any host checks with nothing but itself
//              assets     everything else that runs or is judged, by BLAKE3 κ-label
//            Also writes the example's index of published proofs, which is outside the pin: proofs are data to be
//            judged, not code to be trusted.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { initSync, address } from "./hologram/hologram_store.js";
import { root, read, kernel, loadLibrary, emitter, readModule, declaredAxioms } from "./test/harness.mjs";

const EX = "examples/fold-laws", modules = ["Kernels.lean.txt", "Folds.lean.txt", "Main.lean.txt"];
// Large files are kept gzipped. A label is always of the decoded bytes: the encoding is storage, never identity.
const GZ = new Set(["kernel/lean-kernel.wasm", "library/library.ndjson"]);
const bytes = (p) => GZ.has(p) ? gunzipSync(fs.readFileSync(path.join(root, p + ".gz"))) : fs.readFileSync(path.join(root, p));

if (process.argv[2] === "fallback") {
  const k = await kernel(), em = emitter(loadLibrary(k.libraryText)), declared = declaredAxioms(read(`${EX}/axioms.txt`)), fallback = [];
  let all = 0;
  for (const f of modules) for (const th of readModule(read(`${EX}/${f}`))) { all++; try { em.write(em.theorem(th)); } catch { fallback.push(th.name); } }
  const v = k.judge(em.lines()), observed = k.axioms(v.out);
  if (v.exit !== 0) throw new Error("the kernel refused a proof found here: " + v.last);
  for (const [name, ax] of observed) if (ax.join() !== (declared.get(name) || []).join()) fallback.push(name);
  fs.writeFileSync(path.join(root, EX, "fallback.txt"), fallback.length ? fallback.join("\n") + "\n" : "");
  fs.writeFileSync(path.join(root, EX, "found.ndjson"), em.lines()); // what was found here, for judging by the native kernel
  console.log(`${all} theorems: ${all - fallback.length} proved here on the declared axioms, ${fallback.length} need Lean's own proof`);
} else if (process.argv[2] === "pin") {
  initSync({ module: bytes("hologram/hologram_store_bg.wasm") });
  const leanCommit = "f3b06c705e6c85f5314019d5d3baab0fec5b580c", kernelWasm = bytes("kernel/lean-kernel.wasm");
  if (!kernelWasm.includes(Buffer.from(leanCommit))) throw new Error("the kernel build does not carry the pinned Lean commit");
  const bootstrap = ["hologram/hologram_store_bg.wasm", "hologram/hologram_store.js"];
  const assets = ["kernel/lean-kernel.wasm", "kernel/lean-kernel.mjs", "library/library.ndjson", "src/emit.mjs", "src/store.mjs", "src/prover.mjs", "src/worker.mjs", "web/app.mjs"];
  const pin = {
    schema: "lexlean/pin/1",
    lean: { version: "4.32.2", commit: leanCommit },
    kernel: { source: `leanprover/lean4@${leanCommit}, src/kernel unchanged`, sha256: "sha256:" + createHash("sha256").update(kernelWasm).digest("hex") },
    bootstrap: Object.fromEntries(bootstrap.map((p) => [p, "sha256:" + createHash("sha256").update(bytes(p)).digest("hex")])),
    assets: Object.fromEntries([...bootstrap, ...assets].map((p) => [p, GZ.has(p) ? { kappa: address(bytes(p)), bytes: bytes(p).length, file: p + ".gz", encoding: "gzip" } : { kappa: address(bytes(p)), bytes: bytes(p).length }])),
  };
  const text = JSON.stringify(pin, null, 1) + "\n";
  fs.writeFileSync(path.join(root, "pin.json"), text);
  const pack = bytes(`${EX}/proofs.ndjson`), theorems = read(`${EX}/fallback.txt`).split("\n").filter(Boolean);
  const axioms = Object.fromEntries(declaredAxioms(read(`${EX}/axioms.txt`)));
  fs.writeFileSync(path.join(root, EX, "proofs.json"), JSON.stringify({ schema: "lexlean/published-proofs/1", packs: theorems.length ? [{ file: "proofs.ndjson", kappa: address(pack), bytes: pack.length, theorems }] : [], axioms }, null, 1) + "\n");
  const total = Object.values(pin.assets).reduce((a, x) => a + x.bytes, 0);
  console.log(`pin ${address(Buffer.from(text))}: ${Object.keys(pin.assets).length} files, ${(total / 1048576).toFixed(2)} MB`);
} else { console.log("usage: node publish.mjs fallback | pin"); process.exit(1); }
