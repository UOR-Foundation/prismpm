// The driver's two files, fetched from their pinned source and admitted only with their BLAKE3 labels
// (engine.lock.json). Nothing else is written to DIR.
//   node build/fetch-driver.mjs DIR
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kappa } from "../src/vendor/blake3.mjs";
import { checkDriver } from "./check-pins.mjs";

const lock = JSON.parse(readFileSync(new URL("../engine.lock.json", import.meta.url), "utf8"));
const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const { repository, commit, path } = lock.driver.source;
for (const [file, pin] of Object.entries(lock.driver.files)) {
  const res = await fetch(`https://raw.githubusercontent.com/${repository}/${commit}/${path}/${file}`);
  if (!res.ok) throw new Error(`driver ${file}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (kappa(bytes) !== pin.kappa) throw new Error(`driver ${file} is ${kappa(bytes)}, not the pinned ${pin.kappa}`);
  writeFileSync(join(dir, file), bytes);
}
checkDriver(dir);
console.log(`driver: ${Object.keys(lock.driver.files).join(", ")} admitted`);
