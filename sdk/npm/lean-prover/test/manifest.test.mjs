import assert from "node:assert/strict";
import test from "node:test";
import { checkManifest, libraryLabel, projectFiles } from "../src/prover.mjs";
import { fixture } from "./helpers.mjs";

const refused = (m, re) => assert.throws(() => checkManifest(m), (e) => e.code === "lean-prover.manifest" && re.test(e.message));

test("a manifest names Lean 4.32.2 at its commit, and every blob by BLAKE3 label", () => {
  const { manifest } = fixture();
  assert.equal(checkManifest(manifest), manifest);
  refused({ ...manifest, schema: "other" }, /not lean-wasm-prover\/1/);
  refused({ ...manifest, lean_commit: "0".repeat(40) }, /not 4\.32\.2/);
  refused({ ...manifest, engine: { ...manifest.engine, wasm: { ...manifest.engine.wasm, kappa: "sha256:00" } } }, /engine\.wasm has no BLAKE3 label/);
  refused({ ...manifest, library: [{ ...manifest.library[0], path: "/etc/passwd" }] }, /outside \/lean and \/rt/);
  refused({ ...manifest, library: [manifest.library[0], manifest.library[0]] }, /listed twice/);
  refused({ ...manifest, library: [{ ...manifest.library[0], encoding: "zstd" }] }, /not gzip or identity/);
  refused({ ...manifest, gate: "nope" }, /gate is not a BLAKE3 label/);
});

test("the library label does not depend on listing order", () => {
  const { manifest } = fixture();
  assert.equal(libraryLabel(manifest), libraryLabel({ ...manifest, library: [...manifest.library].reverse() }));
  assert.match(libraryLabel(manifest), /^blake3:[0-9a-f]{64}$/);
});

test("a project is relative paths to bytes, with a lexlean.toml", () => {
  const files = projectFiles({ "lexlean.toml": "spec = 1", "src/A.lex.tex": new Uint8Array([1]) });
  assert.equal(files.size, 2);
  assert.throws(() => projectFiles({ "../x": "a", "lexlean.toml": "" }), (e) => e.code === "lean-prover.project");
  assert.throws(() => projectFiles({ "src/A.lex.tex": "a" }), (e) => e.code === "lean-prover.project");
});
