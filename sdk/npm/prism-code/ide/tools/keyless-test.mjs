// The keyless signature check (audit/keyless.mjs) on the Sigstore conformance bundles this repository already
// keeps (sdk/npm/verify/test/fixtures/sigstore-conformance), each with the trusted root its case is checked
// against. A case whose folder ends in _fail must be refused. Only WebCrypto is used, as in a tab.
// Usage: node tools/keyless-test.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCertificate, verifyKeylessBundle } from '../audit/keyless.mjs';
import { verifyTransparency } from '../../src/vendor/verify.mjs';

const cases = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'verify', 'test', 'fixtures', 'sigstore-conformance');
const unbase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
let failed = 0;
const same = (name, got, want, note = '') => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${got}, want ${want})`}${note ? '  ' + note : ''}`);
};

let dsse = 0;
for (const name of readdirSync(cases).sort()) {
  const folder = join(cases, name);
  if (!existsSync(join(folder, 'bundle.sigstore.json'))) continue;
  const bundle = JSON.parse(readFileSync(join(folder, 'bundle.sigstore.json'), 'utf8'));
  if (!bundle.dsseEnvelope) continue; // a message signature, not a statement: outside this check
  dsse++;
  const trust = { verifyTransparency, trustedRoot: JSON.parse(readFileSync(join(folder, 'trusted_root.json'), 'utf8')) };
  // The auditor expects whoever the certificate names: the case is about the signature and the log, not the name.
  let expect = { identity: /.*/, issuer: 'unknown' };
  try { const c = readCertificate(unbase64(bundle.verificationMaterial.certificate.rawBytes)); expect = { identity: c.uris[0], issuer: c.issuer }; } catch { /* refused below */ }
  const result = await verifyKeylessBundle(bundle, expect, trust);
  same(name, result.verified, !name.endsWith('_fail'), result.verified ? '' : result.message.slice(0, 110));

  if (!name.endsWith('_fail') && result.verified) {
    // The same accepted bundle must be refused for another identity, another issuer, a changed payload, or no root.
    same(`  ${name}: another identity`, (await verifyKeylessBundle(bundle, { ...expect, identity: expect.identity + 'x' }, trust)).verified, false);
    same(`  ${name}: another issuer`, (await verifyKeylessBundle(bundle, { ...expect, issuer: 'https://example.invalid' }, trust)).verified, false);
    const changed = structuredClone(bundle);
    const payload = unbase64(changed.dsseEnvelope.payload);
    payload[payload.length - 2] ^= 1;
    changed.dsseEnvelope.payload = btoa(String.fromCharCode(...payload));
    same(`  ${name}: one payload byte changed`, (await verifyKeylessBundle(changed, expect, trust)).verified, false);
    same(`  ${name}: no root pinned`, (await verifyKeylessBundle(bundle, expect, { verifyTransparency })).verified, false);
    same(`  ${name}: nobody named`, (await verifyKeylessBundle(bundle, {}, trust)).verified, false);
  }
}
same('statement bundles found', dsse > 0, true, `(${dsse})`);
console.log(failed ? `${failed} failed` : 'all pass');
process.exit(failed ? 1 : 0);
