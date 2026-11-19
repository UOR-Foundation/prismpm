// Development: serves the elaborator page on localhost, as a static host would. No COOP or COEP header, so the page
// is not cross-origin isolated. `/lib/` is the manifest folder (the lean-prover-library artifact), `/corpus/` the
// gate's browser corpus (the lean-prover-browser-corpus artifact: <Module>.lean, modules.json and native.jsonl), and
// `/blake3.mjs` the BLAKE3 this package carries.
//   node web/serve.mjs LIBDIR CORPUSDIR [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const [lib, corpus, portArg] = process.argv.slice(2);
const blake3 = join(here, "../src/vendor/blake3.mjs");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".lean": "text/plain", ".jsonl": "text/plain" };
const under = (root, rest) => { const p = normalize(join(root, rest)); return p.startsWith(normalize(root)) ? p : null; };
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const path = url === "/blake3.mjs" ? blake3
    : url.startsWith("/lib/") ? under(lib, url.slice(5)) : url.startsWith("/corpus/") ? under(corpus, url.slice(8))
    : under(here, url === "/" ? "index.html" : url.slice(1));
  if (!path) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(Number(portArg ?? 8794), () => console.log(`http://localhost:${portArg ?? 8794}/`));
