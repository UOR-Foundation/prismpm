// The gate's planted defects. Each must be refused, or the gate admits nothing (gate/attest.mjs).
//   node gate/defects.mjs --manifest DIR --native native.jsonl --wasm wasm.jsonl --elab NATIVE_ELAB
//        --module Module=path --official official-init.json --work DIR --out defects.json
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { auditPolicies, nonstandard } from "../src/axioms.mjs";
import { readAdmitted } from "../src/blob.mjs";
import { gateAdmits } from "../src/gate.mjs";
import { unofficialInit } from "../src/library.mjs";
import { openEngine } from "../src/prover.mjs";
import { agree, load } from "./agree.mjs";
import { attest, gateLabel } from "./attest.mjs";

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith("--") ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
const manifest = JSON.parse(readFileSync(join(a.manifest, "manifest.json"), "utf8"));
const blob = (label) => { const f = join(a.manifest, "blobs", label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
const native = load(readFileSync(a.native, "utf8"));
const wasm = load(readFileSync(a.wasm, "utf8"));
const defects = [];
const plant = async (name, run) => {
  let refused = false, detail = null;
  try { ({ refused, detail } = await run()); } catch (e) { refused = false; detail = `the defect did not run: ${e.message}`; }
  defects.push({ name, refused, detail });
  console.log(`${name}: ${refused ? "refused" : "NOT REFUSED"}${detail ? "; " + detail : ""}`);
};

// A changed .olean byte: the blob no longer has its label, so it is never read.
await plant("changed-olean-byte", async () => {
  const entry = manifest.library.find((e) => e.path.endsWith(".olean"));
  const bytes = await readAdmitted(blob, entry, entry.path);
  bytes[bytes.length >> 1] ^= 1;
  const tampered = gzipSync(bytes);
  try { await readAdmitted(() => tampered, entry, entry.path); return { refused: false }; }
  catch (e) { return { refused: e.code === "lean-prover.blob-kappa", detail: e.message }; }
});

// A declaration the engine reports differently from native: the agreement refuses.
await plant("changed-declaration", async () => {
  const changed = new Map([...wasm].map(([m, j]) => [m, structuredClone(j)]));
  const j = [...changed.values()].find((x) => x.decls?.length);
  j.decls[0].type = String(BigInt(j.decls[0].type) ^ 1n);
  const r = agree(native, changed);
  return { refused: r.disagreements > 0, detail: `${j.module}.${j.decls[0].name}` };
});

// A wrong axiom: a theorem's observed set against a policy that differs by one axiom, and an observed sorryAx.
await plant("wrong-axiom", async () => {
  const d = [...wasm.values()].flatMap((j) => j.decls ?? []).find((x) => x.kind === "theorem" && x.axioms.length);
  const observed = new Map([[d.name, d.axioms]]);
  // The true policy must hold first, or a refusal of the wrong one shows nothing.
  const [sound, row] = auditPolicies([
    { declaration: d.name, kind: "exact", rule: "semantic", axioms: d.axioms },
    { declaration: d.name, kind: "exact", rule: "semantic", axioms: d.axioms.slice(1) },
  ], observed);
  const outside = nonstandard([...d.axioms, "sorryAx"]);
  return { refused: sound.holds && !row.holds && /^observed /.test(row.why ?? "") && outside.includes("sorryAx"), detail: `${d.name}: ${row.why}` };
});

// An engine the gate did not admit: the attestation names another engine.
await plant("ungated-engine", async () => {
  const defectsOk = [{ name: "stand-in", refused: true }];
  const corpus = [...native.keys()].map((m) => [m, m]);
  const attestation = attest({ manifest, native, wasm, corpus, lexleanSha256: "0".repeat(64), lexleanSemantics: manifest.lexlean.semantics_id, defects: defectsOk });
  const other = structuredClone(manifest);
  other.engine.wasm.kappa = `blake3:${"0".repeat(64)}`;
  other.gate = gateLabel(attestation);
  const v = gateAdmits(other, attestation);
  return { refused: !v.admitted, detail: v.why };
});

// An Init file that is not the official release's: the library is refused (official: the toolchain's own files).
await plant("unofficial-init", async () => {
  const official = JSON.parse(readFileSync(a.official, "utf8"));
  if (unofficialInit(manifest, official).length) throw new Error("the gate's own library is not official");
  const other = structuredClone(manifest);
  const init = other.library.find((e) => e.path.startsWith("/lean/lib/lean/Init"));
  init.kappa = `blake3:${"3".repeat(64)}`;
  const off = unofficialInit(other, official);
  return { refused: off.length === 1, detail: off[0] };
});

// A broken proof, live: a corpus module cut short inside its first theorem. Both Lean and the engine refuse it.
await plant("broken-proof", async () => {
  const at = a.module.indexOf("=");
  const module = a.module.slice(0, at), text = readFileSync(a.module.slice(at + 1), "utf8");
  // LexLean renders a theorem as `public theorem`.
  const thm = text.search(/^(?:@\[[^\n]*\]\s*)?(?:(?:public|private|protected)\s+)*theorem\s/m);
  if (thm < 0) throw new Error(`${module} has no theorem`);
  const cut = text.indexOf(":=", thm);
  const broken = text.slice(0, cut + 2) + "\n";
  mkdirSync(a.work, { recursive: true });
  const path = join(a.work, `${module}.lean`);
  writeFileSync(path, broken);
  const nativeOut = execFileSync(a.elab, ["--resident", join(a.work, "out"), `${module}=${path}`], { encoding: "utf8", maxBuffer: 1 << 28 });
  const n = load(nativeOut).get(module);
  const { engine } = await openEngine({ manifest, read: blob });
  try {
    const src = `/src/${module.replaceAll(".", "/")}.lean`;
    await engine.call({ op: "write", path: src, bytes: new TextEncoder().encode(broken) });
    const { answer: w } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module, path: src } });
    const refusedBy = (j) => !(j?.elaborated === true && (j.replayRefused ?? null) === null);
    return { refused: refusedBy(n) && refusedBy(w), detail: `native elaborated ${n?.elaborated}, engine elaborated ${w?.elaborated}` };
  } finally {
    await engine.close();
  }
});

writeFileSync(a.out, JSON.stringify(defects, null, 1));
process.exit(defects.every((d) => d.refused) ? 0 : 1);
