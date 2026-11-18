// A stand-in for the hosted verifier, answering in this process: nothing leaves the machine. It answers
// `lexlean_profiles`, `lexlean_draft_write`, `lexlean_check`, `lexlean_snapshot` and `lexlean_verify` as
// the server does, from what each test gives it, and records every call.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostedClient } from '../../src/hosted.mjs';
import { appDir, readSession, startApp } from '../../src/journey/project.mjs';

export const PROFILE = { id: 'p1', name: 'prism-app', roots: ['src'], packages: [{ package: 'lexlean.core' }, { package: 'lexlean.std.nat' }, { package: 'lexlean.std.bool' }, { package: 'prism.arch' }] };

/** The stand-in. `snapshot` is what `lexlean_snapshot` returns; `check` and `verify` what those return. */
export function standIn({ snapshot = null, check = { success: true, diagnostics: [] }, verify = null } = {}) {
  const calls = [];
  let id = 0;
  const fetch = async (_url, { body }) => {
    const request = JSON.parse(body);
    const tool = request.params.name;
    calls.push({ tool, arguments: request.params.arguments });
    let result;
    if (tool === 'lexlean_profiles') result = { structuredContent: { profiles: [PROFILE] } };
    else if (tool === 'lexlean_draft_write') result = { structuredContent: { draft: `prism-app/${++id}` } };
    else if (tool === 'lexlean_check') result = { structuredContent: check };
    else if (tool === 'lexlean_snapshot') result = snapshot ? { structuredContent: snapshot } : { isError: true, content: [{ type: 'text', text: 'project-refused' }] };
    else if (tool === 'lexlean_verify') result = verify;
    return { status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) };
  };
  return { calls, client: hostedClient({ url: 'https://lexlean.example.test/', fetch, sleep: async () => {}, retryMs: 0 }) };
}

/** A new app folder started from `starter`, and its session. */
export function startedApp(starter = 'rule-app') {
  const dir = appDir(mkdtempSync(join(tmpdir(), `prism-${starter}-`)));
  startApp(dir, starter);
  return { dir, session: { ...readSession(dir), starter } };
}
