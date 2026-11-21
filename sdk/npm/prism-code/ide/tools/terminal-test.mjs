// The terminal's command line asks the proved tables and obeys them. Tested here, in Node, with no browser:
// the tables are read from the models as the published page gets them, and the programs are stand-ins that count
// how often they are started.
// Usage: node tools/terminal-test.mjs
import assert from 'node:assert/strict';
import { kappa } from '../../src/blake3.mjs';
import { reuseAdmits } from '../../src/journey/kappa-rules.mjs';
import { judgeTable } from '../../src/journey/rule-table.mjs';
import { cleanTitle, createEffects, schemeOf } from '../edit/terminal/effects.mjs';
import { createKeptIn, indexOf, materialize, openStore } from '../edit/terminal/kappa-space.mjs';
import { createKept, createLineEditor, createSession, createWriter, makeJudge, resolveTarget, visible } from '../edit/terminal/session.mjs';
import { terminalTables, vendorFiles } from './terminal-site.mjs';

const { tables, luts } = await terminalTables();
// The tests ask the tables as the pages do: through their lookup tables where they have one.
const made = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, materialize(table, judgeTable, kappa)]).filter(([, lut]) => lut));
const judge = makeJudge(tables, judgeTable, made);
const dec = new TextDecoder();
let passed = 0;
const test = async (name, body) => { await body(); passed++; console.log('ok  ' + name); };

/** A session over a small model, with stand-in programs. `bytes` is what the executables turn out to be. */
function setup({ bytes = 'pinned', kept = createKept(), output = null } = {}) {
  const model = new Map([['/lexlean.toml', 'spec = "x"\n'], ['/src/App.lex.tex', 'model\n'], ['/src/evil.txt', 'before\x1b]52;c;aGVsbG8=\x07after\n']]);
  const shown = [];
  const started = { check: 0, snapshot: 0, prove: 0, audit: 0 };
  const writer = createWriter({ judge, sink: (part, done) => { shown.push(dec.decode(part)); done(); } });
  const programs = Object.fromEntries(Object.keys(started).map((name) => [name, async (project) => { started[name]++; return { text: output ?? `${name} of ${Object.keys(project).length} files` }; }]));
  const session = createSession({ judge, writer, files: () => model, bytesOf: async () => bytes, labelOf: (c) => (c in started ? 'blake3:' + '1'.repeat(64) : null), programs, kappa, reuseAdmits, kept, clear: () => shown.push('<clear>') });
  return { session, model, started, kept, text: () => shown.join('') };
}

await test('xterm.js as installed is the pinned xterm.js', async () => {
  assert.deepEqual([...vendorFiles().keys()].sort(), ['addon-fit.mjs', 'addon-search.mjs', 'addon-unicode11.mjs', 'addon-web-links.mjs', 'addon-webgl.mjs', 'xterm.css', 'xterm.mjs']);
});

await test('a word that is not listed is refused, and nothing runs', async () => {
  const t = setup();
  for (const line of ['rm -rf /', 'bash', 'curl https://example.org', 'sh -c check', 'check; ls']) assert.equal(await t.session.run(line), 'refuse', line);
  assert.deepEqual(t.started, { check: 0, snapshot: 0, prove: 0, audit: 0 });
  assert.match(t.text(), /rm: not a command here/);
});

await test('a path outside the open model is refused, whatever the command', async () => {
  const t = setup();
  for (const line of ['cat ../secret', 'cat /etc/passwd', 'cat C:\\Windows\\win.ini', 'kappa https://example.org/x', 'check ../other', 'ls ..']) assert.equal(await t.session.run(line), 'refuse', line);
  assert.equal(t.started.check, 0);
  assert.equal(resolveTarget('src/../src/App.lex.tex', t.model).file, '/src/App.lex.tex');
});

