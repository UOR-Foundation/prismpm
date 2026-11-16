/**
 * Check a spec's guarantees with Lean's own kernel, in this process: no
 * Docker, no Lean toolchain, no server.
 *
 * The kernel is Lean 4.32.1's C++ kernel compiled to WebAssembly, and the
 * library is the export of one lemma Lean proved once for every rule app
 * (`PrismLive.Kernel.ruleJudge_sound`). Both come from UOR-Foundation/foundry
 * (`studio/shell/kernel/lean`), which runs them in a browser tab. They are
 * fetched once and kept on this machine (kernel-store.mjs); `kernel/manifest.json`
 * names each by SHA-256 and records that this kernel judged this library whole.
 *
 * A guarantee's proof is that lemma applied to the spec written as numbers.
 * This module writes the proof as kernel terms and the kernel judges it, so
 * nothing here is trusted to be right: a wrong term is refused.
 *
 * What the verdict is about: the rule judge reading those numbers, which is
 * not the `judge` definition render.mjs writes for the SDK image. So this is
 * a check of the rules, and `lexlean verify` remains the proof of the model.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PROOF_SCHEMA, derivationKey, findProof, kappaStore, keepProof, reuseAdmits } from './kappa-store.mjs';
import { ensureKernel, hasKernel, readKernelFile } from './kernel-store.mjs';

const KERNEL = new URL('./kernel/', import.meta.url);
const NAMESPACE = 'PrismLive.Kernel.';
/** The largest number the rule judge reads: its words are 32 bits. */
export const WORD_MAX = 0xffffffff;
/** The axioms the lemma rests on. A proof that reports any other is not accepted. */
export const KERNEL_AXIOMS = Object.freeze(['Quot.sound', 'propext']);
const OPS = Object.freeze({ '<': 0, '<=': 1, '>': 2, '>=': 3, is: 4, '=': 4, 'is not': 5, '!=': 5 });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A spec this route cannot read. `code` names why, for a caller that explains it. */
export class KernelUnread extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KernelUnread';
    this.code = code;
  }
}

/** The number fields the spec gives no upper bound: the rule judge's words hold numbers up to `WORD_MAX`, so the app reads them up to there. */
export const unboundedFields = (spec) => (spec?.fields ?? []).filter((f) => f.kind === 'number' && f.max === undefined).map((f) => f.name);

/** The spec with every number field bounded as the rule judge reads it. A spec that states its bounds is returned as it is. */
export const boundedSpec = (spec) => (unboundedFields(spec).length === 0 ? spec : { ...spec, fields: spec.fields.map((f) => (f.kind === 'number' && f.max === undefined ? { ...f, max: WORD_MAX } : f)) });

/**
 * The spec as the numbers the rule judge decides with, and each guarantee as data.
 * A number field with no upper bound is read up to `WORD_MAX` (`boundedSpec`).
 * Throws `KernelUnread` for a spec the rule judge does not read.
 */
