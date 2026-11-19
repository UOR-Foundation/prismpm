// The sealed engine worker: Lean 4.32.2's elaborator and kernel, LexLean's front end, and nothing else.
//
// Every byte it runs or reads is named by a BLAKE3 label the seal fixes (web/seal.json, checked by sealed.html):
// the manifest by the seal, then the engine, the library and LexLean by the manifest or the seal. Labels are
// computed with Hologram's BLAKE3 (WebAssembly, about 40 times faster than JavaScript here); a byte whose label
// does not match is never used.
//
// Lean is started only when the app first asks for it. Library files are kept, decoded, in the origin's private
// file system under their labels, so a later visit reads and re-hashes them but neither downloads nor decompresses.
//
//   { op: "init", hologramJs, hologramWasm, seal }            -> { ok }
//   { op: "open" }                                            -> { ok, timings, files, mb, heapMB } | { ok: false, refusal }
//   { op: "render", files }                                   -> { ok, rendered } | { ok: false, diagnostics }
//   { op: "write", path, bytes }                              -> { ok }
//   { op: "request", request }                                -> { answer, ms, heapMB, printed }
//   { op: "opened" }                                          -> { opened }
import { run as runWasi } from "../src/wasi.mjs";

const now = () => performance.now();
let holo = null, seal = null, manifest = null, lean = null, memory = null, lexlean = null; // lean: the current instance
const log = [], opened = new Set();
const heapMB = () => (memory ? Math.round(Number(memory.buffer.byteLength) / 1048576) : null);
const spent = { fetchMs: 0, decodeMs: 0, hashMs: 0, storeHits: 0, fetched: 0 };

let store = null;
async function openStore() {
  try { store = await (await navigator.storage.getDirectory()).getDirectoryHandle("lean-sealed", { create: true }); } catch { store = null; }
}
const fromStore = async (hex) => { try { return new Uint8Array(await (await (await store.getFileHandle(hex)).getFile()).arrayBuffer()); } catch { return null; } };
const toStore = async (hex, bytes) => { try { const w = await (await store.getFileHandle(hex, { create: true })).createWritable(); await w.write(bytes); await w.close(); } catch {} };

const decode = async (encoded, encoding) => (encoding !== "gzip" ? encoded
  : new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()));

/** The decoded bytes of `url`, admitted only when their BLAKE3 label is `label`. Stored decoded, re-hashed on every read. */
async function admitted(label, url, encoding) {
  const hex = label.slice(7);
  let t = now(), bytes = store ? await fromStore(hex) : null;
  spent.fetchMs += now() - t;
  if (bytes) {
    t = now(); const ok = holo.address(bytes) === label; spent.hashMs += now() - t;
    if (ok) { spent.storeHits++; return bytes; }
    try { await store.removeEntry(hex); } catch {}
  }
  t = now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const encoded = new Uint8Array(await res.arrayBuffer());
  spent.fetchMs += now() - t; t = now();
  bytes = await decode(encoded, encoding);
  spent.decodeMs += now() - t; t = now();
  const got = holo.address(bytes);
  spent.hashMs += now() - t;
  if (got !== label) throw new Error(`refused ${url}: its bytes are ${got}, not ${label}`);
  spent.fetched++;
  if (store) await toStore(hex, bytes);
  return bytes;
}

async function init({ hologramJs, hologramWasm, seal: s }) {
  holo = await import(hologramJs);
  holo.initSync({ module: hologramWasm });
  seal = s;
  await openStore();
  // The manifest is admitted by the seal's label for it; everything it names is admitted by its own labels.
  const bytes = await admitted(seal.manifest.kappa, seal.manifest.url);
  manifest = JSON.parse(new TextDecoder().decode(bytes));
  if (manifest.schema !== "lean-wasm-prover/1") throw new Error("the manifest is not lean-wasm-prover/1");
  return { ok: true, semantics: manifest.lexlean?.semantics_id ?? null, evidence: { manifest: seal.manifest.kappa, engine: manifest.engine.wasm.kappa, loader: manifest.engine.loader.kappa, lexlean: seal.lexlean.kappa, gate: manifest.gate ?? null } };
}

async function open() {
  const timings = {};
  let t = now();
  const base = seal.manifest.url.slice(0, seal.manifest.url.lastIndexOf("/"));
  const blob = (e) => admitted(e.kappa, `${base}/blobs/${e.kappa.slice(7)}`, e.encoding);
  const [glue, wasm] = await Promise.all([blob(manifest.engine.loader), blob(manifest.engine.wasm)]);
  timings.engineMs = Math.round(now() - t);
  t = now();
  const files = [], queue = [...manifest.library];
  let mb = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let e; (e = queue.shift()); ) { files.push([e.path, await blob(e)]); mb += e.bytes / 1048576; }
  }));
  timings.libraryMs = Math.round(now() - t);
  Object.assign(timings, { fetchMs: Math.round(spent.fetchMs), decodeMs: Math.round(spent.decodeMs), hashMs: Math.round(spent.hashMs), storeHits: spent.storeHits, fetched: spent.fetched });
  t = now();
  const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
  try { factory = (await import(url)).default; } finally { URL.revokeObjectURL(url); }
  compiled = await WebAssembly.compile(wasm);
  library = files;
  const r = await boot([]);
  if (!r.ok) return r;
  return { ok: true, timings: { ...timings, ...r.timings }, files: manifest.library.length, mb: Math.round(mb), heapMB: heapMB() };
}

