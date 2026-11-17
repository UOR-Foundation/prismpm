/**
 * LexLean's front end as WebAssembly: the `lexlean` executable built for
 * `wasm32-wasip1` without its production data (LexLean SPEC §8.3 and §8.4,
 * `CL-25`, `CL-26`), run by Node's own `node:wasi`. It checks a model and
 * exports its semantic snapshot on this machine with no Docker, no toolchain
 * and no server. It starts no process of its own and takes no lock, so it
 * runs `check` and `snapshot`, never `verify`: Lean is not in it.
 *
 * The bytes are named by their UOR κ-label (BLAKE3) and used only when they have it,
 * whether they were just fetched or read from disk. They are kept under
 * `$PRISM_HOME/lexlean/`, or read from `PRISM_LEXLEAN_WASM` when that names a
 * file. Where they are fetched from is `LEXLEAN_WASM.url`, read through the
 * serverless boundary (hosts.mjs); while it is null, nothing is fetched.
 *
 * It runs in this process on wasi-memory.mjs, a WASI host over the project's
 * files held in memory: `node:wasi` lists no directory on Windows, and the
 * same host serves a browser. The module is compiled once per process, so
 * every check after the first pays only for the run.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { prismHome } from '../agents.mjs';
import { PrismCodeError } from '../errors.mjs';
import { kappa } from '../blake3.mjs';
import { buildFetch } from './hosts.mjs';
import { runWasi } from './wasi-memory.mjs';

/**
 * The pinned executable: LexLean at `commit`, built with
 * `cargo build --locked --release --target wasm32-wasip1 -p lexlean --bin lexlean --no-default-features`.
 * `kappa`, `sha256` and `bytes` are the uncompressed module's; `url` serves it gzipped, or is null while no public copy exists.
 */
export const LEXLEAN_WASM = Object.freeze({
  // UOR-Foundation/lexlean commit 9ba600d0 (draft PR #566: 0.4.3 with `lexlean snapshot`, CL-26). Two builds from clean
  // target directories gave these same bytes.
  commit: '9ba600d071b2bfa6ca990fd38d92a4c47fa9d39c',
  // The identity: the UOR κ-label of the module, BLAKE3. SHA-256 is a secondary digest, bound to it, never a key.
  kappa: 'blake3:4f302c18e02a46b0d015c57bd389a0754b301ec876aa7a637f786c4562274ecb',
  sha256: 'f76fa2aacdc96a0a977395b9889b0eb659942d0fbfe7af4d0aac62c18b25d6d5',
  bytes: 19133367,
  gzipKappa: 'blake3:e79126591773b1f721af3ad911b73d46bceb4c4d6453e4dda04814efeee60f83',
  gzipBytes: 4140342,
  // No public copy yet: publishing one is a release the user approves. Until then PRISM_LEXLEAN_WASM names these bytes.
  url: null,
});


/** The folder the executable is kept in. */
export const lexleanDirectory = (env = process.env) => join(prismHome(env), 'lexlean');

/** The pin to hold the bytes to: the package's, or the one a caller names (a test, or a build of LexLean being tried). */
const pinOf = (pin) => pin ?? LEXLEAN_WASM;

/** Files already found to have the pinned κ-label in this process, by path, size and change time: BLAKE3 in JavaScript takes about 0.7 s on these 19 MB. */
const verified = new Map();

/** The file a κ-label is kept under. */
const keptName = (label) => `${label.slice('blake3:'.length)}.wasm`;

/**
 * The executable's file, checked against its pin's κ-label, or null when it is
 * not on this machine. `PRISM_LEXLEAN_WASM` names a file to use in place of
 * the kept one; it is held to the same pin. Bytes are re-derived the first
 * time a file is read in a process, and again whenever its size or change
 * time moves.
 */
export function lexleanWasmFile({ env = process.env, pin = null } = {}) {
  const want = pinOf(pin);
  if (!want.kappa) return null;
  const file = env.PRISM_LEXLEAN_WASM ? resolve(env.PRISM_LEXLEAN_WASM) : join(lexleanDirectory(env), keptName(want.kappa));
  if (!existsSync(file)) return null;
  const stat = statSync(file);
  const seen = `${want.kappa} ${stat.size} ${stat.mtimeMs}`;
  if (verified.get(file) === seen) return file;
  const got = kappa(readFileSync(file));
  if (got !== want.kappa) throw new PrismCodeError('lexlean.wasm-mismatch', `${file} is ${got}, not the pinned ${want.kappa}`);
  verified.set(file, seen);
  return file;
}

/** Whether LexLean's front end can run here now, as WebAssembly. */
export function hasLexleanWasm(options = {}) {
  try {
    return lexleanWasmFile(options) !== null;
  } catch {
    return false;
  }
}

