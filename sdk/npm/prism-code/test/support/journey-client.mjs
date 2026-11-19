// Drive the real Prism server (`prism-code mcp`) over stdio, as an agent does: one process, JSON-RPC lines.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../../bin/prism-code.mjs', import.meta.url));

/** A new, empty project folder. */
export const project = () => mkdtempSync(join(tmpdir(), 'prism-stress-'));

/** Lean's kernel as the pinned bytes kept beside the tests, so a server that takes the kernel route fetches nothing. */
const KERNEL_FIXTURES = fileURLToPath(new URL('../fixtures/kernel/', import.meta.url));

/**
 * Start a server in `cwd`. `call(name, args)` resolves `{ data, text, isError, error, ms }`:
 * `data` is the tool's structured result, `error` a JSON-RPC error. `kill()` ends it as a crash
 * does; `close()` ends it as an agent that shuts down does, and waits.
 */
export function startServer(cwd, { env = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'prism-stress-home-'));
  const child = spawn(process.execPath, [BIN, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PRISM_HOME: home, PRISM_TELEMETRY: '0', PRISM_LEXLEAN_FETCH: '0', PRISM_CODE_TIER: '', PRISM_KERNEL_DIR: KERNEL_FIXTURES, ...env } });
  let buffer = '';
  let stderr = '';
  let next = 1;
  const waiting = new Map();
  const stray = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const take = waiting.get(message.id);
      if (take) {
        waiting.delete(message.id);
        take(message);
      } else stray.push(message);
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((done) => child.on('exit', done));
  const rpc = (method, params, { timeoutMs = 60000 } = {}) =>
    new Promise((done, refuse) => {
      const id = next++;
      const timer = setTimeout(() => refuse(new Error(`${method} did not answer in ${timeoutMs} ms; stderr: ${stderr.slice(-400)}`)), timeoutMs);
      waiting.set(id, (message) => {
        clearTimeout(timer);
        done(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const call = async (name, args = {}, options) => {
    const started = performance.now();
    const reply = await rpc('tools/call', { name, arguments: args }, options);
    const ms = performance.now() - started;
    if (reply.error) return { error: reply.error, isError: true, text: reply.error.message, data: null, ms };
    const text = reply.result.content.map((c) => c.text).join('\n');
    return { data: reply.result.structuredContent ?? null, text, isError: reply.result.isError === true, error: null, ms };
  };
  return {
    pid: child.pid,
    rpc,
    call,
    raw: (line) => child.stdin.write(`${line}\n`),
    stray,
    stderr: () => stderr,
    kill: async () => {
      child.kill('SIGKILL');
      await exited;
    },
    close: async () => {
      child.stdin.end();
      await exited;
    },
  };
}

/** Call a long tool again while it says it is running; resolves the first answer that does not, and every answer before it. */
export async function until(server, name, args = {}, { tries = 200, pauseMs = 100 } = {}) {
  const seen = [];
  for (let i = 0; i < tries; i++) {
    const answer = await server.call(name, { wait: 0, ...args });
    seen.push(answer);
    if (answer.data?.state !== 'running' && answer.data?.state !== 'busy') return { answer, seen };
    await new Promise((done) => setTimeout(done, pauseMs));
  }
  throw new Error(`${name} was still running after ${tries} calls: ${JSON.stringify(seen.at(-1)?.data)}`);
}
