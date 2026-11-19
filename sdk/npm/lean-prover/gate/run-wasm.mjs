// The WebAssembly side of the corpus gate: the engine opened from a manifest folder (scripts/make-manifest.mjs),
// every blob admitted by its BLAKE3 label, then each module elaborated in the order given, one JSON line each, the
// same driver answer native `elab --resident` prints.
//
// With --store DIR, module results are kept in a store keyed by BLAKE3 label (src/store.mjs): an empty store is a
// cold run, a filled one a warm run, where each module is checked again by the kernel instead of elaborated.
// With --timings FILE, the run's times and peak memory are written there.
//   node gate/run-wasm.mjs MANIFEST_DIR [--store DIR] [--timings FILE] Module=path ...
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openEngine } from "../src/prover.mjs";
import { cachedCheck, storeResult } from "../src/store.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
const option = (name) => { const i = args.indexOf(name); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const storeDir = option("--store"), timingsFile = option("--timings");
const specs = args;

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const read = (label) => { const f = join(dir, "blobs", label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
const store = storeDir && (mkdirSync(storeDir, { recursive: true }), {
  get: (label) => { const f = join(storeDir, label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; },
  put: (label, bytes) => writeFileSync(join(storeDir, label.slice(7)), bytes),
});

const now = () => performance.now();
const t0 = now();
const { engine, evidence } = await openEngine({ manifest, read });
const openMs = Math.round(now() - t0);
const modules = [];
try {
  for (const spec of specs) {
    const at = spec.indexOf("=");
    const module = spec.slice(0, at), source = spec.slice(at + 1);
    const path = `/src/${module.replaceAll(".", "/")}.lean`;
    const text = new Uint8Array(readFileSync(source));
    const t = now();
    await engine.call({ op: "write", path, bytes: text });
    let answer = store ? await cachedCheck({ engine, store, evidence, module, text }) : null;
    const reused = answer !== null;
    if (!answer) {
      ({ answer } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module, path } }));
      if (store && answer.elaborated && answer.replayRefused === null) await storeResult({ engine, store, evidence, module, text, answer });
    }
    const wallMs = Math.round(now() - t);
    modules.push({ module, reused, wallMs, elabMs: answer.elabMs ?? null, replayMs: answer.replayMs ?? null, declarations: answer.decls?.length ?? 0 });
    console.log(JSON.stringify({ ...answer, module, wallMs, reused }));
  }
} finally {
  await engine.close();
}
if (timingsFile) {
  writeFileSync(timingsFile, JSON.stringify({
    node: process.version,
    store: store ? "used" : "none",
    openMs,
    modulesMs: modules.reduce((a, m) => a + m.wallMs, 0),
    totalMs: Math.round(now() - t0),
    // Peak resident memory of the whole process, the engine's thread included, in kilobytes.
    maxRssKB: process.resourceUsage().maxRSS,
    modules,
  }, null, 1));
}
