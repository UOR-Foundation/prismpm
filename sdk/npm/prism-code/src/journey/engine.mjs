/**
 * Check, prove, build and try a Prism app whose one source is its LexLean
 * model (project.mjs). Nothing here writes the model: the author does, and
 * nothing here runs a local image.
 *
 * Where each step runs is frontend.mjs: LexLean as WebAssembly on this
 * machine checks the model and takes its semantic snapshot, and Lean's kernel
 * proves any other app's theorems in this process (model-prove.mjs). Nothing
 * about an app is sent anywhere: there is no hosted route.
 *
 * A rule app (the `rule-app` starter) is checked by Lean's kernel in this
 * process from the model's semantic snapshot, and becomes the verified rule
 * judge with the model's numbers (rule-app.mjs). Any other app is proved by
 * the kernel path, and is not built into a holo here: that needs Rust and
 * WebAssembly, which no step runs without an image yet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PrismCodeError } from '../errors.mjs';
import { fromFile } from '../node.mjs';
import { VERSION } from '../version.mjs';
import { gapLedger } from '../gaps.mjs';
import { NO_DOCKER_FREE_BUILD, frontendWhere, proverWhere } from './frontend.mjs';
import { lexleanReady, wasmCheck, wasmSnapshot } from './lexlean-wasm.mjs';
import { collectIfUpgraded, withStoreHeld } from './store-gc.mjs';
import { sourceDigest } from './project.mjs';
import { hints } from './hints.mjs';
import { axiomViolations, forbiddenAxioms, forbiddenMessage } from './sdk.mjs';

/** A front-end probe that answers what was found. */
const wasmProbe = (here) => () => here;

/** Whether this app is a rule app: started from the `rule-app` starter. */
export const isRuleApp = (session) => session.starter === 'rule-app';

const failure = (error) => ({ ok: false, code: error.code, message: error.message });

/** A Lean warning, such as an unused simp argument: reported, never a reason a step failed. */
export const isWarning = (d) => d.severity === 'warning' || /^Lean rejected `[^`]+` \(warning\):/.test(d.message);

/** A `lexlean/diagnostic/1` from the hosted verifier, in the shape `parseDiagnostics` gives. */
export function fromHosted(d) {
  const p = d.primary;
  return { severity: d.severity ?? 'error', code: d.code, message: String(d.message ?? ''), span: p?.path ? { file: p.path, line: p.line_start, column: p.column_start } : null };
}

/**
 * Diagnostics as the author reads them: code, message, and the line of the model they anchor to. With the model's
 * folder, each also carries its hint (hints.mjs): where the name it quotes is written, that line, and the closest
 * names in scope when it is not one.
 */
const shown = (diagnostics, dir = null) => {
  const kept = diagnostics.filter((d) => !isWarning(d)).slice(0, 12);
  const extra = dir ? hints(kept, dir) : kept.map(() => ({}));
  return kept.map((d, i) => ({ code: d.code, message: d.message.split('\n').slice(0, 8).join('\n'), at: d.span ? `${d.span.file}:${d.span.line}:${d.span.column ?? 1}` : null, ...extra[i] }));
};

/** What to do about the diagnostics, in one line. An axiom-policy diagnostic says which set Lean observed. */
function repair(diagnostics, dir = null) {
  const fixes = axiomViolations(diagnostics);
  if (forbiddenAxioms(fixes).length) return forbiddenMessage(forbiddenAxioms(fixes));
  if (fixes.length) return `Lean observed other axioms than ${fixes.map((f) => `${f.name} declares`).join(', ')}; set each theorem's axioms to ${fixes.map((f) => `[${f.axioms.join(', ')}] for ${f.name}`).join('; ')}.`;
  // The first problem, when its hint names the fix: the replacement, and where to write it.
  const first = dir ? shown(diagnostics, dir)[0] : null;
  if (first?.didYouMean?.length && first.at) return `\`${first.name}\` is not in scope: at ${first.at} write ${first.didYouMean.map((n) => `\`${n}\``).join(' or ')} instead, then call the same tool again.`;
  if (first?.at && first.line) return `Fix ${first.at}, \`${first.line}\`, then call the same tool again.`;
  return 'Fix the model at the lines named, then call the same tool again.';
}

