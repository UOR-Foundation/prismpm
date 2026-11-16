/**
 * A rule app with no build: one fixed, verified holo that carries a rule judge,
 * and the spec written as the numbers that judge reads, named together.
 *
 * The holo is the Forge kernel from UOR-Foundation/foundry
 * (`studio/shell/kernel/kernel.holo`), built and verified once by the SDK. Its
 * rule judge (foundry `app/src/RuleJudge.lex.tex`) answers a request made of
 * the spec's numbers followed by the request's values. Nothing is compiled for
 * an app, so no Docker, Rust or Lean runs here.
 *
 * Two things differ from a built holo, and the record says both:
 * every rule app runs the same holo, so the record's address names the app,
 * not the holo's; and the text of a request is read here, outside the guest,
 * so refusing malformed text is tested by vectors, not carried by the guest.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadArchive } from '../index.mjs';
import { acceptanceVectors } from './render.mjs';
import { INVALID, decodeRequest, requestLimits } from './spec.mjs';
import { KernelUnread, ruleWords } from './kernel-prove.mjs';

export const RULE_APP_SCHEMA = 'prism/rule-app/1';
/** The rule judge's holo this package carries. A record names the holo it was made for by this address. */
export const RULE_JUDGE_HOLO = 'sha256:e775324ea3abf203d3f7cb0b5a31e2c6c2328d751fdddf5fa1c46aae4e0d8cee';
/** The judge reads at most this many numbers in one request: the spec's and the request's together. */
const WORDS_MAX = 1024;
const KEYS = Object.freeze(['schema', 'name', 'title', 'kernel', 'fields', 'outcomes', 'words', 'guarantees', 'vectors', 'proof']);

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hexWord = (n) => [0, 8, 16, 24].map((k) => ((n >>> k) & 255).toString(16).padStart(2, '0')).join('');
const readWord = (hex) => parseInt(hex.match(/../g).reverse().join(''), 16);
const hexOf = (bytes) => Buffer.from(bytes).toString('hex');

/** A record that is not a rule app, or not this one. `code` names why. */
export class RuleAppRefused extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuleAppRefused';
    this.code = code;
  }
}

/** The statement a kernel check speaks about: the same address kernel-prove.mjs gives its evidence. */
export const statementOf = (words, guarantees) => sha256(JSON.stringify(['prism/kernel-statement/1', words, guarantees]));

/** The pinned rule judge's holo, checked against its address. */
export function pinnedHolo({ read = () => readFileSync(new URL('./kernel/kernel.holo', import.meta.url)) } = {}) {
  const bytes = new Uint8Array(read());
  if (sha256(bytes) !== RULE_JUDGE_HOLO) throw new RuleAppRefused('rule-app.holo', "the rule judge's holo is not the pinned one");
  return bytes;
}

/**
 * The record of a rule app: a pure function of the spec and the proof's
 * evidence, so the same spec gives the same bytes on every machine.
 * Throws `KernelUnread` for a spec the rule judge does not read.
 */
export function ruleAppRecord(spec, { proof = null } = {}) {
  const { words, guarantees } = ruleWords(spec);
  if (words.length + spec.fields.length > WORDS_MAX) throw new KernelUnread('kernel.range', `it needs more than the ${WORDS_MAX} numbers the rule judge reads in one request`);
  const record = {
    schema: RULE_APP_SCHEMA,
    name: spec.name,
    title: spec.title,
    kernel: { holo: RULE_JUDGE_HOLO },
    fields: spec.fields.map((f) => (f.kind === 'choice' ? { name: f.name, kind: 'choice', values: [...f.values] } : { name: f.name, kind: 'number', min: f.min ?? 0, max: f.max })),
    outcomes: [...new Set([spec.otherwise, ...spec.rules.map((r) => r.then)])],
    words,
    guarantees,
    vectors: acceptanceVectors(spec).map((v) => ({ request: hexOf(v.bytes), response: hexOf(new TextEncoder().encode(v.response)) })),
    proof,
  };
  const bytes = new TextEncoder().encode(`${JSON.stringify(record, null, 1)}\n`);
  return { record, bytes, address: sha256(bytes) };
}

