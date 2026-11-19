// Checkpoints of the checkpoint world hologram:guest/core-wasm@3 (HO-47, HO-48).
//
// The guest under test is the checkpoint ABI probe: the generated @3 shim of crates/prismpm/src/session_guest
// around the same test entry as the session probe (test/fixtures/checkpoint-probe), pinned to the generator by a
// Rust test. Its state is a big-endian u32 counter followed by an accumulated buffer; the declared state maximum
// is 256. The archive is the reference holo with that guest and the @3 contract, rewritten and resealed, so only
// the world differs. It is a test input, never reference evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CHECKPOINT_CONTRACT,
  SESSION_CONTRACT,
  checkpointBytes,
  compileGuest,
  load,
  readState,
  restoreState,
  runStep,
} from '../src/index.mjs';
import { kappa } from '../src/blake3.mjs';
import { editExtension, reference, withGuest } from '../../verify/test/helpers.mjs';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}/probe.wasm`, import.meta.url)));
const CHECKPOINT_PROBE = fixture('checkpoint-probe');
const SESSION_PROBE = fixture('session-probe');
const LIMITS = { request: 64, guestAllocation: 64, response: 256, responseCount: 4 };
const DIRECTORY = 'https://hologram.foundation/extension/application-directory/v1';
const PROVENANCE = 'https://uor.foundation/extension/prismpm-model/v1';
const text = (s) => new TextEncoder().encode(s);
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const u32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const concat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));

/** The reference holo with `guest` and `contract` in place of its @1 guest and contract. */
function archiveOf(guest, contract) {
  let bytes = withGuest(guest);
  const edit = (json) => json.replaceAll('hologram:guest/core-wasm@1', contract);
  bytes = editExtension(bytes, DIRECTORY, edit);
  bytes = editExtension(bytes, PROVENANCE, edit);
  return bytes;
}

const checkpointApp = () => load(archiveOf(CHECKPOINT_PROBE, CHECKPOINT_CONTRACT));
const instanceOf = async () => new WebAssembly.Instance(await compileGuest(CHECKPOINT_PROBE, undefined, CHECKPOINT_CONTRACT), {});
const trapped = (fn) => assert.throws(fn, (e) => e instanceof WebAssembly.RuntimeError);

test('holo_state locates the state three steps left and changes nothing the next step sees', async () => {
  const instance = await instanceOf();
  assert.deepEqual(readState(instance), new Uint8Array(0), 'a fresh instance holds an empty state');
  for (const request of ['ab', 'c', 'de']) runStep(instance, text(request), LIMITS);
  const state = readState(instance);
  assert.deepEqual(state, concat(u32(3), text('abcde')));
  assert.deepEqual(readState(instance), state, 'reading twice reads the same bytes');
  const twin = await instanceOf();
  for (const request of ['ab', 'c', 'de']) runStep(twin, text(request), LIMITS);
  assert.deepEqual(runStep(instance, text('f'), LIMITS).map(hex), runStep(twin, text('f'), LIMITS).map(hex));
});

test('holo_restore installs a state the next step sees, and traps over the maximum, after a step and a second time', async () => {
  const restored = restoreState(await instanceOf(), concat(u32(7), text('xyz')));
  assert.deepEqual(runStep(restored, text('w'), LIMITS).map(hex), [hex(u32(8)), hex(text('xyzw'))]);
  const over = await instanceOf();
  trapped(() => over.exports.holo_restore(257));
  const stepped = await instanceOf();
  runStep(stepped, text('a'), LIMITS);
  trapped(() => stepped.exports.holo_restore(4));
  const reserved = await instanceOf();
  reserved.exports.holo_alloc(1);
  trapped(() => reserved.exports.holo_restore(4));
  const twice = restoreState(await instanceOf(), new Uint8Array(0));
  trapped(() => twice.exports.holo_restore(0));
});

test('a checkpoint is the BLAKE3 kappa label of the state bytes and a copy of them', async () => {
  const app = await checkpointApp();
  assert.equal(app.world.contract, CHECKPOINT_CONTRACT);
  assert.equal(app.world.session, true);
  assert.equal(app.world.pure, true);
  const session = await app.open();
  for (const request of ['ab', 'c', 'de']) await session.dispatch(text(request));
  const { address, state } = session.checkpoint();
  assert.deepEqual(state, concat(u32(3), text('abcde')));
  assert.equal(address, kappa(state));
  assert.match(address, /^blake3:[0-9a-f]{64}$/);
  state[0] ^= 1;
  assert.deepEqual(session.checkpoint().state, concat(u32(3), text('abcde')), 'the copy is the caller\'s, not the guest\'s');
});

test('a session opened at a checkpoint answers the next requests exactly as the session it was taken from', async () => {
  const app = await checkpointApp();
  const original = await app.open();
  for (const request of ['ab', 'c', 'de']) await original.dispatch(text(request));
  const { address, state } = original.checkpoint();
  const store = new Map([[address, state]]);
  const fromBytes = await app.openAt(address, state);
  const fromStore = await app.openAt(address, store);
  for (const request of ['f', '', 'ghi', 'j']) {
    const expected = (await original.dispatch(text(request))).map(hex);
    assert.deepEqual((await fromBytes.dispatch(text(request))).map(hex), expected, request);
    assert.deepEqual((await fromStore.dispatch(text(request))).map(hex), expected, request);
  }
  assert.equal(fromBytes.checkpoint().address, original.checkpoint().address);
});

test('state bytes that do not hash to the label are refused with checkpoint.address before the guest runs', async () => {
  const app = await checkpointApp();
  const session = await app.open();
  await session.dispatch(text('ab'));
  const { address, state } = session.checkpoint();
  const flipped = Uint8Array.from(state);
  flipped[flipped.length - 1] ^= 1;
  let instantiated = 0;
  app.experimental_middleware.add(
    (next) => (args) => {
      instantiated++;
      return next(args);
    },
    { step: 'instantiate', name: 'count' },
  );
  await assert.rejects(app.openAt(address, flipped), (e) => e.code === 'checkpoint.address');
  await assert.rejects(app.openAt(address, new Map()), (e) => e.code === 'checkpoint.address');
  assert.equal(instantiated, 0, 'no instance was made');
  await app.openAt(address, state);
  assert.equal(instantiated, 1);
});

test('a label that is not a BLAKE3 kappa label is refused with checkpoint.address', async () => {
  const state = concat(u32(1), text('a'));
  const label = kappa(state);
  for (const bad of [label.toUpperCase(), label.slice(0, -1), label.replace('blake3:', 'sha256:'), label.slice(7), null]) {
    await assert.rejects(checkpointBytes(bad, state), (e) => e.code === 'checkpoint.address', String(bad));
  }
  assert.deepEqual(await checkpointBytes(label, state), state);
});

test('state bytes over the declared state maximum are refused with checkpoint.state, and the shim traps on them', async () => {
  const big = new Uint8Array(257);
  await assert.rejects(checkpointBytes(kappa(big), big, { state: 256 }), (e) => e.code === 'checkpoint.state');
  assert.deepEqual(await checkpointBytes(kappa(big.subarray(0, 256)), big.subarray(0, 256), { state: 256 }), big.subarray(0, 256));
  // With no declared maximum the host cannot refuse them, and the shim's own bound still holds.
  const app = await checkpointApp();
  await assert.rejects(app.openAt(kappa(big), big), (e) => e instanceof WebAssembly.RuntimeError);
});

test('checkpoint and openAt on a session-world or stateless guest fail checkpoint.unsupported', async () => {
  const sessionApp = await load(archiveOf(SESSION_PROBE, SESSION_CONTRACT));
  const session = await sessionApp.open();
  await session.dispatch(text('a'));
  assert.throws(() => session.checkpoint(), (e) => e.code === 'checkpoint.unsupported');
  const label = kappa(new Uint8Array(0));
  await assert.rejects(sessionApp.openAt(label, new Uint8Array(0)), (e) => e.code === 'checkpoint.unsupported');
  const stateless = await load(reference());
  await assert.rejects(stateless.openAt(label, new Uint8Array(0)), (e) => e.code === 'checkpoint.unsupported');
  // A session guest compiled as a checkpoint guest, and the reverse, are refused by their exports.
  await assert.rejects(compileGuest(SESSION_PROBE, undefined, CHECKPOINT_CONTRACT), (e) => e.code === 'core.exports');
  await assert.rejects(compileGuest(CHECKPOINT_PROBE, undefined, SESSION_CONTRACT), (e) => e.code === 'core.exports');
});
