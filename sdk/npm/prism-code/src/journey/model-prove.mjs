/**
 * Prove any app's theorems in this process, with no Lean toolchain, no
 * Docker and no server: the kernel path.
 *
 * LexLean (WebAssembly, lexlean-wasm.mjs) gives the model's semantic snapshot.
 * The snapshot is lowered to Lean kernel declarations (vendor/kernel-path/lower.mjs),
 * a proof of each theorem is found (vendor/kernel-path/emit.mjs), and Lean
 * 4.32.2's own kernel, as WebAssembly, judges every declaration and proof
 * over a small base library. The same code, kernel and library run in a
 * browser tab as PrismPM's sealed prover (sdk/npm/lean-prover/web/sealed.html).
 *
 * Nothing here is trusted to be right: the kernel refuses a wrong term. What
 * the lowering decides is what each statement means, and every declaration it
 * writes is the one LexLean's model names.
 *
 * The kernel, its loader and the base library are fetched once per machine
 * into the pinned store, each admitted only when it decodes to its BLAKE3
 * label, or read from `PRISM_MODEL_KERNEL_DIR` by name. The request names no
 * app and carries nothing of the user's.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildFetch } from './hosts.mjs';
import { admittedLabel, pinnedFile, writeAtomic } from './kappa-store.mjs';
import { emitter, loadLibrary } from '../vendor/kernel-path/emit.mjs';
import { lower } from '../vendor/kernel-path/lower.mjs';

export const MODEL_KERNEL_REPOSITORY = 'UOR-Foundation/PrismPM';
export const MODEL_KERNEL_COMMIT = '8e949491b3b1ddaf771179f534bce87a41f89c8a';
/** The files, by name: where each lives in the repository, and the BLAKE3 κ-label of its decoded bytes. */
export const MODEL_KERNEL_FILES = Object.freeze({
  'lean-kernel.mjs': { path: 'sdk/npm/lean-prover/kernel-path/kernel/lean-kernel.mjs', kappa: 'blake3:ec13d669b62c9a0223a937e04c3df18235fa67878ca53ba926f75904fe9c4610', encoding: 'identity', bytes: 62389 },
  'lean-kernel.wasm.gz': { path: 'sdk/npm/lean-prover/kernel-path/kernel/lean-kernel.wasm.gz', kappa: 'blake3:2f254140590074724ca1a8033080e0ae0834a018e06481ad7ccf7de9b80f175a', encoding: 'gzip', bytes: 2235146 },
  'base.ndjson.gz': { path: 'sdk/npm/lean-prover/kernel-path/library/base.ndjson.gz', kappa: 'blake3:058fcddc88e59a6d7604c759225008a2058d6b9203506eaf42d7ad8177238096', encoding: 'gzip', bytes: 7764697 },
});
/** Lean's three standard axioms: no theorem may rest on any other. */
export const STANDARD_AXIOMS = Object.freeze(['Classical.choice', 'Quot.sound', 'propext']);
/** LexLean's proof kinds the proof finder covers, by the name it knows them by. */
export const COVERED_PROOFS = Object.freeze({ linear_arithmetic: 'linear_arithmetic', decide: 'decide', reflexivity: 'rfl' });

const RAW_URL = 'https://raw.githubusercontent.com';

/** The kernel's files are not on this machine and could not be fetched. `code` is `kernel.unavailable`: it says nothing about an app. */
export class ModelKernelMissing extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelKernelMissing';
    this.code = 'kernel.unavailable';
  }
}

const fileOf = (name, env) => (env.PRISM_MODEL_KERNEL_DIR ? join(env.PRISM_MODEL_KERNEL_DIR, name) : pinnedFile(MODEL_KERNEL_FILES[name].kappa, env));

/** One kept file's decoded bytes, admitted when they have its κ-label. Throws `ModelKernelMissing` otherwise. */
function readFile(name, env) {
  const file = fileOf(name, env);
  if (!existsSync(file)) throw new ModelKernelMissing(`${name} is not on this machine yet`);
  const bytes = readFileSync(file);
  if (admittedLabel(bytes) !== MODEL_KERNEL_FILES[name].kappa) throw new ModelKernelMissing(`${file} is not the pinned ${name}`);
  return MODEL_KERNEL_FILES[name].encoding === 'gzip' ? gunzipSync(bytes) : bytes;
}

