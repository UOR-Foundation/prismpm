// Native and WebAssembly agree when, for every module, both elaborated it or both refused it, the second kernel
// pass refused nothing on either or refused on both, and every declaration has the same kind, type hash, value
// hash and axioms. Timings are reported, never compared.
//   node gate/agree.mjs native.jsonl wasm.jsonl      exit 0 when they agree

/** One answer per module, the last line for a module winning. */
export function load(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    const j = JSON.parse(t);
    out.set(j.module, j);
  }
  return out;
}

const declKey = (d) => JSON.stringify([d.name, d.kind, d.type, d.value, [...d.axioms].sort()]);

/** { rows, disagreements, declarations, accepted } over the union of modules. */
export function agree(native, wasm) {
  const rows = [];
  let declarations = 0;
  for (const module of [...new Set([...native.keys(), ...wasm.keys()])].sort()) {
    const a = native.get(module), b = wasm.get(module);
    if (!a || !b) { rows.push({ module, agree: false, why: `missing in ${a ? "wasm" : "native"}` }); continue; }
    const accepted = (j) => j.elaborated === true && (j.replayRefused ?? null) === null;
    const da = new Map((a.decls ?? []).map((d) => [d.name, declKey(d)]));
    const db = new Map((b.decls ?? []).map((d) => [d.name, declKey(d)]));
    const diff = [...new Set([...da.keys(), ...db.keys()])].sort().filter((n) => da.get(n) !== db.get(n));
    const same = accepted(a) === accepted(b) && a.elaborated === b.elaborated && diff.length === 0;
    declarations += da.size;
    rows.push({ module, agree: same, accepted: accepted(a) && accepted(b), declarations: da.size, why: same ? null : diff.length ? `declarations differ: ${diff.slice(0, 5).join(", ")}` : "verdicts differ" });
  }
  return { rows, declarations, disagreements: rows.filter((r) => !r.agree).length };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("gate/agree.mjs")) {
  const { readFileSync } = await import("node:fs");
  const [n, w] = process.argv.slice(2);
  const r = agree(load(readFileSync(n, "utf8")), load(readFileSync(w, "utf8")));
  for (const row of r.rows) console.log(`${row.module}: ${row.agree ? "agree" : "DISAGREE"}; ${row.declarations ?? 0} declarations${row.why ? "; " + row.why : ""}`);
  console.log(`${r.declarations} declarations, ${r.disagreements} disagreements`);
  process.exit(r.disagreements ? 1 : 0);
}
