// Is the model that was opened the one its app runs?
//
// A rule app's page publishes its model in model/, beside the app's record (app.rule-app.json). The record holds what
// the app runs: the rules as numbers, the guarantees, the fields and the answers. A model is the app's when LexLean's
// reading of it gives exactly those. That is compared here, with prism-code's own reading of a rule table; nothing is
// taken from what the model's listing says of itself, since the same host wrote both.
//
// This page does not check the record. The audit page does: it has Lean's kernel prove the record's guarantees.

/** The record beside a model published at `project` (an address ending in model/), or null when there is none. */
export async function appRecord(project) {
  if (!project) return null;
  const address = new URL('../app.rule-app.json', project).href;
  try {
    const response = await fetch(address, { cache: 'no-store' });
    if (!response.ok) return null;
    const record = await response.json();
    if (!Array.isArray(record?.words) || !Array.isArray(record?.guarantees)) return null;
    return { address, app: new URL('../', project).href, record };
  } catch { return null; }
}

/** What a rule table gives that a record holds: the same four things, made the same way the build makes them. */
export const tableFacts = (table, { tableWords, tableShape }) => ({ ...tableWords(table), fields: tableShape(table).fields, outcomes: [...table.answers] });

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Which of the four differ between a table's facts and a record: [] when the model is the app's. */
export function differences(facts, record) {
  const out = [];
  if (!same(facts.words, record.words)) out.push('rules');
  if (!same(facts.guarantees, record.guarantees)) out.push('guarantees');
  if (!same(facts.fields, record.fields)) out.push('fields');
  if (!same(facts.outcomes, record.outcomes)) out.push('answers');
  return out;
}

/** One sentence for the reader. `edited` is whether the text differs from what was fetched. */
export function verdict(found, differs, edited) {
  if (!found) return { state: 'none', text: 'No app record is beside this model, so it is compared with no app.' };
  if (differs.length === 0) return { state: 'same', text: edited ? `Your text still gives the rules the app at ${found.app} runs.` : `This is the model the app at ${found.app} runs: it gives the app's own rules, guarantees, fields and answers.` };
  const what = differs.join(', ');
  return edited
    ? { state: 'changed', text: `Your changes differ from the app at ${found.app} in its ${what}. The app itself is unchanged.` }
    : { state: 'other', text: `This is NOT the model the app at ${found.app} runs: as published it differs from the app's record in its ${what}.` };
}
