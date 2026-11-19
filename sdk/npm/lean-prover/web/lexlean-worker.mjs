// The sealed prover's front: LexLean (WebAssembly) checks the project and gives its semantic model, and the project
// verdict store is read and written here. It is the only worker a returning visit starts: a project judged before under
// this seal is answered from the store, and nothing else runs.
//
//   { op: "init", hologramJs, hologramWasm, seal } -> { ok, store }
//   { op: "snapshot", files }                       -> { ok, text, ms } | { ok: false, diagnostics }
//   { op: "read", name } / { op: "write", name, bytes }
import { run as runWasi } from "../src/wasi.mjs";
import { admitted, openDir } from "./sealed-store.mjs";

let holo = null, seal = null, assets = null, verdicts = null, lexlean = null;

async function init(data) {
  holo = await import(data.hologramJs);
  holo.initSync({ module: data.hologramWasm });
  seal = data.seal;
  [assets, verdicts] = await Promise.all([openDir("lean-sealed"), openDir("lean-verdicts")]);
  return { ok: true, store: verdicts?.kind ?? null };
}

// LexLean is admitted and compiled when first asked for, which a returning visit never does.
const compiled = () => (lexlean ??= admitted(holo, assets, seal.lexlean).then((b) => WebAssembly.compile(b)));

async function snapshot(files) {
  const module = await compiled(), t = performance.now();
  const { exit, stdout, stderr } = runWasi(module, { args: ["lexlean", "snapshot", "--all"], files: new Map(files) });
  if (exit !== 0) return { ok: false, diagnostics: stderr || stdout };
  return { ok: true, text: stdout, ms: Math.round(performance.now() - t) };
}

self.onmessage = async ({ data }) => {
  const reply = (r) => self.postMessage({ id: data.id, ...r });
  try {
    if (data.op === "init") return reply(await init(data));
    if (!holo) return reply({ error: "the front is not initialized" });
    if (data.op === "snapshot") return reply(await snapshot(data.files));
    if (data.op === "warm") { await compiled(); return reply({ ok: true }); }
    if (data.op === "read") return reply({ bytes: verdicts ? await verdicts.get(data.name).catch(() => null) : null });
    if (data.op === "write") { await verdicts?.put(data.name, data.bytes).catch(() => {}); return reply({ ok: true }); }
    reply({ error: `unknown op ${data.op}` });
  } catch (e) { reply({ error: "the front failed: " + (e?.message ?? e) }); }
};
