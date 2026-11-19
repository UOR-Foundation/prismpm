// Format revision 2026-11-18 (HO-49): holo v5 may name the session or the checkpoint world, entered at holo_step,
// and pack prismpm/model-document/9. Every existing archive keeps 2026-10-23.
//
// The archives are the conformance corpus's: the reference holo v5 with the checkpoint probe as its guest and the
// binary application document of a checkpoint-world counter, every κ, digest and seal recomputed. They are test
// inputs, never reference evidence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from '../src/index.mjs';
import { verify } from '../../verify/src/index.mjs';
import { ARCHIVES } from '../../conformance/src/corpus.mjs';

const P0 = { minimum: 'P0' };
const revisionOf = async (bytes) => (await (await load(bytes)).inspect()).revision;
const failedChecks = (verdict) => verdict.reasons.map((reason) => reason.check);

test('a holo v5 naming the checkpoint world at holo_step with a binary application document is of revision 2026-11-18', async () => {
  const bytes = ARCHIVES['checkpoint-world-v5']();
  assert.equal(await revisionOf(bytes), '2026-11-18');
  const verdict = await verify(bytes, P0);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.level, 'P0');
  assert.ok(!failedChecks(verdict).includes('holo.documents'), JSON.stringify(verdict.reasons));
});

test('it loads as the checkpoint world: sessions step, and a checkpoint names the state', async () => {
  const app = await load(ARCHIVES['checkpoint-world-v5']());
  assert.equal(app.world.contract, 'hologram:guest/core-wasm@3');
  assert.equal(app.world.session, true);
  assert.equal(app.model.schema, 'prismpm/model-document/9');
  const session = await app.open();
  const responses = await session.dispatch(new TextEncoder().encode('ab'));
  assert.equal(responses.length, 2);
  const { address } = session.checkpoint();
  const resumed = await app.openAt(address, session.checkpoint().state);
  assert.deepEqual(await resumed.dispatch(new TextEncoder().encode('c')), await session.dispatch(new TextEncoder().encode('c')));
});

test('the session bounds come from the binary application document', async () => {
  const app = await load(ARCHIVES['checkpoint-world-v5']());
  assert.equal(app.limits.request, 64);
  assert.equal(app.limits.response, 256);
  assert.equal(app.limits.responseCount, 4);
  assert.equal(app.limits.state, 256);
});

test('the reference holos v4 and v5 are still of revision 2026-10-23', async () => {
  assert.equal(await revisionOf(ARCHIVES.reference()), '2026-10-23');
  assert.equal(await revisionOf(ARCHIVES['reference-v5']()), '2026-10-23');
  assert.equal((await verify(ARCHIVES['reference-v5'](), P0)).level, 'P0');
});

test('the same holo entered at holo_run is refused when loaded and fails holo.documents when verified', async () => {
  const bytes = ARCHIVES['checkpoint-world-v5-entered-at-run']();
  await assert.rejects(load(bytes), (error) => error.code === 'archive.directory');
  assert.ok(failedChecks(await verify(bytes, P0)).includes('holo.documents'));
});

test('a holo v4 naming the checkpoint world fails holo.documents: its directory and provenance schemas admit only @1', async () => {
  const verdict = await verify(ARCHIVES['checkpoint-world'](), P0);
  const documents = verdict.reasons.filter((reason) => reason.check === 'holo.documents').map((reason) => reason.message);
  // The v4 schemas are what refuse it; revision 2026-11-18, holo v5 only, is the second guard.
  assert.ok(documents.some((message) => message.includes('application-directory') && message.includes('core-wasm@1')), documents.join('\n'));
  assert.ok(documents.some((message) => message.includes('model-provenance-v1') && message.includes('core-wasm@1')), documents.join('\n'));
});
