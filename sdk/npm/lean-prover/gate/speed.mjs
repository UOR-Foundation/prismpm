// The gate's speed record: native Lean and the engine on the same corpus, cold (an empty module store) and warm
// (the store the cold run filled), with peak memory. Timings are recorded, never compared; agreement is the gate.
//   node gate/speed.mjs OUT.json native=FILE wasm-cold=FILE wasm-warm=FILE [node22-cold=FILE ...]
// A native FILE is GNU time's `%e %M` line (seconds, peak kilobytes); the others are run-wasm.mjs --timings files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [out, ...pairs] = process.argv.slice(2);
const record = { schema: "lean-prover/speed/1", runs: {} };
for (const pair of pairs) {
  const at = pair.indexOf("=");
  const name = pair.slice(0, at), file = pair.slice(at + 1);
  if (!existsSync(file)) { record.runs[name] = null; continue; }
  if (name.startsWith("native")) {
    const [seconds, kb] = readFileSync(file, "utf8").trim().split(/\s+/).map(Number);
    record.runs[name] = { totalMs: Math.round(seconds * 1000), maxRssKB: kb };
  } else {
    const t = JSON.parse(readFileSync(file, "utf8"));
    record.runs[name] = { node: t.node, openMs: t.openMs, modulesMs: t.modulesMs, totalMs: t.totalMs, maxRssKB: t.maxRssKB, modules: t.modules };
  }
}
writeFileSync(out, JSON.stringify(record, null, 1));
for (const [name, r] of Object.entries(record.runs)) {
  console.log(r ? `${name}: total ${r.totalMs} ms${r.openMs !== undefined ? `, open ${r.openMs} ms, modules ${r.modulesMs} ms` : ""}, peak ${Math.round(r.maxRssKB / 1024)} MB` : `${name}: not run`);
}
