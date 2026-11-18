// The build's pinned bytes, each admitted by its BLAKE3 label from engine.lock.json.
//   node build/check-pins.mjs patch          the Lean patch
//   node build/check-pins.mjs driver DIR     the driver: exactly its pinned files, each with its label
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kappa } from "../src/vendor/blake3.mjs";

const pkg = new URL("..", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("engine.lock.json", pkg), "utf8"));

export function checkPatch() {
  const got = kappa(readFileSync(new URL(lock.patch.path, pkg)));
  if (got !== lock.patch.kappa) throw new Error(`${lock.patch.path} is ${got}, not the pinned ${lock.patch.kappa}`);
}

export function checkDriver(dir) {
  const want = Object.keys(lock.driver.files).sort();
  const have = readdirSync(dir).filter((f) => f.endsWith(".lean")).sort();
  if (JSON.stringify(have) !== JSON.stringify(want)) throw new Error(`the driver holds ${have.join(", ")}, not exactly ${want.join(", ")}`);
  for (const f of want) {
    const got = kappa(readFileSync(join(dir, f)));
    if (got !== lock.driver.files[f].kappa) throw new Error(`driver ${f} is ${got}, not the pinned ${lock.driver.files[f].kappa}`);
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  const [what, dir] = process.argv.slice(2);
  if (what === "patch") checkPatch();
  else if (what === "driver") checkDriver(dir);
  else throw new Error("usage: check-pins.mjs patch | driver DIR");
  console.log(`${what}: admitted`);
}
