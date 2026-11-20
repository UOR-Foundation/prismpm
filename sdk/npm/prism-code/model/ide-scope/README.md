# Scope kernel, version 1

2026-11-20. Model: `src/Scope.lex.tex`. Guarantees: `src/ScopeProof*.lex.tex`, one module each. All are written by `tools/gen_scope.py`.
Proved by Lean in this repository's CI, and before that on the hosted LexLean verifier at `https://mcp.uor.foundation/` (profile `spec`), through `tools/hosted.mjs`. That service stores what it is sent unlisted, not privately. Only the model and guarantee files under `src/` were sent, in several drafts as the guarantees were reworked.

## What it decides

Whether a target is inside a scope. One request, one answer: `inside` (1) or `outside` (0).

A target is a list of segments: the segments of a path from the root, or the labels of a host from the top-level domain inwards. A scope is a shorter list. The same rules serve both.

Segments are numbers. Whoever builds the request gives equal strings equal numbers, with three fixed: 0 is an unused slot or an empty segment, 1 is `..`, 2 is `.`. 3 and above are real names.

A request is 14 numbers: `depth`, eight target slots `s1` to `s8`, `scopeDepth`, four scope slots `p1` to `p4`.

The target is inside when all of these hold:

1. `depth` is at most 8, and `scopeDepth` is between 1 and 4.
2. Every target slot within `depth` and every scope slot within `scopeDepth` holds a real name.
3. `scopeDepth` is at most `depth`.
4. Each scope slot within `scopeDepth` equals the target slot at the same place.

Otherwise it is outside.

## Proved

Eight theorems, each for every request, with no bound on the numbers. The hosted verifier reported each one `verified`: accepted by Lean, re-checked by its kernel checker, and using exactly the axioms it declares.

1. A target with an empty, `.` or `..` segment is never inside. This is the path-traversal guarantee.
2. A target deeper than 8 segments is never inside.
3. A target shorter than the scope is never inside, so a scope never admits its own parent.
4. An empty scope admits nothing.
5. A scope deeper than 4 segments admits nothing.
6. A target that differs from the scope in any of the scope's segments is never inside.
7. The answer is always inside or outside.
8. A target that is at least as deep as an inside target, under the same scope, and agrees with it on the four slots a scope can read, still has the scope as a prefix and is deep enough.

Axioms: `Quot.sound` and `propext` for 1 to 7; 8 also uses `Classical.choice`.

Two independent runs:

- In this repository's CI (`.github/workflows/ide-kernels-model.yml`), in the SDK image `verification.json` names, with Lean 4.32.1: `lexlean verify --all` reported `verified 9 modules; attestation df85f0d5a62dc56283e1f342efb3ce89082921464d4001537617eeccd173cba8`, all eight theorems in one run. The workflow repeats this whenever the kernel changes, and then plants a defect that Lean must reject.
- On the hosted verifier, draft `spec/cd05a51c4b3c3f33ec3f647f1edbd03fb462943c740e71955025b95c95bdf0f8`, each theorem in its own run together with the model.

`prism-code verify --lean`, the in-process kernel, did not finish on this model in 40 minutes on a development machine.

## Stated but not proved

"A well-formed target that has the scope as a prefix and is deep enough is inside." This is the definition of `inside` read forwards. The one proof method these models use, `linear_arithmetic`, could not prove it: with the name checks opened Lean ran out of its 5 minutes, and with them closed its arithmetic step cannot use a closed definition. It is not in the model as a theorem.

Guarantee 8 therefore stops one step short of "everything under an inside target is inside". The missing step is that definition.

The first form of guarantee 8, over all 28 numbers of two requests, also ran out of time.

## Not built

This kernel is a verified model only. It is not built into a holo or any other form a page can run: that build needs the SDK image, which is not on this machine.

The page therefore runs a hand-written copy of the rules, `../../ide/src/scope.js`. Its `judge` function follows the model line for line, and `../../ide/tools/scope-test.mjs` passes 35 cases covering each guarantee. The copy is tested, not proved, and nothing checks mechanically that it matches the model.

In the spike the copy decides three things: whether a file path is under `/workspace`, under `/User/globalStorage`, or under `/User/workspaceStorage`. Five extensions re-run with it gave the same results as before.

## Not covered

Turning text into the numbers is outside the kernel: splitting a path, lower-casing a host, giving equal strings equal numbers, and treating a segment with a backslash, a percent sign or a control character as empty. An error there defeats the guarantees.
Paths deeper than 8 segments and scopes deeper than 4 are refused, not handled. Real workspaces go deeper; the bound has to grow or the model has to recurse.
Symbolic links, case-insensitive file systems and Unicode look-alikes are not modelled.
Host scopes are implemented and tested in the copy but not used by the spike, which grants no network access.
One scope per request. A list of granted scopes is the caller's loop.
