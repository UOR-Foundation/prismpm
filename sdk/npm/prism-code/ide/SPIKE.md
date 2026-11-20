# Spike: can extension calls be routed through the proved gate without patching?

2026-11-20. `@codingame/monaco-vscode-api` 39.0.5, extensions and files service overrides, Vite 6, Chromium. Code: `src/main.js`, probe extension `public/ext/extension.js`, judge files under `public/gate/`.

## Answer

Yes. Every call an extension makes to the page is intercepted with no patch to the library and decided by the proved rule judge, in about 0.2 to 0.3 ms per decision. With the worker on a second origin and a strict content security policy, every leak path the probe tried is closed. All of this was measured in a browser.
Two things still stand between this and a real gate: calls carry no extension identity, and only 8 of the page-side methods are mapped to a resource.

## Measured

A probe extension running in the web worker extension host tried seven things.

| Attempt | No gate | Gate, same origin, stock policy | Gate, second origin, strict policy |
|---|---|---|---|
| Read `/workspace/allowed.txt` | read | read | read |
| Read `/secret/token.txt` | leaked | denied | denied |
| Write `/workspace/out.txt` | wrote | refused (`ask`, no grant) | refused |
| `fetch` to an outside host | status 200 | status 200 | blocked |
| Read the page's IndexedDB | not run | leaked | not visible |
| Read the page's OPFS file | not run | leaked | not found |
| Import a script from another path, data in the URL | not run | request left | blocked |

65 main-thread API objects were wrapped. 20 distinct calls were seen during one activation.

## The judge in the page

The wrapper calls the rule judge built from `model/ide-capability-gate/src/App.lex.tex`, loaded the way the built page loads it (`loadArchive` from prism-code, then `dispatch`).
Before the first answer the page checks five facts and denies everything if any fails:

| Fact | Result |
|---|---|
| `kernel.holo` hashes to the name in the app record | yes |
| The archive verifies its own identities | yes |
| Acceptance vectors replayed through the judge | 0 failed |
| The record's proof verdict | proved |
| The proof's statement matches the record's rules and guarantees | yes |

Load and checks took 279 ms on one run. Five decisions took 0.2 to 0.3 ms each. No decision came from JavaScript rule code.
What this does and does not establish: the answer comes from the judge whose guarantees Lean's kernel accepted at build time. The page did not re-run Lean's kernel; the built page can, and the IDE should on first load. The JavaScript that maps a call to a request (`requestFor`) is not proved.

## Hook 1: wrap the main-thread API objects

`ExtHostCustomersRegistry.getNamedCustomers()` returns the live list of `[id, constructor]` pairs the library instantiates when an extension host starts. The module is a public import path.
The first version replaced each constructor with a subclass returning a Proxy. That missed 24 objects; see "A hole in the first hook". The hook now wraps `RPCProtocol.prototype.set` instead. Dependency injection still works because the subclass inherits the static metadata.
This relies on an internal list being mutable. It is not a documented API and could change in any release. Pin the version and keep a test that fails if a call gets through unwrapped.

## Hook 2: the worker's host page, on its own origin

Extensions call `fetch` and open browser storage directly from the worker. Those never cross to the page, so hook 1 cannot see them.
Two settings close them. `iframeAlternateDomain` serves the worker's host page from a second origin, so the browser gives it separate IndexedDB and OPFS. `registerAssets` swaps that page for a copy with a strict policy: `connect-src` and `script-src` limited to the worker's own origin plus the two paths on the app origin it needs (`/assets/`, `/ext/`).
Both are supported options. No patch.
Cost: a second origin must be served, with CORS on the app's assets.

## Method table, enforced

| Class | Methods | In this run |
|---|---|---|
| internal (not gated) | 241 | 23 calls passed |
| show | 75 | 0 |
| read | 25 | 4 calls, 2 denied as out of scope |
| write | 19 | 2 calls, 1 denied, 1 refused for lack of a grant |
| network | 71 | 2 telemetry calls, both refused for lack of a grant |
| secrets | 20 | 0 |
| exec | 75 | 1 call, the probe's own report command, let through by name |

32 calls in one activation; 8 went to the proved judge at 0 to 0.4 ms each. No wrapped object was missing from the table.

What the table exposed:
- The kernel had no resource for running code. Fixed in kernel version 2: `exec` is a sixth resource, proved, and the 75 exec methods now go to the judge. Measured: a command run without a grant gets `ask`; with a grant it passes the gate.
- `executeCommand` is a second table. It can run any of several hundred commands, some of which write files or open URLs. Only the probe's command is allowed here.
- 71 network methods include every model, chat and tunnel call. One `network` grant is too coarse.
- Interface names on the wire differ from the names in the type file for 5 interfaces, and one method was missed by the first parser. The generator now fails if a rule matches nothing, so a library upgrade cannot silently drop a rule.
- One wrong class was caught by that check: saving a notebook was first marked `read`.

## A real extension: Error Lens 3.30.0

