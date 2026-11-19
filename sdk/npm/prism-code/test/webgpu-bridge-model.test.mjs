// The WebGPU bridge's rules are stated in LexLean and proved by Lean (model/webgpu-bridge). This suite evaluates the
// model's own text beside the JavaScript that follows it (src/webgpu.mjs) on generated inputs, so a change to either
// that the other does not share is refused, and shows that a refused plan never reaches the device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { VERDICT, agrees, buffersFit, compare, comparisonFacts, dispatchCovers, kernelAddress, kernelBound, kernelShape, planAdmitted, planFacts, readbackAdmitted, readbackFacts, runPlan, verdict } from '../src/webgpu.mjs';
import { definitions, evaluator } from './support/lexlean-eval.mjs';

const read = (file) => readFileSync(new URL(`../model/webgpu-bridge/${file}`, import.meta.url), 'utf8');
const MODEL = read('src/WebGpuBridge.lex.tex');
const PROOFS = read('src/WebGpuBridgeProofs.lex.tex');
const VERIFIED = JSON.parse(read('verification.json'));
const model = evaluator(definitions(MODEL));
const proofs = evaluator(new Map([...definitions(MODEL), ...definitions(PROOFS)]));
const WGSL = readFileSync(new URL('./fixtures/webgpu/q4-group-sums.wgsl', import.meta.url), 'utf8');

const fieldsOf = (name) => {
  const m = new RegExp(`structure\\{\\s*name: ${name},[\\s\\S]*?fields: \\[([\\s\\S]*?)\\]\\s*\\}`).exec(MODEL);
  return [...m[1].matchAll(/\{name: (\w+), type: Nat\}/g)].map((f) => f[1]);
};
const PLAN = fieldsOf('Plan');
const READBACK = fieldsOf('Readback');
const COMPARISON = fieldsOf('Comparison');

// A generator with a fixed seed, so a failure names the same input every run. Each input starts as one the rule
// admits and then has none, one or two facts nudged, so every clause is broken on its own.
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
    for (let changes = next(3); changes > 0; changes--) {
      const f = fields[next(fields.length)];
      x[f] = Math.max(0, x[f] + next(5) - 2);
    }
    yield x;
  }
}
const plans = (n) => inputs(n, PLAN, (next) => {
  const [k, b, size, inv] = [next(3), 1 + next(4), 1 + next(64), 1 + next(300)];
  const groups = Math.ceil(inv / size);
  return { adapter: 1, kernelNamed: k, kernelDerived: k, bindings: b, buffers: b, outputs: 1 + next(b), emptyBuffers: 0, largestBuffer: next(100), bufferLimit: 100, invocations: inv, workgroupSize: size, dispatched: groups * size, workgroups: groups, workgroupLimit: groups + next(3) };
}, 0x6b9);
const readbacks = (n) => inputs(n, READBACK, (next) => {
  const w = next(9);
  return { expectedWords: w, readWords: w, trailingBytes: 0 };
}, 0x2eadbac);
const comparisons = (n) => inputs(n, COMPARISON, (next) => {
  const w = next(9);
  return { ran: 1, planOk: 1, readbackOk: 1, cpuWords: w, gpuWords: w, differing: 0 };
}, 0xc0ffee);

test('the JavaScript names exactly the model\'s fields', () => {
  assert.deepEqual(Object.keys(planFacts({ wgsl: WGSL, kernel: '', invocations: 1, buffers: [[1]] })), PLAN);
  assert.deepEqual(Object.keys(readbackFacts(1, new ArrayBuffer(4))), READBACK);
  assert.deepEqual(Object.keys(comparisonFacts({ cpu: [], gpu: [] })), COMPARISON);
});

test('admission of a plan is the model\'s, on 20,000 plans', () => {
  let admitted = 0;
  for (const p of plans(20000)) {
    for (const [name, rule] of [['kernelBound', kernelBound], ['buffersFit', buffersFit], ['dispatchCovers', dispatchCovers], ['planAdmitted', planAdmitted]]) assert.equal(rule(p), model(name, [p]), `${name} ${JSON.stringify(p)}`);
    for (const breaks of ['breaksAdapter', 'breaksKernelAddress', 'breaksBindings', 'breaksLimits', 'breaksCoverage', 'breaksSpareWorkgroup']) assert.equal(proofs(breaks, [p]), false, breaks);
    admitted += planAdmitted(p) ? 1 : 0;
  }
  assert.ok(admitted > 2000 && admitted < 18000, String(admitted));
});

test('admission of a readback and the verdict are the model\'s, on 20,000 of each', () => {
  for (const r of readbacks(20000)) {
    assert.equal(readbackAdmitted(r), model('readbackAdmitted', [r]), JSON.stringify(r));
    assert.equal(proofs('breaksReadback', [r]), false);
  }
  const seen = new Set();
  for (const c of comparisons(20000)) {
    assert.equal(agrees(c), model('agrees', [c]), JSON.stringify(c));
    assert.equal(verdict(c), model('verdict', [c]), JSON.stringify(c));
    for (const breaks of ['breaksAgreementWords', 'breaksAgreementRun', 'breaksVerdict', 'breaksNotRun']) assert.equal(proofs(breaks, [c]), false, breaks);
    seen.add(VERDICT[verdict(c)]);
  }
  assert.deepEqual([...seen].sort(), ['agree', 'differ', 'not-run']);
});

