// node test/declarations-check.mjs BASE.ndjson DECLARATIONS.json...
// LexLean's own kernel declarations of a model (lexlean/kernel-declarations/1), judged by Lean's kernel: every
// declaration and statement, then each theorem's proof as the kernel path finds it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { root, loadLibrary } from "./harness.mjs";
import { planDeclarations } from "../src/declarations.mjs";

const [baseFile, ...files] = process.argv.slice(2);
const base = fs.readFileSync(baseFile, "utf8"), lib = loadLibrary(base);
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
m.ccall("checker_ready", "number", [], []);
const call = (text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; let exit; try { exit = m.ccall("check_suffix", "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; lines.push("trap " + e.message); } return { exit, out: [...lines] }; };
m.FS.writeFile("/b", base); m.ccall("load_library", "number", ["string"], ["/b"]);
let all = 0, proved = 0;
for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, "utf8")), name = path.basename(file, ".json");
  let p;
  try { p = planDeclarations(d, lib); } catch (e) { console.log(`${name}: could not read: ${e.message}`); continue; }
  const declText = p.file([]), decls = declText.trim() ? call(declText) : { exit: 0, out: [] };
  console.log(`${name}: ${p.declarations} declarations, ${d.refused.length} refused; kernel ${decls.exit === 0 ? "accepts them" : "refuses: " + decls.out.slice(-2).join(" | ")}`);
  if (decls.exit !== 0) continue;
  let todo = p.theorems.filter((t) => !t.status && (!process.env.ONLY || t.name.endsWith("." + process.env.ONLY))).map((t) => t.name), here = 0;
  if (process.env.ONLY) { const r = call(p.file(todo)); console.log(r.out.join("\n").slice(-3000)); }
  const failed = new Map(p.theorems.filter((t) => t.status).map((t) => [t.name, t.status]));
  while (todo.length) {
    const r = call(p.file(todo));
    if (r.exit === 0) { here += todo.length; break; }
    const bad = /declaration '([^']+)'/.exec(r.out.join("\n"))?.[1];
    if (!todo.includes(bad)) { for (const n of todo) failed.set(n, "kernel: " + r.out.slice(-1)[0]); break; }
    failed.set(bad, "kernel refused the proof: " + r.out.slice(-1)[0]); todo = todo.filter((n) => n !== bad);
  }
  all += p.theorems.length; proved += here;
  console.log(`  ${here} of ${p.theorems.length} theorems proved`);
  for (const [n, why] of [...failed]) console.log(`    ${n.slice(n.lastIndexOf(".") + 1)}: ${why.slice(0, 200)}`);
}
console.log(`all: ${proved} of ${all}`);
