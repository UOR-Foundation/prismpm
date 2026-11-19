import assert from "node:assert/strict";
import test from "node:test";
import { load } from "../gate/agree.mjs";
import { attest, gateLabel } from "../gate/attest.mjs";
import { gateAdmits } from "../src/gate.mjs";
import { checkAdmission } from "../src/prover.mjs";
import { fixture } from "./helpers.mjs";

const d = (name) => ({ name, kind: "theorem", type: "1", value: "2", axioms: ["propext"] });
const native = load(JSON.stringify({ module: "Leap.Leap", elaborated: true, replayRefused: null, decls: [d("Leap.a")] }));
const attestFor = (manifest) =>
  attest({ manifest, native, wasm: native, corpus: [["Leap.Leap", "text"]], lexleanSha256: "e3".repeat(32), lexleanSemantics: manifest.lexlean.semantics_id, defects: [{ name: "x", refused: true }] });
const officialOf = (manifest) => Object.fromEntries(manifest.library.filter((e) => e.path.startsWith("/lean/")).map((e) => [e.path.slice(6), e.kappa]));

test("a manifest is admitted only by the gate that admitted its own engine, library and LexLean", () => {
  const { manifest } = fixture();
  const a = attestFor(manifest);
  assert.deepEqual(gateAdmits({ ...manifest, gate: gateLabel(a) }, a), { admitted: true });
  assert.equal(gateAdmits(manifest, a).admitted, false, "no gate named");
  const other = structuredClone(manifest);
  other.engine.wasm.kappa = `blake3:${"0".repeat(64)}`;
  assert.match(gateAdmits({ ...other, gate: gateLabel(a) }, a).why, /another engine/);
  const lib = structuredClone(manifest);
  lib.library[0].kappa = `blake3:${"1".repeat(64)}`;
  assert.match(gateAdmits({ ...lib, gate: gateLabel(a) }, a).why, /another library/);
  assert.match(gateAdmits({ ...manifest, gate: `blake3:${"2".repeat(64)}` }, a).why, /not the one the manifest names/);
});

test("prove refuses an engine its gate attestation does not name with lean-prover.engine-ungated", () => {
  const { manifest } = fixture();
  const a = attestFor(manifest);
  const official = officialOf(manifest);
  assert.doesNotThrow(() => checkAdmission({ ...manifest, gate: gateLabel(a) }, { gate: a, official }));
  const other = structuredClone(manifest);
  other.engine.wasm.kappa = `blake3:${"0".repeat(64)}`;
  assert.throws(() => checkAdmission({ ...other, gate: gateLabel(a) }, { gate: a, official }), (e) => e.code === "lean-prover.engine-ungated");
  assert.throws(() => checkAdmission(manifest, { gate: a, official }), (e) => e.code === "lean-prover.engine-ungated");
});