/**
 * Make sure the executable is on this machine, fetching it once when the pin
 * names where. Resolves its file. Throws `lexlean.wasm-mismatch` for bytes
 * that are not the pinned ones, and `lexlean.wasm-unavailable` when there is
 * nowhere to fetch it from.
 */
export async function ensureLexleanWasm({ env = process.env, pin = null, fetch = globalThis.fetch, log = () => {} } = {}) {
  const want = pinOf(pin);
  const kept = lexleanWasmFile({ env, pin: want });
  if (kept) return kept;
  if (!want.url || !want.kappa) throw new PrismCodeError('lexlean.wasm-unavailable', 'no public copy of LexLean as WebAssembly is pinned in this prism-code yet, and PRISM_LEXLEAN_WASM names no file');
  log(`Fetching LexLean's front end as WebAssembly once (about ${Math.round((want.gzipBytes ?? 4e6) / 1e6)} MB); it is checked against its κ-label.`);
  const response = await buildFetch({ fetch })(want.url);
  if (!response.ok) throw new PrismCodeError('lexlean.wasm-unavailable', `${want.url} answered HTTP ${response.status}`);
  const bytes = gunzipSync(new Uint8Array(await response.arrayBuffer()));
  const got = kappa(bytes);
  if (got !== want.kappa) throw new PrismCodeError('lexlean.wasm-mismatch', `${want.url} gave a module that is ${got}, not the pinned ${want.kappa}`);
  const directory = lexleanDirectory(env);
  mkdirSync(directory, { recursive: true });
  const partial = join(directory, `${keptName(want.kappa)}.${process.pid}.partial`);
  writeFileSync(partial, bytes);
  renameSync(partial, join(directory, keptName(want.kappa)));
  return join(directory, keptName(want.kappa));
}

/** Folders a check never reads: build outputs, caches and version control. */
const SKIPPED = new Set(['.lexlean', '.lake', '.prism', '.git', 'target', 'node_modules']);

/** The project's files as the instance sees them: `/`-rooted paths to bytes. */
export function projectFiles(projectDir) {
  const files = new Map();
  const visit = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) visit(join(dir, entry.name), `${rel}/${entry.name}`);
      } else if (entry.isFile()) files.set(`${rel}/${entry.name}`, new Uint8Array(readFileSync(join(dir, entry.name))));
    }
  };
  visit(resolve(projectDir), '');
  return files;
}

const compiled = new Map();

/** The compiled module of the file, compiled once per process. */
function moduleOf(file) {
  if (!compiled.has(file)) compiled.set(file, WebAssembly.compile(readFileSync(file)));
  return compiled.get(file);
}

/**
 * Run `lexlean <args>` on the project at `projectDir` as WebAssembly. Resolves
 * `{ exit, stdout, stderr, ms }`, stdout as bytes. Only `check` and `snapshot`
 * are run here: a command that changes the project is refused by LexLean on
 * WASI (`LLV7010`), and the file system it sees is read only.
 */
export async function runLexleanWasm(projectDir, args, { env = process.env, pin = null } = {}) {
  const file = lexleanWasmFile({ env, pin });
  if (!file) throw new PrismCodeError('lexlean.wasm-unavailable', 'LexLean as WebAssembly is not on this machine');
  const started = performance.now();
  const r = await runWasi(await moduleOf(file), { files: projectFiles(projectDir), args });
  return { exit: r.exit, stdout: Buffer.from(r.stdout), stderr: Buffer.from(r.stderr).toString('utf8'), ms: Math.round(performance.now() - started) };
}

/** `lexlean --diagnostic-format json check --all`: the command result, parsed. */
export async function wasmCheck(projectDir, options = {}) {
  const r = await runLexleanWasm(projectDir, ['--diagnostic-format', 'json', 'check', '--all'], options);
  let result;
  try {
    result = JSON.parse(r.stdout.toString('utf8'));
  } catch {
    throw new PrismCodeError('lexlean.wasm-failed', `LexLean as WebAssembly gave no command result (exit ${r.exit}): ${r.stderr.slice(0, 400)}`);
  }
  return { ...result, ms: r.ms };
}

/**
 * `lexlean snapshot --all`: the model's `lexlean/semantic-snapshot/2`, with its
 * exact bytes and their κ-label. A model LexLean refuses
 * resolves `{ ok: false, check }` with the command result of `check`.
 */
export async function wasmSnapshot(projectDir, options = {}) {
  const r = await runLexleanWasm(projectDir, ['snapshot', '--all'], options);
  if (r.exit !== 0) return { ok: false, check: await wasmCheck(projectDir, options), ms: r.ms };
  return { ok: true, bytes: r.stdout, kappa: kappa(r.stdout), snapshot: JSON.parse(r.stdout.toString('utf8')), ms: r.ms };
}
