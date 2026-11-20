// Name the built judge files by content. Writes the BLAKE3 kappa label of each file the page loads,
// in kappa-registry's label form: blake3:<64 lowercase hex>. SHA-256 is kept as a checked field,
// because that is what prism-code emits today.
// Usage: node kappa_labels.mjs <dir the page serves the files from> <out json>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, out] = process.argv.slice(2);
const { kappa } = await import(pathToFileURL(join(dir, 'prism-code/src/blake3.mjs')).href);
const files = readdirSync(dir).filter((n) => n.endsWith('.rule-app.json') || n.endsWith('.holo')).sort();
const rows = {};
for (const name of files) {
  const bytes = readFileSync(join(dir, name));
  rows[name] = {
    kappa: kappa(new Uint8Array(bytes)),
    sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}
writeFileSync(out, JSON.stringify({ schema: 'prism-ide/gate-pins/1', files: rows }, null, 1) + '\n');
for (const [n, r] of Object.entries(rows)) console.log(n, r.kappa);
