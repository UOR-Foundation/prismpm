// The sealed prover's page logic, run only from bytes sealed.html admitted by the seal.
//
// prove(project): LexLean checks the project and gives its semantic model (lexlean-worker.mjs), the model is lowered to
// Lean kernel declarations and a proof of each theorem is found (the coordinator, sealed-worker.mjs), and Lean's kernel
// judges the theorems in batches, several kernels at once (judge-worker.mjs). There is no Lean elaborator.
//
// Work is addressed by content and done once:
//   - a project judged before under this seal is answered from the store, by the labels of the seal and of every file;
//   - a theorem judged before under this seal and its Merkle key is not judged again, so an edit re-judges only the
//     theorems that reach what changed;
//   - a kernel resumes from an image of itself with the base library loaded, instead of reading the library again.
// A returning visit starts one worker, LexLean's, which answers from the store. Otherwise LexLean, the coordinator and the
// kernels all start at once, each warming while the others work.
//
// The verdict: accepted only if LexLean accepts the project, every theorem has a proof the kernel accepts, and each
// theorem uses only axioms it declared and only Lean's three standard ones. A proof found here may need fewer axioms
// than LexLean's own Lean text uses; fewer is accepted and shown, since it assumes strictly less.
import { STANDARD_AXIOMS } from "../src/axioms.mjs";

const enc = new TextEncoder(), dec = new TextDecoder();
const q = new URLSearchParams(location.search);

// How many kernels side by side: the cores there are to spare, fewer where memory is short (each holds about 70 MiB).
function judgesFor() {
  if (q.get("judges")) return Math.max(1, Number(q.get("judges")));
  const cores = navigator.hardwareConcurrency || 4, memory = navigator.deviceMemory || 8;
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return Math.max(1, Math.min(cores - 1, phone || memory <= 4 ? 2 : 4, memory <= 2 ? 1 : 4));
}

function channel(url) {
  const w = new Worker(url, { type: "module" }), waiting = new Map();
  let next = 0;
  w.onmessage = ({ data }) => { waiting.get(data.id)?.(data); waiting.delete(data.id); };
  w.onerror = (e) => { for (const done of waiting.values()) done({ error: "a worker failed: " + (e.message ?? e) }); waiting.clear(); };
  const ask = (msg) => new Promise((resolve, reject) => { const id = next++; waiting.set(id, (r) => (r.error ? reject(new Error(r.error)) : resolve(r))); w.postMessage({ id, ...msg }, msg.image ? [msg.image.buffer] : []); });
  return { ask, close: () => w.terminate() };
}

