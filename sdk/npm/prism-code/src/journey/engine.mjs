/**
 * Check, prove, build and try a Prism app whose one source is its LexLean
 * model (project.mjs). Nothing here writes the model: the author does.
 *
 * Where LexLean's front end runs is frontend.mjs: the SDK image on this
 * machine, or the hosted verifier only when the user sets
 * PRISM_CODE_TIER=hosted. With neither, every step fails with
 * `build.frontend-unavailable`, which names Phase 3 of the canonical build
 * (LexLean's front end as WebAssembly) as the missing capability.
 *
 * A rule app (the `rule-app` starter) is checked by Lean's kernel in this
 * process from the model's semantic snapshot, and becomes the verified rule
 * judge with the model's numbers (rule-app.mjs). Any other app is proved by
 * `lexlean verify` and built into a holo in the SDK image.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PrismCodeError } from '../errors.mjs';
import { fromFile } from '../node.mjs';
import { VERSION } from '../version.mjs';
import { SDK_IMAGE_DOWNLOAD } from '../setup-machine.mjs';
import { gapLedger } from '../gaps.mjs';
import { NO_DOCKER_FREE_BUILD, frontendUnavailable, frontendWhere } from './frontend.mjs';
import { bind, isBound, newestHolo, sourceDigest } from './project.mjs';
import { BUILD_SCRIPT, CHECK_SCRIPT, DEFAULT_SDK_IMAGE, axiomViolations, buildProgress, docker, forbiddenAxioms, forbiddenMessage, hasImage, imageOf, parseDiagnostics, resolveDocker, runInImage, steps } from './sdk.mjs';

const PROVE_SCRIPT_FULL = [
  'echo "@@step prelock"; lexlean lock 2>&1; code=$?; echo "@@exit prelock $code"; [ $code -eq 0 ] || exit $code',
  'echo "@@step format"; lexlean fmt --all 2>&1; code=$?; echo "@@exit format $code"; [ $code -eq 0 ] || exit $code',
  'echo "@@step lock"; lexlean lock 2>&1; code=$?; echo "@@exit lock $code"; [ $code -eq 0 ] || exit $code',
  'echo "@@step check"; prismpm check 2>&1; code=$?; echo "@@exit check $code"; [ $code -eq 0 ] || exit $code',
  'echo "@@step verify"; lexlean verify --all 2>&1; code=$?; echo "@@exit verify $code"; exit $code',
].join('; ');

/** The image this app is or will be pinned to. */
const imageFor = (dir, session) => (isBound(dir) ? imageOf(dir) : session.image ?? DEFAULT_SDK_IMAGE);

/** Whether the SDK image can run here now: Docker answers and the image is on this machine. */
export const hasLocal = (dir, session) => !resolveDocker().error && hasImage(imageFor(dir, session));

/** Whether this app is a rule app: started from the `rule-app` starter. */
export const isRuleApp = (session) => session.starter === 'rule-app';

const tail = (text, n = 25) => String(text).split(/\r?\n/).filter((l) => !l.startsWith('@@')).slice(-n).join('\n');
const failure = (error) => ({ ok: false, code: error.code, message: error.message });

/**
 * Make sure Docker, the image and the project's SDK pin are in place. With
 * `pull`, a missing image is downloaded first and the log says so; without it,
 * a missing image is refused.
 */
export async function prepare(dir, session, log, { pull = false } = {}) {
  const d = resolveDocker();
  if (d.error) return { ok: false, code: 'build.frontend-unavailable', message: frontendUnavailable(d.error).message };
  const image = imageFor(dir, session);
  if (!hasImage(image)) {
    if (!pull) return { ok: false, code: 'build.frontend-unavailable', message: frontendUnavailable(`The SDK image is not on this machine. Run \`npx prism-code@latest setup --image ${image} --machine-only\` in a terminal, from any folder, to download it (about ${SDK_IMAGE_DOWNLOAD})`).message };
    log(`The SDK image is not on this machine yet. Downloading it once now, about ${SDK_IMAGE_DOWNLOAD}; this can take a while.`);
    const pulled = await docker(['pull', image], { onLine: (l) => /^(Status|Digest|[0-9a-f]{12}: Pull complete)/.test(l) && log(l) });
    if (pulled.code !== 0) return { ok: false, message: `Could not download the SDK image:\n${tail(pulled.output)}` };
  }
  if (!isBound(dir)) {
    log('Pinning the project to the SDK image (prismpm update)...');
    const r = await bind(dir, image, { onLine: log });
    if (!r.ok) return { ok: false, message: `Could not pin the SDK image:\n${tail(r.output)}` };
  }
  return { ok: true };
}

