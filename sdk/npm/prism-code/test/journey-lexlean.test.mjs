// The journey with one source of truth: an app's LexLean model, started from a content-addressed starter and
// written by the agent. There is no spec file. With no LexLean as WebAssembly, no SDK image and no hosted opt-in
// (docs/proposals/canonical-serverless-build.md, Phase 3), every step names what is missing, and Prism never
// picks the hosted verifier for the user. The hosted verifier here is a stand-in: nothing leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appDir, sourceFiles, startApp, starters } from '../src/journey/project.mjs';
import { build, check, prove, tryRequest } from '../src/journey/engine.mjs';
import { INSTRUCTIONS, TOOLS, createServer } from '../src/journey/mcp.mjs';
import { ruleTable } from '../src/journey/rule-table.mjs';
import { PARKING, ruleAppSnapshot } from './support/snapshot.mjs';
import { standIn, startedApp } from './support/hosted-stand-in.mjs';

process.env.PRISM_HOME = mkdtempSync(join(tmpdir(), 'prism-home-'));
process.env.PRISM_KERNEL_DIR = fileURLToPath(new URL('./fixtures/kernel/', import.meta.url));

const STARTERS = fileURLToPath(new URL('../templates/starters/', import.meta.url));
const HOSTED = { PRISM_CODE_TIER: 'hosted' };
const NO_IMAGE = () => false;
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('every starter file is the bytes its index names, and no starter names a spec', () => {
  const all = starters();
  assert.deepEqual(Object.keys(all).sort(), ['decision-app', 'rule-app', 'stateful-app']);
  for (const [name, s] of Object.entries(all)) {
    assert.ok(s.files[`src/${s.module}.lex.tex`], `${name} carries its module`);
    for (const [path, want] of Object.entries(s.files)) {
      const bytes = readFileSync(join(STARTERS, name, path));
      assert.equal(sha(bytes), want, `${name}/${path}`);
      assert.ok(!/prism\/spec|spec\.json/.test(bytes.toString('utf8')), `${name}/${path} names a spec`);
    }
    const onDisk = readdirSync(join(STARTERS, name), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
    assert.equal(onDisk, Object.keys(s.files).length, `${name} holds only what its index names`);
  }
});

test('an app starts from a starter, and Prism never writes over the model after that', () => {
  const dir = appDir(mkdtempSync(join(tmpdir(), 'prism-start-')));
  const made = startApp(dir, 'rule-app');
  assert.equal(made.module, 'App');
  // The model, and the template's foundation modules every app shares.
  assert.deepEqual(sourceFiles(dir), ['src/App.lex.tex', 'src/Foundation/Bytes.lex.tex', 'src/Foundation/View/Text/V1/Model.lex.tex']);
  assert.match(readFileSync(join(dir, 'lexlean.toml'), 'utf8'), /entrypoints = \["src\/App\.lex\.tex"\]/);
  writeFileSync(join(dir, 'src', 'App.lex.tex'), 'the author changed this');
  assert.throws(() => startApp(dir, 'decision-app'), { code: 'start.exists' });
  assert.equal(readFileSync(join(dir, 'src', 'App.lex.tex'), 'utf8'), 'the author changed this');
  assert.throws(() => startApp(appDir(mkdtempSync(join(tmpdir(), 'prism-start-'))), 'no-such'), { code: 'start.starter' });
});

test('planted defect: a starter whose bytes are not the ones its index names is refused, and nothing is written', () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-starters-'));
  cpSync(STARTERS, root, { recursive: true });
  const file = join(root, 'rule-app', 'src', 'App.lex.tex');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
  const dir = appDir(mkdtempSync(join(tmpdir(), 'prism-start-')));
  assert.throws(() => startApp(dir, 'rule-app', { root: pathToFileURL(`${root}/`) }), { code: 'start.starter' });
  assert.equal(existsSync(join(dir, 'src')), false);
});

test('with no SDK image and no opt-in, every step fails with build.frontend-unavailable naming Phase 3, and the hosted verifier is never asked', async () => {
  for (const starter of ['rule-app', 'decision-app']) {
    const { dir, session } = startedApp(starter);
    const hosted = standIn({ snapshot: ruleAppSnapshot() });
    for (const step of [check, prove, build]) {
      const r = await step(dir, session, { env: {}, client: hosted.client, local: NO_IMAGE });
      assert.equal(r.ok, false, `${starter} ${step.name}`);
      assert.equal(r.code, 'build.frontend-unavailable', `${starter} ${step.name}`);
      assert.match(r.message, /Phase 3/);
      assert.match(r.message, /does not choose the hosted verifier for you/);
    }
    assert.deepEqual(hosted.calls, [], 'nothing was sent');
  }
});

test('a rule app on the hosted opt-in: its table comes from the semantic snapshot, and Lean\'s kernel here checks every guarantee', { timeout: 120000 }, async () => {
  const { dir, session } = startedApp('rule-app');
  const hosted = standIn({ snapshot: ruleAppSnapshot() });
  const r = await prove(dir, session, { env: HOSTED, client: hosted.client, local: NO_IMAGE });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.where, 'kernel');
  assert.deepEqual(r.guarantees.map((g) => g.status), ['proved', 'proved', 'proved']);
  assert.equal(r.semanticId, ruleTable(ruleAppSnapshot()).semanticId);
  assert.deepEqual(hosted.calls.map((c) => c.tool), ['lexlean_profiles', 'lexlean_draft_write', 'lexlean_snapshot']);
  assert.ok(hosted.calls[1].arguments.files.some((f) => f.path === 'src/App.lex.tex'));
});

