/**
 * `prism-code mcp`: the Prism MCP server, over stdio, with no dependencies.
 *
 * A Prism app's one source of truth is its LexLean model under `prism/src/`,
 * which the agent writes. The server starts the app from a content-addressed
 * starter, then checks, proves, builds and answers from it. Proving and
 * building take minutes, longer than some agents wait for one tool call, so
 * both run as jobs: a call waits up to `wait` seconds, and a later call of the
 * same tool picks the job up where it is.
 */
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { appDir, readSession, sourceDigest, sourceFiles, startApp, starters, writeSession } from './project.mjs';
import { build, check, isRuleApp, prove, tryRequest } from './engine.mjs';
import { NO_DOCKER_FREE_BUILD } from './frontend.mjs';
import { gapLedger } from '../gaps.mjs';
import { kappa } from '../blake3.mjs';
import { LEXLEAN_CARD } from './card.mjs';

/** The card an agent writes LexLean from, named by its BLAKE3 label so every agent can say which card it read. */
const LANGUAGE = Object.freeze({ card: LEXLEAN_CARD, label: kappa(new TextEncoder().encode(LEXLEAN_CARD)) });

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `Prism builds formally verified apps, with four tools named like Docker's. For Prism or /prism, call prism_init.
An app's one source of truth is its LexLean model in prism/src/. Start it with prism_init, then write it yourself, as the user describes the app.
After each edit call prism_build. When it names a fix, make exactly that fix and call it again; when it lists the theorems, show the user what each guarantees: Lean proved them, so the user must agree or strike.
prism_run answers a request from the built app. prism_inspect audits the app, changing nothing.
${NO_DOCKER_FREE_BUILD} Never set PRISM_CODE_TIER yourself; only the user chooses it.
Say "proved" only for what Lean proved, "tested" for what acceptance vectors cover.`;

const GREETING = 'Prism builds an app whose rules are proved by Lean, not just tested. Its one source is a LexLean model: I start it from a starter, write it with you, and Lean proves it.';

/**
 * The four tools an agent sees, named as Docker names them: init, build, run, inspect. Each is one intent, and each
 * answer says what to do next. The finer steps below stay callable by name for agents that learned them, unlisted.
 */
