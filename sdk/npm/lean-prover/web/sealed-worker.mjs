// The sealed prover's worker: LexLean's front end, the lowering, the proof finder, and Lean 4.32.2's kernel. No
// elaborator: LexLean's semantic model is lowered straight to kernel declarations (kernel-path/src/lower.mjs), each
// theorem's proof is found here (kernel-path/src/emit.mjs), and Lean's own kernel judges every declaration and proof.
//
// Every byte it runs or reads is named by a BLAKE3 label the seal fixes (web/seal.json, checked by sealed.html).
// Labels are computed with Hologram's BLAKE3 (WebAssembly); a byte whose label does not match is never used. Admitted
// assets are kept, decoded, in the origin's private file system under their labels, and re-hashed on every read.
//
//   { op: "init", hologramJs, hologramWasm, seal } -> { ok, evidence }
//   { op: "prove", files }                         -> { ok, theorems, declarations, timings, heapMB } | { ok: false, stage, diagnostics }
//   { op: "read", name } -> { bytes }    { op: "write", name, bytes } -> { ok }   (the verdict store)
import { run as runWasi } from "../src/wasi.mjs";
import { loadLibrary, emitter } from "../kernel-path/src/emit.mjs";
import { lower } from "../kernel-path/src/lower.mjs";

const now = () => performance.now();
let holo = null, seal = null, store = null, lexlean = null, kernel = null, baseText = null;

// Two stores, each a map from name to bytes: "lean-sealed" (admitted assets) and "lean-verdicts". The origin's private
// file system where it works; IndexedDB where it does not (some WebKit builds). Either way nothing read is trusted:
// every byte is re-hashed against the label it is filed under.
let verdicts = null;
async function opfsDir(name) {
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(name, { create: true });
  const d = {
    kind: "opfs",
    get: async (k) => { try { return new Uint8Array(await (await (await dir.getFileHandle(k)).getFile()).arrayBuffer()); } catch { return null; } },
    put: async (k, bytes) => {
      const f = await dir.getFileHandle(k, { create: true });
      if (f.createWritable) { const w = await f.createWritable(); await w.write(bytes); await w.close(); return; }
      const s = await f.createSyncAccessHandle(); try { s.truncate(0); s.write(bytes, { at: 0 }); s.flush(); } finally { s.close(); }
    },
  };
  // Used only if a write reads back: some builds open the file system and then lose what is written.
  const probe = new Uint8Array([108, 101, 97, 110]);
  await d.put(".probe", probe);
  const back = await d.get(".probe");
  if (!back || back.length !== probe.length || back.some((x, i) => x !== probe[i])) throw new Error("the file system does not keep what is written");
  return d;
}
async function idbDir(name) {
  const db = await new Promise((ok, no) => { const r = indexedDB.open("lean-prover-" + name, 1); r.onupgradeneeded = () => r.result.createObjectStore("b"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (mode, f) => new Promise((ok, no) => { const t = db.transaction("b", mode), r = f(t.objectStore("b")); t.oncomplete = () => ok(r.result); t.onerror = () => no(t.error); });
  return { kind: "indexeddb", get: async (k) => { const v = await tx("readonly", (s) => s.get(k)); return v ? new Uint8Array(v) : null; }, put: (k, bytes) => tx("readwrite", (s) => s.put(bytes, k)) };
}
const openDir = async (name) => { try { return await opfsDir(name); } catch { try { return await idbDir(name); } catch { return null; } } };
async function openStore() { store = await openDir("lean-sealed"); verdicts = await openDir("lean-verdicts"); }
const readIn = async (dir, name) => { try { return await dir.get(name); } catch { return null; } };
const writeIn = async (dir, name, bytes) => { try { await dir.put(name, bytes); } catch {} };
const fromStore = (hex) => readIn(store, hex);
const toStore = (hex, bytes) => writeIn(store, hex, bytes);
const decode = async (encoded, encoding) => (encoding !== "gzip" ? encoded
  : new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()));

/** The decoded bytes of a sealed asset, admitted only when their BLAKE3 label is the one the seal gives. */
async function admitted({ kappa: label, url, encoding }) {
  const hex = label.slice(7);
  let bytes = store ? await fromStore(hex) : null;
  if (bytes && holo.address(bytes) === label) return bytes;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  bytes = await decode(new Uint8Array(await res.arrayBuffer()), encoding);
  const got = holo.address(bytes);
  if (got !== label) throw new Error(`refused ${url}: its bytes are ${got}, not ${label}`);
  if (store) await toStore(hex, bytes);
  return bytes;
}

async function init({ hologramJs, hologramWasm, seal: s }) {
  holo = await import(hologramJs);
  holo.initSync({ module: hologramWasm });
  seal = s;
  await openStore();
  return { ok: true, store: verdicts?.kind ?? null, evidence: { kernel: seal.kernel.wasm.kappa, loader: seal.kernel.loader.kappa, base: seal.base.kappa, lexlean: seal.lexlean.kappa } };
}

// Lean's kernel with the base library loaded: started once, kept for every later proof. It holds no app: each
// project's declarations are judged as a suffix on top of the base and leave nothing behind.
async function openKernel() {
  if (kernel) return { kernel, startMs: 0 };
  const t = now();
  const [glue, wasm, base] = await Promise.all([admitted(seal.kernel.loader), admitted(seal.kernel.wasm), admitted(seal.base)]);
  const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
  let factory;
  try { factory = (await import(url)).default; } finally { URL.revokeObjectURL(url); }
  const lines = [];
  const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasm, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (x) => lines.push(x), printErr: (x) => lines.push(x) });
  if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("Lean's kernel did not start");
  const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t0 = now(); const exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); return { exit, ms: now() - t0, out: [...lines] }; };
  baseText = new TextDecoder().decode(base);
  const loaded = call("load_library", baseText);
  if (loaded.exit !== 0) throw new Error("the base library was refused: " + loaded.out.slice(-2).join(" "));
  kernel = { call, heapMB: () => Math.round(m.HEAPU8.length / 1048576) };
  return { kernel, startMs: Math.round(now() - t) };
}

