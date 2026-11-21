# Qualifying the Prism journey before prism-code 0.9.3

Part of #666. Measured on 2026-11-16, on one Windows 11 machine (Node 22.21.0, Docker in WSL) and on GitHub Actions.

## Verdict

**Do not publish 0.9.3 as it is tagged.** Release 0.9.4 instead, once the fixes below are merged.

Two findings decide it:

1. **0.9.3 as tagged still adds the hosted server it says it does not add.** `setup` without `--hosted` tells the user the hosted `lexlean` server is "not added", then writes it into every agent's configuration that lacks it, and changes those files with no backup. That server stores what it is sent unlisted, not privately. The fix is #699. The `prism-code-v0.9.3` tag was cut before #699 was merged, so it is not in 0.9.3.
2. **The GitHub route does not deliver a verifiable app.** The app is built and goes live, but Prism reports that it failed, the published repository does not carry the `spec.json` the app is sealed to, and the app is built with a different SDK image from the local route, so the same spec gives different bytes on the two routes.

The rest of the journey holds up well. Every valid spec in a 21-spec corpus was checked in under a third of a second; no guarantee Lean proved was broken by an independent exhaustive search; Qwen3 30B's drafts were accepted 18 of 18 with a format prompt, and every one that could be compared decided every request as the reference does.

### How 0.9.3 came to be tagged

The release was started on 2026-11-16 and then held, so this qualification could run first. The script that ran it was stopped from the agent's side, but the process kept running. It merged #698, opened and merged release pull request #700, cut `prism-code-v0.9.3`, and started the npm publish run. The publish run was cancelled before its publish step. npm has no 0.9.3; `latest` is 0.9.2. The tag and the release commit on `main` remain. This report recommends leaving them in place and never publishing 0.9.3, rather than rewriting a shared tag: npm can go from 0.9.2 to 0.9.4.

## What ran

Which code: rows 1 and 6 used prism-code 0.9.2 as published on npm. Rows 2, 3 and 4 used the branch of this pull request, which is 0.9.2 with #698 and #699. Row 5 did not complete.

| Row | What ran | Result | Budget | Met |
|---|---|---|---|---|
| 1. Setup on a clean profile | `setup --dry-run`, `setup` twice, `--hosted`, `--local`, in a temporary home with existing Claude Code, Cursor, Codex, VS Code and Claude Desktop configs | 13 of 16 checks; 2 defects (the hosted server, the backups), fixed in #699 | under 10 s | yes: 0.94 to 1.03 s |
| 2. Corpus | 21 specs (`sdk/npm/prism-code/test/fixtures/journey/corpus.json`) | 20 of 20 valid specs reach the review; the false guarantee is refused before any proof, naming `staff closed` | check under 100 ms | 19 of 20: median 19 ms; 301 ms for eight fields |
| 3. Models | Qwen3 30B, the 18 hand-written corpus sentences, a format prompt and the MCP instructions alone | 18 of 18 and 12 of 18 accepted first time | draft under 10 s with a format prompt | yes: median 4.9 s, slowest 19.7 s |
| 4. Proof | every valid spec, on the hosted verifier and locally | 18 of 20 hosted, 17 of 20 local; 11 of 20 within 120 s in one round | under 120 s in one round | 11 of 20 |
| 5. Build and seal | six specs, three builds each | not completed: WSL stopped responding and the disk filled | under 10 min | not measured |
| 6. Publication | two apps through `prism_build` with a repository | one live, one building; see below | yes to live URL under 15 min | missed: 18 min, and reported as a failure |
| 7. Cross-machine | the live holo against a local build of the same spec | different bytes, same seal | identical bytes | missed |
| 8. Lifecycle, real build | not run | | | |
| 9. Proof in the holo | `attest --unsigned --key` on a locally built holo | refused: the holo has no unsigned statement | | |

A tool-calling agent on the corpus (row 3) was not run this time. On 2026-11-15, Claude Haiku and Sonnet through the MCP tools reached the review on 5 of 5 sentences, 4 on the first attempt.

