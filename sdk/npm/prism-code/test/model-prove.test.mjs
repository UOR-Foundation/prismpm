// The kernel path in prism-code (src/journey/model-prove.mjs): a model's semantic snapshot proved by Lean's kernel in
// this process. The kernel files come from the lean-prover package beside this one, by PRISM_MODEL_KERNEL_DIR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureModelKernel, modelProve, openModelKernel, MODEL_KERNEL_FILES } from '../src/journey/model-prove.mjs';
import { proverWhere } from '../src/journey/frontend.mjs';

const kernelPath = fileURLToPath(new URL('../../lean-prover/kernel-path/', import.meta.url));
const here = existsSync(join(kernelPath, 'library', 'base.ndjson.gz'));
const kernelDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-kernel-'));
  copyFileSync(join(kernelPath, 'kernel', 'lean-kernel.mjs'), join(dir, 'lean-kernel.mjs'));
  copyFileSync(join(kernelPath, 'kernel', 'lean-kernel.wasm.gz'), join(dir, 'lean-kernel.wasm.gz'));
  copyFileSync(join(kernelPath, 'library', 'base.ndjson.gz'), join(dir, 'base.ndjson.gz'));
  return dir;
};
const storeDir = () => mkdtempSync(join(tmpdir(), 'kappa-'));
const snapshot = (name) => JSON.parse(readFileSync(join(kernelPath, 'test', 'model', `${name}-snapshot.json`), 'utf8'));
const noFetch = async (url) => { throw new Error(`a request was made: ${url}`); };

test('an app is always proved in this process: PRISM_CODE_TIER=hosted no longer names a hosted verifier', () => {
  assert.equal(proverWhere(), 'kernel');
  assert.equal(proverWhere({ env: { PRISM_CODE_TIER: 'offline' } }), 'kernel');
  assert.equal(proverWhere({ env: { PRISM_CODE_TIER: 'hosted' } }), 'kernel');
});

test('the lowering and proof finder here are byte for byte the ones the sealed browser prover runs', { skip: !here && 'no lean-prover package beside this one' }, () => {
  for (const name of ['emit.mjs', 'lower.mjs']) {
    assert.ok(readFileSync(new URL(`../src/vendor/kernel-path/${name}`, import.meta.url)).equals(readFileSync(join(kernelPath, 'src', name))), name);
  }
});

test('the pinned files are the ones the lean-prover package carries', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  await ensureModelKernel({ env: { PRISM_MODEL_KERNEL_DIR: kernelDir() }, fetch: noFetch });
  assert.deepEqual(Object.keys(MODEL_KERNEL_FILES), ['lean-kernel.mjs', 'lean-kernel.wasm.gz', 'base.ndjson.gz']);
});

test('a file that is not the pinned bytes is refused', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  const dir = kernelDir();
  writeFileSync(join(dir, 'base.ndjson.gz'), 'not the base library');
  await assert.rejects(ensureModelKernel({ env: { PRISM_MODEL_KERNEL_DIR: dir }, fetch: noFetch }), /pinned bytes/);
});

test("a loan app and a seat-booking app are proved by Lean's kernel, sending nothing", { skip: !here && 'no lean-prover package beside this one' }, async () => {
  const env = { PRISM_MODEL_KERNEL_DIR: kernelDir(), PRISM_KAPPA_DIR: storeDir() };
  const loan = await modelProve(snapshot('loan'), { env, fetch: noFetch });
  assert.equal(loan.ok, true);
  assert.equal(loan.theorems.length, 3);
  assert.ok(loan.theorems.every((t) => t.status === 'proved'));
  const seat = await modelProve(snapshot('seat'), { env, fetch: noFetch });
  assert.equal(seat.ok, true);
  assert.equal(seat.theorems.length, 8);
  // Fewer axioms than declared is proved, and said.
  assert.ok(seat.theorems.some((t) => t.status === 'proved, on fewer axioms than declared'));
});

