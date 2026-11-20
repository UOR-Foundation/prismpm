# Edit and check (phase 2b, first step)

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

Limits:

- A plain text area, not the workbench editor of `ide/`. No syntax colours, no completion, no formatting (the WASI build of LexLean refuses commands that write).
- One file is editable: the project's first entrypoint. The other files are read once and sent with every check.
- Checking only. A model that checks is not thereby proved; which guarantees still hold after an edit is phase 2c.
- The executable is served from where prism-code keeps it on this machine. A published page would have to fetch it from its release address, whose cross-origin rules were not tried.
- The pin reaches the page as `pin.json` from the same server that serves the page. That is no weaker than the page's own code, which the same server serves.
- LexLean's positions are shown as it gives them. A missing type is reported at the line of the module's first structure, not where it is used.
- The line marks were restyled after the runs above and not looked at again in a browser.
- No automated test runs the page.
