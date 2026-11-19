// The sealed prover's page logic, run only from bytes sealed.html admitted by the seal.
//
// prove(project): LexLean checks the project and gives its semantic model, the model is lowered to Lean kernel
// declarations, a proof of each theorem is found, and Lean's kernel judges all of it, in a worker. There is no Lean
// elaborator and no Lean library beyond the small base the lowering writes against.
//
// Before any of it, the project is looked up by label: the seal's label and the label of every project file. A project
// already judged under this exact seal is answered from the origin's store, re-hashed on read; an edit changes a
// label, so it is judged again.
//
// The verdict: accepted only if LexLean accepts the project, every theorem has a proof the kernel accepts, and each
// theorem uses only axioms it declared and only Lean's three standard ones. A proof found here may need fewer axioms
// than the one LexLean's own Lean text uses (an arithmetic proof without `Classical.choice`, say); fewer is accepted
// and shown, since it assumes strictly less.
import { STANDARD_AXIOMS } from "../src/axioms.mjs";

const enc = new TextEncoder(), dec = new TextDecoder();

export function prover({ seal, sealLabel, link, files, holo }) {
  const label = (bytes) => holo.address(bytes);
  let worker = null, nextId = 0, ready = null;
  const waiting = new Map();
  const ask = (msg) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (r) => (r.error ? reject(new Error(r.error)) : resolve(r)));
    worker.postMessage({ id, ...msg });
  });
  // The worker, started on the first miss only.
  const start = () => (ready ??= (async () => {
    worker = new Worker(link("web/sealed-worker.mjs"), { type: "module" });
    worker.onmessage = ({ data }) => { waiting.get(data.id)?.(data); waiting.delete(data.id); };
    worker.onerror = (e) => { for (const done of waiting.values()) done({ error: "the prover's worker failed: " + (e.message ?? e) }); waiting.clear(); };
    // A worker built from checked bytes has a blob: base, so it gets the seal with absolute URLs.
    const abs = (e) => e && { ...e, url: new URL(e.url, location.href).href };
    const forWorker = { ...seal, lexlean: abs(seal.lexlean), base: abs(seal.base), kernel: { loader: abs(seal.kernel.loader), wasm: abs(seal.kernel.wasm) } };
    return ask({ op: "init", hologramJs: link("hologram/hologram_store.js"), hologramWasm: files.get("hologram/hologram_store_bg.wasm"), seal: forWorker });
  })());

  // The verdict store: `key -> verdict label` and `verdict label -> verdict bytes`, in the origin's private file
  // system, written by the worker (the one place every browser can write it). A verdict is used only if its bytes
  // still have its label. The worker is light until a proof needs the kernel: it starts nothing else to answer these.
  const read = async (name) => { await start(); return (await ask({ op: "read", name })).bytes; };
  const write = async (name, bytes) => { await start(); await ask({ op: "write", name, bytes }); };
  const remembered = async (key) => {
    const pointer = await read(key.slice(7));
    if (!pointer) return null;
    const vLabel = dec.decode(pointer), bytes = await read(vLabel.slice(7));
    return bytes && label(bytes) === vLabel ? { label: vLabel, verdict: JSON.parse(dec.decode(bytes)) } : null;
  };
  const remember = async (key, verdict) => {
    const bytes = enc.encode(JSON.stringify(verdict)), vLabel = label(bytes);
    await write(vLabel.slice(7), bytes);
    await write(key.slice(7), enc.encode(vLabel));
    return vLabel;
  };

  /** project: [[path, bytes]] of a LexLean project. */
  async function prove(project, { recheck = false } = {}) {
    const t0 = performance.now();
    const listed = [...project].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, b]) => `${p}\u0000${label(b)}`);
    const key = label(enc.encode(["lean-prover/project-verdict/2", sealLabel, ...listed].join("\n")));
    if (!recheck) {
      const hit = await remembered(key);
      if (hit) return { ...hit.verdict, remembered: true, key, verdictLabel: hit.label, totalMs: Math.round(performance.now() - t0) };
    }
    const init = await start();
    const r = await ask({ op: "prove", files: project });
    const refusals = [], theorems = r.theorems ?? [];
    if (!r.ok) refusals.push({ code: r.stage, diagnostics: r.diagnostics });
    for (const th of theorems) {
      const declared = th.declared, got = th.axioms;
      th.result = !th.found ? "no proof" : got === null ? "not judged"
        : got.some((a) => !STANDARD_AXIOMS.includes(a)) ? "nonstandard axiom"
        : got.some((a) => !declared.includes(a)) ? "undeclared axiom"
        : got.length < declared.length ? "proved, fewer axioms than declared" : "proved";
      if (!th.result.startsWith("proved")) refusals.push({ code: th.result, diagnostics: `${th.name}: ${th.why ?? `axioms ${got?.join(", ") || "none"}, declared ${declared.join(", ") || "none"}`}` });
    }
    const verdict = {
      accepted: r.ok && theorems.length > 0 && refusals.length === 0, refusals, theorems,
      declarations: r.declarations ?? 0, recursive: r.recursive ?? 0,
      evidence: { seal: sealLabel, ...init.evidence },
    };
    const verdictLabel = verdict.accepted ? await remember(key, verdict) : null; // a refusal is judged again next time
    return { ...verdict, remembered: false, key, verdictLabel, store: init.store, timings: r.timings ?? null, heapMB: r.heapMB ?? null, totalMs: Math.round(performance.now() - t0) };
  }
  return { prove, close: () => worker?.terminate() };
}

