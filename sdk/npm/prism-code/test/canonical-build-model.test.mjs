// The canonical build's rules are stated in LexLean and proved by Lean (model/canonical-build). This suite evaluates
// the model's own text beside the JavaScript that follows it (src/journey/canonical-rules.mjs) on generated inputs,
// so a change to either that the other does not share is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { STATUS, holoAdmitted, judgedFacts, proved, status, termReusable, withinPolicy } from '../src/journey/canonical-rules.mjs';
import { definitions, evaluator } from './support/lexlean-eval.mjs';

const read = (file) => readFileSync(new URL(`../model/canonical-build/${file}`, import.meta.url), 'utf8');
const MODEL = read('src/CanonicalBuild.lex.tex');
const PROOFS = read('src/CanonicalBuildProofs.lex.tex');
const VERIFIED = JSON.parse(read('verification.json'));
const model = evaluator(definitions(MODEL));
const proofs = evaluator(new Map([...definitions(MODEL), ...definitions(PROOFS)]));

/** The fields of one model structure, in order. */
const fieldsOf = (name) => {
  const m = new RegExp(`structure\\{\\s*name: ${name},[\\s\\S]*?fields: \\[([\\s\\S]*?)\\]\\s*\\}`).exec(MODEL);
  return [...m[1].matchAll(/\{name: (\w+), type: Nat\}/g)].map((f) => f[1]);
};
const SEAL = fieldsOf('Seal');
const STORED = fieldsOf('Stored');
const JUDGED = fieldsOf('Judged');

// A generator with a fixed seed, so a failure names the same input every run. Each input starts as one the rule
// admits and then has none, one or two facts changed, so every clause is broken on its own.
function generator(seed) {
  return (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % n;
  };
}
function* inputs(count, fields, good, seed) {
  const next = generator(seed);
  for (let i = 0; i < count; i++) {
    const x = good(next);
    for (let changes = next(3); changes > 0; changes--) x[fields[next(fields.length)]] = next(3);
    yield x;
  }
}
const seals = (n) => inputs(n, SEAL, (next) => {
  const [id, k, l, c] = [next(3), next(3), next(3), next(3)];
  return { sealedId: id, recomputedId: id, kernelNamed: k, kernelPinned: k, libraryNamed: l, libraryPinned: l, compilerNamed: c, compilerPinned: c };
}, 0x5ea1);
const storeds = (n) => inputs(n, STORED, (next) => {
  const [key, k, l, st, p, b] = Array.from({ length: 6 }, () => next(3));
  return { present: 1, storedKey: key, computedKey: key, storedKernel: k, kernelPinned: k, storedLibrary: l, libraryPinned: l, storedStatement: st, statement: st, storedPolicy: p, policy: p, storedBytes: b, derivedBytes: b };
}, 0x57023d);
const judgeds = (n) => inputs(n, JUDGED, (next) => {
  const [t, st] = [next(3), next(3)];
  return { hasTerm: 1, termNamed: t, termDerived: t, termStatement: st, statement: st, kernelRan: 1, kernelAccepted: 1, observedPropext: next(2), observedChoice: 0, observedQuot: next(2), observedOther: 0, policyPropext: 1, policyChoice: next(2), policyQuot: 1, source: next(3) };
}, 0x1d6ed);

test('the JavaScript names exactly the model\'s fields', () => {
  assert.deepEqual(SEAL, ['sealedId', 'recomputedId', 'kernelNamed', 'kernelPinned', 'libraryNamed', 'libraryPinned', 'compilerNamed', 'compilerPinned']);
  assert.equal(STORED.length, 13);
  assert.deepEqual(Object.keys(judgedFacts({ statement: 0, axioms: [], policy: [] })), JUDGED);
});

test('admission of a holo is the model\'s, on 20,000 seals', () => {
  let admitted = 0;
  for (const s of seals(20000)) {
    assert.equal(holoAdmitted(s), model('holoAdmitted', [s]), JSON.stringify(s));
    assert.equal(proofs('breaksSealIdentity', [s]), false);
    assert.equal(proofs('breaksSealPins', [s]), false);
    admitted += holoAdmitted(s) ? 1 : 0;
  }
  assert.ok(admitted > 2000 && admitted < 18000, String(admitted));
});