test('planFacts reads a kernel\'s bindings, workgroup and address from its WGSL', () => {
  const plan = { wgsl: WGSL, kernel: kernelAddress(WGSL), invocations: 130, buffers: [[1], [2], [0], [0, 0]] };
  assert.deepEqual(kernelShape(WGSL).bindings.map((b) => b.access), ['read', 'read', 'read', 'read_write']);
  const facts = planFacts(plan);
  assert.equal(planAdmitted(facts), true);
  assert.deepEqual([facts.workgroupSize, facts.workgroups, facts.dispatched, facts.outputs], [64, 3, 192, 1]);
  // Planted defects: each is refused by a rule of the model.
  assert.equal(planAdmitted(planFacts({ ...plan, kernel: kernelAddress(`${WGSL} `) })), false, 'another address');
  assert.equal(planAdmitted(planFacts({ ...plan, buffers: plan.buffers.slice(0, 3) })), false, 'a binding with no buffer');
  assert.equal(planAdmitted(planFacts({ ...plan, buffers: [[1], [2], [], [0]] })), false, 'an empty buffer');
  assert.equal(planAdmitted(planFacts({ ...plan, invocations: 0 })), false, 'no invocation');
  const gap = WGSL.replace('@binding(2)', '@binding(5)');
  assert.equal(planAdmitted(planFacts({ ...plan, wgsl: gap, kernel: kernelAddress(gap) })), false, 'a gap in the bindings');
  const other = WGSL.replace('@group(0) @binding(2)', '@group(1) @binding(2)');
  assert.equal(planAdmitted(planFacts({ ...plan, wgsl: other, kernel: kernelAddress(other) })), false, 'a binding outside group 0');
  const square = WGSL.replace('@workgroup_size(64)', '@workgroup_size(8, 8)');
  assert.equal(planAdmitted(planFacts({ ...plan, wgsl: square, kernel: kernelAddress(square) })), false, 'a workgroup that is not along x');
  assert.equal(planAdmitted(planFacts(plan, { limits: { maxComputeWorkgroupsPerDimension: 2 } })), false, 'past the device\'s workgroups');
  assert.equal(planAdmitted(planFacts(plan, { adapter: false })), false, 'no adapter');
  // A readback must be whole words, and a GPU's words agree only when every one is the CPU's.
  assert.equal(readbackAdmitted(readbackFacts(2, new ArrayBuffer(7))), false);
  assert.equal(compare({ ran: true, planOk: true, readbackOk: true, cpu: [1, 2], gpu: [1, 2] }).verdict, 'agree');
  assert.equal(compare({ ran: true, planOk: true, readbackOk: true, cpu: [1, 2], gpu: [1, 3] }).verdict, 'differ');
  assert.equal(compare({ ran: true, planOk: true, readbackOk: true, cpu: [1, 2], gpu: [1] }).verdict, 'differ');
  assert.equal(compare({ ran: false, cpu: [1, 2], gpu: [1, 2] }).verdict, 'not-run');
});

test('runPlan dispatches nothing for a refused plan, and says when there is no WebGPU', async () => {
  const plan = { wgsl: WGSL, kernel: kernelAddress(`${WGSL}\n`), invocations: 2, buffers: [[1], [2], [0], [0, 0]] };
  let touched = 0;
  let destroyed = 0;
  const device = new Proxy({ limits: {}, destroy: () => (destroyed += 1) }, {
    // `then` stays undefined so that awaiting the device does not call it.
    get: (target, key) => (key in target || key === 'then' ? target[key] : () => { touched += 1; throw new Error(`device.${String(key)} was called`); }),
  });
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => device }) };
  await assert.rejects(runPlan(plan, { gpu }), (e) => e.code === 'webgpu.plan-refused' && e.details.facts.kernelNamed !== e.details.facts.kernelDerived);
  assert.equal(touched, 0, 'nothing reached the device');
  assert.equal(destroyed, 1, 'the device is released');
  await assert.rejects(runPlan(plan, { gpu: { requestAdapter: async () => null } }), (e) => e.code === 'webgpu.unavailable');
  await assert.rejects(runPlan(plan, { gpu: null }), (e) => e.code === 'webgpu.unavailable');
});

test('every theorem says its counterexample is impossible, and the record of Lean\'s verdict names these exact files', () => {
  const theorems = [...PROOFS.matchAll(/theorem\{\s*name: (\w+),\s*parameters: \[[^\]]*\],\s*statement: \(\((\w+) [^)]*\) = false\),\s*proof: linear_arithmetic\{/g)];
  assert.equal(theorems.length, 11);
  assert.equal((PROOFS.match(/theorem\{/g) || []).length, 11, 'every theorem has that one form');
  assert.ok(!/sorry|native_decide|axiom\{/.test(MODEL + PROOFS));
  const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  assert.equal(VERIFIED.schema, 'prism/model-verification/1');
  assert.equal(VERIFIED.result, 'verified 2 modules');
  assert.equal(VERIFIED.sources['src/WebGpuBridge.lex.tex'], sha(MODEL));
  assert.equal(VERIFIED.sources['src/WebGpuBridgeProofs.lex.tex'], sha(PROOFS));
  assert.deepEqual(VERIFIED.theorems.map((t) => t.name), theorems.map((t) => t[1]));
  assert.ok(VERIFIED.plantedDefects.length > 0 && VERIFIED.plantedDefects.every((d) => d.rejected.length > 0));
});
