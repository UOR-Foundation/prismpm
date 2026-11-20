// Edit a LexLean model and see LexLean's verdict on it as you type, in this tab.
//
// The page is given a project as a listing of its files (project.json beside the page: { files: ['lexlean.toml',
// 'src/App.lex.tex', ...], entry: 'src/App.lex.tex' }) and fetches them from project/. One file is open for
// editing; after each pause the whole project, with the edited text in place, goes to the worker, which runs
// `lexlean check`. Diagnostics are listed with their line and marked beside the text.
//
// Phase 2b of docs/proposals/prism-ide-phase-2.md, first step: a plain text area, not yet the workbench editor,
// and checking only. Proving in the tab is phase 2c. Nothing is saved anywhere: a reload brings the project back.

// The pin of the LexLean executable (commit, BLAKE3 label, encoding), as prism-code states it in
// src/journey/lexlean-wasm.mjs. That module reads files, so whoever serves the page hands the pin over as pin.json.
const LEXLEAN_WASM = await (await fetch('./pin.json', { cache: 'no-store' })).json();

const $ = (id) => document.getElementById(id);
const state = (window.prismEdit = { ready: false, checks: 0, last: null, error: null, engine: null });
const PAUSE_MS = 350;

const listing = await (await fetch('./project.json', { cache: 'no-store' })).json();
const files = {};
await Promise.all(listing.files.map(async (path) => { files['/' + path] = await (await fetch('./project/' + path, { cache: 'no-store' })).text(); }));
const entry = '/' + listing.entry;
const original = files[entry];
$('file').textContent = listing.entry;
$('source').value = original;

const worker = new Worker(new URL('./lexlean-worker.mjs', import.meta.url), { type: 'module' });
const waiting = new Map();
let nextId = 0;
worker.onmessage = ({ data }) => {
  if (data.ready) { state.engine = data; $('engine').textContent = `LexLean ${LEXLEAN_WASM.commit.slice(0, 7)}, ${(data.bytes / 1048576).toFixed(1)} MB, checked against ${data.kappa.slice(0, 19)}… and ready in ${data.ms} ms`; return; }
  if (data.failed) { state.error = data.failed; $('engine').textContent = 'LexLean could not start: ' + data.failed; $('status').textContent = 'Not checked.'; state.ready = true; return; }
  waiting.get(data.id)?.(data);
  waiting.delete(data.id);
};
worker.postMessage({ start: { url: new URL('./lexlean.wasm.gz', import.meta.url).href, pin: { kappa: LEXLEAN_WASM.kappa, encoding: LEXLEAN_WASM.encoding } } });
const check = (project) => new Promise((resolve) => { const id = ++nextId; waiting.set(id, resolve); worker.postMessage({ id, files: project }); });

function gutter(marks) {
  const lines = $('source').value.split('\n').length;
  $('gutter').replaceChildren(...Array.from({ length: lines }, (_, i) => {
    const line = document.createElement('span');
    line.textContent = (marks.has(i + 1) ? '●' : ' ') + String(i + 1).padStart(4) + '\n';
    if (marks.has(i + 1)) line.className = 'mark';
    return line;
  }));
}
function goTo(line, column) {
  const text = $('source').value;
  let at = 0;
  for (let n = 1; n < line; n++) at = text.indexOf('\n', at) + 1;
  $('source').focus();
  $('source').setSelectionRange(at + column - 1, at + column - 1);
  // A text area scrolls by pixels; one line is its line height.
  $('source').scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle($('source')).lineHeight));
  $('gutter').scrollTop = $('source').scrollTop;
}

let latest = 0;
async function run() {
  const mine = ++latest;
  $('status').textContent = 'Checking…';
  const reply = await check({ ...files, [entry]: $('source').value });
  if (mine !== latest) return; // a newer edit is already being checked
  state.checks++;
  $('diagnostics').replaceChildren();
  const marks = new Set();
  if (reply.error) {
    state.last = { error: reply.error };
    $('status').textContent = 'LexLean did not answer: ' + reply.error;
  } else {
    const result = reply.result;
    const own = (d) => (d.primary?.path ?? '').replace(/^\//, '') === listing.entry;
    state.last = { success: result.success, ms: reply.ms, semanticId: result.semantic_id ?? null, diagnostics: result.diagnostics.map((d) => ({ code: d.code, line: d.primary?.line_start, column: d.primary?.column_start, path: d.primary?.path, message: d.message })) };
    for (const d of result.diagnostics) {
      const item = document.createElement('li');
      const where = d.primary ? `${d.primary.path}:${d.primary.line_start}:${d.primary.column_start}` : '';
      const link = document.createElement(own(d) ? 'button' : 'span');
      link.textContent = where;
      if (own(d)) { link.type = 'button'; link.addEventListener('click', () => goTo(d.primary.line_start, d.primary.column_start)); marks.add(d.primary.line_start); }
      item.append(link, ` ${d.code}: ${d.message}`);
      $('diagnostics').append(item);
    }
    $('status').textContent = result.success
      ? `The model checks, in ${reply.ms} ms. Its identity is ${result.semantic_id ? 'sha256:' + result.semantic_id.replace(/^sha256:/, '') : 'not given'}.`
      : `${result.diagnostics.length} problem${result.diagnostics.length === 1 ? '' : 's'}, found in ${reply.ms} ms.`;
    $('status').dataset.state = result.success ? 'ok' : 'bad';
  }
  gutter(marks);
  state.ready = true;
}

let timer = null;
$('source').addEventListener('input', () => { clearTimeout(timer); gutter(new Set()); timer = setTimeout(run, PAUSE_MS); });
$('source').addEventListener('scroll', () => { $('gutter').scrollTop = $('source').scrollTop; });
$('revert').addEventListener('click', () => { $('source').value = original; run(); });
gutter(new Set());
run();
