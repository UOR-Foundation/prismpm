// The machine store stays lean: what the installed prism-code pins is the only root of the pinned files, the proof
// cache is trimmed least recently used first, older folders are moved in or removed, and nothing is removed while a
// check, prove or build holds the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kappa } from '../src/blake3.mjs';
import { keepPinnedFile, kappaDirectory, pinnedFile } from '../src/journey/kappa-store.mjs';
import { KERNEL_COMMIT, KERNEL_FILES, readKernelFile } from '../src/journey/kernel-store.mjs';
import { collectIfUpgraded, collectStore, holdStore, pinnedRoots, rootsLabel } from '../src/journey/store-gc.mjs';

const home = () => ({ PRISM_HOME: mkdtempSync(join(tmpdir(), 'prism-gc-')) });
/** A pinned set of `n` files of `size` bytes, distinct per `tag`, kept as an install of that version would keep them. */
function install(env, tag, { n = 3, size = 4096 } = {}) {
  const roots = [];
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(size).fill(i + 1);
    bytes.set(new TextEncoder().encode(`${tag}/${i}`));
    roots.push(kappa(bytes));
    keepPinnedFile(bytes, kappa(bytes), env);
  }
  return roots.sort();
}
const pinnedHere = (env, roots) => roots.filter((r) => existsSync(pinnedFile(r, env)));

test('planted old manifest: an upgrade leaves only the new set, and two upgrades leave one set\'s bytes', () => {
  const env = home();
  const v1 = install(env, 'v1');
  assert.equal(collectStore({ env, roots: v1 }).freed, 0, 'the installed set is kept');
  const v2 = install(env, 'v2');
  const first = collectStore({ env, roots: v2 });
  assert.deepEqual([pinnedHere(env, v1), pinnedHere(env, v2)], [[], v2]);
  assert.equal(first.removed.pinned, 3);
  const v3 = install(env, 'v3');
  const second = collectStore({ env, roots: v3 });
  assert.deepEqual(pinnedHere(env, v3), v3);
  // The store after two upgrades holds exactly one set, beside the record of which set that is.
  assert.equal(second.after - readFileSync(join(kappaDirectory(env), 'roots.json')).length, 3 * 4096);
});

test('after an upgrade the first step collects on its own: a pinned file this prism-code does not name is gone', () => {
  const env = home();
  const [old] = install(env, 'older-prism-code', { n: 1 });
  mkdirSync(kappaDirectory(env), { recursive: true });
  writeFileSync(join(kappaDirectory(env), 'roots.json'), `${JSON.stringify({ roots: rootsLabel([old]) })}\n`);
  const r = collectIfUpgraded({ env });
  assert.equal(r.busy, false);
  assert.equal(existsSync(pinnedFile(old, env)), false);
  assert.equal(JSON.parse(readFileSync(join(kappaDirectory(env), 'roots.json'), 'utf8')).roots, rootsLabel(pinnedRoots()));
  // Nothing changed since: the next step does not collect again.
  assert.equal(collectIfUpgraded({ env }), null);
});

test('planted defect: a collection while a build holds the store removes nothing, in this process or another', async () => {
  const env = home();
  const [old] = install(env, 'old', { n: 1 });
  const release = holdStore({ env });
  const busy = collectStore({ env, roots: [] });
  assert.deepEqual([busy.busy, busy.freed, existsSync(pinnedFile(old, env))], [true, 0, true]);
  release();
  // Another process's build, still running.
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const { holdStore } = await import(${JSON.stringify(new URL('../src/journey/store-gc.mjs', import.meta.url).href)}); holdStore({ env: ${JSON.stringify(env)} }); process.stdout.write('held\\n'); setTimeout(() => {}, 30000);`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done) => child.stdout.once('data', done));
  assert.equal(collectStore({ env, roots: [] }).busy, true);
  assert.equal(existsSync(pinnedFile(old, env)), true, 'the running build still reads its file');
  child.kill();
  await new Promise((done) => child.once('exit', done));
  // Its hold went with it: a hold whose process is gone does not block.
  const after = collectStore({ env, roots: [] });
  assert.deepEqual([after.busy, existsSync(pinnedFile(old, env))], [false, false]);
});

test('the proof cache is trimmed to its size, least recently used first', () => {
  const env = { ...home(), PRISM_KAPPA_CACHE_MB: String(2 * 1024 / (1024 * 1024)) };
  const files = ['a', 'b', 'c'].map((name, i) => {
    const file = join(kappaDirectory(env), 'bytes', 'ab', name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, new Uint8Array(1024));
    const t = new Date(Date.UTC(2026, 0, 1 + i));
    utimesSync(file, t, t);
    return file;
  });
  const r = collectStore({ env });
  assert.equal(r.removed.cache, 1);
  assert.deepEqual(files.map(existsSync), [false, true, true], 'the oldest use goes first');
});

test('the folders of older prism-codes: a pinned file is moved in and kept, the rest is removed', () => {
  const env = home();
  const kernel = join(env.PRISM_HOME, 'kernel', KERNEL_COMMIT);
  mkdirSync(kernel, { recursive: true });
  const holo = readFileSync(new URL('./fixtures/kernel/kernel.holo', import.meta.url));
  writeFileSync(join(kernel, 'kernel.holo'), holo);
  mkdirSync(join(env.PRISM_HOME, 'lexlean'), { recursive: true });
  writeFileSync(join(env.PRISM_HOME, 'lexlean', 'old.wasm'), new Uint8Array(2048));
  const dry = collectStore({ env, dryRun: true });
  assert.equal(existsSync(join(env.PRISM_HOME, 'lexlean', 'old.wasm')), true, 'a dry run removes nothing');
  const r = collectStore({ env });
  assert.equal(r.freed, dry.freed, 'the dry run said what the collection freed');
  assert.equal(r.freed, 2048);
  assert.deepEqual([existsSync(join(env.PRISM_HOME, 'kernel')), existsSync(join(env.PRISM_HOME, 'lexlean'))], [false, false]);
  assert.deepEqual(readKernelFile('kernel.holo', { env }), holo, 'moved in, not fetched again');
  assert.equal(KERNEL_FILES['kernel.holo'].kappa, kappa(holo));
});

test('a file a crash left half written is removed once its process is gone, never while it runs', () => {
  const env = home();
  const dir = join(kappaDirectory(env), 'pinned', 'ab');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `cd.999999.partial`), new Uint8Array(100));
  writeFileSync(join(dir, `ef.${process.pid}.partial`), new Uint8Array(100));
  const r = collectStore({ env });
  assert.equal(r.removed.partial, 1);
  assert.deepEqual([existsSync(join(dir, 'cd.999999.partial')), existsSync(join(dir, `ef.${process.pid}.partial`))], [false, true]);
});
