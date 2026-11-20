# Edit, check and prove (phases 2b and 2c, first steps)

A static page, with no build step, that opens one LexLean model for editing and shows LexLean's verdict as you type. It is the first step of phase 2b of `docs/proposals/prism-ide-phase-2.md`.

LexLean's front end runs in a worker in the tab. It is the executable prism-code pins (`src/journey/lexlean-wasm.mjs`), run on the in-memory file system prism-code already has (`src/journey/wasi-memory.mjs`), with the same command the SDK runs: `lexlean --diagnostic-format json check --all`. The worker inflates the executable and runs it only if its bytes hash to the pinned BLAKE3 label. Nothing is saved and nothing leaves the tab.

```sh
node tools/serve-edit.mjs <a folder holding lexlean.toml>     # from sdk/npm/prism-code/ide
# then open http://localhost:4170/edit/
```

Tried by hand in one browser, on `model/ide-capability-gate`:

| Step | Shown |
|---|---|
| Open | LexLean (18.2 MB inflated) checked against its label and ready in about 0.8 s; "The model checks, in 96 ms", with the identity `sha256:a245e321…`, the one prism-code gives this model |
| Break a line (`body: 2` to `body: (2`) | about 0.4 s after the edit: 1 problem, `LLP2001` at line 66, column 66; line 66 marked |
| Undo it | the mark clears; the model checks; the same identity |
| Change a rule (the fallback answer from 2 to 1) | the model checks; a different identity, `sha256:2cf31890…` |
| Name a type that does not exist | 1 problem, `LLT4001 forward or missing type` |
| Give the worker a label the executable does not hash to | the worker refuses to start and names both labels |

Later checks take 14 to 23 ms; the wait is the 350 ms pause after the last keystroke.

## Prove on edit (phase 2c, for rule tables)

When the model checks, the page goes on to its guarantees. LexLean gives the model's semantic snapshot; prism-code's `rule-table.mjs` reads it as a rule table; each guarantee is first tried against every request in the bounds, which finds a request that breaks it if there is one; then Lean's kernel, in a second worker (`prove-worker.mjs`), judges a proof term for each. "Proved" is the kernel's word alone, within the axioms a rule table is allowed. The kernel, its loader and its library run only when their bytes hash to what `src/journey/kernel/manifest.json` names. The kernel is put back to its just-loaded state before every batch.

Tried by hand in the same browser, on `model/ide-capability-gate`:

| Step | Shown |
|---|---|
| Open | 13 of 13 proved by Lean's kernel in the tab, in about 0.86 s; the kernel itself ready in about 0.7 s |
| Flip the last rule ("granted is yes → allow" to "granted is no → allow") | about 1.3 s after the edit: 7 proved, 6 broken, each broken one with the request that breaks it, such as `When granted = no and resource > write, the answer is never allow`: "the request `network yes no yes workspace no` answers allow" |
| Undo it | 13 of 13 proved again |
| A syntax error | the guarantees are hidden: a model that does not check has nothing to prove |

## In the VS Code workbench

`../model.html` with `../src/model-editor.js` is the same loop inside the workbench of `@codingame/monaco-vscode-api`: the model opens in the workbench's own editor, and the two workers above feed its own Problems panel.

- A LexLean diagnostic is an error marker at its place in the file.
- A guarantee a request breaks is an error marker on the line that states the guarantees, naming the request.
- A strip above the workbench says how many guarantees Lean's kernel proved.

```sh
npm ci                                             # from sdk/npm/prism-code/ide, once
npx vite build -c vite.model.config.js             # writes dist-model/, about 28 MB, not committed
node tools/serve-edit.mjs <a folder holding lexlean.toml>
# then open http://localhost:4170/edit/ide/
```

Tried by hand in the same browser, on `model/ide-capability-gate`:

| Step | Shown |
|---|---|
| Open | the model in the workbench editor; "13 of 13 guarantees proved by Lean's kernel in this tab, in 998 ms"; no problems |
| Flip the last rule | about 1.4 s after the edit: "7 of 13 … 6 not, listed under Problems"; the Problems panel lists 6 "Guarantee broken" entries at line 76, each with its request; the tab and the status bar show 6 |
| A syntax error | about 0.4 s after the edit: 1 problem from LexLean at line 66; guarantees not judged |
| Undo | no problems; 13 of 13 proved |

### Colours

`../src/lexlean-language.js` makes LexLean a language of the editor: the status bar names it, brackets and `%` comments behave, and the text is coloured.

