// The engine's thread: Lean 4.32.2's elaborator and kernel (build/build-wasm.sh), one instance for the life of the
// prover. It runs in a worker thread so it can have a deep native stack, which proof-heavy elaboration needs.
// It receives only bytes the main thread admitted by BLAKE3 label, and has no file or network access: Lean's file
// system is Emscripten's in-memory one, filled from those bytes.
//
//   { op: "open", loader, wasm, files: [[path, bytes]] }  -> { ok } | { ok: false, refusal }
//   { op: "write", path, bytes }                          -> { ok }
//   { op: "read", path }                                  -> { bytes } | { bytes: null }
//   { op: "request", request }                            -> { answer }   the driver's JSON (`serve` in driver/Elab.lean)
//   { op: "heap" }                                        -> { heapBytes }  the engine's memory, which never shrinks
import { parentPort } from "node:worker_threads";

let lean = null;
let memory = null; // the instance's own memory: Emscripten does not export HEAPU8 from this build

async function open({ loader, wasm, files }) {
  const url = "data:text/javascript;base64," + Buffer.from(loader).toString("base64");
  const factory = (await import(url)).default;
  const log = [];
  lean = await factory({
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((r) => { memory = Object.values(r.instance.exports).find((x) => x instanceof WebAssembly.Memory); done(r.instance, r.module); });
      return {};
    },
    print: (s) => log.push(s),
    printErr: (s) => log.push(s),
  });
  for (const [path, bytes] of files) {
    lean.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    lean.FS.writeFile(path, bytes);
  }
  lean.ENV.LEAN_SYSROOT = "/lean";
  lean.ENV.LEAN_PATH = "/rt";
  lean.FS.mkdirTree("/src");
  lean.FS.mkdirTree("/out");
  if (lean.ccall("elab_ready", "number", [], []) !== 0) return { ok: false, refusal: "Lean did not initialize: " + log.join(" ") };
  return { ok: true };
}

parentPort.on("message", async ({ id, ...data }) => {
  try {
    let reply;
    if (data.op === "open") reply = await open(data);
    else if (!lean) reply = { error: "the engine is not open" };
    else if (data.op === "write") {
      lean.FS.mkdirTree(data.path.slice(0, data.path.lastIndexOf("/")));
      lean.FS.writeFile(data.path, data.bytes);
      reply = { ok: true };
    } else if (data.op === "read") {
      let bytes = null;
      try { bytes = lean.FS.readFile(data.path); } catch { bytes = null; }
      reply = { bytes };
    } else if (data.op === "request") {
      reply = { answer: JSON.parse(lean.ccall("elab_request", "string", ["string"], [JSON.stringify(data.request)])) };
    } else if (data.op === "heap") reply = { heapBytes: Number(memory.buffer.byteLength) };
    else reply = { error: `unknown op ${data.op}` };
    parentPort.postMessage({ id, ...reply });
  } catch (e) {
    parentPort.postMessage({ id, error: "the engine failed: " + (e && e.message ? e.message : String(e)) });
  }
});