/**
 * The step a script was in when its output stopped: it began and never said how
 * it ended. A step that fails says so (`@@exit step code`), so a missing exit
 * means the shell itself went away: the container was killed, Docker or WSL
 * restarted, or the machine ran out of memory.
 */
export function cutOff(output) {
  const begun = [...String(output).matchAll(/^@@step (\S+)\s*$/gm)].map((m) => m[1]);
  const last = begun.at(-1);
  return last && !steps(output).some((s) => s.step === last) ? last : null;
}

/** The result of a job whose environment stopped under it: not the model's fault, and safe to run again. */
function interrupted(dir, kind, step, run, seconds) {
  writeFileSync(join(dir, '.prism-last.log'), run.output);
  return {
    ok: false,
    interrupted: true,
    stage: kind,
    step,
    seconds,
    message: `The ${kind} did not finish: its environment stopped during the ${step} step, before that step reported a result. Docker or WSL restarted, the machine ran out of memory, or the process was killed. Nothing is wrong with the model.`,
    next: `Call prism_${kind} again. If it stops again, free memory or close other builds first; what it printed is in prism/.prism-last.log.`,
  };
}

/** A holo under `.prism/build` that the toolchain finished verifying: a record under `.prism/verified` names its build and its bytes. */
export function verifiedHolo(dir) {
  const root = join(dir, '.prism', 'verified');
  if (!existsSync(root)) return null;
  const find = (value) => {
    if (Array.isArray(value)) return value.map(find).find(Boolean) ?? null;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.path === 'string' && value.path.endsWith('.holo') && typeof value.sha256 === 'string') return value;
    return Object.values(value).map(find).find(Boolean) ?? null;
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let record;
    try {
      record = JSON.parse(readFileSync(join(root, entry.name, 'manifest.json'), 'utf8'));
    } catch {
      continue;
    }
    const artifact = typeof record.build_id === 'string' && /^[0-9a-f]{64}$/.test(record.build_id) ? find(record) : null;
    if (!artifact || artifact.path.includes('/') || artifact.path.includes('\\')) continue;
    const holo = join(dir, '.prism', 'build', record.build_id, artifact.path);
    if (existsSync(holo) && createHash('sha256').update(readFileSync(holo)).digest('hex') === artifact.sha256) return holo;
  }
  return null;
}

/** Seconds since anything under the app's build folders changed, or null when there is none: a build still running keeps writing there. */
export function buildQuietFor(dir, { now = Date.now() } = {}) {
  let newest = 0;
  const visit = (d, depth) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = join(d, entry.name);
      try {
        newest = Math.max(newest, statSync(p).mtimeMs);
      } catch {
        // A file the build removed between the listing and the look.
      }
      if (entry.isDirectory() && depth < 4) visit(p, depth + 1);
    }
  };
  visit(join(dir, '.prism'), 0);
  visit(join(dir, 'target'), 0);
  return newest ? Math.max(0, Math.round((now - newest) / 1000)) : null;
}

/** A Lean warning, such as an unused simp argument: reported, never a reason a step failed. */
export const isWarning = (d) => d.severity === 'warning' || /^Lean rejected `[^`]+` \(warning\):/.test(d.message);

/** A `lexlean/diagnostic/1` from the hosted verifier, in the shape `parseDiagnostics` gives. */
export function fromHosted(d) {
  const p = d.primary;
  return { severity: d.severity ?? 'error', code: d.code, message: String(d.message ?? ''), span: p?.path ? { file: p.path, line: p.line_start, column: p.column_start } : null };
}

/** Diagnostics as the author reads them: code, message, and the line of the model they anchor to. */
const shown = (diagnostics) => diagnostics.filter((d) => !isWarning(d)).slice(0, 12).map((d) => ({ code: d.code, message: d.message.split('\n').slice(0, 8).join('\n'), at: d.span ? `${d.span.file}:${d.span.line}:${d.span.column ?? 1}` : null }));

/** What to do about the diagnostics, in one line. An axiom-policy diagnostic says which set Lean observed. */
function repair(diagnostics) {
  const fixes = axiomViolations(diagnostics);
  if (forbiddenAxioms(fixes).length) return forbiddenMessage(forbiddenAxioms(fixes));
  if (fixes.length) return `Lean observed other axioms than ${fixes.map((f) => `${f.name} declares`).join(', ')}; set each theorem's axioms to ${fixes.map((f) => `[${f.axioms.join(', ')}] for ${f.name}`).join('; ')}.`;
  return 'Fix the model at the lines named, then call the same tool again.';
}

