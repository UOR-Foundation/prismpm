// The WASM Lean prover's Node entry: bytes in, verdicts out.
//
//   const prover = await open({ manifest, pin, read, gate, official });
//   const result = await prover.prove({ project });
//   await prover.close();
//
// `manifest` is the bytes of a `lean-wasm-prover/1` manifest, and `pin` the BLAKE3 label prism-code pins for it.
// `read(label, { refetch })` returns the stored (encoded) bytes of the blob with that BLAKE3 label; every blob is
// decoded and its label re-derived before a byte is used (src/blob.mjs). `gate` is the corpus gate's attestation
// the manifest names; `official` maps each Init file of the official Lean release (`lib/lean/...`) to its label.
// The prover has no network or file access of its own.
//
// `prove` runs LexLean's WASI build to check and render the project (`lexlean lean-modules`), elaborates every
// rendered module with Lean's own frontend, replays every declaration through a second, fresh kernel environment,
// and judges each declaration's observed axioms against its declared policy (src/verdict.mjs).
import { Worker } from "node:worker_threads";
import { blake3Label, checkEntry, ProverError, readAdmitted } from "./blob.mjs";
import { gateAdmits } from "./gate.mjs";
import { libraryLabel, unofficialInit } from "./library.mjs";
import { checkNpmSection } from "./npm.mjs";
import { cachedCheck, storeResult } from "./store.mjs";
import { entrypointsOf, judge, judgedRows } from "./verdict.mjs";
import { run as runWasi } from "./wasi.mjs";

export { libraryLabel, ProverError };
export { shardsFor } from "./npm.mjs";
export const MANIFEST_SCHEMA = "lean-wasm-prover/1";
export const RENDER_SCHEMA = "lexlean/lean-modules/1";
export const LEAN = Object.freeze({ version: "4.32.2", commit: "f3b06c705e6c85f5314019d5d3baab0fec5b580c" });

const LABEL = /^blake3:[0-9a-f]{64}$/;
const enc = new TextEncoder();
const dec = new TextDecoder();
const unpinned = (why) => new ProverError("lean-prover.manifest-unpinned", why);

/** The manifest's shape, or a `lean-prover.manifest-unpinned` refusal. Returns the manifest. */
export function checkManifest(manifest) {
  const fail = (why) => { throw unpinned(why); };
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA) fail(`the manifest is not ${MANIFEST_SCHEMA}`);
  if (manifest.lean !== LEAN.version || manifest.lean_commit !== LEAN.commit) {
    fail(`the manifest names Lean ${manifest.lean} at ${manifest.lean_commit}, not ${LEAN.version} at ${LEAN.commit}`);
  }
  checkEntry(manifest.engine?.loader, "engine.loader");
  checkEntry(manifest.engine?.wasm, "engine.wasm");
  checkEntry(manifest.lexlean?.wasm, "lexlean.wasm");
  if (!Array.isArray(manifest.library) || manifest.library.length === 0) fail("the manifest lists no library");
  const seen = new Set();
  for (const [i, entry] of manifest.library.entries()) {
    checkEntry(entry, `library[${i}]`);
    if (typeof entry.path !== "string" || !/^\/(lean|rt)\//.test(entry.path) || entry.path.includes("/../")) {
      fail(`library[${i}] has path ${entry.path}, outside /lean and /rt`);
    }
    if (seen.has(entry.path)) fail(`library path ${entry.path} is listed twice`);
    seen.add(entry.path);
  }
  if (manifest.gate !== undefined && (typeof manifest.gate !== "string" || !LABEL.test(manifest.gate))) {
    fail("the manifest's gate is not a BLAKE3 label");
  }
  if (manifest.npm !== undefined) checkNpmSection(manifest);
  return manifest;
}

/** The manifest from its bytes, admitted only when their BLAKE3 label is the pinned one. */
export function pinnedManifest(bytes, pin) {
  if (!(bytes instanceof Uint8Array)) throw unpinned("the manifest is not given as bytes");
  if (blake3Label(bytes) !== pin) throw unpinned(`the manifest is ${blake3Label(bytes)}, not the pinned ${pin}`);
  let manifest;
  try { manifest = JSON.parse(dec.decode(bytes)); } catch { throw unpinned("the manifest is not JSON"); }
  return checkManifest(manifest);
}