test('planted defect: a guarantee the rules break is refused with the request that breaks it, before the kernel is opened', async () => {
  const { dir, session } = startedApp('rule-app');
  const broken = ruleAppSnapshot({ ...PARKING, rules: PARKING.rules.map((r, i) => (i === 1 ? { ...r, answer: 2 } : r)) }, { id: 'broken' });
  const kernel = { judge: () => assert.fail('the kernel was opened'), check: () => assert.fail('the kernel was opened') };
  const r = await prove(dir, session, { env: HOSTED, client: standIn({ snapshot: broken }).client, kernel, local: NO_IMAGE });
  assert.equal(r.ok, false);
  assert.match(r.message, /guarantee 1 \(never premium\) is false: the request `\d+ motorcycle` meets its conditions and the rules answer premium \(rule 2\)/);
});

test('a rule app builds as the verified rule judge and the model\'s numbers, and answers only once built', { timeout: 120000 }, async () => {
  const { dir, session } = startedApp('rule-app');
  const before = await tryRequest(dir, session, '0 car');
  assert.deepEqual([before.ok, before.code], [false, 'try.unbuilt']);
  const r = await build(dir, session, { env: HOSTED, client: standIn({ snapshot: ruleAppSnapshot() }).client, local: NO_IMAGE });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.vectors, { passed: 2, total: 2 });
  assert.equal(r.semanticId, ruleTable(ruleAppSnapshot()).semanticId);
  for (const [request, answer] of [['0 car', 'free'], ['3 car', 'standard'], ['10 truck', 'premium'], ['3 motorcycle', 'free'], ['25 car', 'invalid']]) {
    assert.equal((await tryRequest(dir, session, request)).answer, answer, request);
  }
});

test('publishing to GitHub is refused as unavailable until the claims are written from the snapshot', async () => {
  const { dir, session } = startedApp('decision-app');
  const r = await build(dir, session, { remote: 'github', env: HOSTED, local: NO_IMAGE });
  assert.deepEqual([r.ok, r.code], [false, 'build.publish-unavailable']);
});

test('a snapshot that is not a rule app\'s is refused by name, never guessed at', () => {
  const good = ruleAppSnapshot();
  assert.throws(() => ruleTable('{'), { code: 'rule-table.snapshot' });
  assert.throws(() => ruleTable({ ...good, spec: 'lexlean/semantic-snapshot/1' }), { code: 'rule-table.snapshot' });
  assert.throws(() => ruleTable({ ...good, semantic_id: 'x' }), { code: 'rule-table.snapshot' });
  assert.throws(() => ruleTable({ ...good, modules: [] }), { code: 'rule-table.module' });
  const edit = (app) => ruleAppSnapshot({ ...PARKING, ...app });
  assert.throws(() => ruleTable(edit({ rules: [{ conditions: [{ field: 7, op: 4, value: 0 }], answer: 1 }] })), { code: 'rule-table.index' });
  assert.throws(() => ruleTable(edit({ rules: [{ conditions: [{ field: 0, op: 9, value: 0 }], answer: 1 }] })), { code: 'rule-table.index' });
  assert.throws(() => ruleTable(edit({ otherwise: 3 })), { code: 'rule-table.index' });
  assert.throws(() => ruleTable(edit({ fields: [{ name: 'vehicle', least: 0, greatest: 5, values: ['car'] }] })), { code: 'rule-table.range' });
  assert.throws(() => ruleTable(edit({ guarantees: [{ always: 2, conditions: [], answer: 0 }] })), { code: 'rule-table.shape' });
  const lambda = structuredClone(good);
  lambda.modules[0].semantic.declarations[3].body = { kind: 'add', left: { kind: 'nat', value: '0' }, right: { kind: 'nat', value: '0' } };
  assert.throws(() => ruleTable(lambda), { code: 'rule-table.term' });
});

test('the server offers the LexLean path and no other: six tools, no spec, and what runs without Docker said plainly', async () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ['prism_start', 'prism_check', 'prism_prove', 'prism_build', 'prism_try', 'prism_status']);
  assert.ok(!/spec\.json|prism\/spec|prism_spec|prism_answer/.test(JSON.stringify(TOOLS) + INSTRUCTIONS));
  assert.match(INSTRUCTIONS, /Without Docker, LexLean runs as WebAssembly/);
  assert.match(INSTRUCTIONS, /Never set PRISM_CODE_TIER=hosted yourself/);
  const sent = [];
  const server = createServer({ cwd: mkdtempSync(join(tmpdir(), 'prism-mcp-')), send: (m) => sent.push(m) });
  const call = async (name, args = {}) => {
    await server.handle({ jsonrpc: '2.0', id: sent.length + 1, method: 'tools/call', params: { name, arguments: args } });
    return sent.at(-1).result;
  };
  const list = (await call('prism_start')).structuredContent;
  assert.deepEqual(list.starters.map((s) => s.starter), ['rule-app', 'decision-app', 'stateful-app']);
  assert.match(list.nextSteps[0], /Phase 3/);
  assert.equal((await call('prism_prove')).structuredContent.state, 'blocked');
  assert.match((await call('prism_start', { spec: {} })).content[0].text, /does not take `spec`/);
  const started = (await call('prism_start', { starter: 'rule-app' })).structuredContent;
  assert.equal(started.model, 'src/App.lex.tex');
  const status = (await call('prism_status')).structuredContent;
  assert.deepEqual([status.starter, status.files], ['rule-app', ['src/App.lex.tex', 'src/Foundation/Bytes.lex.tex', 'src/Foundation/View/Text/V1/Model.lex.tex']]);
});
