// Serve the edit page with one LexLean project to edit, on one origin.
// Usage: node tools/serve-edit.mjs <project dir, holding lexlean.toml> [port]
// Then open http://localhost:<port>/edit/ .
//
// The page is given: the project's files and a listing of them; this checkout's prism-code; the pin of the LexLean
// executable; and the executable itself, from where prism-code keeps it on this machine (fetched once if absent).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEXLEAN_WASM, ensureLexleanWasm, lexleanWasmFile } from '../../src/journey/lexlean-wasm.mjs';

const [projectArg, port = '4170'] = process.argv.slice(2);
if (!projectArg) { console.error('usage: node tools/serve-edit.mjs <project dir> [port]'); process.exit(64); }
const project = resolve(projectArg);
const editDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'edit');
const src = join(editDir, '..', '..', 'src');
const wasm = lexleanWasmFile() ?? await ensureLexleanWasm();

// What a check reads: everything but build outputs, caches, and this repository's notes and generators.
const SKIPPED = new Set(['.lexlean', '.lake', '.prism', '.git', 'target', 'node_modules', 'tools']);
const files = [];
const visit = (dir, rel) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIPPED.has(entry.name)) visit(join(dir, entry.name), rel + entry.name + '/'); }
    else if (entry.isFile() && !/\.(md|json)$/.test(entry.name) || entry.name === 'lake-manifest.json') files.push(rel + entry.name);
  }
};
visit(project, '');
const entry = /entrypoints\s*=\s*\[\s*"([^"]+)"/.exec(readFileSync(join(project, 'lexlean.toml'), 'utf8'))?.[1];
if (!entry) { console.error('lexlean.toml names no entrypoint'); process.exit(64); }
const json = (value) => ({ type: 'application/json', body: Buffer.from(JSON.stringify(value)) });
const fixed = {
  '/edit/project.json': json({ files: files.sort(), entry }),
  '/edit/pin.json': json({ commit: LEXLEAN_WASM.commit, kappa: LEXLEAN_WASM.kappa, encoding: LEXLEAN_WASM.encoding }),
};
// Longest prefix first.
const roots = [['/edit/project/', project], ['/edit/prism-code/', resolve(src)], ['/edit/', resolve(editDir)]];
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.toml': 'text/plain; charset=utf-8', '.tex': 'text/plain; charset=utf-8', '.lock': 'text/plain; charset=utf-8' };

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const send = (status, type, body) => response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  if (path === '/') { response.writeHead(302, { location: '/edit/' }).end(); return; }
  if (fixed[path]) { send(200, fixed[path].type, fixed[path].body); return; }
  try {
    if (path === '/edit/lexlean.wasm.gz') { send(200, 'application/gzip', await readFile(wasm)); return; }
    const root = roots.find(([prefix]) => path.startsWith(prefix));
    if (!root) { send(404, 'text/plain', 'not found'); return; }
    let rest = path.slice(root[0].length);
    if (rest === '' || rest.endsWith('/')) rest += 'index.html';
    const file = normalize(join(root[1], rest));
    // Nothing outside the three folders is served.
    if (file !== root[1] && !file.startsWith(root[1] + sep)) { send(403, 'text/plain', 'forbidden'); return; }
    const body = await readFile(file);
    send(200, TYPES[extname(file)] ?? 'application/octet-stream', body);
  } catch { send(404, 'text/plain', 'not found'); }
}).listen(Number(port), '127.0.0.1', () => console.log(`edit page: http://localhost:${port}/edit/  (${files.length} project files, entry ${entry})`));
