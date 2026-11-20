// The terminal of the edit page: xterm.js, with the command line of session.mjs behind it.
//
// xterm.js is the real emulator (@xterm/xterm, MIT), published beside the page as the files npm ships. Each file is
// run only when its bytes hash to the BLAKE3 label pins.json names. It draws what is written to it and reports
// keys; it runs nothing. What answers the keys is session.mjs: a fixed list of commands, each judged by the proved
// tables before it runs. There is no shell, no native program and no connection to any machine here.
//
// Phase 2f of docs/proposals/prism-ide-phase-2.md, first step: the plain edit page. The workbench panel, output
// kept between visits, and saved sessions are not built.

import { kappa } from '../prism-code/blake3.mjs';
import { judgeTable, ruleTable, tableWords, OPS } from '../prism-code/journey/rule-table.mjs';
import { reuseAdmits } from '../prism-code/journey/kappa-rules.mjs';
import { createEffects } from './effects.mjs';
import { createKept, createLineEditor, createSession, createWriter, makeJudge } from './session.mjs';

const enc = new TextEncoder();
const here = (path) => new URL(path, import.meta.url).href;
const json = async (url) => (await fetch(url, { cache: 'no-store' })).json();

/** A published file of xterm.js, or a refusal: its bytes are used only when they are the pinned ones. */
async function admitted(pins, name) {
  const want = pins.files[name];
  if (!want) throw new Error(`${name} is not a pinned file`);
  const response = await fetch(here('../vendor/xterm/' + name));
  if (!response.ok) throw new Error(`${name} is not beside the page (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const label = kappa(bytes);
  if (label !== want.kappa) throw new Error(`${name} hashes to ${label}, not the pinned ${want.kappa}`);
  return bytes;
}
async function module(pins, name) {
  const url = URL.createObjectURL(new Blob([await admitted(pins, name)], { type: 'text/javascript' }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

/** A request as the table's examples write it ("word word 12"), as one number per field. */
const requestOf = (table, text) => text.trim().split(/\s+/).map((word, i) => (table.fields[i].kind === 'choice' ? table.fields[i].values.indexOf(word) : Number(word)));

/**
 * Start the terminal in `element`. The page hands over what it already has:
 *   project()            the model as it is in the editor: { '/path': text }
 *   check, snapshotOf    the LexLean worker's two questions
 *   prove(words, gs)     the kernel worker's
 *   held()               resolves { lexlean, kernel }, each 'pinned' | 'mismatch' | 'absent', once each has settled
 *   pin                  the LexLean executable's pin
 *   setTitle(text)       where a title set by output is shown
 */
export async function startTerminal(element, { project, check, snapshotOf, prove, held, pin, setTitle }) {
  const started = performance.now();
  const state = (window.prismTerminal = { ready: false, error: null });
  try {
    const [pins, tables, manifest] = await Promise.all([json(here('./pins.json')), json(here('./tables.json')), json(here('../kernel/manifest.json')).catch(() => null)]);
    const judge = makeJudge(tables.tables, judgeTable);
    const [{ Terminal }, { FitAddon }, { WebLinksAddon }, css] = await Promise.all([module(pins, 'xterm.mjs'), module(pins, 'addon-fit.mjs'), module(pins, 'addon-web-links.mjs'), admitted(pins, 'xterm.css')]);
    document.head.append(Object.assign(document.createElement('style'), { textContent: new TextDecoder().decode(css) }));

    const effects = createEffects({ judge, ui: { setTitle, confirm: async (text) => window.confirm(text), open: (uri) => window.open(uri, '_blank', 'noopener,noreferrer') } });
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const term = new Terminal({
      scrollback: 10000, fontSize: 13, fontFamily: 'ui-monospace, Consolas, monospace', cursorBlink: true,
      theme: dark ? { background: '#161513', foreground: '#ece9e3', cursor: '#ece9e3' } : { background: '#fbfaf8', foreground: '#1d1c1a', cursor: '#1d1c1a', selectionBackground: '#c9d7ee' },
      linkHandler: effects.linkHandler,
    });
    effects.install(term);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((event, uri) => effects.link(event, uri)));
    term.open(element);
    fit.fit();
    new ResizeObserver(() => fit.fit()).observe(element);

    // The fast renderer where the browser has WebGL2; xterm.js's own DOM renderer otherwise, and after a lost context.
    state.renderer = 'dom';
    try {
      const { WebglAddon } = await module(pins, 'addon-webgl.mjs');
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { webgl.dispose(); state.renderer = 'dom'; });
      term.loadAddon(webgl);
      state.renderer = 'webgl';
    } catch (error) { state.rendererWhy = String(error?.message ?? error); }

    // What each program is pinned to. `prove` and `audit` need LexLean and the kernel with its library; their label
    // is the label of that list. The kernel's own parts are still named by SHA-256 in its manifest.
    const kernelParts = manifest ? ['sha256:' + manifest.wasm.sha256, 'sha256:' + manifest.glue.sha256, 'sha256:' + manifest.library.sha256] : null;
    const proverLabel = kernelParts ? kappa(enc.encode(JSON.stringify(['prism/terminal-prover/1', pin.kappa, ...kernelParts]))) : null;
    const labelOf = (command) => (command === 'check' || command === 'snapshot' ? pin.kappa : command === 'prove' || command === 'audit' ? proverLabel : null);
    const worst = (...all) => (all.includes('mismatch') ? 'mismatch' : all.includes('absent') ? 'absent' : 'pinned');
    const bytesOf = async (command) => { const now = await held(); return command === 'check' || command === 'snapshot' ? now.lexlean : worst(now.lexlean, now.kernel); };

    // A model's guarantees as the kernel judged them, for `prove` and `audit`.
    async function judged(files) {
      const taken = await snapshotOf(files);
      if (!taken.snapshot) return { why: 'The model does not check, so there is nothing to prove. Run check.' };
      let table;
      try { table = ruleTable(JSON.parse(taken.snapshot)); } catch (error) { return { why: 'This model is not a rule table, so its guarantees are not proved in this tab: ' + (error?.message ?? error) }; }
      const shaped = tableWords(table);
      const reply = await prove(shaped.words, shaped.guarantees);
      if (reply.error) return { why: "Lean's kernel could not run in this tab: " + reply.error };
      const said = (g) => 'When ' + g.when.map(([f, op, v]) => table.fields[f].name + ' ' + OPS[op] + ' ' + (table.fields[f].values ? table.fields[f].values[v] : v)).join(' and ') + ', the answer is ' + (g.always ? 'always ' : 'never ') + table.answers[g.outcome] + '.';
      return { table, results: reply.results, ms: reply.ms, said };
    }
    const programs = {
      async check(files) {
        const reply = await check(files);
        if (reply.error) return { text: 'LexLean did not answer: ' + reply.error, keep: false };
        const r = reply.result;
        const lines = r.diagnostics.map((d) => (d.primary ? `${d.primary.path.replace(/^\//, '')}:${d.primary.line_start}:${d.primary.column_start} ` : '') + `${d.code}: ${d.message}`);
        lines.push(r.success ? `The model checks. Its identity is sha256:${String(r.semantic_id ?? '').replace(/^sha256:/, '')}.` : `${r.diagnostics.length} problem${r.diagnostics.length === 1 ? '' : 's'}.`);
        return { text: lines.join('\n') };
      },
      async snapshot(files) {
        const taken = await snapshotOf(files);
        return taken.snapshot ? { text: taken.snapshot } : { text: 'The model does not check, so it has no snapshot. Run check.', keep: false };
      },
      async prove(files) {
        const j = await judged(files);
        if (j.why) return { text: j.why, keep: false };
        const count = j.results.filter((r) => r.proved).length;
        return { text: j.table.guarantees.map((g, i) => (j.results[i].proved ? 'proved   ' : 'refused  ') + j.said(g)).join('\n') + `\n${count} of ${j.results.length} proved by Lean's kernel in this tab.` };
      },
      async audit(files) {
        const j = await judged(files);
        if (j.why) return { text: j.why, keep: false };
        // The model's own examples, replayed through the table as the rule judge reads it.
        const examples = j.table.examples;
        const passed = examples.every((e) => j.table.answers[judgeTable(j.table, requestOf(j.table, e.request)).answer] === e.answer);
        const vectors = examples.length === 0 ? 'none' : passed ? 'passed' : 'failed';
        const lines = j.table.guarantees.map((g, i) => judge('audit', { kernel: j.results[i].proved ? 'accepted' : 'refused', kernelmodel: 'this', attestation: 'none', attestedmodel: 'other', vectors }).padEnd(9) + j.said(g));
        return { text: lines.join('\n') + `\nExamples: ${examples.length}, ${vectors}. No attestation is read here. Statuses by the rule of model/ide-audit.` };
      },
    };

    const writer = createWriter({ judge, sink: (bytes, done) => term.write(bytes, done) });
    const session = createSession({ judge, writer, files: () => new Map(Object.entries(project())), bytesOf, labelOf, programs, kappa, reuseAdmits, kept: createKept(), clear: () => term.clear() });
    const editor = createLineEditor({ echo: (text) => term.write(text), submit: (line) => session.run(line), interrupt: () => writer.stop(), clear: () => term.clear(), commands: session.commands });
    term.onData((data) => { editor.feed(data); });
    // A paste goes to the effects table before the terminal sees it.
    element.addEventListener('paste', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const got = await effects.paste(event, event.clipboardData?.getData('text/plain') ?? '');
      if (got?.lines) editor.lines(got.lines); else if (got?.text) editor.feed(got.text);
    }, true);

    term.writeln('Prism model terminal. A command line for this model, not a shell. Type help.');
    editor.start();
    // When the prompt was drawn: since the page was opened, and since the terminal was asked to start.
    term.write('', () => { state.promptMs = Math.round(performance.now()); state.startMs = Math.round(performance.now() - started); });
    Object.assign(state, { ready: true, term, session, effects, writer, editor, judge, pins, tables: Object.fromEntries(Object.entries(tables.tables).map(([name, t]) => [name, t.semanticId])) });
  } catch (error) {
    state.error = String(error?.message ?? error);
    element.textContent = 'The terminal could not start: ' + state.error;
  }
  return state;
}
