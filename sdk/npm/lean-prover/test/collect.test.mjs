import assert from "node:assert/strict";
import test from "node:test";
import { collect, namedBy } from "../src/collect.mjs";
import { fixture } from "./helpers.mjs";

test("blob collection keeps exactly the blobs a pinned manifest names", () => {
  const { manifest } = fixture();
  const stray = `blake3:${"5".repeat(64)}`;
  const store = [...namedBy(manifest), stray];
  assert.deepEqual(collect(store, [manifest]), { keep: namedBy(manifest), remove: [stray] });
  assert.deepEqual(collect(store, []).keep, [], "no pinned manifest keeps nothing");
  const older = structuredClone(manifest);
  older.engine.wasm.kappa = stray;
  assert.deepEqual(collect(store, [manifest, older]).remove, [], "a blob any pinned manifest names is kept");
});
