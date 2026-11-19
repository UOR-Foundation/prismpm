// Blob collection: a store keeps exactly the blobs some pinned manifest names, and removes every other blob
// (spec/src/BlobLabel.lex.tex, collectionKeepsExactlyThePinnedBlobs).

/** Every BLAKE3 label a manifest names: engine, loader, LexLean and each library file. */
export function namedBy(manifest) {
  return [manifest.engine.loader.kappa, manifest.engine.wasm.kappa, manifest.lexlean.wasm.kappa, ...manifest.library.map((e) => e.kappa)];
}

/** { keep, remove } over the store's labels, given the manifests that are pinned now. */
export function collect(storeLabels, pinnedManifests) {
  const named = new Set(pinnedManifests.flatMap(namedBy));
  const keep = [], remove = [];
  for (const label of storeLabels) (named.has(label) ? keep : remove).push(label);
  return { keep, remove };
}
