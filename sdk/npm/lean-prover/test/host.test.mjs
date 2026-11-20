import assert from "node:assert/strict";
import test from "node:test";
import { openEngine } from "../src/prover.mjs";
import { FEATURES, hostRefusal, instantiateEngine, missingFeatures } from "../src/host.mjs";
import { fixture } from "./helpers.mjs";

// A WebAssembly object that validates everything except the modules for `lacking`.
const hostLacking = (...lacking) => ({ validate: (bytes) => !FEATURES.some((f) => lacking.includes(f.name) && f.module === bytes) });

test("a host is asked for each feature the engine is built with, and told exactly what it lacks", () => {
  assert.deepEqual(missingFeatures(hostLacking()), []);
  assert.deepEqual(missingFeatures(hostLacking("64-bit tables (table64)")), ["64-bit tables (table64)"], "Node 22: 64-bit memory but not tables");
  assert.deepEqual(missingFeatures(hostLacking("64-bit memory (memory64)", "64-bit tables (table64)")), ["64-bit memory (memory64)", "64-bit tables (table64)"], "a WebKit build without memory64");
  assert.deepEqual(missingFeatures(hostLacking("64-bit memory (memory64)", "64-bit tables (table64)"), 32), [], "a 32-bit engine needs neither");
  assert.deepEqual(missingFeatures(null), ["WebAssembly"], "a host with no WebAssembly");
  assert.deepEqual(missingFeatures({ validate: () => { throw new Error("no"); } }), FEATURES.map((f) => f.name));
  assert.equal(hostRefusal([]), null);
  assert.match(hostRefusal(["64-bit tables (table64)"]), /lacks 64-bit tables \(table64\)/);
});

test("each feature probe is a module this host's own validator judges, and a full feature set validates it", () => {
  // Every probe parses as WebAssembly: a host that has the feature validates it. Node 24 has all three; Node 22
  // lacks table64 only, which is why it cannot compile the engine.
  const missing = missingFeatures();
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 24) assert.deepEqual(missing, []);
  else assert.deepEqual(missing, ["64-bit tables (table64)"]);
});

test("openEngine refuses a host that cannot compile the engine before it reads a single blob", async () => {
  const { manifest } = fixture();
  const read = [];
  await assert.rejects(
    openEngine({ manifest, read: (label) => { read.push(label); return null; }, webAssembly: hostLacking("64-bit tables (table64)") }),
    (e) => e.code === "lean-prover.host-unsupported" && /table64/.test(e.message),
  );
  assert.deepEqual(read, []);
});

// Emscripten's factory as it behaves: it settles only when instantiateWasm calls back; a failed instantiation, or an
// abort before the runtime is ready, leaves it pending forever.
const emscriptenLike = (Module) => new Promise((resolve) => { Module.instantiateWasm({}, (instance) => resolve({ ready: true, instance })); });
const within = (p, ms = 5000) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms: a hang`)), ms))]);

test("an engine that cannot be instantiated is a refusal, not a factory that never settles", async () => {
  const notWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xff]);
  await within(assert.rejects(instantiateEngine(emscriptenLike, notWasm), WebAssembly.CompileError));
  const aborting = (Module) => { Module.onAbort("out of memory"); return new Promise(() => {}); };
  await within(assert.rejects(instantiateEngine(aborting, new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])), /Lean aborted: out of memory/));
  const throwing = () => { throw new Error("loader threw"); };
  await within(assert.rejects(instantiateEngine(throwing, new Uint8Array()), /loader threw/));
});

test("an engine that instantiates resolves with the runtime and its instance, from bytes or a compiled module", async () => {
  const empty = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const fromBytes = await within(instantiateEngine(emscriptenLike, empty));
  assert.equal(fromBytes.lean.ready, true);
  assert.ok(fromBytes.instance instanceof WebAssembly.Instance);
  const fromModule = await within(instantiateEngine(emscriptenLike, await WebAssembly.compile(empty)));
  assert.ok(fromModule.instance instanceof WebAssembly.Instance);
});
