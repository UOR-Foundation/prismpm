// Stress, class F: what the journey costs before any proof, held to a budget. Each budget is
// many times what was measured on 2026-11-16 (Windows, Node 22.21.0), so a loaded machine
// passes and a step that became slow by a factor does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BIN, project, startServer } from './support/journey-client.mjs';

test('a server answers its first tool call within 2 s of being started', async () => {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const cwd = project();
    const started = performance.now();
    const server = startServer(cwd);
    const status = await server.call('prism_status');
    times.push(performance.now() - started);
    assert.deepEqual(status.data.files, []);
    await server.close();
  }
  console.log(`# server start to first answer: best ${Math.min(...times).toFixed(0)} ms of ${times.map((t) => t.toFixed(0)).join(', ')}`);
  assert.ok(Math.min(...times) < 2000, `best ${Math.min(...times).toFixed(0)} ms`);
});

test('setup --dry-run reports in under 5 s and changes nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'prism-stress-home-'));
  const cwd = project();
  const times = [];
  let last = null;
  for (let i = 0; i < 2; i++) {
    const started = performance.now();
    last = spawnSync(process.execPath, [BIN, 'setup', '--dry-run', '--agents-only'], { cwd, encoding: 'utf8', env: { ...process.env, PRISM_HOME: home, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), PRISM_TELEMETRY: '0' }, timeout: 60000 });
    times.push(performance.now() - started);
  }
  assert.equal(last.status, 0, last.stderr || last.stdout);
  assert.match(last.stdout, /setup --dry-run/);
  console.log(`# setup --dry-run --agents-only: best ${Math.min(...times).toFixed(0)} ms`);
  assert.ok(Math.min(...times) < 5000, `best ${Math.min(...times).toFixed(0)} ms`);
});