test('a theorem whose proof kind is not covered is not proved, and says why', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  const s = snapshot('loan');
  const th = s.modules.flatMap((m) => m.semantic.declarations).find((d) => d.kind === 'theorem');
  th.proof = { kind: 'induction' };
  const r = await modelProve(s, { kernel: await openModelKernel({ env: { PRISM_MODEL_KERNEL_DIR: kernelDir(), PRISM_KAPPA_DIR: storeDir() } }) });
  assert.equal(r.ok, false);
  assert.match(r.theorems.find((t) => t.name.endsWith(`.${th.name}`)).status, /proof kind induction is not covered/);
});

test('a false statement is not proved', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  const s = snapshot('seat');
  const th = s.modules.flatMap((m) => m.semantic.declarations).find((d) => d.kind === 'theorem' && d.name === 'startInBounds');
  th.statement.right.value = true; // breaksStartInBounds = true: false of this model
  const r = await modelProve(s, { kernel: await openModelKernel({ env: { PRISM_MODEL_KERNEL_DIR: kernelDir(), PRISM_KAPPA_DIR: storeDir() } }) });
  assert.equal(r.ok, false);
  assert.match(r.theorems.find((t) => t.name.endsWith('.startInBounds')).status, /^not proved/);
  // The other seven are still judged, and proved.
  assert.equal(r.theorems.filter((t) => t.status.startsWith('proved')).length, 7);
});

test('a theorem judged once is not judged again, in this app or in another app with the same theorem', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  const env = { PRISM_MODEL_KERNEL_DIR: kernelDir(), PRISM_KAPPA_DIR: storeDir() };
  const first = await modelProve(snapshot('seat'), { env, fetch: noFetch });
  assert.equal(first.ok, true);
  assert.equal(first.judged, 8);
  const again = await modelProve(snapshot('seat'), { env, fetch: noFetch });
  assert.equal(again.ok, true);
  assert.deepEqual([again.judged, again.remembered], [0, 8]);
  assert.deepEqual(again.theorems.map((t) => t.status), first.theorems.map((t) => t.status));
  // The same model in another project: other Lean names, the same keys.
  const other = snapshot('seat');
  for (const m of other.modules) m.lean_module = m.lean_module.replace(/^[^.]+/, 'AnotherApp');
  const elsewhere = await modelProve(other, { env, fetch: noFetch });
  assert.equal(elsewhere.ok, true);
  assert.deepEqual([elsewhere.judged, elsewhere.remembered], [0, 8]);
  // An edit is judged, and only it.
  const edited = snapshot('seat');
  const th = edited.modules.flatMap((m) => m.semantic.declarations).find((d) => d.kind === 'theorem' && d.name === 'inv002Holds');
  th.statement = { kind: 'eq', left: { kind: 'bool', value: false }, right: { kind: 'bool', value: false } };
  th.proof = { kind: 'reflexivity' }; th.axioms = [];
  const after = await modelProve(edited, { env, fetch: noFetch });
  assert.deepEqual([after.ok, after.judged, after.remembered], [true, 1, 7]);
});

test('statements with || are proved, in a hypothesis, nested, and as the goal; a false one is not', { skip: !here && 'no lean-prover package beside this one' }, async () => {
  // Before, every proof through `||` cited Init's Bool.or_eq_true, which the base library does not hold, and the
  // kernel refused it as an unknown constant.
  const r = await modelProve(snapshot('or'), { kernel: await openModelKernel({ env: { PRISM_MODEL_KERNEL_DIR: kernelDir(), PRISM_KAPPA_DIR: storeDir() } }) });
  const status = Object.fromEntries(r.theorems.map((t) => [t.name.slice(t.name.lastIndexOf('.') + 1), t.status]));
  for (const name of ['aSkillInstallsOnlyAsTheBytesItsPinnedModelRenders', 'aSkillInstallsOnlyWithNoNetworkSecretsOrExecution', 'everyNetworkCountIsZeroOrNot']) {
    assert.match(status[name], /^proved/, `${name}: ${status[name]}`);
  }
  assert.match(status.notEveryCountIsZero, /^not proved/);
  assert.doesNotMatch(Object.values(status).join('\n'), /unknown constant/);
});