await test('a program whose bytes are not the pinned ones, or are absent, never runs', async () => {
  for (const bytes of ['mismatch', 'absent']) {
    const t = setup({ bytes });
    for (const line of ['check', 'snapshot', 'prove', 'audit', 'lexlean check']) assert.equal(await t.session.run(line), 'refuse', `${line} with ${bytes}`);
    assert.deepEqual(t.started, { check: 0, snapshot: 0, prove: 0, audit: 0 });
    // The builtins start no executable, so they still answer.
    assert.equal(await t.session.run('ls'), 'builtin');
  }
});

await test('the same program on the same model is answered from what was kept, and only then', async () => {
  const t = setup();
  assert.equal(await t.session.run('check'), 'run');
  assert.equal(await t.session.run('check'), 'reuse');
  assert.equal(t.started.check, 1);
  assert.match(t.text(), /kept output blake3:[0-9a-f]{12}…, shown again; nothing was run/);
  // Another program has its own key.
  assert.equal(await t.session.run('snapshot'), 'run');
  // A changed model is another input: the kept output is not for it.
  t.model.set('/src/App.lex.tex', 'model, edited\n');
  assert.equal(await t.session.run('check'), 'run');
  assert.equal(t.started.check, 2);
});

await test('a kept output whose bytes were changed is not shown again', async () => {
  const t = setup();
  await t.session.run('check');
  // The key is the label of the program's label and the label of everything it read.
  const enc = new TextEncoder();
  const input = kappa(enc.encode(JSON.stringify([...t.model.keys()].sort().map((p) => [p, t.model.get(p)]))));
  const found = t.kept.get(kappa(enc.encode(JSON.stringify(['prism/terminal-output/1', 'check', 'blake3:' + '1'.repeat(64), input]))));
  assert.ok(found, 'the output was kept under the key of its program and input');
  // Change one byte of what is kept, as a fault in the store would.
  found.bytes[0] ^= 1;
  assert.equal(await t.session.run('check'), 'run');
  assert.equal(t.started.check, 2);
});

await test('a printed file cannot send a sequence to the terminal', async () => {
  const t = setup();
  assert.equal(await t.session.run('cat src/evil.txt'), 'builtin');
  assert.ok(!t.text().includes('\x1b'), 'no escape byte reaches the terminal');
  assert.match(t.text(), /before\^\[\]52;c;aGVsbG8=\^Gafter/);
  assert.equal(visible('a\x9bb\x7f'), 'a\\x9bb^?');
});

await test('a command uses only what the reach table allows it', async () => {
  const t = setup();
  for (const line of ['help', 'ls', 'cat lexlean.toml', 'kappa lexlean.toml', 'check', 'check', 'prove', 'audit']) await t.session.run(line);
  const uses = t.session.log.filter((e) => e.resource);
  assert.ok(uses.length > 10);
  for (const use of uses) assert.equal(use.answer, 'allow', `${use.command} ${use.resource}`);
  const by = (command) => new Set(uses.filter((u) => u.command === command).map((u) => u.resource));
  assert.deepEqual([...by('help')], ['screen']);
  assert.deepEqual([...by('cat')].sort(), ['readmodel', 'screen']);
  assert.deepEqual([...by('check')].sort(), ['readmodel', 'readstore', 'screen', 'writestore']);
  // Nothing in the session can even name these; the table would deny them all the same.
  for (const resource of ['network', 'clipboard', 'process', 'writemodel']) for (const command of t.session.commands()) assert.equal(judge('reach', { command, resource }), 'deny');
});

await test('output is held at the high mark and released at the low one', async () => {
  const waiting = [];
  let delivered = 0;
  const writer = createWriter({ judge, sink: (part, done) => { waiting.push(() => { delivered += part.length; done(); }); } });
  // The terminal "draws" one piece every turn of the loop, slower than the command writes.
  const drain = setInterval(() => waiting.shift()?.(), 0);
  const text = 'x'.repeat(2 * 1024 * 1024);
  await writer.write(text);
  while (waiting.length) await new Promise((r) => setTimeout(r, 1));
  clearInterval(drain);
  assert.equal(delivered, text.length);
  assert.ok(writer.state.holds > 0, 'the writer was held');
  assert.ok(writer.state.peak <= 99999 + 16384, `at most the high mark and one piece were pending, not ${writer.state.peak}`);
});