- The tokenizer is written from the models in this repository, not from LexLean's grammar. It decides nothing: a wrong colour changes no verdict.
- The workbench cannot run a tokenizer of this kind on an open file: it logs an error for every line and colours nothing. So the tokenizer is registered under a name no file has and is only asked for a text's tokens, which are handed over as semantic tokens of the standard kinds (keyword, type, string, number, operator, property, namespace, comment).
- The workbench writes the stylesheet for token colours from its TextMate service, which this page does not load. The page writes that stylesheet itself from the theme's colour table, and again when the theme changes.

Tried by hand in the same browser. `edit/ide/?theme=<a theme's name>` opens the page in that theme.

| Model, theme | Shown |
|---|---|
| `model/ide-capability-gate`, Light 2026 | five distinct text colours in the visible lines; the prove loop unchanged (13 of 13; flip, 6 problems; undo, none) |
| the same, Dark Modern | coloured on the dark background; 13 of 13 proved |
| the same, Default High Contrast | five distinct text colours on black |
| `model/ide-scope`, Light 2026 | six distinct colours, numbers among them |
| a theorem file of `model/ide-scope`, put into the editor by script | `theorem`, `linear_arithmetic`, `project` and `false` as keywords; `Scope` in `Scope::judge` and `Bool` as types; operators and numbers coloured |

A diagnostic in another file of the project is now named in the strip rather than dropped. On `model/ide-scope` it reads `lexlean.toml: LLC0101: lean_toolchain must be exactly leanprover/lean4:v4.32.2`: the pinned LexLean refuses every model configured for Lean 4.32.1.

### Every file of the model

The workbench shows the model as its one folder, in its own Explorer, and any file can be opened and changed. The command palette (F1) and the keyboard shortcuts are the workbench's own.

- A check reads every file as it stands in the editor: the entry file, and any other file that was opened and changed.
- A diagnostic is marked in the file it is about, and listed under Problems with that file's name.
- A changed file keeps its change after its editor is closed, for as long as the tab is open. Nothing is written anywhere: a reload brings back the model as fetched.

Tried by hand in the same browser, on `model/ide-capability-gate`, and on an app's model served as Pages serves it:

| Step | Shown |
|---|---|
| Open | the Explorer lists `language`, `src` and the project's files; the entry file is open; 13 of 13 proved |
| Click `lexlean.lock` in the Explorer | it opens in a second tab |
| In `lexlean.toml`, change the Lean toolchain to one LexLean does not take | one problem, `LLC0101`, marked in `lexlean.toml`; guarantees not judged |
| Undo | no problems; 13 of 13 proved |
| F1, "Color Theme" | the command palette lists the theme commands |
| On an app's model, add a comment to `prism.toml` | still proved; "Your text still gives the rules the app at … runs." |

### Changes kept across a reload

The workbench page keeps the reader's changes in the browser, in the origin's private file system (`drafts.mjs`). Everything is named by its BLAKE3 label, from prism-code's own `blake3.mjs`:

- The model as fetched has one label, over its entry and every file's label: the base.
- Each changed file's text is stored once, under its own label.
- A draft says, for one base, which paths were changed and the label of each one's text.

So a draft belongs to exactly the model it was made on: when an app publishes a different model, the old draft is not laid over it. A stored text comes back only if its bytes derive again to its label; one that does not is left out and the page says so. A line under the strip names the changed files and has a "Discard my changes" button.

Tried by hand on the assembled site, served as Pages serves it:

| Step | Shown |
|---|---|
| Change the entry file and `prism.toml` | "Changed and kept in this browser: prism.toml, src/App.lex.tex." |
| Reload | both files open as they were left; the same line; the check runs on the restored text |
| "Discard my changes" | the page reloads with the model as fetched; 13 of 13 proved |
| A change on one model, then another model opened | the second model has no draft and no line |

`tools/drafts-test.mjs` holds the store to this on a directory in memory, with a stored text altered behind its back and a draft that names another model.

Limits of the workbench page:

- A draft is trusted no further than the origin that serves the page: another page of the same origin can write to the same store. It is the reader's convenience, not evidence of anything.
- Texts a discarded draft named stay in the browser until the site's data is cleared. Nothing names them.
- Where the browser has no private file system for the page (a private window), nothing is kept, and the line says a reload loses the changes. That case was not tried by hand.
- The plain edit page keeps nothing.
- New files, renames and deletions made in the Explorer are not read by a check: it reads the files the model was fetched with.
- Edits to files other than the entry were made by setting their text from a script, not by typing keys.

- Colours were looked at in three of the ten themes, and on three files. Names a model defines, such as `judge`, keep the plain text colour.
- The themes above were chosen by the address, before the command palette was switched on.
- The token stylesheet is also rewritten once a second, because the theme's colour table grows as tokens are first seen and no event says so.
- Every broken guarantee is reported on the one line where the guarantees are stated, not at its own place in that line.
- Edits were made by setting the editor's text from a script, not by typing keys.
- No extension runs on this page, so the capability gate is not loaded. Putting the two together is not done.
- The build is 28 MB and needs `npm ci`. The published site is 34 MiB with it.

