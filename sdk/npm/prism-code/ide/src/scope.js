// Path and host scope, following the proved model in scope-kernel/src/Scope.lex.tex rule for rule.
//
// This file is NOT the proved kernel: the model is verified by Lean but not yet built into something a page can run,
// so this is a hand-written copy of its rules, tested against cases for each guarantee (tools/scope-test.mjs).
// `judge` below is the part that mirrors the model. `pathRequest` and `hostRequest` turn text into the model's
// numbers, which is the body's job in any case.

export const TARGET_SLOTS = 8;
export const SCOPE_SLOTS = 4;
const FIRST_NAME = 3; // 0 unused or empty, 1 "..", 2 ".", 3 and above are real names

// Mirrors Scope::judge. r = { depth, s: [..8], scopeDepth, p: [..4] }, all whole numbers.
export function judge(r) {
  const used = (depth, i) => !(depth < i); // slot i (from 1) is within the stated depth
  let targetNamed = true;
  for (let i = 1; i <= TARGET_SLOTS; i++) targetNamed &&= !used(r.depth, i) || FIRST_NAME <= r.s[i - 1];
  let scopeNamed = true;
  for (let j = 1; j <= SCOPE_SLOTS; j++) scopeNamed &&= !used(r.scopeDepth, j) || FIRST_NAME <= r.p[j - 1];
  const wellFormed = r.depth <= TARGET_SLOTS && 1 <= r.scopeDepth && r.scopeDepth <= SCOPE_SLOTS && targetNamed && scopeNamed;
  let prefixMatches = true;
  for (let j = 1; j <= SCOPE_SLOTS; j++) prefixMatches &&= !used(r.scopeDepth, j) || r.s[j - 1] === r.p[j - 1];
  return wellFormed && r.scopeDepth <= r.depth && prefixMatches ? 'inside' : 'outside';
}

// Equal strings get equal numbers; "" is 0, ".." is 1, "." is 2. Anything with a control character,
// a backslash or a percent sign is treated as empty, so an encoded or disguised ".." cannot pass as a name.
function request(target, scope) {
  const numbers = new Map([['', 0], ['..', 1], ['.', 2]]);
  const number = (text) => {
    if (/[\u0000-\u001f\\%]/.test(text)) return 0;
    if (!numbers.has(text)) numbers.set(text, numbers.size);
    return numbers.get(text);
  };
  const pad = (list, n) => Array.from({ length: n }, (_, i) => (i < list.length ? number(list[i]) : 0));
  // A list longer than the kernel can read keeps its true depth, so the kernel answers outside.
  return { depth: target.length, s: pad(target, TARGET_SLOTS), scopeDepth: scope.length, p: pad(scope, SCOPE_SLOTS) };
}

// "/workspace/a/b.txt" under "/workspace". One trailing slash is dropped; any other empty segment stays and is refused.
const pathSegments = (path) => path.replace(/^\//, '').replace(/\/$/, '').split('/');
export const pathRequest = (path, scope) => request(pathSegments(path), pathSegments(scope));
export const pathInside = (path, scope) => typeof path === 'string' && path.startsWith('/') && judge(pathRequest(path, scope)) === 'inside';

// "api.example.com" under "example.com": labels are read from the top-level domain inwards.
const hostLabels = (host) => host.toLowerCase().split('.').reverse();
export const hostRequest = (host, scope) => request(hostLabels(host), hostLabels(scope));
export const hostInside = (host, scope) => typeof host === 'string' && judge(hostRequest(host, scope)) === 'inside';