/** Make sure every file is on this machine, fetching what is missing; a file is written only when it has its pinned label. */
export async function ensureModelKernel({ env = process.env, fetch = globalThis.fetch, log = () => {} } = {}) {
  const get = buildFetch({ fetch });
  let said = false;
  for (const [name, want] of Object.entries(MODEL_KERNEL_FILES)) {
    try {
      readFile(name, env);
      continue;
    } catch (error) {
      if (!(error instanceof ModelKernelMissing)) throw error;
    }
    if (env.PRISM_MODEL_KERNEL_DIR) throw new ModelKernelMissing(`${name} is not in PRISM_MODEL_KERNEL_DIR with its pinned bytes`);
    if (!said) log(`Fetching Lean's kernel and its base library once (about 1.7 MB) from github.com/${MODEL_KERNEL_REPOSITORY}; each file is checked against its BLAKE3 label. Nothing about the app is sent.`);
    said = true;
    const url = `${RAW_URL}/${MODEL_KERNEL_REPOSITORY}/${MODEL_KERNEL_COMMIT}/${want.path}`;
    let response;
    try {
      response = await get(url);
    } catch (error) {
      if (error.code === 'build.host-not-allowed') throw error;
      throw new ModelKernelMissing(`${url} did not answer: ${error.cause?.code ?? error.message}`);
    }
    if (!response.ok) throw new ModelKernelMissing(`${url} answered HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const got = admittedLabel(bytes);
    if (got !== want.kappa) throw new ModelKernelMissing(`${url} decodes to ${got ?? 'nothing'}, not the pinned ${want.kappa}`);
    writeAtomic(fileOf(name, env), bytes);
  }
}

let opened = null;

/** Lean's kernel with the base library resident, opened once per process. Resolves `{ check, baseText }`. */
export function openModelKernel({ env = process.env } = {}) {
  opened ??= (async () => {
    const glue = readFile('lean-kernel.mjs', env), wasm = readFile('lean-kernel.wasm.gz', env), base = readFile('base.ndjson.gz', env);
    // Node imports a module from a file: the loader's checked bytes are written under their own label, then moved into place.
    const tag = MODEL_KERNEL_FILES['lean-kernel.mjs'].kappa.slice(7, 31);
    let loader = join(tmpdir(), `prism-model-kernel-${tag}.mjs`);
    const kept = () => existsSync(loader) && admittedLabel(readFileSync(loader)) === MODEL_KERNEL_FILES['lean-kernel.mjs'].kappa;
    if (!kept()) {
      const own = join(tmpdir(), `prism-model-kernel-${tag}-${process.pid}.mjs`);
      writeFileSync(own, glue);
      try { renameSync(own, loader); } catch { if (!kept()) loader = own; }
    }
    const said = [];
    const module = await (await import(pathToFileURL(loader).href)).default({
      instantiateWasm: (imports, done) => { WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance, r.module)); return {}; },
      print: (line) => said.push(line),
      printErr: (line) => said.push(line),
    });
    if (module.ccall('checker_ready', 'number', [], []) !== 0) throw new Error('the kernel did not start');
    const run = (entry, text) => {
      said.length = 0;
      module.FS.writeFile('/in.ndjson', text);
      let exit;
      try { exit = module.ccall(entry, 'number', ['string'], ['/in.ndjson']); } catch (error) { exit = 3; said.push(`trap: ${error?.message ?? error}`); }
      module.FS.unlink('/in.ndjson');
      const axioms = {}, rest = [];
      for (const line of said) {
        const a = /^axioms (\S+): ?(.*)$/.exec(line);
        if (a) axioms[a[1]] = a[2] ? a[2].split(', ').sort() : [];
        else rest.push(line);
      }
      return { exit, axioms: exit === 0 ? axioms : {}, output: rest.join('\n').slice(-600) };
    };
    const baseText = base.toString('utf8');
    const loaded = run('load_library', baseText);
    if (loaded.exit !== 0) throw new Error(`the kernel refused its base library: ${loaded.output}`);
    return { baseText, check: (text) => run('check_suffix', text) };
  })();
  opened.catch(() => { opened = null; });
  return opened;
}

/**
 * Prove every theorem of a model from its semantic snapshot. Resolves
 * `{ ok, theorems: [{ name, proof, declared, axioms, status }], declarations, ms, refusal? }`.
 *
 * A theorem is proved when the kernel accepts its proof and the axioms it rests on are among those it declared and
 * Lean's three standard ones. A proof found here may rest on fewer axioms than the Lean text LexLean writes (an
 * arithmetic proof without `Classical.choice`); that is proved, and said.
 */
export async function modelProve(snapshot, { env = process.env, fetch = globalThis.fetch, log = () => {}, kernel = null } = {}) {
  const started = performance.now();
  let k = kernel;
  if (!k) {
    await ensureModelKernel({ env, fetch, log });
    k = await openModelKernel({ env });
  }
  const library = loadLibrary(k.baseText);
  const elapsed = () => Math.round(performance.now() - started);
  // The kernel judges a file whole. When it refuses a theorem's proof, it names it: that theorem is set aside as not
  // proved and the rest are judged again, so one false theorem never hides the others. Any other refusal is the
  // lowering's, and nothing is proved.
  let theorems = null, lowered = null, judged = null;
  const aside = new Map();
  for (;;) {
    const em = emitter(library);
    try {
      lowered = lower(snapshot, em);
    } catch (error) {
      return { ok: false, theorems: [], declarations: 0, ms: elapsed(), refusal: error.message.replace(/^lower: /, '') };
    }
    theorems = lowered.theorems.map((th) => ({ name: th.name, proof: th.proof, declared: [...th.axioms].sort(), axioms: null, status: aside.get(th.name) ?? null }));
    lowered.theorems.forEach((th, i) => {
      if (theorems[i].status) return;
      const kind = COVERED_PROOFS[th.proof];
      if (!kind) { theorems[i].status = `not proved: the proof kind ${th.proof} is not covered here yet`; return; }
      try {
        em.write(em.theorem({ name: th.name, ns: th.name.slice(0, th.name.lastIndexOf('.')), script: [{ kind }], binders: [], raw: '', text: '' }));
      } catch (error) {
        theorems[i].status = `not proved: no proof found (${error.message})`;
      }
    });
    judged = k.check(em.lines());
    if (judged.exit === 0) break;
    const named = /declaration '([^']+)'/.exec(judged.output)?.[1];
    const culprit = theorems.find((t) => t.name === named && !t.status);
    if (!culprit) return { ok: false, theorems, declarations: lowered.declared.length, ms: elapsed(), refusal: `Lean's kernel refused the lowered model: ${judged.output}` };
    aside.set(culprit.name, `not proved: Lean's kernel refused the proof found (${judged.output.split('\n').slice(-1)[0].slice(0, 200)})`);
  }
  for (const th of theorems) {
    if (th.status) continue;
    const got = judged.axioms[th.name] ?? null;
    th.axioms = got;
    th.status = got === null ? 'not proved: the kernel reported nothing for it'
      : got.some((a) => !STANDARD_AXIOMS.includes(a)) ? `not proved: it rests on ${got.filter((a) => !STANDARD_AXIOMS.includes(a)).join(', ')}, outside Lean's standard axioms`
      : got.some((a) => !th.declared.includes(a)) ? `not proved: it rests on ${got.filter((a) => !th.declared.includes(a)).join(', ')}, which it does not declare`
      : got.length < th.declared.length ? 'proved, on fewer axioms than declared' : 'proved';
  }
  const ok = theorems.length > 0 && theorems.every((t) => t.status.startsWith('proved'));
  return { ok, theorems, declarations: lowered.declared.length, ms: Math.round(performance.now() - started) };
}