export const TOOLS = [
  {
    name: 'prism_init',
    description: `Start the app in this project from a starter LexLean module, as docker init writes a Dockerfile from a template. Before an app exists, with no starter, lists the starters and what each is for. ${NO_DOCKER_FREE_BUILD}`,
    inputSchema: { type: 'object', properties: { starter: { type: 'string', description: 'The starter to start from: rule-app, decision-app or stateful-app.' } }, additionalProperties: false },
  },
  {
    name: 'prism_build',
    description: 'Build the LexLean model as it is on disk into a verified app: check it, prove every theorem with Lean\'s kernel in this process, and, for a rule app, build the verified rule judge. When the model does not check, returns the first problem with the exact fix: the line, and the name to write when one is misspelled. When it does, returns every theorem, its proof, its axioms and whether Lean proved it. Call after every edit. Seconds; nothing is sent anywhere.',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' } }, additionalProperties: false },
  },
  {
    name: 'prism_run',
    description: 'Answer one request from the built app, building it first when the model changed since its last build. Nothing answers from a model that is not proved.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'One request line, the fields separated by single spaces; for a stateful app, a session: its steps separated by ;.' }, wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' } }, required: ['request'], additionalProperties: false },
  },
  {
    name: 'prism_inspect',
    description: 'What the app is and what it guarantees, as docker inspect reads an image, changing nothing: its starter and files, whether the model as it is on disk is checked, proved and built, and every theorem of the last proof with its axioms and status. Use it to audit an app.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/** The finer steps, still answered by name, not listed. */
const STEPS = [
  {
    name: 'prism_start',
    description: 'The older name of prism_init.',
    inputSchema: TOOLS[0].inputSchema,
  },
  {
    name: 'prism_verify',
    description: 'Check the model, then prove every theorem: the first problem with its fix when it does not check, every theorem when it does.',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' } }, additionalProperties: false },
  },
  {
    name: 'prism_check',
    description: 'Check the LexLean model as it is on disk: every diagnostic with the line of prism/src/ it anchors to, and what to change. Proves nothing. Seconds in the SDK image.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'prism_prove',
    description: 'Prove the model. A rule app is read from its LexLean semantic snapshot and its guarantees are checked by Lean\'s kernel in this process; any other app is proved by lexlean verify in the SDK image (one to five minutes). Returns state running while it works; call again to keep waiting.',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' } }, additionalProperties: false },
  },
  {
    name: 'prism_build',
    description: 'Prove, then build the app and replay its acceptance vectors. A rule app becomes the verified rule judge and the model\'s numbers, with a static page; any other app is built into a holo in the SDK image (ten minutes or more the first time). Returns state running while it works; call again to keep waiting.',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' } }, additionalProperties: false },
  },
  {
    name: 'prism_try',
    description: 'Answer one request from the built app. Nothing answers before a build.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'One request line, the fields separated by single spaces; for a stateful app, a session: its steps separated by ;.' } }, required: ['request'], additionalProperties: false },
  },
  {
    name: 'prism_status',
    description: 'Where the app stands: its starter, its source files, what is checked, proved and built for the model as it is on disk, and any job in progress.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/** The listed tool that follows each long step. */
const CALL = { prove: 'prism_build', build: 'prism_build' };

const PROMPTS = [{ name: 'prism', description: 'Build a formally verified app with Prism', arguments: [] }];

/** What is wrong with a tool call's arguments, in words that say what to send; null when they fit the tool's schema. */
export function argumentIssue(name, args) {
  const schema = [...TOOLS, ...STEPS].find((t) => t.name === name).inputSchema;
  const takes = Object.keys(schema.properties);
  const shape = takes.length ? `It takes ${takes.map((k) => `\`${k}\``).join(', ')}.` : 'It takes no arguments.';
  if (!args || typeof args !== 'object' || Array.isArray(args)) return `${name} takes its arguments as one JSON object. ${shape}`;
  const unknown = Object.keys(args).filter((k) => !takes.includes(k));
  if (unknown.length) return `${name} does not take ${unknown.slice(0, 6).map((k) => `\`${k}\``).join(', ')}. ${shape} Nothing was changed.`;
  for (const key of schema.required ?? []) if (args[key] === undefined || args[key] === null) return `${name} needs \`${key}\`. ${shape}`;
  for (const [key, value] of Object.entries(args)) {
    const type = schema.properties[key].type;
    if (value === undefined || value === null || !type) continue;
    const fits = type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
    if (!fits) return `${name}: \`${key}\` must be a ${type}, not ${Array.isArray(value) ? 'a list' : typeof value === 'object' ? 'an object' : `the ${typeof value} ${JSON.stringify(value)}`}. Nothing was changed.`;
  }
  return null;
}

/** Whether a process still runs. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/** A server bound to a working directory. `send` writes one JSON-RPC message. */
export function createServer({ cwd = process.cwd(), send, gaps = gapLedger() }) {
  const dir = appDir(cwd);
  const jobs = new Map();
  const load = () => readSession(dir);
  const save = (session) => writeSession(dir, session);
  const started = () => sourceFiles(dir).length > 0;

  function startJob(kind, run) {
    const job = { kind, state: 'running', log: [], started: Date.now(), result: null };
    const log = (line) => {
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
      job.onLog?.(line);
    };
    job.promise = run(log)
      .then((result) => Object.assign(job, { state: 'done', result }))
      .catch((error) => Object.assign(job, { state: 'done', result: { ok: false, message: `Prism failed: ${error.message}` } }));
    jobs.set(kind, job);
    return job;
  }

  async function awaitJob(job, waitSeconds, progress) {
    const timer = new Promise((done) => setTimeout(done, Math.max(0, Math.min(waitSeconds, 600)) * 1000));
    let tick = 0;
    job.onLog = (line) => progress?.(++tick, line);
    await Promise.race([job.promise, timer]);
    job.onLog = null;
    const elapsed = Math.round((Date.now() - job.started) / 1000);
    if (job.state === 'running') return { state: 'running', elapsed, latest: job.log.slice(-3), next: `Still working after ${elapsed} s. Call ${CALL[job.kind]} again to keep waiting.` };
    jobs.delete(job.kind);
    return { state: 'done', elapsed, ...job.result };
  }

  async function longTool(kind, args, progress) {
    if (!started()) return { state: 'blocked', message: 'There is no model yet. Call prism_init with a starter first.' };
    const session = load();
    const other = jobs.get(kind === 'build' ? 'prove' : 'build');
    if (other) return { state: 'busy', message: `A ${other.kind} is running; call ${CALL[other.kind]} to follow it.` };
    // A job another Prism server started (an agent that restarted its server) is not started twice.
    const elsewhere = session.status.job;
    if (!jobs.get(kind) && elsewhere && elsewhere.pid !== process.pid && alive(elsewhere.pid)) {
      const elapsed = Math.round((Date.now() - elsewhere.started) / 1000);
      return { state: 'running', elapsed, next: `A ${elsewhere.kind} another Prism server started ${elapsed} s ago is still running. Call ${CALL[kind]} again to keep waiting.` };
    }
    if (!jobs.get(kind) && elsewhere && elsewhere.pid !== process.pid) {
      delete session.status.job;
      save(session);
    }
    if (!jobs.get(kind) && kind === 'build' && session.status.lastBuild?.source === sourceDigest(dir)) {
      return { state: 'done', elapsed: 0, ...session.status.lastBuild.result, note: 'The model has not changed since this build, so it was not built again.' };
    }
    const job =
      jobs.get(kind) ??
      startJob(kind, async (log) => {
        const s = load();
        s.status.job = { kind, pid: process.pid, started: Date.now() };
        save(s);
        const result = kind === 'build' ? await build(dir, s, { log, gaps }) : await prove(dir, s, { log, gaps });
        // The audit prism_inspect reads: every theorem (or a rule app's guarantees) of this proof, for these sources.
        if (kind === 'prove') s.status.audit = { source: sourceDigest(dir), at: new Date().toISOString(), ok: result.ok, theorems: result.theorems ?? result.guarantees ?? null };
        if (kind === 'build' && result.ok) s.status.lastBuild = { source: sourceDigest(dir), result: { ...result, table: undefined } };
        delete s.status.job;
        save(s);
        const { table, ...shown } = result;
        return shown;
      });
    return awaitJob(job, args.wait ?? 45, progress);
  }

  const status = () => {
    const session = load();
    const source = started() ? sourceDigest(dir) : null;
    const current = (record) => (record ? { ...record, current: record.source === source } : null);
    return {
      project: dir,
      starter: session.starter,
      files: sourceFiles(dir),
      source,
      checked: current(session.status.checked),
      proved: current(session.status.proved),
      kernelChecked: current(session.status.kernelChecked),
      built: current(session.status.built),
      ruleApp: session.status.ruleApp ?? null,
      holo: session.status.holo ?? null,
      jobs: [...jobs.values()].map((j) => ({ kind: j.kind, state: j.state, elapsed: Math.round((Date.now() - j.started) / 1000), latest: j.log.slice(-3) })),
    };
  };

  const tools = {
    prism_start(args) {
      setImmediate(() => import('./kernel-prove.mjs').then((m) => m.warmKernel()).catch(() => {}));
      // LexLean as WebAssembly is fetched once, while the user is still describing the app.
      setImmediate(() => import('./lexlean-wasm.mjs').then((m) => m.lexleanReady()).catch(() => {}));
      const all = starters();
      const list = Object.entries(all).map(([name, s]) => ({ starter: name, module: s.module, shape: s.shape }));
      if (started()) return { greeting: 'Welcome back.', ...status(), note: args.starter ? 'This project already holds a model, so no starter was written.' : undefined, language: LANGUAGE, nextSteps: [NO_DOCKER_FREE_BUILD] };
      if (!args.starter) return { greeting: GREETING, project: dir, starters: list, next: 'Pick the starter whose shape fits the app the user describes, and call prism_init again with it.', nextSteps: [NO_DOCKER_FREE_BUILD] };
      let made;
      try {
        made = startApp(dir, args.starter);
      } catch (error) {
        return { ok: false, code: error.code, message: error.message, starters: list };
      }
      const session = load();
      session.starter = made.starter;
      session.status = {};
      save(session);
      return {
        ok: true,
        project: dir,
        starter: made.starter,
        model: `src/${made.module}.lex.tex`,
        files: sourceFiles(dir),
        next: `Edit prism/src/${made.module}.lex.tex to the app the user describes, then call prism_build.`,
        language: LANGUAGE,
        nextSteps: [NO_DOCKER_FREE_BUILD],
      };
    },
    async prism_check() {
      if (!started()) return { state: 'blocked', message: 'There is no model yet. Call prism_init with a starter first.' };
      const session = load();
      const result = await check(dir, session, { gaps });
      save(session);
      return result;
    },
    prism_prove: (args, progress) => longTool('prove', args, progress),
    async prism_try(args) {
      return tryRequest(dir, load(), args.request);
    },
    prism_status: status,
    // Check, then prove: the fix when the model does not check, every theorem when it does.
    async prism_verify(args, progress) {
      const checked = await tools.prism_check();
      if (checked.ok === false || checked.state === 'blocked') return { step: 'check', ...checked };
      const proved = await longTool('prove', args, progress);
      return { step: 'prove', checkedIn: checked.ms, ...proved };
    },
    prism_init: (args) => tools.prism_start(args),
    // Check, prove, then build what needs no image: a rule app's verified judge. Another app stops at proved.
    async prism_build(args, progress) {
      const verified = await tools.prism_verify(args, progress);
      if (verified.step !== 'prove' || verified.state !== 'done' || verified.ok === false || !isRuleApp(load())) return verified;
      const built = await longTool('build', args, progress);
      return { ...verified, step: 'build', built: { ok: built.ok, state: built.state, message: built.message ?? built.note } };
    },
    // Build when the model changed (skipped when it did not), then answer.
    async prism_run(args, progress) {
      const built = await longTool('build', { wait: args.wait }, progress);
      if (built.state !== 'done' || built.ok === false) return { step: 'build', ...built };
      return { step: 'answer', answer: await tryRequest(dir, load(), args.request) };
    },
    // Status, and the theorems of the last proof, for the model as it is on disk. Changes nothing.
    prism_inspect() {
      const now = status();
      const audit = load().status.audit ?? null;
      return { ...now, audit: audit ? { ...audit, current: audit.source === now.source } : null };
    },
  };

  const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  async function handle(message) {
    const { id, method, params = {} } = message;
    const isRequest = id !== undefined && id !== null;
    try {
      switch (method) {
        case 'initialize': {
          const requested = params.protocolVersion;
          return reply(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: 'prism', title: 'Prism', version },
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping':
          return reply(id, {});
        case 'tools/list':
          return reply(id, { tools: TOOLS });
        case 'tools/call': {
          const tool = tools[params.name];
          if (!tool) return error(id, -32602, `Unknown tool: ${params.name}`);
          const wrong = argumentIssue(params.name, params.arguments ?? {});
          if (wrong) return reply(id, { content: [{ type: 'text', text: wrong }], structuredContent: { issue: wrong }, isError: true });
          const token = params._meta?.progressToken;
          const progress = token === undefined ? null : (n, line) => send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: n, message: line } });
          const result = await tool(params.arguments ?? {}, progress);
          const isError = result && (result.ok === false || result.state === 'blocked');
          return reply(id, { content: [{ type: 'text', text: text(result) }], structuredContent: result, ...(isError ? { isError: true } : {}) });
        }
        case 'prompts/list':
          return reply(id, { prompts: PROMPTS });
        case 'prompts/get':
          if (params.name !== 'prism') return error(id, -32602, `Unknown prompt: ${params.name}`);
          return reply(id, { description: PROMPTS[0].description, messages: [{ role: 'user', content: { type: 'text', text: 'Call the prism_start tool and follow what it returns: start the app from the starter that fits what I want, write its LexLean model with me, and show me its guarantees before you prove or build.' } }] });
        case 'resources/list':
          return reply(id, {
            resources: [
              { uri: 'prism://model', name: 'model', description: 'The LexLean model, the app\'s one source of truth', mimeType: 'application/x-tex' },
              { uri: 'prism://status', name: 'status', description: 'What is checked, proved and built', mimeType: 'application/json' },
            ],
          });
        case 'resources/templates/list':
          return reply(id, { resourceTemplates: [] });
        case 'resources/read': {
          const contents = {
            'prism://model': () => ({ mimeType: 'application/x-tex', text: sourceFiles(dir).map((f) => `% ${f}\n${existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : ''}`).join('\n') || 'No model yet.' }),
            'prism://status': () => ({ mimeType: 'application/json', text: text(status()) }),
          }[params.uri];
          if (!contents) return error(id, -32602, `Unknown resource: ${params.uri}`);
          return reply(id, { contents: [{ uri: params.uri, ...contents() }] });
        }
        case 'logging/setLevel':
          return reply(id, {});
        case 'completion/complete':
          return reply(id, { completion: { values: [], hasMore: false } });
        default:
          if (method?.startsWith('notifications/')) return undefined;
          if (isRequest) return error(id, -32601, `Method not found: ${method}`);
          return undefined;
      }
    } catch (e) {
      if (isRequest) return error(id, -32603, e.message);
      return undefined;
    }
  }
  /** Settles when no job runs, so a closing server still saves what its jobs learn. */
  const idle = () => Promise.allSettled([...jobs.values()].map((j) => j.promise));
  return { handle, dir, idle };
}

/** Serve on stdin and stdout until stdin closes. */
export function serveStdio({ cwd = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const server = createServer({ cwd, send: (message) => output.write(`${JSON.stringify(message)}\n`) });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    for (const m of Array.isArray(message) ? message : [message]) {
      const p = server.handle(m);
      pending.add(p);
      p.finally(() => pending.delete(p));
    }
  });
  return new Promise((done) => lines.on('close', () => Promise.allSettled([...pending]).then(() => server.idle()).then(() => done(server))));
}
