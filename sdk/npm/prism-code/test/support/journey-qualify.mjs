#!/usr/bin/env node
// Qualify the journey on the corpus (test/fixtures/journey/corpus.json) with real proofs and real builds.
// It drives the real server over stdio and appends one JSON line per result. Nothing here is run by
// `npm test`: a proof takes minutes and a build tens of minutes.
//
//   node test/support/journey-qualify.mjs check                      every spec: checked, completed, and compared with an exhaustive search
//   node test/support/journey-qualify.mjs prove  [--hosted]          every spec proved by Lean, here or on the hosted verifier
//   node test/support/journey-qualify.mjs build                      the specs marked `build`: twice in two projects, once more in place
//   node test/support/journey-qualify.mjs seal                       built holos against every spec, tampered holos, and `run` against `prism_try`
//
//   --out <file>   results, JSON lines (default journey-qualify.jsonl)   --only a,b   these spec ids
//   --bin <file>   the prism-code to qualify (default this checkout's)     --work <dir> where projects are made
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = fileURLToPath(new URL('.', import.meta.url));
const { values: options, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'journey-qualify.jsonl' }, only: { type: 'string' }, bin: { type: 'string', default: join(here, '..', '..', 'bin', 'prism-code.mjs') }, work: { type: 'string' }, hosted: { type: 'boolean', default: false } } });
const phase = positionals[0];
const BIN = resolve(options.bin);
const work = resolve(options.work ?? mkdtempSync(join(tmpdir(), 'prism-qualify-')));
mkdirSync(work, { recursive: true });
const record = (row) => {
  appendFileSync(options.out, `${JSON.stringify({ phase, at: new Date().toISOString(), ...row })}\n`);
  console.log(JSON.stringify(row).slice(0, 400));
};
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** The corpus, with its two generated drafts written out. */
export function corpus() {
  const { specs } = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'journey', 'corpus.json'), 'utf8'));
  const generated = {
    bands: () => ({ title: 'Score Bands', fields: [{ name: 'score', kind: 'number', min: 0, max: 100 }], rules: Array.from({ length: 24 }, (_, k) => ({ when: [{ field: 'score', op: '>=', value: 96 - 4 * k }], then: `band-${String.fromCharCode(97 + k)}` })), otherwise: 'band-y' }),
    eight: () => {
      const numbers = ['weight', 'volume', 'value', 'risk'].map((name) => ({ name, kind: 'number', min: 0, max: 9 }));
      const choices = [['origin', ['known', 'unknown']], ['carrier', ['approved', 'other']], ['seal', ['intact', 'broken']], ['paperwork', ['complete', 'missing']]].map(([name, values]) => ({ name, kind: 'choice', values }));
      return { title: 'Shipment Clearance', fields: [...numbers, ...choices], rules: [{ when: [...numbers.map((f) => ({ field: f.name, op: '>=', value: 5 })), ...choices.map((f) => ({ field: f.name, op: 'is', value: f.values[0] }))], then: 'cleared' }], otherwise: 'held' };
    },
  };
  const only = options.only?.split(',');
  return specs.map((s) => (typeof s.draft === 'string' ? { ...s, draft: generated[s.id]() } : s)).filter((s) => !only || only.includes(s.id));
}

