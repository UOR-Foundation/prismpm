import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { load } from "../gate/agree.mjs";
import { attest } from "../gate/attest.mjs";
import { readAdmitted } from "../src/blob.mjs";
import { openInstalled } from "../src/installed.mjs";
import { checkNpmSection, entriesOf, libraryName, npmRead, planShards, SHARD_SCOPE, shardsFor } from "../src/npm.mjs";
import { kappa } from "../src/vendor/blake3.mjs";
import { fixture } from "./helpers.mjs";

const script = fileURLToPath(new URL("../scripts/make-npm-packages.mjs", import.meta.url));

/** A manifest folder on disk, its npm packages, and those packages installed into a node_modules. */
function installed(cap) {
  const { manifest, blobs } = fixture();
  const root = mkdtempSync(join(tmpdir(), "lean-npm-"));
  mkdirSync(join(root, "lib", "blobs"), { recursive: true });
  writeFileSync(join(root, "lib", "manifest.json"), JSON.stringify(manifest));
  for (const [label, gz] of blobs) writeFileSync(join(root, "lib", "blobs", label.slice(7)), gz);
  execFileSync(process.execPath, [script, join(root, "lib"), join(root, "out"), ...(cap ? ["--cap", String(cap)] : [])]);
  const summary = JSON.parse(readFileSync(join(root, "out", "npm-packages.json"), "utf8"));
  const carried = JSON.parse(readFileSync(join(root, "out", "library", "manifest.json"), "utf8"));
  const modules = join(root, "node_modules");
  for (const s of carried.npm.shards) cpSync(join(root, "out", "shards", s.label.slice(7)), join(modules, s.name), { recursive: true });
  const resolve = (spec) => join(modules, spec);
  return { root, summary, carried, manifestBytes: readFileSync(join(root, "out", "library", "manifest.json")), resolve, modules };
}