export function ruleWords(spec) {
  if (!Array.isArray(spec?.fields) || !Array.isArray(spec?.rules) || spec.actions !== undefined || spec.state !== undefined) {
    throw new KernelUnread('kernel.stateful', 'it keeps state between steps, and the rule judge reads one request');
  }
  const outcomes = [...new Set([spec.otherwise, ...spec.rules.map((r) => r.then)])];
  const at = (name) => spec.fields.findIndex((f) => f.name === name);
  const whole = (n, what) => {
    if (!Number.isInteger(n) || n < 0 || n > WORD_MAX) throw new KernelUnread('kernel.range', `${what} is outside 0..${WORD_MAX}, the numbers the rule judge reads`);
    return n;
  };
  const cond = (c) => {
    const field = spec.fields[at(c.field)];
    if (!field || !(c.op in OPS)) throw new KernelUnread('kernel.condition', `the condition on \`${c.field}\` is not one the rule judge reads`);
    if (c.value !== null && typeof c.value === 'object') throw new KernelUnread('kernel.two-fields', `it compares \`${c.field}\` with another field, and the rule judge compares a field with a value`);
    const value = field.kind === 'choice' ? field.values.indexOf(c.value) : Number(c.value);
    return [at(c.field), OPS[c.op], whole(value, `the value compared with \`${c.field}\``)];
  };
  const bounds = spec.fields.flatMap((f) => {
    if (f.kind === 'choice') return [0, f.values.length - 1];
    return [whole(f.min ?? 0, `the least \`${f.name}\``), whole(f.max ?? WORD_MAX, `the greatest \`${f.name}\``)];
  });
  const words = [1, spec.fields.length, ...bounds, outcomes.indexOf(spec.otherwise), spec.rules.length, ...spec.rules.flatMap((r) => [r.when.length, outcomes.indexOf(r.then), ...r.when.flatMap(cond)])];
  // A guarantee about an answer no rule gives names the next number: no rule answers it.
  const guarantees = (spec.properties ?? []).map((p) => ({ always: p.kind === 'always', when: p.when.map(cond), outcome: outcomes.includes(p.then) ? outcomes.indexOf(p.then) : outcomes.length }));
  return { words, guarantees };
}

/** The library's names, terms and levels by index (lean4export's format), so a proof names what it already holds. */
function readLibrary(text) {
  const lib = { names: [''], name: new Map([['', 0]]), expr: [], exprAt: new Map(), level: new Map(), types: new Map(), next: [1, 0, 1] };
  for (const line of text.split('\n')) {
    if (!line) continue;
    const o = JSON.parse(line);
    if ('in' in o) {
      const pre = lib.names[(o.str || o.num).pre];
      const full = (pre ? `${pre}.` : '') + (o.str ? o.str.str : o.num.i);
      lib.names[o.in] = full;
      lib.name.set(full, o.in);
      lib.next[0] = Math.max(lib.next[0], o.in + 1);
    } else if ('il' in o) {
      const { il, ...node } = o;
      lib.level.set(JSON.stringify(node), il);
      lib.next[2] = Math.max(lib.next[2], il + 1);
    } else if ('ie' in o) {
      const { ie, ...node } = o;
      lib.expr[ie] = node;
      lib.exprAt.set(JSON.stringify(node), ie);
      lib.next[1] = Math.max(lib.next[1], ie + 1);
    } else if (o.thm || o.def) {
      const d = o.thm || o.def;
      lib.types.set(d.name, d.type);
    }
  }
  return lib;
}

/**
 * One guarantee's proof, written after the library: the words and the
 * guarantee as data, `wordsCheck` on them stated true by evaluation, and
 * `ruleJudge_sound` applied to that. Returns the lines the kernel reads.
 */
