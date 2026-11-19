// node test/lower-check.mjs BASE.ndjson SNAPSHOT.json [LEAN.ndjson]
// A model with no elaborator: LexLean's semantic snapshot is lowered to kernel declarations (src/lower.mjs) over a base
// library that holds none of the app, every theorem is proved by the kernel path, and Lean's kernel (WebAssembly,
// 4.32.2) judges all of it. With LEAN.ndjson (the same model as Lean elaborated it), each lowered declaration is
// compared with Lean's own, up to binder names.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { root, loadLibrary, emitter } from "./harness.mjs";
import { lower } from "../src/lower.mjs";

const [baseFile, snapFile, leanFile] = process.argv.slice(2);
const base = fs.readFileSync(baseFile, "utf8"), snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("kernel not ready");
const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t = performance.now(); const exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); return { exit, ms: performance.now() - t, out: [...lines] }; };
if (call("load_library", base).exit !== 0) throw new Error("base library refused");

let t = performance.now();
const em = emitter(loadLibrary(base)), r = lower(snap, em);
const lowerMs = performance.now() - t;
console.log(`lowered: ${r.declared.length} declarations and ${r.theorems.length} statements in ${lowerMs.toFixed(1)} ms`);
const kinds = { linear_arithmetic: "linear_arithmetic", decide: "decide", reflexivity: "rfl" };
let found = 0; const missed = [];
t = performance.now();
for (const th of r.theorems) {
  try { em.write(em.theorem({ name: th.name, ns: th.name.slice(0, th.name.lastIndexOf(".")), script: [{ kind: kinds[th.proof] ?? th.proof }], binders: [], raw: "", text: "" })); found++; }
  catch (e) { missed.push(`${th.name}: ${e.message}`); }
}
console.log(`proofs found: ${found} of ${r.theorems.length} in ${(performance.now() - t).toFixed(1)} ms`); missed.slice(0, 5).forEach((x) => console.log("  " + x));
const v = call("check_suffix", em.lines());
console.log(`kernel: ${v.exit === 0 ? "accepts" : "refuses"} every lowered declaration, statement and proof (${v.ms.toFixed(0)} ms)${v.exit === 0 ? "" : ": " + v.out.slice(-3).join(" | ")}`);
const ax = v.out.filter((l) => l.startsWith("axioms ")).map((l) => l.replace(/^axioms /, ""));
for (const th of r.theorems) { const a = ax.find((l) => l.startsWith(th.name + ":")); if (a) console.log(`  ${a.slice(th.name.lastIndexOf(".") + 1)}   (declared: ${th.axioms.join(", ") || "none"})`); }

if (leanFile) {
  // Lean's own declarations of the same model, compared with the lowered ones up to binder names.
  const lean = loadLibrary(fs.readFileSync(leanFile, "utf8")), mine = em.lib;
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.k !== b.k) return false;
    switch (a.k) {
      case "app": return same(a.fn, b.fn) && same(a.arg, b.arg);
      case "lam": case "pi": return a.bi === b.bi && same(a.type, b.type) && same(a.body, b.body);
      case "const": return a.name === b.name && a.us.length === b.us.length && a.us.every((u, i) => u.key === b.us[i].key);
      case "proj": return a.typeName === b.typeName && a.idx === b.idx && same(a.struct, b.struct);
      default: return a.key === b.key;
    }
  };
  let equal = 0, differ = 0;
  for (const n of r.declared) {
    const ours = mine.decls.get(n), theirs = lean.decls.get(n);
    const ok = theirs && same(ours.type, theirs.type) && (ours.value === undefined || theirs.value === undefined || same(ours.value, theirs.value));
    if (ok) equal++; else { differ++; if (differ <= 5) console.log(`  differs from Lean's: ${n}${theirs ? "" : " (Lean has no such declaration)"}`); }
  }
  console.log(`compared with Lean's own: ${equal} equal, ${differ} differ`);
}