function readRecord(bytes) {
  let record;
  try {
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new RuleAppRefused('rule-app.malformed', 'the record is not JSON');
  }
  const isList = Array.isArray;
  const whole = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const shaped = record !== null && typeof record === 'object' && !isList(record)
    && JSON.stringify(Object.keys(record)) === JSON.stringify(KEYS)
    && record.schema === RULE_APP_SCHEMA
    && typeof record.kernel?.holo === 'string'
    && isList(record.fields) && record.fields.every((f) => typeof f?.name === 'string' && (f.kind === 'choice' ? isList(f.values) && f.values.every((v) => typeof v === 'string') : f.kind === 'number' && whole(f.min) && whole(f.max)))
    && isList(record.outcomes) && record.outcomes.every((o) => typeof o === 'string')
    && isList(record.words) && record.words.every(whole) && record.words.length + record.fields.length <= WORDS_MAX
    && isList(record.guarantees)
    && isList(record.vectors) && record.vectors.every((v) => /^([0-9a-f]{2})*$/.test(v?.request ?? 'x') && /^([0-9a-f]{2})*$/.test(v?.response ?? 'x'));
  if (!shaped) throw new RuleAppRefused('rule-app.malformed', `the record is not a ${RULE_APP_SCHEMA}`);
  // The numbers must be the ones the fields say: a record whose bounds and words disagree would decode one app and judge another.
  const bounds = record.fields.flatMap((f) => (f.kind === 'choice' ? [0, f.values.length - 1] : [f.min, f.max]));
  if (record.words[1] !== record.fields.length || bounds.some((b, i) => record.words[2 + i] !== b)) throw new RuleAppRefused('rule-app.fields', "the record's fields are not the ones its numbers state");
  // A proof that speaks about other numbers or other guarantees is not this app's.
  if (record.proof !== null && record.proof?.statement !== statementOf(record.words, record.guarantees)) throw new RuleAppRefused('rule-app.proof', "the record's proof is about another statement");
  return record;
}

/**
 * Load a rule app from its record. The holo must be the one the record names,
 * must verify, and must pass its own acceptance vectors before it answers.
 * Resolves `{ record, address, kernelChecked, dispatch, acceptance }`.
 */
export async function loadRuleApp(recordBytes, { holo = null } = {}) {
  const bytes = new Uint8Array(recordBytes);
  const record = readRecord(bytes);
  holo ??= pinnedHolo();
  if (sha256(holo) !== record.kernel.holo) throw new RuleAppRefused('rule-app.holo', `the record names the rule judge ${record.kernel.holo}, and this is another holo`);
  const kernel = await loadArchive(holo, {});
  if (kernel.identities?.verified !== true) throw new RuleAppRefused('rule-app.holo', "the rule judge's holo does not verify");
  const own = await kernel.acceptance();
  if (own.failed.length !== 0) throw new RuleAppRefused('rule-app.holo', `the rule judge fails ${own.failed.length} of its own ${own.total} acceptance vectors`);
  const shape = { fields: record.fields };
  const prefix = `rule ${record.words.map(hexWord).join('')}`;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const { requestMaximum } = requestLimits(shape);

  /** Bytes in, bytes out, as a built text app answers: the outcome's word, or `invalid`. */
  async function dispatch(request) {
    const input = new Uint8Array(request);
    if (input.length > requestMaximum) return enc.encode(INVALID);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      return enc.encode(INVALID);
    }
    const decoded = decodeRequest(shape, text);
    if (!decoded) return enc.encode(INVALID);
    const values = record.fields.map((f) => (f.kind === 'choice' ? f.values.indexOf(decoded[f.name]) : Number(decoded[f.name])));
    const reply = dec.decode(await kernel.dispatch(enc.encode(prefix + values.map(hexWord).join(''))));
    // The request was in the bounds, so any answer but an outcome is the judge and this reader disagreeing: a fault, never an answer.
    const outcome = /^ok [0-9a-f]{24}$/.test(reply) ? record.outcomes[readWord(reply.slice(11, 19))] : undefined;
    if (outcome === undefined) throw new RuleAppRefused('rule-app.judge', `the rule judge answered \`${reply.slice(0, 40)}\` to a request inside the bounds`);
    return enc.encode(outcome);
  }

  /** Replay the record's vectors through the judge. */
  async function acceptance() {
    const failed = [];
    for (const [index, v] of record.vectors.entries()) {
      let got;
      try {
        got = hexOf(await dispatch(Buffer.from(v.request, 'hex')));
      } catch (error) {
        got = `fault: ${error.message}`;
      }
      if (got !== v.response) failed.push({ index, request: v.request, expected: v.response, got });
    }
    return { total: record.vectors.length, passed: record.vectors.length - failed.length, failed };
  }

  return { record, address: sha256(bytes), kernelChecked: record.proof !== null, dispatch, acceptance };
}
