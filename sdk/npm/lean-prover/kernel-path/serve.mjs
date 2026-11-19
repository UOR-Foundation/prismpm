// A static file server for this folder, for local use: node serve.mjs [port]
// No special headers: the page needs no cross-origin isolation and no SharedArrayBuffer.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8787);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".ndjson": "text/plain; charset=utf-8", ".json": "application/json", ".lean": "text/plain; charset=utf-8" };

http.createServer((req, res) => {
  // A page may post what it measured, so a browser with no one watching can still report.
  if (req.method === "POST" && req.url === "/report") { let body = ""; req.on("data", (c) => body += c); req.on("end", () => { fs.appendFileSync(path.join(root, "test/reports.ndjson"), body + "\n"); res.writeHead(204); res.end(); }); return; }
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(root, rel === "/" ? "/web/index.html" : rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://localhost:${port}/`));
