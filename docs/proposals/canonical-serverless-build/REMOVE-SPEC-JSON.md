# Removing prism/spec.json: verification record

The user's decision: remove `prism/spec.json` and everything that belongs to it, with no compatibility path, before LexLean's front end runs as WebAssembly (option B). The app's one source of truth is its LexLean model; its machine-readable form is `lexlean/semantic-snapshot/2`, named by its `semantic_id`.

Machine: Windows 11 Home 10.0.26200, Node v22.21.0. LexLean ran in the pinned SDK image (`ghcr.io/uor-foundation/prismpm-sdk@sha256:d6c263a7…`) through Docker in WSL.

## What is gone

The spec modules: `spec.mjs`, `spec-file.mjs`, `spec-schema.mjs`, `render.mjs`, `render-stateful.mjs`, `stateful.mjs`, `session.mjs`, `complete.mjs`, `binding.mjs` and `template.mjs` (about 6,100 lines with the engine and MCP code that read them). Also gone:

- the `prism_spec` and `prism_answer` tools;
- `check --spec`;
- the spec gap kinds (`refusal`, `roundtrip`, `unproved`);
- the `write-from-examples` guide;
- the 13 test suites whose subject was the spec journey;
- the spec fixtures.

## What replaces it

- **Starters.** `templates/starters/` holds three LexLean starter modules, each file named by its SHA-256 in `index.json` and copied only when its bytes match: `rule-app` (new), and `decision-app` and `stateful-app`, which were captured once from the renderer's output before it was deleted.
- **The MCP.** It is `prism_start`, `prism_check`, `prism_prove`, `prism_build`, `prism_try` and `prism_status`. The agent writes the model, and Prism never writes over it.
- **The kernel route.** It reads a rule app's table from the semantic snapshot (`rule-table.mjs`): literal terms only, every index and value checked, and a counterexample search before Lean's kernel.
- **Front-end gate.** `frontend.mjs` decides where LexLean's front end runs: the SDK image, or the hosted verifier on `PRISM_CODE_TIER=hosted` only. Otherwise it fails with `build.frontend-unavailable`, naming Phase 3.

## Proved, tested, measured

**Checked by LexLean (measured).** In the SDK image, `lexlean check --all` checks each starter as `prism_start` writes it:

- `rule-app`: 3 modules, semantic `bf1dae97…`;
- `decision-app`: 4 modules, semantic `31af9f8c…`;
- `stateful-app`: 4 modules, semantic `d1bf2421…`.

The `rule-app` starter was refused once (`LLL1004`: its `\title{Rule app}` is not a lexicon phrase), fixed to `\title{Boolean}`, formatted by `lexlean fmt`, and then verified: `verified 3 modules; attestation 05b86a15b2e1474b200e7d2304d644a59ac42088368a104396d82872f7d210ac`. `decision-app` and `stateful-app` are already canonical (`lexlean fmt --all --check`).

**Measured, a fact that shapes the design.** The SDK image's `lexlean` has no `snapshot` command: its commands are `init`, `lock`, `check`, `build`, `verify`, `fmt`, `migrate`, `clean`, `explain`, `production`. So a rule app's snapshot comes only from the hosted verifier's `lexlean_snapshot`, on the user's opt-in, until Phase 3.

**Tested.** `test/journey-lexlean.test.mjs`, 10 of 10. Planted defects refused:

- a starter file one byte longer than its index names (`start.starter`, nothing written);
- a model already on disk (`start.exists`, left as written);
- every step with no image and no opt-in (`build.frontend-unavailable`, naming Phase 3; the stand-in hosted verifier receives zero calls);
- a guarantee the rules break (refused with the request `\d+ motorcycle`, before the kernel is opened);
- a snapshot that is not a rule app's (`rule-table.snapshot`, `.module`, `.index`, `.range`, `.shape`, `.term`).

A rule app on the hosted opt-in is read from its snapshot, judged by Lean's kernel in this process (3 of 3 proved), built, and answers five requests as its rules say.

**Tested, with a stand-in.** `test/support/snapshot.mjs` builds snapshots to LexLean's published schema (`schemas/semantic-snapshot-v2.schema.json`); they are not LexLean's output. The snapshot reader has not yet read a snapshot LexLean itself exported. `test/support/hosted-stand-in.mjs` answers as the hosted verifier does, and the `lexlean_snapshot` call has not been made against the live service.

## The state the user accepted

Non-negotiables 2 (no Docker, no toolchain) and 3 (serverless) are broken until Phase 3 (`docs/proposals/canonical-serverless-build.md`):

- every check, proof and build needs the SDK image or `PRISM_CODE_TIER=hosted`;
- a rule app's snapshot needs the hosted opt-in;
- publishing to GitHub from `prism_build` is refused with `build.publish-unavailable`, because the template's ID rows, scenarios and tests were written from the spec and are not yet written from the snapshot.

The skill, setup's next steps, the MCP instructions, the README and the docs say so plainly.
