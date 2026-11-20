# Command class table, version 1

2026-11-20. Model: `src/App.lex.tex`, written by `tools/gen_table.py`. Built with prism-code from PrismPM `origin/main` at `d18ff061`, rule-app starter, `PRISM_CODE_TIER=offline`. Nothing was sent to any server.

## What it decides

The class of an editor command an extension runs through `executeCommand`: `show` or `exec`. The capability gate (`../ide-capability-gate/README.md`) then judges the call as that resource.

A request is one word:

| Word | Command ids | Why it is `show` |
|---|---|---|
| setcontext | `_setContext`, `setContext` | sets a UI flag that menus and keybindings read |
| reloadwebview | `workbench.action.webview.reloadWebviewAction` | redraws open webviews |
| wordhighlight | `editor.action.wordHighlight.trigger` | highlights the word under the cursor |
| other | every other id | not listed |

Rules: a listed word → `show`. Otherwise → `exec`.

The three listed commands are the only ones the 25 extensions in `../../ide/BATCH.md` ran at start-up. 129 of the 132 calls were `_setContext`.

## Proved

Lean's kernel (4.32.1) accepted all five, for every request, in 2 s.

1. An unlisted command is always `exec`.
2. An unlisted command is never `show`.
3. to 5. Each listed word is always `show`.

The table can only ever answer `show` or `exec`. It cannot hand a command read, write, network or secrets.

Model identity: `sha256:8307e81dce117afbf7cde568760fa610bedec844e97d610b4bd79de750e9fde4`.
Built app: `sha256:99576bf94f69e198ff5e8b7696cec596d6c9a649db279f48b3f1b4966412cbf5`.
BLAKE3 label of the app record: `blake3:19c0796290e5d1da5aba99be263fff377d7c9f3ce517e3ccb995802bdfd33b43`.
The judge archive `kernel.holo` is byte-identical to the capability gate's.

## Tested, not proved

5 of 5 acceptance vectors pass through the built judge.
In the browser spike, Amazon Q, Vim and GitLens ran their commands through this table. Amazon Q, which failed on a refused command before, activates.

## Not covered

The mapping from a command id to a word is page JavaScript, generated from the same list (`tools/commands.json`). It is a plain string lookup and is unproved.
That each listed command really only changes what is shown is a judgement made by reading what the command does. It is not proved.
A rule app holds at most 32 choices per field, so this form tops out at 31 listed words. A table of several hundred ids needs a kernel that takes the id itself.
Commands contributed by other extensions are all `other`, so `exec`.
