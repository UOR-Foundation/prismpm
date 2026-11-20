// The archive a reader downloads a model as (ide/edit/model-tar.mjs): the system's own tar reads it back, the same
// model gives the same bytes and label, and a path that would leave the folder is refused.
// Usage: node ide/tools/model-tar-test.mjs
//
// model-tar.mjs imports prism-code as the published page lays it out (./prism-code/blake3.mjs), so this test loads
// it through a loader hook that points that one address at src/blake3.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kappa } from '../../src/blake3.mjs';
import { modelFiles } from '../../src/journey/model-files.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === './prism-code/blake3.mjs') return next(new URL('../../src/blake3.mjs', context.parentURL).href, context);
  return next(specifier, context);
}`));
const { modelTar } = await import('../edit/model-tar.mjs');

const long = 'language/' + 'a'.repeat(60) + '/' + 'b'.repeat(60) + '.toml';
const files = { '/lexlean.toml': 'name = "x"\n', '/src/App.lex.tex': 'one\ntwo\n', '/empty': '', '/src/deep/Ünï.lex.tex': 'é', ['/' + long]: 'k = 1\n', '/block': 'x'.repeat(512) };
const { bytes, label } = modelTar(files);

// One label, of the bytes, and whole blocks.
assert.equal(label, kappa(bytes));
assert.match(label, /^blake3:[0-9a-f]{64}$/);
assert.equal(bytes.length % 512, 0);

// The same model gives the same bytes whatever order its files come in or however its paths are written.
const reordered = Object.fromEntries(Object.entries(files).reverse().map(([path, text]) => [path.replace(/^\//, ''), text]));
assert.deepEqual(modelTar(reordered).bytes, bytes);
assert.notEqual(modelTar({ ...files, '/lexlean.toml': 'name = "y"\n' }).label, label);
assert.notEqual(modelTar(files, { folder: 'other' }).label, label);

// The system's tar unpacks it into the same files, byte for byte, under one folder.
const dir = mkdtempSync(join(tmpdir(), 'model-tar-'));
try {
  writeFileSync(join(dir, 'model.tar'), bytes);
  execFileSync('tar', ['-xf', 'model.tar'], { cwd: dir });
  for (const [path, text] of Object.entries(files)) assert.equal(readFileSync(join(dir, 'model', path), 'utf8'), text, path);
  const listed = execFileSync('tar', ['-tf', 'model.tar'], { cwd: dir, encoding: 'utf8' }).trim().split(/\r?\n/);
  assert.equal(listed.length, Object.keys(files).length);
  assert.ok(listed.every((name) => name.startsWith('model/')));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// A real model of this repository goes through whole.
const gate = modelFiles(new URL('../../model/ide-capability-gate', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), { skip: ['tools'] });
const real = modelTar(Object.fromEntries([...gate.files].map(([path, body]) => [path, new TextDecoder().decode(body)])));
assert.equal(real.label, kappa(real.bytes));

// Planted defects: a path that would leave the folder it is unpacked into, or that is not a path, is refused.
for (const bad of ['../outside', 'src/../../outside', '/', 'a//b', 'a/./b', 'a\\b', 'a\0b']) assert.throws(() => modelTar({ [bad]: 'x' }), /is not a path inside the model/, bad);
assert.throws(() => modelTar({ ['c'.repeat(101)]: 'x' }), /too long/);
assert.throws(() => modelTar(files, { folder: '../up' }), /folder name/);

console.log(`model-tar: the system's tar reads the archive back; the same model gives the same label; the gate model is ${real.bytes.length} bytes, ${real.label.slice(0, 19)}…`);
