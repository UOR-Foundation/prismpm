// One kernel per worker: Lean's own kernel (WebAssembly) with the library held resident.
// The same file runs as a Web Worker in a browser and as a worker thread in Node.
// Everything it uses arrives as bytes the host already checked against the pin: the kernel, the library, the hashing
// code. It trusts nothing it is sent to judge.
//   start   { wasmBinary, libraryText, environment, storeWasm, judgeLibrary }  -> { ready, judged }
//   prove   { id, theorems, indices }  -> { id, results, suffix, ... }   proofs found here, judged in one call
//   pack    { id, pack, names }        -> { id, ok, why }                proofs found elsewhere, each bound to its statement
import factory from "../kernel/lean-kernel.mjs";
import { loadLibrary, emitter, revive } from "./emit.mjs";
import initStore, { address } from "../hologram/hologram_store.js";

const web = typeof self !== "undefined" && typeof self.postMessage === "function";
const port = web
  ? { on: (f) => { self.onmessage = (e) => f(e.data); }, post: (m) => self.postMessage(m) }
  : await (async () => { const { parentPort } = await import("node:worker_threads"); return { on: (f) => parentPort.on("message", f), post: (m) => parentPort.postMessage(m) }; })();

const enc = new TextEncoder();
let call, lib, libraryNames, libraryText, env, m;

async function start(s) {
  await initStore({ module_or_path: s.storeWasm });
  env = s.environment; libraryText = s.libraryText;
  const out = [];
  m = await factory({ locateFile: (f) => f, instantiateWasm: (imports, ok) => { WebAssembly.instantiate(s.wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (x) => out.push(x), printErr: (x) => out.push(x) });
  if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("kernel not ready");
  call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); out.length = 0; let exit; try { exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; out.push("trap: " + e.message); } return { exit, last: out[out.length - 1], lines: [...out] }; };
  // The library is held without re-checking only because this kernel has judged these exact bytes: here, now, or
  // in an earlier session that recorded it under the same labels.
  let judged = null;
  if (s.judgeLibrary) { const t = performance.now(), v = call("check_whole", libraryText); judged = { ok: v.exit === 0, ms: performance.now() - t, last: v.last }; if (!judged.ok) return judged; }
  if (call("load_library", libraryText).exit !== 0) throw new Error("library not admitted");
  lib = loadLibrary(libraryText);
  libraryNames = new Set(lib.decls.keys());
  return judged;
}

const axiomsIn = (lines) => new Map(lines.map((l) => /^axioms (\S+): (.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].split(", ").filter(Boolean).sort()]));
const forget = () => { for (const n of lib.decls.keys()) if (!libraryNames.has(n)) lib.decls.delete(n); };

function emit(theorems, byName, indices) {
  const em = emitter(lib), written = new Set(), results = new Map(), order = [];
  const need = (i) => {
    if (written.has(i)) return; written.add(i);
    const th = theorems[i];
    // A theorem this one cites must be in the same file, before it.
    for (const id of th.text.match(/[A-Za-z_][\w'.]*/g) || []) { const j = byName.get(id) ?? byName.get(th.ns + "." + id); if (j !== undefined && j !== i) need(j); }
    try { const t = em.theorem(th); em.write(t); results.set(i, { ok: true, decl: address(enc.encode(JSON.stringify(["lexlean/declaration/1", env, em.canon(t)]))) }); order.push(i); }
    catch (e) { results.set(i, { ok: false, why: e.message }); }
  };
  for (const i of indices) need(i);
  return { suffix: em.lines(), results, order };
}

function prove({ id, theorems, indices }) {
  theorems.forEach(revive);
  const byName = new Map(theorems.map((t, i) => [t.name, i])), t0 = performance.now();
  let { suffix, results, order } = emit(theorems, byName, indices);
  const t1 = performance.now(), verdict = order.length ? call("check_suffix", suffix) : { exit: 0, lines: [] };
  if (verdict.exit === 0) { const ax = axiomsIn(verdict.lines); for (const i of order) results.get(i).axioms = ax.get(theorems[i].name) || []; }
  else { // one refusal must not sink the rest: judge each alone, and keep nothing the kernel did not accept
    suffix = "";
    for (const i of order) { forget(); const one = emit(theorems, byName, [i]), v = call("check_suffix", one.suffix); if (v.exit !== 0) results.set(i, { ok: false, why: v.last }); else results.get(i).axioms = axiomsIn(v.lines).get(theorems[i].name) || []; }
  }
  forget(); // the next job may be a different module
  return { id, results: indices.map((i) => [i, results.get(i)]), suffix, emitMs: t1 - t0, kernelMs: performance.now() - t1, heapMB: Math.round(m.HEAPU8.length / 1048576) };
}

function pack({ id, pack, names }) {
  const t0 = performance.now(); let lines = "", why = null;
  try { const em = emitter(loadLibrary(libraryText + pack)); for (const n of names) em.write(em.bind(n)); lines = em.lines(); } catch (e) { why = e.message; }
  const v = why ? { exit: 1, last: why, lines: [] } : call("check_suffix", pack + lines), ax = axiomsIn(v.lines);
  return { id, ok: v.exit === 0, why: v.exit === 0 ? null : v.last, axioms: names.map((n) => [n, ax.get(n) || []]), ms: performance.now() - t0 };
}

port.on(async (msg) => {
  if (msg.start) { try { port.post({ ready: true, judged: await start(msg.start) }); } catch (e) { port.post({ failed: String(e && e.message || e) }); } return; }
  port.post(msg.pack ? pack(msg) : prove(msg));
});
