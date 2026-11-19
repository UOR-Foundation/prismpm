// The 32-bit build: which build a host runs (InTabProver.chosenWidth), and that an engine, its library and its gate
// are of one width (BlobLabel.widthsMatch), with a 32-bit Init admitted only by declaration equality with the release.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "../gate/agree.mjs";
import { attest, gateLabel } from "../gate/attest.mjs";
import { blake3Label } from "../src/blob.mjs";
import { gateAdmits } from "../src/gate.mjs";
import { checkManifest, chooseBuild, hasMemory64, widthOf } from "../src/prover.mjs";
import { fixture } from "./helpers.mjs";

const enc = new TextEncoder();
const answer = (module, decls) => JSON.stringify({ module, elaborated: true, replayRefused: null, decls });
const d = (name, value = "2") => ({ name, kind: "theorem", type: "1", value, axioms: ["propext"] });
const corpus = load([answer("Leap.Leap", [d("Leap.a")])].join("\n"));
const initRelease = load([answer("Init.Prelude", [d("Nat"), d("Nat.add")]), answer("Init.Core", [d("Eq.refl")])].join("\n"));
const stand = { native: corpus, wasm: corpus, corpus: [["Leap.Leap", "text"]], lexleanSha256: "e3".repeat(32), defects: [{ name: "x", refused: true }] };

/** A gated build of the given width: its manifest bytes, pin and attestation. */
function build(width, { initWasm = initRelease } = {}) {
  const { manifest } = fixture();
  if (width === 32) manifest.width = 32;
  const gate = attest({ manifest, ...stand, lexleanSemantics: manifest.lexlean.semantics_id, ...(width === 32 ? { initNative: initRelease, initWasm } : {}) });
  manifest.gate = gateLabel(gate);
  const bytes = enc.encode(JSON.stringify(manifest));
  return { manifest: bytes, pin: blake3Label(bytes), gate, official: { "lib/lean/Init.olean": manifest.library[0].kappa }, parsed: manifest };
}

test("this host's 64-bit memory is detected by validating a one-memory64 module", () => {
  assert.equal(typeof hasMemory64(), "boolean");
  assert.equal(hasMemory64(), true, "Node 22 and later run memory64");
});

test("a manifest's width is 64 or 32, and one without a width is the 64-bit build", () => {
  const { manifest } = fixture();
  assert.equal(widthOf(checkManifest(manifest)), 64);
  assert.equal(widthOf(checkManifest({ ...manifest, width: 32 })), 32);
  assert.throws(() => checkManifest({ ...manifest, width: 48 }), /width is 48/);
});

test("the host runs the 64-bit build when it has 64-bit memory, else the 32-bit one, and never an ungated build", () => {
  const wide = build(64), narrow = build(32);
  assert.equal(chooseBuild([narrow, wide], { memory64: true }), wide);
  assert.equal(chooseBuild([wide, narrow], { memory64: false }), narrow);
  assert.equal(chooseBuild([wide], { memory64: false }), null, "a 64-bit build never runs without 64-bit memory");
  assert.equal(chooseBuild([narrow], { memory64: true }), narrow, "the 32-bit build runs everywhere");
  const ungated = { ...narrow, gate: { ...narrow.gate, result: "refused" } };
  assert.equal(chooseBuild([wide, ungated], { memory64: false }), null);
  const badPin = { ...wide, pin: `blake3:${"0".repeat(64)}` };
  assert.equal(chooseBuild([badPin, narrow], { memory64: true }), narrow, "a build whose pin fails is not usable");
});

test("a 32-bit gate attests that every Init declaration equals the release's, or refuses", () => {
  const narrow = build(32);
  assert.equal(narrow.gate.width, 32);
  assert.deepEqual(narrow.gate.init, { modules: 2, declarations: 3, disagreements: 0 });
  const differs = load([answer("Init.Prelude", [d("Nat"), d("Nat.add", "9")]), answer("Init.Core", [d("Eq.refl")])].join("\n"));
  assert.throws(() => build(32, { initWasm: differs }), /Init modules differ/);
  const { manifest } = fixture();
  assert.throws(() => attest({ manifest: { ...manifest, width: 32 }, ...stand, lexleanSemantics: "" }), /needs its Init compared/);
});

test("an engine never reads a library or gate of another width", () => {
  const wide = build(64), narrow = build(32);
  assert.equal(gateAdmits(narrow.parsed, narrow.gate).admitted, true);
  assert.equal(gateAdmits(wide.parsed, wide.gate).admitted, true);
  const wideGate = { ...narrow.gate };
  delete wideGate.width;
  delete wideGate.init;
  const v = gateAdmits({ ...narrow.parsed, gate: gateLabel(wideGate) }, wideGate);
  assert.equal(v.admitted, false);
  assert.match(v.why, /64-bit build, not a 32-bit one/);
  const noInit = { ...narrow.gate, init: { ...narrow.gate.init, disagreements: 1 } };
  assert.equal(gateAdmits({ ...narrow.parsed, gate: gateLabel(noInit) }, noInit).admitted, false);
});
