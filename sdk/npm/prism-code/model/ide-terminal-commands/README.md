# Terminal command table, version 1

2026-11-20. Model: `src/App.lex.tex`, written by `tools/gen_commands.py`. A rule table, proved by `../ide-prove-rule-app.mjs` with this checkout's prism-code. Nothing is sent anywhere.

It is a specification. No terminal is built yet (`docs/proposals/prism-ide-phase-2.md`, phase 2f).

## What it decides

How the Prism IDE's embedded terminal answers one command line: `refuse`, `builtin`, `run` or `reuse`.

The terminal is xterm.js. xterm.js draws what a program writes and reports keys; it runs nothing. A browser tab has no operating system and no shell, so what runs is a small interpreter in the page with a fixed list of commands. This table is that list.

A request is four words, in order:

| Field | Values | Meaning |
|---|---|---|
| command | other, help, clear, ls, cat, kappa, check, snapshot, prove, audit | the line's first word; any word not listed is `other` |
| target | none, outside, model | where the line's path points; `none` when it names no path |
| bytes | absent, mismatch, pinned | the executable the command needs, as held in this tab: not there, hashing to another label, or hashing to its pinned BLAKE3 label |
| stored | no, yes | the reuse rule admitted a kept output for this program label and this input label |

| Command | Kind | What it does |
|---|---|---|
| help, clear | builtin | list the commands; clear the screen |
| ls, cat, kappa | builtin | list the open model's files; print one; print one file's `blake3:` label |
| check, snapshot | program | `lexlean check` and `lexlean snapshot`: LexLean's front end as WebAssembly, pinned in `src/journey/lexlean-wasm.mjs` |
| prove | program | Lean's kernel on the model's guarantees (`src/journey/kernel-store.mjs`) |
| audit | program | each guarantee's status, by the rule of `../ide-audit` |

Rules, first match decides:

1. the path points outside the open model → refuse
2. a builtin → builtin
3. a program, and a kept output is admitted → reuse
4. a program, and its executable hashes to its pinned label → run
5. otherwise → refuse

Rule 3 comes before rule 4 on purpose: a kept output is shown without fetching or starting the executable.

## Proved

Lean's kernel accepted all 27, for every request.

1. An unlisted command is always refused.
2. A path outside the open model is always refused, whatever the command.
3. With the executable absent, nothing is ever run.
4. With an executable that hashes to another label, nothing is ever run.
5. With no admitted kept output, nothing is ever reused.
6. to 10. Each builtin never runs an executable.
11. to 15. Each builtin never reuses a kept output.
16. to 19. Each program is never answered as a builtin.
20. to 23. Each program, on the open model, with its pinned executable and no kept output, is always run.
24. to 27. Each program, on the open model, with an admitted kept output, is always reused.

Model identity: `sha256:8f741dc9a6a5ef9eb259dbe257b74590a95378738d09d5fd2e5f3f2af813ea4e`.
Built app: `sha256:2ce383c33b1c58bc7582be438b0f3fe5342fccecf86a343f4a0f9efae1c341f2`.
These names are SHA-256 because that is what prism-code emits today.

## Tested, not proved

19 of 19 acceptance vectors pass through the built judge.
A planted defect (run bytes that hash to another label) is refused in CI, and the step checks that the kernel names guarantee 4 and the request `check none mismatch no`.

## Not covered

The four words are the page's to compute, and that is unproved: splitting the line, resolving the path, hashing the executable, asking the reuse rule.
`stored` is the answer of `reuseAdmits`, which is proved in `../rule-app` (`RuleAppProofs.lex.tex`), not here. The terminal must ask it with the program's label and the input's label as the derivation key (`src/journey/kappa-rules.mjs`, `derivationKey`).
That a kept output is still the right output rests on the programs being deterministic. `check` and `snapshot` were built twice to the same bytes; that their output is the same for the same input is not proved.
`prove` is held today to the SHA-256 its manifest names, not a BLAKE3 label. Phase 2f moves that pin.
`lexlean fmt` was not run on this model: the in-tab front end has no format command.
No pipes, no redirection, no variables, no scripts, no native programs, no remote machine. A line is one command and its arguments.
