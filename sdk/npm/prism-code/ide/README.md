# Prism IDE (spike)

A browser-first IDE for Prism apps: the editor and extension host of `@codingame/monaco-vscode-api`, with every call an extension makes to the page judged by LexLean models before it runs.

This folder is a spike. It is not in the published `prism-code` package, and `prism-code setup` does not install or open it.

## What decides

| Decision | Model | State |
|---|---|---|
| May this extension use this resource: deny, allow or ask | [`../model/ide-capability-gate`](../model/ide-capability-gate/README.md) | 13 guarantees accepted by Lean's kernel; the page runs the built judge |
| Is this editor command `show` or `exec` | [`../model/ide-command-table`](../model/ide-command-table/README.md) | 5 guarantees accepted by Lean's kernel; the page runs the built judge |
| Is this path or host inside a granted scope | [`../model/ide-scope`](../model/ide-scope/README.md) | 8 theorems proved by Lean; the page runs `src/scope.js`, a tested copy of the rules, not the model |

Everything else in `src/` is unproved page code: turning a call into a request (`main.js`, `method-table.json`), the Prism ID wiring and the signed, sealed grants store (`identity.js`), and the scope rules copy (`scope.js`).

## What was measured

[`BATCH.md`](BATCH.md): the 25 most-downloaded Open VSX web extensions, loaded unmodified. 18 activate with the gate on, the same 18 as with it off. [`SPIKE.md`](SPIKE.md) and [`METHOD-TABLE.md`](METHOD-TABLE.md) describe the gate's two hooks and the class of every method an extension can call.

## What is not here

- The extensions under test. `tools/fetch_batch.py` downloads them from open-vsx.org and checks each against the SHA-256 in `public/ext/batch.json`. Each has its own licence.
- The judge archive and the copy of prism-code the page loads (`public/gate/kernel.holo`, `public/gate/prism-code/`). Building either rule-table model with prism-code writes them to its `.prism/site/`.
- The Prism ID frame. `tools/prism-frame-pin.mjs` fetches it from `UOR-Foundation/template` at the commit in `public/prism-frame/PIN.json` and checks every file against that record.

## Run it

```sh
npm ci
python -I tools/fetch_batch.py           # the extensions under test
node tools/prism-frame-pin.mjs           # the Prism ID frame
# copy kernel.holo and prism-code/ from a built rule-table model's .prism/site/ into public/gate/
npx vite build
npx vite preview --port 4173 --strictPort &
npx vite preview --port 4174 --strictPort &   # the second origin the extension worker runs on
# then open http://localhost:4173/batch.html
node tools/scope-test.mjs                # the scope rules copy, 35 cases
```

## Known limits

- Which worker hosts which extension is taken from the worker's own activation notices.
- The Prism ID relay is not admitted, so the id stays on one device; linking, sync and recovery are untested here.
- Activation only: apart from one extension, no extension's actual feature was exercised.
- Nothing is stored in or fetched from a kappa-registry; only the `blake3:` label form is shared with it.

## The audit view (phase 2a)

`audit/` is a static page, with no build step, that shows one rule app as a person can check it: its rules in words, each guarantee with what backs it, its examples replayed, and its fingerprint in BLAKE3 and SHA-256. It is the first step of `docs/proposals/prism-ide-phase-2.md`.

It proves nothing itself. The app's own published page already checks its judge archive, runs its examples and proves every guarantee with Lean's kernel in the tab; the audit view loads that page in a frame and reads what it found. What a guarantee may then be called is asked of the proved audit-status model ([`../model/ide-audit`](../model/ide-audit/README.md)), whose built record is `audit/audit-status.rule-app.json`.

```sh
node tools/serve-audit.mjs <a rule app's .prism/site folder>
# then open http://localhost:4180/audit/
```

Tried by hand in one browser, on `model/ide-capability-gate` built as a rule app:

| Published app | Shown |
|---|---|
| As built | 13 of 13 guarantees proved, in about 2 s; 6 rules and the fallback in words; 19 of 19 examples the same |
| One rule changed, old proof kept | 0 proved, 13 refused: the app refuses itself; the changed rule reads "granted is no → allow"; 11 of 19 examples the same |
| One rule changed, proof removed | 0 proved, 13 refused: an example gives a different answer than recorded |

Limits:

- The app must be served from the audit page's origin, because the view reads the app page's findings directly.
- The copy of prism-code the app publishes is used as it is, unverified. Fetching by content label is phase 2d.
- An app that refuses itself is reported to the audit-status model as failing its examples. The model has no word for "the app did not admit its own record"; that is the conservative choice among the words it has, and a reason to give it one.
- Rule apps only. There is no attestation to read for a rule app, so "proved" here always means the kernel in this tab.
- No automated test runs the page. The table above is from a manual run.
