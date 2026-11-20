// The build tiers: where the LexLean project is found for `verify --lean` and `build --check`, and that both run the
// journey's own steps in this process: LexLean as WebAssembly checks, Lean's kernel proves, no image and no Docker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexleanProjectArgument, lexleanProjectDir } from '../src/tiers.mjs';

const bin = fileURLToPath(new URL('../bin/prism-code.mjs', import.meta.url));
const template = fileURLToPath(new URL('../templates/text-request', import.meta.url));
const IMAGE = 'ghcr.io/uor-foundation/prismpm-sdk@sha256:36da25ef924d84899453f24ec0c117a7a220e708037933eb8b499caa7723d99e';
const scratch = () => mkdtempSync(join(tmpdir(), 'prism-tiers-'));

test('the LexLean project is the root, or found between the model sources and the root', () => {
  assert.equal(lexleanProjectDir(template, 'src'), '.');
  const nested = scratch();
  mkdirSync(join(nested, 'app', 'src'), { recursive: true });
  writeFileSync(join(nested, 'app', 'lexlean.toml'), 'spec = "lexlean/project/1"\n');
  assert.equal(lexleanProjectDir(nested, 'app/src'), 'app');
  assert.equal(lexleanProjectDir(nested, 'app'), 'app');
  assert.equal(lexleanProjectDir(nested), 'app', 'with no [model] source, the one project directly under the root');
  assert.throws(() => lexleanProjectDir(scratch()), (e) => e.code === 'tier.project' && /no lexlean\.toml/.test(e.message));
  assert.throws(() => lexleanProjectDir(nested, 'elsewhere/src'), (e) => e.code === 'tier.project');
  assert.throws(() => lexleanProjectDir(nested, '../outside'), (e) => e.code === 'tier.project', 'a source outside the root is never searched');
});

test('a template instance: no prism.toml, the one LexLean project directly under the root; two need --project', () => {
  const instance = scratch();
  mkdirSync(join(instance, 'app'));
  writeFileSync(join(instance, 'app', 'lexlean.toml'), 'spec = "lexlean/project/1"\n');
  mkdirSync(join(instance, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(instance, 'node_modules', 'x', 'lexlean.toml'), '');
  assert.equal(lexleanProjectDir(instance), 'app', 'node_modules is never a project');
  mkdirSync(join(instance, 'gateway'));
  writeFileSync(join(instance, 'gateway', 'lexlean.toml'), 'spec = "lexlean/project/1"\n');
  assert.throws(() => lexleanProjectDir(instance), (e) => e.code === 'tier.project' && /2 LexLean projects here \(app, gateway\); name one with --project/.test(e.message));
  assert.equal(lexleanProjectDir(instance, null, 'gateway'), 'gateway');
  assert.throws(() => lexleanProjectDir(instance, null, 'missing'), (e) => e.code === 'tier.project');
  assert.throws(() => lexleanProjectDir(instance, null, '..'), (e) => e.code === 'tier.project' && /outside/.test(e.message));
});

test('the --project argument names the file inside the container', () => {
  assert.equal(lexleanProjectArgument('C:\\app', '.', 'win32'), '/work/lexlean.toml');
  assert.equal(lexleanProjectArgument('C:\\app', 'app', 'win32'), '/work/app/lexlean.toml');
  assert.equal(lexleanProjectArgument('/home/u/app', 'app', 'linux'), '/home/u/app/app/lexlean.toml');
});

/** A project with prism.toml at the root naming its LexLean project in app/, and a lockfile only a full verify reads. */
function tiersProject() {
  const dir = scratch();
  writeFileSync(join(dir, 'prismpm.lock'), JSON.stringify({ sdk_image: IMAGE }));
  mkdirSync(join(dir, 'app', 'src'), { recursive: true });
  writeFileSync(join(dir, 'app', 'lexlean.toml'), 'spec = "lexlean/project/1"\n');
  writeFileSync(join(dir, 'prism.toml'), '[application]\nname = "tiers"\nversion = "0.1.0"\n\n[model]\nsource = "app/src"\n\n[capabilities]\n');
  return dir;
}

test('verify --lean proves the LexLean project with Lean\'s kernel in this process, no image and no Docker (dry run)', () => {
  const dir = tiersProject();
  // A Docker that cannot run: reaching it would fail the command.
  const env = { ...process.env, PRISM_CODE_DRY_RUN: '1', PRISM_HOME: join(scratch(), '.prism'), PRISM_DOCKER: join(dir, 'no-such-docker') };
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, encoding: 'utf8' });
  const r = run('verify', '--lean', '--all');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'kernel prove app\n');
  assert.doesNotMatch(r.stdout + r.stderr, /docker|lexlean verify|prismpm/);
  assert.equal(run('verify', '--lean', '--project', 'app').stdout, 'kernel prove app\n');
  const hosted = run('verify', '--lean', '--hosted');
  assert.equal(hosted.status, 64, 'there is no hosted verifier to opt in to');
  assert.match(hosted.stderr, /^verify --lean no longer takes --hosted/);
  assert.equal(run('verify', '--lean', '--trace').status, 64, 'lexlean\'s own flags are usage');
  assert.ok(run('verify').stdout.includes(`${IMAGE} prismpm verify`), 'a full verify still runs in the image');
  const bare = spawnSync(process.execPath, [bin, 'verify', '--lean'], { cwd: scratch(), env, encoding: 'utf8' });
  assert.equal(bare.status, 2, 'no LexLean project here');
  assert.match(bare.stderr, /^tier\.project: no lexlean\.toml/);
});