/** Run a script in the image and read its diagnostics. */
async function inImage(dir, session, script, { log, kind, onLine }) {
  const ready = await prepare(dir, session, log, { pull: kind === 'build' });
  if (!ready.ok) return { done: { ok: false, stage: kind, code: ready.code, message: ready.message } };
  const started = Date.now();
  const run = await runInImage(dir, script, { socket: kind === 'build', onLine });
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(join(dir, '.prism-last.log'), run.output);
  if (run.code !== 0 && cutOff(run.output)) return { done: interrupted(dir, kind, cutOff(run.output), run, seconds) };
  return { run, seconds, diagnostics: parseDiagnostics(run.output) };
}

/** The hosted client, built only on the user's opt-in. */
async function hostedOf(client, gaps) {
  const hosted = await import('../hosted.mjs');
  return { hosted, client: client ?? hosted.hostedClient({ version: VERSION, gaps }) };
}

/**
 * Check the model: LexLean reads, links and elaborates it, and every
 * diagnostic is returned anchored to its line. Proves nothing.
 */
export async function check(dir, session, { log = () => {}, env = process.env, client = null, gaps = gapLedger(), local = () => hasLocal(dir, session) } = {}) {
  let where;
  try {
    where = frontendWhere({ env, hasLocal: local });
  } catch (error) {
    return failure(error);
  }
  if (where === 'hosted') {
    const h = await hostedOf(client, gaps);
    log(`Checking the model on the hosted verifier ${h.client.url}. The files under prism/src/ are sent and stored unlisted.`);
    let result;
    try {
      result = await h.hosted.hostedCheck(h.client, h.hosted.hostedProject(dir));
    } catch (error) {
      return { ok: false, where, code: error.code, message: `The hosted verifier did not check the model: ${error.message}` };
    }
    const diagnostics = (result.outcome.diagnostics ?? []).map(fromHosted);
    session.status.checked = result.outcome.success ? { source: sourceDigest(dir), at: new Date().toISOString(), where } : null;
    return result.outcome.success ? { ok: true, where, message: 'The model checks.' } : { ok: false, where, diagnostics: shown(diagnostics), message: repair(diagnostics) };
  }
  log('Locking, formatting and checking the model in the SDK image...');
  const r = await inImage(dir, session, CHECK_SCRIPT, { log, kind: 'check', onLine: (l) => /^(error|warning|checked|check passed)/.test(l) && log(l) });
  if (r.done) return r.done;
  const ok = r.run.code === 0;
  session.status.checked = ok ? { source: sourceDigest(dir), at: new Date().toISOString(), where, seconds: r.seconds } : null;
  return ok ? { ok: true, where, seconds: r.seconds, message: `The model checks, in ${r.seconds} s.` } : { ok: false, where, seconds: r.seconds, diagnostics: shown(r.diagnostics), message: repair(r.diagnostics), output: r.diagnostics.length ? undefined : tail(r.run.output) };
}

/**
 * Prove the model. A rule app's guarantees are checked by Lean's kernel in
 * this process from its semantic snapshot; any other app's theorems are proved
 * by `lexlean verify`. Returns `{ ok, where, guarantees | message, diagnostics }`.
 */
