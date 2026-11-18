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

/** The entry's shape, or a `lean-prover.manifest-unpinned` refusal: a malformed manifest is never the pinned one. */
export function checkEntry(entry, where) {
  const fail = (why) => { throw new ProverError("lean-prover.manifest-unpinned", why); };
  if (!entry || typeof entry !== "object") fail(`${where} is not an entry`);
  if (typeof entry.kappa !== "string" || !LABEL.test(entry.kappa)) fail(`${where} has no BLAKE3 label`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail(`${where} has no byte length`);
  if (entry.encoding !== "gzip" && entry.encoding !== "identity") fail(`${where} has encoding ${entry.encoding}, not gzip or identity`);
  return entry;
}

const toBytes = (value) => (value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null);

/**
 * { bytes } when the blob is admitted, otherwise { code } naming the miss: `lean-prover.blob-missing` (no bytes),
 * `lean-prover.blob-undecodable` (they do not decode as the manifest's encoding) or `lean-prover.blob-kappa` (the
 * decoded bytes do not have the manifest's label). Never throws.
 */
export function examine(entry, stored) {
  const encoded = toBytes(stored);
  if (!encoded) return { code: "lean-prover.blob-missing" };
  let bytes;
  try {
    bytes = entry.encoding === "gzip" ? new Uint8Array(gunzipSync(encoded)) : encoded.slice();
  } catch {
    return { code: "lean-prover.blob-undecodable" };
  }
  if (bytes.length !== entry.bytes || blake3Label(bytes) !== entry.kappa) return { code: "lean-prover.blob-kappa" };
  return { bytes };
}

/** The decoded bytes when the blob is admitted, otherwise null (a miss). */
export const admit = (entry, stored) => examine(entry, stored).bytes ?? null;

/**
 * Reads one entry through `read(label, { refetch })`. A miss is read once more with `refetch: true`; a second miss
 * is refused with the code that names it. The prover uses only bytes admitted here.
 */
export async function readAdmitted(read, entry, where) {
  checkEntry(entry, where);
  let seen;
  for (const refetch of [false, true]) {
    seen = examine(entry, await read(entry.kappa, { refetch }));
    if (seen.bytes) return seen.bytes;
  }
  const why = { "lean-prover.blob-missing": "is not in the store and could not be fetched", "lean-prover.blob-undecodable": `does not decode as ${entry.encoding}`, "lean-prover.blob-kappa": "decodes to bytes without its BLAKE3 label" }[seen.code];
  throw new ProverError(seen.code, `${where} (${entry.kappa}) ${why}`);
}