/** The manifest is admitted for proving: its gate admitted its engine (LP-04), and its Init is official (LP-05). */
export function checkAdmission(manifest, { gate, official }) {
  const g = gateAdmits(manifest, gate);
  if (!g.admitted) throw new ProverError("lean-prover.engine-ungated", g.why);
  const off = unofficialInit(manifest, official);
  if (off.length) throw new ProverError("lean-prover.library-unofficial", `${off.length} Init files are not the official release's: ${off.slice(0, 3).join(", ")}`);
}

class Engine {
  constructor() {
    // A deep native stack: the elaborator recurses deeply on proof-heavy modules.
    this.worker = new Worker(new URL("./engine-worker.mjs", import.meta.url), { resourceLimits: { stackSizeMb: 256 } });
    this.next = 0;
    this.waiting = new Map();
    this.worker.on("message", ({ id, ...reply }) => { this.waiting.get(id)?.(reply); this.waiting.delete(id); });
    // A trap, a panic or an exit ends every pending call with a refusal; nothing waits forever.
    const fail = (why) => { for (const done of this.waiting.values()) done({ error: why }); this.waiting.clear(); };
    this.worker.on("error", (e) => fail(String(e?.message ?? e)));
    this.worker.on("exit", (code) => fail(`the engine exited with ${code}`));
  }
  call(message, transfer = []) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (reply) => (reply.error ? reject(new ProverError("lean-prover.engine-trap", reply.error)) : resolve(reply)));
      this.worker.postMessage({ id, ...message }, transfer);
    });
  }
  close() { return this.worker.terminate(); }
}

function uniqueBuffers() {
  const seen = new Set();
  return (buffer) => (seen.has(buffer) ? false : (seen.add(buffer), true));
}

/**
 * Opens the engine alone: every blob is read and admitted by label, then Lean starts in its own thread. The corpus
 * gate drives this directly, before any attestation exists; `open` adds the pin, the gate and LexLean.
 */
export async function openEngine({ manifest, read }) {
  checkManifest(manifest);
  if (typeof read !== "function") throw unpinned("read is not a function");
  const [loader, wasm, lexleanWasm] = await Promise.all([
    readAdmitted(read, manifest.engine.loader, "engine.loader"),
    readAdmitted(read, manifest.engine.wasm, "engine.wasm"),
    readAdmitted(read, manifest.lexlean.wasm, "lexlean.wasm"),
  ]);
  const files = [];
  const queue = [...manifest.library];
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let e; (e = queue.shift()); ) files.push([e.path, await readAdmitted(read, e, e.path)]);
  }));
  const engine = new Engine();
  let opened;
  try {
    opened = await engine.call({ op: "open", loader, wasm, files }, [wasm.buffer, ...files.map(([, b]) => b.buffer)].filter(uniqueBuffers()));
  } catch (e) {
    await engine.close();
    throw e;
  }
  if (!opened.ok) {
    await engine.close();
    throw new ProverError("lean-prover.engine-trap", opened.refusal);
  }
  const evidence = {
    engine: manifest.engine.wasm.kappa,
    loader: manifest.engine.loader.kappa,
    library: libraryLabel(manifest),
    lexlean: manifest.lexlean.wasm.kappa,
    gate: manifest.gate ?? null,
  };
  return { engine, lexleanWasm, evidence };
}

/** Opens the prover: the pinned manifest, admitted by its gate and the official Init, then the engine and LexLean. */
export async function open({ manifest, pin, read, gate, official }) {
  const m = pinnedManifest(manifest, pin);
  checkAdmission(m, { gate, official });
  const { engine, lexleanWasm, evidence } = await openEngine({ manifest: m, read });
  const lexlean = await WebAssembly.compile(lexleanWasm);
  return {
    evidence,
    prove: (options) => proveWith({ engine, render: (files) => render(lexlean, files), manifest: m, evidence, ...options }),
    close: () => engine.close(),
  };
}

/** The project as a Map of project-relative path to bytes; an object of path to bytes or text is accepted too. */
export function projectFiles(project) {
  const refuse = (why) => { throw new ProverError("lean-prover.front-end-refused", why); };
  const entries = project instanceof Map ? [...project] : Object.entries(project ?? {});
  const files = new Map();
  for (const [path, value] of entries) {
    if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) refuse(`project path ${path} is not relative`);
    const bytes = typeof value === "string" ? enc.encode(value) : value instanceof Uint8Array ? value : null;
    if (!bytes) refuse(`project file ${path} is not bytes or text`);
    files.set(path, bytes);
  }
  if (!files.has("lexlean.toml")) refuse("the project has no lexlean.toml");
  return files;
}

