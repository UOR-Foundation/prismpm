// The origin's content-addressed store, for the sealed prover's workers: bytes filed under the hex of their BLAKE3
// label, and pointers (a name to a label). The private file system where it keeps what is written; IndexedDB where it
// does not (some WebKit builds). Nothing read is trusted: bytes are used only when they re-hash to their label.

/** One folder of the store: { kind, get(name) -> bytes | null, put(name, bytes) }. */
export async function openDir(name) {
  try { return await opfsDir(name); } catch { try { return await idbDir(name); } catch { return null; } }
}

async function opfsDir(name) {
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(name, { create: true });
  const d = {
    kind: "opfs",
    get: async (k) => { try { return new Uint8Array(await (await (await dir.getFileHandle(k)).getFile()).arrayBuffer()); } catch { return null; } },
    put: async (k, bytes) => {
      const f = await dir.getFileHandle(k, { create: true });
      if (f.createWritable) { const w = await f.createWritable(); await w.write(bytes); await w.close(); return; }
      const s = await f.createSyncAccessHandle(); try { s.truncate(0); s.write(bytes, { at: 0 }); s.flush(); } finally { s.close(); }
    },
  };
  // Used only if a write reads back: some builds open the file system and then lose what is written. Each worker probes
  // its own file: workers opening the store at once must not contend for one.
  const probe = crypto.getRandomValues(new Uint8Array(16)), probeName = ".probe-" + [...probe].map((x) => x.toString(16).padStart(2, "0")).join("");
  await d.put(probeName, probe);
  const back = await d.get(probeName);
  try { await dir.removeEntry(probeName); } catch {}
  if (!back || back.length !== probe.length || back.some((x, i) => x !== probe[i])) throw new Error("the file system does not keep what is written");
  return d;
}

async function idbDir(name) {
  const db = await new Promise((ok, no) => { const r = indexedDB.open("lean-prover-" + name, 1); r.onupgradeneeded = () => r.result.createObjectStore("b"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (mode, f) => new Promise((ok, no) => { const t = db.transaction("b", mode), r = f(t.objectStore("b")); t.oncomplete = () => ok(r.result); t.onerror = () => no(t.error); });
  return { kind: "indexeddb", get: async (k) => { const v = await tx("readonly", (s) => s.get(k)); return v ? new Uint8Array(v) : null; }, put: (k, bytes) => tx("readwrite", (s) => s.put(bytes, k)) };
}

const decode = async (encoded, encoding) => (encoding !== "gzip" ? encoded
  : new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()));

/** The decoded bytes of a sealed asset `{ kappa, url, encoding }`, admitted only when they have its label; kept decoded. */
export async function admitted(holo, dir, { kappa: label, url, encoding }) {
  const hex = label.slice(7);
  let bytes = dir ? await safe(() => dir.get(hex)) : null;
  if (bytes && holo.address(bytes) === label) return bytes;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  bytes = await decode(new Uint8Array(await res.arrayBuffer()), encoding);
  const got = holo.address(bytes);
  if (got !== label) throw new Error(`refused ${url}: its bytes are ${got}, not ${label}`);
  // Kept for the next visit without making this one wait.
  if (dir) safe(() => dir.put(hex, bytes));
  return bytes;
}

/** Bytes kept under their label, read back only when they still have it. */
export async function keep(holo, dir, bytes) {
  const label = holo.address(bytes);
  if (dir) await safe(() => dir.put(label.slice(7), bytes));
  return label;
}
export async function recall(holo, dir, label) {
  const bytes = dir ? await safe(() => dir.get(label.slice(7))) : null;
  return bytes && holo.address(bytes) === label ? bytes : null;
}
/** A pointer: the label filed under a name (itself the hex of a label). */
export const point = async (dir, name, label) => { if (dir) await safe(() => dir.put(name, new TextEncoder().encode(label))); };
export const pointer = async (dir, name) => { const b = dir ? await safe(() => dir.get(name)) : null; return b ? new TextDecoder().decode(b) : null; };

const safe = async (f) => { try { return await f(); } catch { return null; } };
