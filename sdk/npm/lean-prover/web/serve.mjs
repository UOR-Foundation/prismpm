// Development: serves the elaborator page on localhost, as a static host would. No COOP or COEP header, so the page
// is not cross-origin isolated. `/lib/` is the manifest folder (the lean-prover-library artifact), `/corpus/` the
// gate's browser corpus (the lean-prover-browser-corpus artifact: <Module>.lean, modules.json and native.jsonl), and
// `/blake3.mjs` the BLAKE3 this package carries. With --lib32 DIR, `/lib32/` is the 32-bit build's manifest folder;
// with --reports DIR, a page's POST to `/report/NAME` is written to DIR/NAME.json (gate/browsers.mjs).
//   node web/serve.mjs LIBDIR CORPUSDIR [port] [--lib32 DIR] [--reports DIR]
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const [, v] = argv.splice(i, 2); return v; };
const lib32 = flag("--lib32"), reports = flag("--reports");
const [lib, corpus, portArg] = argv;
const blake3 = join(here, "../src/vendor/blake3.mjs");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".lean": "text/plain", ".jsonl": "text/plain" };
const under = (root, rest) => { const p = normalize(join(root, rest)); return p.startsWith(normalize(root)) ? p : null; };
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (req.method === "POST" && reports && /^\/report\/[\w.-]+$/.test(url)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await writeFile(join(reports, `${url.slice(8)}.json`), Buffer.concat(chunks));
    res.writeHead(204).end();
    return;
  }
  const path = url === "/blake3.mjs" ? blake3
    : url.startsWith("/lib/") ? under(lib, url.slice(5)) : url.startsWith("/corpus/") ? under(corpus, url.slice(8))
    : lib32 && url.startsWith("/lib32/") ? under(lib32, url.slice(7))
    : under(here, url === "/" ? "index.html" : url.slice(1));
  if (!path) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(Number(portArg ?? 8794), () => console.log(`http://localhost:${portArg ?? 8794}/`));
