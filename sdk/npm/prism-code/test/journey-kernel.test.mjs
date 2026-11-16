// The journey's check with Lean's kernel in this process: no Docker, no image, no server (issue #692).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/journey/session.mjs';
import { appDir, readSession } from '../src/journey/project.mjs';
import { prove, proveWhere } from '../src/journey/engine.mjs';
import { KERNEL_AXIOMS, KernelUnread, WORD_MAX, kernelProve, readPinned, ruleWords } from '../src/journey/kernel-prove.mjs';

process.env.PRISM_HOME = mkdtempSync(join(tmpdir(), 'prism-home-'));

const PARKING = {
  purpose: 'Parking fee tier: decide the parking fee tier for a vehicle from the hours parked and the vehicle type.',
  fields: 'hours: number 0..24, vehicle: car|motorcycle|truck',
  outcomes: 'free, standard, premium',
  rules: 'when hours = 0 then free\nwhen vehicle is motorcycle then free\nwhen vehicle is truck then premium\nwhen hours > 8 then premium\notherwise standard',
  properties: 'never when vehicle is motorcycle then premium\nalways when vehicle is truck and hours > 0 then premium\nnever when hours = 0 then standard',
  examples: '0 car -> free\n3 car -> standard\n10 car -> premium',
};
// Two fields compared with each other: the rule judge does not read it.
const PAYMENT = {
  purpose: 'Payment approval: decide whether a payment request is approved.',
  fields: 'role: clerk|manager, amount: number 1..1000000, limit: number 0..1000000',
  outcomes: 'approved, refused',
  rules: 'when role is manager then approved\nwhen amount is at most limit then approved\notherwise refused',
  properties: 'always when role is manager then approved',
  examples: 'clerk 250 1000 -> approved',
};

const specOf = (answers) => compile({ ...answers, review: 'yes' }).spec;
function app(answers) {
  const dir = appDir(mkdtempSync(join(tmpdir(), 'prism-journey-kernel-')));
  return { dir, session: { ...readSession(dir), spec: specOf(answers), axioms: {}, status: {} } };
}

test('where the proof runs: only PRISM_CODE_TIER=kernel chooses the kernel in this process', () => {
  const { dir, session } = app(PARKING);
  assert.equal(proveWhere(dir, session, { env: { PRISM_CODE_TIER: 'kernel' } }), 'kernel');
  assert.equal(proveWhere(dir, session, { env: {} }), 'local');
  assert.equal(proveWhere(dir, session, { env: { PRISM_CODE_TIER: 'hosted' } }), 'hosted');
});

test('a spec is written as the numbers the rule judge reads, the same numbers every time', () => {
  const { words, guarantees } = ruleWords(specOf(PARKING));
  // version, fields, each field's least and greatest, otherwise, rules, then each rule: conditions, answer, (field, operator, value)*.
  // Answers are numbered from `otherwise`: standard 0, free 1, premium 2.
  assert.deepEqual(words, [1, 2, 0, 24, 0, 2, 0, 4, 1, 1, 0, 4, 0, 1, 1, 1, 4, 1, 1, 2, 1, 4, 2, 1, 2, 0, 2, 8]);
  assert.deepEqual(guarantees, [
    { always: false, when: [[1, 4, 1]], outcome: 2 },
    { always: true, when: [[1, 4, 2], [0, 2, 0]], outcome: 2 },
    { always: false, when: [[0, 4, 0]], outcome: 0 },
  ]);
  assert.deepEqual(ruleWords(specOf(PARKING)), { words, guarantees });
});

test('a spec the rule judge does not read is refused by name, not guessed at', () => {
  const refusal = (spec) => {
    try {
      ruleWords(spec);
    } catch (error) {
      assert.ok(error instanceof KernelUnread);
      return error.code;
    }
    return null;
  };
  assert.equal(refusal(specOf(PAYMENT)), 'kernel.two-fields');
  const spec = specOf(PARKING);
  // A number field with no upper bound accepts requests the judge's 32-bit words cannot hold.
  assert.equal(refusal({ ...spec, fields: [{ ...spec.fields[0], max: undefined }, spec.fields[1]] }), 'kernel.range');
  assert.equal(refusal({ ...spec, fields: [{ ...spec.fields[0], max: WORD_MAX + 1 }, spec.fields[1]] }), 'kernel.range');
  assert.equal(refusal({ ...spec, actions: [] }), 'kernel.stateful');
  assert.equal(refusal(spec), null);
});

