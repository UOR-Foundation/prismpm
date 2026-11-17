// What Prism has proved is kept by content address and reused, so the same proof is never found twice (issue #692).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kappa } from '../src/uorc.mjs';
import { derivationKey, findProof, kappaStore, proofKey, proofRealization, proofReferences } from '../src/journey/kappa-store.mjs';
import { termReusable } from '../src/journey/canonical-rules.mjs';
import { KERNEL_AXIOMS, guaranteeStatement, kernelProve, openKernel, pinnedAddresses } from '../src/journey/kernel-prove.mjs';
import { ruleTable, tableWords } from '../src/journey/rule-table.mjs';
import { PARKING, ruleAppSnapshot } from './support/snapshot.mjs';
import { ruleAppRecord } from '../src/journey/rule-app.mjs';

process.env.PRISM_KERNEL_DIR = fileURLToPath(new URL('./fixtures/kernel/', import.meta.url));

/** A rule app's table, read from a snapshot of `app` (the `rule-app` starter's parking fees by default). */
const tableOf = (app = PARKING) => ruleTable(ruleAppSnapshot(app));
const stated = (app = PARKING) => tableWords(tableOf(app));
const home = () => ({ PRISM_HOME: mkdtempSync(join(tmpdir(), 'prism-kappa-')), PRISM_KERNEL_DIR: process.env.PRISM_KERNEL_DIR });
const enc = new TextEncoder();
const files = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name)) : []);

test('bytes are named by their κ-label, and a read re-derives it', () => {
  const store = kappaStore({ env: home() });
  const label = store.put(enc.encode('hello'));
  assert.equal(label, kappa(enc.encode('hello')));
  assert.deepEqual(store.get(label), enc.encode('hello'));
  assert.equal(store.put(enc.encode('hello')), label, 'equal bytes, equal label');
  assert.equal(store.get(kappa(enc.encode('absent'))), null);
  assert.equal(store.get('not a label'), null);
  // Planted defect M1: stored bytes altered on disk are not returned under their old name.
  const [file] = files(join(store.directory, 'bytes'));
  writeFileSync(file, 'hellp');
  assert.equal(store.get(label), null);
  // Off keeps nothing and answers nothing.
  const off = kappaStore({ env: { ...home(), PRISM_KAPPA: '0' } });
  const kept = off.put(enc.encode('x'));
  off.bind(kept, kept);
  assert.equal(off.get(kept), null);
  assert.equal(off.bound(kept), null);
  assert.equal(existsSync(off.directory), false);
});

test('a derivation key is over a domain and its operands in order, each framed by its length', () => {
  const [a, b] = [kappa(enc.encode('a')), kappa(enc.encode('b'))];
  assert.notEqual(derivationKey('d', [a, b]), derivationKey('d', [b, a]));
  assert.notEqual(derivationKey('d', [a, b]), derivationKey('e', [a, b]));
  assert.notEqual(derivationKey('d', [a]), derivationKey('d', [a, a]));
  // Framing: a domain cannot borrow bytes from the operand that follows it.
  assert.notEqual(derivationKey('ab', [a]), derivationKey('a', [a]));
  assert.equal(derivationKey('d', [a, b]), derivationKey('d', [a, b]));
  assert.throws(() => derivationKey('d', ['sha256:short']), /is not a κ-label/);
});

test('a proof names every input by κ-label, and they are read back out of it', () => {
  const k = (s) => kappa(enc.encode(s));
  const bytes = proofRealization({ key: k('key'), kernel: k('kernel'), library: k('library'), statement: k('statement'), policy: ['propext', 'Quot.sound'], bundle: k('bundle'), axioms: ['propext', 'Quot.sound'] });
  assert.deepEqual(proofReferences(bytes), [k('kernel'), k('library'), k('statement'), k('bundle')]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)).axioms, ['Quot.sound', 'propext']);
  assert.deepEqual(Object.keys(JSON.parse(new TextDecoder().decode(bytes))), ['schema', 'key', 'kernel', 'library', 'statement', 'policy', 'bundle', 'axioms']);
});

test('a proof term is produced once: the same model again produces nothing, the kernel judges every term again, and the app is byte for byte the same', { timeout: 120000 }, async () => {
  const env = home();
  const spec = stated();
  const first = await kernelProve(spec, { env });
  assert.deepEqual([first.reused, first.judged.map((j) => j.accepted)], [0, [true, true, true]]);
  // A kernel that must not produce a term but still judges every one (model/canonical-build, provedNeedsTheKernelToAcceptTheTermNow).
  const real = await openKernel();
  let checked = 0;
  const closed = { addresses: real.addresses, judge: () => assert.fail('a term was produced again'), check: (text) => (checked++, real.check(text)) };
  const again = await kernelProve(spec, { env, kernel: closed });
  assert.equal(again.reused, 3);
  assert.equal(checked, 3, 'every reused term was judged by the kernel');
  assert.deepEqual(again.judged.map((j) => [j.accepted, j.status, j.reused, j.axioms]), first.judged.map((j) => [true, 'proved', true, j.axioms]));
  assert.deepEqual(again.evidence, first.evidence);
  assert.deepEqual(Buffer.from(ruleAppRecord(tableOf(), { proof: again.evidence }).bytes), Buffer.from(ruleAppRecord(tableOf(), { proof: first.evidence }).bytes));
  // Reordering the guarantees proves nothing new: a proof does not depend on where its guarantee sits.
  const reordered = { ...spec, guarantees: [...spec.guarantees].reverse() };
  assert.equal((await kernelProve(reordered, { env, kernel: closed })).reused, 3);
});

