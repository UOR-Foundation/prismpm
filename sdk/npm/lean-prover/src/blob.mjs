// A blob is admitted only when it decodes and the BLAKE3 label of the decoded bytes is the manifest's label
// (spec/src/BlobLabel.lex.tex). The encoding is storage and transport only, never identity.
//
// Manifest entry: { path?, kappa, bytes, encoding: "gzip" | "identity", encodedBytes }.
import { gunzipSync } from "node:zlib";
import { kappa as blake3Label } from "./vendor/blake3.mjs";

export { blake3Label };

const LABEL = /^blake3:[0-9a-f]{64}$/;

export class ProverError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** The entry's shape, or a `lean-prover.manifest` refusal. */
export function checkEntry(entry, where) {
  if (!entry || typeof entry !== "object") throw new ProverError("lean-prover.manifest", `${where} is not an entry`);
  if (typeof entry.kappa !== "string" || !LABEL.test(entry.kappa)) {
    throw new ProverError("lean-prover.manifest", `${where} has no BLAKE3 label`);
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new ProverError("lean-prover.manifest", `${where} has no byte length`);
  if (entry.encoding !== "gzip" && entry.encoding !== "identity") {
    throw new ProverError("lean-prover.manifest", `${where} has encoding ${entry.encoding}, not gzip or identity`);
  }
  return entry;
}

/** The decoded bytes when the blob is admitted, otherwise null (a miss). Never throws on bad bytes. */
export function admit(entry, encoded) {
  if (!(encoded instanceof Uint8Array)) return null;
  let bytes;
  try {
    bytes = entry.encoding === "gzip" ? new Uint8Array(gunzipSync(encoded)) : encoded.slice();
  } catch {
    return null;
  }
  if (bytes.length !== entry.bytes) return null;
  return blake3Label(bytes) === entry.kappa ? bytes : null;
}

/**
 * Reads one entry through `read(label, { refetch })`. A miss is read once more with `refetch: true`; a second miss
 * is the refusal `lean-prover.blob`. The prover uses only bytes admitted here.
 */
export async function readAdmitted(read, entry, where) {
  checkEntry(entry, where);
  for (const refetch of [false, true]) {
    const bytes = admit(entry, toBytes(await read(entry.kappa, { refetch })));
    if (bytes) return bytes;
  }
  throw new ProverError("lean-prover.blob", `${where} (${entry.kappa}) does not decode to bytes with its BLAKE3 label`);
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
