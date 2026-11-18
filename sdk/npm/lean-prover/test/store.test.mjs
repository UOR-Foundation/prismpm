import assert from "node:assert/strict";
import test from "node:test";
import { cachedCheck, storeResult } from "../src/store.mjs";
import { kappa } from "../src/vendor/blake3.mjs";
import { enc } from "./helpers.mjs";

// A stand-in engine: an in-memory file system and the driver's requests.
function fakeEngine({ checkAccepts = true } = {}) {
  const fs = new Map();
  const asked = [];
  return {
    fs,
    asked,
    async call(m) {
      if (m.op === "write") { fs.set(m.path, m.bytes); return { ok: true }; }
      if (m.op === "read") return { bytes: fs.get(m.path) ?? null };
      asked.push(m.request.op);
      return { answer: { module: m.request.module, elaborated: true, replayRefused: checkAccepts ? null : "(kernel) type mismatch", imports: ["Init"], decls: [] } };
    },
  };
}
const memoryStore = () => { const m = new Map(); return { m, get: (k) => m.get(k) ?? null, put: (k, v) => void m.set(k, v) }; };
const evidence = { engine: kappa(enc.encode("engine")), library: kappa(enc.encode("library")) };
const text = enc.encode("module text");
const EXTS = [".olean", ".olean.server", ".olean.private", ".ir"];
const built = () => { const e = fakeEngine(); for (const ext of EXTS) e.fs.set(`/out/Leap/Leap${ext}`, enc.encode(ext)); return e; };
const stored = async () => {
  const store = memoryStore();
  await storeResult({ engine: built(), store, evidence, module: "Leap.Leap", text, answer: { elaborated: true, replayRefused: null } });
  return store;
};

test("a stored module result is reused only after its blobs are relabelled and the kernel checks it again", async () => {
  const store = await stored();
  assert.equal(store.m.size, 6, "recipe, result and four artifact blobs");
  const second = fakeEngine();
  const hit = await cachedCheck({ engine: second, store, evidence, module: "Leap.Leap", text });
  assert.equal(hit.elaborated, true);
  assert.deepEqual(second.asked, ["check"]);
  assert.equal(await cachedCheck({ engine: fakeEngine(), store, evidence, module: "Leap.Leap", text: enc.encode("edited") }), null, "another source");
  const otherEngine = { ...evidence, engine: kappa(enc.encode("other")) };
  assert.equal(await cachedCheck({ engine: fakeEngine(), store, evidence: otherEngine, module: "Leap.Leap", text }), null, "another engine");
});

test("a stored blob with a changed byte, or a result the kernel refuses on read, is a miss", async () => {
  const store = await stored();
  assert.equal(await cachedCheck({ engine: fakeEngine({ checkAccepts: false }), store, evidence, module: "Leap.Leap", text }), null);
  const label = kappa(enc.encode(".olean"));
  const bytes = store.m.get(label).slice();
  bytes[0] ^= 1;
  store.m.set(label, bytes);
  assert.equal(await cachedCheck({ engine: fakeEngine(), store, evidence, module: "Leap.Leap", text }), null);
});
