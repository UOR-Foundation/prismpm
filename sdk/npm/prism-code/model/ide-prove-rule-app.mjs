// Prove one of the IDE's rule-table models with this checkout's prism-code and say what Lean's kernel accepted.
//
// A rule-table model states its guarantees as data, so `verify --lean` finds no theorem in it. The route that proves
// them is the rule-app build of prism-code's own tool server: the model's numbers go to the verified rule judge and
// Lean's kernel, in this process, checks every guarantee for every request. Nothing is sent anywhere.
//
// Usage: node ide-prove-rule-app.mjs <model dir> <guarantees expected> [<file to copy the built record to>]
// Exit 0 only when the kernel accepted exactly that many guarantees and every acceptance vector passed.
import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [modelDir, expected, keepRecord] = process.argv.slice(2);
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'prism-code.mjs');

// The tool server works on <cwd>/prism and writes its build beside the model, so it gets a copy.
const work = mkdtempSync(join(tmpdir(), 'ide-rule-app-'));
cpSync(resolve(modelDir), join(work, 'prism'), { recursive: true, filter: (p) => !/[\\/](tools|README\.md)$/.test(p) });
// The server builds a folder as a rule app only when its session says it was started from that starter.
writeFileSync(join(work, 'prism', 'session.json'), JSON.stringify({ schema: 'prism/session/2', starter: 'rule-app', status: {} }, null, 2) + '\n');

const child = spawn(process.execPath, [bin, 'mcp'], {
  cwd: work, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, PRISM_CODE_TIER: 'offline', PRISM_TELEMETRY: '0' },
});
let buffer = '';
let id = 0;
const waiting = new Map();
child.stdout.on('data', (data) => {
  buffer += data;
  for (let at; (at = buffer.indexOf('\n')) >= 0;) {
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  }
});
const rpc = (method, params) => new Promise((done) => {
  waiting.set(++id, done);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args = {}) => {
  const reply = await rpc('tools/call', { name, arguments: args });
  return JSON.parse((reply.result?.content ?? []).map((c) => c.text ?? '').join('') || '{}');
};
const finish = (code, message) => {
  console.log(message);
  // The server holds the copy as its working directory, so the copy goes only after the server has.
  child.once('exit', () => {
    try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left in the temp folder */ }
    process.exit(code);
  });
  child.kill();
};
setTimeout(() => finish(2, 'timed out after 5 minutes'), 300000).unref();

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ide-prove-rule-app', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const checked = await call('prism_check');
if (!checked.ok) finish(1, 'check refused: ' + JSON.stringify(checked.diagnostics ?? checked).slice(0, 800));
let built = await call('prism_build', { wait: 240 });
while (built.state === 'running') built = await call('prism_build', { wait: 60 });
const accepted = /accepted all (\d+) guarantees/.exec(built.message ?? '')?.[1];
const vectors = built.vectors ?? {};
const good = built.ok === true && accepted === String(expected) && vectors.total > 0 && vectors.passed === vectors.total;
if (good && keepRecord) copyFileSync(built.app, resolve(keepRecord));
finish(good ? 0 : 1, [
  `${good ? 'ok' : 'FAILED'}: ${modelDir}`,
  `model ${checked.semanticId}`,
  `guarantees accepted by Lean's kernel: ${accepted ?? 'none'} (expected ${expected})`,
  `acceptance vectors: ${vectors.passed ?? 0} of ${vectors.total ?? 0}`,
  good ? `app ${built.address}` : JSON.stringify(built).slice(0, 1200),
].join('\n'));
