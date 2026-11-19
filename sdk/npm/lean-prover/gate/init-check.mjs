// The 32-bit Init against the release's, declaration by declaration. Why: a 32-bit engine cannot read the release's
// 64-bit .olean files, so its Init is compiled by lean32 (build/build-init32.sh) and is never the release's bytes; it
// is admitted only when every declaration of every Init module has the release's kind, type hash, value hash and
// axioms, and a fresh kernel replays all of them (InTabElaborator.libraryAdmitted, selfBuiltAgreed). How: the
// driver's `check` names a module's own declarations; native `elab --check` runs it over the release, this script
// runs it in the engine over the manifest's Init. gate/agree.mjs compares the two outputs.
//   node gate/init-check.mjs MANIFEST_DIR --modules FILE > init-wasm.jsonl      (FILE: one Init module per line)
//   node gate/init-check.mjs MANIFEST_DIR --list > modules.txt                  (the manifest's Init modules)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openEngine } from "../src/prover.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const prefix = "/lean/lib/lean/";
const modules = manifest.library
  .map((e) => e.path)
  .filter((p) => p.startsWith(prefix) && p.endsWith(".olean"))
  .map((p) => p.slice(prefix.length, -".olean".length).replaceAll("/", "."))
  .sort();
if (args[0] === "--list") {
  console.log(modules.join("\n"));
  process.exit(0);
}
const listed = args[0] === "--modules" ? readFileSync(args[1], "utf8").split("\n").filter(Boolean) : modules;
const read = (label) => { const f = join(dir, "blobs", label.slice(7)); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
// One engine for the whole run, restarted when its memory passes 3 GiB: each check imports a module's closure, and
// WebAssembly memory never shrinks. A restart changes nothing a check reports.
const BUDGET = 3 * 2 ** 30;
let { engine } = await openEngine({ manifest, read });
try {
  for (const module of listed) {
    const { answer } = await engine.call({ op: "request", request: { op: "check", outDir: "/out", module } });
    console.log(JSON.stringify({ ...answer, module }));
    const { heapBytes } = await engine.call({ op: "heap" });
    if (heapBytes > BUDGET) { await engine.close(); ({ engine } = await openEngine({ manifest, read })); }
  }
} finally {
  await engine.close();
}
