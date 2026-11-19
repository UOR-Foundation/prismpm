// The prover's blobs on the npm registry, for hosts that reach only npm (an agent's cloud sandbox, a locked-down CI).
//
// Why npm: `npx prism-code@latest setup` already reaches it, through the host's own proxy, auth and cache, and npm
// checks every tarball against its sha512 integrity. How: blobs are grouped into shard packages, each named by the
// BLAKE3 label of its content, and one library package names the manifest and depends on exactly its shards:
//
//   @prism-code/lean-shard-<hex>@1.0.0     files b/<hex>: each blob's decoded bytes, named by their BLAKE3 label;
//                                          <hex> of the package is the label of its listing (shardLabel)
//   @prism-code/lean-library-<hex>@1.0.0   manifest.json, whose BLAKE3 label is <hex>, and a dependency on every
//                                          shard at exactly 1.0.0
//
// A name is a label, so a package never changes; npm's tarball gzip is the only compression, and the label of each
// blob is re-derived on read as for any other transport (spec/src/NpmShard.lex.tex). The manifest's `npm` section
// says which shard holds each label.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { blake3Label, ProverError } from "./blob.mjs";

export const SHARD_SCOPE = "@prism-code/lean-shard-";
export const LIBRARY_SCOPE = "@prism-code/lean-library-";
export const PACKAGE_VERSION = "1.0.0";
/** The largest shard, packed: far below any registry's per-file limit, and quick to fetch on a slow link. */
export const SHARD_CAP_BYTES = 64 * 1024 * 1024;

const enc = new TextEncoder();
const hex = (label) => label.slice("blake3:".length);

/** The label of a shard: its listing of blob labels and sizes, sorted. */
export const shardLabel = (blobs) =>
  blake3Label(enc.encode(JSON.stringify(blobs.map((b) => [b.kappa, b.bytes]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))));
export const shardName = (label) => `${SHARD_SCOPE}${hex(label)}`;
export const libraryName = (manifestLabel) => `${LIBRARY_SCOPE}${hex(manifestLabel)}`;

/** Every entry a manifest names: engine, loader, LexLean and each library file. */
export const entriesOf = (manifest) => [manifest.engine.loader, manifest.engine.wasm, manifest.lexlean.wasm, ...manifest.library];

/**
 * Groups a manifest's blobs into shards, in path order, each at most `cap` bytes packed (estimated by the blob's gzip
 * size). A single blob larger than the cap is its own shard. Returns [{ name, label, blobs: [entry] }].
 */
export function planShards(manifest, cap = SHARD_CAP_BYTES) {
  const seen = new Set();
  const entries = entriesOf(manifest).filter((e) => (seen.has(e.kappa) ? false : (seen.add(e.kappa), true)));
  const shards = [];
  let current = [], size = 0;
  for (const e of entries) {
    if (current.length && size + e.encodedBytes > cap) { shards.push(current); current = []; size = 0; }
    current.push(e);
    size += e.encodedBytes;
  }
  if (current.length) shards.push(current);
  return shards.map((blobs) => { const label = shardLabel(blobs); return { name: shardName(label), label, blobs }; });
}

/** The manifest's `npm` section for a plan: which shard holds each label. */
export const npmSection = (plan) => ({
  version: PACKAGE_VERSION,
  shards: plan.map((s) => ({ name: s.name, label: s.label, blobs: s.blobs.map((b) => b.kappa).sort() })),
});

/** The `npm` section is consistent: names are the labels of their listings, and every label is in exactly one shard. */
export function checkNpmSection(manifest) {
  const fail = (why) => { throw new ProverError("lean-prover.manifest-unpinned", why); };
  const npm = manifest.npm;
  if (!npm || npm.version !== PACKAGE_VERSION || !Array.isArray(npm.shards)) fail("the manifest has no npm section");
  const sizes = new Map(entriesOf(manifest).map((e) => [e.kappa, e.bytes]));
  const where = new Map();
  for (const s of npm.shards) {
    const listing = s.blobs.map((kappa) => ({ kappa, bytes: sizes.get(kappa) }));
    if (listing.some((b) => b.bytes === undefined)) fail(`${s.name} holds a blob the manifest does not name`);
    if (s.label !== shardLabel(listing) || s.name !== shardName(s.label)) fail(`${s.name} is not named by the label of its content`);
    for (const k of s.blobs) { if (where.has(k)) fail(`${k} is in two shards`); where.set(k, s.name); }
  }
  for (const k of sizes.keys()) if (!where.has(k)) fail(`${k} is in no shard`);
  return where;
}

/**
 * A `read` for open() over the installed shard packages. `from` is where to resolve them from (a file path or URL
 * in the project that installed the library package). Each blob is returned as its decoded bytes, and the prover
 * re-derives its label before use.
 */
export function npmRead(manifest, { from, resolve } = {}) {
  const where = checkNpmSection(manifest);
  const req = resolve ? null : createRequire(from ?? import.meta.url);
  const dirOf = (name) => dirname(resolve ? resolve(`${name}/package.json`) : req.resolve(`${name}/package.json`));
  const dirs = new Map();
  return (label) => {
    const name = where.get(label);
    if (!name) return null;
    try {
      if (!dirs.has(name)) dirs.set(name, dirOf(name));
      return { encoding: "identity", bytes: new Uint8Array(readFileSync(join(dirs.get(name), "b", hex(label)))) };
    } catch {
      return null;
    }
  };
}