await test('a terminal that acknowledges in batches does not strand the writer', async () => {
  // The workbench's terminal acknowledges characters, 5000 at a time, and never the remainder.
  const waiting = [];
  let unsent = 0;
  let fired = 0;
  const ack = (count) => { let left = count; while (left > 0 && waiting.length) { const head = waiting[0]; const took = Math.min(left, head[0]); head[0] -= took; left -= took; head[1](took); if (head[0] === 0) waiting.shift(); } };
  const writer = createWriter({ judge, sink: (part, drained) => {
    waiting.push([part.length, drained]);
    fired += part.length;
    setTimeout(() => { unsent += part.length; while (unsent >= 5000) { unsent -= 5000; ack(5000); } }, 0);
    return part.length;
  } });
  const text = 'y'.repeat(1024 * 1024 + 4688);
  const finished = await Promise.race([writer.write(text), new Promise((r) => setTimeout(() => r('stuck'), 4000))]);
  assert.equal(finished, true, 'the write finished');
  assert.equal(fired, text.length);
  assert.ok(writer.state.peak <= 99999 + 16384);
});

await test('an interrupted command writes nothing more', async () => {
  const waiting = [];
  let delivered = 0;
  const writer = createWriter({ judge, sink: (part, done) => { waiting.push(() => { delivered += part.length; done(); }); } });
  const writing = writer.write('x'.repeat(1024 * 1024));
  await new Promise((r) => setTimeout(r, 5));
  writer.stop();
  assert.equal(await writing, false);
  for (const go of waiting) go();
  assert.ok(delivered < 200000);
});

