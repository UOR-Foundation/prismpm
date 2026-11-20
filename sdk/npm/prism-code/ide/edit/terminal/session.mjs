// The terminal's command line: what answers the keys. No DOM and no xterm.js here, so Node can test it.
//
// It is not a shell. A line is one command and its arguments. Before anything runs, the line is put to the proved
// command table (model/ide-terminal-commands); every use of a resource by a running command is put to the reach
// table (model/ide-terminal-reach); every piece of output waits on the flow table (model/ide-terminal-flow).
// This file asks the tables and obeys them. That it does is tested (tools/terminal-test.mjs), not proved.

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Ask a table. `tables` is { name: table as rule-table.mjs reads it }, `judgeTable` is that module's own judge.
 * `words` is { field name: word or number }. A word the table does not list throws: the caller refuses.
 */
export function makeJudge(tables, judgeTable) {
  return (name, words) => {
    const table = tables[name];
    if (!table) throw new Error(`there is no ${name} table`);
    const request = table.fields.map((f) => {
      const given = words[f.name];
      if (f.kind === 'choice') {
        const at = f.values.indexOf(given);
        if (at < 0) throw new Error(`${name}: ${f.name} has no value "${given}"`);
        return at;
      }
      if (!Number.isInteger(given) || given < f.least) throw new Error(`${name}: ${f.name} is not a number from ${f.least}`);
      // Past the field's top the answer is the top's: the table's bounds are the terminal's own buffer.
      return Math.min(given, f.greatest);
    });
    return table.answers[judgeTable(table, request).answer];
  };
}

/** Text as a terminal may safely show it: every control byte but a line break and a tab is written out. */
export function visible(text) {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) => {
    const n = c.charCodeAt(0);
    return n < 0x20 ? '^' + String.fromCharCode(n + 64) : n === 0x7f ? '^?' : '\\x' + n.toString(16);
  });
}

/** Where a path a line names points: 'model' with the file or folder it names, or 'outside'. */
export function resolveTarget(path, files) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes('\\')) return { target: 'outside' };
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (parts.length === 0) return { target: 'outside' }; parts.pop(); } else parts.push(part);
  }
  const at = '/' + parts.join('/');
  if (files.has(at)) return { target: 'model', file: at };
  const under = at === '/' ? '/' : at + '/';
  if ([...files.keys()].some((name) => name.startsWith(under))) return { target: 'model', folder: under };
  return { target: 'outside' };
}

/**
 * Output on its way to the terminal, held by the flow table. `sink(bytes, done)` is the terminal's write with its
 * callback. `write` resolves when the last piece has been handed over; `stop` drops what has not been.
 */
export function createWriter({ judge, sink, piece = 16384 }) {
  let pending = 0;
  let paused = false;
  let stopped = false;
  let wake = null;
  const state = { peak: 0, holds: 0 };
  const settled = () => new Promise((resolve) => { wake = resolve; });
  return {
    state,
    stop() { stopped = true; wake?.(); },
    /** A new line starts: what the last one was stopped from writing stays unwritten. */
    resume() { stopped = false; },
    async write(text) {
      const bytes = enc.encode(text.replace(/\r?\n/g, '\r\n'));
      for (let at = 0; at < bytes.length; at += piece) {
        for (;;) {
          if (stopped) return false;
          if (judge('flow', { pending, paused: paused ? 'yes' : 'no' }) === 'write') { paused = false; break; }
          paused = true;
          state.holds++;
          await settled();
        }
        const part = bytes.subarray(at, at + piece);
        pending += part.length;
        state.peak = Math.max(state.peak, pending);
        sink(part, () => { pending -= part.length; const go = wake; wake = null; go?.(); });
      }
      return true;
    },
  };
}

/** A program's output kept in this tab, by the label of what made it. Nothing outlives the tab. */
export function createKept() {
  const entries = new Map();
  return { get: (key) => entries.get(key) ?? null, set: (key, entry) => entries.set(key, entry), size: () => entries.size };
}

