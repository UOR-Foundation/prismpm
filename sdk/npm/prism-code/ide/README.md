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
