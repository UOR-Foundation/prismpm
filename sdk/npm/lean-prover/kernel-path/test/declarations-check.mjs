// node test/declarations-check.mjs BASE.ndjson DIR...
// LexLean's kernel declarations of a project (lexlean/kernel-declarations/2, written by `cargo xtask kernel-terms
// declare DIR BASE.ndjson`: DIR/declarations.json and DIR/declarations.ndjson), judged by Lean's kernel: every
// declaration and every proof LexLean produced, then a proof of each other theorem as the kernel path finds it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { root } from "./harness.mjs";
import { judgeDeclarations } from "../src/declarations.mjs";

const [baseFile, ...files] = process.argv.slice(2);
const base = fs.readFileSync(baseFile, "utf8");
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
m.ccall("checker_ready", "number", [], []);
const call = (text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; let exit; try { exit = m.ccall("check_suffix", "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; lines.push("trap " + e.message); } return { exit, out: [...lines] }; };
m.FS.writeFile("/b", base); m.ccall("load_library", "number", ["string"], ["/b"]);
let all = 0, proved = 0;
for (const dir of files) {
  const name = path.basename(dir);
  let meta, j, p;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "declarations.json"), "utf8"));
    j = judgeDeclarations(meta, fs.readFileSync(path.join(dir, "declarations.ndjson"), "utf8"), base, call);
    p = j.plan;
  } catch (e) { console.log(`${name}: could not read: ${e.message}`); continue; }
  const produced = p.theorems.filter((t) => t.produced).length;
  const decls = j.declarations;
  console.log(`${name}: ${meta.refused.length} declarations refused, ${produced} theorems produced by LexLean, ${j.setAside.size} set aside; kernel ${decls.exit === 0 ? "accepts the rest" : "refuses: " + decls.out.slice(-2).join(" | ")}`);
  for (const [n, why] of j.setAside) console.log(`    set aside ${n.slice(n.lastIndexOf(".") + 1)}: ${why.slice(0, 160)}`);
  if (decls.exit !== 0) { all += p.theorems.length; continue; }
  let todo = p.theorems.filter((t) => !t.status && !t.produced && (!process.env.ONLY || t.name.endsWith("." + process.env.ONLY))).map((t) => t.name), here = 0;
  if (process.env.ONLY) { const r = call(p.file(todo)); console.log(r.out.join("\n").slice(-3000)); }
  const failed = new Map(p.theorems.filter((t) => t.status).map((t) => [t.name, t.status]));
  while (todo.length) {
    const r = call(p.file(todo));
    if (r.exit === 0) { here += todo.length; break; }
    const bad = /declaration '([^']+)'/.exec(r.out.join("\n"))?.[1];
    if (!todo.includes(bad)) { for (const n of todo) failed.set(n, "kernel: " + r.out.slice(-1)[0]); break; }
    failed.set(bad, "kernel refused the proof: " + r.out.slice(-1)[0]); todo = todo.filter((n) => n !== bad);
  }
  all += p.theorems.length; proved += here + produced;
  console.log(`  ${here + produced} of ${p.theorems.length} theorems proved (${produced} by LexLean, ${here} found here)`);
  for (const [n, why] of [...failed]) console.log(`    ${n.slice(n.lastIndexOf(".") + 1)}: ${why.slice(0, 200)}`);
}
console.log(`all: ${proved} of ${all}`);
