# Canonical serverless build: verification record

Running record for [the proposal](../canonical-serverless-build.md). Each entry names the command, the result, and what kind of claim it is: proved, compiled, tested or measured.

Machine: Windows 11 Home 10.0.26200, Node v22.21.0, x64. Model verification ran in the pinned SDK image through Docker in WSL; that is a maintainer step for PrismPM's own models, not a step of any user's build.

## Phase 1. The rules, stated and proved

### Proved

`sdk/npm/prism-code/model/canonical-build` states the rules in LexLean; Lean 4.32.1 accepted 12 theorems.

Command, in `ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7…fea58`: `lexlean lock && lexlean fmt && lexlean verify --all`.
Result: `verified 2 modules; attestation fc3cfac72a217767df6ef558fe0701fc63ca21d7aa4c5563ef39664b1831766e`. The record is `model/canonical-build/verification.json`, with every source's SHA-256 and each theorem's exact axiom policy.

The theorems: a holo is admitted only when its `semantic_id` recomputes, and only under the pinned kernel, library and compiler; a term is reused only under the same key, kernel, library, statement and bytes, never across another axiom policy, and nothing stored is never reused; proved needs the kernel to accept the term now; a missing term is never proved; proved only for the term its bytes name and its own statement; proved only within the theorem's exact axiom policy; where a term came from never decides its verdict; the proved status means proved; no term is pending.

Planted defects in the model, each refused by Lean, then restored to `verified 2 modules`:

| Defect | Diagnostic | Theorem refused |
| --- | --- | --- |
| `proved` counts a kernel run whatever it answered | `LLV7002 … omega could not prove the goal` | `provedNeedsTheKernelToAcceptTheTermNow` |
| `termReusable` drops the axiom-policy conjunct | `LLV7002 … omega could not prove the goal` | `aTermIsNeverReusedAcrossAnotherAxiomPolicy` |

### Compiled

`src/journey/canonical-rules.mjs` is the model's definitions one for one. `test/canonical-build-model.test.mjs` evaluates the model's own text beside it on 20,000 generated seals, stored terms and judgements each, and evaluates every theorem's counterexample on them.

Planted defect: the policy check removed from `termReusable` in JavaScript. Command `node --test test/canonical-build-model.test.mjs`. Result: `not ok 3 - reuse of a stored term is the model's`. Restored: 6 of 6 pass.

### Tested

The correction this phase makes: before it, `kernelProve` and the page took a stored proof as accepted without running the kernel, which carried a verdict across runs, the thing PR #713 reverted. Now a stored term saves producing one, and the kernel judges every term in the run that reports it. Proof records are `prism/kernel-proof/2`, naming the statement and the exact axiom policy; the derivation key covers the policy too.

`test/kappa-store.test.mjs`: a second proof of the same spec produces no term and the kernel judges all three again (`checked === 3`). Planted defects refused: C1 a stored proof under a changed library; C2 a weaker or other axiom policy; C3 a forged proof for a different statement bound under another key; M2 another kernel; M4 altered proof bytes; M5 a record that is not a proof.

`test/rule-app-site.test.mjs`: the page ships `canonical-rules.mjs` whole, decides reuse with `termReusable`, has no early return that skips the kernel (R4), and keeps only a proved term (R2).

## Phase 2. The serverless boundary

### Tested

`src/journey/hosts.mjs` is the one boundary. `ensureKernel`, `fetchPinned`, `fetchLive` and the public proof store read through it.

`test/serverless-boundary.test.mjs`, 6 of 6:

| Planted defect | Result |
| --- | --- |
| B1 a build asks `https://example.com/telemetry`, or the hosted verifier without opt-in | `build.host-not-allowed`, zero requests sent |
| S1 a public store serves terms one byte longer than their names | nothing copied |
| S2 a public store binds a key to another statement's record | not reused; the term is produced and judged |
| S3 a public store outside the boundary | refused before it is asked |

A term from a public store on another machine is copied, not produced, and judged again: `pulled 3, reused 3, checked 3`, all proved.

### Registered

Capability `DK-45` in `model/ids.toml`, scenario in `features/suites/sdk.feature`, conformance case running both suites; diagnostic `build.host-not-allowed` in `model/sdk-diagnostics.toml`.

## Full prism-code suite

Command: `node --test "test/*.test.mjs"` in `sdk/npm/prism-code`. Result: 1,113 tests, 1,025 pass, 56 fail. Two of the 56 were this change (an unregistered raise form for `build.host-not-allowed`), fixed; the suites this change touches now pass 45 of 45.

The rest fail the same way on unmodified `main` (`b3c1390d`) on this machine: `attest`, signed fixtures and `check` need the optional Sigstore packages, which are not installed; `reference-archives` resolves `prism-code` from a global install; `package.test` must run under `npm test`; `system-auth-cli` hangs on `main` too, and was stopped. CI is the gate for those.

`cargo xtask validate-model --write` could not build here (a vendored tar is not readable from the Windows checkout in WSL), so the DK-45 rows in `SPEC.md`, `CONFORMANCE.md` and `ERRORS.md` were written in the generated format by hand; CI's `validate-model` checks them.

## Measured

Command: `node docs/proposals/canonical-serverless-build/measure.mjs`. Windows 11, Node 22. The full test suite ran at the same time, so these are upper bounds.

| Measure | Target | Result |
| --- | --- | --- |
| Kernel first-run download | part of under 10 MB | 2,342,225 bytes, 4 requests, one host (`raw.githubusercontent.com`) |
| Kernel first-run fetch | | 2.9 s |
| Kernel open, once per process | | 1.8 s (1.07 s alone) |
| Leap year, 2 guarantees, produced and judged | under 500 ms | 252 ms |
| Leap year, reused and judged again | under 500 ms | 57 ms |
| Parking, 3 guarantees, produced and judged | under 500 ms | 243 ms |
| Parking, reused and judged again | under 500 ms | 203 ms |
| Share produced in-process, rule apps | reported | 100 %, of rule apps only |
| Hosts per build | only allowed | `raw.githubusercontent.com` |

Not yet measurable: check after an edit (needs Phase 3), `setup` time on a clean machine, page ready in a browser, reuse on the second and tenth app across stateful apps, macOS and a phone.

## What "proved" covers here

For rule apps, the term the kernel accepts proves the rule judge's lemma about the spec's numbers, and the engine reports that route as kernel-checked; it is not a proof of the rendered LexLean model. The rules of reuse and admission are proved in `model/canonical-build`; that the JavaScript follows them is compiled-and-tested, not proved.
