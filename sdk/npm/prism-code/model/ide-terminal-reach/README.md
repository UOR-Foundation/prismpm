# Terminal reach, version 1

2026-11-20. Model: `src/App.lex.tex`, written by `tools/gen_reach.py`. A rule table, proved by `../ide-prove-rule-app.mjs` with this checkout's prism-code. Nothing is sent anywhere.

It is a specification. No terminal is built yet (`docs/proposals/prism-ide-phase-2.md`, phase 2f).

## What it decides

Whether a command running in the Prism IDE's embedded terminal may use a resource: `deny` or `allow`. The commands are those of `../ide-terminal-commands`.

A request is two words, in order:

| Field | Values | Meaning |
|---|---|---|
| command | other, help, clear, ls, cat, kappa, check, snapshot, prove, audit | the command that is running |
| resource | screen, readmodel, writemodel, readstore, writestore, network, clipboard, process | what it asks its host for |

`screen` is writing to the terminal. `readmodel` and `writemodel` are the open model's files. `readstore` and `writestore` are the content-addressed store, by BLAKE3 label. `network` is any request to any address. `process` is starting another program, worker or frame.

| Command | screen | readmodel | readstore | writestore | writemodel, network, clipboard, process |
|---|---|---|---|---|---|
| help, clear | allow | deny | deny | deny | deny |
| ls, cat, kappa | allow | allow | deny | deny | deny |
| check, snapshot, prove, audit | allow | allow | allow | allow | deny |
| other | deny | deny | deny | deny | deny |

## Proved

Lean's kernel accepted all 33, for every request.

1. Network is always denied, whatever the command.
2. The clipboard is always denied.
3. Starting a process is always denied.
4. Writing the model is always denied. The terminal changes no file; the editor does.
5. An unlisted command is always denied everything.
6. and 7. `help` and `clear` are never allowed to read the model.
8. to 12. No builtin is ever allowed to read the store.
13. to 17. No builtin is ever allowed to write the store.
18. to 26. Each listed command is always allowed the screen.
27. to 33. `ls`, `cat`, `kappa` and each program are always allowed to read the model.

Guarantees 1 to 3 together say that what is typed into the terminal, and what a command reads, has nowhere to go: no command is handed a way to send it.

Model identity: `sha256:788021565c0e2cb2acd67d925d5ea53186405b86c1c9c3ae80163f2400e8e3bf`.
Built app: `sha256:71546916058d2d843d69bb09f204eb04b4a7322e89469d16e3cc098137ffeb3c`.
These names are SHA-256 because that is what prism-code emits today.

## Tested, not proved

22 of 22 acceptance vectors pass through the built judge.
A planted defect (allow the network) is refused in CI, and the step checks that the kernel names guarantee 1 and the request `help network`.

## Not covered

The table says what a command is handed. That the host hands it nothing else is the page's job and is unproved. The plan for it: programs run in a worker on `src/journey/wasi-memory.mjs`, which has no socket and no process call to give, and the page is served with a content security policy that allows connections to its own origin only. Both are to be tested, not proved.
Fetching a pinned executable the first time is done by the page's loader, from the page's own origin, before any command runs. It is not a command's use of the network and this table does not judge it.
The page itself, any extension, and the browser are outside this table. An extension's reach is `../ide-capability-gate`.
Copying text the user selected in the terminal is the browser's own copy, started by the user. It is not a command using the clipboard.
`lexlean fmt` was not run on this model.
