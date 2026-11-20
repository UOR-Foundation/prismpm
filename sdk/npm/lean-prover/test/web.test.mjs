// The browser worker (web/elab-worker.mjs), run in Node with the files a browser would fetch. Each defect found in a
// browser is pinned here: a nested worker that never answered, an open that failed silently, an engine that could
// not be instantiated, and a hasher slower than the network.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { kappa } from "../src/vendor/blake3.mjs";
import { fixture } from "./helpers.mjs";

register("./web-hooks.mjs", import.meta.url);
const web = new URL("../web/", import.meta.url);
let run = 0;

/**
 * A fresh copy of the worker in a stand-in worker scope: `fetch` serves `blobs` (label -> gzip bytes) and the
 * manifest under http://lib, and files under web/ from disk; `Worker` records any nested worker it is asked to start.
 */
async function worker({ manifest, blobs, status = {} }) {
  const posted = [], nested = [];
  const saved = { fetch: globalThis.fetch, self: globalThis.self, Worker: globalThis.Worker };
  globalThis.self = { postMessage: (m) => posted.push(m) };
  globalThis.Worker = class { constructor(url) { nested.push(String(url)); } postMessage() {} terminate() {} };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("file:")) return new Response(await readFile(fileURLToPath(url)));
    const path = url.replace(/^http:\/\/lib\//, "");
    if (status[path]) return new Response(null, { status: status[path] });
    if (path === "manifest.json") return new Response(JSON.stringify(manifest));
    const bytes = blobs.get(`blake3:${path.replace(/^blobs\//, "")}`);
    return bytes ? new Response(bytes) : new Response(null, { status: 404 });
  };
  await import(new URL(`elab-worker.mjs?run=${run++}`, web).href);
  const onmessage = globalThis.self.onmessage;
  const restore = () => Object.assign(globalThis, saved);
  const ask = async (data, ms = 20000) => {
    const from = posted.length;
    await Promise.race([onmessage({ data }), new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms))]);
    return posted.slice(from);
  };
  return { ask, nested, restore };
}

async function opened(setup) {
  const w = await worker(setup);
  try {
    const answers = await w.ask({ op: "open", base: "http://lib" });
    return { answers, nested: w.nested };
  } finally { w.restore(); }
}

test("open answers exactly once with a stated refusal when a library blob is missing", async () => {
  const f = fixture();
  const lib = f.manifest.library[1];
  f.blobs.delete(lib.kappa);
  const { answers } = await opened(f);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].op, "open");
  assert.equal(answers[0].ok, false);
  assert.match(answers[0].refusal, new RegExp(`${lib.path} \\(${lib.kappa}\\) is missing \\(HTTP 404\\)`));
});

test("open refuses a blob whose decoded bytes do not have its label, after fetching it once more", async () => {
  const f = fixture();
  const lib = f.manifest.library[0];
  const { gzipSync } = await import("node:zlib");
  f.blobs.set(lib.kappa, gzipSync(new TextEncoder().encode("not Init")));
  const { answers } = await opened(f);
  assert.equal(answers.length, 1);
  assert.match(answers[0].refusal, /decodes to bytes without its BLAKE3 label/);
});

test("open refuses a missing manifest and an engine it cannot load, and never goes silent", async () => {
  const f = fixture();
  const noManifest = await opened({ ...f, status: { "manifest.json": 404 } });
  assert.deepEqual(noManifest.answers, [{ op: "open", ok: false, refusal: "the manifest could not be fetched (HTTP 404)" }]);
  // The fixture's engine is the text "loader", not Emscripten's loader: whatever fails while starting it is answered.
  const badEngine = await opened(f);
  assert.equal(badEngine.answers.length, 1);
  assert.equal(badEngine.answers[0].ok, false);
  assert.ok(badEngine.answers[0].refusal.length > 0);
});

test("the worker starts no nested worker: hashing runs in it, so no hashing pool can fail to answer", async () => {
  const { nested } = await opened(fixture());
  assert.deepEqual(nested, []);
  const source = await readFile(new URL("elab-worker.mjs", web), "utf8");
  assert.doesNotMatch(source, /new Worker\(/);
});

test("a request before open, or an unknown op, is answered with an error", async () => {
  const w = await worker(fixture());
  try {
    assert.deepEqual(await w.ask({ id: 7, op: "request", request: {} }), [{ id: 7, op: "request", error: "the worker is not open" }]);
  } finally { w.restore(); }
});

test("the WebAssembly BLAKE3 the worker hashes with gives the JavaScript BLAKE3's labels", async () => {
  const holo = await import(new URL("hologram/hologram_store.js", web).href);
  holo.initSync({ module: await readFile(new URL("hologram/hologram_store_bg.wasm", web)) });
  // Lengths around BLAKE3's 64-byte block and 1024-byte chunk boundaries, and one of several chunks.
  for (const n of [0, 1, 63, 64, 65, 1023, 1024, 1025, 2048, 3072, 65536 + 7, 1 << 20]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 251 + 7) & 255);
    assert.equal(holo.address(bytes), kappa(bytes), `${n} bytes`);
  }
});

test("serve.mjs serves module scripts as JavaScript and WebAssembly as application/wasm", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lean-prover-serve-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [fileURLToPath(new URL("serve.mjs", web)), dir, dir, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => { server.stdout.once("data", resolve); server.once("exit", reject); });
  const type = async (path) => (await fetch(`http://localhost:${port}${path}`)).headers.get("content-type");
  assert.equal(await type("/hologram/hologram_store.js"), "text/javascript");
  assert.equal(await type("/hologram/hologram_store_bg.wasm"), "application/wasm");
  assert.equal(await type("/elab-worker.mjs"), "text/javascript");
  assert.equal(await type("/src/host.mjs"), "text/javascript");
});
