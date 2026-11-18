// The WASM Lean prover's Node entry: bytes in, verdicts out.
//
//   const prover = await open({ manifest, read });
//   const result = await prover.prove({ project });
//   await prover.close();
//
// `manifest` is a `lean-wasm-prover/1` object. `read(label, { refetch })` returns the stored (encoded) bytes of the
// blob with that BLAKE3 label; every blob is decoded and its label re-derived before a byte is used
// (src/blob.mjs). The prover has no network or file access of its own.
//
// `prove` runs LexLean's WASI build to check and render the project (`lexlean lean-modules`), elaborates every
// rendered module with Lean's own frontend, replays every declaration through a second, fresh kernel environment,
// and applies the axiom audit exactly as `lexlean verify` does (LLV7005). A project is accepted only when every
// module is.
import { Worker } from "node:worker_threads";
import { auditPolicies, nonstandard } from "./axioms.mjs";
import { blake3Label, checkEntry, ProverError, readAdmitted } from "./blob.mjs";
import { cachedCheck, storeResult } from "./store.mjs";
import { run as runWasi } from "./wasi.mjs";

export { ProverError };
export const MANIFEST_SCHEMA = "lean-wasm-prover/1";
export const RENDER_SCHEMA = "lexlean/lean-modules/1";
export const LEAN = Object.freeze({ version: "4.32.2", commit: "f3b06c705e6c85f5314019d5d3baab0fec5b580c" });

const LABEL = /^blake3:[0-9a-f]{64}$/;
const enc = new TextEncoder();
const labelOf = (value) => blake3Label(enc.encode(JSON.stringify(value)));

/** The manifest's shape, or a `lean-prover.manifest` refusal. Returns the manifest. */
export function checkManifest(manifest) {
  const fail = (why) => { throw new ProverError("lean-prover.manifest", why); };
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
  return manifest;
}

/** The BLAKE3 label of the manifest's library listing: what the evidence names as the library. */
export function libraryLabel(manifest) {
  return labelOf(manifest.library.map((e) => [e.path, e.kappa]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

class Engine {
  constructor() {
    // A deep native stack: the elaborator recurses deeply on proof-heavy modules.
    this.worker = new Worker(new URL("./engine-worker.mjs", import.meta.url), { resourceLimits: { stackSizeMb: 256 } });
    this.next = 0;
    this.waiting = new Map();
    this.worker.on("message", ({ id, ...reply }) => { this.waiting.get(id)?.(reply); this.waiting.delete(id); });
    this.worker.on("error", (e) => { for (const done of this.waiting.values()) done({ error: String(e?.message ?? e) }); this.waiting.clear(); });
  }
  call(message, transfer = []) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (reply) => (reply.error ? reject(new ProverError("lean-prover.engine", reply.error)) : resolve(reply)));
      this.worker.postMessage({ id, ...message }, transfer);
    });
  }
  close() { return this.worker.terminate(); }
}

/**
 * Opens the engine alone: every blob is read and admitted by label, then Lean starts in its own thread. The corpus
 * gate drives this directly; `open` adds LexLean's front end on top.
 */
