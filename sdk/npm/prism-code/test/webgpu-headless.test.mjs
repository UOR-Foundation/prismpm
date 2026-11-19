// The WebGPU bridge in a real browser: headless Chrome runs src/webgpu.mjs on its WebGPU adapter, dispatches a 4-bit
// group-sum kernel and reads back its u32 words, which must equal the CPU's bit for bit. The browser is the one
// PRISM_CHROME names, else Chrome or Chromium where it usually lives; a host with no GPU runs Chrome's SwiftShader
// adapter. With no browser at all the suite is skipped and says so: it never passes without a GPU run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare, kernelAddress } from '../src/webgpu.mjs';

const file = (path) => new URL(`../${path}`, import.meta.url);
const WGSL = readFileSync(file('test/fixtures/webgpu/q4-group-sums.wgsl'), 'utf8');
// LexLean's canonical render of kernels 1 and 2 (q4GroupSums with units 2, rowCodes 64, zero 8; exp2Neg). Their
// addresses are provisional until prism-hologram-ai's acceptance gate pins the guest's bytes, so each is derived here
// and pinned nowhere.
const RENDERED = readFileSync(file('test/fixtures/webgpu/q4-group-sums.rendered.wgsl'), 'utf8');
const EXP2 = readFileSync(file('test/fixtures/webgpu/exp2-neg.rendered.wgsl'), 'utf8');
const EXP2_CASE = JSON.parse(readFileSync(file('test/fixtures/webgpu/exp2-neg.json'), 'utf8'));
const FIXTURE = JSON.parse(readFileSync(file('test/fixtures/webgpu/q4-group-sums.json'), 'utf8'));
const SERVED = { '/webgpu.mjs': 'src/webgpu.mjs', '/blake3.mjs': 'src/blake3.mjs', '/errors.mjs': 'src/errors.mjs' };

const CHROME = [
  process.env.PRISM_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((path) => path && existsSync(path));

/** The CPU's answer: the same sum in integers, wrapped to u32 as the kernel stores it. */
function cpuGroupSums(codes, packed, rows) {
  const units = codes.length / 32;
  const nibble = (g) => (packed[g >> 3] >>> (4 * (g & 7))) & 15;
  const out = new Uint32Array(rows * units);
  for (let row = 0; row < rows; row++) {
    for (let unit = 0; unit < units; unit++) {
      let sum = 0;
      for (let k = 0; k < 32; k++) sum += codes[unit * 32 + k] * (nibble(row * units * 32 + unit * 32 + k) - 8);
      out[row * units + unit] = sum >>> 0;
    }
  }
  return out;
}

/** A q4 case: activation codes as i16, weights packed eight nibbles to a word, and the plan a guest would answer. */
function q4Case(codes, packed, rows, wgsl = WGSL) {
  return {
    plan: { wgsl, kernel: kernelAddress(WGSL), invocations: rows * (codes.length / 32), buffers: [codes.map((c) => c >>> 0), packed, [0], new Array(rows * (codes.length / 32)).fill(0)] },
    cpu: cpuGroupSums(codes, packed, rows),
  };
}

function fixtureCase() {
  const bytes = Buffer.from(FIXTURE.codes_hex, 'hex');
  const packed = Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readUInt32LE(4 * i));
  return q4Case(FIXTURE.activation_codes, packed, 1);
}

/** 300 rows of 4 units: 1,200 invocations over 19 workgroups, the last one partly spare. */
function generatedCase() {
  let seed = 0x9e3779b9;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const codes = Array.from({ length: 4 * 32 }, () => (next() >>> 16) - 32768);
  const packed = Array.from({ length: (300 * 4 * 32) / 8 }, next);
  return q4Case(codes, packed, 300);
}

