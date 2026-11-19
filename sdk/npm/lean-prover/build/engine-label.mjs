// The engine build's cache key: the BLAKE3 label of every input that decides its bytes. It changes exactly when
// the Lean commit, the patch, Emscripten, the driver, a dependency pin or a build script changes, so CI rebuilds
// only then (.github/workflows/lean-prover.yml).
// The 32-bit build (WIDTH=32) adds its own inputs (engine.lock.json engine32_inputs) and its width, so its label never
// equals the 64-bit one and a change to its scripts reruns it alone.
//   node build/engine-label.mjs [32]     prints blake3:<hex>
import { readFileSync } from "node:fs";
import { kappa } from "../src/vendor/blake3.mjs";

const pkg = new URL("..", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("engine.lock.json", pkg), "utf8"));
const tools = readFileSync(new URL("../../../tools.lock", pkg), "utf8");
const emsdk = tools.slice(tools.indexOf("\n[emsdk]")).split(/\n\[(?!emsdk\])/)[0].replace(/\r/g, "");
const file = (p) => kappa(readFileSync(new URL(p, pkg)));
export const recipe = [
  "prism-code/lean-prover-engine/1",
  lock.lean,
  { patch: lock.patch.kappa, patchBytes: file(lock.patch.path) },
  Object.fromEntries(Object.entries(lock.driver.files).map(([f, p]) => [f, p.kappa])),
  lock.deps,
  kappa(new TextEncoder().encode(emsdk)),
  lock.engine_inputs.map((p) => [p, file(p)]),
];
const width = process.argv[2] === "32" ? 32 : 64;
const keyed = width === 64 ? recipe : [...recipe, { width, inputs: lock.engine32_inputs.map((p) => [p, file(p)]) }];
console.log(kappa(new TextEncoder().encode(JSON.stringify(keyed))));
