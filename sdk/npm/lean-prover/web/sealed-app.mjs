// The sealed prover's page logic, run only from bytes sealed.html admitted by the seal.
//
// prove(project) does what Node's prove does (src/prover.mjs), with the same verdict code (src/verdict.mjs):
// LexLean renders the project, Lean elaborates each project module, the kernel replays every declaration, and the
// axiom audit applies. Before any of it, the project is looked up by label: the seal's label and the label of every
// project file. A project already judged under this exact seal is answered from the origin's store, re-hashed on
// read, and Lean is not started; an edit changes a label, so it is judged again.
import { entrypointsOf, judge, judgedRows, sourceRootsOf } from "../src/verdict.mjs";

const enc = new TextEncoder(), dec = new TextDecoder();

export function prover({ seal, sealLabel, link, files, holo, say = () => {} }) {
  const label = (bytes) => holo.address(bytes);
  let worker = null, nextId = 0, ready = null;
  const waiting = new Map();
  const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (r) => (r.error ? reject(new Error(r.error)) : resolve(r)));
    worker.postMessage({ id, ...msg }, transfer);
  });
  // The worker, started on the first miss only.
  const start = () => (ready ??= (async () => {
    worker = new Worker(link("web/sealed-worker.mjs"), { type: "module" });
    worker.onmessage = ({ data }) => { waiting.get(data.id)?.(data); waiting.delete(data.id); };
    worker.onerror = (e) => { for (const done of waiting.values()) done({ error: "the engine's worker failed: " + (e.message ?? e) }); waiting.clear(); };
    // A worker built from checked bytes has a blob: base, so it gets the seal with absolute URLs.
    const abs = (e) => e && { ...e, url: new URL(e.url, location.href).href };
    const forWorker = { ...seal, manifest: abs(seal.manifest), lexlean: abs(seal.lexlean), runtime: abs(seal.runtime) };
    return ask({ op: "init", hologramJs: link("hologram/hologram_store.js"), hologramWasm: files.get("hologram/hologram_store_bg.wasm"), seal: forWorker });
  })());

  // The verdict store: `key -> verdict label` and `verdict label -> verdict bytes`, both in the origin's private file
  // system. A verdict is used only if its bytes still have its label.
  let dir = null;
  const verdicts = async () => (dir ??= await (await navigator.storage.getDirectory()).getDirectoryHandle("lean-verdicts", { create: true }).catch(() => null));
  const read = async (name) => { try { return new Uint8Array(await (await (await (await verdicts()).getFileHandle(name)).getFile()).arrayBuffer()); } catch { return null; } };
  const write = async (name, bytes) => { try { const w = await (await (await verdicts()).getFileHandle(name, { create: true })).createWritable(); await w.write(bytes); await w.close(); } catch {} };
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
    const key = label(enc.encode(["lean-prover/project-verdict/1", sealLabel, ...listed].join("\n")));
    if (!recheck) {
      const hit = await remembered(key);
      if (hit) return { ...hit.verdict, remembered: true, key, verdictLabel: hit.label, totalMs: Math.round(performance.now() - t0) };
    }
    const toml = dec.decode((project.find(([n]) => n === "lexlean.toml") ?? [null, new Uint8Array()])[1]);
    if (!toml) throw new Error("the project has no lexlean.toml");

    const init = await start();
    say("Rendering with LexLean…");
    let t = performance.now();
    const r = await ask({ op: "render", files: project });
    if (!r.ok) throw new Error("LexLean refused the project: " + r.diagnostics);
    const rendered = r.rendered, renderMs = Math.round(performance.now() - t);
    // The runtime the library holds must be the one this LexLean renders for. Until the manifest names the render's
    // own semantics (it names LexLean's version line instead), the seal records the render semantics it accepts.
    const semantics = seal.semantics ?? init.semantics;
    if (rendered.compiler?.semantics_id !== semantics) throw new Error(`the project was rendered for compiler semantics ${rendered.compiler?.semantics_id}; the seal accepts ${semantics}`);

    say("Opening Lean…");
    t = performance.now();
    const opened = await ask({ op: "open" });
    if (!opened.ok) throw new Error("refused: " + opened.refusal);
    const openMs = Math.round(performance.now() - t);

    const answers = new Map(), timing = [];
    let heapMB = opened.heapMB;
    const runtime = new Map();
    const rt = await ask({ op: "runtime" });
    if (rt.bytes) for (const l of dec.decode(rt.bytes).split("\n").filter((x) => x.startsWith("{"))) { const j = JSON.parse(l); runtime.set(j.module, j); }
    for (const row of judgedRows(rendered).filter((m) => m.kind === "runtime")) {
      if (runtime.has(row.lean_module)) { answers.set(row.lean_module, runtime.get(row.lean_module)); continue; }
      say(`Checking ${row.lean_module}…`);
      const x = await ask({ op: "request", request: { op: "check", outDir: "/out", module: row.lean_module } });
      if (x.answer?.error) throw new Error(`${row.lean_module}: ${x.answer.error} — Lean printed: ${x.printed}`);
      answers.set(row.lean_module, x.answer); heapMB = x.heapMB;
    }
    for (const row of rendered.modules.filter((m) => m.kind === "project")) {
      say(`Elaborating ${row.lean_module}…`);
      const path = `/src/${row.lean_module.replaceAll(".", "/")}.lean`;
      await ask({ op: "write", path, bytes: enc.encode(row.text) });
      const x = await ask({ op: "request", request: { op: "elaborate", outDir: "/out", module: row.lean_module, path } });
      if (x.answer?.error) throw new Error(`${row.lean_module}: ${x.answer.error} — Lean printed: ${x.printed}`);
      answers.set(row.lean_module, x.answer);
      timing.push({ module: row.lean_module, ms: x.ms, elabMs: x.answer.elabMs, replayMs: x.answer.replayMs, heapMB: x.heapMB });
      heapMB = x.heapMB;
    }
    const v = judge({ rendered, answers, entrypoints: entrypointsOf(toml), sourceRoots: sourceRootsOf(toml) });
    const verdict = {
      accepted: v.accepted, refusals: v.refusals,
      modules: v.modules.map((m) => ({ module: m.module, kind: m.kind, accepted: m.accepted, declarations: m.declarations })),
      policies: { rows: v.policies.length, held: v.policies.filter((p) => p.holds).length },
      evidence: { seal: sealLabel, ...init.evidence, runtime: seal.runtime?.kappa ?? null, source_id: rendered.source_id, semantic_id: rendered.semantic_id, build_id: rendered.build_id },
    };
    const verdictLabel = await remember(key, verdict);
    return { ...verdict, remembered: false, key, verdictLabel, renderMs, openMs, open: opened.timings, timing, heapMB, totalMs: Math.round(performance.now() - t0) };
  }
  return { prove, close: () => worker?.terminate(), opened: () => (worker ? ask({ op: "opened" }) : { opened: [] }) };
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
    const r = await p.prove(project, { recheck: !!q.get("recheck") });
    const proj = r.modules.filter((m) => m.kind === "project"), decls = proj.flatMap((m) => m.declarations);
    for (const m of proj) for (const d of m.declarations) {
      const row = rows.insertRow();
      row.insertCell().innerHTML = `<code>${m.module}</code>`; row.insertCell().innerHTML = `<code>${d.name}</code>`; row.insertCell().textContent = d.kind;
      row.insertCell().textContent = d.axioms.join(", ") || "none";
      const c = row.insertCell(); c.textContent = d.accepted ? "accepted" : "refused"; c.className = d.accepted ? "ok" : "bad";
    }
    verdictEl.className = r.accepted ? "ok" : "bad";
    verdictEl.textContent = (r.accepted
      ? `Proved: ${proj.length} project modules, ${decls.length} declarations (${decls.filter((d) => d.kind === "theorem").length} theorems), every one accepted by Lean's kernel and within its axiom policy.`
      : `Not proved: ${r.refusals[0].code}: ${r.refusals[0].diagnostics}`) + (r.remembered ? ` Remembered: judged before under this seal (${r.verdictLabel}).` : "");
    ctx.say(`${r.remembered ? "Answered from this origin's store" : "Judged here"} in ${r.totalMs} ms.${r.remembered ? "" : ` Render ${r.renderMs} ms, open ${r.openMs} ms, Lean's memory ${r.heapMB} MiB.`}`);
    window.result = { done: true, ...r, modules: r.modules.map((m) => ({ module: m.module, kind: m.kind, accepted: m.accepted, declarations: m.declarations.length })) };
  } catch (e) {
    verdictEl.className = "bad"; verdictEl.textContent = "Could not prove: " + (e.message ?? e);
    window.result = { done: true, error: String(e.message ?? e) };
  }
}
