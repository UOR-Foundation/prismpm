// What a host's WebAssembly must have to run the engine, checked before a blob is read.
//
// Why: a host without one of these cannot compile the engine, and the failure used to surface late and unclear. In a
// browser, Emscripten's loader never settled and the tab waited forever; in Node 22, V8 said only "invalid table
// elements limits flags" after 150 MB was read. Each feature is asked of the host with the smallest module that uses
// it, so the answer is the host's own validator, not a guess from its name or version.
const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

/** The features build/build-wasm.sh compiles the engine with, each with a module that uses only it. */
export const FEATURES = Object.freeze([
  // (memory i64 1): -sMEMORY64=1, so the release's .olean files load unchanged.
  { name: "64-bit memory (memory64)", wide: true, module: new Uint8Array([...HEADER, 0x05, 0x03, 0x01, 0x04, 0x01]) },
  // (table i64 1 funcref): MEMORY64 makes the function table 64-bit too. Node 22's V8 has 64-bit memory but not this.
  { name: "64-bit tables (table64)", wide: true, module: new Uint8Array([...HEADER, 0x04, 0x04, 0x01, 0x70, 0x04, 0x01]) },
  // A tag and an empty `try` block: -fwasm-exceptions, the exception handling the engine's C++ uses.
  { name: "exception handling", module: new Uint8Array([...HEADER, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x0d, 0x03, 0x01, 0x00, 0x00, 0x0a, 0x07, 0x01, 0x05, 0x00, 0x06, 0x40, 0x0b, 0x0b]) },
]);

/**
 * The names of the features `wasm` (a host's WebAssembly object) lacks for an engine of `width` bits (the manifest's
 * width; a 32-bit engine needs neither 64-bit feature). Empty when it can compile the engine.
 */
export function missingFeatures(wasm = globalThis.WebAssembly, width = 64) {
  if (!wasm || typeof wasm.validate !== "function") return ["WebAssembly"];
  const lacks = (module) => { try { return !wasm.validate(module); } catch { return true; } };
  return FEATURES.filter(({ wide, module }) => (width === 64 || !wide) && lacks(module)).map(({ name }) => name);
}

/**
 * Starts Emscripten's `factory` over the admitted `wasm` (bytes or a compiled module). Emscripten's factory never
 * settles when instantiation fails, or when the runtime aborts before it is ready, so either failure is raced against
 * it and rejects: a caller gets an answer, never a wait. Resolves to { lean, instance }.
 */
export function instantiateEngine(factory, wasm, { print = () => {}, wasmApi = globalThis.WebAssembly } = {}) {
  let fail, instance = null;
  const failed = new Promise((_, reject) => { fail = reject; });
  const started = Promise.resolve().then(() => factory({
    instantiateWasm: (imports, done) => {
      const r = wasm instanceof wasmApi.Module ? wasmApi.instantiate(wasm, imports).then((i) => ({ instance: i, module: wasm })) : wasmApi.instantiate(wasm, imports);
      r.then((x) => { instance = x.instance; done(x.instance, x.module); }, fail);
      return {};
    },
    onAbort: (what) => fail(new Error(`Lean aborted: ${what}`)),
    print, printErr: print,
  }));
  return Promise.race([started, failed]).then((lean) => ({ lean, instance }));
}

/** The refusal for a host that lacks `missing`, or null when nothing is missing. */
export const hostRefusal = (missing) => (missing.length ? `this host's WebAssembly cannot run Lean's engine: it lacks ${missing.join(", ")}` : null);
