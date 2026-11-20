// Check a keyless (certificate) signature on a statement, with WebCrypto alone, so a browser tab can do it.
//
// A keyless signature is made with a key that lived for minutes. What vouches for it is a certificate from Fulcio
// naming who asked for it (for GitHub Actions, the workflow) and an entry in the Rekor transparency log.
//
// Three things must all hold, and this file does only the two that prism-code's verifier leaves undone:
//   1. the certificate chains to a pinned authority and the log entry is genuine: `verifyTransparency`, in
//      prism-code's verifier, against a trusted root the caller pins. Not written here.
//   2. the DSSE signature verifies with the certificate's key. Here.
//   3. the certificate names the identity and the issuer the auditor expects. Here.
//
// Not checked anywhere: revocation, checkpoint witnesses, and, for a Rekor v1 entry, the log's signed entry
// timestamp, so the time the certificate is judged valid at is the log's stated time.

import { pae, rawOfDer } from './signature.mjs';

const dec = new TextDecoder();
const unbase64 = (text) => Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.charCodeAt(0));

// A minimal DER reader: enough to find a certificate's key and two extensions. It refuses what it does not expect.
function tlv(bytes, at = 0) {
  if (at + 2 > bytes.length) throw new Error('DER ends early');
  const tag = bytes[at];
  let length = bytes[at + 1];
  let head = 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0 || n > 4 || at + 2 + n > bytes.length) throw new Error('DER length is not readable');
    length = 0;
    for (let k = 0; k < n; k++) length = length * 256 + bytes[at + 2 + k];
    head += n;
  }
  const end = at + head + length;
  if (end > bytes.length) throw new Error('DER value runs past the end');
  return { tag, body: bytes.subarray(at + head, end), whole: bytes.subarray(at, end), end };
}
function children(node) {
  const out = [];
  for (let at = 0; at < node.body.length;) { const c = tlv(node.body, at); out.push(c); at += c.whole.length; }
  return out;
}
function oidOf(node) {
  if (node.tag !== 0x06) throw new Error('not an object identifier');
  const b = node.body;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  for (let i = 1, n = 0; i < b.length; i++) { n = n * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { parts.push(n); n = 0; } }
  return parts.join('.');
}

const SAN = '2.5.29.17';
const FULCIO_ISSUER_V2 = '1.3.6.1.4.1.57264.1.8'; // a DER UTF8String
const FULCIO_ISSUER_V1 = '1.3.6.1.4.1.57264.1.1'; // the bare text

/** What this file needs of an X.509 certificate: its key, the URIs it names, and the issuer of the identity token. */
export function readCertificate(der) {
  const [tbs] = children(tlv(der));
  const fields = children(tbs);
  let at = fields[0].tag === 0xa0 ? 1 : 0; // the version, when present
  at += 5; // serial, signature algorithm, issuer, validity, subject
  const spki = fields[at];
  if (!spki || spki.tag !== 0x30) throw new Error('the certificate has no public key where one is expected');
  const extensions = new Map();
  for (const field of fields.slice(at + 1)) {
    if (field.tag !== 0xa3) continue;
    for (const extension of children(children(field)[0])) {
      const parts = children(extension);
      extensions.set(oidOf(parts[0]), parts[parts.length - 1].body); // the OCTET STRING's content
    }
  }
  const uris = [];
  if (extensions.has(SAN)) for (const name of children(tlv(extensions.get(SAN)))) if (name.tag === 0x86) uris.push(dec.decode(name.body));
  let issuer = null;
  if (extensions.has(FULCIO_ISSUER_V2)) issuer = dec.decode(tlv(extensions.get(FULCIO_ISSUER_V2)).body);
  else if (extensions.has(FULCIO_ISSUER_V1)) issuer = dec.decode(extensions.get(FULCIO_ISSUER_V1));
  return { spki: spki.whole, uris, issuer };
}

/**
 * One keyless statement against what the auditor expects.
 *   expect: { identity: string | RegExp, issuer: string }   who must have signed
 *   trust:  { verifyTransparency, trustedRoot }              prism-code's check and the root the auditor pins
 * Resolves to { verified, message?, statement?, signer? }.
 */
export async function verifyKeylessBundle(bundle, expect, trust) {
  const refuse = (message, signer) => ({ verified: false, message, ...(signer ? { signer } : {}) });
  const envelope = bundle?.dsseEnvelope;
  const raw = bundle?.verificationMaterial?.certificate?.rawBytes ?? bundle?.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;
  if (!envelope || typeof envelope.payload !== 'string') return refuse('The statement has no DSSE envelope.');
  if (!raw) return refuse('The statement carries no certificate: it is not a keyless signature.');
  if (!expect?.identity || !expect?.issuer) return refuse('No identity and issuer were named, and a certificate proves nothing until someone says whose it should be.');
  if (!trust?.trustedRoot) return refuse('No trusted root was pinned, so the certificate cannot be traced to an authority.');

  let certificate;
  try { certificate = readCertificate(unbase64(raw)); } catch (e) { return refuse('The certificate cannot be read: ' + e.message); }
  const signer = { identity: certificate.uris[0] ?? null, issuer: certificate.issuer };

  // 3. Whose certificate it is. Checked before any cryptography: a stranger's valid signature is still a stranger's.
  const named = certificate.uris.some((u) => (expect.identity instanceof RegExp ? expect.identity.test(u) : u === expect.identity));
  if (!named) return refuse(`The certificate names ${JSON.stringify(certificate.uris)}, not the identity expected.`, signer);
  if (certificate.issuer !== expect.issuer) return refuse(`The identity was issued by ${JSON.stringify(certificate.issuer)}, not the issuer expected.`, signer);

  // 2. The signature, by the certificate's key.
  let key;
  try { key = await crypto.subtle.importKey('spki', certificate.spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); } catch { return refuse('The certificate key is not ECDSA P-256, the one kind this tab checks.', signer); }
  const payload = unbase64(envelope.payload);
  const signed = pae(envelope.payloadType, payload);
  let good = false;
  for (const s of envelope.signatures ?? []) {
    try { if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawOfDer(unbase64(s.sig)), signed)) { good = true; break; } } catch { /* not this one */ }
  }
  if (!good) return refuse('The signature does not verify with the certificate key.', signer);

  // 1. The certificate's chain and the log entry, by prism-code's verifier, against the pinned root.
  const stamps = bundle.verificationMaterial.timestampVerificationData?.rfc3161Timestamps?.length ?? 0;
  let seen;
  try { seen = await trust.verifyTransparency(bundle, trust.trustedRoot, { timestamps: stamps > 0 ? 1 : 0 }); } catch (e) { return refuse('The certificate and log entry could not be checked: ' + (e?.message ?? e), signer); }
  if (!seen.passed) return refuse('The certificate or the log entry is not accepted: ' + seen.reasons.map((r) => `${r.check}: ${r.message}`).join('; '), signer);

  let statement;
  try { statement = JSON.parse(dec.decode(payload)); } catch { return refuse('The signed payload is not JSON.', signer); }
  return { verified: true, statement, signer, time: seen.time };
}