## Published

`tools/build-edit-site.mjs` adds this page to the site `tools/build-audit-site.mjs` assembles, and `.github/workflows/ide-audit-pages.yml` publishes both on this repository's GitHub Pages: the plain page at `<pages>/edit/`, the workbench at `<pages>/edit/ide/`. Both work from whatever folder they are published in.

- The LexLean executable and the kernel are published beside the page. A browser cannot fetch them from where prism-code does, because those addresses do not let another site read them. The workflow checks that what it publishes is what prism-code pins, and the workers check again in the tab.
- With no address the page opens the capability gate's model, which comes with it.
- `?project=<address of a folder>` opens the model published there. The folder holds the model's files and a `project.json` listing them, `{ "files": ["lexlean.toml", "src/App.lex.tex", ...], "entry": "src/App.lex.tex" }`, as prism-code's `src/journey/model-files.mjs` writes it. Its host must let other sites read it; when it does not, the page says so.

Tried by hand on the assembled site, served from a subfolder as Pages serves it:

| Step | Shown |
|---|---|
| `edit/` | 13 of 13 proved by Lean's kernel in the tab |
| `edit/ide/` | the workbench, coloured; 13 of 13 proved; no file failed to load |
| `edit/ide/?project=` a second model on another origin that allows reading | that model: 5 of 5 proved |
| the same on an origin that does not allow reading | "The model at … could not be opened (Failed to fetch). It needs a project.json listing its files, and its host must let other sites read them." |

## An app's own model

A rule app built by prism-code publishes its model with its page: the build writes `model/` into the page's folder, with `model/project.json` listing it (`src/journey/model-files.mjs`). The audit page looks for that listing at the app's address and, when it is there, links to the editor with the app's model.

- What is published is what LexLean reads to check the model. Left out: anything whose name starts with a dot, `session.json` (it names folders on the author's machine), every other `.json` but `lake-manifest.json`, notes and logs.
- Both edit pages say whether the model they opened is the one its app runs (`app-match.mjs`). The app's record, `app.rule-app.json` beside `model/`, holds what the app runs: its rules as numbers, its guarantees, fields and answers. The page reads the model with LexLean and prism-code's `rule-table.mjs` and compares those four. Nothing is taken from what the listing says of itself, since the same host wrote both.
- The edit pages do not check the record. The audit page does.

Tried by hand, on a rule app built from `model/ide-command-table` by this checkout and served beside the assembled site, dot-files removed:

| Step | Shown |
|---|---|
| The app's own page | proves its 5 guarantees in the tab, as before |
| The audit page, given the app's address | 5 proved of 5, and "This app publishes its model. Open the model in the editor" |
| That link | the workbench with the app's model; 5 of 5 proved; the identity `sha256:8307e81d…`, the one the build proved |

The comparison, tried by hand in the workbench on that app and on a copy whose published model had one rule changed while its record was left alone:

| Step | Shown |
|---|---|
| The app's model | "This is the model the app at … runs: it gives the app's own rules, guarantees, fields and answers." |
| Change a rule in the editor | "Your changes differ from the app at … in its rules. The app itself is unchanged." |
| Undo | the first line again |
| A syntax error | the line is hidden: a model that does not check is compared with nothing |
| The altered copy | in red: "This is NOT the model the app at … runs: as published it differs from the app's record in its rules." |
| A model with no record beside it | "No app record is beside this model, so it is compared with no app." |
| The model that comes with the page | no line |

`tools/app-match-test.mjs` holds the comparison to a record the package's own build writes, with a record altered in each of the four.

Apps published before this have no `model/`, so the audit page offers no editor for them until they are built again. A holo app's page is not written by prism-code and publishes no model.

Limits:

- `index.html` here is a plain text area: no syntax colours, no completion, no formatting (the WASI build of LexLean refuses commands that write).
- On the plain page one file is editable: the project's first entrypoint. The workbench page opens every file.
- Rule tables only. A model with theorems of its own is checked, and the page says its guarantees are not proved here. `model-prove.mjs` could be tried for those; it did not finish on `model/ide-scope` in 40 minutes in Node.
- "Refused" (the kernel does not accept a guarantee that no request breaks) was never seen: no such model was tried.
- A blank line added at the end of the file makes LexLean refuse the model. That is LexLean's rule, shown as it reports it.
- Nothing an edit changes is saved or can be sent anywhere: the page has no way to write a model back.
- The pin reaches the page as `pin.json` from the same server that serves the page. That is no weaker than the page's own code, which the same server serves.
- LexLean's positions are shown as it gives them. A missing type is reported at the line of the module's first structure, not where it is used.
- No automated test runs the page.