/** The real server in `cwd`. */
function server(cwd, env = {}) {
  const child = spawn(process.execPath, [BIN, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PRISM_HOME: join(work, '.prism-home'), PRISM_TELEMETRY: '0', PRISM_CODE_TIER: '', ...env } });
  let buffer = '';
  let next = 1;
  const waiting = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) waiting.get(JSON.parse(line).id)?.(JSON.parse(line));
    }
  });
  const exited = new Promise((done) => child.on('exit', done));
  const call = (name, args = {}) =>
    new Promise((done) => {
      const id = next++;
      const started = performance.now();
      waiting.set(id, (m) => done({ data: m.result?.structuredContent ?? null, text: m.result?.content?.map((c) => c.text).join('\n') ?? m.error?.message, isError: m.result?.isError === true || Boolean(m.error), ms: Math.round(performance.now() - started) }));
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`);
    });
  return { call, pid: child.pid, kill: async () => (child.kill('SIGKILL'), exited), close: async () => (child.stdin.end(), exited) };
}

/** Call a long tool until it stops saying it is running; the answer, every progress line seen, and the seconds it took. */
async function finish(s, name, args = {}) {
  const lines = new Set();
  const started = Date.now();
  for (;;) {
    const answer = await s.call(name, { wait: 30, ...args });
    for (const line of answer.data?.latest ?? []) lines.add(line);
    if (answer.data?.state !== 'running' && answer.data?.state !== 'busy') return { answer, lines: [...lines], seconds: Math.round((Date.now() - started) / 1000) };
    if (Date.now() - started > 3 * 60 * 60 * 1000) return { answer, lines: [...lines], seconds: Math.round((Date.now() - started) / 1000), timedOut: true };
  }
}

/** A project with the spec checked and approved. Resolves the server and the review. */
async function approved(cwd, draft, env) {
  mkdirSync(cwd, { recursive: true });
  const s = server(cwd, env);
  await s.call('prism_start', { restart: true });
  const review = await s.call('prism_spec', { spec: draft });
  if (review.data?.step === 'review' && !review.data.issue) await s.call('prism_answer', { answer: 'yes' });
  return { s, review };
}

// An evaluator of its own, sharing no code with Prism's: every request in the fields' whole ranges,
// not only the values on the edge of a comparison. It can say a guarantee is false where Prism says it holds.
function exhaustive(spec) {
  const sizes = spec.fields.map((f) => (f.kind === 'choice' ? f.values.length : f.max === undefined ? Infinity : f.max - (f.min ?? 0) + 1));
  const total = sizes.reduce((a, b) => a * b, 1);
  if (!(total <= 4_000_000)) return { searched: false, total: Number.isFinite(total) ? total : null };
  const value = (c, request) => (typeof c.value === 'object' ? request[c.value.field] : c.value);
  const holds = (c, request) => {
    const [l, r] = [request[c.field], value(c, request)];
    return { is: l === r, 'is not': l !== r, '=': l === r, '!=': l !== r, '<': l < r, '<=': l <= r, '>': l > r, '>=': l >= r }[c.op];
  };
  const decide = (request) => spec.rules.find((rule) => rule.when.every((c) => holds(c, request)))?.then ?? spec.otherwise;
  const broken = spec.properties.map(() => null);
  const request = {};
  const walk = (i) => {
    if (i === spec.fields.length) {
      const answer = decide(request);
      spec.properties.forEach((p, k) => {
        if (broken[k] === null && p.when.every((c) => holds(c, request)) && (p.kind === 'never' ? answer === p.then : answer !== p.then)) broken[k] = spec.fields.map((f) => request[f.name]).join(' ');
      });
      return;
    }
    const f = spec.fields[i];
    if (f.kind === 'choice') for (const v of f.values) (request[f.name] = v), walk(i + 1);
    else for (let v = f.min ?? 0; v <= f.max; v++) (request[f.name] = v), walk(i + 1);
  };
  walk(0);
  return { searched: true, total, broken: spec.properties.map((p, k) => ({ id: p.id, counterexample: broken[k] })).filter((b) => b.counterexample !== null) };
}

const phases = {
  async check() {
    for (const spec of corpus()) {
      const cwd = join(work, `check-${spec.id}`);
      const { s, review } = await approved(cwd, spec.draft);
      const stored = existsSync(join(cwd, 'prism', 'spec.json')) ? JSON.parse(readFileSync(join(cwd, 'prism', 'spec.json'), 'utf8')) : null;
      const search = stored && review.data?.step === 'review' ? exhaustive(stored) : null;
      record({ id: spec.id, ms: review.ms, step: review.data?.step ?? null, issue: review.data?.issue ?? (review.isError ? review.text : null), expectRefused: spec.refused ?? null, proposed: review.data?.proposed?.length ?? 0, guarantees: stored?.properties.length ?? 0, examples: stored?.examples.length ?? 0, notes: (review.data?.notes ?? []).filter((n) => !/^INV-/.test(n)), search });
      await s.close();
    }
  },
  async prove() {
    const env = options.hosted ? { PRISM_CODE_TIER: 'hosted' } : {};
    for (const spec of corpus().filter((x) => !x.refused)) {
      const cwd = join(work, `prove-${options.hosted ? 'hosted' : 'local'}-${spec.id}`);
      const { s } = await approved(cwd, spec.draft, env);
      const { answer, lines, seconds } = await finish(s, 'prism_prove');
      const rounds = 1 + lines.filter((l) => /^Correcting an axiom set and proving again/.test(l)).length;
      const session = JSON.parse(readFileSync(join(cwd, 'prism', 'session.json'), 'utf8'));
      record({ id: spec.id, where: options.hosted ? 'hosted' : 'local', ok: answer.data?.ok === true, seconds: answer.data?.seconds ?? seconds, wall: seconds, rounds, interrupted: answer.data?.interrupted === true, properties: answer.data?.properties?.map((p) => `${p.id}:${p.status}`) ?? [], axioms: Object.keys(session.axioms ?? {}).length, message: answer.data?.ok ? undefined : String(answer.data?.message ?? answer.text).slice(0, 400) });
      await s.close();
      if (!options.hosted) rmSync(join(cwd, 'prism', '.lexlean'), { recursive: true, force: true });
    }
  },
  async build() {
    for (const spec of corpus().filter((x) => x.build)) {
      const built = [];
      for (const [label, cwd, fresh] of [['one', join(work, `build-${spec.id}-one`), true], ['two', join(work, `build-${spec.id}-two`), true], ['one, in place', join(work, `build-${spec.id}-one`), false]]) {
        let s;
        if (fresh) ({ s } = await approved(cwd, spec.draft));
        else {
          // Forget the build, keep the project: the next build starts from the model again.
          const file = join(cwd, 'prism', 'session.json');
          const session = JSON.parse(readFileSync(file, 'utf8'));
          delete session.status.lastBuild;
          writeFileSync(file, JSON.stringify(session, null, 2));
          rmSync(join(cwd, 'prism', '.prism'), { recursive: true, force: true });
          s = server(cwd);
        }
        let result;
        for (let attempt = 1; attempt <= 3; attempt++) {
          result = await finish(s, 'prism_build', { overwrite: !fresh });
          if (!result.answer.data?.interrupted) break;
          record({ id: spec.id, project: label, attempt, interrupted: true, step: result.answer.data.step, seconds: result.seconds });
        }
        const d = result.answer.data ?? {};
        const row = { id: spec.id, project: label, ok: d.ok === true, seconds: d.seconds ?? null, wall: result.seconds, holo: d.holo ?? null, sha256: d.holo && existsSync(d.holo) ? sha(d.holo) : null, seal: d.spec?.specAddress ?? null, sealed: d.spec?.sealed ?? null, vectors: d.vectors ?? null, message: d.ok ? undefined : String(d.message ?? result.answer.text).slice(0, 400) };
        record(row);
        built.push(row);
        await s.close();
        // The verify stage compiles a test harness of about 1.4 GB into each project; keep the disk for the next build.
        rmSync(join(cwd, 'prism', 'target'), { recursive: true, force: true });
        rmSync(join(cwd, 'prism', '.lexlean'), { recursive: true, force: true });
      }
      record({ id: spec.id, summary: true, identical: built.every((b) => b.ok && b.sha256 === built[0].sha256), shas: built.map((b) => b.sha256?.slice(0, 16) ?? null), seals: [...new Set(built.map((b) => b.seal))] });
    }
  },
  async seal() {
    const specs = corpus().filter((x) => x.build);
    const at = (spec) => join(work, `build-${spec.id}-one`, 'prism');
    const holoOf = (spec) => JSON.parse(readFileSync(join(at(spec), 'session.json'), 'utf8')).status.holo;
    const check = (holo, specFile) => {
      const r = spawnSync(process.execPath, [BIN, 'check', holo, '--spec', specFile, '--policy', join(at(specs[0]), 'run-policy.json')], { encoding: 'utf8' });
      return { code: r.status, line: (r.stdout + r.stderr).split('\n').find((l) => /^spec\s/.test(l)) ?? (r.stdout + r.stderr).trim().split('\n').slice(0, 2).join(' | ') };
    };
    const ready = specs.filter((spec) => existsSync(join(at(spec), 'session.json')) && holoOf(spec) && existsSync(holoOf(spec)));
    for (const spec of ready) {
      const holo = holoOf(spec);
      const stored = join(at(spec), 'spec.json');
      // Its own spec, as stored and with every object's keys reversed and the text reformatted.
      const reversed = (v) => (Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reversed(v[k])])) : v);
      const other = join(work, `reordered-${spec.id}.json`);
      writeFileSync(other, JSON.stringify(reversed(JSON.parse(readFileSync(stored, 'utf8'))), null, 6));
      const own = check(holo, stored);
      const reordered = check(holo, other);
      const others = ready.filter((x) => x.id !== spec.id).map((x) => ({ against: x.id, ...check(holo, join(at(x), 'spec.json')) }));
      record({ id: spec.id, check: 'spec', own: /^spec\s+ok/.test(own.line), reordered: /^spec\s+ok/.test(reordered.line), refusedOthers: others.filter((o) => /^spec\s+failed\s+The holo was built from another spec: its seal is blake3:[0-9a-f]{64}, and this spec\.json is blake3:[0-9a-f]{64}/.test(o.line)).length, others: others.length, ownLine: own.line.slice(0, 160) });
      // One bit flipped, at positions spread over the file: refused, never run.
      const bytes = readFileSync(holo);
      const flips = 240;
      let refused = 0;
      const accepted = [];
      for (let i = 0; i < flips; i++) {
        const position = Math.floor((i + 0.5) * (bytes.length / flips));
        const copy = Buffer.from(bytes);
        copy[position] ^= 1 << (i % 8);
        const file = join(work, `flipped-${spec.id}.holo`);
        writeFileSync(file, copy);
        const example = JSON.parse(readFileSync(stored, 'utf8')).examples[0].request;
        const ran = spawnSync(process.execPath, [BIN, 'run', file, example, '--policy', join(at(spec), 'run-policy.json')], { encoding: 'utf8', timeout: 60000 });
        if (ran.status !== 0 && /integrity|altered|digest|not a holo|refus/i.test(ran.stdout + ran.stderr)) refused++;
        else accepted.push({ position, code: ran.status, said: (ran.stdout + ran.stderr).trim().slice(0, 120) });
      }
      record({ id: spec.id, check: 'tamper', bytes: bytes.length, flips, refused, notRefused: accepted.slice(0, 5) });
      // The built app answers each example, and requests the spec was tried with, as the spec did before it was built.
      const s = server(join(work, `build-${spec.id}-one`));
      const requests = [...new Set([...JSON.parse(readFileSync(stored, 'utf8')).examples.map((e) => e.request), 'nonsense', ''])];
      let same = 0;
      const different = [];
      for (const request of requests) {
        const tried = await s.call('prism_try', { request });
        const ran = spawnSync(process.execPath, [BIN, 'run', holo, request, '--policy', join(at(spec), 'run-policy.json')], { encoding: 'utf8', timeout: 60000 });
        const answered = ran.stdout.trim().split('\n').at(-1);
        if (tried.data?.answer === answered) same++;
        else different.push({ request, tried: tried.data?.answer, ran: answered, code: ran.status });
      }
      record({ id: spec.id, check: 'run', requests: requests.length, same, different: different.slice(0, 4), from: (await s.call('prism_try', { request: requests[0] })).data?.from });
      await s.close();
    }
  },
};

if (!phases[phase]) {
  console.error(`usage: journey-qualify.mjs ${Object.keys(phases).join('|')} [--out file] [--only ids] [--bin file] [--work dir] [--hosted]`);
  process.exit(2);
}
console.log(`# ${phase}: prism-code ${JSON.parse(readFileSync(join(BIN, '..', '..', 'package.json'), 'utf8')).version} at ${BIN}; work ${work}`);
await phases[phase]();
