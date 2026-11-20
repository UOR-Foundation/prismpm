// Check the signatures of the statements a holo carries, with WebCrypto alone, so a browser tab can do it.
//
// prism-code's `check` does this in Node with the sigstore packages. This is the same decision for the one case a
// tab can settle without them: a statement signed with a key the auditor already holds (check --key). A keyless
// signature, which names a certificate identity and needs a trusted root, is not checked here and never counts.
//
// What a verified statement then earns (P1 for provenance, P2 for proof, and every check of what the statement
// says) is not decided here: that stays prism-code's verifier, which is given the outcome.
//
// Supported: a Sigstore bundle v0.3 with a DSSE envelope, signed by ECDSA P-256 with SHA-256.

const enc = new TextEncoder();
const dec = new TextDecoder();
const unbase64 = (text) => Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The public key in a PEM "PUBLIC KEY" block, as its SPKI bytes. */
export function spkiOfPem(pem) {
  const body = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(pem);
  if (!body) throw new Error('not a PEM public key');
  return unbase64(body[1]);
}

/** The name the audit shows for a key: the SHA-256 of its SPKI bytes. */
export async function keyName(spki) {
  return 'sha256:' + hex(await crypto.subtle.digest('SHA-256', spki));
}

/** DSSE's pre-authentication encoding: what the signature is over. */
export function pae(payloadType, payload) {
  const head = enc.encode(`DSSEv1 ${enc.encode(payloadType).length} ${payloadType} ${payload.length} `);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head);
  out.set(payload, head.length);
  return out;
}

/** An ECDSA signature in DER (SEQUENCE of two INTEGERs) as the fixed-width r||s WebCrypto takes. */
export function rawOfDer(der, width = 32) {
  let at = 0;
  const read = () => der[at++];
  const length = () => { let n = read(); if (n & 0x80) { let k = n & 0x7f; n = 0; while (k--) n = (n << 8) | read(); } return n; };
  if (read() !== 0x30) throw new Error('not a DER signature');
  if (length() !== der.length - at) throw new Error('DER signature has trailing or missing bytes');
  const out = new Uint8Array(width * 2);
  for (const offset of [0, width]) {
    if (read() !== 0x02) throw new Error('not a DER integer');
    let n = length();
    let from = at;
    at += n;
    while (n > width && der[from] === 0) { from++; n--; } // a leading zero keeps the integer positive
    if (n > width) throw new Error('DER integer is too large for the curve');
    out.set(der.subarray(from, from + n), offset + width - n);
  }
  if (at !== der.length) throw new Error('DER signature has trailing bytes');
  return out;
}

/**
 * One statement's signature against one key. Resolves to { verified, message?, statement? }: `statement` is the
 * signed payload itself, parsed, so what is judged afterwards is exactly what was signed.
 */
export async function verifyBundle(bundle, spki) {
  const refuse = (message) => ({ verified: false, message });
  const envelope = bundle?.dsseEnvelope;
  if (!envelope || typeof envelope.payload !== 'string') return refuse('The statement has no DSSE envelope.');
  const signatures = (envelope.signatures ?? []).filter((s) => typeof s.sig === 'string' && s.sig !== '');
  if (signatures.length === 0) return refuse('The statement is an unsigned placeholder: its signature is empty, and no verifier accepts it.');
  if (bundle.verificationMaterial?.certificate || bundle.verificationMaterial?.x509CertificateChain) {
    return refuse('The statement is signed keylessly, with a certificate. This tab checks only a signature by a key it was given.');
  }
  let key;
  try {
    key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch {
    return refuse('The key given is not an ECDSA P-256 public key, the one kind this tab checks.');
  }
  const payload = unbase64(envelope.payload);
  const signed = pae(envelope.payloadType, payload);
  for (const s of signatures) {
    let raw;
    try { raw = rawOfDer(unbase64(s.sig)); } catch { continue; }
    if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, signed)) {
      let statement;
      try { statement = JSON.parse(dec.decode(payload)); } catch { return refuse('The signed payload is not JSON.'); }
      return { verified: true, statement };
    }
  }
  return refuse('The signature does not verify against the key given.');
}

/**
 * The statements of a parsed holo's attestation section, each with the outcome of its signature check, in the
 * shape prism-code's verifier takes: { provenance?, proof? }, each { statement, envelope: { verified, message? } }.
 * `spki` undefined means no signer was named, and then nothing verifies.
 */
export async function statementsFor(attestations, predicates, spki) {
  const out = {};
  for (const [kind, type] of Object.entries(predicates)) {
    for (const a of attestations.filter((x) => x.predicateType === type)) {
      const result = spki === undefined
        ? { verified: false, message: 'The signature was not checked: no signer was named, and an unchecked signature is no evidence.' }
        : await verifyBundle(a.bundle, spki);
      const entry = { statement: result.statement ?? a.statement, envelope: { verified: result.verified, ...(result.message ? { message: result.message } : {}) } };
      // The first statement of the kind that verifies wins; otherwise the first one stands, to say why it does not count.
      if (out[kind] === undefined || (entry.envelope.verified && !out[kind].envelope.verified)) out[kind] = entry;
    }
  }
  return out;
}
