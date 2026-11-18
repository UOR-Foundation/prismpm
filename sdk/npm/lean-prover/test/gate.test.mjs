import assert from "node:assert/strict";
import test from "node:test";
import { agree, load } from "../gate/agree.mjs";
import { attest, gateLabel } from "../gate/attest.mjs";
import { gateAdmits } from "../src/gate.mjs";
import { fixture } from "./helpers.mjs";

const answer = (module, decls, extra = {}) => JSON.stringify({ module, elaborated: true, replayRefused: null, decls, ...extra });
const d = (name, type = "1", axioms = ["propext"]) => ({ name, kind: "theorem", type, value: "2", axioms });
const corpusAnswers = (leap = [d("Leap.a"), d("Leap.b")], extra = {}) =>
  load([answer("Leap.Leap", leap, extra), answer("FoldLaws.Main", [d("FoldLaws.c")])].join("\n"));
const native = corpusAnswers();

test("native and the engine agree declaration by declaration: kind, type, value and axioms", () => {
  assert.equal(agree(native, native).disagreements, 0);
  assert.equal(agree(native, native).declarations, 3);
  assert.equal(agree(native, corpusAnswers([d("Leap.a", "9"), d("Leap.b")])).disagreements, 1, "a changed type hash");
  assert.equal(agree(native, corpusAnswers([d("Leap.a", "1", []), d("Leap.b")])).disagreements, 1, "changed axioms");
  assert.equal(agree(native, load(answer("Leap.Leap", [d("Leap.a"), d("Leap.b")]))).disagreements, 1, "a missing module");
  const refused = corpusAnswers(undefined, { replayRefused: "(kernel) declaration type mismatch" });
  assert.equal(agree(native, refused).disagreements, 1, "a verdict the engine alone gives");
});

const corpus = [["Leap.Leap", "text"], ["FoldLaws.Main", "text"]];
const defects = [{ name: "changed-olean-byte", refused: true }];
const attestFor = (manifest, over = {}) =>
  attest({ manifest, native, wasm: native, corpus, lexleanSha256: "e3".repeat(32), lexleanSemantics: manifest.lexlean.semantics_id, defects, ...over });

test("the gate attests only full agreement with every planted defect refused, naming engine, library, LexLean and corpus", () => {
  const { manifest } = fixture();
  const a = attestFor(manifest);
  assert.equal(a.result, "admitted");
  assert.equal(a.engine.wasm, manifest.engine.wasm.kappa);
  assert.match(a.library, /^blake3:/);
  assert.match(a.corpus, /^blake3:/);
  assert.equal(a.lexlean.wasm, manifest.lexlean.wasm.kappa);
  assert.throws(() => attestFor(manifest, { wasm: corpusAnswers([d("Leap.a", "9"), d("Leap.b")]) }), /disagree/);
  assert.throws(() => attestFor(manifest, { defects: [{ name: "x", refused: false }] }), /not refused: x/);
  assert.throws(() => attestFor(manifest, { defects: [] }), /not refused/);
});

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
