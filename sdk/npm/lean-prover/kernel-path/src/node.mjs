// The prover in Node: the same prover, kernel worker and store as in a browser, started from files on disk.
//
//     import { open } from "./src/node.mjs";
//     const prover = await open();                    // { storeDir, kernels, proofs } are optional
//     const result = await prover.prove(moduleText);
//     await prover.close();
//
// As in the tab, nothing runs unverified: every file is checked against the pin before it is used.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { openProver } from "./prover.mjs";
import { memory, folder } from "./store.mjs";
import * as holo from "../hologram/hologram_store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let hashing = false;

/** Reads the pin and every file it names, refusing any that does not match. Returns { pin, env, files, holo }. */
export function verified(dir = root) {
  const read = (p) => new Uint8Array(fs.readFileSync(path.join(dir, p)));
  const pinBytes = read("pin.json"), pin = JSON.parse(new TextDecoder().decode(pinBytes)), files = new Map();
  for (const [p, label] of Object.entries(pin.bootstrap)) {
    const b = read(p);
    if ("sha256:" + createHash("sha256").update(b).digest("hex") !== label) throw new Error(`refused ${p}: it does not match the pin`);
    files.set(p, b);
  }
  if (!hashing) { holo.initSync({ module: files.get("hologram/hologram_store_bg.wasm") }); hashing = true; }
  for (const [p, a] of Object.entries(pin.assets)) {
    const b = files.get(p) || (a.encoding === "gzip" ? new Uint8Array(gunzipSync(read(a.file))) : read(p)); // labelled by the decoded bytes
    if (holo.address(b) !== a.kappa) throw new Error(`refused ${p}: it does not match the pin`);
    files.set(p, b);
  }
  return { pin, env: holo.address(pinBytes), files, holo };
}

/** Published proofs for a project: an index file beside its packs. Untrusted: packs are checked by label, then judged. */
export function publishedProofs(indexFile) {
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8")), dir = path.dirname(indexFile), byTheorem = new Map();
  for (const p of index.packs) for (const n of p.theorems) byTheorem.set(n, p);
  return { byTheorem, axioms: new Map(Object.entries(index.axioms || {})), fetch: async (p) => { const b = new Uint8Array(fs.readFileSync(path.join(dir, p.file))); if (holo.address(b) !== p.kappa) throw new Error(`refused ${p.file}: it does not match its label`); return new TextDecoder().decode(b); } };
}

export async function open({ storeDir, kernels = Math.max(1, Math.min(8, os.cpus().length - 2)), proofs = null } = {}) {
  const v = verified();
  const spawn = () => {
    const w = new Worker(path.join(root, "src/worker.mjs")), h = { post: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null };
    w.on("message", (m) => h.onmessage && h.onmessage(m)); w.on("error", (e) => h.onerror && h.onerror(e));
    return h;
  };
  const prover = await openProver({
    env: v.env, library: v.files.get("library/library.ndjson"), kernel: v.files.get("kernel/lean-kernel.wasm"), hasher: v.files.get("hologram/hologram_store_bg.wasm"),
    address: holo.address, store: storeDir ? folder(holo, storeDir, fs, path) : memory(holo), spawn, kernels,
    proofs: typeof proofs === "string" ? publishedProofs(proofs) : proofs,
  });
  return { ...prover, pin: v.pin };
}