async function withChrome(flags, run) {
  const server = createServer((request, response) => {
    const path = SERVED[request.url];
    if (path) {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(readFileSync(file(path)));
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>WebGPU bridge</title>');
    }
  }).listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const profile = mkdtempSync(join(tmpdir(), 'prism-webgpu-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-webgpu', ...flags];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  const child = spawn(CHROME, [...args, `http://127.0.0.1:${server.address().port}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text) => (stderr += text));
  try {
    let endpoint;
    for (let i = 0; i < 300 && !endpoint; i++) {
      endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1];
      if (!endpoint) await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(endpoint, `the browser started: ${stderr.slice(-400)}`);
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      page = (await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()).find((p) => p.type === 'page' && p.url.startsWith('http://127.0.0.1'));
      if (!page) await new Promise((done) => setTimeout(done, 100));
    }
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done) => (socket.onopen = done));
    let id = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) pending.get(message.id)?.(message);
    };
    /** Run `source` in the page as the body of an async function and return its value. */
    const evaluate = async (source) => {
      id += 1;
      const answer = await new Promise((done) => {
        pending.set(id, done);
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `(async () => { ${source} })()`, awaitPromise: true, returnByValue: true } }));
      });
      if (answer.error) throw new Error(`CDP ${answer.error.message}`);
      assert.ok(!answer.result.exceptionDetails, JSON.stringify(answer.result.exceptionDetails));
      return answer.result.result.value;
    };
    // The tab is listed before it commits to the page, and committing destroys the context an evaluation ran in, so
    // ask again until this origin has loaded.
    for (let ready = false, i = 0; !ready; i++) {
      ready = await evaluate('return location.protocol === "http:" && document.readyState === "complete";').catch((error) => {
        if (i > 100) throw error;
        return false;
      });
      if (!ready) await new Promise((done) => setTimeout(done, 100));
    }
    const result = await run(evaluate);
    socket.close();
    return result;
  } finally {
    const exited = new Promise((done) => child.once('exit', done));
    child.kill();
    await exited;
    server.close();
    // Chrome's helper processes can still be writing the profile after the browser exits; removing it is cleanup only.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
}

/** Run plans in the page; each answer is the read-back output words, or the code the bridge refused with. */
const runInPage = (plans) => async (evaluate) =>
  evaluate(`
    const { runPlan } = await import('/webgpu.mjs');
    const out = [];
    for (const plan of ${JSON.stringify(plans)}) {
      try {
        const { outputs, adapter } = await runPlan(plan);
        // Each kernel here writes one buffer, its last binding.
        out.push({ words: [...[...outputs.values()].at(-1)], adapter });
      } catch (error) {
        out.push({ code: error.code ?? String(error) });
      }
    }
    return out;
  `);

/** Hardware first; a host the browser finds no adapter on runs SwiftShader. */
async function runOnWebGpu(plans) {
  const first = await withChrome([], runInPage(plans));
  if (!first.some((r) => r.code === 'webgpu.unavailable')) return first;
  // On Linux, Chrome reaches SwiftShader's WebGPU through its Vulkan backend.
  const linux = process.platform === 'linux' ? ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader'] : [];
  return withChrome(['--use-webgpu-adapter=swiftshader', ...linux], runInPage(plans));
}

test('a 4-bit group-sum kernel gives the CPU\'s integers bit for bit on WebGPU, as do LexLean\'s rendered kernels 1 and 2, and a broken plan or kernel never agrees', { skip: CHROME ? false : 'no Chrome or Chromium: set PRISM_CHROME' }, async (t) => {
  const fixture = fixtureCase();
  const generated = generatedCase();
  // Planted defects: the WGSL changed after its address was named, and a kernel whose zero point is 7, not 8.
  const altered = q4Case(FIXTURE.activation_codes, [...fixtureCase().plan.buffers[1]], 1, WGSL.replace('nibble - 8u', 'nibble - 7u'));
  const misnamed = { ...altered.plan, kernel: kernelAddress(altered.plan.wgsl) };
  // The rendered kernel on the same input, with two spare output words: its `invocations` override, set by the bridge,
  // keeps the padding invocations of the workgroup from writing them.
  const rendered = { ...fixture.plan, wgsl: RENDERED, kernel: kernelAddress(RENDERED), buffers: [...fixture.plan.buffers.slice(0, 3), [0, 0, 0, 0]] };
  const exp2 = { wgsl: EXP2, kernel: kernelAddress(EXP2), invocations: EXP2_CASE.inputs.length, buffers: [EXP2_CASE.inputs, EXP2_CASE.table, EXP2_CASE.inputs.map(() => 0)] };
  const [onFixture, onGenerated, onAltered, onMisnamed, onRendered, onExp2] = await runOnWebGpu([fixture.plan, generated.plan, altered.plan, misnamed, rendered, exp2]);
  t.diagnostic(`adapter ${JSON.stringify(onFixture.adapter)}`);

  // The CPU reference is the exact engine's: Lean checked these two sums for this input.
  assert.deepEqual([...fixture.cpu], FIXTURE.group_sums.map((s) => s >>> 0));
  for (const [run, expected] of [[onFixture, fixture.cpu], [onGenerated, generated.cpu]]) {
    assert.ok(run.words, JSON.stringify(run));
    const { verdict, facts } = compare({ ran: true, planOk: true, readbackOk: true, cpu: expected, gpu: run.words });
    assert.equal(verdict, 'agree', JSON.stringify(facts));
    assert.deepEqual(run.words, [...expected]);
  }
  assert.equal(onGenerated.words.length, 1200);
  assert.ok(onRendered.words, JSON.stringify(onRendered));
  assert.deepEqual(onRendered.words, [...fixture.cpu, 0, 0]);
  // exp2Neg on every branch (shift 0, 1 to 31, 32 and past), against the words Lean checked on the model.
  assert.ok(onExp2.words, JSON.stringify(onExp2));
  assert.equal(compare({ ran: true, planOk: true, readbackOk: true, cpu: EXP2_CASE.expected, gpu: onExp2.words }).verdict, 'agree');

  // WGSL that is not the text its address names is refused before anything is dispatched.
  assert.equal(onAltered.code, 'webgpu.plan-refused');
  // Named honestly, the wrong kernel runs, and its words differ from the CPU's.
  assert.equal(compare({ ran: true, planOk: true, readbackOk: true, cpu: fixture.cpu, gpu: onMisnamed.words }).verdict, 'differ');
});
