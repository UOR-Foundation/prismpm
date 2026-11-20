// The elaborator worker: Lean 4.32.2's elaborator and kernel, one instance for the life of the tab.
//
// Why a worker: elaboration blocks for seconds, and Lean keeps its resident state (driver/Elab.lean) between
// requests. How bytes are trusted: the page gives the manifest's base URL; every file, the engine included, is fetched
// as `blobs/<hex>` and its BLAKE3 label re-derived before Lean or the browser runs a byte of it.
//
//   { op: "open", base }                          -> { op: "open", ok, timings, files, mb } | { op: "open", ok: false, refusal }
//   { op: "source", path, text }                  -> { op: "source", ok }
//   { op: "elaborate", id, module, path }         -> { id, answer, ms }, answer is the driver's JSON
// For a whole project (project.html), the same steps Node's prove takes (src/prover.mjs):
//   { op: "render", id, files: [[path, bytes]] }  -> { id, ok, rendered } | { id, ok: false, diagnostics }   LexLean's WASI build
//   { op: "write", id, path, bytes }              -> { id, ok }
//   { op: "request", id, request }                -> { id, answer, ms, heapMB }   any driver request (elaborate, check)
// Any other failure answers { id, op, error }. Nothing this worker does ends without an answer: every await in `open`
// and every request is inside the handler's try, and the engine's instantiation reports its own rejection.
import { kappa as jsKappa } from "./blake3.mjs";
import { instantiateEngine } from "./src/host.mjs";
import { run as runWasi } from "./src/wasi.mjs";

const now = () => performance.now();
let lean = null, memory = null, lexleanBytes = null, lexlean = null;
const log = []; // what Lean prints; a request that fails returns what it printed
const opened = new Set(); // every path Lean has opened
// The instance's own memory: this build exports no HEAPU8.
const heapMB = () => (memory ? Math.round(Number(memory.buffer.byteLength) / 1048576) : lean?.HEAPU8 ? Math.round(lean.HEAPU8.length / 1048576) : null);

// The hasher. Hologram's BLAKE3 in WebAssembly (web/hologram, the sealed prover's) is about 28 times faster than the
// JavaScript one, and hashing the 393 MB library was most of a cold open. It is used only after it gives the
// JavaScript label for a check input; if it does not load or disagrees, the JavaScript BLAKE3 hashes everything.
// Either way a blob is admitted only when its label is the manifest's. No hashing worker pool: a module worker
// started inside this worker never answers in some Chromium builds (the Claude desktop app's Chromium 156), and one
// thread of WebAssembly hashes faster than eight of JavaScript.
let label = jsKappa, hasher = "javascript";
async function loadHasher() {
  try {
    const holo = await import("./hologram/hologram_store.js");
    const res = await fetch(new URL("./hologram/hologram_store_bg.wasm", import.meta.url));
    if (!res.ok) return;
    holo.initSync({ module: await res.arrayBuffer() });
    const check = new TextEncoder().encode("lean-prover: the WebAssembly BLAKE3 must give the JavaScript label".repeat(40));
    if (holo.address(check) !== jsKappa(check)) return;
    label = (bytes) => holo.address(bytes);
    hasher = "webassembly";
  } catch { /* the JavaScript BLAKE3 stays */ }
}

// The tab's own store: decoded blobs named by BLAKE3 label in the origin's private file system (OPFS), so a second visit
// reads them from disk instead of the network and does not decompress them. The same folder as the sealed prover's,
// which stores the same bytes under the same names. A stored blob is trusted no more than a fetched one: its BLAKE3
// label is re-derived on every read, and a mismatch is a miss.
const spent = { fetchMs: 0, decodeMs: 0, hashMs: 0, storeHits: 0, storeMisses: 0 };
let store = null;
async function openStore() {
  try {
    const root = await navigator.storage.getDirectory();
    store = await root.getDirectoryHandle("lean-sealed", { create: true });
    root.removeEntry("lean-blobs", { recursive: true }).catch(() => {}); // the gzip blobs earlier versions stored
  } catch { store = null; }
}
async function fromStore(hex) {
  if (!store) return null;
  try { return new Uint8Array(await (await (await store.getFileHandle(hex)).getFile()).arrayBuffer()); } catch { return null; }
}
const writes = [];
function toStore(hex, bytes) {
  if (!store) return;
  // Not awaited: Lean does not wait for the disk. The bytes are only read here.
  writes.push((async () => { try { const w = await (await store.getFileHandle(hex, { create: true })).createWritable(); await w.write(bytes); await w.close(); } catch {} })());
}

