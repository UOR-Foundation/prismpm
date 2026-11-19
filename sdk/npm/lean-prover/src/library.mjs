// The library a manifest lists: its BLAKE3 label, and whether its Init files are the official Lean release's.
import { blake3Label } from "./blob.mjs";

const enc = new TextEncoder();
const byPath = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** The BLAKE3 label of the manifest's library listing: what the evidence and the gate name as the library. */
export function libraryLabel(manifest) {
  return blake3Label(enc.encode(JSON.stringify(manifest.library.map((e) => [e.path, e.kappa]).sort(byPath))));
}

const isInit = (path) => /^\/lean\/lib\/lean\/Init(\.|\/)/.test(path);

/**
 * The library's Init files against the official release's, given as { "lib/lean/Init/...": label } (paths relative
 * to the release's root). Returns the paths that differ or are not in the release; empty when all are official.
 */
export function unofficialInit(manifest, official) {
  const want = official instanceof Map ? official : new Map(Object.entries(official ?? {}));
  return manifest.library.filter((e) => isInit(e.path) && want.get(e.path.slice("/lean/".length)) !== e.kappa).map((e) => e.path);
}
