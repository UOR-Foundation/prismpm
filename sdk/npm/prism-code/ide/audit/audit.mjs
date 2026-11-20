// The audit view of one rule app: its rules, each guarantee with what backs it, its examples, its fingerprint.
//
// It proves nothing itself. The app's own published page already checks its judge archive, runs its examples and
// proves every guarantee with Lean's kernel in the tab; this view loads that page in a frame and reads what it
// found. What each guarantee may then be called (proved, tested, refused, unknown) is not decided here either: it
// is asked of the audit-status model (../../model/ide-audit), run through the same verified rule judge.
//
// Phase 2a limits: the app must be served from this page's origin, and the copy of prism-code the app publishes is
// taken as it is. Fetching by content label is phase 2d.

const params = new URLSearchParams(location.search);
const appBase = new URL(params.get('app') ?? './app/', location.href).href.replace(/\/?$/, '/');
const enc = new TextEncoder();
const dec = new TextDecoder();
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const hexWord = (n) => [0, 8, 16, 24].map((k) => ((n >>> k) & 255).toString(16).padStart(2, '0')).join('');
const readWord = (hex) => parseInt(hex.match(/../g).reverse().join(''), 16);
const unhex = (hex) => dec.decode(Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16)));
const sha256 = async (bytes) => 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = async (url) => new Uint8Array(await (await fetch(url, { cache: 'no-store' })).arrayBuffer());

const state = (window.prismAudit = { app: appBase, ready: false, error: null, guarantees: [], vectors: [], facts: null });

// A record's words: [schema, fields, (least, greatest) per field, otherwise, rules, then per rule: conditions, answer, (field, op, value)...].
const OPS = ['<', '≤', '>', '≥', 'is', 'is not'];
function readRules(record) {
  const w = record.words;
  let at = 2 + 2 * record.fields.length;
  const otherwise = w[at++];
  const rules = [];
  for (let n = w[at++]; n > 0; n--) {
    const count = w[at++], answer = w[at++];
    const when = [];
    for (let k = 0; k < count; k++, at += 3) when.push([w[at], w[at + 1], w[at + 2]]);
    rules.push({ when, answer });
  }
  return { rules, otherwise };
}
const condition = (record, [field, op, value]) => {
  const f = record.fields[field];
  return `${f.name} ${OPS[op]} ${f.kind === 'choice' ? f.values[value] : value}`;
};
const conditions = (record, when) => when.map((c) => condition(record, c)).join(' and ');

// One rule app, loaded as the app's page loads it: the record's numbers through the verified rule judge.
async function judgeOf(record, kernel) {
  const prefix = 'rule ' + record.words.map(hexWord).join('');
  return async (request) => {
    const numbers = record.fields.map((f, i) => (f.kind === 'choice' ? f.values.indexOf(request[i]) : Number(request[i])));
    if (request.length !== record.fields.length || numbers.some((n) => !(n >= 0))) return 'invalid';
    const reply = dec.decode(await kernel.dispatch(enc.encode(prefix + numbers.map(hexWord).join(''))));
    return /^ok [0-9a-f]{24}$/.test(reply) ? record.outcomes[readWord(reply.slice(11, 19))] : null;
  };
}

// What the app's own page found, read once it has finished proving.
function appFindings() {
  return new Promise((resolve) => {
    const frame = Object.assign(document.createElement('iframe'), { src: appBase, hidden: true, title: 'the app' });
    document.body.append(frame);
    const started = Date.now();
    const timer = setInterval(() => {
      let found = null;
      try { found = frame.contentWindow.prismRuleApp; } catch (e) { clearInterval(timer); resolve({ error: 'the app is on another origin: ' + e.message }); return; }
      const settled = found?.ready && (!found.admitted || (found.vectors && (found.vectors.passed !== found.vectors.total || found.proved)));
      if (settled || Date.now() - started > 90000) {
        clearInterval(timer);
        resolve(found ? { ...found, timedOut: !settled } : { error: 'the app page did not start' });
      }
    }, 200);
  });
}