export function proofLines(lib, words, guarantee) {
  const out = [];
  const own = new Map();
  const ownExpr = [];
  const ownAt = new Map();
  let [nextName, nextExpr, nextLevel] = lib.next;
  const term = (node) => {
    const key = JSON.stringify(node);
    const have = lib.exprAt.get(key) ?? ownAt.get(key);
    if (have !== undefined) return have;
    const e = nextExpr++;
    ownExpr[e] = node;
    ownAt.set(key, e);
    out.push(JSON.stringify({ ...node, ie: e }));
    return e;
  };
  const node = (e) => lib.expr[e] ?? ownExpr[e];
  const name = (full) => {
    let pre = 0;
    let path = '';
    for (const part of full.split('.')) {
      path = path ? `${path}.${part}` : part;
      const have = lib.name.get(path) ?? own.get(path);
      if (have !== undefined) {
        pre = have;
        continue;
      }
      const n = nextName++;
      own.set(path, n);
      out.push(JSON.stringify({ in: n, str: { pre, str: part } }));
      pre = n;
    }
    return pre;
  };
  const known = (full) => {
    const n = lib.name.get(full);
    if (n === undefined) throw new Error(`the library does not hold ${full}`);
    return n;
  };
  const C = (full, us = []) => term({ const: { name: known(full), us } });
  const app = (f, ...args) => args.reduce((fn, arg) => term({ app: { arg, fn } }), f);
  const nat = (n) => term({ natVal: String(n) });
  const one = lib.level.get(JSON.stringify({ succ: 0 })) ?? (() => {
    const l = nextLevel++;
    out.push(JSON.stringify({ il: l, succ: 0 }));
    return l;
  })();
  const list = (T, xs) => xs.reduceRight((tail, x) => app(C('List.cons', [0]), T, x, tail), app(C('List.nil', [0]), T));
  const declare = (kind, full, type, value) => {
    const n = name(full);
    out.push(JSON.stringify(kind === 'def' ? { def: { all: [n], hints: { regular: 1 }, levelParams: [], name: n, safety: 'safe', type, value } } : { thm: { all: [n], levelParams: [], name: n, type, value } }));
    return term({ const: { name: n, us: [] } });
  };
  // The lemma's statement with its first binders taken by closed terms.
  const instantiate = (type, args) => {
    let body = type;
    for (let k = 0; k < args.length; k++) body = node(body).forallE.body;
    const memo = new Map();
    const go = (e, depth) => {
      const key = `${e}:${depth}`;
      if (memo.has(key)) return memo.get(key);
      const x = node(e);
      let r = e;
      if ('bvar' in x) r = x.bvar < depth ? e : x.bvar - depth < args.length ? args[args.length - 1 - (x.bvar - depth)] : term({ bvar: x.bvar - args.length });
      else if (x.app) r = term({ app: { arg: go(x.app.arg, depth), fn: go(x.app.fn, depth) } });
      else if (x.forallE) r = term({ forallE: { ...x.forallE, type: go(x.forallE.type, depth), body: go(x.forallE.body, depth + 1) } });
      else if (x.lam) r = term({ lam: { ...x.lam, type: go(x.lam.type, depth), body: go(x.lam.body, depth + 1) } });
      else if (x.letE) r = term({ letE: { ...x.letE, type: go(x.letE.type, depth), value: go(x.letE.value, depth), body: go(x.letE.body, depth + 1) } });
      else if (x.proj) r = term({ proj: { ...x.proj, struct: go(x.proj.struct, depth) } });
      memo.set(key, r);
      return r;
    };
    return go(body, 0);
  };
  const Nat = C('Nat');
  const Bool = C('Bool');
  const True = C('Bool.true');
  // One name for every guarantee: each is judged on its own, so a proof's bytes do not depend on where it sits.
  const at = 'Prism.guarantee.';
  const cond = ([field, op, value]) => app(C(`${NAMESPACE}Cond.mk`), nat(field), nat(op), nat(value));
  const P = declare('def', `${at}words`, app(C('List', [0]), Nat), list(Nat, words.map(nat)));
  const p = declare('def', `${at}guarantee`, C(`${NAMESPACE}Property`), app(C(`${NAMESPACE}Property.mk`), C(guarantee.always ? 'Bool.true' : 'Bool.false'), list(C(`${NAMESPACE}Cond`), guarantee.when.map(cond)), nat(guarantee.outcome)));
  const checked = declare('thm', `${at}checked`, app(C('Eq', [one]), Bool, app(C(`${NAMESPACE}wordsCheck`), P, p), True), app(C('Eq.refl', [one]), Bool, True));
  declare('thm', `${at}holds`, instantiate(lib.types.get(known(`${NAMESPACE}ruleJudge_sound`)), [P, p, checked]), app(C(`${NAMESPACE}ruleJudge_sound`), P, p, checked));
  return `${out.join('\n')}\n`;
}

