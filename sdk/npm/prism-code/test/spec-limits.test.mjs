// A request has at most sixteen fields (MAX_FIELDS): sixteen validate, render a
// decoder of sixteen steps and answer as the rules say; seventeen are refused as
// fields.too-many; the JSON schemas and the MCP input agree on the limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FIELDS, SpecError, judge, respond, validateSpec } from '../src/journey/spec.mjs';
import { renderModel } from '../src/journey/render.mjs';
import { DRAFT_JSON_SCHEMA, SPEC_JSON_SCHEMA } from '../src/journey/spec-schema.mjs';

const wide = (n) => ({
  schema: 'prism/spec/1',
  name: 'wide-request',
  title: 'Wide request',
  purpose: 'Decides yes when the last of many switches is on.',
  fields: Array.from({ length: n }, (_, i) => ({ name: `switch${i + 1}`, kind: 'choice', values: ['off', 'on'] })),
  outcomes: ['yes', 'no'],
  rules: [{ when: [{ field: `switch${n}`, op: 'is', value: 'on' }], then: 'yes' }],
  otherwise: 'no',
  properties: [{ id: 'INV-001', kind: 'never', when: [{ field: `switch${n}`, op: 'is', value: 'off' }], then: 'yes', why: 'only the last switch says yes' }],
  examples: [
    { request: [...Array(n - 1).fill('off'), 'on'].join(' '), response: 'yes' },
    { request: Array(n).fill('off').join(' '), response: 'no' },
  ],
});

test('a request has at most sixteen fields', () => {
  assert.equal(MAX_FIELDS, 16);
});

test('sixteen fields validate, decode in sixteen steps and answer by the rules', () => {
  const spec = validateSpec(wide(MAX_FIELDS));
  assert.equal(spec.fields.length, 16);
  const line = [...Array(15).fill('off'), 'on'].join(' ');
  assert.equal(respond(spec, new TextEncoder().encode(line)), 'yes');
  assert.equal(judge(spec, Object.fromEntries(spec.fields.map((f) => [f.name, 'off']))).outcome, 'no');
  const model = renderModel(spec);
  for (let i = 1; i <= 16; i++) assert.ok(model.includes(`decodeField${i}`), `the model decodes field ${i}`);
  assert.ok(!model.includes('decodeField17'), 'no seventeenth decoder');
});

test('seventeen fields are refused as fields.too-many', () => {
  assert.throws(() => validateSpec(wide(MAX_FIELDS + 1)), (e) => e instanceof SpecError && e.message === 'A request has at most sixteen fields.' && e.rule === 'fields.too-many');
});

test('the JSON schemas take at most MAX_FIELDS fields', () => {
  assert.equal(SPEC_JSON_SCHEMA.properties.fields.maxItems, MAX_FIELDS);
  assert.equal(DRAFT_JSON_SCHEMA.properties.fields.maxItems, MAX_FIELDS);
});
