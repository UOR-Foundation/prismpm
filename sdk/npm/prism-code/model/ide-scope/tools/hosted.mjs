// Send this kernel's src/ to the hosted LexLean verifier (https://mcp.uor.foundation/) and print what it says.
// The service stores what it is sent unlisted, not privately.
// Usage: node hosted.mjs <src dir> check | verify | status <task> | tools
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const URL_ = 'https://mcp.uor.foundation/';
const [srcDir, mode, arg] = process.argv.slice(2);
let session = null;
let id = 0;

async function rpc(method, params, notify = false) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (session) headers['mcp-session-id'] = session;
  const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params };
  const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(body) });
  session = res.headers.get('mcp-session-id') ?? session;
  if (notify) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const line = (res.headers.get('content-type') ?? '').includes('event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop()
    : text;
  const msg = JSON.parse(line);
  if (msg.error) throw new Error(JSON.stringify(msg.error));
  return msg.result;
}
const call = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = (r.content ?? []).map((c) => c.text ?? '').join('\n');
  return { isError: !!r.isError, text };
};

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'scope-kernel', version: '0' } });
await rpc('notifications/initialized', {}, true);

if (mode === 'tools') {
  const r = await rpc('tools/list', {});
  console.log(r.tools.map((t) => t.name).join('\n'));
} else if (mode === 'status') {
  console.log((await call('lexlean_verify_control', { task: arg, action: 'status' })).text.slice(0, 6000));
} else {
  const files = readdirSync(srcDir).filter((n) => n.endsWith('.lex.tex')).sort()
    .map((n) => ({ path: 'src/' + n, content: readFileSync(join(srcDir, n), 'utf8') }));
  const draft = await call('lexlean_draft_write', { profile: arg ?? 'spec', files });
  console.log('draft:', draft.text.slice(0, 600));
  if (draft.isError) process.exit(1);
  const project = draft.text.match(/[a-z-]+\/[0-9a-f]{64}/)[0];
  const out = await call(mode === 'verify' ? 'lexlean_verify' : 'lexlean_check', { project });
  console.log(mode + (out.isError ? ' (refused):' : ':'), out.text.slice(0, 6000));
  if (mode === 'verify' && !out.isError) {
    // Wait in the same session: the task belongs to it.
    const task = out.text.match(/task-\d+/)?.[0] ?? out.text.trim();
    for (let n = 0; n < 40; n++) {
      await new Promise((r) => setTimeout(r, 15000));
      const r = await rpc('tools/call', { name: 'lexlean_verify_control', arguments: { task, action: 'status' } });
      const raw = JSON.stringify(r);
      if (/running|queued|pending|working/i.test(raw) && !/"success"/.test(raw)) { console.log('waiting', n, raw.slice(0, 160)); continue; }
      console.log('result:', raw.slice(0, 9000));
      break;
    }
  }
}
