import assert from "node:assert/strict";
import test from "node:test";
import { gateLabel } from "../gate/attest.mjs";
import { libraryLabel, unofficialInit } from "../src/library.mjs";
import { checkAdmission } from "../src/prover.mjs";
import { fixture } from "./helpers.mjs";

const officialOf = (manifest) => Object.fromEntries(manifest.library.filter((e) => e.path.startsWith("/lean/")).map((e) => [e.path.slice(6), e.kappa]));

test("the library's Init files must each have the official release's BLAKE3 label", () => {
  const { manifest } = fixture();
  const official = officialOf(manifest);
  assert.deepEqual(unofficialInit(manifest, official), []);
  const changed = structuredClone(manifest);
  changed.library[0].kappa = `blake3:${"4".repeat(64)}`;
  assert.deepEqual(unofficialInit(changed, official), ["/lean/lib/lean/Init.olean"]);
  assert.deepEqual(unofficialInit(manifest, {}), ["/lean/lib/lean/Init.olean"], "an Init file the release does not have");
});

test("prove refuses a library with an unofficial Init file with lean-prover.library-unofficial", () => {
  const { manifest } = fixture();
  const changed = structuredClone(manifest);
  changed.library[0].kappa = `blake3:${"4".repeat(64)}`;
  const attestation = {
    schema: "lean-prover/gate/1",
    result: "admitted",
    engine: { wasm: changed.engine.wasm.kappa, loader: changed.engine.loader.kappa },
    library: libraryLabel(changed),
    lexlean: { wasm: changed.lexlean.wasm.kappa },
  };
  changed.gate = gateLabel(attestation);
  assert.throws(() => checkAdmission(changed, { gate: attestation, official: officialOf(manifest) }), (e) => e.code === "lean-prover.library-unofficial");
  assert.doesNotThrow(() => checkAdmission(changed, { gate: attestation, official: officialOf(changed) }));
});
