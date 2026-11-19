// The gate's speed record: native Lean and the engine on the same corpus, cold (an empty module store) and warm
// (the store the cold run filled), with peak memory. Timings are recorded, never compared; agreement is the gate.
//   node gate/speed.mjs OUT.json native=FILE wasm-cold=FILE wasm-warm=FILE [cap4g=FILE ...]
// A native FILE is GNU time's `%e %M` line (seconds, peak kilobytes); the others are run-wasm.mjs --timings files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [out, ...pairs] = process.argv.slice(2);
// The memory a run may use: 4 GiB, what a provider's sandbox or a phone's tab can be expected to give. Reported per
// run, never enforced here.
const CAP_KB = 4 * 1024 * 1024;
const record = { schema: "lean-prover/speed/1", capKB: CAP_KB, runs: {} };
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
for (const r of Object.values(record.runs)) if (r) Object.assign(r, { capShare: Math.round((r.maxRssKB / CAP_KB) * 1000) / 1000, underCap: r.maxRssKB <= CAP_KB });
writeFileSync(out, JSON.stringify(record, null, 1));
for (const [name, r] of Object.entries(record.runs)) {
  console.log(r
    ? `${name}: total ${r.totalMs} ms${r.openMs !== undefined ? `, open ${r.openMs} ms, modules ${r.modulesMs} ms` : ""}, peak ${Math.round(r.maxRssKB / 1024)} MB = ${Math.round(r.capShare * 100)}% of the 4 GiB cap${r.underCap ? "" : " (OVER)"}`
    : `${name}: not run`);
}