/**
 * Check the model: LexLean reads, links and elaborates it, and every
 * diagnostic is returned anchored to its line. Proves nothing.
 */
async function checkUnheld(dir, session, { log = () => {}, env = process.env, snapshot = null, gaps = gapLedger(), wasm = null } = {}) {
  wasm ??= wasmProbe(await lexleanReady({ env, log }));
  let where;
  try {
    where = frontendWhere({ env, hasWasm: wasm });
  } catch (error) {
    return failure(error);
  }
  let result;
  try {
    result = await wasmCheck(dir, { env });
  } catch (error) {
    return { ...failure(error), where };
  }
  const diagnostics = (result.diagnostics ?? []).map(fromHosted);
  session.status.checked = result.success ? { source: sourceDigest(dir), at: new Date().toISOString(), where, ms: result.ms, semanticId: result.semantic_id ? `sha256:${result.semantic_id}` : null } : null;
  return result.success ? { ok: true, where, ms: result.ms, semanticId: session.status.checked.semanticId, message: `The model checks, in ${result.ms} ms, with LexLean as WebAssembly on this machine.` } : { ok: false, where, ms: result.ms, diagnostics: shown(diagnostics, dir), message: repair(diagnostics, dir) };
}

/**
 * Prove the model. A rule app's guarantees are checked by Lean's kernel in
 * this process from its semantic snapshot; any other app's theorems by Lean's
 * kernel in this process (proveModel). Returns `{ ok, where, guarantees | message, diagnostics }`.
 */
async function proveUnheld(dir, session, { log = () => {}, env = process.env, snapshot = null, gaps = gapLedger(), kernel = null, modelKernel = null, wasm = null } = {}) {
  wasm ??= wasmProbe(await lexleanReady({ env, log }));
  let where;
  let frontend;
  try {
    where = frontend = frontendWhere({ env, hasWasm: wasm });
    // A rule app is proved by the rule judge's lemma in this process; any other app's theorems by the kernel path.
    if (!isRuleApp(session)) where = proverWhere();
  } catch (error) {
    return failure(error);
  }
  if (isRuleApp(session)) return proveRuleApp(dir, session, { log, where, snapshot, gaps, kernel, env });
  return proveModel(dir, session, { log, frontend, snapshot, gaps, kernel: modelKernel, env });
}

/**
 * Any app: its semantic snapshot lowered to kernel declarations, a proof found for each theorem, and Lean's kernel
 * judging all of it in this process (model-prove.mjs). Nothing is sent anywhere when LexLean runs here.
 */
