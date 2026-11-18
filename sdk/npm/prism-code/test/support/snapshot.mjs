// A `lexlean/semantic-snapshot/2` of a rule app, built to LexLean's published schema
// (UOR-Foundation/lexlean `schemas/semantic-snapshot-v2.schema.json`) for tests. It stands in for the
// snapshot LexLean exports: the terms are the schema's (`nat`, `string`, `nil`, `cons`, `record`), and
// only the envelope members the schema requires are filled. It is not LexLean's output.
import { createHash } from 'node:crypto';

const nat = (n) => ({ kind: 'nat', value: String(n) });
const str = (s) => ({ kind: 'string', value: s });
const list = (items, element) => items.reduceRight((tail, head) => ({ kind: 'cons', head, tail }), { kind: 'nil', element });
const record = (type, fields) => ({ kind: 'record', type: { name: type }, fields: Object.entries(fields).map(([field, value]) => ({ field, value })) });
const named = (name) => ({ kind: 'named', name });
const condition = (c) => record('Condition', { field: nat(c.field), op: nat(c.op), value: nat(c.value) });
const definition = (name, body) => ({ kind: 'definition', name, parameters: [], type_parameters: [], result: { kind: 'unit' }, body });

/** The parking fee app the `rule-app` starter states, as plain data. */
export const PARKING = Object.freeze({
  title: 'Parking fee tier',
  fields: [{ name: 'hours', least: 0, greatest: 24, values: [] }, { name: 'vehicle', least: 0, greatest: 2, values: ['car', 'motorcycle', 'truck'] }],
  answers: ['standard', 'free', 'premium'],
  otherwise: 0,
  rules: [
    { conditions: [{ field: 0, op: 4, value: 0 }], answer: 1 },
    { conditions: [{ field: 1, op: 4, value: 1 }], answer: 1 },
    { conditions: [{ field: 1, op: 4, value: 2 }], answer: 2 },
    { conditions: [{ field: 0, op: 2, value: 8 }], answer: 2 },
  ],
  guarantees: [
    { always: 0, conditions: [{ field: 1, op: 4, value: 1 }], answer: 2 },
    { always: 1, conditions: [{ field: 1, op: 4, value: 2 }, { field: 0, op: 2, value: 0 }], answer: 2 },
    { always: 0, conditions: [{ field: 0, op: 4, value: 0 }], answer: 0 },
  ],
  examples: [{ request: '0 car', answer: 'free' }],
});

/** The snapshot of a rule app stating `app`. `id` varies the semantic ID, as a changed model would. */
export function ruleAppSnapshot(app = PARKING, { id = 'parking' } = {}) {
  const digest = (s) => createHash('sha256').update(`${id}:${s}`).digest('hex');
  const declarations = [
    definition('title', str(app.title)),
    definition('fields', list(app.fields.map((f) => record('Field', { name: str(f.name), least: nat(f.least), greatest: nat(f.greatest), values: list(f.values.map(str), { kind: 'string' }) })), named('Field'))),
    definition('answers', list(app.answers.map(str), { kind: 'string' })),
    definition('otherwise', nat(app.otherwise)),
    definition('rules', list(app.rules.map((r) => record('Rule', { conditions: list(r.conditions.map(condition), named('Condition')), answer: nat(r.answer) })), named('Rule'))),
    definition('guarantees', list(app.guarantees.map((g) => record('Guarantee', { always: nat(g.always), conditions: list(g.conditions.map(condition), named('Condition')), answer: nat(g.answer) })), named('Guarantee'))),
    definition('examples', list(app.examples.map((e) => record('Example', { request: str(e.request), answer: str(e.answer) })), named('Example'))),
  ];
  return {
    spec: 'lexlean/semantic-snapshot/2',
    language: '1.2',
    source_id: digest('source'),
    semantic_id: digest('semantic'),
    compiler_semantics_id: digest('compiler'),
    lexicon_closure: {},
    modules: [{ name: 'App', lean_module: 'PrismApp.App', declarations: [], glossary: [], imports: [], linked_ir: {}, source: {}, visible_packages: [], semantic: { spec: 'lexlean/semantic-module/2', declarations } }],
  };
}