test('--local is gone from verify --lean and build --check, and --hosted from setup: each is usage, exit 64', () => {
  const dir = tiersProject();
  const env = { ...process.env, PRISM_CODE_DRY_RUN: '1', PRISM_HOME: join(scratch(), '.prism') };
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, encoding: 'utf8' });
  for (const verb of [['verify', '--lean'], ['build', '--check']]) {
    const r = run(...verb, '--local');
    assert.equal(r.status, 64, verb.join(' '));
    assert.match(r.stderr, new RegExp(`^${verb.join(' ')} no longer takes --local`), verb.join(' '));
    assert.equal(r.stdout, '');
  }
  const setup = run('setup', '--dry-run', '--hosted');
  assert.equal(setup.status, 64);
  assert.match(setup.stderr, /^setup no longer takes --hosted/);
});

test('verify --lean and build --check without a dry run go through the journey\'s own steps, and run no Docker', () => {
  // No LexLean as WebAssembly here, nothing fetched, and PRISM_CODE_TIER=offline: the journey refuses with its own
  // code before anything runs, which only the journey (engine.mjs) says. A Docker that cannot run would fail it.
  const dir = tiersProject();
  const env = { ...process.env, PRISM_HOME: join(scratch(), '.prism'), PRISM_LEXLEAN_FETCH: '0', PRISM_CODE_TIER: 'offline', PRISM_DOCKER: join(dir, 'no-such-docker') };
  delete env.PRISM_CODE_DRY_RUN;
  delete env.PRISM_LEXLEAN_WASM;
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 120000 });
  const lean = run('verify', '--lean');
  assert.equal(lean.status, 1, lean.stderr);
  assert.match(lean.stdout, /^failed {3}verify --lean: build\.frontend-unavailable: LexLean as WebAssembly is not on this machine, and PRISM_CODE_TIER=offline fetches nothing/);
  const check = run('build', '--check');
  assert.equal(check.status, 1, check.stderr);
  assert.match(check.stdout, /^ok {7}prism\.toml: tiers 0\.1\.0\nfailed {3}lexlean check: build\.frontend-unavailable: /);
  assert.doesNotMatch(lean.stdout + lean.stderr + check.stdout + check.stderr, /docker run|prismpm\.lock not found|on the hosted verifier/);
});

test('verify --lean and build --check send nothing, even with no LexLean as WebAssembly here', async () => {
  // The help says "no server, nothing sent". A stand-in server records every request; with no LexLean as WebAssembly
  // and no PRISM_CODE_TIER, none may reach it.
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(503).end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  // A copy of the init template, whose layout the hosted verifier takes, so a project sent is seen sent.
  const dir = scratch();
  cpSync(template, join(dir, 'app'), { recursive: true });
  const env = { ...process.env, PRISM_HOME: join(scratch(), '.prism'), PRISM_LEXLEAN_FETCH: '0', PRISM_LEXLEAN_URL: url, PRISM_TELEMETRY: '0', PRISM_DOCKER: join(dir, 'no-such-docker') };
  for (const name of ['PRISM_CODE_DRY_RUN', 'PRISM_LEXLEAN_WASM', 'PRISM_CODE_TIER']) delete env[name];
  const run = (...args) => new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: dir, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => done({ code, out }));
  });
  try {
    for (const verb of [['verify', '--lean'], ['build', '--check']]) {
      const r = await run(...verb);
      assert.deepEqual(seen, [], `${verb.join(' ')} sent the project to a server:\n${r.out}`);
      assert.doesNotMatch(r.out, /on the hosted verifier/, verb.join(' '));
    }
  } finally {
    server.close();
  }
});