await test('what acts outside the grid is ignored, or asked about after a click', async () => {
  const asked = [];
  const opened = [];
  let yes = true;
  const effects = createEffects({ judge, ui: { setTitle() {}, confirm: async (text) => { asked.push(text); return yes; }, open: (uri) => opened.push(uri) } });
  for (const effect of ['other', 'clipboardwrite', 'clipboardread', 'notify', 'transfer', 'window']) for (const gesture of [false, true]) assert.equal(effects.decide(effect, { gesture }), 'ignore', effect);
  // Output, or a script, cannot open a link: only the browser's word that the user clicked counts.
  await effects.link({ isTrusted: false }, 'https://example.org/');
  await effects.link(undefined, 'https://example.org/');
  for (const uri of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.org/', 'data:text/html,x', 'example.org']) await effects.link({ isTrusted: true }, uri);
  assert.deepEqual([asked.length, opened.length], [0, 0]);
  await effects.link({ isTrusted: true }, 'https://example.org/a');
  assert.equal(asked.length, 1);
  assert.match(asked[0], /https:\/\/example\.org\/a/);
  assert.deepEqual(opened, ['https://example.org/a']);
  yes = false;
  await effects.link({ isTrusted: true }, 'https://example.org/b');
  assert.equal(opened.length, 1, 'a refused question opens nothing');
  // Paste: only the user's own, and more than one line only after the question.
  assert.equal(await effects.paste({ isTrusted: false }, 'check'), null);
  assert.deepEqual(await effects.paste({ isTrusted: true }, 'check'), { text: 'check' });
  assert.equal(await effects.paste({ isTrusted: true }, 'check\nprove\n'), null);
  yes = true;
  assert.deepEqual(await effects.paste({ isTrusted: true }, 'check\nprove\n'), { lines: ['check', 'prove'] });
  assert.equal(schemeOf('HTTPS://x'), 'https');
  assert.equal(cleanTitle('a\x1b[31m' + 'b'.repeat(200)).length, 80);
});

await test('keys become lines', async () => {
  const echoed = [];
  const lines = [];
  const editor = createLineEditor({ echo: (t) => echoed.push(t), submit: async (line) => { lines.push(line); }, interrupt() {}, clear() {}, commands: () => ['check', 'cat', 'snapshot'] });
  editor.start();
  for (const key of ['l', 's', 'x', '\x7f', '\r']) await editor.feed(key);
  for (const key of ['s', 'n', '\t', '\r']) await editor.feed(key);
  await editor.feed('\x1b[A');
  await editor.feed('\x1b[A');
  await editor.feed('\r');
  for (const key of ['a', '\x03', '\x1b[D', '\x1b]52;c;eA==\x07', '\r']) await editor.feed(key);
  assert.deepEqual(lines, ['ls', 'snapshot ', 'ls', '']);
  assert.ok(!echoed.join('').includes('\x1b]'), 'a sequence typed or pasted in is not echoed as one');
});

await test('keys typed while a command runs are entered after it', async () => {
  const lines = [];
  let release;
  const editor = createLineEditor({ echo() {}, submit: (line) => { lines.push(line); return new Promise((r) => { release = r; }); }, interrupt() {}, clear() {}, commands: () => [] });
  for (const key of ['a', '\r']) editor.feed(key);
  for (const key of ['b', 'c', '\r', 'd']) editor.feed(key);
  assert.deepEqual(lines, ['a']);
  release();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(lines, ['a', 'bc']);
  // Ctrl+C drops what was typed ahead.
  for (const key of ['e', '\r', '\x03']) editor.feed(key);
  release();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(lines, ['a', 'bc']);
});

/** A directory handle as the origin's private file system gives one, held in memory. `files` is what is on "disk". */
function fakeDirectory(files = new Map(), dirs = new Map()) {
  const gone = () => { throw new DOMException('not found', 'NotFoundError'); };
  return {
    files, dirs,
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name) && !create) gone();
      return {
        async getFile() { if (!files.has(name)) gone(); const bytes = files.get(name); return { arrayBuffer: async () => bytes.slice().buffer }; },
        async createWritable() { let next = null; return { async write(bytes) { next = new Uint8Array(bytes); }, async close() { files.set(name, next); } }; },
      };
    },
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!dirs.has(name)) { if (!create) gone(); dirs.set(name, fakeDirectory()); }
      return dirs.get(name);
    },
  };
}

await test('each finite table as a lookup table answers every request as its rules do', async () => {
  assert.deepEqual(Object.keys(made).sort(), ['audit', 'commands', 'effects', 'reach']);
  let requests = 0;
  for (const [name, lut] of Object.entries(made)) {
    assert.equal(lut.kappa, luts[name], `${name} has the label the site is built with`);
    const table = tables[name];
    const request = new Array(lut.sizes.length).fill(0);
    for (;;) {
      requests++;
      assert.equal(lut.bytes[indexOf(lut.sizes, request)], judgeTable(table, request).answer, `${name} ${request}`);
      let f = request.length - 1;
      while (f >= 0 && ++request[f] === lut.sizes[f]) request[f--] = 0;
      if (f < 0) break;
    }
  }
  assert.equal(requests, 180 + 80 + 108 + 108);
  // A table with a number in it has no finite list of requests, and is judged rule by rule.
  assert.equal(materialize(tables.flow, judgeTable, kappa), null);
  assert.equal(judge('flow', { pending: 100000, paused: 'no' }), 'hold');
});

