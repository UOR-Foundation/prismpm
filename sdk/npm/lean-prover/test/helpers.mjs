import { gzipSync } from "node:zlib";
import { kappa } from "../src/vendor/blake3.mjs";

export const enc = new TextEncoder();
export const entry = (bytes, extra = {}) => ({ kappa: kappa(bytes), bytes: bytes.length, encoding: "gzip", encodedBytes: gzipSync(bytes).length, ...extra });

/** A manifest over tiny stand-in blobs, and a `read` that serves them gzip-encoded. */
export function fixture() {
  const blobs = new Map();
  const put = (text, extra) => { const b = enc.encode(text); const e = entry(b, extra); blobs.set(e.kappa, gzipSync(b)); return e; };
  const manifest = {
    schema: "lean-wasm-prover/1",
    lean: "4.32.2",
    lean_commit: "f3b06c705e6c85f5314019d5d3baab0fec5b580c",
    engine: { loader: put("loader"), wasm: put("wasm") },
    lexlean: { semantics_id: "4bd46ef62ba56a77cb3c6453346671a809ccd665fc1f5334e4b1b9dce01f3245", wasm: put("lexlean") },
    library: [put("init", { path: "/lean/lib/lean/Init.olean" }), put("rt", { path: "/rt/LexLeanRuntime/Portable.olean" })],
  };
  return { manifest, blobs, read: (label) => blobs.get(label) ?? null };
}

/** A rendered project of two modules, its entrypoints, and answers the engine could give. */
export const SEMANTICS = "4bd46ef62ba56a77cb3c6453346671a809ccd665fc1f5334e4b1b9dce01f3245";
export function renderedProject({ policies = [
  { declaration: "Leap.isLeap", policy: "none", axioms: [] },
  { declaration: "Leap.leapRule", policy: "exact", axioms: ["propext"] },
  { declaration: "Leap.Main.main", policy: "exact", axioms: ["Quot.sound", "propext"] },
] } = {}) {
  return {
    spec: "lexlean/lean-modules/1",
    compiler: { version: "0.4.3", semantics_id: SEMANTICS },
    source_id: "s", semantic_id: "m", build_id: "b",
    modules: [
      { kind: "runtime", lean_module: "LexLeanRuntime.Portable", text: "" },
      { kind: "project", lean_module: "Leap.Leap", module: "src/Leap.lex.tex", text: "leap" },
      { kind: "project", lean_module: "Leap.Main", module: "src/Main.lex.tex", text: "main" },
    ],
    ...(policies ? { axiom_policies: policies } : {}),
  };
}
export const ENTRYPOINTS = ["src/Leap.lex.tex", "src/Main.lex.tex"];
const decl = (name, kind, axioms) => ({ name, kind, type: "1", value: "2", axioms });
export function goodAnswers() {
  return new Map([
    ["Leap.Leap", { elaborated: true, replayRefused: null, decls: [decl("Leap.isLeap", "def", []), decl("Leap.leapRule", "theorem", ["propext"])] }],
    ["Leap.Main", { elaborated: true, replayRefused: null, decls: [decl("Leap.Main.main", "theorem", ["propext", "Quot.sound"])] }],
  ]);
}
