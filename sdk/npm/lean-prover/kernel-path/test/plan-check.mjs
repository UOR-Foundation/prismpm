// node test/plan-check.mjs BASE.ndjson SNAPSHOT.json [N]
// The model's work split into N batches (src/plan.mjs), each judged by the kernel on its own: every batch must be
// accepted, and together they must give each theorem the axioms one whole-model check gives. Prints each batch's time:
// the slowest is the wall time N kernels side by side would take.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { root, loadLibrary } from "./harness.mjs";
import { plan } from "../src/plan.mjs";

const [baseFile, snapFile, nArg] = process.argv.slice(2), N = Number(nArg ?? 4);
const base = fs.readFileSync(baseFile, "utf8"), snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
m.ccall("checker_ready", "number", [], []);
const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t = performance.now(); const exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); return { exit, ms: performance.now() - t, out: [...lines] }; };
call("load_library", base);
const axioms = (out) => new Map(out.map((l) => /^axioms (\S+): (.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2]]));
const hash = (s) => "blake3-stand-in:" + createHash("sha256").update(s).digest("hex"); // the keys' shape, not their function

const lib = loadLibrary(base);
let t = performance.now();
const p = plan(snap, lib, { hash });
const todo = p.theorems.filter((x) => !x.status).map((x) => x.name);
console.log(`plan: ${p.theorems.length} theorems over ${p.declarations} declarations in ${(performance.now() - t).toFixed(0)} ms; ${todo.length} to judge`);
const whole = call("check_suffix", p.file(todo));
console.log(`one kernel, the whole model: ${whole.ms.toFixed(0)} ms, exit ${whole.exit}`);
const want = axioms(whole.out), got = new Map();
let slowest = 0, total = 0, ok = true;
for (const [i, names] of p.batches(todo, N).entries()) {
  t = performance.now(); const text = p.file(names); const writeMs = performance.now() - t;
  const r = call("check_suffix", text);
  slowest = Math.max(slowest, r.ms); total += r.ms; ok &&= r.exit === 0;
  for (const [k, v] of axioms(r.out)) got.set(k, v);
  console.log(`  batch ${i + 1}: ${names.length} theorems, written in ${writeMs.toFixed(0)} ms, judged in ${r.ms.toFixed(0)} ms, exit ${r.exit}`);
}
const same = todo.every((n) => got.get(n) === want.get(n));
console.log(`${N} batches: ${ok ? "all accepted" : "NOT all accepted"}; axioms equal to the whole check's: ${same}; slowest ${slowest.toFixed(0)} ms, sum ${total.toFixed(0)} ms`);
// The keys: equal models, equal keys; a different statement, a different key for that theorem alone.
const again = plan(snap, lib, { hash });
const edited = JSON.parse(JSON.stringify(snap));
const th = edited.modules.flatMap((x) => x.semantic.declarations).find((d) => d.kind === "theorem");
th.statement = { kind: "eq", left: { kind: "bool", value: true }, right: { kind: "bool", value: true } };
const e = plan(edited, lib, { hash });
const changed = e.theorems.filter((x, i) => x.key !== p.theorems[i].key).map((x) => x.name);
console.log(`keys stable: ${again.theorems.every((x, i) => x.key === p.theorems[i].key)}; editing ${th.name} changes ${changed.length} key(s): ${changed.join(", ")}`);
process.exit(ok && same ? 0 : 1);