export async function openEngine({ manifest, read }) {
  checkManifest(manifest);
  if (typeof read !== "function") throw new ProverError("lean-prover.manifest", "read is not a function");
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
  const opened = await engine.call({ op: "open", loader, wasm, files }, [wasm.buffer, ...files.map(([, b]) => b.buffer)].filter(uniqueBuffers()));
  if (!opened.ok) {
    await engine.close();
    throw new ProverError("lean-prover.engine", opened.refusal);
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

/** Opens the prover: the engine, and LexLean's WASI build for checking and rendering. */
export async function open({ manifest, read }) {
  const { engine, lexleanWasm, evidence } = await openEngine({ manifest, read });
  const lexlean = await WebAssembly.compile(lexleanWasm);
  return {
    evidence,
    prove: (options) => prove({ engine, lexlean, manifest, evidence, ...options }),
    close: () => engine.close(),
  };
}

function uniqueBuffers() {
  const seen = new Set();
  return (buffer) => (seen.has(buffer) ? false : (seen.add(buffer), true));
}

/** The project as a Map of project-relative path to bytes; an object of path to bytes or text is accepted too. */
export function projectFiles(project) {
  const entries = project instanceof Map ? [...project] : Object.entries(project ?? {});
  const files = new Map();
  for (const [path, value] of entries) {
    if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) {
      throw new ProverError("lean-prover.project", `project path ${path} is not relative`);
    }
    files.set(path, typeof value === "string" ? enc.encode(value) : value instanceof Uint8Array ? value : null);
    if (!files.get(path)) throw new ProverError("lean-prover.project", `project file ${path} is not bytes or text`);
  }
  if (!files.has("lexlean.toml")) throw new ProverError("lean-prover.project", "the project has no lexlean.toml");
  return files;
}

/** Runs LexLean's print-only render on the WASI host: the project's checked, rendered Lean modules. */
export function render(lexlean, files) {
  const { exit, stdout, stderr } = runWasi(lexlean, { args: ["lexlean", "lean-modules", "--all"], files });
  if (exit !== 0) return { ok: false, exit, diagnostics: stderr || stdout };
  let rendered;
  try { rendered = JSON.parse(stdout); } catch { return { ok: false, exit, diagnostics: "lexlean lean-modules printed no JSON" }; }
  if (rendered?.spec !== RENDER_SCHEMA || !Array.isArray(rendered.modules)) {
    return { ok: false, exit, diagnostics: `lexlean lean-modules printed ${rendered?.spec}, not ${RENDER_SCHEMA}` };
  }
  return { ok: true, rendered };
}

const sourcePath = (leanModule) => `/src/${leanModule.replaceAll(".", "/")}.lean`;

async function prove({ engine, lexlean, manifest, evidence, project, store = null }) {
  const files = projectFiles(project);
  const r = render(lexlean, files);
  if (!r.ok) {
    return { accepted: false, refusal: { code: "lean-prover.render", diagnostics: r.diagnostics }, modules: [], evidence: { ...evidence, project: null } };
  }
  const rendered = r.rendered;
  const projectEvidence = { source_id: rendered.source_id, semantic_id: rendered.semantic_id, build_id: rendered.build_id };
  // The runtime and text laws are the library's, compiled for this compiler's semantics; they are not elaborated
  // here. A project rendered by another compiler is refused, never checked against the wrong runtime.
  if (manifest.lexlean.semantics_id !== rendered.compiler?.semantics_id) {
    return {
      accepted: false,
      refusal: { code: "lean-prover.runtime", diagnostics: `the project was rendered for compiler semantics ${rendered.compiler?.semantics_id}; the library's runtime is ${manifest.lexlean.semantics_id}` },
      modules: [],
      evidence: { ...evidence, project: projectEvidence },
    };
  }
  const modules = [];
  const observed = new Map();
  for (const row of rendered.modules.filter((m) => m.kind === "project")) {
    const text = enc.encode(row.text);
    const path = sourcePath(row.lean_module);
    await engine.call({ op: "write", path, bytes: text });
    let answer = store ? await cachedCheck({ engine, store, evidence, module: row.lean_module, text }) : null;
    const reused = answer !== null;
    if (!answer) {
      ({ answer } = await engine.call({ op: "request", request: { op: "elaborate", outDir: "/out", module: row.lean_module, path } }));
      if (store && answer.elaborated && answer.replayRefused === null) await storeResult({ engine, store, evidence, module: row.lean_module, text, answer });
    }
    const kernelAccepted = answer.elaborated === true && answer.replayRefused === null;
    const declarations = (answer.decls ?? []).map((d) => {
      observed.set(d.name, d.axioms);
      const outside = nonstandard(d.axioms);
      return { name: d.name, kind: d.kind, accepted: kernelAccepted && outside.length === 0, axioms: d.axioms, nonstandard: outside };
    });
    modules.push({
      module: row.lean_module,
      source: row.module ?? null,
      accepted: kernelAccepted && declarations.every((d) => d.accepted),
      elaborated: answer.elaborated === true,
      replayRefused: answer.replayRefused ?? null,
      reused,
      declarations,
    });
  }
  const policies = auditPolicies(rendered.axiom_policies ?? [], observed);
  for (const p of policies.filter((p) => !p.holds)) {
    for (const m of modules) for (const d of m.declarations) if (d.name === p.declaration) d.accepted = false;
  }
  for (const m of modules) m.accepted = m.accepted && m.declarations.every((d) => d.accepted);
  const violations = policies.filter((p) => !p.holds);
  const accepted = modules.length > 0 && modules.every((m) => m.accepted) && violations.length === 0;
  const result = { accepted, modules, policies, evidence: { ...evidence, project: projectEvidence } };
  if (!accepted) {
    result.refusal = violations.length
      ? { code: "lean-prover.axioms", diagnostics: violations.map((v) => `LLV7005: ${v.declaration}: ${v.why}`).join("\n") }
      : modules.length === 0
        ? { code: "lean-prover.render", diagnostics: "the project rendered no module" }
        : modules.some((m) => !m.elaborated)
          ? { code: "lean-prover.elaborate", diagnostics: modules.filter((m) => !m.elaborated).map((m) => `${m.module} did not elaborate`).join("\n") }
          : modules.some((m) => m.replayRefused)
            ? { code: "lean-prover.kernel", diagnostics: modules.filter((m) => m.replayRefused).map((m) => `${m.module}: ${m.replayRefused}`).join("\n") }
            : { code: "lean-prover.nonstandard-axiom", diagnostics: modules.flatMap((m) => m.declarations.filter((d) => d.nonstandard.length).map((d) => `${d.name} uses ${d.nonstandard.join(", ")}`)).join("\n") };
  }
  return result;
}