// Blobs are served as gzip, named by the BLAKE3 label of their decoded bytes (spec/src/BlobLabel.lex.tex): a blob is
// admitted only when it decodes and that label matches; otherwise it is a miss, and a miss refetches once.
async function decode(encoded, encoding) {
  if (encoding !== "gzip") return encoded;
  return new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

const hashed = (bytes) => { const t = now(); const k = label(bytes); spent.hashMs += now() - t; return k; };

async function fetchChecked(base, entry) {
  const hex = entry.kappa.slice(7), name = entry.path ?? entry.kappa;
  let t = now();
  const stored = await fromStore(hex);
  spent.fetchMs += now() - t;
  if (stored && stored.length === entry.bytes && hashed(stored) === entry.kappa) { spent.storeHits++; return stored; }
  if (stored) { try { await store.removeEntry(hex); } catch {} }
  let why = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    t = now();
    let encoded;
    try {
      const res = await fetch(`${base}/blobs/${hex}`, attempt ? { cache: "reload" } : {});
      if (!res.ok) { why = `is missing (HTTP ${res.status})`; continue; }
      encoded = new Uint8Array(await res.arrayBuffer());
    } catch (e) { why = `could not be fetched (${e?.message ?? e})`; continue; } finally { spent.fetchMs += now() - t; }
    t = now();
    let bytes = null;
    try { bytes = await decode(encoded, entry.encoding); } catch { bytes = null; }
    spent.decodeMs += now() - t;
    if (!bytes) { why = `does not decode as ${entry.encoding}`; continue; }
    if (bytes.length !== entry.bytes || hashed(bytes) !== entry.kappa) { why = "decodes to bytes without its BLAKE3 label"; continue; }
    spent.storeMisses++;
    toStore(hex, bytes);
    return bytes;
  }
  throw new Error(`${name} (${entry.kappa}) ${why}`);
}

// lexleanUrl: a LexLean WASI build to use instead of the manifest's, for trying one that is not released yet. It is not
// pinned by anything; its label is reported so the page can say exactly which bytes rendered the project.
async function open(base, lexleanUrl) {
  const timings = {};
  let t = now();
  await Promise.all([openStore(), loadHasher()]);
  timings.hasher = hasher;
  timings.hasherMs = Math.round(now() - t);
  t = now();
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) return { ok: false, refusal: `the manifest could not be fetched (HTTP ${res.status})` };
  const manifest = await res.json();
  if (manifest.schema !== "lean-wasm-prover/1") return { ok: false, refusal: `the manifest is not lean-wasm-prover/1` };
  const [glue, wasm] = await Promise.all([fetchChecked(base, manifest.engine.loader), fetchChecked(base, manifest.engine.wasm)]);
  let lexleanLabel = manifest.lexlean?.wasm?.kappa ?? null, lexleanPinned = true;
  if (lexleanUrl) {
    const r = await fetch(lexleanUrl);
    if (!r.ok) return { ok: false, refusal: `the LexLean build ${lexleanUrl} could not be fetched (HTTP ${r.status})` };
    lexleanBytes = new Uint8Array(await r.arrayBuffer()); lexleanLabel = label(lexleanBytes); lexleanPinned = false;
  } else lexleanBytes = manifest.lexlean?.wasm ? await fetchChecked(base, manifest.lexlean.wasm) : null;
  timings.engineMs = Math.round(now() - t);
  t = now();
  // Every library file, fetched in parallel and checked by BLAKE3 label, then written where Lean's search path looks.
  const files = [];
  const queue = [...manifest.library];
  let mb = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let e; (e = queue.shift()); ) { files.push([e.path, await fetchChecked(base, e)]); mb += e.bytes / 1048576; }
  }));
  timings.libraryMs = Math.round(now() - t);
  // Summed over the parallel fetches, so they can exceed the wall time; they show which part dominates.
  Object.assign(timings, { fetchMs: Math.round(spent.fetchMs), decodeMs: Math.round(spent.decodeMs), hashMs: Math.round(spent.hashMs), storeHits: spent.storeHits, storeMisses: spent.storeMisses });
  t = now();
  const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
  let factory;
  try { factory = (await import(url)).default; } finally { URL.revokeObjectURL(url); }
  log.length = 0;
  // A browser that cannot instantiate the engine (memory limits, say) gets a refusal, not a page that waits forever.
  try {
    const started = await instantiateEngine(factory, wasm, { print: (s) => log.push(s) });
    lean = started.lean;
    memory = Object.values(started.instance.exports).find((x) => x instanceof WebAssembly.Memory) ?? null;
  } catch (e) {
    return { ok: false, refusal: `this browser cannot run Lean's engine: ${e?.message ?? e}` };
  }
  // The file system owns each admitted array instead of copying it: the library is not held twice.
  for (const [path, bytes] of files) {
    lean.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    lean.FS.writeFile(path, bytes, { canOwn: true });
  }
  // Every library file Lean opens, for `{ op: "opened" }`: what a project actually reads, against what was loaded.
  const fsOpen = lean.FS.open;
  lean.FS.open = (path, ...rest) => { if (typeof path === "string") opened.add(path); return fsOpen.call(lean.FS, path, ...rest); };
  lean.ENV.LEAN_SYSROOT = "/lean";
  lean.ENV.LEAN_PATH = "/rt";
  lean.FS.mkdirTree("/src"); lean.FS.mkdirTree("/out");
  timings.instantiateMs = Math.round(now() - t);
  t = now();
  if (lean.ccall("elab_ready", "number", [], []) !== 0) { lean = null; return { ok: false, refusal: "Lean did not initialize: " + log.join(" ") }; }
  timings.initializeMs = Math.round(now() - t);
  return { ok: true, timings, files: files.length, mb: Math.round(mb), heapMB: heapMB(), semantics: manifest.lexlean?.semantics_id ?? null,
    evidence: { engine: manifest.engine.wasm.kappa, loader: manifest.engine.loader.kappa, lexlean: lexleanLabel, lexleanPinned, gate: manifest.gate ?? null } };
}