export async function prove(dir, session, { log = () => {}, env = process.env, client = null, gaps = gapLedger(), kernel = null, local = () => hasLocal(dir, session) } = {}) {
  let where;
  try {
    where = frontendWhere({ env, hasLocal: local });
  } catch (error) {
    return failure(error);
  }
  if (isRuleApp(session)) return proveRuleApp(dir, session, { log, where, client, gaps, kernel, env });
  const started = Date.now();
  if (where === 'hosted') {
    const h = await hostedOf(client, gaps);
    log(`Asking Lean to prove the model on the hosted verifier ${h.client.url}. The files under prism/src/ are sent and stored unlisted: not searchable, but readable by anyone with the draft's ID.`);
    let project;
    let outcome;
    try {
      project = h.hosted.hostedProject(dir);
      const all = { ...project, entrypoints: project.files.map((f) => f.path).filter((p) => h.hosted.moduleOf(p)) };
      outcome = await h.hosted.hostedVerify(h.client, all, { onWait: (s) => s % 30 < 5 && log(`Lean is working, ${s} s...`) });
      if (outcome.state === 'verified') h.hosted.writeHostedRecord(dir, { ...outcome, url: h.client.url, entrypoints: all.entrypoints });
    } catch (error) {
      return { ok: false, where, code: error.code, message: `The hosted verifier did not prove the model: ${error.message}` };
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    if (outcome.state === 'verified') return proved(dir, session, { where, seconds, attestation: outcome.record.attestation_id });
    const diagnostics = outcome.diagnostics.map(fromHosted);
    return { ok: false, where, seconds, diagnostics: shown(diagnostics), message: repair(diagnostics) };
  }
  log('Formatting, locking and checking the model, then asking Lean to prove it in the SDK image...');
  const r = await inImage(dir, session, PROVE_SCRIPT_FULL, { log, kind: 'prove', onLine: (l) => /^(error|warning|verified|checked|check passed)/.test(l) && log(l) });
  if (r.done) return r.done;
  if (r.run.code === 0) return proved(dir, session, { where, seconds: r.seconds });
  return { ok: false, where, seconds: r.seconds, diagnostics: shown(r.diagnostics), message: repair(r.diagnostics), output: r.diagnostics.length ? undefined : tail(r.run.output) };
}

/** Record that Lean proved this model as it is on disk. */
function proved(dir, session, { where, seconds, attestation = null }) {
  session.status.proved = { source: sourceDigest(dir), at: new Date().toISOString(), where, seconds, ...(attestation ? { attestation } : {}) };
  const there = where === 'hosted' ? ' on the hosted verifier, which is trusted, not local' : ' in the SDK image on this machine';
  return { ok: true, where, seconds, ...(attestation ? { attestation } : {}), message: `Lean proved every theorem of the model (lexlean verify --all)${there}, in ${seconds} s.` };
}

/**
 * The model's semantic snapshot, `lexlean/semantic-snapshot/2`: the JSON LexLean
 * exports for it. This prism-code takes it from the hosted verifier, on the
 * user's opt-in; on this machine it needs LexLean's front end as WebAssembly
 * (Phase 3). Throws `build.frontend-unavailable` otherwise.
 */
async function snapshotOf(dir, { where, client, gaps, log }) {
  if (where !== 'hosted') throw frontendUnavailable("A rule app is read from its model's semantic snapshot, and the SDK image does not give this prism-code one");
  const h = await hostedOf(client, gaps);
  log(`Taking the model's semantic snapshot on the hosted verifier ${h.client.url}. The files under prism/src/ are sent and stored unlisted.`);
  return (await h.hosted.hostedSnapshot(h.client, h.hosted.hostedProject(dir))).snapshot;
}

/**
 * A rule app: its table read from the snapshot, every guarantee tried for a
 * counterexample, then judged by Lean's kernel in this process, and the
 * verdict on the whole check given by the verified guest (kernel-verdict.mjs).
 */
async function proveRuleApp(dir, session, { log, where, client, gaps, kernel, env }) {
  const started = Date.now();
  const { ruleTable, tableWords, counterexample } = await import('./rule-table.mjs');
  let table;
  try {
    table = ruleTable(await snapshotOf(dir, { where, client, gaps, log }));
  } catch (error) {
    return { ...failure(error), where };
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
 * model's numbers, named together, with its page; any other app is proved,
 * then built into a holo in the SDK image, and its vectors are replayed here.
 */
export async function build(dir, session, { log = () => {}, env = process.env, client = null, gaps = gapLedger(), kernel = null, remote = null, local = () => hasLocal(dir, session) } = {}) {
  if (remote === 'github') return { ...failure(new PrismCodeError('build.publish-unavailable', `Publishing to GitHub writes the template's ID rows, scenarios and tests, and this prism-code does not yet write them from the model's semantic snapshot. Until it does, an app builds on this machine. ${NO_DOCKER_FREE_BUILD}`)), stage: 'build' };
  if (isRuleApp(session)) return buildRuleApp(dir, session, { log, env, client, gaps, kernel, local });
  const current = session.status.proved?.source === sourceDigest(dir);
  if (!current) {
    const p = await prove(dir, session, { log, env, client, gaps, local });
    if (!p.ok) return { ...p, stage: 'prove' };
  }
  if (env.PRISM_CODE_TIER === 'hosted' && !local()) return { ok: false, stage: 'build', code: 'build.frontend-unavailable', message: `The model is proved on the hosted verifier, and a holo is built in the SDK image, which is not on this machine. ${NO_DOCKER_FREE_BUILD}` };
  log('Building the app: Lean export, Rust, WebAssembly, the holo and its independent acceptance run. The first build takes ten minutes or more...');
  const r = await inImage(dir, session, BUILD_SCRIPT, {
    log,
    kind: 'build',
    onLine: (l) => {
      const stage = buildProgress(l);
      if (stage) log(stage);
      else if (/^(error|warning|verified|built|wrote|PP\d|  \w)/.test(l)) log(l);
    },
  });
  if (r.done) return r.done;
  if (r.run.code !== 0) return { ok: false, stage: 'build', seconds: r.seconds, message: 'The build failed. The last lines are below; the whole log is prism/.prism-last.log.', diagnostics: shown(r.diagnostics), output: r.diagnostics.length ? undefined : tail(r.run.output, 30) };
  const holo = newestHolo(dir);
  if (!holo) return { ok: false, stage: 'build', seconds: r.seconds, message: 'The build passed but wrote no holo that Prism could find under prism/.prism/build. That is a fault in Prism or the toolchain, not in the model.' };
  return built(dir, session, holo, r.seconds);
}

/** Record a built holo, replay its vectors here and say how to run it. */
export async function built(dir, session, holo, seconds) {
  const app = await fromFile(holo);
  const acceptance = await app.acceptance();
  session.status.holo = holo;
  session.status.built = { source: sourceDigest(dir), at: new Date().toISOString(), seconds, passed: acceptance.passed, total: acceptance.total };
  writeFileSync(join(dir, 'run-policy.json'), '{"minimum": "P0"}\n');
  const rel = relative(process.cwd(), holo) || holo;
  const policy = relative(process.cwd(), join(dir, 'run-policy.json')) || join(dir, 'run-policy.json');
  const ok = acceptance.failed.length === 0;
  return {
    ok,
    stage: 'build',
    seconds,
    holo,
    vectors: { passed: acceptance.passed, total: acceptance.total },
    message: ok
      ? `Built in ${seconds} s. Lean proved the model before the build. Tested: ${acceptance.passed} of ${acceptance.total} acceptance vectors pass in the built guest. The holo carries no signed proof statement, so the default \`prism-code check\` reports P0; run it with the run policy below.`
      : `Built, but ${acceptance.failed.length} of ${acceptance.total} acceptance vectors fail in the guest: the model's vectors and its judge disagree.`,
    run: { serve: `npx prism-code run "${rel}" --policy "${policy}" --port 8080` },
  };
}

/** A rule app: kernel-checked from its snapshot, then written as the rule judge and its numbers, with its page. */
async function buildRuleApp(dir, session, { log, env, client, gaps, kernel, local }) {
  const started = Date.now();
  let where;
  try {
    where = frontendWhere({ env, hasLocal: local });
  } catch (error) {
    return { ...failure(error), stage: 'prove' };
  }
  const checked = await proveRuleApp(dir, session, { log, where, client, gaps, kernel, env });
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
  return { ...failure(new PrismCodeError('try.unbuilt', 'Nothing is built yet, so nothing answers: call prism_build first. Prism answers only from a built app, never from a second reading of the model.')), request };
}

