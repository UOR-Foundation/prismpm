// One kernel in this process, for tests and for publishing: the same wasm kernel and library the prover uses,
// without the prover around them.
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadLibrary, emitter, readModule } from "../src/emit.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
export { loadLibrary, emitter, readModule };

export async function kernel() {
  const factory = (await import(pathToFileURL(path.join(root, "kernel/lean-kernel.mjs")).href)).default;
  const wasmBinary = gunzipSync(fs.readFileSync(path.join(root, "kernel/lean-kernel.wasm.gz"))), libraryText = gunzipSync(fs.readFileSync(path.join(root, "library/library.ndjson.gz"))).toString("utf8"), lines = [];
  const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
  if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("kernel not ready");
  const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t = performance.now(); let exit; try { exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; lines.push("trap: " + e.message); } return { exit, ms: performance.now() - t, out: [...lines], last: lines[lines.length - 1] }; };
  if (call("load_library", libraryText).exit !== 0) throw new Error("library not admitted");
  const axioms = (out) => new Map(out.map((l) => /^axioms (\S+): (.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].split(", ").filter(Boolean).sort()]));
  return { libraryText, judge: (suffix) => call("check_suffix", suffix), whole: (text) => call("check_whole", text), axioms };
}

/** The axioms recorded for each theorem in a file of `#print axioms` output. */
export const declaredAxioms = (text) => new Map(text.split("\n").map((l) => /^'([^']+)' (?:depends on axioms: \[(.*)\]|does not depend on any axioms)/.exec(l)).filter(Boolean).map((x) => [x[1], (x[2] || "").split(", ").filter(Boolean).sort()]));
