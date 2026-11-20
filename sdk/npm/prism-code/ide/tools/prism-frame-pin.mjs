#!/usr/bin/env node
// Copies the Prism frame and Prism id, byte for byte, from UOR-Foundation/template
// at one commit into public/prism-frame/ and dist/prism-frame/, and writes PIN.json.
// Every file the template's frame.lock lists is checked against that lock.
//   node tools/prism-frame-pin.mjs            fetch with gh (read only), write, record
//   node tools/prism-frame-pin.mjs --check    re-hash the copies against PIN.json, no network
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "UOR-Foundation/template";
const COMMIT = "b64cc73c94773ed5bcc9d0549b1ae2c836fa1e0b";
const FILES = [
  "frame.lock",
  "frame/frame.mjs",
  "frame/frame.css",
  "frame/panels.mjs",
  "frame/panels.css",
  "identity/prism-id.mjs",
  "identity/stitch.lock",
  "identity/PROTOCOL.md",
  "site/brand/hologram-warm.css",
];
const spike = fileURLToPath(new URL("../", import.meta.url));
const targets = ["public/prism-frame", "dist/prism-frame"].map((dir) => join(spike, dir));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (process.argv.includes("--check")) {
  const pin = JSON.parse(readFileSync(join(targets[0], "PIN.json"), "utf8"));
  let bad = 0;
  for (const target of targets) {
    for (const file of pin.files) {
      const bytes = readFileSync(join(target, file.path));
      const ok = sha(bytes) === file.sha256 && bytes.length === file.size;
      if (!ok) bad += 1;
      console.log(`${ok ? "ok  " : "DIFF"} ${join(target, file.path)}`);
    }
  }
  process.exit(bad ? 1 : 0);
}

const fetched = FILES.map((path) => ({
  path,
  bytes: execFileSync("gh", ["api", `repos/${REPO}/contents/${path}?ref=${COMMIT}`, "-H", "Accept: application/vnd.github.raw"], { maxBuffer: 64 << 20 }),
}));
const lock = JSON.parse(fetched.find((f) => f.path === "frame.lock").bytes.toString("utf8"));
const locked = new Map(lock.files.map((f) => [f.path, f.sha256]));
const files = fetched.map(({ path, bytes }) => {
  const sha256 = sha(bytes);
  const inLock = locked.has(path);
  if (inLock && locked.get(path) !== sha256) throw new Error(`${path} is ${sha256}, frame.lock says ${locked.get(path)}`);
  return { path, size: bytes.length, sha256, frameLock: inLock ? "match" : "not listed" };
});
const pin = { repository: REPO, commit: COMMIT, frameLockSpec: lock.spec, note: "Unmodified copies. Nothing is baked: frame.mjs imports ./panels.mjs, which imports ../identity/prism-id.mjs.", files };
for (const target of targets) {
  for (const { path, bytes } of fetched) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), bytes);
  }
  writeFileSync(join(target, "PIN.json"), JSON.stringify(pin, null, 2) + "\n");
}
for (const f of files) console.log(`${f.sha256}  ${String(f.size).padStart(7)}  ${f.frameLock.padEnd(10)}  ${f.path}`);