test('reuse of a stored term is the model\'s, on 20,000 stored terms', () => {
  let reused = 0;
  for (const s of storeds(20000)) {
    assert.equal(termReusable(s), model('termReusable', [s]), JSON.stringify(s));
    for (const breaks of ['breaksReuse', 'breaksReusePolicy', 'breaksNothingStored']) assert.equal(proofs(breaks, [s]), false, breaks);
    reused += termReusable(s) ? 1 : 0;
  }
  assert.ok(reused > 2000 && reused < 18000, String(reused));
});

test('proved, refused and pending are the model\'s, on 20,000 judgements, and where a term came from never decides', () => {
  const seen = new Set();
  for (const j of judgeds(20000)) {
    assert.equal(withinPolicy(j), model('withinPolicy', [j]), JSON.stringify(j));
    assert.equal(proved(j), model('proved', [j]), JSON.stringify(j));
    assert.equal(status(j), model('status', [j]), JSON.stringify(j));
    for (const breaks of ['breaksKernelNow', 'breaksMissingTerm', 'breaksBinding', 'breaksPolicy', 'breaksStatus', 'breaksPending']) assert.equal(proofs(breaks, [j]), false, breaks);
    for (const source of [0, 1, 2]) {
      const k = { ...j, source };
      assert.equal(proved(k), proved(j));
      assert.equal(proofs('breaksSourceBlind', [j, k]), false);
    }
    seen.add(STATUS[status(j)]);
  }
  assert.deepEqual([...seen].sort(), ['pending', 'proved', 'refused']);
});

test('judgedFacts reads the kernel\'s answer and the policy as the model\'s numbers', () => {
  const policy = ['Quot.sound', 'propext'];
  const base = { hasTerm: true, termNamed: 'a', termDerived: 'a', termStatement: 's', statement: 's', kernelRan: true, kernelAccepted: true, policy };
  assert.equal(proved(judgedFacts({ ...base, axioms: ['propext'] })), true);
  // Planted defect: an axiom outside the theorem's policy, or one Lean does not admit by name, is never proved.
  assert.equal(proved(judgedFacts({ ...base, axioms: ['Classical.choice'] })), false);
  assert.equal(proved(judgedFacts({ ...base, axioms: ['sorryAx'] })), false);
  // A kernel that did not answer, a missing term, or another statement is never proved.
  assert.equal(STATUS[status(judgedFacts({ ...base, kernelAccepted: false, axioms: null }))], 'refused');
  assert.equal(STATUS[status(judgedFacts({ ...base, hasTerm: false, kernelRan: false, axioms: null }))], 'pending');
  assert.equal(proved(judgedFacts({ ...base, termStatement: 'other', axioms: [] })), false);
  assert.equal(proved(judgedFacts({ ...base, termNamed: 'b', axioms: [] })), false);
});

test('every theorem says its counterexample is impossible, and the record of Lean\'s verdict names these exact files', () => {
  const theorems = [...PROOFS.matchAll(/theorem\{\s*name: (\w+),\s*parameters: \[[^\]]*\],\s*statement: \(\((\w+) [^)]*\) = false\),\s*proof: linear_arithmetic\{/g)];
  assert.equal(theorems.length, 12);
  assert.equal((PROOFS.match(/theorem\{/g) || []).length, 12, 'every theorem has that one form');
  assert.ok(!/sorry|native_decide|axiom\{/.test(MODEL + PROOFS));
  const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  assert.equal(VERIFIED.schema, 'prism/model-verification/1');
  assert.equal(VERIFIED.result, 'verified 2 modules');
  assert.equal(VERIFIED.lean, '4.32.1');
  assert.equal(VERIFIED.sources['src/CanonicalBuild.lex.tex'], sha(readFileSync(new URL('../model/canonical-build/src/CanonicalBuild.lex.tex', import.meta.url))));
  assert.equal(VERIFIED.sources['src/CanonicalBuildProofs.lex.tex'], sha(readFileSync(new URL('../model/canonical-build/src/CanonicalBuildProofs.lex.tex', import.meta.url))));
  assert.equal(VERIFIED.sources['lexlean.lock'], sha(readFileSync(new URL('../model/canonical-build/lexlean.lock', import.meta.url))));
  assert.deepEqual(VERIFIED.theorems.map((t) => t.name), theorems.map((t) => t[1]));
  assert.ok(VERIFIED.plantedDefects.every((d) => d.rejected.length > 0 && d.restored === 'verified 2 modules'));
});
