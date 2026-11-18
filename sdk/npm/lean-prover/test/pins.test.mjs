import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { kappa } from "../src/vendor/blake3.mjs";

const pkg = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, pkg));
const lock = JSON.parse(read("engine.lock.json"));

test("the Lean patch is the pinned one, and it changes nothing in the kernel but one diagnostics declaration", () => {
  assert.equal(kappa(read(lock.patch.path)), lock.patch.kappa);
  const patch = read(lock.patch.path).toString("utf8");
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => [m[1], m[2]]);
  for (const [a, b] of files) assert.equal(a, b, "no file is moved");
  assert.deepEqual(files.map(([a]) => a).filter((f) => f.startsWith("src/kernel/")), ["src/kernel/environment.cpp"]);
  const section = patch.slice(patch.indexOf("diff --git a/src/kernel/environment.cpp")).split(/\ndiff --git /)[0];
  const changed = section.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
  assert.equal(changed.length, 2, changed.join("\n"));
  assert.match(changed[0], /^-.*uint8\s*\*.*lean_kernel_diag_is_enabled\(/);
  assert.match(changed[1], /^\+.*uint8\s.*lean_kernel_diag_is_enabled\(/);
});

test("the driver is pinned by BLAKE3 label and no Lean source is committed in the package", () => {
  assert.deepEqual(Object.keys(lock.driver.files).sort(), ["Elab.lean", "SymList.lean"]);
  for (const f of Object.values(lock.driver.files)) assert.match(f.kappa, /^blake3:[0-9a-f]{64}$/);
  const walk = (u) =>
    readdirSync(u, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(new URL(e.name + "/", u))) : [e.name]);
  assert.deepEqual(walk(pkg).filter((n) => n.endsWith(".lean")), []);
});

test("Emscripten is pinned by version and checksum in tools.lock", () => {
  const tools = readFileSync(new URL("../../../tools.lock", pkg), "utf8").replace(/\r/g, "");
  const emsdk = tools.slice(tools.indexOf("\n[emsdk]"));
  assert.match(emsdk, /\nversion = "6\.0\.13"\n/);
  assert.match(emsdk, /\nsha256 = "[0-9a-f]{64}"\n/);
  assert.match(emsdk, /\nurl = "https:\/\/storage\.googleapis\.com\/webassembly\/emscripten-releases-builds\/linux\/[0-9a-f]{40}\/wasm-binaries\.tar\.xz"\n/);
});

test("the engine's cache key is one BLAKE3 label over its inputs, stable across runs", () => {
  const script = fileURLToPath(new URL("build/engine-label.mjs", pkg));
  const run = () => execFileSync(process.execPath, [script], { encoding: "utf8" }).trim();
  const a = run();
  assert.match(a, /^blake3:[0-9a-f]{64}$/);
  assert.equal(run(), a);
});

test("the BLAKE3 this package carries is prism-code's, byte for byte", () => {
  assert.deepEqual(read("src/vendor/blake3.mjs"), readFileSync(new URL("../prism-code/src/blake3.mjs", pkg)));
});
