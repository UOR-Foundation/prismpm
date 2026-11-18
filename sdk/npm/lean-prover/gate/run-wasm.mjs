// The WebAssembly side of the corpus gate: the engine opened from a manifest folder (scripts/make-manifest.mjs),
// every blob admitted by its BLAKE3 label, then each module elaborated in the order given, one JSON line each, the
// same driver answer native `elab --resident` prints.
//   node gate/run-wasm.mjs MANIFEST_DIR Module=path ...
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openEngine } from "../src/prover.mjs";

const [dir, ...specs] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const read = (label) => { const f = join(dir, "blobs", label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
const { engine } = await openEngine({ manifest, read });
try {
  for (const spec of specs) {
    const at = spec.indexOf("=");
    const module = spec.slice(0, at), source = spec.slice(at + 1);
    const path = `/src/${module.replaceAll(".", "/")}.lean`;
    await engine.call({ op: "write", path, bytes: new Uint8Array(readFileSync(source)) });
    const t0 = performance.now();
    const { answer } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module, path } });
    console.log(JSON.stringify({ ...answer, module, wallMs: Math.round(performance.now() - t0) }));
  }
} finally {
  await engine.close();
}
