// A LexLean model open in the VS Code workbench, checked and proved as it is edited.
//
// The editor, the Problems panel and the squiggles are the workbench's own (@codingame/monaco-vscode-api). What
// they show comes from the same two workers as the plain edit page (../edit): LexLean's pinned front end checks the
// model after every pause, and, when it checks and is a rule table, Lean's kernel judges each guarantee.
//
//   A LexLean diagnostic        -> an error marker at its place in the file
//   A guarantee a request breaks -> an error marker on the line that states the guarantees, naming the request
//   Everything proved            -> no marker; the strip above the workbench says how many
//
// The page is served beside ../edit by tools/serve-edit.mjs, which gives it the project, the LexLean executable and
// the kernel. No extension runs here, so the capability gate of main.js has nothing to judge and is not loaded.

import { initialize, getService, IEditorService, IMarkerService, IWorkbenchThemeService } from '@codingame/monaco-vscode-api/services';
import getExtensionsOverride from '@codingame/monaco-vscode-extensions-service-override';
import getFilesOverride, { RegisteredFileSystemProvider, RegisteredMemoryFile, registerFileSystemOverlay } from '@codingame/monaco-vscode-files-service-override';
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import * as monaco from '@codingame/monaco-vscode-editor-api';
import getConfigurationOverride, { initUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override';
import getWorkbenchOverride from '@codingame/monaco-vscode-workbench-service-override';
import getModelOverride from '@codingame/monaco-vscode-model-service-override';
import getLanguagesOverride from '@codingame/monaco-vscode-languages-service-override';
import getThemeOverride from '@codingame/monaco-vscode-theme-service-override';
import getMarkersOverride from '@codingame/monaco-vscode-markers-service-override';
import getStorageOverride from '@codingame/monaco-vscode-storage-service-override';
import getLifecycleOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getNotificationsOverride from '@codingame/monaco-vscode-notifications-service-override';
import getDialogsOverride from '@codingame/monaco-vscode-dialogs-service-override';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import extHostWorkerUrl from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url';
import editorWorkerUrl from '@codingame/monaco-vscode-api/workers/editor.worker?worker&url';
import { LEXLEAN, registerLexLean } from './lexlean-language.js';

const PAUSE_MS = 350;
const ERROR = 8; // MarkerSeverity.Error
const strip = document.getElementById('strip');
const state = (window.prismModel = { ready: false, checks: 0, last: null, proof: null, error: null, markers: 0 });
const say = (text, kind) => { strip.textContent = text; strip.dataset.state = kind ?? ''; };

// The edit page's files, served beside this page. Plain URLs, so the bundler leaves the workers as they are.
const EDIT = new URL('/edit/', location.origin).href;
const json = async (path) => (await fetch(EDIT + path, { cache: 'no-store' })).json();
const [listing, pin] = await Promise.all([json('project.json'), json('pin.json')]);
const files = {};
await Promise.all(listing.files.map(async (path) => { files['/' + path] = await (await fetch(EDIT + 'project/' + path, { cache: 'no-store' })).text(); }));
const entry = '/' + listing.entry;
const { ruleTable, tableWords, counterexample, OPS } = await import(/* @vite-ignore */ EDIT + 'prism-code/journey/rule-table.mjs');

// One request at a time to each worker, matched by id.
function channel(url, onNote) {
  const worker = new Worker(url, { type: 'module' });
  const waiting = new Map();
  let next = 0;
  worker.onmessage = ({ data }) => {
    if (data.id === undefined) { onNote(data); if (data.failed) { for (const done of waiting.values()) done({ error: data.failed }); waiting.clear(); } return; }
    waiting.get(data.id)?.(data);
    waiting.delete(data.id);
  };
  return { post: (message) => worker.postMessage(message), ask: (message) => new Promise((resolve) => { const id = ++next; waiting.set(id, resolve); worker.postMessage({ id, ...message }); }) };
}
const lexlean = channel(EDIT + 'lexlean-worker.mjs', (note) => { state.lexlean = note; });
lexlean.post({ start: { url: EDIT + 'lexlean.wasm.gz', pin: { kappa: pin.kappa, encoding: pin.encoding } } });
const kernel = channel(EDIT + 'prove-worker.mjs', (note) => { state.kernel = note; });

window.MonacoEnvironment = {
  getWorkerUrl: (_moduleId, label) => (label === 'extensionHostWorkerMain' ? extHostWorkerUrl : editorWorkerUrl),
  getWorkerOptions: () => ({ type: 'module' }),
};

try {
  // The project, as files the workbench can open. The model's entrypoint is the one that gets edited.
  const provider = new RegisteredFileSystemProvider(false);
  const uriOf = (path) => URI.file('/workspace' + path);
  for (const [path, text] of Object.entries(files)) provider.registerFile(new RegisteredMemoryFile(uriOf(path), text));
  registerFileSystemOverlay(1, provider);
  // LexLean's colours reach the editor as semantic tokens, so they are on whatever the theme would choose.
  await initUserConfiguration(JSON.stringify({ 'editor.semanticHighlighting.enabled': true }));

  await initialize({
    ...getExtensionsOverride({ enableWorkerExtensionHost: true }), ...getFilesOverride(), ...getConfigurationOverride(),
    ...getWorkbenchOverride(), ...getModelOverride(), ...getLanguagesOverride(), ...getThemeOverride(), ...getMarkersOverride(),
    ...getStorageOverride(), ...getLifecycleOverride(), ...getNotificationsOverride(), ...getDialogsOverride(),
  }, document.getElementById('workbench'));

  // LexLean's name, brackets and colours, before the file is opened, so the editor takes it for LexLean.
  registerLexLean(monaco);
  const resource = uriOf(entry);
  await (await getService(IEditorService)).openEditor({ resource, options: { pinned: true } });
  const markers = await getService(IMarkerService);
  const model = monaco.editor.getModels().find((m) => m.uri.toString() === resource.toString());
  if (!model) throw new Error('the workbench opened no model for ' + listing.entry);
  // The file ending should be enough; if the workbench chose otherwise, say which language this is.
  if (model.getLanguageId() !== LEXLEAN) monaco.editor.setModelLanguage(model, LEXLEAN);
  state.model = { lines: model.getLineCount(), language: model.getLanguageId() };
  const themes = await getService(IWorkbenchThemeService);
  // The editor gives each token a class, mtk<n>, where n indexes the theme's table of colours. In VS Code the
  // stylesheet that gives those classes their colours is written by the TextMate service, which this page does not
  // load, so it is written here from the same table. The table grows as the theme meets new kinds of token, so it is
  // written again after the theme changes and a moment after the editor asks for colours.
  const tokenStyle = document.head.appendChild(document.createElement('style'));
  const paint = () => {
    const table = themes.getColorTheme().tokenColorMap ?? [];
    tokenStyle.textContent = table.map((colour, n) => (colour ? '.mtk' + n + ' { color: ' + colour + '; }' : '')).join(' ');
    state.colours = table.filter(Boolean).length;
  };
  themes.onDidColorThemeChange(paint);
  paint();
  setInterval(paint, 1000);
  window.prismModel.colouring = () => { const t = themes.getColorTheme(); return { theme: t.label ?? t.id, rules: t.tokenColors?.length ?? null, semantic: t.semanticHighlighting ?? null, asked: registerLexLean.calls }; };
  window.prismModel.tokenize = (text) => monaco.editor.tokenize(text, LEXLEAN).map((line) => line.map((t) => t.type));
  window.prismModel.setText = (text) => model.setValue(text); // for a test to type with
  window.prismModel.text = () => model.getValue();

  let latest = 0;
  async function run() {
    const mine = ++latest;
    const text = model.getValue();
    const project = { ...files, [entry]: text };
    say('Checking…');
    const reply = await lexlean.ask({ files: project });
    if (mine !== latest) return;
    state.checks++;
    if (reply.error) { state.last = { error: reply.error }; say('LexLean did not answer: ' + reply.error, 'bad'); state.ready = true; return; }
    const result = reply.result;
    const own = result.diagnostics.filter((d) => (d.primary?.path ?? '').replace(/^\//, '') === listing.entry);
    markers.changeOne('lexlean', resource, own.map((d) => ({
      severity: ERROR, source: 'LexLean', code: d.code, message: d.message,
      startLineNumber: d.primary.line_start, startColumn: d.primary.column_start, endLineNumber: d.primary.line_end, endColumn: Math.max(d.primary.column_end, d.primary.column_start + 1),
    })));
    state.last = { success: result.success, ms: reply.ms, semanticId: result.semantic_id ?? null, diagnostics: result.diagnostics.map((d) => ({ code: d.code, line: d.primary?.line_start, message: d.message })) };
    if (!result.success) {
      // A model that does not check has no meaning to prove anything about.
      markers.changeOne('prism-guarantees', resource, []);
      state.proof = null;
      // A problem in another file of the project has no place in this editor, so the strip names the first one.
      const elsewhere = result.diagnostics.find((d) => !own.includes(d));
      say(`${result.diagnostics.length} problem${result.diagnostics.length === 1 ? '' : 's'} from LexLean, in ${reply.ms} ms. Guarantees are not judged until the model checks.`
        + (elsewhere ? ` Not in this file: ${elsewhere.primary?.path ?? 'the project'}: ${elsewhere.code}: ${elsewhere.message}` : ''), 'bad');
      state.markers = markers.read({ resource }).length;
      state.ready = true;
      return;
    }
    say(`The model checks, in ${reply.ms} ms. Judging its guarantees…`);
    const taken = await lexlean.ask({ files: project, snapshot: true });
    if (mine !== latest) return;
    let table;
    try { table = ruleTable(JSON.parse(taken.snapshot)); } catch (e) {
      markers.changeOne('prism-guarantees', resource, []);
      state.proof = { table: false };
      say(`The model checks, in ${reply.ms} ms. It is not a rule table, so its guarantees are not proved in this tab.`, 'ok');
      state.markers = markers.read({ resource }).length;
      state.ready = true;
      return;
    }
    const value = (f, v) => (f.values ? f.values[v] : v);
    const said = (g) => 'When ' + g.when.map(([f, op, v]) => table.fields[f].name + ' ' + OPS[op] + ' ' + value(table.fields[f], v)).join(' and ') + ', the answer is ' + (g.always ? 'always ' : 'never ') + table.answers[g.outcome];
    const found = table.guarantees.map((g) => counterexample(table, g));
    const shaped = tableWords(table);
    const judged = await kernel.ask({ words: shaped.words, guarantees: shaped.guarantees });
    if (mine !== latest) return;
    // Where the model states its guarantees: the place a broken one is reported.
    const at = text.split('\n').findIndex((line) => /^\s*name:\s*guarantees\s*,/.test(line)) + 1 || 1;
    const statuses = table.guarantees.map((g, i) => (judged.results?.[i]?.proved ? 'proved' : found[i].request !== null ? 'broken' : judged.error ? 'not proved here' : 'refused'));
    markers.changeOne('prism-guarantees', resource, table.guarantees.flatMap((g, i) => (statuses[i] === 'proved' ? [] : [{
      severity: ERROR, source: 'Prism', code: statuses[i],
      message: statuses[i] === 'broken' ? `Guarantee broken: ${said(g)}. The request "${found[i].request}" answers ${found[i].answer}.`
        : statuses[i] === 'refused' ? `Guarantee not accepted by Lean's kernel, though no request in the bounds breaks it: ${said(g)}.`
          : `Guarantee not proved here (Lean's kernel could not run: ${judged.error}): ${said(g)}.`,
      startLineNumber: at, startColumn: 1, endLineNumber: at, endColumn: 1000,
    }])));
    const proved = statuses.filter((s) => s === 'proved').length;
    state.proof = { table: true, proved, total: statuses.length, ms: judged.ms ?? null, statuses, breaking: found.map((f) => f.request), line: at };
    say(`${proved} of ${statuses.length} guarantees proved by Lean's kernel in this tab` + (judged.ms ? `, in ${judged.ms} ms` : '') + (proved === statuses.length ? '.' : `; ${statuses.length - proved} not, listed under Problems.`), proved === statuses.length ? 'ok' : 'bad');
    state.markers = markers.read({ resource }).length;
    state.ready = true;
  }

  let timer = null;
  model.onDidChangeContent(() => { clearTimeout(timer); timer = setTimeout(run, PAUSE_MS); });
  await run();
} catch (e) {
  state.error = String(e?.stack ?? e);
  say('The editor could not start: ' + (e?.message ?? e), 'bad');
  state.ready = true;
}
