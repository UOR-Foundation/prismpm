# Extension capability gate, version 3

2026-11-20. Model: `src/App.lex.tex`. Built with prism-code from PrismPM `origin/main` at `d18ff061`, rule-app starter, `PRISM_CODE_TIER=offline`. Nothing was sent to any server.

## What it decides

Whether an IDE extension may use a resource. One request, one answer: `deny`, `allow` or `ask`.

A request is six words, in order:

| Field | Values | Meaning |
|---|---|---|
| resource | show, read, write, network, secrets, exec | what the extension wants to do; exec is running code or commands |
| declared | no, yes | its manifest declares this capability |
| denied | no, yes | the user has refused it |
| trusted | no, yes | the workspace is trusted |
| target | outside, workspace, storage | where the call points; storage is the extension's own storage or log folder |
| granted | no, yes | the user has granted it |

Rules, first match decides:

1. denied → deny
2. not declared → deny
3. target outside → deny
4. target storage and resource is read or write → allow
5. untrusted workspace and resource is write, network, secrets or exec → deny
6. granted → allow
7. otherwise → ask

Rule 4 is new. It comes from the batch of 25 real extensions (`../../ide/BATCH.md`): 10 of them create or read their own storage folder at start-up, and one fails without it. In version 2 the page's JavaScript decided this; now the proved rules do.

## Proved

Lean's kernel (4.32.1) accepted all thirteen, for every request within the fields' bounds, in 4 s.

1. A denied request is always denied.
2. An undeclared capability is always denied.
3. A target outside the scope is always denied.
4. In an untrusted workspace, network, secrets and exec are always denied, whatever the target.
5. In an untrusted workspace, write, network, secrets and exec on a workspace target are always denied.
6. Nothing on a workspace target is ever allowed without a grant.
7. Network, secrets and exec are never allowed without a grant, whatever the target.
8. Show is never allowed without a grant.
9. Reading or writing its own storage is always allowed when declared and not denied.
10. Exec in an untrusted workspace is always denied.
11. Exec is never allowed without a grant.
12. A granted, declared, not-denied request on a workspace target in a trusted workspace is always allowed.
13. The same on a storage target is always allowed.

Together 3, 6, 7 and 8 say: the only thing ever allowed without a grant is reading or writing the extension's own storage.

Guarantees 5, 6, 12 and 13 are stated per target value. Written with "target is not storage" the kernel route refused them without a counterexample ("cannot yet settle every true guarantee"). The per-value form says the same thing, with guarantee 3 covering `outside`.

Model identity: `sha256:a245e321289408c327650395074cd1a67f83ba1c82fa2f6e87493fb2efeaf818`.
Built app: `sha256:7af80bf9c41450dff6ceed9729aef61e80ed65acedc448a59a5f05fd443f99ab`.
These names are SHA-256 because that is what prism-code emits today.

## Named by BLAKE3

The IDE names the judge by content, as BLAKE3 kappa labels in kappa-registry's form (`blake3:` and 64 lowercase hex, its `Axis::Blake3`):

- `app.rule-app.json`: `blake3:26c053f1bc5f88e9b1ad0a6f91f4c9b4b6a24c50592fb9db708d0781b6cf5dc7`
- `kernel.holo`: `blake3:9a26402323b5918c8db5568bdec2ebdd5a1579f907d223e9fbbeb2a4bc192af9`

`tools/kappa_labels.mjs` writes them to `../../ide/src/gate-pins.json`, which is compiled into the page. The page hashes both files before reading either and refuses the judge on a mismatch. The SHA-256 names stay as checked fields.

## Tested, not proved

19 of 19 acceptance vectors pass through the built judge.
In the browser spike, six cases from the batch give the same results under this judge as under version 2 with the JavaScript storage rule.
One byte changed in the served `app.rule-app.json`: the page refused the judge and denied every call.
The BLAKE3 code matches the official empty-input vector. It was not checked against a running kappa-registry.
The reading of a request from text is tested, not proved.

## Not covered

The gate proves the decision, not the facts fed to it. Whether `target` and `declared` are computed correctly is the body's job and is unverified. In the spike `declared` and `trusted` are constants.
The mapping from a call to a request is unproved JavaScript. The class of a command now comes from a second proved model (`../ide-command-table/README.md`); the lookup from command id to that model's word is still JavaScript.
Scope is one three-valued word. Path and host matching has its own model, `../ide-scope/README.md`, with 8 theorems verified by Lean. It is not built into a runnable judge; the page runs a tested hand-written copy of its rules.
Which worker hosts which extension is learned from the worker's own activation notices. A hostile worker could claim another extension's id. A page-side source for it is not wired.
Grants are an input. Storing them is the body's job: in the spike each extension's record is signed by the Prism id's session key and sealed with the id's workspace key (`../../ide/src/identity.js`). That code is tested, not proved.
Nothing is stored in or fetched from a kappa-registry. Only the label form is compatible.
This is a rule app, a static page plus a verified rule judge. It is not a `.holo`.

## Tooling problems found

The rule-app starter fails `prism_build` with `check: true` straight after `prism_init` with `LLC0102` (stale lock). The scaffold renames `lexlean.toml`, `lakefile.toml` and `lake-manifest.json` but keeps the template's `lexlean.lock`. Worked around by writing the three new SHA-256 values into `lexlean.lock` by hand. Seen on Windows; not checked elsewhere. Worth an issue on PrismPM.
The published `prism-code@0.9.5` on npm still ships the removed `prism_spec` tools. Main was run from a source export instead.

## Reproduce

From this folder, with prism-code from PrismPM main: `prism_build` with `check: true`, `prism_build`, then `prism_run` with a request such as `network yes no yes yes no`.

## Version history

Version 1: five resources, six guarantees.
Version 2: adds `exec`, eight guarantees. The judge archive (`kernel.holo`) is byte-identical across both versions; only the app record, which holds the rules as numbers and the proof statement, changed.

Version 3: `inscope` becomes `target` (outside, workspace, storage); own-storage read and write allowed without a grant; thirteen guarantees. The judge archive is again byte-identical.

The model is generated by `tools/gen_gate.py`, which rewrites the rule table inside `src/App.lex.tex`.
