// The prover's blobs and manifest (`lean-wasm-prover/1`). Every file is written gzip-compressed as `blobs/<hex>`,
// where <hex> is the BLAKE3 label of the decoded bytes: the encoding is storage and transport only, never identity
// (spec/src/BlobLabel.lex.tex). A reader decodes, then re-derives the label before a byte is used.
// Manifest entries: { path, kappa, bytes, encoding: "gzip", encodedBytes }.
//
// What ships is what elaboration reads: Lean's Init (from the toolchain) under /lean, and LexLean's runtime under
// /rt. With --opened FILE, only the files listed there (one absolute path per line, from an open log) are taken.
//
//   node scripts/make-manifest.mjs --sysroot DIR --runtime DIR --engine DIR --lexlean FILE --semantics ID
//        --out DIR [--opened FILE] [--gate LABEL] [--width 32]
// --width 32: the 32-bit engine (build-wasm.sh WIDTH=32), with --sysroot naming the sysroot whose Init lean32 compiled.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { kappa } from "../src/vendor/blake3.mjs";
import { LEAN, MANIFEST_SCHEMA } from "../src/prover.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
for (const k of ["sysroot", "runtime", "engine", "lexlean", "semantics", "out"]) if (!args[k]) throw new Error(`--${k} is required`);

mkdirSync(join(args.out, "blobs"), { recursive: true });
// gzip at level 9; Node writes no file name and a zero time, so the same bytes give the same blob.
const place = (bytes) => {
  const label = kappa(bytes);
  const f = join(args.out, "blobs", label.slice(7));
  if (!existsSync(f)) writeFileSync(f, gzipSync(bytes, { level: 9 }));
  return { kappa: label, bytes: bytes.length, encoding: "gzip", encodedBytes: statSync(f).size };
};
const walk = (dir) => readdirSync(dir, { recursive: true }).map(String).map((f) => join(dir, f)).filter((f) => statSync(f).isFile());
const slash = (p) => p.replaceAll("\\", "/");
const LIB_EXTS = [".olean", ".olean.server", ".olean.private", ".ir"];
const lib = join(args.sysroot, "lib", "lean");
const opened = args.opened ? new Set(readFileSync(args.opened, "utf8").split("\n").filter(Boolean).map(slash)) : null;
const take = (f) => (opened ? opened.has(slash(f)) : LIB_EXTS.some((e) => f.endsWith(e)));

const library = [];
for (const f of walk(lib)) {
  const rel = slash(relative(lib, f));
  if (!(rel === "Init.olean" || rel.startsWith("Init.") || rel.startsWith("Init/"))) continue;
  if (take(f)) library.push({ path: `/lean/lib/lean/${rel}`, ...place(readFileSync(f)) });
}
for (const f of walk(args.runtime)) if (take(f)) library.push({ path: `/rt/${slash(relative(args.runtime, f))}`, ...place(readFileSync(f)) });
library.sort((a, b) => (a.path < b.path ? -1 : 1));

const manifest = {
  schema: MANIFEST_SCHEMA,
  ...(args.width === "32" ? { width: 32 } : {}),
  lean: LEAN.version,
  lean_commit: LEAN.commit,
  engine: { loader: place(readFileSync(join(args.engine, "lean-elab.mjs"))), wasm: place(readFileSync(join(args.engine, "lean-elab.wasm"))) },
  lexlean: { semantics_id: args.semantics, wasm: place(readFileSync(args.lexlean)) },
  library,
  ...(args.gate ? { gate: args.gate } : {}),
};
writeFileSync(join(args.out, "manifest.json"), JSON.stringify(manifest));
const mb = (n) => (n / 1048576).toFixed(1);
const raw = library.reduce((a, e) => a + e.bytes, 0), packed = library.reduce((a, e) => a + e.encodedBytes, 0);
console.log(`library: ${library.length} files, ${mb(raw)} MB, ${mb(packed)} MB gzip; engine ${mb(manifest.engine.wasm.bytes)} MB, ${mb(manifest.engine.wasm.encodedBytes)} MB gzip`);
