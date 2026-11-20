// Serve the audit view beside one built rule app, on one origin, for trying it by hand or in a test.
// Usage: node tools/serve-audit.mjs <rule app site dir, e.g. .../.prism/site> [port]
// Then open http://localhost:<port>/audit/ . The app is at /audit/app/ .
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [siteDir, port = '4180'] = process.argv.slice(2);
if (!siteDir) { console.error('usage: node tools/serve-audit.mjs <rule app site dir> [port]'); process.exit(64); }
const auditDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'audit');
const roots = [['/audit/app/', resolve(siteDir)], ['/audit/', resolve(auditDir)]];
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.gz': 'application/gzip', '.holo': 'application/octet-stream' };

createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.writeHead(302, { location: '/audit/' }).end(); return; }
  const root = roots.find(([prefix]) => path.startsWith(prefix));
  if (!root) { response.writeHead(404).end('not found'); return; }
  let rest = path.slice(root[0].length);
  if (rest === '' || rest.endsWith('/')) rest += 'index.html';
  const file = normalize(join(root[1], rest));
  // Nothing outside the two folders is served.
  if (file !== root[1] && !file.startsWith(root[1] + sep)) { response.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end('not found'); }
}).listen(Number(port), '127.0.0.1', () => console.log(`audit view: http://localhost:${port}/audit/`));
