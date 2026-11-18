// Module results by BLAKE3 label: a module anyone has already built costs a check, not an elaboration.
//
// Why. Elaboration is search; checking is cheap. A module's result is a function of everything elaboration reads, so
// once those inputs are named by BLAKE3 label, the result can be reused from any store, provided it is checked on
// read.
//
// How. Two keys, both BLAKE3 labels over a framed recipe:
//   recipe key = label(engine, Lean release, module name, label of the source). It maps to the imports Lean parsed
//                from that source, so no header is parsed here.
//   result key = label(recipe key, and for each import its label: the library's label for a module the library
//                holds, or the label of the artifacts this prover built). It maps to the module's four artifacts.
// Artifacts are stored as blobs named by their label. On read every blob is hashed again, and the driver's `check`
// imports the module and replays every declaration through the kernel over its imports. Any failure is a miss, and a
// miss elaborates in full; only results the kernel accepted are stored.
//
// A store is { get(label) -> Uint8Array | null, put(label, bytes) }, sync or async. What it does not do: attest who
// wrote a stored result. The kernel check proves every declaration valid; a shared store still needs the writer's
// signature before a result is trusted.
import { blake3Label } from "./blob.mjs";

const EXTS = [".olean", ".olean.server", ".olean.private", ".ir"];
const enc = new TextEncoder();
const dec = new TextDecoder();
const labelOf = (value) => blake3Label(enc.encode(JSON.stringify(value)));
const outPath = (module, ext) => `/out/${module.replaceAll(".", "/")}${ext}`;
const LEAN = "lean 4.32.2 f3b06c705e6c85f5314019d5d3baab0fec5b580c";

export const recipeKey = (evidence, module, text) => labelOf(["lean-prover/elab-recipe/1", evidence.engine, LEAN, module, blake3Label(text)]);

async function artifacts(engine, module) {
  const out = [];
  for (const ext of EXTS) {
    const { bytes } = await engine.call({ op: "read", path: outPath(module, ext) });
    if (!bytes) return null;
    out.push([ext, new Uint8Array(bytes)]);
  }
  return out;
}

async function resultKey(engine, evidence, recipe, imports) {
  const labels = [];
  for (const m of imports) {
    const built = await artifacts(engine, m);
    labels.push([m, built ? ["built", labelOf(built.map(([e, b]) => [e, blake3Label(b)]))] : ["library", evidence.library]]);
  }
  return labelOf(["lean-prover/elab-result/1", recipe, labels]);
}

const json = (bytes) => { try { return bytes ? JSON.parse(dec.decode(bytes)) : null; } catch { return null; } };

/** The driver's answer for a stored result that passed its check, or null (a miss). */
export async function cachedCheck({ engine, store, evidence, module, text }) {
  const recipe = recipeKey(evidence, module, text);
  const rec = json(await store.get(recipe));
  if (!Array.isArray(rec?.imports)) return null;
  const res = json(await store.get(await resultKey(engine, evidence, recipe, rec.imports)));
  if (!res?.artifacts) return null;
  for (const ext of EXTS) {
    const label = res.artifacts[ext];
    const bytes = label ? await store.get(label) : null;
    if (!(bytes instanceof Uint8Array) || blake3Label(bytes) !== label) return null;
    await engine.call({ op: "write", path: outPath(module, ext), bytes });
  }
  const { answer } = await engine.call({ op: "request", request: { op: "check", outDir: "/out", module } });
  return answer?.elaborated === true && answer.replayRefused === null ? answer : null;
}

/** Stores a result the kernel accepted. */
export async function storeResult({ engine, store, evidence, module, text, answer }) {
  const built = await artifacts(engine, module);
  if (!built) return;
  // The resident driver's answer does not list imports; the stored check of the written artifacts does, and it
  // also confirms that what is stored replays through the kernel.
  let imports = answer.imports;
  if (!Array.isArray(imports)) {
    const checked = (await engine.call({ op: "request", request: { op: "check", outDir: "/out", module } })).answer;
    if (checked?.elaborated !== true || checked.replayRefused !== null || !Array.isArray(checked.imports)) return;
    imports = checked.imports;
  }
  const recipe = recipeKey(evidence, module, text);
  await store.put(recipe, enc.encode(JSON.stringify({ imports })));
  const labels = {};
  for (const [ext, bytes] of built) {
    labels[ext] = blake3Label(bytes);
    await store.put(labels[ext], bytes);
  }
  await store.put(await resultKey(engine, evidence, recipe, imports), enc.encode(JSON.stringify({ artifacts: labels })));
}
