// The browser signature check (audit/signature.mjs), held to what prism-code's own `check` is expected to say.
// The expected verdicts are the repository's fixtures under test/fixtures/signed, which test/check.test.mjs pins
// for the Node `check`. Only WebCrypto is used, as in a tab. Usage: node tools/signature-test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spkiOfPem, statementsFor, verifyBundle, rawOfDer } from '../audit/signature.mjs';
import { parseArchive } from '../../src/archive.mjs';
import { readAttestations, stripAttestations } from '../../src/attestations.mjs';
import { ASSURANCE, verify } from '../../src/vendor/verify.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'signed');
const read = (name) => new Uint8Array(readFileSync(join(fixtures, name)));
const expected = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
const PREDICATES = { provenance: ASSURANCE.PREDICATES.provenance, proof: ASSURANCE.PREDICATES.proof };
const signer = spkiOfPem(readFileSync(join(fixtures, 'signer.pub.pem'), 'utf8'));
const stranger = new Uint8Array(await crypto.subtle.exportKey('spki', (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])).publicKey));

async function judge(bytes, spki) {
  const parsed = parseArchive(bytes);
  const statements = await statementsFor(readAttestations(parsed), PREDICATES, spki);
  return verify(stripAttestations(parsed), { statements });
}
const shape = (v) => ({ level: v.level, passed: v.passed, checks: v.reasons.map((r) => r.check) });

let failed = 0;
const same = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

// 1. The four cases the repository pins for `check`, by level, outcome and the checks named as reasons.
for (const [name, holo, spki, fixture] of [
  ['signed by the key given', 'Calculator.signed.holo', signer, 'calculator.trusted.json'],
  ['no signer named', 'Calculator.signed.holo', undefined, 'calculator.no-signer.json'],
  ['signed by another key', 'Calculator.signed.holo', stranger, 'calculator.stranger.json'],
  ['a proof about another model', 'PaymentApproval.mismatch.holo', signer, 'payment-approval.mismatch.json'],
  ['a second signed app', 'PaymentApproval.signed.holo', signer, 'payment-approval.trusted.json'],
]) same(name, shape(await judge(read(holo), spki)), shape(expected(fixture)));

// 2. One byte of a signed payload changed: the signature no longer verifies.
{
  const bundles = readAttestations(parseArchive(read('Calculator.signed.holo')));
  const proof = structuredClone(bundles.find((a) => a.predicateType === PREDICATES.proof).bundle);
  same('the untouched payload verifies', (await verifyBundle(proof, signer)).verified, true);
  const payload = Uint8Array.from(atob(proof.dsseEnvelope.payload), (c) => c.charCodeAt(0));
  payload[payload.length - 2] ^= 1;
  proof.dsseEnvelope.payload = btoa(String.fromCharCode(...payload));
  same('one payload byte changed', (await verifyBundle(proof, signer)).verified, false);
}

// 3. DER reading refuses what is not one signature.
for (const [name, der] of [['empty', []], ['not a sequence', [0x02, 0x01, 0x01]], ['trailing byte', [0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0x00]], ['integer too large', [0x30, 0x25, 0x02, 0x22, 0x01, ...Array(33).fill(0xff), 0x02, 0x01, 0x01].slice(0, 39)]]) {
  let threw = false;
  try { rawOfDer(Uint8Array.from(der)); } catch { threw = true; }
  same(`DER refused: ${name}`, threw, true);
}

console.log(failed ? `${failed} failed` : 'all pass');
process.exit(failed ? 1 : 0);
