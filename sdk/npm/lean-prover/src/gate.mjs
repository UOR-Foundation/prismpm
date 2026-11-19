// Whether a manifest is admitted by its corpus gate: the manifest names the gate attestation by its BLAKE3 label,
// and that attestation admitted this very engine, library and LexLean. A manifest without a gate is never a default.
import { blake3Label } from "./blob.mjs";
import { libraryLabel } from "./library.mjs";

const enc = new TextEncoder();

/** { admitted: true } or { admitted: false, why }. `attestation` is the parsed gate.json. */
export function gateAdmits(manifest, attestation) {
  if (!manifest.gate) return { admitted: false, why: "the manifest names no gate" };
  if (!attestation || attestation.schema !== "lean-prover/gate/1") return { admitted: false, why: "no lean-prover/gate/1 attestation" };
  if (blake3Label(enc.encode(JSON.stringify(attestation))) !== manifest.gate) return { admitted: false, why: "the attestation is not the one the manifest names" };
  if (attestation.result !== "admitted") return { admitted: false, why: "the gate did not admit this build" };
  if (attestation.engine?.wasm !== manifest.engine.wasm.kappa || attestation.engine?.loader !== manifest.engine.loader.kappa) {
    return { admitted: false, why: "the gate admitted another engine" };
  }
  if (attestation.library !== libraryLabel(manifest)) return { admitted: false, why: "the gate admitted another library" };
  if (attestation.lexlean?.wasm !== manifest.lexlean.wasm.kappa) return { admitted: false, why: "the gate admitted another LexLean" };
  // BlobLabel.widthsMatch: the engine, its library and its gate are of one width.
  const width = manifest.width ?? 64;
  if ((attestation.width ?? 64) !== width) return { admitted: false, why: `the gate admitted a ${attestation.width ?? 64}-bit build, not a ${width}-bit one` };
  // A 32-bit Init is its own build's: admitted only when every Init declaration equals the release's.
  if (width === 32) {
    const init = attestation.init;
    if (!init || !(init.declarations > 0) || init.disagreements !== 0) return { admitted: false, why: "the gate did not attest that the 32-bit Init equals the release's" };
  }
  return { admitted: true };
}