/** The pinned files, each checked against the address the manifest names. Throws when one is not the pinned one. */
export function readPinned({ read = (file) => (file === 'manifest.json' ? readFileSync(new URL(file, KERNEL)) : readKernelFile(file)) } = {}) {
  const manifest = JSON.parse(read('manifest.json').toString('utf8'));
  const glue = gunzipSync(read(manifest.glue.file));
  const wasm = gunzipSync(read(manifest.wasm.file));
  const library = gunzipSync(read(manifest.library.file));
  const got = { loader: sha256(glue), kernel: sha256(wasm), library: sha256(library) };
  if (got.loader !== manifest.glue.sha256 || got.kernel !== manifest.wasm.sha256 || got.library !== manifest.library.sha256) throw new Error('the kernel, its loader or its library is not the pinned one');
  // The library is entered without being judged again: sound only for one this same kernel judged whole.
  const b = manifest.binding;
  if (!b || b.kernel !== got.kernel || b.loader !== got.loader || b.library !== got.library) throw new Error('there is no record that this kernel judged this library whole');
  return { manifest, glue, wasm, library, addresses: got };
}

let opened = null;

/** The kernel with the library resident, opened once per process. Resolves `{ manifest, addresses, judge }`. */
export function openKernel() {
  opened ??= (async () => {
    const { manifest, glue, wasm, library, addresses } = readPinned();
    const said = [];
    // Node imports a module from a file, so the loader's checked bytes are written under their own address.
    let loader = join(tmpdir(), `prism-lean-kernel-${addresses.loader.slice(0, 24)}.mjs`);
    const kept = () => existsSync(loader) && sha256(readFileSync(loader)) === addresses.loader;
    if (!kept()) {
      // Written under this process's own name and moved into place: two processes starting at once must never
      // import half a file. Where the move is refused because another process holds the name, its file is used
      // when it is the checked bytes, and this process's own otherwise.
      const own = join(tmpdir(), `prism-lean-kernel-${addresses.loader.slice(0, 24)}-${process.pid}.mjs`);
      writeFileSync(own, glue);
      try {
        renameSync(own, loader);
      } catch {
        if (!kept()) loader = own;
      }
    }
    const factory = (await import(pathToFileURL(loader).href)).default;
    const module = await factory({
      instantiateWasm: (imports, done) => {
        WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance, r.module));
        return {};
      },
      print: (line) => said.push(line),
      printErr: (line) => said.push(line),
    });
    const run = (entry, bytes) => {
      said.length = 0;
      module.FS.writeFile('/in.ndjson', bytes);
      let exit;
      try {
        exit = module.ccall(entry, 'number', ['string'], ['/in.ndjson']);
      } catch (error) {
        // A trap is the kernel failing, never a verdict.
        exit = 3;
        said.push(`trap: ${error?.message ?? error}`);
      }
      module.FS.unlink('/in.ndjson');
      const axioms = {};
      const rest = [];
      for (const line of said) {
        const a = /^axioms ([^:]+): ?(.*)$/.exec(line);
        if (a) axioms[a[1]] = a[2] ? a[2].split(', ') : [];
        else rest.push(line);
      }
      return { exit, axioms: exit === 0 ? axioms : {}, output: rest.join('\n').slice(-400) };
    };
    if (module.ccall('checker_ready', 'number', [], []) !== 0) throw new Error('the kernel did not start');
    const loaded = run('load_library', library);
    if (loaded.exit !== 0) throw new Error(`the kernel refused its library: ${loaded.output}`);
    const lib = readLibrary(library.toString('utf8'));
    return { manifest, addresses, judge: (words, guarantee) => ({ text: proofLines(lib, words, guarantee), run }) };
  })();
  opened.catch(() => {
    opened = null;
  });
  return opened;
}

/**
 * Open the kernel ahead of the first proof, when its files are already on this
 * machine, so that proof does not wait for it. Fetches nothing and never throws:
 * a kernel that cannot be opened here is found out by the proof that needs it.
 */
export function warmKernel({ env = process.env } = {}) {
  if (hasKernel({ env })) openKernel().catch(() => {});
}