const HELP = [
  ['help', 'list these commands'],
  ['clear', 'clear the screen'],
  ['ls [folder]', "list the open model's files"],
  ['cat <file>', 'print a file, control bytes written out'],
  ['kappa <file>', "print a file's BLAKE3 label"],
  ['check', 'lexlean check, on the model as it is in the editor'],
  ['snapshot', 'lexlean snapshot: what the model means, as JSON'],
  ['prove', "have Lean's kernel judge each guarantee"],
  ['audit', 'say what backs each guarantee: proved, tested, refused or unknown'],
];

/**
 * The command line.
 *   judge            makeJudge's
 *   writer           createWriter's
 *   files()          the open model now: Map of '/path' to text
 *   bytesOf(command) 'absent' | 'mismatch' | 'pinned': the executable the program needs, as held in this tab
 *   labelOf(command) the label the program is pinned to, or null
 *   programs         { check, snapshot, prove, audit }: each takes { '/path': text } and resolves its output as text
 *   kappa(bytes)     BLAKE3 label
 *   reuseAdmits      kappa-rules.mjs's rule, proved in model/rule-app
 *   kept             createKept's
 *   clear()          clear the screen
 */
export function createSession({ judge, writer, files, bytesOf, labelOf, programs, kappa, reuseAdmits, kept, clear }) {
  const listed = () => HELP.map(([usage]) => usage.split(' ')[0]);
  const log = [];

  // What a running command is handed. Each use is put to the reach table first; there is no network, clipboard or
  // process here to ask for, and the table would deny them.
  function handOf(command) {
    const need = (resource) => {
      const answer = judge('reach', { command, resource });
      log.push({ command, resource, answer });
      if (answer !== 'allow') throw new Error(`${command} may not use ${resource}`);
    };
    return {
      print: (text) => { need('screen'); return writer.write(text); },
      list: () => { need('readmodel'); return [...files().keys()].sort(); },
      read: (path) => { need('readmodel'); return files().get(path); },
      kept: (key) => { need('readstore'); return kept.get(key); },
      keep: (key, entry) => { need('writestore'); kept.set(key, entry); },
    };
  }

  const builtins = {
    help: (hand) => hand.print('A command line for the open model. It is not a shell: one command to a line, nothing else runs.\n'
      + HELP.map(([usage, what]) => '  ' + usage.padEnd(14) + what).join('\n') + '\n'),
    clear: () => clear(),
    ls: (hand, at) => hand.print(hand.list().filter((name) => !at.folder || name.startsWith(at.folder)).map((name) => name.slice(1)).join('\n') + '\n'),
    cat: (hand, at) => (at.file ? hand.print(visible(hand.read(at.file)).replace(/\n?$/, '\n')) : hand.print('cat needs a file of the open model.\n')),
    kappa: (hand, at) => (at.file ? hand.print(kappa(enc.encode(hand.read(at.file))) + '  ' + at.file.slice(1) + '\n') : hand.print('kappa needs a file of the open model.\n')),
  };

  /** The key a program's output is kept under: the program's label and the label of everything it reads. */
  function keyOf(command, program, project) {
    const input = kappa(enc.encode(JSON.stringify(Object.keys(project).sort().map((path) => [path, project[path]]))));
    return { input, key: kappa(enc.encode(JSON.stringify(['prism/terminal-output/1', command, program, input]))) };
  }

  /** Run one line. Resolves the table's answer, for the caller's record. */
  async function run(line) {
    writer.resume();
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    // `lexlean check` and `lexlean snapshot` are the commands' full names.
    if (words[0] === 'lexlean' && ['check', 'snapshot'].includes(words[1])) words.shift();
    const [first, ...args] = words;
    const command = listed().includes(first) ? first : 'other';
    const path = args.find((a) => !a.startsWith('-'));
    const at = path === undefined ? { target: 'none' } : resolveTarget(path, files());
    const say = (text) => writer.write(text);

    // The reuse rule is asked only for a command the reach table lets read the store.
    let stored = 'no';
    let found = null;
    let named = null;
    const program = command === 'other' ? null : labelOf(command);
    if (program && judge('reach', { command, resource: 'readstore' }) === 'allow') {
      const project = Object.fromEntries(files());
      named = keyOf(command, program, project);
      found = kept.get(named.key);
      const admitted = reuseAdmits({
        present: found ? 1 : 0, storedKey: found?.key ?? '', computedKey: named.key, storedKernel: found?.program ?? '', kernelPinned: program,
        storedLibrary: found?.input ?? '', libraryPinned: named.input, storedBytes: found?.output ?? '', derivedBytes: found ? kappa(found.bytes) : '',
      });
      stored = admitted ? 'yes' : 'no';
    }
    // The executable is looked at only when the answer can turn on it.
    const bytes = program && stored === 'no' ? await bytesOf(command) : 'absent';
    const answer = judge('commands', { command, target: at.target, bytes, stored });
    log.push({ line, command, target: at.target, bytes, stored, answer });

    if (answer === 'builtin') await builtins[command](handOf(command), at);
    else if (answer === 'reuse') {
      const hand = handOf(command);
      await hand.print(dec.decode(hand.kept(named.key).bytes));
      await hand.print(`(kept output ${found.output.slice(0, 19)}…, shown again; nothing was run)\n`);
    } else if (answer === 'run') {
      const hand = handOf(command);
      const project = Object.fromEntries(hand.list().map((name) => [name, hand.read(name)]));
      const made = await programs[command](project);
      const out = enc.encode(made.text.replace(/\n?$/, '\n'));
      // Only an output the program finished is kept, under the key of exactly what it read.
      if (made.keep !== false && named) hand.keep(named.key, { key: named.key, program, input: named.input, output: kappa(out), bytes: out });
      await hand.print(dec.decode(out));
    } else if (command === 'other') await say(`${visible(first)}: not a command here. Type help.\n`);
    else if (at.target === 'outside') await say(`${visible(path)}: not in the open model.\n`);
    else if (bytes === 'mismatch') await say(`${command}: its program is not the pinned one, so nothing was run.\n`);
    else await say(`${command}: its program could not be fetched, so nothing was run.\n`);
    return answer;
  }

  return { run, log, commands: listed };
}

