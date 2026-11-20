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
# then open http://localhost:4170/model.html
```

Tried by hand in the same browser, on `model/ide-capability-gate`:

| Step | Shown |
|---|---|
| Open | the model in the workbench editor; "13 of 13 guarantees proved by Lean's kernel in this tab, in 998 ms"; no problems |
| Flip the last rule | about 1.4 s after the edit: "7 of 13 … 6 not, listed under Problems"; the Problems panel lists 6 "Guarantee broken" entries at line 76, each with its request; the tab and the status bar show 6 |
| A syntax error | about 0.4 s after the edit: 1 problem from LexLean at line 66; guarantees not judged |
| Undo | no problems; 13 of 13 proved |

Limits of the workbench page:

- No syntax colours: the workbench has no grammar for `.lex.tex` and shows it as plain text.
- Every broken guarantee is reported on the one line where the guarantees are stated, not at its own place in that line.
- Edits were made by setting the editor's text from a script, not by typing keys.
- No extension runs on this page, so the capability gate is not loaded. Putting the two together is not done.
- The build is 28 MB and needs `npm ci`; it is not part of any published page.

Limits:

- `index.html` here is a plain text area: no syntax colours, no completion, no formatting (the WASI build of LexLean refuses commands that write).
- One file is editable: the project's first entrypoint. The other files are read once and sent with every check.
- Rule tables only. A model with theorems of its own is checked, and the page says its guarantees are not proved here. `model-prove.mjs` could be tried for those; it did not finish on `model/ide-scope` in 40 minutes in Node.
- "Refused" (the kernel does not accept a guarantee that no request breaks) was never seen: no such model was tried.
- A blank line added at the end of the file makes LexLean refuse the model. That is LexLean's rule, shown as it reports it.
- The executable is served from where prism-code keeps it on this machine. A published page would have to fetch it from its release address, whose cross-origin rules were not tried.
- The pin reaches the page as `pin.json` from the same server that serves the page. That is no weaker than the page's own code, which the same server serves.
- LexLean's positions are shown as it gives them. A missing type is reported at the line of the module's first structure, not where it is used.
- No automated test runs the page.
