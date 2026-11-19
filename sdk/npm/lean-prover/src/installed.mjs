// Opening the prover from its npm packages (src/npm.mjs): the host pins one BLAKE3 label, the manifest's, installs
// `@prism-code/lean-library-<hex>@1.0.0` with npm (which brings every shard), and opens. Everything else, the gate's
// attestation and the official Init listing included, comes from that one package and is checked against the pin.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { libraryName, npmRead } from "./npm.mjs";

export { checkNpmSection, libraryName, npmRead, shardName, shardsFor } from "./npm.mjs";
import { open, pinnedManifest } from "./prover.mjs";

/** `from`: a file in the project where the library package is installed (its package.json, say). */
export async function openInstalled({ pin, from, resolve }) {
  const res = resolve ?? ((spec) => createRequire(from).resolve(spec));
  const dir = dirname(res(`${libraryName(pin)}/package.json`));
  const manifestBytes = new Uint8Array(readFileSync(join(dir, "manifest.json")));
  const manifest = pinnedManifest(manifestBytes, pin);
  const json = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  return open({ manifest: manifestBytes, pin, read: npmRead(manifest, { resolve: res }), gate: json("gate.json"), official: json("official-init.json") });
}