await test('the store keeps bytes by label, in the layout of Hologram\'s browser store, and returns only what re-derives', async () => {
  const disk = fakeDirectory();
  const store = await openStore({ kappa, root: disk });
  const bytes = new TextEncoder().encode('kept by content');
  const label = await store.put(bytes);
  assert.equal(label, kappa(bytes));
  // One file to a blob, named by its label with the colon as an underscore.
  assert.deepEqual([...disk.files.keys()], [label.replace(':', '_')]);
  assert.deepEqual(await store.get(label), bytes);
  // The same bytes again write nothing new.
  await store.put(bytes);
  assert.equal(disk.files.size, 1);
  // Another visit: a new store over the same disk.
  const later = await openStore({ kappa, root: disk });
  assert.deepEqual(await later.get(label), bytes);
  // One changed byte on disk, and the label has nothing under it.
  disk.files.get(label.replace(':', '_'))[0] ^= 1;
  assert.equal(await later.get(label), null);
  assert.equal(await later.get('blake3:' + '0'.repeat(64)), null);
  assert.equal(await later.get('../etc/passwd'), null);
  // Where there is no file system to keep things in, it keeps them for the visit.
  const none = await openStore({ kappa, root: { getFileHandle: async () => { throw new Error('refused'); }, getDirectoryHandle: async () => { throw new Error('refused'); } } });
  const held = await none.put(bytes);
  assert.equal(none.durable, false);
  assert.deepEqual(await none.get(held), bytes);
});

await test('a kept output is shown again on a later visit, and not after its bytes change', async () => {
  const disk = fakeDirectory();
  const first = setup({ kept: createKeptIn(await openStore({ kappa, root: disk })) });
  assert.equal(await first.session.run('check'), 'run');
  // A later visit: another session, another store, the same disk.
  const second = setup({ kept: createKeptIn(await openStore({ kappa, root: disk })) });
  assert.equal(await second.session.run('check'), 'reuse');
  assert.equal(second.started.check, 0);
  assert.match(second.text(), /check of 3 files\r\n\(kept output/);
  // Every blob on disk changed by one byte: nothing is admitted, and the program runs.
  for (const bytes of disk.files.values()) bytes[bytes.length - 1] ^= 1;
  const third = setup({ kept: createKeptIn(await openStore({ kappa, root: disk })) });
  assert.equal(await third.session.run('check'), 'run');
  assert.equal(third.started.check, 1);
});

await test('a program\'s output cannot send a sequence to the terminal either', async () => {
  const t = setup({ output: 'diagnostic \x1b]52;c;aGVsbG8=\x07 quoted \x1b[8;1;1t\x9b31m' });
  assert.equal(await t.session.run('check'), 'run');
  assert.equal(await t.session.run('check'), 'reuse');
  assert.ok(!/[\x1b\x9b\x07]/.test(t.text()), 'no control byte reaches the terminal, run or kept');
});

await test('the line is edited where the cursor is', async () => {
  const echoed = [];
  const lines = [];
  const editor = createLineEditor({ echo: (t) => echoed.push(t), submit: async (line) => { lines.push(line); }, interrupt() {}, clear() {}, commands: () => ['check'] });
  const type = async (...keys) => { for (const key of keys) await editor.feed(key); };
  const LEFT = '\x1b[D', RIGHT = '\x1b[C', DELETE = '\x1b[3~', HOME = '\x1b[H', END = '\x1b[F';
  await type('a', 'c', LEFT, 'b');
  assert.equal(editor.line, 'abc');
  await type(HOME, '>', END, '!', LEFT, LEFT, DELETE, '\x7f');
  assert.equal(editor.line, '>a!');
  await type('\x01', RIGHT, '\x0b');
  assert.equal(editor.line, '>');
  await type('\x15', 'c', 'a', 't', ' ', 's', 'r', 'c', '/', 'x', '\x17');
  assert.equal(editor.line, 'cat ');
  await type('\x15', 'c', 'h', '\t', '\r');
  assert.deepEqual(lines, ['check ']);
  // The cursor is put back after a redraw: the last redraw of 'abc' with the cursor before 'c' moved it one left.
  assert.ok(echoed.includes('\r\x1b[Kmodel> abc\x1b[1D'));
});

console.log(`${passed} tests passed`);