/** Runs LexLean's print-only render on the WASI host: the project's checked, rendered Lean modules. */
export function render(lexlean, files) {
  const { exit, stdout, stderr } = runWasi(lexlean, { args: ["lexlean", "lean-modules", "--all"], files });
  if (exit !== 0) return { ok: false, diagnostics: stderr || stdout };
  let rendered;
  try { rendered = JSON.parse(stdout); } catch { return { ok: false, diagnostics: "lexlean lean-modules printed no JSON" }; }
  if (rendered?.spec !== RENDER_SCHEMA || !Array.isArray(rendered.modules)) {
    return { ok: false, diagnostics: `lexlean lean-modules printed ${rendered?.spec}, not ${RENDER_SCHEMA}` };
  }
  return { ok: true, rendered };
}

const sourcePath = (leanModule) => `/src/${leanModule.replaceAll(".", "/")}.lean`;

/**
 * prove over a given engine and render function, so the whole flow is testable with stand-ins. Every refusal is a
 * verdict, never a hang or a throw: `{ accepted: false, refusal: { code, diagnostics }, refusals, modules }`.
 */
export async function proveWith({ engine, render: renderProject, manifest, evidence, project, store = null }) {
  const refused = (code, diagnostics, extra = {}) => ({ accepted: false, modules: [], refusal: { code, diagnostics }, refusals: [{ code, diagnostics }], evidence: { ...evidence, project: null }, ...extra });
  let files;
  try { files = projectFiles(project); } catch (e) { return refused(e.code, e.message); }
  const r = renderProject(files);
  if (!r.ok) return refused("lean-prover.front-end-refused", r.diagnostics);
  const rendered = r.rendered;
  const projectEvidence = { source_id: rendered.source_id, semantic_id: rendered.semantic_id, build_id: rendered.build_id };
  // The runtime is the library's, compiled for one compiler's semantics; a project rendered by another compiler is
  // refused, never checked against the wrong runtime.
  if (manifest.lexlean.semantics_id !== rendered.compiler?.semantics_id) {
    return refused("lean-prover.front-end-refused", `the project was rendered for compiler semantics ${rendered.compiler?.semantics_id}; the library's runtime is ${manifest.lexlean.semantics_id}`, { evidence: { ...evidence, project: projectEvidence } });
  }
  const answers = new Map();
  const reused = new Set();
  try {
    // A runtime module with policies is the library's compiled module: the driver's check imports it and replays
    // every declaration through the kernel, which also observes the axioms its policy rows are judged on.
    for (const row of judgedRows(rendered).filter((m) => m.kind === "runtime")) {
      const { answer } = await engine.call({ op: "request", request: { op: "check", outDir: "/out", module: row.lean_module } });
      if (answer?.error) throw new ProverError("lean-prover.engine-trap", `${row.lean_module}: ${answer.error}`);
      answers.set(row.lean_module, answer);
    }
    for (const row of rendered.modules.filter((m) => m.kind === "project")) {
      const text = enc.encode(row.text);
      const path = sourcePath(row.lean_module);
      await engine.call({ op: "write", path, bytes: text });
      let answer = store ? await cachedCheck({ engine, store, evidence, module: row.lean_module, text }) : null;
      if (answer) reused.add(row.lean_module);
      else {
        ({ answer } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module: row.lean_module, path } }));
        if (answer?.error) throw new ProverError("lean-prover.engine-trap", `${row.lean_module}: ${answer.error}`);
        if (store && answer.elaborated && answer.replayRefused === null) await storeResult({ engine, store, evidence, module: row.lean_module, text, answer });
      }
      answers.set(row.lean_module, answer);
    }
  } catch (e) {
    return refused(e.code ?? "lean-prover.engine-trap", e.message, { evidence: { ...evidence, project: projectEvidence } });
  }
  const verdict = judge({ rendered, answers, entrypoints: entrypointsOf(dec.decode(files.get("lexlean.toml"))) });
  for (const m of verdict.modules) m.reused = reused.has(m.module);
  return { ...verdict, evidence: { ...evidence, project: projectEvidence } };
}
