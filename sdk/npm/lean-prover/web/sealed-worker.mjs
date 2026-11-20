// The sealed prover's coordinator: the lowering and the proof finder, and the memory of what has been judged. LexLean
// runs beside it (lexlean-worker.mjs) and hands it the semantic model. No elaborator: LexLean's semantic model is lowered straight to kernel declarations
// (kernel-path/src/lower.mjs), and the work is written as batches any number of judges check at once
// (kernel-path/src/plan.mjs, web/judge-worker.mjs).
//
// Every theorem carries a Merkle key: the BLAKE3 label of its statement and of everything it reaches. A theorem the
// kernel accepted under this seal and key is not judged again; an edit changes the keys of the theorems that reach
// what was edited, and no other. Every byte is named by the seal and admitted by its label (sealed-store.mjs).
//
//   { op: "init", hologramJs, hologramWasm, seal, sealLabel } -> { ok, evidence }; the base library is read at once
//   { op: "model", text }       -> { ok, theorems, todo, declarations, timings } | { ok: false, stage, diagnostics }
//   { op: "files", batches, n } -> { files: [{ names, text }] }       the files for these batches
//   { op: "split", names, n }   -> { batches }                         names in at most n groups, by remembered cost
//   { op: "record", results }   -> { ok }                              [{ key, axioms, ms }] the kernel accepted
import { loadLibrary } from "../kernel-path/src/emit.mjs";
import { plan } from "../kernel-path/src/plan.mjs";
import { admitted, openDir } from "./sealed-store.mjs";

const now = () => performance.now();
const enc = new TextEncoder(), dec = new TextDecoder();
let holo = null, seal = null, sealLabel = null, assets = null, verdicts = null, library = null, current = null;

async function init(data) {
  holo = await import(data.hologramJs);
  holo.initSync({ module: data.hologramWasm });
  seal = data.seal; sealLabel = data.sealLabel;
  [assets, verdicts] = await Promise.all([openDir("lean-sealed"), openDir("lean-verdicts")]);
  // The base library, read for the lowering while LexLean runs beside this worker, and the theorem verdicts.
  warm = Promise.all([admitted(holo, assets, seal.base).then((base) => { library = loadLibrary(dec.decode(base)); }), loadVerdicts()]);
  warm.catch(() => {});
  return { ok: true, evidence: { kernel: seal.kernel.wasm.kappa, loader: seal.kernel.loader.kappa, base: seal.base.kappa, lexlean: seal.lexlean.kappa } };
}
let warm = null;

const hash = (s) => holo.address(enc.encode(s));
// The theorem verdicts under this seal, in one small file: { key: { axioms, ms } }, read once and written whole. It is
// filed with its own label in front, so a damaged or altered file reads as empty.
let known = new Map();
const knownName = () => hash(`lean-prover/theorem-verdicts/1\n${sealLabel}`).slice(7);
async function loadVerdicts() {
  const b = verdicts ? await verdicts.get(knownName()).catch(() => null) : null;
  if (!b) return;
  const text = dec.decode(b), cut = text.indexOf("\n");
  if (cut > 0 && hash(text.slice(cut + 1)) === text.slice(0, cut)) known = new Map(Object.entries(JSON.parse(text.slice(cut + 1))));
}
async function saveVerdicts() {
  const body = JSON.stringify(Object.fromEntries(known));
  await verdicts?.put(knownName(), enc.encode(hash(body) + "\n" + body)).catch(() => {});
}

async function model(text) {
  const timings = {};
  let t = now();
  await warm;
  timings.waitedMs = Math.round(now() - t);
  t = now();
  const snapshot = JSON.parse(text);
  try { current = plan(snapshot, library, { hash }); } catch (e) { return { ok: false, stage: "lower", diagnostics: e.message }; }
  timings.lowerMs = Math.round(now() - t);
  t = now();
  // Remembered verdicts stand in for judging: the same statement over the same definitions, under the same seal.
  const costs = new Map();
  const theorems = current.theorems.map((th) => {
    const row = { name: th.name, key: th.key, proof: th.proof, declared: th.declared, status: th.status, axioms: null, remembered: false };
    const v = row.status ? null : known.get(th.key);
    if (v) { row.axioms = v.axioms; row.remembered = true; costs.set(th.key, v.ms); }
    return row;
  });
  current.costs = costs;
  timings.recallMs = Math.round(now() - t);
  const todo = theorems.filter((r) => !r.status && !r.remembered).map((r) => r.name);
  return { ok: true, theorems, todo, declarations: current.declarations, timings };
}

self.onmessage = async ({ data }) => {
  const reply = (r) => self.postMessage({ id: data.id, ...r });
  try {
    if (data.op === "init") return reply(await init(data));
    if (!holo) return reply({ error: "the coordinator is not initialized" });
    if (data.op === "model") return reply(await model(data.text));
    if (data.op === "split") return reply({ batches: current.batches(data.names, data.n, (key) => current.costs.get(key) ?? null) });
    if (data.op === "files") return reply({ files: data.batches.map((names) => ({ names, text: current.file(names) })) });
    if (data.op === "record") { for (const r of data.results) { current?.costs.set(r.key, r.ms); known.set(r.key, { axioms: r.axioms, ms: r.ms }); } await saveVerdicts(); return reply({ ok: true }); }
    reply({ error: `unknown op ${data.op}` });
  } catch (e) { reply({ error: "the coordinator failed: " + (e?.message ?? e) }); }
};
