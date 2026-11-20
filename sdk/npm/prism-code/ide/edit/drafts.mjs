// A reader's changes to a model, kept in this browser so a reload does not lose them.
//
// Everything is named by its UOR content address, the BLAKE3 label prism-code's own blake3.mjs gives:
//
//   the model as fetched   one label over its listing and every file's label: the base
//   each changed file      its text, stored once under its own label
//   the draft              for one base, which paths were changed and the label of each one's text
//
// So a draft belongs to exactly the model it was made on. When the app publishes a different model, its base is
// another label and the old draft is not laid over it. A stored text is returned only when its bytes derive again
// to the label that names it; one that does not is left out and reported, never shown as the reader's work.
//
// The store is the origin's private file system. It is trusted no further than the origin that serves this page:
// another page of the same origin can write there. Nothing is sent anywhere.

import { kappa } from './prism-code/blake3.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const hexOf = (label) => label.slice('blake3:'.length);
const isLabel = (label) => typeof label === 'string' && /^blake3:[0-9a-f]{64}$/.test(label);

/** The label of a model as fetched: its entry, and every file's path with the label of its text, in path order. */
export function baseLabel(entry, files) {
  const paths = Object.keys(files).sort();
  return kappa(enc.encode(JSON.stringify(['prism-ide/model-base/1', entry, paths.map((path) => [path, kappa(enc.encode(files[path]))])])));
}

/**
 * The drafts of this browser. `root` is a directory handle of the origin's private file system; without one the
 * browser's own is asked for. Where there is none, or the browser refuses it (a private window, a blocked site),
 * the store keeps nothing and says so with `off`. No method throws.
 */
export async function openDrafts({ root = null } = {}) {
  let top = root;
  try { top ??= await (await navigator.storage.getDirectory()).getDirectoryHandle('prism-ide-drafts', { create: true }); } catch { top = null; }
  const off = top === null;
  const dir = (name, create) => top.getDirectoryHandle(name, { create });
  const read = async (kind, name) => {
    try { return new Uint8Array(await (await (await (await dir(kind, false)).getFileHandle(name)).getFile()).arrayBuffer()); } catch { return null; }
  };
  const write = async (kind, name, bytes) => {
    try {
      // A writable stream replaces the file only on close, so a reader never sees half of it.
      const stream = await (await (await dir(kind, true)).getFileHandle(name, { create: true })).createWritable();
      await stream.write(bytes);
      await stream.close();
      return true;
    } catch { return false; }
  };
  const remove = async (kind, name) => { try { await (await dir(kind, false)).removeEntry(name); } catch { /* not there */ } };

  return {
    off,
    /**
     * The changes kept for the model named `base`: `{ restored: { path: text }, dropped: [path] }`. A path is dropped
     * when its text is missing or does not derive to its label.
     */
    async load(base) {
      const empty = { restored: {}, dropped: [] };
      if (off || !isLabel(base)) return empty;
      let draft;
      try { draft = JSON.parse(dec.decode(await read('drafts', hexOf(base)))); } catch { return empty; }
      if (draft?.base !== base || typeof draft.files !== 'object' || draft.files === null) return empty;
      const out = { restored: {}, dropped: [] };
      for (const [path, label] of Object.entries(draft.files)) {
        const bytes = isLabel(label) ? await read('bytes', hexOf(label)) : null;
        let text = null;
        if (bytes && kappa(bytes) === label) { try { text = dec.decode(bytes); } catch { text = null; } }
        if (text === null) out.dropped.push(path); else out.restored[path] = text;
      }
      return out;
    },
    /** Keep `changed` (`{ path: text }`) as the draft of `base`, replacing the one before. With nothing changed the draft is removed. Resolves the labels kept. */
    async save(base, changed) {
      if (off || !isLabel(base)) return {};
      const paths = Object.keys(changed).sort();
      if (paths.length === 0) { await remove('drafts', hexOf(base)); return {}; }
      const labels = {};
      for (const path of paths) {
        const bytes = enc.encode(changed[path]);
        const label = kappa(bytes);
        if (await write('bytes', hexOf(label), bytes)) labels[path] = label;
      }
      await write('drafts', hexOf(base), enc.encode(JSON.stringify({ schema: 'prism-ide/draft/1', base, files: labels })));
      return labels;
    },
    /** Forget the draft of `base`. The texts it named stay until the browser clears the site's data; nothing names them. */
    async discard(base) {
      if (!off && isLabel(base)) await remove('drafts', hexOf(base));
    },
  };
}
