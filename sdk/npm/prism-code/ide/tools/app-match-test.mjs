// The comparison the edit pages make between a model and the app it was published with (ide/edit/app-match.mjs),
// against a record the package's own build writes. Usage: node ide/tools/app-match-test.mjs
import assert from 'node:assert/strict';
import { ruleAppRecord } from '../../src/journey/rule-app.mjs';
import { ruleTable, tableShape, tableWords } from '../../src/journey/rule-table.mjs';
import { ruleAppSnapshot } from '../../test/support/snapshot.mjs';
import { differences, tableFacts, verdict } from '../edit/app-match.mjs';

const read = { tableWords, tableShape };
const table = ruleTable(ruleAppSnapshot());
const { record } = ruleAppRecord(table);
const found = { app: 'https://example.invalid/app/', record };
const facts = () => tableFacts(table, read);

// The model the record was built from is the app's, by all four.
assert.deepEqual(differences(facts(), record), []);
assert.equal(verdict(found, [], false).state, 'same');
assert.match(verdict(found, [], false).text, /^This is the model the app at /);

// Planted defects: a record that differs in one thing is told apart, and the thing is named.
const altered = (change) => { const copy = structuredClone(record); change(copy); return copy; };
assert.deepEqual(differences(facts(), altered((r) => { r.words[r.words.length - 1] += 1; })), ['rules']);
assert.deepEqual(differences(facts(), altered((r) => { r.guarantees[0].always = !r.guarantees[0].always; })), ['guarantees']);
assert.deepEqual(differences(facts(), altered((r) => { r.fields[0].name += 'x'; })), ['fields']);
assert.deepEqual(differences(facts(), altered((r) => { r.outcomes[0] += 'x'; })), ['answers']);
assert.deepEqual(differences(facts(), altered((r) => { r.words.pop(); r.outcomes.reverse(); })), ['rules', 'answers']);

// A model published otherwise than its app runs is said plainly; the reader's own change is not blamed on the app.
assert.equal(verdict(found, ['rules'], false).state, 'other');
assert.match(verdict(found, ['rules'], false).text, /^This is NOT the model the app at .* in its rules\.$/);
assert.equal(verdict(found, ['rules'], true).state, 'changed');
assert.match(verdict(found, ['rules'], true).text, /The app itself is unchanged\.$/);
assert.equal(verdict(found, [], true).state, 'same');
assert.equal(verdict(null, [], false).state, 'none');

console.log('app-match: the model a record was built from matches it; a record altered in rules, guarantees, fields or answers does not');
