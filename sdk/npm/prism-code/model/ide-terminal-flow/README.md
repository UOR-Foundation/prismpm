# Terminal flow control, version 1

2026-11-20. Model: `src/App.lex.tex`, written by `tools/gen_flow.py`. A rule table, proved by `../ide-prove-rule-app.mjs` with this checkout's prism-code. Nothing is sent anywhere.

It is a specification. No terminal is built yet (`docs/proposals/prism-ide-phase-2.md`, phase 2f).

## What it decides

Whether a running command may hand its next piece of output to the terminal now: `hold` or `write`.

xterm.js's `write` never blocks. It keeps what it is given in a buffer, and past 50 MB it discards. A command that writes faster than the terminal draws would fill that buffer and make keys slow. xterm.js's flow control guide gives the remedy this table states: count the bytes whose `write` callback has not come back, stop above a high mark, start again below a low one.

A request is two words, in order:

| Field | Values | Meaning |
|---|---|---|
| pending | 0 to 52428800 | bytes handed to `write` whose callback has not come back |
| paused | no, yes | the command is being held now |

Rules, first match decides:

1. 100000 bytes or more pending → hold
2. held, and more than 10000 pending → hold
3. otherwise → write

100000 and 10000 are the guide's own example figures. It says the high mark should stay under 500000 to keep keys responsive.

## Proved

Lean's kernel accepted all five, for every request.

1. With 100000 bytes or more pending, the answer is always hold.
2. With 100000 bytes or more pending, the answer is never write.
3. A held command with more than 10000 pending always stays held.
4. A command that is not held, with under 100000 pending, always writes.
5. A held command with 10000 or fewer pending always writes again.

Model identity: `sha256:81ee5d7388273630a17933b32e63b95a1d19b738a7a7141cb06d9dcb5a139321`.
Built app: `sha256:907f9794b510a935b36f0a6ec619897532bd3457331f5523ecaa7bbbba627df0`.
These names are SHA-256 because that is what prism-code emits today.

## Tested, not proved

10 of 10 acceptance vectors pass through the built judge.
A planted defect (hold only from 200000) is refused in CI, and the step checks that the kernel names guarantee 1 and the request `100000 no`.

## Not covered

That the page counts pending bytes correctly, and asks before every write, is unproved.
The bound on the buffer follows by arithmetic and is not a guarantee here: if no piece is larger than C bytes, at most 99999 + C are ever pending.
The two figures are not measured for this IDE. Phase 2f measures key-to-screen time under a large write and may change them.
Whether a held WebAssembly program can actually be paused is a build question: a program in a worker pauses by blocking on a shared buffer, which needs a cross-origin isolated page, or by yielding between pieces.
Scrollback length and its memory are a setting, not judged here.
`lexlean fmt` was not run on this model.