/** The page: proves the project served under ?project= (default /project), and shows the verdict. */
export async function main(ctx) {
  const q = new URLSearchParams(location.search), base = (q.get("project") ?? "/project").replace(/\/$/, "");
  const verdictEl = document.getElementById("verdict"), rows = document.getElementById("rows");
  const p = prover(ctx);
  window.lexleanProver = p;
  try {
    const names = await (await fetch(`${base}/index.json`)).json(), project = [];
    for (const n of names) project.push([n, new Uint8Array(await (await fetch(`${base}/${n}`)).arrayBuffer())]);
    ctx.say("Proving…");
    const r = await p.prove(project, { recheck: !!q.get("recheck") });
    for (const th of r.theorems) {
      const row = rows.insertRow(), cut = th.name.lastIndexOf(".");
      row.insertCell().innerHTML = `<code>${th.name.slice(0, cut)}</code>`; row.insertCell().innerHTML = `<code>${th.name.slice(cut + 1)}</code>`; row.insertCell().textContent = th.proof ?? "";
      row.insertCell().textContent = th.axioms ? th.axioms.join(", ") || "none" : "";
      const c = row.insertCell(); c.textContent = th.result; c.className = th.result.startsWith("proved") ? "ok" : "bad";
    }
    const fewer = r.theorems.filter((t) => t.result === "proved, fewer axioms than declared").length;
    verdictEl.className = r.accepted ? "ok" : "bad";
    verdictEl.textContent = (r.accepted
      ? `Proved: ${r.theorems.length} theorems over ${r.declarations} declarations, every one accepted by Lean's kernel within its declared axioms${fewer ? ` (${fewer} with fewer than declared)` : ""}.`
      : `Not proved: ${r.refusals[0].code}: ${r.refusals[0].diagnostics}`) + (r.remembered ? ` Remembered: judged before under this seal (${r.verdictLabel}).` : "");
    const t = r.timings;
    ctx.say(r.remembered ? `Answered from this origin's store in ${r.totalMs} ms; nothing run.`
      : `Judged in ${r.totalMs} ms${t ? `: LexLean ${t.lexleanMs} ms, kernel start ${t.kernelStartMs} ms, lowering ${t.lowerMs} ms, proofs ${t.findMs} ms, kernel check ${t.judgeMs} ms` : ""}${r.heapMB ? `; kernel memory ${r.heapMB} MiB` : ""}.`);
    window.result = { done: true, ...r };
  } catch (e) {
    verdictEl.className = "bad"; verdictEl.textContent = "Could not prove: " + (e.message ?? e);
    window.result = { done: true, error: String(e.message ?? e) };
  }
}