test("every blob is read from an npm shard and admitted by the BLAKE3 label of its bytes", async () => {
  const { summary, carried, manifestBytes, resolve } = installed();
  assert.equal(summary.library, libraryName(kappa(manifestBytes)), "the library package is named by its manifest's label");
  const read = npmRead(carried, { resolve });
  for (const e of entriesOf(carried)) assert.ok(await readAdmitted(read, e, e.path ?? e.kappa));
  const pkg = JSON.parse(readFileSync(join(installed().root, "out", "library", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), carried.npm.shards.map((s) => s.name).sort());
  assert.ok(Object.values(pkg.dependencies).every((v) => v === "1.0.0"), "each shard at exactly one version");
  for (const s of carried.npm.shards) {
    const shardPkg = JSON.parse(readFileSync(resolve(`${s.name}/package.json`), "utf8"));
    assert.equal(shardPkg.prismLeanShard.label, s.label, "a shard's package.json names its label");
    assert.deepEqual(shardPkg.prismLeanShard.blobs.map((b) => b.kappa), s.blobs, "and each blob's label, sorted");
    for (const b of shardPkg.prismLeanShard.blobs) {
      const gz = readFileSync(resolve(`${s.name}/${b.file}`));
      assert.equal(kappa(gunzipSync(gz)), b.kappa, "each blob is gzip, labelled by its decoded bytes");
      assert.equal(gz.length, b.encodedBytes);
    }
  }
  const fetched = shardsFor(carried);
  assert.deepEqual(fetched.map((s) => [s.name, s.version, s.blobs.length]), carried.npm.shards.map((s) => [s.name, "1.0.0", s.blobs.length]));
});

test("a changed byte in an installed shard, or a missing shard, is refused", async () => {
  const { carried, resolve, modules } = installed();
  const e = carried.library[0];
  const shard = carried.npm.shards.find((s) => s.blobs.includes(e.kappa));
  const file = join(modules, shard.name, "b", `${e.kappa.slice(7)}.gz`);
  const bytes = gunzipSync(readFileSync(file)); bytes[0] ^= 1; writeFileSync(file, gzipSync(bytes));
  await assert.rejects(readAdmitted(npmRead(carried, { resolve }), e, e.path), (err) => err.code === "lean-prover.blob-kappa");
  const none = npmRead(carried, { resolve: (spec) => join(modules, "absent", spec) });
  await assert.rejects(readAdmitted(none, carried.engine.wasm, "engine.wasm"), (err) => err.code === "lean-prover.blob-missing");
});

test("shards keep under their cap, and each is named by the label of its listing", () => {
  const { manifest } = fixture();
  const one = planShards(manifest);
  assert.equal(one.length, 1);
  const tight = planShards(manifest, 1);
  assert.equal(tight.length, entriesOf(manifest).length, "a cap smaller than any blob gives one blob per shard");
  for (const s of tight) assert.ok(s.name.startsWith(SHARD_SCOPE) && s.name.endsWith(s.label.slice(7)));
  const { carried } = installed(1);
  assert.equal(carried.npm.shards.length, entriesOf(manifest).length);
});

/** The packages with the gate's attestation and the official Init listing, as the gate packs them. */
function installedWithGate() {
  const { manifest, blobs } = fixture();
  const root = mkdtempSync(join(tmpdir(), "lean-npm-gate-"));
  mkdirSync(join(root, "lib", "blobs"), { recursive: true });
  writeFileSync(join(root, "lib", "manifest.json"), JSON.stringify(manifest));
  for (const [label, gz] of blobs) writeFileSync(join(root, "lib", "blobs", label.slice(7)), gz);
  const native = load(JSON.stringify({ module: "Leap.Leap", elaborated: true, replayRefused: null, decls: [{ name: "Leap.a", kind: "theorem", type: "1", value: "2", axioms: [] }] }));
  const attestation = attest({ manifest, native, wasm: native, corpus: [["Leap.Leap", "t"]], lexleanSha256: "e3".repeat(32), lexleanSemantics: manifest.lexlean.semantics_id, defects: [{ name: "x", refused: true }] });
  writeFileSync(join(root, "gate.json"), JSON.stringify(attestation));
  writeFileSync(join(root, "official.json"), JSON.stringify(Object.fromEntries(manifest.library.filter((e) => e.path.startsWith("/lean/")).map((e) => [e.path.slice(6), e.kappa]))));
  execFileSync(process.execPath, [script, join(root, "lib"), join(root, "out"), "--gate", join(root, "gate.json"), "--official", join(root, "official.json")]);
  const summary = JSON.parse(readFileSync(join(root, "out", "npm-packages.json"), "utf8"));
  const carried = JSON.parse(readFileSync(join(root, "out", "library", "manifest.json"), "utf8"));
  const modules = join(root, "node_modules");
  cpSync(join(root, "out", "library"), join(modules, summary.library), { recursive: true });
  for (const s of carried.npm.shards) cpSync(join(root, "out", "shards", s.label.slice(7)), join(modules, s.name), { recursive: true });
  return { pin: summary.manifest, resolve: (spec) => join(modules, spec) };
}

test("openInstalled needs only the pinned label: it admits the manifest, its gate, the official Init and every blob from npm", async () => {
  const { pin, resolve } = installedWithGate();
  // A host with every feature the engine needs, so this runs on Node 22 too.
  const webAssembly = { validate: () => true };
  // The stand-in engine is not WebAssembly, so the run ends at engine start, after every check before it passed.
  await assert.rejects(openInstalled({ pin, resolve, webAssembly }), (e) => e.code === "lean-prover.engine-trap");
  await assert.rejects(openInstalled({ pin: `blake3:${"6".repeat(64)}`, resolve, webAssembly }), (e) => e.code !== "lean-prover.engine-trap", "another pin names no installed package");
});

test("an installed library whose manifest is not the pinned one is refused", async () => {
  const { pin, resolve } = installedWithGate();
  const file = join(resolve(`${libraryName(pin)}/package.json`), "..", "manifest.json");
  writeFileSync(file, readFileSync(file, "utf8") + " ");
  await assert.rejects(openInstalled({ pin, resolve }), (e) => e.code === "lean-prover.manifest-unpinned");
});

test("an npm section whose shard is misnamed, or that leaves a blob out, is refused", () => {
  const { carried } = installed();
  assert.equal(checkNpmSection(carried).size, entriesOf(carried).length);
  const misnamed = structuredClone(carried);
  misnamed.npm.shards[0].name = `${SHARD_SCOPE}${"0".repeat(64)}`;
  assert.throws(() => checkNpmSection(misnamed), (e) => e.code === "lean-prover.manifest-unpinned");
  const short = structuredClone(carried);
  short.npm.shards[0].blobs.pop();
  assert.throws(() => checkNpmSection(short), (e) => e.code === "lean-prover.manifest-unpinned");
});
