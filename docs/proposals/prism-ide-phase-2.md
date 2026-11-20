# Prism IDE, phase 2: open any Prism app to audit it and edit it, in any browser

Status: proposed. Nothing in this file is built. Phase 1 is merged (#744).

## Why

A Prism app carries its own proof, but reading that proof today means reading a repository. The person who should be able to check an app is whoever is looking at it, in the tab they are already in.

Phase 2 gives every Prism app one control, **Open in IDE**. It opens the app's own model beside what backs it: which guarantees Lean proved, which examples were only tested, and the fingerprint of the bytes that are running. The same page lets them change a rule and see at once which guarantees still hold.

No install, no sign-in and no server of Prism's own. The visitor's Prism id is already in the frame.

## What exists, and what is missing

Read at `main` on 2026-11-20. Paths are under `sdk/npm/prism-code` unless they name the template.

| Piece | Exists | Missing for phase 2 |
|---|---|---|
| Audit of a holo app | The template's `bootstrap/page.mjs` renders `spec.html` at build time: theorems with their proof method, a "Tested, not proved" list, the examples, the fingerprint. `site/app.mjs` verifies the holo in a worker and sets the frame's `verdict`, `fingerprint` and `examples`. | It is a rendered page, not the model's source. Proofs are the build's; none is re-run in the tab. |
| Audit of a rule app | `src/journey/rule-app-site.mjs` writes `.prism/site/`. Its `start.mjs` checks the judge archive, runs every vector and re-proves every guarantee with Lean's kernel in the tab. | The page says "N guarantees hold". It lists neither the rules nor the guarantees. |
| LexLean in a browser | `src/journey/lexlean-wasm.mjs` pins the front end by BLAKE3 (19.1 MB, 4.1 MB compressed) and exposes `wasmCheck` and `wasmSnapshot`. `sdk/npm/lean-prover/web/lexlean-worker.mjs` already runs it in a worker. | prism-code itself runs it only in Node. There is no format function: the WASI build refuses commands that write. |
| Lean's kernel in a browser | `src/journey/kernel-prove.mjs` proves a rule app's guarantees in the tab (2.2 MB kernel, 7.8 MB library). `src/journey/model-prove.mjs` proves a model's theorems from its snapshot, for `linear_arithmetic`, `decide` and `reflexivity`. | `model-prove` did not finish on `model/ide-scope` (8 theorems, up to 28 numbers each) in 40 minutes on a development machine. Its limits on real models are not measured. |
| A local studio | `prism-code dev` serves `src/studio/` on port 4100. Its Check tab re-judges the holo in the page and compares with the CLI's verdict. | It needs its server for state and events. Its Replay tab is a stub (`src/dev-replay.mjs` always answers `unavailable`). |
| An editor | `ide/` is the phase 1 spike: `@codingame/monaco-vscode-api` with every extension call judged by the three IDE kernels. | It is not in the package. It knows nothing of LexLean or of a Prism app. |
| An entry point | `<prism-frame>` has one slot, `status`, and fixed trust checks. It is published by content address and loaded at run time, so a change to it reaches every app with no rebuild. | No edit, source-model or IDE control. |
| Storage by content | `src/journey/kappa-opfs.mjs` keeps proofs and images in OPFS. `lean-prover/web/sealed-store.mjs` uses OPFS with BLAKE3. The template's `site/sw.js` caches by a SHA-256 list. | `kappa-opfs` labels with SHA-256, not BLAKE3. Nothing fetches by label. There is no client for kappa-registry. |

## The one path

The IDE is one static page, published once by content address, like the frame. It is given an app by its address and reads everything else from the app's own published files. It is not copied into each app and it is not in the npm package: a package that grows by an editor would break its size budget (`scripts/check-package.mjs`, 2006 KiB today) for something a browser fetches anyway.

An app needs to publish three things the IDE reads, beside what it publishes now:

1. its model sources (`src/*.lex.tex` and the project files), listed with a BLAKE3 label each;
2. its verification record (which theorems, which axioms, which image, the attestation);
3. its acceptance vectors, which the holo and the rule-app record already carry.

`prism-code` writes 1 and 2 into the site at build. That is the whole change to what an app ships, and it is a few kilobytes.

## What is proved, tested, and neither

- **Proved, already**: the three IDE kernels (`model/ide-*`), which decide what an extension may do inside the IDE.
- **Proved, by reuse**: what the IDE displays as "proved" is what Lean's kernel accepts in the tab, or what the app's signed attestation says the build proved. The IDE never marks a guarantee proved on the model's word.
- **To be proved in phase 2**: one small model, `model/ide-audit`, stating how a guarantee's status is derived. The rule it must prove: a guarantee is shown as proved only if the kernel accepted it in this tab for this exact model, or a verified attestation names this exact model. Everything else is shown as tested or unknown.
- **Tested only**: the editor, the page, and every step that turns files into what the kernels and the audit model are asked.
- **Neither**: that the editor is pleasant to use. Phase 2 measures load time and proof time, not usability.

## Phases

Each phase ends in something a person can open. A phase that misses its gate stops the ones after it.

### Phase 2a: the audit view, read only

Work: one static page that takes an app's address and shows its rules, each guarantee with its status, its vectors with a replay control, and the fingerprint checked in the tab. Rule apps first, because their guarantees are data and the kernel already proves them in the tab. Then holo apps, from the verification record and the attestation. `model/ide-audit` with its proofs and workflow.

Gates: for `model/ide-capability-gate` published as a rule app, the page lists 6 rules and 13 guarantees, all marked proved by the kernel in the tab; with one rule changed in the published record, at least one guarantee is marked refused and none is marked proved from the old proof. `model/ide-audit` verified in CI with a planted defect rejected.

Budgets: first load to a full audit of a rule app within 5 s on a cold cache and 1 s warm, on the CI runner.

### Phase 2b: edit and check

Work: the model's `.lex.tex` in the phase 1 editor, with LexLean's front end in a worker checking on each pause in typing and marking diagnostics at their lines. No formatting on save, since the WASI build has none.

Gates: a syntax error is marked at its line within 1 s of the pause; a corrected file clears it. The front end is fetched by its BLAKE3 label and refused when one byte differs.

Budgets: the front end is 4.1 MB compressed and is fetched only when the editor opens, never by the audit view.

### Phase 2c: prove in the tab

Work: after a clean check, the kernel re-proves and the audit view updates in place. Rule apps through `kernelProve`. Models with theorems through `modelProve`, each theorem with a time limit, and "not settled in this tab" as an honest third answer.

Gates: the starter apps (`templates/starters/*`) prove in the tab. A measured table of which of this repository's models do and do not, with times. `model/ide-scope` is expected not to; the gate is that the page says so and offers the build's attestation, not that it proves it.

Budgets: none promised for arbitrary models. The table is the deliverable.

### Phase 2d: by content, offline

Work: every file the IDE and an app publish is named by its BLAKE3 label and fetched through one store that verifies before it returns. `kappa-opfs` labels move from SHA-256 to BLAKE3, with SHA-256 kept as a checked field where tooling emits it. A first read-only client for kappa-registry's blob endpoint as a second source.

Gates: a second visit to the audit view of an app makes no network request. One changed byte in any stored file is refused. A blob pushed to a locally run kappa-registry under a `blake3:` label is fetched and verified by the page.

Budgets: warm audit view within 1 s with the network off.

### Phase 2e: the entry point

Work: **Open in IDE** in the frame, shown when the app publishes the three things above. `prism-code` writes them at build. Conformance ids, a scenario and a package allowance for what the build now writes.

Gates: an app built from the template shows the control and opens its own audit view. An app that does not publish its sources shows no control. The frame's existing tests pass.

Budgets: the frame grows by under 2 KiB. An app's page pays nothing until the control is used.

## The goal, stated so it can be checked

The goal is the editing experience of vscode.dev, serverless and in any browser, without Microsoft's own services. It is not "feature complete with vscode.dev": parts of vscode.dev are services, and a page with no server cannot be one.

The workbench is not an imitation. `ide/` runs `@codingame/monaco-vscode-api`, which packages the open-source VS Code workbench that vscode.dev is built from. Layout, editor, palette and keybindings are the same code. The Visual Studio Code name, logo and product icons are Microsoft's and are not used.

"Tried" below means run in the phase 1 spike. "In the workbench" means the code is the same as vscode.dev's and is loaded, but nobody has exercised it here.

| vscode.dev | Prism IDE | Today | Planned |
|---|---|---|---|
| Editor: tabs, split, minimap, multi-cursor, find in file | Same code | Tried: a file opens and edits in the full workbench | |
| Layout: activity bar, side bar, panel, status bar | Same code | Tried: renders | |
| Command palette, keybindings, settings editor | Same code | In the workbench, not exercised | Phase 3 check |
| Themes and icon themes | Same code; themes from Open VSX | Tried: two icon themes and a colour theme activate | |
| Problems panel and diagnostics | Same code | Tried: markers shown, and drawn by an extension | |
| Extensions that run in a browser | Same extension host, each call judged by the proved gate | Tried: 18 of the 25 most-downloaded web extensions activate | |
| Extensions that need Node or native programs | Not possible in any browser; vscode.dev cannot run them either | 5 of the 25 fail for this reason | Phase 3 looks at a Node-compatible runtime, with no promise |
| Extension marketplace | Open VSX. The Visual Studio Marketplace's terms limit it to Microsoft's products | A fixed list, fetched by script | Phase 2d: install from Open VSX by content label |
| Open a local folder | The browser's File System Access API, where the browser has it | Not built | Phase 3 |
| Search across files | Same code, over files held in the browser | Not built | Phase 3 |
| Source control (git) | git in the browser, speaking to the host the user names | Not built | Phase 3 |
| Open a GitHub or Azure repository by address | vscode.dev does this with a closed Microsoft extension. Here: git over HTTPS to that host, which is the user's server, not Prism's | Not built | Phase 3 |
| Terminal | No shell exists in a browser. vscode.dev has none either without a tunnel | Not built | Phase 3 looks at a sandboxed one, with no promise |
| Debugging | Only for what can run in the browser | Not built | After phase 3 |
| Settings Sync | Prism ID: the same id on every device, sealed to it | The id works on one device; linking and sync are untested | Phase 3 |
| Sign in | None needed: Prism ID is made on first use | Tried | |
| Copilot, Live Share, tunnels to a remote machine | Not offered: they are Microsoft services or need a machine | | |
| Works offline | Yes, after the first visit | Not built | Phase 2d |
| Extension permissions | A proved gate: deny, allow or ask per resource, grants signed by the user's id. vscode.dev has no equivalent | Tried on 25 extensions | |
| Audit of the app being edited | The audit view. vscode.dev has no equivalent | Tried on 4 rule apps and 13 published apps | Phase 2a |

Serverless means no server of Prism's own. Three things still reach a network, each one the user's own choice: Open VSX to install an extension, a git host to clone or push, and the place a Prism app is published.

## Not in phase 2

- Saving an edit back to a repository. That needs git and write access in the browser.
- Building a holo in the browser. A changed holo app is checked and proved in the tab; building it still needs the SDK image or GitHub Actions.
- Terminals, search across files, and extensions that need Node.
- Running the proved scope kernel in the page. `ide/src/scope.js` stays a tested copy until a holo of it is built.

## Ask first

1. **Where the IDE page is published.** Beside the frame in `UOR-Foundation/template`, or from this repository. Beside the frame means every app gets it with no rebuild, and one more thing the template's frame lock pins.
2. **Changing the frame.** Phase 2e adds a control to a component every Prism app loads. It should be reviewed as a frame change in the template, not carried in by this proposal.
3. **Publishing model sources with every app.** Today a rule app's page ships its numbers, not its `.lex.tex`. Phase 2 publishes the source. That is the point of an audit, and it is a change in what an app makes public.
4. **The order.** 2a is useful alone and touches nothing shipped. If only one phase is wanted first, it is 2a.
