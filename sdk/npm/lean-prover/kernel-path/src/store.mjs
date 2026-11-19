// A κ-store for wherever this runs. Because every object is found by the label of its own bytes, the storage
// underneath needs no trust and can be whatever the host offers: every backend returns only bytes that re-derive to
// the label asked for. In a browser, tried in order: Hologram's OPFS store, IndexedDB, memory. In Node: a folder,
// or memory. Besides objects, a store keeps one small mutable thing: the label of the newest memo segment.
const HEAD = "lexlean-memo-head";

async function opfs(holo) {
  const root = await navigator.storage.getDirectory();
  const k = await holo.opfs_put(new TextEncoder().encode("lexlean store probe")); // fails where OPFS cannot be written this way
  if (!(await holo.opfs_get(k))) throw new Error("OPFS read-back failed");
  return {
    kind: "Hologram KappaStore on OPFS",
    put: (bytes) => holo.opfs_put(bytes),
    get: (kappa) => holo.opfs_get(kappa), // Hologram verifies the bytes against the label
    head: {
      get: async () => { try { return (await (await (await root.getFileHandle(HEAD)).getFile()).text()) || null; } catch { return null; } },
      set: async (k2) => { const w = await (await root.getFileHandle(HEAD, { create: true })).createWritable(); await w.write(k2); await w.close(); },
    },
    clear: async () => { const names = []; for await (const n of root.keys()) names.push(n); for (const n of names) await root.removeEntry(n, { recursive: true }); },
  };
}

async function idb(holo) {
  const open = () => new Promise((ok, bad) => { const r = indexedDB.open("lexlean-kappa", 1); r.onupgradeneeded = () => r.result.createObjectStore("objects"); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
  const tx = async (mode, f) => { const db = await open(); return new Promise((ok, bad) => { const t = db.transaction("objects", mode), q = f(t.objectStore("objects")); t.oncomplete = () => { db.close(); ok(q && q.result); }; t.onerror = () => { db.close(); bad(t.error); }; }); };
  const s = {
    kind: "IndexedDB, verified by label on read",
    put: async (bytes) => { const k = holo.address(bytes); await tx("readwrite", (o) => o.put(bytes, k)); return k; },
    get: async (kappa) => { const b = await tx("readonly", (o) => o.get(kappa)); if (!b) return null; if (holo.address(b) !== kappa) throw new Error("stored bytes do not match their label"); return b; },
    head: { get: async () => (await tx("readonly", (o) => o.get(HEAD))) || null, set: (k) => tx("readwrite", (o) => o.put(k, HEAD)) },
    clear: () => tx("readwrite", (o) => o.clear()),
  };
  await s.head.get();
  return s;
}

export function memory(holo) {
  const m = new Map(); let head = null;
  return { kind: "memory only", put: async (b) => { const k = holo.address(b); m.set(k, b); return k; }, get: async (k) => m.get(k) || null,
    head: { get: async () => head, set: async (k) => { head = k; } }, clear: async () => { m.clear(); head = null; } };
}

/** A folder on disk (Node). `fs` and `path` are passed in so that this file loads in a browser too. */
export function folder(holo, dir, fs, path) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (k) => path.join(dir, k.replace(":", "_"));
  return {
    kind: "a folder, verified by label on read",
    put: async (b) => { const k = holo.address(b); fs.writeFileSync(file(k), b); return k; },
    get: async (k) => { if (!fs.existsSync(file(k))) return null; const b = new Uint8Array(fs.readFileSync(file(k))); if (holo.address(b) !== k) throw new Error("stored bytes do not match their label"); return b; },
    head: { get: async () => fs.existsSync(path.join(dir, HEAD)) ? fs.readFileSync(path.join(dir, HEAD), "utf8") || null : null, set: async (k) => fs.writeFileSync(path.join(dir, HEAD), k) },
    clear: async () => { for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n), { force: true }); },
  };
}

/** The best store this browser offers; `prefer` forces one ("opfs", "idb", "memory"). */
export async function browser(holo, prefer) {
  const unavailable = [];
  for (const [name, make] of [["opfs", opfs], ["idb", idb], ["memory", async (h) => memory(h)]]) {
    if (prefer && prefer !== name) continue;
    try { const s = await make(holo); s.unavailable = unavailable; return s; } catch (e) { unavailable.push(`${name}: ${e && e.message || e}`); }
  }
  throw new Error("no store: " + unavailable.join("; "));
}