export function prover({ seal, sealLabel, link, files, holo }) {
  const label = (bytes) => holo.address(bytes);
  // A worker built from checked bytes has a blob: base, so it gets the seal with absolute URLs.
  const abs = (e) => e && { ...e, url: new URL(e.url, location.href).href };
  const forWorker = { ...seal, lexlean: abs(seal.lexlean), base: abs(seal.base), kernel: { loader: abs(seal.kernel.loader), wasm: abs(seal.kernel.wasm) } };
  const boot = { hologramJs: link("hologram/hologram_store.js"), hologramWasm: files.get("hologram/hologram_store_bg.wasm"), seal: forWorker };

  let front = null, ready = null, coordinator = null, working = null;
  // When each part was ready, in milliseconds from the page's start: where the time goes, shown with the verdict.
  const t0 = performance.now(), timeline = { judges: [] };
  const mark = (k) => { timeline[k] ??= Math.round(performance.now() - t0); };
  const judges = [], wanted = judgesFor();
  // LexLean's worker, which also keeps the project verdicts: all a returning visit needs.
  const start = () => (ready ??= (async () => {
    front = channel(link("web/lexlean-worker.mjs"));
    const r = await front.ask({ op: "init", ...boot });
    mark("front");
    return r;
  })());
  // Everything else, on the first miss. The first kernel reads the base library and saves its image; the rest resume
  // from that image once it is there.
  const work = () => (working ??= (async () => {
    coordinator = channel(link("web/sealed-worker.mjs"));
    const init = coordinator.ask({ op: "init", ...boot, sealLabel });
    init.then(() => mark("coordinator"), () => {});
    addJudges(1);
    judges[0].ready.then(() => addJudges(wanted), () => {});
    return init;
  })());
  // The first judge resumes from the stored image or loads the library, and hands its image to the page; every other
  // judge waits for that and starts from a copy of it, so no two judges ever read the library at once.
  // The page holds that image only until the last judge has its copy.
  let image = null, handed = 0;
  const copy = () => { const c = image?.slice() ?? null; if (++handed >= wanted - 1) image = null; return c; };
  function addJudges(n) {
    while (judges.length < Math.min(n, wanted)) {
      const c = channel(link("web/judge-worker.mjs")), first = judges.length === 0;
      const ready = first
        ? c.ask({ op: "init", ...boot, wantImage: wanted > 1 }).then((r) => { image = r.image ?? null; delete r.image; return r; })
        : judges[0].ready.then(() => c.ask({ op: "init", ...boot, image: copy() }));
      ready.then((r) => timeline.judges.push({ at: Math.round(performance.now() - t0), ms: r.ms, resumed: r.resumed }), () => {});
      judges.push({ ...c, ready });
    }
  }

  // The project verdict store, kept by LexLean's worker: `key -> verdict label`, `verdict label -> verdict bytes`.
  const read = async (name) => (await front.ask({ op: "read", name })).bytes;
  const write = async (name, bytes) => { await front.ask({ op: "write", name, bytes }); };
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

  // The batches, judged by every kernel there is; a refused theorem is set aside and the rest of its batch judged again.
  async function judgeAll(m) {
    const done = new Map(), refused = new Map(), timing = { batches: 0, slowestMs: 0 };
    if (!m.todo.length) return { done, refused, timing };
    const { batches } = await coordinator.ask({ op: "split", names: m.todo, n: Math.min(m.todo.length, wanted * 2) });
    addJudges(batches.length);
    const queue = (await coordinator.ask({ op: "files", batches })).files;
    mark("files");
    const keyOf = new Map(m.theorems.map((t) => [t.name, t.key]));
    let failure = null;
    await Promise.all(judges.map(async (j) => {
      const init = await j.ready;
      timing.resumed = (timing.resumed ?? 0) + (init.resumed ? 1 : 0);
      for (let f; !failure && (f = queue.shift()); ) {
        const r = await j.ask({ op: "judge", text: f.text });
        timing.batches++; timing.slowestMs = Math.max(timing.slowestMs, r.ms);
        if (r.exit === 0) { for (const n of f.names) done.set(n, { axioms: r.axioms[n] ?? null, ms: Math.round(r.ms / f.names.length) }); continue; }
        const culprit = /declaration '([^']+)'/.exec(r.output)?.[1];
        if (!f.names.includes(culprit)) { failure = `Lean's kernel refused the lowered model: ${r.output}`; break; }
        refused.set(culprit, r.output.split("\n").slice(-1)[0].slice(0, 200));
        const rest = f.names.filter((n) => n !== culprit);
        if (rest.length) queue.push(...(await coordinator.ask({ op: "files", batches: [rest] })).files);
      }
    }));
    mark("judged");
    if (failure) throw Object.assign(new Error(failure), { stage: "kernel" });
    // One small write, so a tab closed at once still remembers.
    await coordinator.ask({ op: "record", results: [...done].filter(([, v]) => v.axioms).map(([n, v]) => ({ key: keyOf.get(n), axioms: v.axioms, ms: v.ms })) }).catch(() => {});
    return { done, refused, timing };
  }

  /** project: [[path, bytes]] of a LexLean project. */
  async function prove(project, { recheck = false } = {}) {
    const t0 = performance.now();
    const init = await start();
    const listed = [...project].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, b]) => `${p}\u0000${label(b)}`);
    const key = label(enc.encode(["lean-prover/project-verdict/2", sealLabel, ...listed].join("\n")));
    if (!recheck) {
      const hit = await remembered(key);
      if (hit) return { ...hit.verdict, remembered: true, key, verdictLabel: hit.label, totalMs: Math.round(performance.now() - t0) };
    }
    const coordinatorReady = work();
    mark("prove");
    const snap = await front.ask({ op: "snapshot", files: project });
    mark("snapshot");
    let m;
    if (!snap.ok) m = { ok: false, stage: "lexlean", diagnostics: snap.diagnostics, timings: {} };
    else { await coordinatorReady; m = await coordinator.ask({ op: "model", text: snap.text }); mark("model"); m.timings = { ...(m.timings ?? {}), lexleanMs: snap.ms }; }
    const refusals = [];
    let theorems = [], judged = { done: new Map(), refused: new Map(), timing: null };
    if (!m.ok) refusals.push({ code: m.stage, diagnostics: m.diagnostics });
    else {
      const t = performance.now();
      try { judged = await judgeAll(m); } catch (e) { refusals.push({ code: e.stage ?? "kernel", diagnostics: e.message }); }
      m.timings.judgeMs = Math.round(performance.now() - t);
      theorems = m.theorems.map((th) => {
        const got = th.remembered ? th.axioms : judged.done.get(th.name)?.axioms ?? null;
        const declared = th.declared;
        const result = th.status ?? (judged.refused.has(th.name) ? `not proved: Lean's kernel refused the proof found (${judged.refused.get(th.name)})`
          : got === null ? "not judged"
            : got.some((a) => !STANDARD_AXIOMS.includes(a)) ? "nonstandard axiom"
              : got.some((a) => !declared.includes(a)) ? "undeclared axiom"
                : got.length < declared.length ? "proved, fewer axioms than declared" : "proved");
        return { name: th.name, proof: th.proof, declared, axioms: got, result, remembered: th.remembered };
      });
      for (const th of theorems) if (!th.result.startsWith("proved")) refusals.push({ code: th.result.split(":")[0], diagnostics: `${th.name}: ${th.result}` });
    }
    const verdict = {
      accepted: m.ok && theorems.length > 0 && refusals.length === 0, refusals, theorems, declarations: m.declarations ?? 0,
      evidence: { seal: sealLabel, ...(await coordinatorReady).evidence },
    };
    const verdictLabel = verdict.accepted ? await remember(key, verdict) : null; // a refusal is judged again next time
    const reused = theorems.filter((t) => t.remembered).length;
    return { ...verdict, remembered: false, key, verdictLabel, store: init.store, timings: { ...m.timings, ...(judged.timing ?? {}), judges: judges.length, reused, timeline }, totalMs: Math.round(performance.now() - t0) };
  }
  return { prove, start, close: () => { front?.close(); coordinator?.close(); judges.forEach((j) => j.close()); } };
}