const failure = (e) => (e && e.message ? e.message : String(e));

self.onmessage = async ({ data }) => {
  if (data.op === "open") {
    let r;
    try { r = await open(data.base, data.lexlean); } catch (e) { r = { ok: false, refusal: failure(e) }; }
    return self.postMessage({ op: "open", ...r });
  }
  try {
    if (!lean) return self.postMessage({ id: data.id, op: data.op, error: "the worker is not open" });
    if (data.op === "source") { lean.FS.writeFile(data.path, data.text); return self.postMessage({ op: "source", ok: true }); }
    if (data.op === "render") {
      if (!lexleanBytes) return self.postMessage({ id: data.id, ok: false, diagnostics: "the manifest names no LexLean build" });
      lexlean ??= await WebAssembly.compile(lexleanBytes);
      const { exit, stdout, stderr } = runWasi(lexlean, { args: ["lexlean", "lean-modules", "--all"], files: new Map(data.files) });
      if (exit !== 0) return self.postMessage({ id: data.id, ok: false, diagnostics: stderr || stdout || `LexLean exited with ${exit}` });
      return self.postMessage({ id: data.id, ok: true, rendered: JSON.parse(stdout) });
    }
    if (data.op === "write") {
      lean.FS.mkdirTree(data.path.slice(0, data.path.lastIndexOf("/")));
      lean.FS.writeFile(data.path, data.bytes);
      return self.postMessage({ id: data.id, ok: true });
    }
    if (data.op === "opened") return self.postMessage({ id: data.id, opened: [...opened] });
    if (data.op === "request") {
      const t = now();
      const from = log.length;
      const answer = JSON.parse(lean.ccall("elab_request", "string", ["string"], [JSON.stringify(data.request)]));
      return self.postMessage({ id: data.id, answer, ms: Math.round(now() - t), heapMB: heapMB(), printed: log.slice(from).join(" | ").slice(-4000) });
    }
    if (data.op === "elaborate") {
      const t = now();
      const req = JSON.stringify({ op: "elaborate", outDir: "/out", module: data.module, path: data.path });
      const answer = JSON.parse(lean.ccall("elab_request", "string", ["string"], [req]));
      return self.postMessage({ id: data.id, answer, ms: Math.round(now() - t), heapMB: heapMB() });
    }
    return self.postMessage({ id: data.id, op: data.op, error: `unknown op ${data.op}` });
  } catch (e) {
    self.postMessage({ id: data.id, op: data.op, error: "the worker failed: " + failure(e) });
  }
};
