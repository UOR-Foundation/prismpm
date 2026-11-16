/**
 * What LexLean's verify published for a model, kept by content address, so a
 * model this machine has verified is never verified again: not on a rebuild,
 * and not in another project with the same model.
 *
 * Verify is a function of the SDK image (which pins LexLean, Lean, Lake and
 * leanchecker), of LexLean's build ID (its own content address over every
 * lexicon, the lock, the project config and every source), and of the Lake
 * workspace files outside that build. The record is found by a derivation key
 * over those three and stands in for verify only when `reuseAdmits` allows it,
 * the rule Lean proves for every stored result (`model/rule-app`): the same
 * key, image and build, and files that re-derive to the labels they were kept
 * under. Only a verify that exited 0 is kept, and only the record it published
 * for this build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { isKappa, kappa } from '../uorc.mjs';
import { derivationKey } from './kappa-rules.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
export const VERIFIED_SCHEMA = 'prism/lexlean-verified/1';
/** The Lake workspace files a build ID does not cover and verify reads. */
const WORKSPACE = ['lakefile.toml', 'lake-manifest.json', 'lean-toolchain'];

/** The κ-label of an SDK image reference, from its digest. */
export const imageLabel = (reference) => {
  const digest = /@sha256:([0-9a-f]{64})$/.exec(reference ?? '');
  return digest ? `sha256:${digest[1]}` : null;
};

/** The κ-label of the Lake workspace: each file's name and the label of its bytes, in a fixed order. */
export function workspaceLabel(project) {
  const files = WORKSPACE.map((name) => [name, existsSync(join(project, name)) ? kappa(readFileSync(join(project, name))) : null]);
  return kappa(enc.encode(JSON.stringify(['prism/lake-workspace/1', files])));
}

/** The build ID LexLean printed (`built N modules at .lexlean/build/<id>`), as a κ-label, or null. */
export function buildLabel(output) {
  const built = /^built \d+ modules? at \.lexlean\/build\/([0-9a-f]{64})\s*$/m.exec(output ?? '');
  return built ? `sha256:${built[1]}` : null;
}

/** The key a verified record is kept and found under. */
export const verifiedKey = ({ image, build, workspace }) => derivationKey(VERIFIED_SCHEMA, [image, build, workspace]);

/** Every file under `folder`, as `[path relative to it with /, bytes]`, sorted by path. */
function filesOf(folder) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push([relative(folder, path).split(sep).join('/'), readFileSync(path)]);
    }
  };
  walk(folder);
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The folder verify published for `build` in this project, or null: the attestation that names this build and says verified. */
export function publishedFor(project, build) {
  const root = join(project, '.lexlean', 'verified');
  if (!existsSync(root)) return null;
  for (const id of readdirSync(root)) {
    try {
      const attestation = JSON.parse(readFileSync(join(root, id, 'attestation.json'), 'utf8'));
      if (`sha256:${attestation.build_id}` === build && attestation.status === 'verified' && attestation.attestation_id === id) return join(root, id);
    } catch {
      // A folder without a readable attestation is not a verified record.
    }
  }
  return null;
}

/** Keep the record verify published: each file by its label, the list of them, and the realization under the key. */
export function keepVerified(store, { key, image, build, workspace, folder }) {
  const files = filesOf(folder).map(([path, bytes]) => [path, store.put(bytes)]);
  const list = store.put(enc.encode(JSON.stringify(files)));
  const attestation = folder.split(sep).join('/').split('/').at(-1);
  const name = store.put(enc.encode(`${JSON.stringify({ schema: VERIFIED_SCHEMA, key, image, build, workspace, attestation, files: list })}\n`));
  store.bind(key, name);
  return name;
}

/**
 * Look a verified record up by its key. Resolves `{ facts, attestation, files }`: `facts` is what `reuseAdmits`
 * decides on (the image in the kernel's place, the build in the library's), and `files` the record's files as
 * read, when every one of them re-derives. Nothing here decides; the caller asks the rule.
 */
export function findVerified(store, { key, image, build }) {
  const absent = { facts: { present: 0, storedKey: '', computedKey: key, storedKernel: '', kernelPinned: image, storedLibrary: '', libraryPinned: build, storedBytes: '', derivedBytes: '' }, attestation: null, files: null };
  const name = store.bound(key);
  const bytes = name ? store.get(name) : null;
  if (!bytes) return absent;
  let kept;
  try {
    kept = JSON.parse(dec.decode(bytes));
  } catch {
    return absent;
  }
  if (kept?.schema !== VERIFIED_SCHEMA || ![kept.key, kept.image, kept.build, kept.workspace, kept.files].every(isKappa) || !/^[0-9a-f]{64}$/.test(kept.attestation ?? '')) return absent;
  // The files are what the list names now: every one must re-derive, or the record is not what it says.
  let files = null;
  const listBytes = store.get(kept.files);
  if (listBytes) {
    try {
      const list = JSON.parse(dec.decode(listBytes));
      const read = list.map(([path, label]) => [path, typeof path === 'string' && !path.split('/').includes('..') && isKappa(label) ? store.get(label) : null]);
      if (read.every(([, b]) => b)) files = read;
    } catch {
      files = null;
    }
  }
  // The record's own attestation must name this build and say verified, as the one verify published did.
  let names = false;
  try {
    const attestation = JSON.parse(dec.decode(files?.find(([path]) => path === 'attestation.json')?.[1] ?? new Uint8Array()));
    names = `sha256:${attestation.build_id}` === build && attestation.status === 'verified' && attestation.attestation_id === kept.attestation;
  } catch {
    names = false;
  }
  return {
    facts: {
      present: 1,
      storedKey: kept.key,
      computedKey: key,
      storedKernel: kept.image,
      kernelPinned: image,
      storedLibrary: kept.build,
      libraryPinned: names ? build : '',
      storedBytes: kept.files,
      derivedBytes: files ? kappa(enc.encode(JSON.stringify(files.map(([path, b]) => [path, kappa(b)])))) : '',
    },
    attestation: kept.attestation,
    files,
  };
}

/** Put a reused record where verify publishes one, so what follows finds it as if verify had run. */
export function restoreVerified(project, { attestation, files }) {
  const folder = join(project, '.lexlean', 'verified', attestation);
  for (const [path, bytes] of files) {
    const at = join(folder, ...path.split('/'));
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, bytes);
  }
  return folder;
}