`usernamehw.errorlens-3.30.0.vsix` from open-vsx.org, 63 KB, MIT. Its SHA-256 matched the one the registry publishes. Unpacked to `public/ext/errorlens/` and loaded unmodified.

Result: it works through the gate. On the library's full workbench, with the worker on a second origin and the strict network policy, Error Lens draws both inline messages. Open with `/?ext=errorlens&wb=full&origin=alt&csp=strict`.

Measured in that run:

| What | Result |
|---|---|
| Inline messages drawn | both, the warning and the error |
| API objects behind the gate | 89 |
| Calls from the worker | 79 |
| Calls sent to the proved judge | 12, median 0.2 ms, slowest 0.6 ms |
| Error Lens calls refused | none |
| Its two draw calls (`$trySetDecorations`) | class `show`, allowed by the judge |
| Activation or runtime errors from Error Lens | none |

What was refused in the same run, none of it from Error Lens: 4 telemetry calls, 1 chat-tools lookup made by the worker itself, and the probe extension's out-of-scope read, ungranted write and ungranted command.

Why it failed on the minimal page: Error Lens activated and set up its 9 decoration styles there too, but never asked the page to draw. A page assembled from a few services has no editor service, so the editor was never a workbench editor. With the full workbench (layout, editor service, model, languages, themes, problems) the same extension draws, gate off and gate on. This is evidence that extensions need the whole workbench, from one extension; it is not a proof of the cause.

Correction to an earlier note: I reported that activation fails with `Cannot read properties of undefined (reading 'enabled')`. That was true only before the settings service was added. After that, the error lines I kept reading were old console history from earlier page loads.

Limits of this result:
- One extension, and a pure UI one. It needs no write, network, secrets or exec grant, so it does not test how real extensions cope with refusals.
- The full-workbench build is larger: 20.7 MB main chunk unminified, 3.5 MB gzipped. Cold start not measured.
- The workbench shows "Code - OSS" in the tab title. The name must be replaced before anything ships.

## A batch of 25 real extensions

See `BATCH.md`. 16 of 25 activate through the gate; of 8 failures, 1 is caused by the gate (its scope rule denies extensions their own storage folder), 5 are not, 2 are unexplained.

## A hole in the first hook, now closed

The first hook wrapped the library's list of named API objects: 65 of them. Tracing Error Lens showed that 24 more reach the worker another way: the library sets them directly on the protocol (`MainThreadTextEditors`, `MainThreadDocuments` and others). Those were not gated at all. `MainThreadTextEditors.$tryApplyEdits` edits a document, so this was a real bypass of the write rule.

The hook is now on `RPCProtocol.prototype.set`, the one function every page-side API object passes through. 89 objects are wrapped. One of them, `MainThreadChatAgents2`, is not in the method table, so all its calls are refused.

Every earlier "measured" result for the gate stands for the calls it tested, but any claim that all extension calls were gated before this change was wrong.

Side findings:
- A refused call the worker does not wait on surfaces as an uncaught error on the page (telemetry, 4 times). Refusals of one-way calls should be dropped quietly and logged.
- Console history survives page loads in the test browser. Read errors from page state, not from the console.

## Still open

1. No extension identity. All extensions share one worker and most calls do not say which extension made them. The gate decides per worker, not per extension. Per-extension rules need one worker per extension; whether the library allows that without a patch is unverified.
2. The method table is a first draft. All 526 page-side methods in 85 interfaces are now classified (see `METHOD-TABLE.md`) and the page enforces the table: unlisted methods are refused, and the probe extension still activates. But 270 methods take their class from their interface, not from a reading of the method, and none were checked against the implementation.
3. The request mapping is unproved JavaScript. `inscope` here is a string prefix test. Path and host matching need their own kernel.
4. The worker's own origin is still reachable by `fetch` and script import. In production it must hold nothing but the host page.
5. Not tested: WebSocket, nested workers, `unsafe-eval` (the stock policy needs it), webviews, and extensions that expect network access to work.
6. Bundle size. The unminified build is 23 MB on disk with a 15.7 MB main chunk (2.7 MB gzip) and a 4.4 MB extension host worker. The judge adds a 657 KB `kernel.holo` plus the prism-code loader. Minified size and cold start were not measured.
7. Not done from the original spike scope: installing a real extension from Open VSX, and a file provider backed by the Hologram store.

## Next

1. Review the 270 interface-default classes method by method, and build the per-command table for `executeCommand`.
2. Test whether two web worker hosts can run side by side.
3. Run a batch of real web extensions (the top 50 on Open VSX) on the full workbench and record what each needs and what the gate refuses.
4. Re-run Lean's kernel in the page on first load, as the built rule-app page does.

## Run it

```powershell
npm install
```

```powershell
npx vite build
```

```powershell
npx vite preview --port 4173 --strictPort
```

```powershell
npx vite preview --port 4174 --strictPort
```

Open `http://localhost:4173/?gate=off`, then `/`, then `/?origin=alt&csp=strict`.