/** The manifest this package carries: what the kernel and its library must be, by address. Reading it needs no kernel file. */
export function pinnedAddresses() {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', KERNEL), 'utf8'));
  return { manifest, kernel: `sha256:${manifest.wasm.sha256}`, library: `sha256:${manifest.library.sha256}` };
}

/** The statement one guarantee's proof is about: the spec's numbers and that guarantee, and nothing of where it sits. */
export const guaranteeStatement = (words, guarantee) => `sha256:${sha256(JSON.stringify(['prism/kernel-guarantee/1', words, guarantee]))}`;

/**
 * Lean's kernel judges every guarantee of `spec`. Resolves
 * `{ judged: [{ accepted, axioms, output, reused }], evidence, pinned, ms, reused }`,
 * one entry per property in order. `accepted` is the kernel's own answer; the
 * verdict on the whole check is the verified guest's.
 *
 * A guarantee already proved under the same kernel, library and statement is
 * not proved again: its proof is found by its derivation key and reused when
 * `reuseAdmits` allows (kappa-store.mjs). When every guarantee is found, the
 * kernel is not opened at all. Throws `KernelUnread` for a spec this route
 * does not read.
 */
export async function kernelProve(spec, { kernel = null, log = () => {}, env = process.env, fetch = globalThis.fetch, store = kappaStore({ env }) } = {}) {
  const { words, guarantees } = ruleWords(spec);
  const started = performance.now();
  const pinned = pinnedAddresses();
  const keys = guarantees.map((guarantee) => {
    const statement = guaranteeStatement(words, guarantee);
    return { statement, key: derivationKey(PROOF_SCHEMA, [pinned.kernel, pinned.library, statement]) };
  });
  const found = keys.map(({ key }) => findProof(store, { key, kernel: pinned.kernel, library: pinned.library }));
  const reusable = found.map((f) => reuseAdmits(f.facts));
  // The spec is read and the store asked first, so nothing is fetched or opened for work already done.
  let k = kernel;
  if (!k && reusable.some((yes) => !yes)) {
    await ensureKernel({ env, fetch, log });
    k = await openKernel();
  }
  const texts = [];
  const judged = guarantees.map((guarantee, i) => {
    if (reusable[i]) {
      texts.push(found[i].text);
      return { accepted: true, axioms: found[i].proof.axioms, output: '', reused: true };
    }
    const { text, run } = k.judge(words, guarantee);
    texts.push(text);
    const r = run('check_suffix', Buffer.from(text, 'utf8'));
    const axioms = r.axioms['Prism.guarantee.holds'] ?? null;
    // Only an accepted proof is kept: a refusal carries no bytes that could be checked again.
    if (r.exit === 0 && axioms !== null) keepProof(store, { key: keys[i].key, kernel: `sha256:${k.addresses.kernel}`, library: `sha256:${k.addresses.library}`, statement: keys[i].statement, text, axioms });
    // Only what the kernel answered. Whether that is a verdict is the guest's to say (kernel-verdict.mjs).
    return { accepted: r.exit === 0, axioms, output: r.output, reused: false };
  });
  // What was derived: the files' own addresses when the kernel ran, and what the reused proofs name otherwise.
  const ran = reusable.some((yes) => !yes);
  const derived = ran ? { kernel: `sha256:${k.addresses.kernel}`, library: `sha256:${k.addresses.library}` } : { kernel: found[0]?.proof.kernel ?? pinned.kernel, library: found[0]?.proof.library ?? pinned.library };
  return {
    judged,
    reused: reusable.filter(Boolean).length,
    ms: Math.round(performance.now() - started),
    pinned: { kernel: pinned.kernel, library: pinned.library },
    evidence: {
      lean: pinned.manifest.lean,
      kernel: derived.kernel,
      library: derived.library,
      bundle: `sha256:${sha256(texts.join(''))}`,
      statement: `sha256:${sha256(JSON.stringify(['prism/kernel-statement/1', words, guarantees]))}`,
      axioms: [...new Set(judged.flatMap((j) => j.axioms ?? []))].sort(),
    },
  };
}
