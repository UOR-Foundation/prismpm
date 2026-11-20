// Prism ID for the IDE page, and the store of what the user granted each extension.
//
// The id is the template's <prism-frame> (UOR-Foundation/template, pinned in public/prism-frame/PIN.json),
// loaded unmodified from this origin. There is no sign-in: the frame makes a device key and an id on first use.
// A grants record is signed by the id's session key and sealed with the id's workspace key, so only this id's
// devices can read it and nobody else can write one the page will accept.
import { kappa } from '../public/gate/prism-code/src/blake3.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const RESOURCES = ['show', 'read', 'write', 'network', 'secrets', 'exec'];
// What an extension has before the user decides anything.
export const DEFAULT_GRANTS = { granted: ['show', 'read'], denied: [] };

// Host the frame and wait for the id. Resolves to { frame, panels, key, account }.
export async function openIdentity() {
  const base = new URL('/prism-frame/', location.origin).href;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: base + 'site/brand/hologram-warm.css' });
  document.head.append(link);
  await import(/* @vite-ignore */ base + 'frame/frame.mjs');
  // The same module instance the frame loads: one URL, one copy.
  const panels = await import(/* @vite-ignore */ base + 'frame/panels.mjs');
  await customElements.whenDefined('prism-frame');
  const frame = document.createElement('prism-frame');
  frame.setAttribute('name', 'Prism IDE');
  document.body.prepend(frame);
  // Looks only: the published frame carries its CSS baked in; the unmodified source files do not.
  try {
    const [frameCss, panelsCss] = await Promise.all(['frame.css', 'panels.css'].map(async (n) => (await fetch(base + 'frame/' + n)).text()));
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(frameCss);
    frame.shadowRoot.adoptedStyleSheets = [...frame.shadowRoot.adoptedStyleSheets, sheet];
    panels.sheet.replaceSync(panelsCss);
  } catch { /* an unstyled bar still works */ }
  // Makes the device, the id and this origin's session if they are missing. No click, no prompt.
  const key = await frame.workspaceKey();
  if (!frame.account) throw new Error('the frame has no Prism id');
  return { frame, panels, key, account: frame.account };
}

const DB = 'prism-ide-grants';
const idb = (mode, work) => new Promise((res, rej) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => q.result.createObjectStore('grants');
  q.onerror = () => rej(q.error);
  q.onsuccess = () => {
    const tx = q.result.transaction('grants', mode);
    const r = work(tx.objectStore('grants'));
    tx.oncomplete = () => { q.result.close(); res(r.result); };
    tx.onerror = () => { q.result.close(); rej(tx.error); };
  };
});

const clean = (list) => RESOURCES.filter((r) => (list ?? []).includes(r));

// Write what the user decided for one extension. Returns the BLAKE3 label of the stored bytes.
export async function saveGrants(id, extension, { granted, denied }) {
  const record = { kind: 'prism-ide/grants/1', prism: id.account.id, extension, granted: clean(granted), denied: clean(denied), at: Date.now() };
  const signedBytes = enc.encode(JSON.stringify(record));
  const { signature, delegation } = await id.frame.sign(signedBytes);
  const envelope = enc.encode(JSON.stringify({ record, signature, delegation }));
  const aes = await crypto.subtle.importKey('raw', id.key, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, envelope));
  const bytes = new Uint8Array(12 + sealed.length);
  bytes.set(iv);
  bytes.set(sealed, 12);
  const label = kappa(bytes);
  await idb('readwrite', (s) => s.put({ kappa: label, bytes }, extension));
  return label;
}

// Read one extension's grants. Anything that does not check out gives the defaults and says why.
export async function loadGrants(id, extension) {
  const fail = (why) => ({ ...DEFAULT_GRANTS, source: 'default', why });
  let row;
  try { row = await idb('readonly', (s) => s.get(extension)); } catch (e) { return fail('store: ' + e); }
  if (!row) return fail('nothing stored');
  try {
    const bytes = new Uint8Array(row.bytes);
    if (kappa(bytes) !== row.kappa) return fail('stored bytes do not match their BLAKE3 label');
    const aes = await crypto.subtle.importKey('raw', id.key, 'AES-GCM', false, ['decrypt']);
    let opened;
    try { opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, aes, bytes.slice(12)); } catch { return fail('not sealed to this Prism id'); }
    const { record, signature, delegation } = JSON.parse(dec.decode(opened));
    if (record.kind !== 'prism-ide/grants/1' || record.extension !== extension) return fail('record is for something else');
    if (delegation.app !== location.origin) return fail('signed for another app');
    // As of the moment it was signed: a session lasts a week, a decision lasts until it is changed.
    const who = await id.panels.verifySession(delegation, { now: record.at, fresh: 0, hear: false });
    if (who.account !== id.account.id || record.prism !== id.account.id) return fail('signed by another Prism id');
    const pub = await crypto.subtle.importKey('raw', unb64u(who.sessionKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(signature), enc.encode(JSON.stringify(record)));
    if (!good) return fail('signature does not verify');
    return { granted: clean(record.granted), denied: clean(record.denied), source: 'stored', kappa: row.kappa, at: record.at };
  } catch (e) {
    return fail('unreadable: ' + (e?.code ? e.code + ': ' : '') + (e?.message ?? e));
  }
}

export async function clearGrants(extension) {
  await idb('readwrite', (s) => s.delete(extension));
}

// For tests: flip one stored byte, to show a changed record is refused.
export async function corruptGrants(extension) {
  const row = await idb('readonly', (s) => s.get(extension));
  if (!row) return false;
  const bytes = new Uint8Array(row.bytes);
  bytes[bytes.length - 1] ^= 1;
  await idb('readwrite', (s) => s.put({ kappa: kappa(bytes), bytes }, extension));
  return true;
}

export { b64u };
