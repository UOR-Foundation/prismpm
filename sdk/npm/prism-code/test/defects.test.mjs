// Planted defects: a gate counts only when a deliberate defect makes it fail.
// Each case plants one defect in an otherwise valid input and names the refusal
// it must get. A defect that passes is a gate that does not hold.
//
// G7 integrity: lives in test/check.test.mjs and test/verify.test.mjs
// (a tampered holo under a P0 policy) and in sdk/npm/verify/test/policy.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('G7 planted defect: one byte flipped anywhere in a holo is refused, never a TypeError, never run', async () => {
  const { readFileSync } = await import('node:fs');
  const { load, DigestMismatchError, PrismCodeError } = await import('../src/index.mjs');
  const holo = new Uint8Array(readFileSync(new URL('../fixtures/Calculator.holo', import.meta.url)));
  const offsets = new Set([0, 4, 9, 10, 40, 200, 300, 1000, holo.length - 200, holo.length - 33, holo.length - 1]);
  for (let at = 0; at < holo.length; at += Math.max(1, Math.floor(holo.length / 97))) offsets.add(at);
  let integrity = 0;
  for (const at of [...offsets].sort((a, b) => a - b)) {
    const altered = new Uint8Array(holo);
    altered[at] ^= 0xff;
    await assert.rejects(load(altered), (error) => {
      assert.ok(!(error instanceof TypeError) && !(error instanceof RangeError), `byte ${at}: raw ${error?.name}: ${error?.message}`);
      assert.ok(error instanceof PrismCodeError || error instanceof DigestMismatchError, `byte ${at}: ${error?.name}: ${error?.message}`);
      if (error instanceof DigestMismatchError) {
        assert.equal(error.check, 'holo.integrity', `byte ${at}`);
        assert.match(error.message, /^integrity failure: the holo was altered/, `byte ${at}`);
        integrity++;
      } else {
        // Only damage to the header or the section table, which locates the footer, may be refused structurally.
        assert.match(error.code, /^archive\.(magic|version|flags|bounds|table|input)$/, `byte ${at}: ${error.code}: ${error.message}`);
      }
      return true;
    });
  }
  assert.ok(integrity > offsets.size / 2, `${integrity} of ${offsets.size} flips named as integrity failures`);
});

test('G7 planted defect: prism-code run refuses a damaged holo under a P0 policy with "integrity failure", exit 1', async () => {
  const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'prism-g7-'));
  const holo = new Uint8Array(readFileSync(new URL('../fixtures/Calculator.holo', import.meta.url)));
  const policy = join(dir, 'p0.json');
  writeFileSync(policy, '{"minimum":"P0"}');
  const bin = new URL('../bin/prism-code.mjs', import.meta.url);
  for (const at of [300, 1000, holo.length - 200]) {
    const altered = new Uint8Array(holo);
    altered[at] ^= 0xff;
    const path = join(dir, `altered-${at}.holo`);
    writeFileSync(path, altered);
    const r = spawnSync(process.execPath, [bin.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'run', path, '1 add 2 3', '--policy', policy], { encoding: 'utf8', env: { ...process.env, PRISM_HOME: join(dir, 'home') } });
    assert.equal(r.status, 1, `byte ${at}: exit ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /integrity failure/, `byte ${at}: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /TypeError/);
  }
});