async function main() {
  $('app').textContent = appBase;
  const recordBytes = await bytesOf(appBase + 'app.rule-app.json');
  const holoBytes = await bytesOf(appBase + 'kernel.holo');
  const record = JSON.parse(dec.decode(recordBytes));
  const { kappa } = await import(appBase + 'prism-code/src/blake3.mjs');
  const { loadArchive } = await import(appBase + 'prism-code/src/index.mjs');
  const labels = { record: { sha256: await sha256(recordBytes), blake3: kappa(recordBytes) }, judge: { sha256: await sha256(holoBytes), blake3: kappa(holoBytes) } };

  $('title').textContent = record.title || record.name;
  for (const [name, l] of Object.entries(labels)) {
    const row = el('tr');
    row.append(el('th', name === 'record' ? 'App record' : 'Rule judge'), el('td', l.blake3, 'mono'), el('td', l.sha256, 'mono'));
    $('fingerprint').append(row);
  }

  // The request and the rules, in words.
  for (const f of record.fields) {
    const row = el('tr');
    row.append(el('th', f.name), el('td', f.kind === 'choice' ? f.values.join(', ') : `${f.min} to ${f.max}`));
    $('fields').append(row);
  }
  const { rules, otherwise } = readRules(record);
  for (const r of rules) $('rules').append(el('li', `${conditions(record, r.when)} → ${record.outcomes[r.answer]}`));
  $('rules').append(el('li', `otherwise → ${record.outcomes[otherwise]}`));

  // The audit-status model's own judge. Its record names the judge archive it needs by hash; the app's copy is used
  // only if it is that archive, and only if the archive verifies and replays its own vectors.
  const auditRecord = await (await fetch(new URL('./audit-status.rule-app.json', import.meta.url))).json();
  const kernel = await loadArchive(holoBytes, { capabilities: null, capabilitySet: undefined, allowUnverified: false });
  const judgeSound = auditRecord.kernel.holo === labels.judge.sha256 && kernel.identities?.verified === true && (await kernel.acceptance()).failed.length === 0;
  const auditJudge = judgeSound ? await judgeOf(auditRecord, kernel) : null;
  const appJudge = judgeSound ? await judgeOf(record, kernel) : null;

  // The examples, each replayed here through the judge.
  const replay = async () => {
    $('vectors').replaceChildren();
    state.vectors = [];
    for (const v of record.vectors) {
      const request = unhex(v.request), want = unhex(v.response);
      const got = appJudge ? await appJudge(request === '' ? [] : request.split(' ')) : null;
      const pass = got === want;
      state.vectors.push({ request, want, got, pass });
      const row = el('tr');
      row.append(el('td', request || '(empty)', 'mono'), el('td', want), el('td', got ?? 'no answer'), el('td', pass ? 'same' : 'DIFFERENT', pass ? 'ok' : 'bad'));
      $('vectors').append(row);
    }
    const passed = state.vectors.filter((v) => v.pass).length;
    $('vectorsSummary').textContent = `${passed} of ${state.vectors.length} examples give the recorded answer, replayed in this tab.`;
    return passed === state.vectors.length ? 'passed' : 'failed';
  };
  $('replay').addEventListener('click', replay);
  const replayed = state.vectors.length || record.vectors.length ? await replay() : 'none';

  // The guarantees, each waiting on the app's own proof.
  const rows = record.guarantees.map((g) => {
    const row = el('tr');
    const status = el('td', 'proving…', 'status');
    row.append(el('td', `When ${conditions(record, g.when)}, the answer is ${g.always ? 'always' : 'never'} ${record.outcomes[g.outcome]}.`), status, el('td', '', 'why'));
    $('guarantees').append(row);
    return row;
  });

  const found = await appFindings();
  state.facts = found.facts ?? null;
  // "This model" is the record on show: the frame must have loaded the same bytes this view read.
  const sameModel = !found.error && found.address === labels.record.sha256;
  const accepted = Array.isArray(found.proved?.accepted) ? found.proved.accepted : null;
  const WHY = { proved: "Lean's kernel accepted it in this tab, for this record", tested: 'not proved here; the examples pass', refused: 'see the cause', unknown: 'nothing in this tab backs it' };
  for (const [i, row] of rows.entries()) {
    const request = [accepted === null ? 'none' : accepted[i] ? 'accepted' : 'refused', sameModel ? 'this' : 'other', 'none', 'other', found.admitted === false ? 'failed' : replayed];
    const status = auditJudge ? await auditJudge(request) : 'unknown';
    const cause = !judgeSound ? 'the rule judge archive is not the verified one, so nothing is claimed'
      : found.error ? found.error
      : found.admitted === false ? 'the app refuses itself: its record, judge or proof is not the one it names'
      : request[0] === 'refused' ? "Lean's kernel did not accept it"
      : replayed === 'failed' ? 'an example gives a different answer than recorded'
      : found.proved?.error ? 'the kernel could not run here: ' + found.proved.error
      : found.timedOut ? 'the proof did not finish in 90 seconds'
      : WHY[status];
    row.children[1].textContent = status ?? 'unknown';
    row.children[1].dataset.status = status ?? 'unknown';
    row.children[2].textContent = cause;
    state.guarantees.push({ index: i, request: request.join(' '), status, cause });
  }
  const counts = {};
  for (const g of state.guarantees) counts[g.status] = (counts[g.status] ?? 0) + 1;
  $('summary').textContent = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(', ') + ` of ${rows.length} guarantees.`
    + (found.proved?.ms ? ` Proved in ${found.proved.ms} ms.` : '');
  state.summary = counts;
}

main().catch((e) => { state.error = String(e?.stack ?? e); $('summary').textContent = 'This audit could not be made: ' + (e?.message ?? e); })
  .finally(() => { state.ready = true; });
