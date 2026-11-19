// node test/coverage.mjs LIBRARY.ndjson MODULE.lean[.txt] ...
// Coverage of the kernel path on a project: for every theorem in the given rendered modules, whether a proof is found
// here with no Lean elaborator running, and whether Lean's kernel (WebAssembly, 4.32.2) accepts it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root, loadLibrary, emitter, readModule } from "./harness.mjs";
import { gunzipSync } from "node:zlib";

const [libraryFile, ...modules] = process.argv.slice(2);
const libraryText = fs.readFileSync(libraryFile, "utf8");
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("kernel not ready");
const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t = performance.now(); const exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); return { exit, ms: performance.now() - t, out: [...lines] }; };
let t = performance.now();
const lib = call("load_library", libraryText);
console.log(`library: ${(libraryText.length / 1048576).toFixed(1)} MB, kernel ${lib.exit === 0 ? "admits it" : "refuses it: " + lib.out.slice(-2).join(" ")} in ${(performance.now() - t).toFixed(0)} ms`);
if (lib.exit !== 0) process.exit(1);

const em = emitter(loadLibrary(libraryText));
let found = 0, all = 0;
for (const file of modules) {
  for (const th of readModule(fs.readFileSync(file, "utf8"))) {
    all++;
    t = performance.now();
    let emitted, why = null;
    try { emitted = em.theorem(th); } catch (e) { why = e.message; }
    const findMs = performance.now() - t;
    if (why) { console.log(`  no proof found: ${th.name}: ${why.slice(0, 200)}`); continue; }
    const one = emitter(loadLibrary(libraryText)); one.write(emitted);
    const v = call("check_suffix", one.lines());
    const axioms = v.out.filter((l) => l.startsWith("axioms ")).join("; ");
    if (v.exit === 0) found++;
    console.log(`  ${v.exit === 0 ? "proved" : "REFUSED"}: ${th.name} (found in ${findMs.toFixed(1)} ms, judged in ${v.ms.toFixed(1)} ms) ${axioms}${v.exit === 0 ? "" : " " + v.out.slice(-2).join(" ")}`);
  }
}
console.log(`${found} of ${all} theorems proved by the kernel path, no elaborator`);
