// The prover. One implementation, used the same way in a browser tab and in Node:
//
//     const result = await prover.prove(moduleText)
//     // { theorems, proved, failed: [{ name, why }], reused, found, published, ms }
//
// Every theorem ends in one of three ways, and in each the judge is Lean's own kernel:
//   reused     it was judged before, under this exact environment: found by its label, nothing runs
//   found      a proof was found here with no Lean running, and the kernel accepted it on the declared axioms
//   published  Lean's own proof term, from a pack found by its label, judged here and bound to its statement
// Otherwise it is in `failed`, with the reason. Nothing is ever reported proved that the kernel did not accept.
//
// Every label is a UOR κ-label (BLAKE3). The environment is one label, the pin's: it names the kernel, the library
// and this code by their own labels, so every address below changes if any byte of them does.
//   module   -> all of it is proved            chunk -> a run of 256 theorems is proved
//   theorem  -> proved (same content under any name is one entry)
//   library  -> this kernel has judged this library whole: done once, here, then remembered
// What is kept is kept by label in the store: the judged terms, and the memo as a chain of immutable segments.
import { readModule } from "./emit.mjs";

const enc = new TextEncoder(), dec = new TextDecoder();
const CHUNK = 256, PER_KERNEL = 48;

/** host: { env, library, kernel, hasher, address, store, spawn, kernels, proofs?, idleMs? } */
export async function openProver({ env, library, kernel, hasher, address, store, spawn, kernels = 4, proofs = null, idleMs = 30000 }) {
  const key = (tag, ...rest) => address(enc.encode([tag, env, ...rest].join("\u0000")));

  // The memo: a chain of segments from the head. A segment that is missing or fails its label ends the walk, and
  // what it held is simply judged again.
  const memo = new Map(); let head = await store.head.get(), pending = [], refused = null;
  for (let k = head; k; ) {
    let bytes; try { bytes = await store.get(k); } catch (e) { refused = String(e && e.message || e); }
    if (!bytes) { if (k === head) head = null; break; }
    const seg = JSON.parse(dec.decode(bytes)); for (const [q, a] of seg.entries) if (!memo.has(q)) memo.set(q, a); k = seg.prev;
  }
  const remember = (q, a) => { if (!memo.has(q)) { memo.set(q, a); pending.push([q, a]); } };
  const flush = async () => { if (!pending.length) return; head = await store.put(enc.encode(JSON.stringify({ prev: head, entries: pending }))); pending = []; await store.head.set(head); };

  // Kernels: as many as the work needs, no more. The first one judges the library if no session has yet, and no
  // proof is accepted from any kernel before that verdict is in.
  const libraryJudged = key("lexlean/library-judged/1"), libraryText = dec.decode(library);
  const pool = [], waiting = new Map(); let nextId = 0, starting = 0, libraryMs = null;
  const startOne = (judgeLibrary) => new Promise((ok, bad) => {
    const w = spawn();
    w.onmessage = (data) => {
      if (data.ready) { if (data.judged) { if (!data.judged.ok) return bad(new Error("the kernel refused the library: " + data.judged.last)); libraryMs = data.judged.ms; remember(libraryJudged, { ms: Math.round(data.judged.ms) }); } pool.push(w); ok(); }
      else if (data.failed) bad(new Error(data.failed)); else { waiting.get(data.id)(data); waiting.delete(data.id); }
    };
    w.onerror = (e) => bad(new Error(e && e.message || "a kernel worker failed"));
    w.post({ start: { wasmBinary: kernel.buffer.slice(kernel.byteOffset, kernel.byteOffset + kernel.byteLength), libraryText, environment: env, storeWasm: hasher.buffer.slice(hasher.byteOffset, hasher.byteOffset + hasher.byteLength), judgeLibrary } });
  });
  async function ensureKernels(n) {
    n = Math.min(kernels, Math.max(1, n));
    if (!pool.length && !starting && !memo.has(libraryJudged)) { starting++; try { await startOne(true); } finally { starting--; } }
    const add = n - pool.length - starting; if (add <= 0) return;
    starting += add; try { await Promise.all(Array.from({ length: add }, () => startOne(false))); } finally { starting -= add; }
  }
  const ask = (w, msg) => new Promise((ok) => { const id = nextId++; waiting.set(id, ok); w.post({ id, ...msg }); });

  async function proveNow(text) {
    const t = performance.now(), r = { theorems: 0, proved: 0, failed: [], reused: 0, found: 0, published: 0, ms: 0, kernels: 0 };
    const done = async () => { await flush(); r.proved = r.theorems - r.failed.length; r.kernels = pool.length; r.ms = performance.now() - t; return r; };
    const moduleKey = key("lexlean/module/1", text), known = memo.get(moduleKey);
    if (known) { r.theorems = r.reused = known.theorems; return done(); }

    const theorems = readModule(text), byName = new Map(theorems.map((th, i) => [th.name, i]));
    r.theorems = theorems.length;
    // A chunk's label also covers the names in the module: a new name elsewhere could change what an identifier
    // inside the chunk refers to.
    const names = key("lexlean/names/1", theorems.map((th) => th.name).join("\n")), chunkKeys = [], open = [];
    for (let c = 0; c * CHUNK < theorems.length; c++) {
      const part = theorems.slice(c * CHUNK, (c + 1) * CHUNK);
      chunkKeys[c] = key("lexlean/chunk/1", names, part.map((th) => th.name + "\n" + th.text).join("\n\n"));
      if (memo.has(chunkKeys[c])) r.reused += part.length; else open.push(c);
    }
    const keys = new Array(theorems.length), cites = new Array(theorems.length);
    const keyOf = (i) => {
      if (keys[i]) return keys[i];
      const th = theorems[i]; cites[i] = []; keys[i] = "pending"; // a citation cycle is not a proof
      for (const id of th.text.match(/[A-Za-z_][\w'.]*/g) || []) { const j = byName.get(id) ?? byName.get(th.ns + "." + id); if (j !== undefined && j !== i && !cites[i].includes(j)) cites[i].push(j); }
      return keys[i] = key("lexlean/theorem/1", th.ns, th.text, ...cites[i].map(keyOf));
    };
    const misses = [], first = new Map(), same = [];
    for (const c of open) for (let i = c * CHUNK; i < Math.min((c + 1) * CHUNK, theorems.length); i++) {
      const k = keyOf(i);
      if (memo.has(k)) r.reused++; else if (first.has(k)) same.push(i); else { first.set(k, i); misses.push(i); }
    }

    if (misses.length) {
      await ensureKernels(Math.ceil(misses.length / PER_KERNEL));
      if (libraryMs !== null) { r.libraryJudgedMs = libraryMs; libraryMs = null; }
      const n = Math.min(pool.length, misses.length), per = Math.ceil(misses.length / n);
      const replies = await Promise.all(Array.from({ length: Math.ceil(misses.length / per) }, (_, c) => {
        // Send the theorems to prove and, before them, everything they cite.
        const want = misses.slice(c * per, (c + 1) * per), send = [], at = new Map();
        const add = (i) => { if (at.has(i)) return; keyOf(i); for (const j of cites[i]) add(j); at.set(i, send.length); const th = theorems[i]; send.push({ name: th.name, ns: th.ns, text: th.text, binders: th.binders, raw: th.raw, script: th.script }); };
        want.forEach(add);
        return ask(pool[c], { theorems: send, indices: want.map((i) => at.get(i)) }).then((x) => ({ ...x, results: x.results.map(([, res], y) => [want[y], res]) }));
      }));
      const unproved = [];
      for (const x of replies) {
        const batch = x.suffix ? await store.put(enc.encode(x.suffix)) : null; // the judged terms, kept by label
        for (const [i, res] of x.results) {
          const declared = proofs && proofs.axioms ? proofs.axioms.get(theorems[i].name) : undefined;
          if (res && res.ok && declared !== undefined && res.axioms.join() !== declared.join()) unproved.push([i, `a proof was found, but on [${res.axioms.join(", ")}] where [${declared.join(", ")}] is declared`]);
          else if (res && res.ok) { remember(keys[i], { by: "found", declaration: res.decl, batch }); r.found++; }
          else unproved.push([i, res ? res.why : "no result"]);
        }
      }
      // What was not found here may have a published proof: Lean's own term, in a pack found by its label. The pack
      // is data, not code. Its bytes are checked against the label, and the kernel judges every declaration in it.
      const wanted = new Map();
      for (const [i, why] of unproved) { const p = proofs && proofs.byTheorem.get(theorems[i].name); if (p) wanted.set(p, [...(wanted.get(p) || []), i]); else r.failed.push({ name: theorems[i].name, why }); }
      for (const [p, is] of wanted) {
        let v; try { v = await ask(pool[0], { pack: await proofs.fetch(p), names: is.map((i) => theorems[i].name) }); } catch (e) { v = { ok: false, why: String(e && e.message || e), axioms: [] }; }
        const ax = new Map(v.axioms);
        for (const i of is) {
          const name = theorems[i].name, declared = proofs.axioms ? proofs.axioms.get(name) : undefined;
          if (!v.ok) r.failed.push({ name, why: "the published proof was refused: " + v.why });
          else if (declared !== undefined && (ax.get(name) || []).join() !== declared.join()) r.failed.push({ name, why: "the published proof rests on other axioms than declared" });
          else { remember(keys[i], { by: "published", pack: p.kappa }); r.published++; }
        }
      }
    }
    for (const i of same) { if (memo.has(keys[i])) r.reused++; else r.failed.push({ name: theorems[i].name, why: "same content as a theorem that was not proved" }); }
    // A chunk is recorded when all of it is proved and nothing in it cites a theorem outside it.
    for (const c of open) {
      const lo = c * CHUNK, hi = Math.min(lo + CHUNK, theorems.length); let whole = true;
      for (let i = lo; i < hi && whole; i++) whole = memo.has(keys[i]) && cites[i].every((j) => j >= lo && j < hi);
      if (whole) remember(chunkKeys[c], { theorems: hi - lo });
    }
    if (!r.failed.length) remember(moduleKey, { theorems: theorems.length });
    return done();
  }
  // One prover serves every caller. The same module asked for twice at once is judged once, and kernels that have
  // had nothing to do for idleMs are let go: their memory comes back, and the next request starts them again
  // without judging the library a second time.
  const inflight = new Map(); let active = 0, idle = null;
  const retire = () => { for (const w of pool.splice(0)) w.terminate(); };
  function prove(text) {
    const k = key("lexlean/asked/1", text); let p = inflight.get(k);
    if (!p) {
      clearTimeout(idle); active++;
      p = proveNow(text).finally(() => { inflight.delete(k); if (!--active && idleMs >= 0) { idle = setTimeout(retire, idleMs); if (idle.unref) idle.unref(); } });
      inflight.set(k, p);
    }
    return p;
  }
  return { environment: env, prove, memo: { entries: memo.size, refused }, kernels: () => pool.length, close: () => { clearTimeout(idle); return Promise.all(pool.splice(0).map((w) => w.terminate())); } };
}