/** The page: proves the project served under ?project= (default /project), and shows the verdict. */
export async function main(ctx) {
  const base = (q.get("project") ?? "/project").replace(/\/$/, "");
  const verdictEl = document.getElementById("verdict"), rows = document.getElementById("rows");
  const p = prover(ctx);
  window.lexleanProver = p;
  p.start(); // the coordinator and the first kernel start now, while the project is fetched
  try {
    const names = await (await fetch(`${base}/index.json`)).json();
    const project = await Promise.all(names.map(async (n) => [n, new Uint8Array(await (await fetch(`${base}/${n}`)).arrayBuffer())]));
    ctx.say("Proving…");
    const r = await p.prove(project, { recheck: !!q.get("recheck") });
    for (const th of r.theorems) {
      const row = rows.insertRow(), cut = th.name.lastIndexOf(".");
      row.insertCell().innerHTML = `<code>${th.name.slice(0, cut)}</code>`; row.insertCell().innerHTML = `<code>${th.name.slice(cut + 1)}</code>`; row.insertCell().textContent = th.proof ?? "";
      row.insertCell().textContent = th.axioms ? th.axioms.join(", ") || "none" : "";
      const c = row.insertCell(); c.textContent = th.result + (th.remembered ? " (remembered)" : ""); c.className = th.result.startsWith("proved") ? "ok" : "bad";
    }
    const fewer = r.theorems.filter((t) => t.result === "proved, fewer axioms than declared").length;
    verdictEl.className = r.accepted ? "ok" : "bad";
    verdictEl.textContent = (r.accepted
      ? `Proved: ${r.theorems.length} theorems over ${r.declarations} declarations, every one accepted by Lean's kernel within its declared axioms${fewer ? ` (${fewer} with fewer than declared)` : ""}.`
      : `Not proved: ${r.refusals[0].code}: ${r.refusals[0].diagnostics}`) + (r.remembered ? ` Remembered: judged before under this seal (${r.verdictLabel}).` : "");
    const t = r.timings;
    ctx.say(r.remembered ? `Answered from this origin's store in ${r.totalMs} ms; nothing run.`
      : `Judged in ${r.totalMs} ms${t ? `: LexLean ${t.lexleanMs} ms, lowering ${t.lowerMs} ms, ${t.reused} theorems remembered, the rest on ${t.judges} kernels in ${t.judgeMs} ms (${t.batches ?? 0} batches, slowest ${t.slowestMs ?? 0} ms)` : ""}.`);
    window.result = { done: true, ...r };
  } catch (e) {
    verdictEl.className = "bad"; verdictEl.textContent = "Could not prove: " + (e.message ?? e);
    window.result = { done: true, error: String(e.message ?? e) };
  }
}
