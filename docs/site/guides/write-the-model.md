---
title: Write the model
description: A Prism application's one source of truth is its LexLean model.
available_in: "0.6"
---
A Prism application's one source of truth is its LexLean model under `prism/src/`. You write it, or an agent writes it with you through the `prism` MCP server. Its machine-readable form is the JSON LexLean exports for it, `lexlean/semantic-snapshot/2`, named by its `semantic_id`; that is what is sealed and what a page verifies.

## Start from a starter

`prism_start` starts the model from a starter, a LexLean module named by its SHA-256 and copied only when its bytes match:

- `rule-app`: one answer from one request, each condition a field against a value. Lean's kernel checks its guarantees from the model's semantic snapshot, and the app is the verified rule judge with the model's numbers, served as a static page.
- `decision-app`: one answer from one request, with its own judge and theorems, built into a holo.
- `stateful-app`: state kept between steps, with actions and invariants, built into a holo.

## Check, prove, build

Check after every edit: each diagnostic names the line of `prism/src/` it anchors to. Before anything is proved, a rule app's guarantees are tried for a counterexample among the values its conditions tell apart. Lean then proves the model, and the build replays its examples as acceptance vectors. Guarantees are proved; the reading of requests and the examples are tested.

## No Docker-free build yet

LexLean's front end does not run as WebAssembly yet. Until it does, checking, proving and building need the SDK image on your machine (Docker), or the hosted verifier, which only you choose, by setting `PRISM_CODE_TIER=hosted`; it stores the model unlisted, not privately. With neither, every step fails with `build.frontend-unavailable`.

## Next steps

- [Verify and inspect](/docs/guides/verify-and-inspect)
- [Agents and holos](/docs/guides/agents)