/**
 * Keys into lines. `echo(text)` writes to the terminal at once; `submit(line)` runs a line and resolves when it is
 * done. The cursor stays at the end of the line: there is no editing in the middle.
 */
export function createLineEditor({ echo, submit, interrupt, clear, commands, prompt = 'model> ' }) {
  let line = '';
  let busy = false;
  // Keys pressed while a command runs: entered, in order, when it is done.
  const ahead = [];
  const history = [];
  let at = 0;
  const redraw = (next) => { echo('\r\x1b[K' + prompt + next); line = next; };
  const done = async () => { busy = false; echo(prompt); while (ahead.length && !busy) await feed(ahead.shift()); };
  const enter = (text) => {
    echo('\r\n');
    line = '';
    if (text.trim()) { history.push(text); }
    at = history.length;
    busy = true;
    return Promise.resolve(submit(text)).catch((error) => echo(String(error?.message ?? error).replace(/\n/g, '\r\n') + '\r\n')).then(done);
  };
  /** What the terminal reports for a key press, or a pasted line. */
  async function feed(data) {
      if (busy) { if (data === '\x03') { ahead.length = 0; interrupt(); echo('^C\r\n'); } else ahead.push(data); return; }
      if (data === '\r') return enter(line);
      if (data === '\x7f') { if (line) { const cut = [...line]; cut.pop(); redraw(cut.join('')); } return; }
      if (data === '\x03') { echo('^C\r\n'); line = ''; echo(prompt); return; }
      if (data === '\x0c') { clear(); redraw(line); return; }
      if (data === '\x1b[A') { if (at > 0) redraw(history[--at]); return; }
      if (data === '\x1b[B') { if (at < history.length) { at++; redraw(history[at] ?? ''); } return; }
      if (data === '\t') {
        const fits = commands().filter((name) => name.startsWith(line));
        if (line && !line.includes(' ') && fits.length === 1) redraw(fits[0] + ' ');
        return;
      }
      // Any other control sequence a key sends (arrows left and right, function keys) does nothing.
      if (data.startsWith('\x1b')) return;
      const text = visible(data).replace(/[\n\t]/g, ' ');
      line += text;
      echo(text);
  }
  return {
    start() { echo(prompt); },
    get busy() { return busy; },
    feed,
    /** Lines the user chose to paste: each is entered in turn. */
    async lines(texts) { for (const text of texts) { if (!busy) redraw(visible(text).replace(/\t/g, ' ')); await enter(line); } },
  };
}
