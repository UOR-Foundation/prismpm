// Assemble the audit view as static files any host can serve: the page, the prism-code it runs, and the rule judge
// archive the audit-status model needs. Nothing is compiled or fetched; every file is copied from this checkout.
// Usage: node tools/build-audit-site.mjs <out dir> [commit]
//
//   <out>/index.html                 sends a visitor to audit/
//   <out>/audit/                     the page (ide/audit)
//   <out>/audit/prism-code/          prism-code's src, as the page imports it
//   <out>/audit/judge/kernel.holo    the rule judge archive (test/fixtures/kernel)
//   <out>/audit/site.json            what was copied, from which commit, each file with its SHA-256
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [outArg, commit = 'unknown'] = process.argv.slice(2);
if (!outArg) { console.error('usage: node tools/build-audit-site.mjs <out dir> [commit]'); process.exit(64); }
const ide = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(ide, '..');
const out = resolve(outArg);
const site = join(out, 'audit');

rmSync(out, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
cpSync(join(ide, 'audit'), site, { recursive: true });
// Only code: the page imports modules, never the studio's pages or anything else under src.
cpSync(join(pkg, 'src'), join(site, 'prism-code'), { recursive: true, filter: (p) => statSync(p).isDirectory() || /\.(mjs|js)$/.test(p) });
mkdirSync(join(site, 'judge'));
cpSync(join(pkg, 'test', 'fixtures', 'kernel', 'kernel.holo'), join(site, 'judge', 'kernel.holo'));
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Prism audit</title><meta http-equiv="refresh" content="0; url=audit/"><a href="audit/">Prism audit</a>\n');
// GitHub Pages runs Jekyll unless told not to, and Jekyll drops some paths.
writeFileSync(join(out, '.nojekyll'), '');

const files = [];
const walk = (dir) => { for (const name of readdirSync(dir).sort()) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk(site);
const listing = files.map((p) => ({ path: relative(site, p).split('\\').join('/'), bytes: statSync(p).size, sha256: createHash('sha256').update(readFileSync(p)).digest('hex') }));
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
writeFileSync(join(site, 'site.json'), JSON.stringify({ schema: 'prism-ide/audit-site/1', prismCode: version, commit, files: listing }, null, 1) + '\n');
const total = listing.reduce((n, f) => n + f.bytes, 0);
console.log(`audit site: ${listing.length} files, ${(total / 1024).toFixed(0)} KiB, prism-code ${version}, commit ${commit}`);