// LexLean's proof kinds the finder covers, by the name the finder knows them by.
const KINDS = { linear_arithmetic: "linear_arithmetic", decide: "decide", reflexivity: "rfl" };

async function prove(files) {
  const timings = {};
  // 1. LexLean checks the project and gives its semantic model.
  let t = now();
  lexlean ??= await WebAssembly.compile(await admitted(seal.lexlean));
  const { exit, stdout, stderr } = runWasi(lexlean, { args: ["lexlean", "snapshot", "--all"], files: new Map(files) });
  if (exit !== 0) return { ok: false, stage: "lexlean", diagnostics: stderr || stdout };
  const snap = JSON.parse(stdout);
  timings.lexleanMs = Math.round(now() - t);
  // 2. The kernel, started on the first proof.
  const { kernel: k, startMs } = await openKernel();
  timings.kernelStartMs = startMs;
  // 3. The model as kernel declarations. A construct the lowering does not cover is refused by name.
  t = now();
  const em = emitter(loadLibrary(baseText));
  let lowered;
  try { lowered = lower(snap, em); } catch (e) { return { ok: false, stage: "lower", diagnostics: e.message }; }
  timings.lowerMs = Math.round(now() - t);
  // 4. A proof for each theorem, found here.
  t = now();
  const theorems = lowered.theorems.map((th) => ({ name: th.name, declared: [...th.axioms].sort(), proof: th.proof, found: false, why: null, axioms: null }));
  lowered.theorems.forEach((th, i) => {
    const kind = KINDS[th.proof];
    if (!kind) { theorems[i].why = `proof kind ${th.proof} is not covered by the kernel path yet`; return; }
    try { em.write(em.theorem({ name: th.name, ns: th.name.slice(0, th.name.lastIndexOf(".")), script: [{ kind }], binders: [], raw: "", text: "" })); theorems[i].found = true; }
    catch (e) { theorems[i].why = e.message; }
  });
  timings.findMs = Math.round(now() - t);
  // 5. Lean's kernel judges every lowered declaration, statement and proof, and reports each theorem's axioms.
  t = now();
  const v = k.call("check_suffix", em.lines());
  timings.judgeMs = Math.round(now() - t);
  if (v.exit !== 0) return { ok: false, stage: "kernel", diagnostics: v.out.slice(-3).join(" | "), timings };
  const got = new Map(v.out.map((l) => /^axioms (\S+): (.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].split(", ").filter(Boolean).sort()]));
  for (const th of theorems) if (th.found) th.axioms = got.get(th.name) ?? null;
  return { ok: true, theorems, declarations: lowered.declared.length, recursive: lowered.recursive.length, timings, heapMB: k.heapMB() };
}

export async function handle(data) {
  const reply = (r) => ({ id: data.id, ...r });
  try {
    if (data.op === "init") return reply(await init(data));
    if (!holo) return reply({ error: "the worker is not initialized" });
    if (data.op === "prove") return reply(await prove(data.files));
    // The verdict store, kept here so every browser can write it: names are labels' hex, read back as bytes the page
    // re-hashes before it uses them.
    if (data.op === "read") return reply({ bytes: verdicts ? await readIn(verdicts, data.name) : null });
    if (data.op === "write") { if (verdicts) await writeIn(verdicts, data.name, data.bytes); return reply({ ok: true }); }
    return reply({ error: `unknown op ${data.op}` });
  } catch (e) {
    return reply({ error: "the worker failed: " + (e && e.message ? e.message : String(e)) });
  }
}
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) self.onmessage = async ({ data }) => self.postMessage(await handle(data));
