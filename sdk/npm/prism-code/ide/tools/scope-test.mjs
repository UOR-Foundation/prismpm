// Cases for src/scope.js, grouped by the guarantee of scope-kernel/src/ScopeProofs.lex.tex each one exercises.
// Usage: node tools/scope-test.mjs
// The package is CommonJS by default and Vite reads src/*.js as modules, so load the file's text as a module here.
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/scope.js', import.meta.url), 'utf8');
const { pathInside, hostInside, judge, TARGET_SLOTS } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const cases = [
  // inside
  ['path', '/workspace/a.txt', '/workspace', true, 'a file in the scope'],
  ['path', '/workspace/a/b/c/d/e/f/g', '/workspace', true, 'deepest readable path (8 segments)'],
  ['path', '/workspace', '/workspace', true, 'the scope folder itself'],
  ['path', '/workspace/', '/workspace', true, 'one trailing slash'],
  ['path', '/User/globalStorage/pub.ext/state.json', '/User/globalStorage/pub.ext', true, 'storage folder, 3-segment scope'],
  // 1. unnamed segment
  ['path', '/workspace/../secret/token.txt', '/workspace', false, '.. after the scope'],
  ['path', '/workspace/a/../../secret', '/workspace', false, '.. deeper'],
  ['path', '/workspace/./a.txt', '/workspace', false, '. segment'],
  ['path', '/workspace//a.txt', '/workspace', false, 'empty segment'],
  ['path', '/workspace/%2e%2e/secret', '/workspace', false, 'percent-encoded ..'],
  ['path', '/workspace/..\\secret', '/workspace', false, 'backslash'],
  // 2. too deep
  ['path', '/workspace/a/b/c/d/e/f/g/h', '/workspace', false, '9 segments'],
  // 3. shorter than the scope
  ['path', '/User/globalStorage', '/User/globalStorage/pub.ext', false, 'parent of the scope'],
  ['path', '/', '/workspace', false, 'the root'],
  // 4. empty or too-deep scope
  ['path', '/workspace/a.txt', '/', false, 'empty scope'],
  ['path', '/a/b/c/d/e/f', '/a/b/c/d/e', false, '5-segment scope'],
  // 5. mismatch
  ['path', '/secret/token.txt', '/workspace', false, 'another folder'],
  ['path', '/workspace2/a.txt', '/workspace', false, 'a name that only starts the same'],
  ['path', '/User/globalStorage/other.ext/x', '/User/globalStorage/pub.ext', false, "another extension's storage"],
  ['path', 'workspace/a.txt', '/workspace', false, 'not absolute'],
  // hosts
  ['host', 'api.example.com', 'example.com', true, 'a subdomain'],
  ['host', 'example.com', 'example.com', true, 'the host itself'],
  ['host', 'EXAMPLE.com', 'example.com', true, 'case'],
  ['host', 'evil-example.com', 'example.com', false, 'a name that only ends the same'],
  ['host', 'example.com.evil.net', 'example.com', false, 'the scope as a prefix label'],
  ['host', 'com', 'example.com', false, 'parent of the scope'],
  ['host', 'api..example.com', 'example.com', false, 'empty label'],
];

let failed = 0;
for (const [kind, target, scope, want, why] of cases) {
  const got = kind === 'path' ? pathInside(target, scope) : hostInside(target, scope);
  if (got !== want) { failed++; console.log(`FAIL ${kind} ${target} in ${scope}: got ${got}, want ${want} (${why})`); }
}
// 8. anything under an inside target is inside, up to the depth the kernel reads
let path = '/workspace';
for (let depth = 2; depth <= TARGET_SLOTS; depth++) {
  path += '/n' + depth;
  if (!pathInside(path, '/workspace')) { failed++; console.log('FAIL child ' + path); }
}
// 7. the answer is one of two words
if (!['inside', 'outside'].includes(judge({ depth: 0, s: Array(8).fill(0), scopeDepth: 0, p: Array(4).fill(0) }))) failed++;
console.log(failed ? `${failed} failed` : `all ${cases.length + TARGET_SLOTS - 1 + 1} cases pass`);
process.exit(failed ? 1 : 0);