test("Lean's kernel accepts every guarantee of a rule app, on the lemma's axioms only, and says what that is worth", { timeout: 120000 }, async () => {
  const { dir, session } = app(PARKING);
  const lines = [];
  const r = await prove(dir, session, { where: 'kernel', log: (l) => lines.push(l) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.where, 'kernel');
  assert.deepEqual(r.properties.map((p) => p.status), ['kernel-checked', 'kernel-checked', 'kernel-checked']);
  assert.match(r.message, /^Lean's kernel accepted all 3 guarantees for every request in the fields' bounds, in [\d.]+ s\. /);
  // Planted defect K4: the kernel route never calls its answer the proof of the built app.
  assert.match(r.message, /It is not yet the proof of the built app/);
  assert.doesNotMatch(r.message, /Lean proved/);
  assert.equal(session.status.proved, undefined);
  assert.deepEqual(session.status.properties, { 'INV-001': 'kernel-checked', 'INV-002': 'kernel-checked', 'INV-003': 'kernel-checked' });
  const manifest = JSON.parse(readFileSync(new URL('../src/journey/kernel/manifest.json', import.meta.url), 'utf8'));
  assert.equal(r.evidence.kernel, `sha256:${manifest.wasm.sha256}`);
  assert.equal(r.evidence.library, `sha256:${manifest.library.sha256}`);
  assert.deepEqual(r.evidence.axioms, [...KERNEL_AXIOMS]);
  assert.equal(session.status.kernelChecked.statement, r.evidence.statement);
  assert.match(lines[0], /No SDK image is used and nothing is sent/);
  // The same spec gives the same proof bytes and the same statement.
  const again = await kernelProve(session.spec);
  assert.equal(again.evidence.bundle, r.evidence.bundle);
  assert.equal(again.evidence.statement, r.evidence.statement);
});

test('planted defect K1: a rule that breaks a guarantee is refused by the kernel, with the request that breaks it', { timeout: 120000 }, async () => {
  const { dir, session } = app(PARKING);
  // The checker refuses the draft's false guarantee before a proof is asked for, so the spec is taken as written.
  session.spec = { ...specOf(PARKING), rules: specOf(PARKING).rules.map((rule, i) => (i === 1 ? { ...rule, then: 'premium' } : rule)) };
  const r = await prove(dir, session, { where: 'kernel', overwrite: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.properties.map((p) => p.status), ['failing', 'kernel-checked', 'kernel-checked']);
  assert.match(r.message, /^INV-001 is false\. The request `\d+ motorcycle` meets "vehicle is motorcycle" and the rules answer premium \(REQ-002\)\./);
  assert.equal(session.status.kernelChecked, null);
  assert.equal(session.status.proved, undefined);
  // It is the kernel that refuses: the writer states `wordsCheck … = true` whatever the rules are.
  const judged = (await kernelProve(session.spec)).judged;
  assert.match(judged[0].output, /\(kernel\) declaration type mismatch/);
  assert.deepEqual(judged.map((j) => j.accepted), [false, true, true]);
});

test('a guarantee this route cannot prove is unknown, never false and never accepted', { timeout: 120000 }, async () => {
  const { dir, session } = app(PARKING);
  // True: after eight hours a car and a truck pay premium, and only the motorcycle, which it excludes, parks free.
  // The excluded value lies between the other two, and the pinned lemma does not yet split an `is not`
  // (foundry #231), so the kernel does not accept it. When the library gains that lemma this expectation changes.
  session.spec = { ...session.spec, properties: [...session.spec.properties, { id: 'INV-004', kind: 'never', when: [{ field: 'vehicle', op: 'is not', value: 'motorcycle' }, { field: 'hours', op: '>', value: 8 }], then: 'free', says: 'never when vehicle is not motorcycle and hours > 8 then free', why: 'a long stay is never free for a car or a truck' }] };
  const r = await prove(dir, session, { where: 'kernel', overwrite: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.properties.map((p) => p.status), ['kernel-checked', 'kernel-checked', 'kernel-checked', 'unknown']);
  assert.match(r.message, /^Lean's kernel did not accept INV-004 .* this is not a verdict on INV-004\./);
  assert.doesNotMatch(r.message, /INV-004 is false/);
  assert.equal(r.next, undefined);
});

test('a spec the route does not read sends the user to the SDK image, and records nothing', async () => {
  const { dir, session } = app(PAYMENT);
  const r = await prove(dir, session, { where: 'kernel' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'kernel.two-fields');
  assert.match(r.message, /^Lean's kernel in this process cannot read this spec: it compares `amount` with another field.* unset PRISM_CODE_TIER and call prism_prove again\.$/);
  assert.equal(session.status.properties, undefined);
  assert.equal(session.status.kernelChecked, undefined);
});

test('planted defect K2 and K3: altered bytes and an unbound library are refused before the kernel runs', () => {
  const real = (file) => readFileSync(new URL(`../src/journey/kernel/${file}`, import.meta.url));
  assert.equal(readPinned().addresses.kernel, JSON.parse(real('manifest.json')).wasm.sha256);
  for (const altered of ['lean-kernel.mjs', 'lean-kernel.wasm.gz', 'library.ndjson.gz']) {
    const other = altered === 'lean-kernel.mjs' ? Buffer.concat([real(altered), Buffer.from('\n')]) : real(altered === 'lean-kernel.wasm.gz' ? 'library.ndjson.gz' : 'lean-kernel.wasm.gz');
    assert.throws(() => readPinned({ read: (file) => (file === altered ? other : real(file)) }), /is not the pinned one/, altered);
  }
  const unbound = JSON.parse(real('manifest.json'));
  unbound.binding.library = '0'.repeat(64);
  assert.throws(() => readPinned({ read: (file) => (file === 'manifest.json' ? Buffer.from(JSON.stringify(unbound)) : real(file)) }), /no record that this kernel judged this library whole/);
});
