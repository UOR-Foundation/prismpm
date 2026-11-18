// The corpus gate's attestation: it names the engine, the library, LexLean and the corpus by BLAKE3 label, and is
// written only when native Lean and the engine agree on every corpus declaration and every planted defect was
// refused. Its own label is what a manifest's `gate` field names.
//   node gate/attest.mjs --manifest DIR --native native.jsonl --wasm wasm.jsonl --corpus corpus.txt
//        --lexlean-sha256 HEX --defects defects.json --out gate.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kappa } from "../src/vendor/blake3.mjs";
import { libraryLabel } from "../src/prover.mjs";
import { agree, load } from "./agree.mjs";

export const GATE_SCHEMA = "lean-prover/gate/1";
const enc = new TextEncoder();
const labelOf = (v) => kappa(enc.encode(JSON.stringify(v)));

/** The attestation, or a thrown refusal naming why the gate does not admit this engine. */
export function attest({ manifest, native, wasm, corpus, lexleanSha256, lexleanSemantics, defects }) {
  const result = agree(native, wasm);
  if (result.disagreements) throw new Error(`the gate refuses: ${result.disagreements} modules disagree`);
  if (result.declarations === 0) throw new Error("the gate refuses: the corpus has no declarations");
  if (result.rows.some((r) => !r.accepted)) throw new Error(`the gate refuses: corpus module ${result.rows.find((r) => !r.accepted).module} was not accepted`);
  const notRefused = defects.filter((d) => d.refused !== true);
  if (!defects.length || notRefused.length) throw new Error(`the gate refuses: planted defects not refused: ${notRefused.map((d) => d.name).join(", ") || "none ran"}`);
  return {
    schema: GATE_SCHEMA,
    lean: { version: manifest.lean, commit: manifest.lean_commit },
    engine: { wasm: manifest.engine.wasm.kappa, loader: manifest.engine.loader.kappa },
    library: libraryLabel(manifest),
    lexlean: { native_sha256: lexleanSha256, semantics_id: lexleanSemantics, wasm: manifest.lexlean.wasm.kappa },
    corpus: labelOf(corpus.map(([m, text]) => [m, kappa(enc.encode(text))])),
    modules: result.rows.map((r) => ({ module: r.module, declarations: r.declarations })),
    declarations: result.declarations,
    defects: defects.map((d) => d.name),
    result: "admitted",
  };
}

export const gateLabel = (attestation) => kappa(enc.encode(JSON.stringify(attestation)));

if (process.argv[1]?.replaceAll("\\", "/").endsWith("gate/attest.mjs")) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith("--") ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
  const manifest = JSON.parse(readFileSync(join(a.manifest, "manifest.json"), "utf8"));
  const corpus = readFileSync(a.corpus, "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), readFileSync(l.slice(i + 1), "utf8")]; });
  const attestation = attest({
    manifest,
    native: load(readFileSync(a.native, "utf8")),
    wasm: load(readFileSync(a.wasm, "utf8")),
    corpus,
    lexleanSha256: a["lexlean-sha256"],
    lexleanSemantics: manifest.lexlean.semantics_id,
    defects: JSON.parse(readFileSync(a.defects, "utf8")),
  });
  const bytes = JSON.stringify(attestation);
  writeFileSync(a.out, bytes);
  console.log(`gate admitted: ${attestation.declarations} declarations over ${attestation.modules.length} modules; gate ${gateLabel(attestation)}`);
}
