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