### Row 2 in detail

An evaluator written for this test, sharing no code with Prism, tried every request in every field's whole range where that was under four million requests. That was 15 of the 20 valid specs, from 3 requests (one choice of three) to 160,000 (eight fields). It found no counterexample to any of the guarantees Prism proposed or the user stated.

### Row 3 in detail

| Prompt | Accepted first time | Median | Same decision as the reference on every edge request |
|---|---|---|---|
| a format prompt | 18 of 18 | 4.9 s | 12 of 12 comparable |
| the MCP instructions alone | 12 of 18 | 10.6 s | 10 of 10 comparable |

"Comparable" means the model chose the same fields as the reference draft. Six drafts under the format prompt modelled the request differently (a yes or no as a number, an extra field); they were accepted and are not verified against the reference.

Under the MCP instructions alone, five of the six refusals are one slip: the model writes a label (`output`, `task`, `price`) as the answer of every rule, so the app decides nothing. Prism refuses it correctly. Nothing in the instructions says that an answer is the outcome word itself.

### Row 4 in detail

| | Hosted | Local |
|---|---|---|
| proved | 18 of 20 | 17 of 20 |
| median | 88 s | 86 s |
| one round, median | 83 s | 72 s |
| two or three rounds | 6 specs: 150 to 297 s | 6 specs: 114 to 285 s |

The same six specs needed more rounds on both: `zero`, `choices`, `numbers`, `loan`, `eight`, `slips`. Each extra round corrects one theorem's axiom set, and every correction is to the same set, all three allowed axioms (`Classical.choice`, `Quot.sound`, `propext`). The theorems that need it have an equality, an inequality or a comparison of two fields among their conditions. Each correction costs a whole proof round of 60 to 100 s. Predicting that set for those theorem shapes, or correcting every theorem in one round, would bring 6 of 20 proofs from two or three rounds to one.

The failures:

- `unreachable`, both routes: Lean refuses the model's module name. The title "Result" gives a module `Result`, which LexLean refuses as spelled like a Lean namespace (`LLT4001`). Prism reports "a Prism bug", which is true, but the user cannot get past it except by renaming the app.
- `bands`, both routes: Lean could not prove a guarantee Prism itself proposed, `always band-a when score >= 96`, the first of 24 rules and true for every request (101 requests, searched exhaustively). Prism's message says the guarantee "may hold only for requests the sampling missed, such as very large numbers"; the score is bounded at 100.
- `parking`, local only: "The SDK image is not on this machine" while it was. Docker inside WSL was not answering; the same spec proved on the hosted verifier. An environment failure, counted as one.

### Row 6 and 7 in detail

Two public repositories were created, as approved:

| App | Repository | Live URL | State |
|---|---|---|---|
| Shipping Method | https://github.com/humuhumu33/prism-qualify-shipping | https://humuhumu33.github.io/prism-qualify-shipping/ | live |
| Payment Approval | https://github.com/humuhumu33/prism-qualify-payment | | Pages run in progress when this was written |

For the live app:

- holo fetched from `https://humuhumu33.github.io/prism-qualify-shipping/app.holo`: 17,219 bytes, SHA-256 `92553b6cf422ca945d7c1d3f926bc7109fa805fbd53458c4e198918e2a5404f9`.
- `prism-code check app.holo --spec spec.json`, with the spec.json Prism stored locally for the same draft: `spec ok The holo matches this spec, blake3:f1479464e810a32665f748c15721b9506d819a3236bc18a65ad8abfe9767ae99.`
- The same spec built locally: SHA-256 `2ce6bd2057fe881ec5c7a45e92a8fbe3d9dfb2664817a01a7ec7afe4a720d690`. Same size, 12,179 bytes differ, starting in the model document's hash.
- The model source, `ShippingMethod.lex.tex`, is identical byte for byte in both. The difference is the toolchain: the local route builds with the image prism-code pins, `ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7...`; the repository Prism created from `UOR-Foundation/template` pins `ghcr.io/uor-foundation/prismpm-sdk@sha256:d6c263a7...`.

