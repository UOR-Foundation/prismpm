// LexLean's front end as WebAssembly (docs/proposals/canonical-serverless-build.md, Phase 3): pinned bytes only, the
// front end chosen before the SDK image but never over the user's hosted opt-in, and, with the real module, a rule app
// checked, read from its semantic snapshot and proved by Lean's kernel on this machine with no Docker and no server.
// The real module is 19 MB and is not in the repository: PRISM_LEXLEAN_WASM names it, and with no module the
// end-to-end case says it did not run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kappa } from '../src/blake3.mjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLexleanWasm, hasLexleanWasm, lexleanWasmFile, projectFiles, wasmCheck, wasmSnapshot } from '../src/journey/lexlean-wasm.mjs';
import { frontendWhere, proverWhere } from '../src/journey/frontend.mjs';
import { runWasi } from '../src/journey/wasi-memory.mjs';
import { ruleTable, tableWords } from '../src/journey/rule-table.mjs';
import { kernelProve } from '../src/journey/kernel-prove.mjs';

process.env.PRISM_KERNEL_DIR = fileURLToPath(new URL('./fixtures/kernel/', import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), 'prism-lexlean-wasm-'));

test('the front end is the user\'s hosted opt-in, else LexLean as WebAssembly, else the SDK image, else refused', () => {
  const yes = () => true;
  const no = () => false;
  assert.equal(frontendWhere({ env: { PRISM_CODE_TIER: 'hosted' }, hasWasm: yes, hasLocal: yes }), 'hosted');
  assert.equal(frontendWhere({ env: {}, hasWasm: yes, hasLocal: yes }), 'wasm');
  assert.equal(frontendWhere({ env: {}, hasWasm: no, hasLocal: yes }), 'local');
  assert.throws(() => frontendWhere({ env: {}, hasWasm: no, hasLocal: no }), { code: 'build.frontend-unavailable' });
  // Proving an app's own theorems needs Lean, which the WebAssembly front end does not carry.
  assert.equal(proverWhere({ env: {}, hasLocal: yes }), 'local');
  assert.throws(() => proverWhere({ env: {}, hasLocal: no }), (e) => e.code === 'build.frontend-unavailable' && /Phase 4/.test(e.message));
});

test('planted defect: a module whose bytes are not the pinned ones is refused, kept or named', async () => {
  const dir = scratch();
  const good = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  const pin = { kappa: kappa(good), bytes: good.length, url: null };
  const file = join(dir, 'lexlean.wasm');
  writeFileSync(file, good);
  assert.equal(lexleanWasmFile({ env: { PRISM_LEXLEAN_WASM: file }, pin }), file);
  writeFileSync(file, new Uint8Array([...good, 0]));
  assert.throws(() => lexleanWasmFile({ env: { PRISM_LEXLEAN_WASM: file }, pin }), { code: 'lexlean.wasm-mismatch' });
  assert.equal(hasLexleanWasm({ env: { PRISM_LEXLEAN_WASM: file }, pin }), false);
  // Nothing on this machine, and nowhere pinned to fetch it from: refused by name, and nothing is asked of the network.
  let asked = 0;
  await assert.rejects(ensureLexleanWasm({ env: { PRISM_HOME: dir }, pin, fetch: async () => (asked++, new Response('')) }), { code: 'lexlean.wasm-unavailable' });
  assert.equal(asked, 0);
  // A fetched module is kept only when it has the pinned address.
  const { gzipSync } = await import('node:zlib');
  const served = { ...pin, url: 'https://raw.githubusercontent.com/someone/somewhere/0123456789abcdef0123456789abcdef01234567/lexlean.wasm.gz' };
  await assert.rejects(ensureLexleanWasm({ env: { PRISM_HOME: dir }, pin: served, fetch: async () => new Response(gzipSync(new Uint8Array([1, 2, 3]))) }), { code: 'lexlean.wasm-mismatch' });
  const kept = join(dir, 'lexlean', `${pin.kappa.slice(7)}.wasm`);
  assert.equal(existsSync(kept), false);
  assert.equal(await ensureLexleanWasm({ env: { PRISM_HOME: dir }, pin: served, fetch: async () => new Response(gzipSync(good)) }), kept);
});

test('the project the instance sees holds its sources and none of its build outputs', () => {
  const dir = scratch();
  for (const path of ['lexlean.toml', 'src/App.lex.tex', '.lexlean/build/z', '.lake/q', '.prism/site/s']) {
    const file = join(dir, ...path.split('/'));
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, path);
  }
  assert.deepEqual([...projectFiles(dir).keys()].sort(), ['/lexlean.toml', '/src/App.lex.tex']);
});

const REAL = process.env.PRISM_LEXLEAN_WASM && existsSync(process.env.PRISM_LEXLEAN_WASM) ? process.env.PRISM_LEXLEAN_WASM : null;
const PROJECT = process.env.PRISM_LEXLEAN_PROJECT ?? null;

test('with the real module: a rule app is checked, read from its snapshot and proved here, with no Docker and no server', { skip: !(REAL && PROJECT) && 'PRISM_LEXLEAN_WASM and PRISM_LEXLEAN_PROJECT name no module and project; nothing was run', timeout: 300000 }, async () => {
  const bytes = readFileSync(REAL);
  const pin = { kappa: kappa(bytes), bytes: bytes.length, url: null };
  const env = { ...process.env, PRISM_LEXLEAN_WASM: REAL };
  const checked = await wasmCheck(PROJECT, { env, pin });
  assert.equal(checked.success, true, JSON.stringify(checked.diagnostics));
  const taken = await wasmSnapshot(PROJECT, { env, pin });
  assert.equal(taken.ok, true);
  assert.equal(taken.snapshot.semantic_id, checked.semantic_id, 'the snapshot is the model check named');
  assert.equal(taken.kappa, kappa(taken.bytes));
  const table = ruleTable(taken.snapshot);
  const proved = await kernelProve(tableWords(table), { env: { ...env, PRISM_HOME: scratch() } });
  assert.deepEqual(proved.judged.map((j) => j.status), table.guarantees.map(() => 'proved'));
  // The host is read only: a command that writes is refused by LexLean on WASI, and nothing is written.
  const fmt = await runWasi(await WebAssembly.compile(bytes), { files: projectFiles(PROJECT), args: ['--diagnostic-format', 'json', 'fmt'] });
  assert.notEqual(fmt.exit, 0);
  assert.match(new TextDecoder().decode(fmt.stdout), /LLV7010/);
});
