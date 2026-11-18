/**
 * A content-addressed store for what Prism has already worked out, so the same
 * work is never done twice: on this machine, across apps, across versions.
 *
 * It follows Hologram's substrate (Hologram-Technologies/hologram,
 * `hologram-space/src/substrate.rs`) in the three things that matter:
 *
 * - Bytes are named by their κ-label (`kappa`, the uor-addr label prism-code
 *   already gives a holo's blobs), and every read re-derives the label. Bytes
 *   that do not re-derive are not returned.
 * - A result names its inputs by κ-label inside its own canonical bytes, so
 *   what it depends on can be read back out of it.
 * - A derivation key is taken over a domain tag and the operands' labels, in
 *   order, each framed by its length, so no two different derivations share one.
 *
 * Whether a stored proof may be reused is `reuseAdmits`, stated in LexLean and
 * proved by Lean (`model/rule-app`): only under the same key, kernel, library
 * and proof bytes. The store is trusted no further than that rule.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prismHome } from '../agents.mjs';
import { kappa as blake3Kappa } from '../blake3.mjs';
import { isKappa, kappa } from '../uorc.mjs';
import { proofFacts, proofRealization } from './kappa-rules.mjs';

const enc = new TextEncoder();
export { PROOF_SCHEMA, derivationKey, policyLabel, proofKey, proofReferences, reuseAdmits, proofRealization } from './kappa-rules.mjs';

/** Where the store keeps its bytes. `PRISM_KAPPA_DIR` names another place; `PRISM_KAPPA=0` keeps nothing. */
export const kappaDirectory = (env = process.env) => env.PRISM_KAPPA_DIR || join(prismHome(env), 'kappa');

/** Write `bytes` beside `file` and move them into place, so a reader, or a crash, never leaves half a file. A name already taken holds the same bytes. */
export function writeAtomic(file, bytes) {
  mkdirSync(join(file, '..'), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  writeFileSync(partial, bytes);
  try {
    renameSync(partial, file);
  } catch (error) {
    if (!existsSync(file)) throw error;
  }
}

/**
 * The files this prism-code pins (Lean's kernel, LexLean as WebAssembly), kept once per machine under
 * `pinned/` by the BLAKE3 κ-label of their bytes. The labels the installed prism-code pins are the only
 * roots: store-gc.mjs removes every pinned file they do not name.
 */
export const pinnedFile = (label, env = process.env) => join(kappaDirectory(env), 'pinned', label.slice(7, 9), label.slice(9));

/** A pinned file's bytes, only when they re-derive to `label`; null when it is not here or is not those bytes. */
export function readPinnedFile(label, env = process.env) {
  const file = pinnedFile(label, env);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  return blake3Kappa(bytes) === label ? bytes : null;
}

/** Keep pinned bytes under their label, which they must have. Returns the file. */
export function keepPinnedFile(bytes, label, env = process.env) {
  if (blake3Kappa(bytes) !== label) throw new Error(`these bytes are ${blake3Kappa(bytes)}, not ${label}`);
  const file = pinnedFile(label, env);
  writeAtomic(file, bytes);
  return file;
}

/** Mark a cached entry as just used: the cache is evicted least recently used first (store-gc.mjs). */
const touch = (file) => {
  try {
    const now = new Date();
    utimesSync(file, now, now);
  } catch {
    // Read-only, or removed since: the entry is only older than it is.
  }
};

/**
 * The store. `put` returns the bytes' κ-label; `get` returns bytes only when
 * they re-derive to the label asked for; `bind` and `bound` keep which result
 * a derivation key led to. A store that is off answers nothing and keeps nothing.
 */
export function kappaStore({ env = process.env } = {}) {
  const off = env.PRISM_KAPPA === '0';
  const directory = kappaDirectory(env);
  const fileOf = (kind, label) => join(directory, kind, label.slice(7, 9), label.slice(9));
  const write = writeAtomic;
  return {
    directory,
    off,
    put(bytes) {
      const label = kappa(bytes);
      if (!off && !existsSync(fileOf('bytes', label))) write(fileOf('bytes', label), bytes);
      return label;
    },
    get(label) {
      if (off || !isKappa(label) || !existsSync(fileOf('bytes', label))) return null;
      touch(fileOf('bytes', label));
      const bytes = new Uint8Array(readFileSync(fileOf('bytes', label)));
      // The universal check under every stored byte: bytes that are not what their name says are not there.
      return kappa(bytes) === label ? bytes : null;
    },
    bind(key, label) {
      if (!off) write(fileOf('derived', key), enc.encode(label));
    },
    bound(key) {
      if (off || !isKappa(key) || !existsSync(fileOf('derived', key))) return null;
      touch(fileOf('derived', key));
      const label = readFileSync(fileOf('derived', key), 'utf8');
      return isKappa(label) ? label : null;
    },
  };
}

/** Keep an accepted proof: its bytes, its realization, and the key that leads to it. Returns the realization's κ-label. */
export function keepProof(store, { key, kernel, library, statement, policy, text, axioms }) {
  const bundle = store.put(enc.encode(text));
  const label = store.put(proofRealization({ key, kernel, library, statement, policy, bundle, axioms }));
  store.bind(key, label);
  return label;
}

/**
 * Look a proof up by its derivation key. Resolves `{ facts, proof, text }`:
 * `facts` is what `reuseAdmits` decides on, and `text` the proof's own bytes
 * as read, when there are any. Nothing here decides; the caller asks the rule.
 */
export function findProof(store, { key, kernel, library, statement, policy }) {
  const label = store.bound(key);
  return proofFacts({ key, kernel, library, statement, policy }, label ? store.get(label) : null, (bundle) => store.get(bundle));
}