So the seal holds across the two routes and the bytes do not. "The same JSON gives the same app" holds for one toolchain; prism-code 0.9.2 offers two.

## Defects

| # | Defect | Reproduce | Severity | State |
|---|---|---|---|---|
| 1 | `setup` without `--hosted` adds the hosted server to agents that lack it, while saying it did not, and changes their configs with no backup | `setup` on a profile with an existing Cursor `mcp.json` | misleads; sends models to a server the user declined | fixed, #699 |
| 2 | After `prism_start` with restart, the previous app's `spec.json` is adopted unseen and a "yes" approves it | restart, then `prism_answer yes` | wrong app | fixed, #698 (in the 0.9.3 tag) |
| 3 | The GitHub route writes `crates/conformance/tests/<app>.rs`, which the template's own bootstrap gate refuses ("only Prism may be implemented here"); Prism then reports "nothing is live" though Pages published the app | `prism_build` with a repository | misleads | open |
| 4 | The published repository does not carry `spec.json`, so nobody holding only the repository can run `check --spec` | read the repository's tree | the seal cannot be checked by a stranger | open |
| 5 | The local and GitHub routes build with different SDK images | compare `prismpm.lock` in each | same spec, different bytes | open; decide which image a release pins |
| 6 | A title that names a Lean namespace (such as "Result") gives a model Lean refuses | prove the `unreachable` corpus spec | blocks the journey for that title | open |
| 7 | Lean cannot prove a guarantee Prism proposed and that holds for every request, in a 24-rule spec; the message blames sampling | prove the `bands` corpus spec | blocks the journey; misleads | open |
| 8 | Six of twenty proofs need two or three rounds, each correcting one theorem to the same full axiom set | prove `choices`, `numbers`, `loan` | slows: 60 to 200 s added | open |
| 9 | `prism_build` called while a build runs ignores a `repository` passed on the second call | build without a repository, then call again with one | misleads | open |
| 10 | Nothing in the MCP instructions says an answer is the outcome word; 5 of 6 refusals of instruction-only drafts | Qwen3 30B, MCP instructions alone | slows | open |

Fixes for 6 and 10 are small and in this package. Fixes for 3, 4 and 5 touch the template writer and the release's image pin. 7 and 8 sit between the proof generator and Lean.

## What a holo proves to a stranger today

Holding the holo and the right `spec.json`, a stranger can check, with `prism-code check --spec`:

- the holo is intact: one flipped bit is refused (`holo.integrity`), shown on 2026-11-15;
- it was built from that spec: the seal is the spec's address, and another spec is refused with both addresses named.

They cannot check:

- that the guarantees were proved. The holo carries no proof statement, so `check` reports P0. A signed proof statement cannot be added to a holo built with the image prism-code 0.9.2 pins: `attest --unsigned` finds no statement to sign.
- that it is the same app as one built on another route, since the bytes differ by toolchain.
- anything at all from a published repository alone, since the spec is not in it.

## Not verified

- Rows 5 and 8: the six builds and the lifecycle test against a real container. WSL stopped responding (`Wsl/Service/0x8007274c`) with 7.6 GB free on the disk. Build reproducibility rests on the earlier measurement: one spec, three builds, identical.
- A tool-calling agent on the corpus.
- The payment app's live holo.
- Whether the GitHub route still needs Docker for its proof when Docker is absent; here it proved locally first.
- macOS and Linux.

## Reproduce

```
node sdk/npm/prism-code/test/support/journey-qualify.mjs check
node sdk/npm/prism-code/test/support/journey-qualify.mjs prove --hosted
node sdk/npm/prism-code/test/support/journey-qualify.mjs prove
node sdk/npm/prism-code/test/support/journey-qualify.mjs build
node sdk/npm/prism-code/test/support/journey-qualify.mjs seal
```
