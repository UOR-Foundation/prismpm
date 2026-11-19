// The WebAssembly side of the corpus gate: the engine opened from a manifest folder (scripts/make-manifest.mjs),
// every blob admitted by its BLAKE3 label, then each module elaborated in the order given, one JSON line each, the
// same driver answer native `elab --resident` prints.
//
// With --store DIR, module results are kept in a store keyed by BLAKE3 label (src/store.mjs): an empty store is a
// cold run, a filled one a warm run, where each module is checked again by the kernel instead of elaborated.
// With --timings FILE, the run's times and peak memory are written there.
//   node gate/run-wasm.mjs MANIFEST_DIR [--store DIR] [--timings FILE] [--budget-gib N] Module=path ...
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BUDGET, openEngine, widthOf } from "../src/prover.mjs";
import { cachedCheck, storeResult } from "../src/store.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
const option = (name) => { const i = args.indexOf(name); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const storeDir = option("--store"), timingsFile = option("--timings"), budgetGiB = option("--budget-gib");
const specs = args;

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const read = (label) => { const f = join(dir, "blobs", label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
const store = storeDir && (mkdirSync(storeDir, { recursive: true }), {
  get: (label) => { const f = join(storeDir, label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; },
  put: (label, bytes) => writeFileSync(join(storeDir, label.slice(7)), bytes),
});

const now = () => performance.now();
const t0 = now();
let { engine, evidence } = await openEngine({ manifest, read });
const openMs = Math.round(now() - t0);
const modules = [];
// The engine's memory after each module, and a restart before any module once it passes half the prover's budget
// (src/prover.mjs). Half, because one module adds over a gigabyte and the engine traps at its ceiling, not at the
// budget: eight modules in one engine reached 8 GiB and trapped. A restart drops /out, which later modules of the
// same project import from, so what every earlier module wrote there is kept here and written back.
// --budget-gib N sets it for a host with less memory than the engine's own ceiling.
const budget = budgetGiB ? Number(budgetGiB) * 2 ** 30 : DEFAULT_BUDGET[widthOf(manifest)] / 2;
const EXTS = [".olean", ".olean.server", ".olean.private", ".ir"];
const outPath = (module, ext) => `/out/${module.replaceAll(".", "/")}${ext}`;
const written = new Map(); // /out path -> bytes, for every module so far
const keep = async (module) => { for (const ext of EXTS) { const { bytes } = await engine.call({ op: "read", path: outPath(module, ext) }); if (bytes) written.set(outPath(module, ext), new Uint8Array(bytes)); } };
const heap = async () => (await engine.call({ op: "heap" })).heapBytes;
let restarts = 0;
try {
  for (const spec of specs) {
    const at = spec.indexOf("=");
    const module = spec.slice(0, at), source = spec.slice(at + 1);
    const path = `/src/${module.replaceAll(".", "/")}.lean`;
    const text = new Uint8Array(readFileSync(source));
    if ((await heap()) > budget) {
      await engine.close();
      ({ engine } = await openEngine({ manifest, read }));
      for (const [p, bytes] of written) await engine.call({ op: "write", path: p, bytes });
      restarts++;
    }
    const t = now();
    await engine.call({ op: "write", path, bytes: text });
    let answer = store ? await cachedCheck({ engine, store, evidence, module, text }) : null;
    const reused = answer !== null;
    if (!answer) {
      try {
        ({ answer } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module, path } }));
      } catch (e) {
        console.error(`${module} trapped with the engine's memory at ${await heap().catch(() => "unknown")} bytes, budget ${budget}, after ${restarts} restarts`);
        throw e;
      }
      if (store && answer.elaborated && answer.replayRefused === null) await storeResult({ engine, store, evidence, module, text, answer });
    }
    const wallMs = Math.round(now() - t);
    await keep(module);
    const heapBytes = await heap();
    console.error(`${module}: ${wallMs} ms, engine memory ${(heapBytes / 2 ** 20).toFixed(0)} MiB, ${restarts} restarts`);
    modules.push({ module, reused, wallMs, heapBytes, elabMs: answer.elabMs ?? null, replayMs: answer.replayMs ?? null, declarations: answer.decls?.length ?? 0 });
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
    restarts,
    modulesMs: modules.reduce((a, m) => a + m.wallMs, 0),
    totalMs: Math.round(now() - t0),
    // Peak resident memory of the whole process, the engine's thread included, in kilobytes.
    maxRssKB: process.resourceUsage().maxRSS,
    modules,
  }, null, 1));
}
