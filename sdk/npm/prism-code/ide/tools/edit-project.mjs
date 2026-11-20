// What the edit page is told about a LexLean project: the files a check reads, and the file that is opened.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Everything but build outputs, caches, and this repository's notes and generators. Nothing whose name starts with
// a dot is listed either: a check does not read such a file, and a static host such as GitHub Pages does not
// publish one, so listing it makes the page ask for a file that is not there.
const SKIPPED = new Set(['target', 'node_modules', 'tools']);

/** { files: ['lexlean.toml', 'src/App.lex.tex', ...], entry: 'src/App.lex.tex' } for the project in `dir`. */
export function projectListing(dir) {
  const files = [];
  const visit = (at, rel) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) { if (!SKIPPED.has(entry.name)) visit(join(at, entry.name), rel + entry.name + '/'); }
      else if (entry.isFile() && !/\.(md|json)$/.test(entry.name) || entry.name === 'lake-manifest.json') files.push(rel + entry.name);
    }
  };
  visit(dir, '');
  const entry = /entrypoints\s*=\s*\[\s*"([^"]+)"/.exec(readFileSync(join(dir, 'lexlean.toml'), 'utf8'))?.[1];
  if (!entry) throw new Error(`${join(dir, 'lexlean.toml')} names no entrypoint`);
  return { files: files.sort(), entry };
}
