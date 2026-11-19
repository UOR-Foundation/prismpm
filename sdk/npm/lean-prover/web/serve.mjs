// Development: serves the sealed prover page (sealed.html) on localhost, as a static host would. No COOP or COEP
// header: the page needs no cross-origin isolation. `/corpus/` holds LexLean's WASI build, `/src/` and
// `/kernel-path/` this package's code, kernel and base library, and `/project/` the LexLean project to prove, with
// `/project/index.json` listing its files. LIBDIR is served at `/lib/` for older seals.
//   node web/serve.mjs LIBDIR CORPUSDIR [port] [PROJECTDIR]
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const [lib, corpus, portArg, project] = process.argv.slice(2);
const listing = async (dir, at = "") => (await Promise.all((await readdir(join(dir, at), { withFileTypes: true })).filter((e) => ![".lexlean", ".lake", ".git"].includes(e.name)).map((e) => (e.isDirectory() ? listing(dir, `${at}${e.name}/`) : [`${at}${e.name}`])))).flat();
const blake3 = join(here, "../src/vendor/blake3.mjs");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".lean": "text/plain", ".jsonl": "text/plain" };
const under = (root, rest) => { const p = normalize(join(root, rest)); return p.startsWith(normalize(root)) ? p : null; };
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const path = url === "/blake3.mjs" ? blake3
    : url.startsWith("/src/") ? under(join(here, "../src"), url.slice(5))
    : url.startsWith("/kernel-path/") ? under(join(here, "../kernel-path"), url.slice(13))
    : url.startsWith("/project/") && project ? under(project, url.slice(9))
    : url.startsWith("/lib/") ? under(lib, url.slice(5)) : url.startsWith("/corpus/") ? under(corpus, url.slice(8))
    : under(here, url === "/" ? "sealed.html" : url.slice(1));
  if (!path) { res.writeHead(403).end(); return; }
  if (url === "/project/index.json" && project) { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(await listing(project))); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(Number(portArg ?? 8794), () => console.log(`http://localhost:${portArg ?? 8794}/`));