async function proveModel(dir, session, { log, frontend, snapshot, gaps, kernel, env }) {
  const started = Date.now();
  let model;
  try {
    model = await snapshotOf(dir, { log, env, snapshot });
  } catch (error) {
    return { ...failure(error), where: 'kernel', ...(error.diagnostics ? { diagnostics: shown(error.diagnostics, dir), message: repair(error.diagnostics, dir) } : {}) };
  }
  const { modelProve } = await import('./model-prove.mjs');
  log("Asking Lean's kernel, in this process, to check every theorem of the model.");
  let result;
  try {
    result = await modelProve(model, { log, kernel, env });
  } catch (error) {
    return { ok: false, where: 'kernel', code: error.code ?? 'kernel.unavailable', message: `Lean's kernel could not run in this process (${error.message}). This says nothing about the app.` };
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const short = (name) => name.slice(name.lastIndexOf('.') + 1);
  const theorems = result.theorems.map((t) => ({ theorem: short(t.name), proof: t.proof, status: t.status, axioms: t.axioms }));
  if (result.refusal) return { ok: false, where: 'kernel', seconds, theorems, message: `The model could not be put to Lean's kernel: ${result.refusal}. This is a limit of this prover, not a verdict on the app.` };
  const missed = result.theorems.filter((t) => !t.status.startsWith('proved'));
  if (missed.length) return { ok: false, where: 'kernel', seconds, theorems, message: `${missed.length} of ${result.theorems.length} theorems are not proved: ${missed.slice(0, 3).map((t) => `${short(t.name)} (${t.status.replace(/^not proved: /, '')})`).join('; ')}.` };
  const fewer = result.theorems.filter((t) => t.status !== 'proved').length;
  session.status.proved = { source: sourceDigest(dir), at: new Date().toISOString(), where: 'kernel', seconds, semanticId: model.semantic_id ? `sha256:${model.semantic_id}` : null };
  return { ok: true, where: 'kernel', seconds, theorems, message: `Lean's kernel, in this process, accepted a proof of every one of the model's ${result.theorems.length} theorems over ${result.declarations} declarations, in ${seconds} s, each within its declared axioms${fewer ? ` (${fewer} on fewer than declared)` : ''}. ${result.remembered ? `${result.remembered} were remembered from earlier proofs on this machine, by their content, and ${result.judged} judged now. ` : ''}Nothing was sent anywhere.` };
}

/**
 * The model's semantic snapshot, `lexlean/semantic-snapshot/2`: the JSON LexLean as WebAssembly exports for it on
 * this machine. `snapshot`, a function of the folder, stands in for LexLean in tests.
 */
async function snapshotOf(dir, { log, env, snapshot = null }) {
  if (snapshot) return snapshot(dir);
  const taken = await wasmSnapshot(dir, { env });
  if (!taken.ok) throw Object.assign(new PrismCodeError('rule-table.refused', 'LexLean refused the model, so it has no semantic snapshot'), { diagnostics: (taken.check.diagnostics ?? []).map(fromHosted) });
  log(`Took the model's semantic snapshot with LexLean as WebAssembly, in ${taken.ms} ms.`);
  return taken.snapshot;
}

/**
 * A rule app: its table read from the snapshot, every guarantee tried for a
 * counterexample, then judged by Lean's kernel in this process, and the
 * verdict on the whole check given by the verified guest (kernel-verdict.mjs).
 */
async function proveRuleApp(dir, session, { log, where, snapshot, gaps, kernel, env }) {
  const started = Date.now();
  const { ruleTable, tableWords, counterexample } = await import('./rule-table.mjs');
  let table;
  try {
    table = ruleTable(await snapshotOf(dir, { log, env, snapshot }));
  } catch (error) {
    return { ...failure(error), where, ...(error.diagnostics ? { diagnostics: shown(error.diagnostics, dir), message: repair(error.diagnostics, dir) } : {}) };
  }
  const describe = (g, i) => `guarantee ${i + 1} (${g.always ? 'always' : 'never'} ${table.answers[g.outcome]})`;
  const broken = table.guarantees.map((g) => counterexample(table, g)).map((c, i) => ({ ...c, i })).filter((c) => c.request !== null);
  if (broken.length) {
    return { ok: false, where: 'kernel', semanticId: table.semanticId, message: broken.map((c) => `${describe(table.guarantees[c.i], c.i)} is false: the request \`${c.request}\` meets its conditions and the rules answer ${c.answer} (${c.rule === null ? 'otherwise' : `rule ${c.rule + 1}`}).`).join('\n'), next: 'Change a rule or the guarantee in the model, then prove again.' };
  }
  const { KERNEL_AXIOMS, kernelProve } = await import('./kernel-prove.mjs');
  const stated = tableWords(table);
  log("Asking Lean's kernel, in this process, to check every guarantee.");
  let result;
  try {
    result = await kernelProve(stated, { log, kernel, env });
  } catch (error) {
    return { ok: false, where: 'kernel', code: 'kernel.unavailable', message: `Lean's kernel could not run in this process (${error.message}). This says nothing about the app.` };
  }
  const refused = result.judged.filter((j) => !j.accepted).length;
  const { guestVerdict } = await import('./kernel-verdict.mjs');
  const { pinnedHolo, statementOf } = await import('./rule-app.mjs');
  let verdict;
  try {
    verdict = await guestVerdict(pinnedHolo(), { pinned: result.pinned, derived: { kernel: result.evidence.kernel, library: result.evidence.library }, bundle: result.evidence.bundle, statement: statementOf(stated.words, stated.guarantees), checked: result.evidence.statement, declared: KERNEL_AXIOMS, observed: result.evidence.axioms, accepted: refused === 0 });
  } catch (error) {
    verdict = { ok: false, code: error.code ?? 'verdictRuntimeFailed' };
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const guarantees = table.guarantees.map((g, i) => ({ guarantee: describe(g, i), status: result.judged[i].status }));
  if (!verdict.ok) return { ok: false, where: 'kernel', code: 'kernel.unavailable', guarantees, message: `The verdict guest gave no verdict (${verdict.code}). This says nothing about the app.` };
  if (refused || verdict.verdict !== 'proved') return { ok: false, where: 'kernel', guarantees, message: refused ? `Lean's kernel did not accept ${refused} guarantee${refused === 1 ? '' : 's'}, and no request the conditions tell apart breaks ${refused === 1 ? 'it' : 'them'}. This route cannot yet settle every true guarantee; that is not a verdict on the app.` : `Lean's kernel accepted every guarantee, and the verdict guest answered ${verdict.verdict}: a pinned address, the statement or the axioms are not the declared ones. Nothing is recorded.` };
  result.evidence.verdict = verdict.verdict;
  session.status.kernelChecked = { source: sourceDigest(dir), semanticId: table.semanticId, at: new Date().toISOString(), seconds, ...result.evidence };
  return { ok: true, where: 'kernel', seconds, semanticId: table.semanticId, guarantees, evidence: result.evidence, table, message: `Lean's kernel accepted all ${table.guarantees.length} guarantees for every request in the fields' bounds, in ${seconds} s, for the model ${table.semanticId}. This checks the rules as the verified rule judge reads them.` };
}

/**
 * Build the app. A rule app is written as the verified rule judge and the
 * model's numbers, named together, with its page. Any other app is refused:
 * its holo needs Lean's export, Rust and WebAssembly, which no step runs
 * without an image yet.
 */
async function buildUnheld(dir, session, { log = () => {}, env = process.env, snapshot = null, gaps = gapLedger(), kernel = null, remote = null, wasm = null } = {}) {
  wasm ??= wasmProbe(await lexleanReady({ env, log }));
  if (remote === 'github') return { ...failure(new PrismCodeError('build.publish-unavailable', `Publishing to GitHub writes the template's ID rows, scenarios and tests, and this prism-code does not yet write them from the model's semantic snapshot. ${NO_DOCKER_FREE_BUILD}`)), stage: 'build' };
  if (isRuleApp(session)) return buildRuleApp(dir, session, { log, env, snapshot, gaps, kernel, wasm });
  return { ...failure(new PrismCodeError('build.frontend-unavailable', `This app's holo is built from Lean's export through Rust to WebAssembly, and no step runs that without an image yet; a rule app (the rule-app starter) builds with nothing compiled. prism_prove proves this app's theorems. ${NO_DOCKER_FREE_BUILD}`)), stage: 'build' };
}

/** A rule app: kernel-checked from its snapshot, then written as the rule judge and its numbers, with its page. */
async function buildRuleApp(dir, session, { log, env, snapshot, gaps, kernel, wasm }) {
  const started = Date.now();
  let where;
  try {
    where = frontendWhere({ env, hasWasm: wasm });
  } catch (error) {
    return { ...failure(error), stage: 'prove' };
  }
  const checked = await proveRuleApp(dir, session, { log, where, snapshot, gaps, kernel, env });
  if (!checked.ok) return { ...checked, stage: 'prove' };
  const { loadRuleApp, ruleAppRecord } = await import('./rule-app.mjs');
  log("Writing the app as the verified rule judge and the model's numbers. Nothing is compiled.");
  let made;
  try {
    made = ruleAppRecord(checked.table, { proof: checked.evidence });
  } catch (error) {
    return { ...failure(error), stage: 'build' };
  }
  const path = join(dir, '.prism', 'build', `${made.record.name}.rule-app.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, made.bytes);
  let app;
  let acceptance;
  try {
    app = await loadRuleApp(readFileSync(path));
    acceptance = await app.acceptance();
  } catch (error) {
    return { ok: false, stage: 'build', where: 'kernel', code: error.code, message: `The rule judge could not run this app (${error.message}).` };
  }
  let site = null;
  if (acceptance.failed.length === 0) {
    const { writeRuleAppSite } = await import('./rule-app-site.mjs');
    site = writeRuleAppSite(join(dir, '.prism', 'site'), made.bytes).directory;
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  session.status.ruleApp = { path, address: made.address, semanticId: checked.semanticId, site, at: new Date().toISOString(), seconds, passed: acceptance.passed, total: acceptance.total, holo: app.record.kernel.holo };
  const ok = acceptance.failed.length === 0;
  return {
    ok,
    stage: 'build',
    where: 'kernel',
    seconds,
    app: path,
    address: made.address,
    semanticId: checked.semanticId,
    site,
    vectors: { passed: acceptance.passed, total: acceptance.total },
    message: ok
      ? `Built in ${seconds} s with nothing compiled: the app is the verified rule judge and the numbers of the model ${checked.semanticId}, named together as ${made.address}. Lean's kernel accepted all ${checked.table.guarantees.length} guarantees. Tested: ${acceptance.passed} of ${acceptance.total} acceptance vectors pass through it. Its page is the folder ${relative(process.cwd(), site) || site}: static files any host serves, which check the app in the browser before it answers.`
      : `Written, but ${acceptance.failed.length} of ${acceptance.total} acceptance vectors fail through the rule judge: an example in the model answers otherwise than its rules do.`,
  };
}

/** Answer one request from the built app: the holo, or the rule app's record. Nothing answers before a build. */
export async function tryRequest(dir, session, request) {
  const bytes = new TextEncoder().encode(request);
  if (session.status.holo && existsSync(session.status.holo)) {
    const app = await fromFile(session.status.holo);
    return { ok: true, request, answer: new TextDecoder().decode(await app.dispatch(bytes)), from: 'the built holo' };
  }
  const record = session.status.ruleApp;
  if (record?.path && existsSync(record.path)) {
    const { loadRuleApp } = await import('./rule-app.mjs');
    try {
      const app = await loadRuleApp(readFileSync(record.path));
      return { ok: true, request, answer: new TextDecoder().decode(await app.dispatch(bytes)), from: 'the built rule app (the verified rule judge)', current: session.status.ruleApp.semanticId !== undefined && session.status.kernelChecked?.source === sourceDigest(dir) };
    } catch (error) {
      return { ok: false, request, code: error.code, message: `The built rule app is refused: ${error.message}` };
    }
  }
  return { ...failure(new PrismCodeError('try.unbuilt', 'Nothing is built yet, so nothing answers: call prism_run, which builds first. Prism answers only from a built app, never from a second reading of the model.')), request };
}

/**
 * A step that holds the machine store while it runs, so no collection removes what it reads, after
 * collecting what an upgrade left behind (store-gc.mjs).
 */
const held = (step) => (dir, session, options = {}) => {
  const env = options.env ?? process.env;
  collectIfUpgraded({ env });
  return withStoreHeld(env, () => step(dir, session, options));
};

/** Check the model (checkUnheld), holding the store. */
export const check = held(checkUnheld);
/** Prove the model (proveUnheld), holding the store. */
export const prove = held(proveUnheld);
/** Build the app (buildUnheld), holding the store. */
export const build = held(buildUnheld);
