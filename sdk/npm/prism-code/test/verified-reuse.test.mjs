// A model Lean has already verified on this machine is not verified again: its verified record is kept by
// content address, keyed by the SDK image, LexLean's build ID and the Lake workspace, and reused only by
// `reuseAdmits`. A stand-in takes Docker's place (test/support/fake-docker.mjs), so nothing here needs Docker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHIPPING_DRAFT, fakeDocker, project, startServer, until } from './support/journey-client.mjs';

const proofs = (cwd) => (existsSync(join(cwd, 'docker.log')) ? readFileSync(join(cwd, 'docker.log'), 'utf8').split('\n').filter((l) => l === 'prove').length : 0);

/** Take a project to an approved spec and prove it. Resolves the proof's answer. */
async function proveIn(server, draft = SHIPPING_DRAFT) {
  await server.call('prism_start', { restart: true });
  const review = await server.call('prism_spec', { spec: draft });
  assert.equal(review.data.step, 'review', review.text);
  await server.call('prism_answer', { answer: 'yes' });
  return (await until(server, 'prism_prove')).answer;
}

/** Every file the store keeps, by its path under the store. */
function storedFiles(home) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk(join(home, 'kappa', 'bytes'));
  return out;
}

test('an unchanged model is not verified again, in this project or another, and says it was reused', async () => {
  const home = mkdtempSync(join(tmpdir(), 'prism-verified-home-'));
  const cwd = project();
  let server = startServer(cwd, { env: { ...fakeDocker(cwd, { prove: 'ok' }), PRISM_HOME: home } });
  try {
    const first = await proveIn(server);
    assert.equal(first.data.ok, true, first.text);
    assert.equal(first.data.reused, undefined);
    assert.equal(proofs(cwd), 1);
    // The same model again: LexLean's verify does not run, and the answer says the proof was reused.
    const again = (await until(server, 'prism_prove')).answer;
    assert.equal(again.data.ok, true, again.text);
    assert.equal(proofs(cwd), 1, 'verify ran again for a model already verified');
    assert.match(again.data.reused, /^[0-9a-f]{64}$/, 'the attestation reused');
    assert.match(again.data.message, /reused/i);
    // The verified record is back in the project, as verify leaves it.
    assert.ok(existsSync(join(cwd, 'prism', '.lexlean', 'verified', again.data.reused, 'attestation.json')));
  } finally {
    await server.close();
  }

  // Another project with the same model, on the same machine.
  const other = project();
  server = startServer(other, { env: { ...fakeDocker(other, { prove: 'ok' }), PRISM_HOME: home } });
  try {
    const answer = await proveIn(server);
    assert.equal(answer.data.ok, true, answer.text);
    assert.equal(proofs(other), 0, 'a model verified in another project was verified again');
    assert.ok(answer.data.reused);
    // Planted defect V3: the reused record is put where verify publishes one, in this project too.
    assert.ok(existsSync(join(other, 'prism', '.lexlean', 'verified', answer.data.reused, 'attestation.json')), 'the reused record is not in this project');
  } finally {
    await server.close();
  }
});

test('a changed model is verified, and a stored record whose bytes changed is never reused', async () => {
  const home = mkdtempSync(join(tmpdir(), 'prism-verified-home-'));
  const cwd = project();
  const server = startServer(cwd, { env: { ...fakeDocker(cwd, { prove: 'ok' }), PRISM_HOME: home } });
  try {
    assert.equal((await proveIn(server)).data.ok, true);
    assert.equal(proofs(cwd), 1);
    // Another model: another build ID, so another key.
    const edited = { ...SHIPPING_DRAFT, title: `${SHIPPING_DRAFT.title ?? 'Shipping'} edited` };
    const changed = await proveIn(server, edited);
    assert.equal(changed.data.ok, true, changed.text);
    assert.equal(proofs(cwd), 2, 'a changed model was not verified');
    assert.equal(changed.data.reused, undefined);
    // Planted defect V1: one file of the kept record, its compiled module, is altered under its old name; the
    // record itself is left whole. That file no longer re-derives, so the model is verified again rather than
    // taken on the word of a record that no longer is what it says.
    const olean = storedFiles(home).filter((file) => readFileSync(file, 'utf8').startsWith('olean of '));
    assert.equal(olean.length, 2, 'one compiled module kept for each of the two models');
    for (const file of olean) writeFileSync(file, 'olean of something else');
    const altered = (await until(server, 'prism_prove')).answer;
    assert.equal(altered.data.ok, true, altered.text);
    assert.equal(proofs(cwd), 3, 'an altered record was reused');
    assert.equal(altered.data.reused, undefined);
  } finally {
    await server.close();
  }
});

test('a model Lean refused is never kept, even when a record was left behind, so it is verified, and refused, again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'prism-verified-home-'));
  const cwd = project();
  const server = startServer(cwd, { env: { ...fakeDocker(cwd, { prove: 'unproved', publishOnRefusal: true }), PRISM_HOME: home } });
  try {
    assert.equal((await proveIn(server)).data.ok, false);
    const again = (await until(server, 'prism_prove')).answer;
    assert.equal(again.data.ok, false, again.text);
    // Planted defect V2: a refused verify that left a record behind; keeping it would make this proof pass.
    assert.equal(proofs(cwd), 2, 'a refused model was taken from the store');
  } finally {
    await server.close();
  }
});