test('only what changed is proved: an edited guarantee reuses the others, and an edited rule reuses none', { timeout: 120000 }, async () => {
  const env = home();
  await kernelProve(stated(), { env });
  const guarantee = await kernelProve(stated({ ...PARKING, guarantees: PARKING.guarantees.map((g, i) => (i === 2 ? { ...g, answer: 2 } : g)) }), { env });
  assert.deepEqual(guarantee.judged.map((j) => j.reused), [true, true, false]);
  assert.equal(guarantee.judged[2].accepted, true);
  const rule = await kernelProve(stated({ ...PARKING, rules: PARKING.rules.map((r, i) => (i === 3 ? { ...r, conditions: [{ field: 0, op: 2, value: 9 }] } : r)) }), { env });
  assert.deepEqual(rule.judged.map((j) => j.reused), [false, false, false]);
  // A guarantee the kernel refuses is not kept, so it is asked again and refused again.
  const broken = stated({ ...PARKING, rules: PARKING.rules.map((r, i) => (i === 1 ? { ...r, answer: 2 } : r)) });
  for (let round = 0; round < 2; round++) assert.deepEqual((await kernelProve(broken, { env })).judged.map((j) => [j.accepted, j.reused])[0], [false, false]);
});

test('planted defects M2 to M5 and C1 to C3: a stored term is reused only under the same key, kernel, library, statement, policy and bytes', { timeout: 120000 }, async () => {
  const env = home();
  const spec = stated();
  await kernelProve(spec, { env });
  const store = kappaStore({ env });
  const pinned = pinnedAddresses();
  const policy = KERNEL_AXIOMS;
  const { words, guarantees } = spec;
  const statement = guaranteeStatement(words, guarantees[0]);
  const key = proofKey({ kernel: pinned.kernel, library: pinned.library, statement, policy });
  const ask = (over = {}) => findProof(store, { key, kernel: pinned.kernel, library: pinned.library, statement, policy, ...over });
  const found = ask();
  assert.equal(termReusable(found.facts), true);
  assert.equal(found.proof.statement, statement);
  // M2: another kernel is pinned (a new release): nothing proved under the old one is reused.
  const other = kappa(enc.encode('another kernel'));
  assert.equal(termReusable(ask({ kernel: other }).facts), false);
  // C1: a stored proof under a changed library is not reused.
  assert.equal(termReusable(ask({ library: other }).facts), false);
  // C2: a weaker, or any other, axiom policy: a term judged under one policy is not reused under another.
  assert.equal(termReusable(ask({ policy: [...policy, 'Classical.choice'] }).facts), false);
  assert.equal(termReusable(ask({ policy: ['propext'] }).facts), false);
  // C3 and M3: a forged proof for a different statement, a term kept for one statement bound under another's key.
  // Its own bytes name the key and the statement it was made for.
  const statement1 = guaranteeStatement(words, guarantees[1]);
  const elsewhere = proofKey({ kernel: pinned.kernel, library: pinned.library, statement: statement1, policy });
  const label = store.bound(key);
  store.bind(elsewhere, label);
  const forged = findProof(store, { key: elsewhere, kernel: pinned.kernel, library: pinned.library, statement: statement1, policy });
  assert.equal(termReusable(forged.facts), false);
  assert.notEqual(forged.facts.storedStatement, forged.facts.statement);
  // M4: the proof's bytes are altered on disk: what is read no longer has the address the record names.
  const bundle = files(join(store.directory, 'bytes')).find((f) => readFileSync(f, 'utf8').includes('Prism'));
  writeFileSync(bundle, `${readFileSync(bundle, 'utf8')}\n`);
  const altered = ask();
  assert.equal(altered.facts.derivedBytes, '');
  assert.equal(termReusable(altered.facts), false);
  // So the kernel is asked again, and only for the proofs that are gone.
  const again = await kernelProve(spec, { env });
  assert.ok(again.reused < 3);
  assert.deepEqual(again.judged.map((j) => j.accepted), [true, true, true]);
  // M5: a record that is not a proof is not one, whatever key leads to it.
  const junk = store.put(enc.encode('{"schema":"prism/kernel-proof/2","key":"x"}\n'));
  store.bind(key, junk);
  assert.equal(ask().facts.present, 0);
});
