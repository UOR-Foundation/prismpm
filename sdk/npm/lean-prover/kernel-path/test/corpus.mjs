// node test/corpus.mjs BASE.ndjson SNAPSHOT.json...
// Coverage of the kernel path over LexLean semantic models: for every theorem, its proof kinds (the whole proof tree),
// whether the model lowers, whether a proof is found, and whether Lean's kernel (WebAssembly, 4.32.2) accepts it.
// Prints a table by proof kind and the first reasons for what is not covered.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { root, loadLibrary } from "./harness.mjs";
import { plan } from "../src/plan.mjs";

const [baseFile, ...snaps] = process.argv.slice(2);
const base = fs.readFileSync(baseFile, "utf8"), lib = loadLibrary(base);
const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), lines = [];
const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
m.ccall("checker_ready", "number", [], []);
const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; let exit; try { exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; lines.push("trap " + e.message); } return { exit, out: [...lines] }; };
call("load_library", base);

const kindsOf = (p, into = new Set()) => { if (!p || typeof p !== "object") return into; if (Array.isArray(p)) { p.forEach((x) => kindsOf(x, into)); return into; } if (p.kind && typeof p.kind === "string") into.add(p.kind); for (const v of Object.values(p)) if (v && typeof v === "object") kindsOf(v, into); return into; };
const byKind = new Map(), reasons = new Map();
const tally = (kinds, outcome) => { for (const k of kinds) { const r = byKind.get(k) ?? { theorems: 0, proved: 0 }; r.theorems++; if (outcome === "proved") r.proved++; byKind.set(k, r); } };
const why = (msg, example) => { const key = msg.replace(/\b[\w.]+\.(\w+)\b/g, "…$1").slice(0, 110); if (!reasons.has(key)) reasons.set(key, { n: 0, example }); reasons.get(key).n++; };
let total = 0, proved = 0;
// One theorem's model: the snapshot with every other theorem left out, so a construct one theorem needs does not
// hide the rest.
const only = (snap, mod, name) => ({ ...snap, modules: snap.modules.map((x) => (!x.semantic ? x : { ...x, semantic: { ...x.semantic, declarations: x.semantic.declarations.filter((d) => d.kind !== "theorem" || (x.name === mod && d.name === name)) } })) });
for (const file of snaps) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) continue;
  const snap = JSON.parse(text), name = path.basename(file, ".json");
  const theorems = snap.modules.flatMap((mod) => (mod.semantic?.declarations ?? []).filter((d) => d.kind === "theorem").map((d) => ({ mod: mod.name, d })));
  if (!theorems.length) continue;
  const kinds = new Map(theorems.map(({ d }) => [d.name, [...kindsOf(d.proof)].filter((k) => !["var", "call", "nat", "bool", "named"].includes(k))]));
  total += theorems.length;
  let p;
  try { p = plan(snap, lib, { hash: (s) => s.length.toString(36) }); }
  catch (e) {
    // Theorem by theorem: each lowered with only what it reaches.
    let here = 0;
    for (const { mod, d } of theorems) {
      let outcome = "lowering";
      try {
        const q = plan(only(snap, mod, d.name), lib, { hash: (s) => s.length.toString(36) }), t = q.theorems[0];
        if (t.status) { outcome = "finder"; why(t.status, `${name}/${d.name}`); }
        else { const r = call("check_suffix", q.file([t.name])); outcome = r.exit === 0 ? "proved" : "kernel"; if (r.exit) why("kernel refused: " + r.out.slice(-1)[0], `${name}/${d.name}`); }
      } catch (e2) { why("lowering: " + e2.message, `${name}/${d.name}`); }
      tally(kinds.get(d.name), outcome); if (outcome === "proved") here++;
    }
    proved += here;
    console.log(`${name}: ${here} of ${theorems.length} proved (theorem by theorem)`);
    continue;
  }
  const short = (n) => n.slice(n.lastIndexOf(".") + 1);
  const results = new Map();
  for (const t of p.theorems) if (t.status) { results.set(short(t.name), "finder"); why(t.status, `${name}/${short(t.name)}`); }
  let todo = p.theorems.filter((t) => !t.status).map((t) => t.name);
  while (todo.length) {
    const r = call("check_suffix", p.file(todo));
    if (r.exit === 0) { for (const n of todo) results.set(short(n), "proved"); break; }
    const bad = /declaration '([^']+)'/.exec(r.out.join("\n"))?.[1];
    if (!todo.includes(bad)) { for (const n of todo) results.set(short(n), "kernel"); why("kernel refused the declarations: " + r.out.slice(-1)[0], name); break; }
    results.set(short(bad), "kernel"); why("kernel refused the proof: " + r.out.slice(-1)[0], `${name}/${short(bad)}`);
    todo = todo.filter((n) => n !== bad);
  }
  let here = 0;
  for (const { d } of theorems) { const o = results.get(d.name) ?? "lowering"; tally(kinds.get(d.name), o); if (o === "proved") here++; }
  proved += here;
  console.log(`${name}: ${here} of ${theorems.length} proved`);
}
console.log(`\nall: ${proved} of ${total} theorems proved by the kernel path\n\nby proof kind (a theorem counts once for each kind in its proof tree):`);
for (const [k, r] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${k.padEnd(20)} ${String(r.proved).padStart(4)} of ${String(r.theorems).padStart(4)}`);
console.log("\nreasons, most frequent first:");
for (const [k, r] of [...reasons].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(`  ${String(r.n).padStart(4)}  ${k}   (${r.example})`);