// A fresh Lean instance over the admitted library: WebAssembly memory never shrinks, and Lean keeps one copy of the
// library per import set, so the only way to give memory back is a new instance. The old one is dropped whole.
// `out` is what earlier modules wrote under /out, which later modules import.
let factory = null, compiled = null, library = null;
async function boot(out) {
  const timings = {};
  let t = now();
  lean = null; memory = null;
  const next = await factory({
    instantiateWasm: (imports, done) => { WebAssembly.instantiate(compiled, imports).then((instance) => { memory = Object.values(instance.exports).find((x) => x instanceof WebAssembly.Memory) ?? null; done(instance, compiled); }); return {}; },
    print: (s) => log.push(s), printErr: (s) => log.push(s),
  });
  // The file system owns each admitted array instead of copying it: one copy of the library outside Lean's heap,
  // shared by every instance.
  for (const [path, bytes] of [...library, ...out]) {
    next.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    next.FS.writeFile(path, bytes, { canOwn: true });
  }
  const fsOpen = next.FS.open;
  next.FS.open = (path, ...rest) => { if (typeof path === "string") opened.add(path); return fsOpen.call(next.FS, path, ...rest); };
  next.ENV.LEAN_SYSROOT = "/lean";
  next.ENV.LEAN_PATH = "/rt";
  next.FS.mkdirTree("/src"); next.FS.mkdirTree("/out");
  timings.instantiateMs = Math.round(now() - t);
  t = now();
  if (next.ccall("elab_ready", "number", [], []) !== 0) return { ok: false, refusal: "Lean did not initialize: " + log.join(" ") };
  timings.initializeMs = Math.round(now() - t);
  lean = next;
  return { ok: true, timings };
}

const EXTS = [".olean", ".olean.server", ".olean.private", ".ir"];
const outPath = (module, ext) => `/out/${module.replaceAll(".", "/")}${ext}`;

self.onmessage = async ({ data }) => {
  const reply = (r) => self.postMessage({ id: data.id, ...r });
  try {
    if (data.op === "init") return reply(await init(data));
    if (!holo) return reply({ error: "the worker is not initialized" });
    if (data.op === "open") return reply(lean ? { ok: true, already: true, heapMB: heapMB() } : await open());
    if (data.op === "render") {
      lexlean ??= await WebAssembly.compile(await admitted(seal.lexlean.kappa, seal.lexlean.url));
      const { exit, stdout, stderr } = runWasi(lexlean, { args: ["lexlean", "lean-modules", "--all"], files: new Map(data.files) });
      return reply(exit !== 0 ? { ok: false, diagnostics: stderr || stdout } : { ok: true, rendered: JSON.parse(stdout) });
    }
    if (data.op === "runtime") return reply({ bytes: seal.runtime ? await admitted(seal.runtime.kappa, seal.runtime.url) : null });
    if (!lean) return reply({ error: "Lean is not open" });
    if (data.op === "write") {
      lean.FS.mkdirTree(data.path.slice(0, data.path.lastIndexOf("/")));
      lean.FS.writeFile(data.path, data.bytes);
      return reply({ ok: true });
    }
    if (data.op === "opened") return reply({ opened: [...opened] });
    // A module's four build files, as Lean wrote them under /out, or null if any is missing.
    if (data.op === "artifacts") {
      const files = [];
      for (const ext of EXTS) { try { files.push([outPath(data.module, ext), lean.FS.readFile(outPath(data.module, ext))]); } catch { return reply({ files: null }); } }
      return reply({ files });
    }
    // A fresh instance, with `files` (earlier modules' build files) written under /out.
    if (data.op === "reset") { const t = now(), r = await boot(data.files ?? []); return reply({ ...r, ms: Math.round(now() - t), heapMB: heapMB() }); }
    // Build files remembered from an earlier session, so later modules can import them.
    if (data.op === "place") {
      for (const [path, bytes] of data.files) { lean.FS.mkdirTree(path.slice(0, path.lastIndexOf("/"))); lean.FS.writeFile(path, bytes); }
      return reply({ ok: true });
    }
    if (data.op === "request") {
      const t = now(), from = log.length;
      const answer = JSON.parse(lean.ccall("elab_request", "string", ["string"], [JSON.stringify(data.request)]));
      return reply({ answer, ms: Math.round(now() - t), heapMB: heapMB(), printed: log.slice(from).join(" | ").slice(-4000) });
    }
    reply({ error: `unknown op ${data.op}` });
  } catch (e) {
    reply({ error: "the worker failed: " + (e && e.message ? e.message : String(e)) });
  }
};
