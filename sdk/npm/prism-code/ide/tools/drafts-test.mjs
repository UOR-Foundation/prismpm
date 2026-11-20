// The store that keeps a reader's changes across a reload (ide/edit/drafts.mjs), on a directory held in memory that
// answers as the browser's private file system does. Usage: node ide/tools/drafts-test.mjs
//
// drafts.mjs imports prism-code as the published page lays it out (./prism-code/blake3.mjs), so this test loads it
// through a loader hook that points that one address at src/blake3.mjs.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { kappa } from '../../src/blake3.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === './prism-code/blake3.mjs') return next(new URL('../../src/blake3.mjs', context.parentURL).href, context);
  return next(specifier, context);
}`));
const { baseLabel, openDrafts } = await import('../edit/drafts.mjs');

// A directory handle in memory: only what drafts.mjs asks of one.
function memoryDirectory() {
  const entries = new Map();
  const missing = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
  return {
    entries,
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!entries.has(name)) { if (!create) throw missing(); entries.set(name, memoryDirectory()); }
      return entries.get(name);
    },
    async getFileHandle(name, { create = false } = {}) {
      if (!entries.has(name)) { if (!create) throw missing(); entries.set(name, { bytes: new Uint8Array() }); }
      const file = entries.get(name);
      return {
        async getFile() { return { arrayBuffer: async () => file.bytes.slice().buffer }; },
        async createWritable() { let next = null; return { async write(bytes) { next = new Uint8Array(bytes); }, async close() { file.bytes = next; } }; },
      };
    },
    async removeEntry(name) { if (!entries.delete(name)) throw missing(); },
  };
}

const enc = new TextEncoder();
const files = { '/lexlean.toml': 'name = "x"', '/src/App.lex.tex': 'one\ntwo' };
const base = baseLabel('src/App.lex.tex', files);
assert.match(base, /^blake3:[0-9a-f]{64}$/);

// The base names the model: the same files in another order give it, and any change to a file, a path or the entry gives another.
assert.equal(baseLabel('src/App.lex.tex', { '/src/App.lex.tex': 'one\ntwo', '/lexlean.toml': 'name = "x"' }), base);
assert.notEqual(baseLabel('src/App.lex.tex', { ...files, '/lexlean.toml': 'name = "y"' }), base);
assert.notEqual(baseLabel('src/App.lex.tex', { ...files, '/extra': '' }), base);
assert.notEqual(baseLabel('src/Other.lex.tex', files), base);

const root = memoryDirectory();
const drafts = await openDrafts({ root });
assert.equal(drafts.off, false);
assert.deepEqual(await drafts.load(base), { restored: {}, dropped: [] });

// What is saved comes back, each text under the BLAKE3 label of its bytes, stored once.
const changed = { '/src/App.lex.tex': 'one\nTWO', '/lexlean.toml': 'name = "z"' };
const labels = await drafts.save(base, changed);
assert.deepEqual(labels, { '/lexlean.toml': kappa(enc.encode('name = "z"')), '/src/App.lex.tex': kappa(enc.encode('one\nTWO')) });
assert.deepEqual(await drafts.load(base), { restored: changed, dropped: [] });
await drafts.save(base, { ...changed, '/copy': 'one\nTWO' });
assert.equal(root.entries.get('bytes').entries.size, 2, 'the same text is stored once');

// A draft belongs to the model it was made on: another model has none.
assert.deepEqual(await drafts.load(baseLabel('src/App.lex.tex', { ...files, '/lexlean.toml': 'name = "y"' })), { restored: {}, dropped: [] });

// Planted defect: a stored text altered behind the store's back no longer derives to its label, so it is left out
// and reported, and the other files are still restored.
await drafts.save(base, changed);
const stored = root.entries.get('bytes').entries.get(labels['/src/App.lex.tex'].slice(7));
stored.bytes = enc.encode('one\nTW0');
assert.deepEqual(await drafts.load(base), { restored: { '/lexlean.toml': 'name = "z"' }, dropped: ['/src/App.lex.tex'] });

// Planted defect: a draft that names another model's base, or a label that is not one, restores nothing from it.
const draftFile = root.entries.get('drafts').entries.get(base.slice(7));
draftFile.bytes = enc.encode(JSON.stringify({ schema: 'prism-ide/draft/1', base: 'blake3:' + '0'.repeat(64), files: labels }));
assert.deepEqual(await drafts.load(base), { restored: {}, dropped: [] });
draftFile.bytes = enc.encode(JSON.stringify({ schema: 'prism-ide/draft/1', base, files: { '/lexlean.toml': '../../etc/passwd' } }));
assert.deepEqual(await drafts.load(base), { restored: {}, dropped: ['/lexlean.toml'] });

// Nothing changed removes the draft; discard does the same.
await drafts.save(base, changed);
await drafts.save(base, {});
assert.deepEqual(await drafts.load(base), { restored: {}, dropped: [] });
await drafts.save(base, changed);
await drafts.discard(base);
assert.deepEqual(await drafts.load(base), { restored: {}, dropped: [] });

// A browser with no private file system keeps nothing, and nothing throws.
const none = await openDrafts({ root: null });
assert.equal(none.off, true);
assert.deepEqual(await none.save(base, changed), {});
assert.deepEqual(await none.load(base), { restored: {}, dropped: [] });
await none.discard(base);

console.log('drafts: changes come back under their BLAKE3 labels for the model they were made on; an altered text is left out and reported');
