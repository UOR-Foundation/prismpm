# Proposal HO-47: checkpoints, the `hologram:guest/core-wasm@3` world

| | |
| --- | --- |
| Issue | Not yet filed. Answers unresolved question 3 of [proposal 629](629-session-world.md). |
| Status | Proposed, Experimental |
| Depends on | #629 (the session world), #278 (the world registry) |
| Used by | #630 (the profile that declares a session world), inference engines written in LexLean that keep weights, a cache and a position across steps |

## Summary

A third guest world, `hologram:guest/core-wasm@3`: the session world `@2` with the state made addressable.
Two exports are added to the generated shim.
`holo_state` locates the resident state's bytes and changes nothing.
`holo_restore` installs a state in a fresh instance before its first step.
The runtime names a state by the BLAKE3 kappa label of its bytes, checks that label before any instance exists, and opens a session at it.
Because a step is a function of its state and request, a session opened at a checkpoint answers every later request exactly as the session it was taken from.

## Motivation

`@2` keeps a session's state inside one instance and never shows it to the host (629, Alternatives).
That is enough for a session that lives as long as its instance.
It is not enough for an engine whose sessions must survive the instance: a page reload, a worker restart, a long conversation resumed on another machine, a prefix shared by many conversations.
Each of those needs the state to leave the instance and come back, and needs the host to know that what comes back is what left.

A content address does both.
The label is a function of the bytes, so a store can keep states by label, two sessions with the same state share one entry, and a restore can be refused when the bytes do not hash to the label.
Proposal 629 deferred this because it gives the host a fact about the state it did not need then (unresolved question 3).
It needs it now, and only the guests that ask for it, by declaring `@3`, pay for it.

### Goals

1. A new world revision, `@3`, with its own WIT file and row. `@1`, `@2`, their rows, files, shims and every existing holo are unchanged.
2. The `@3` package is the `@2` package from the same bounds and root, with one added block of shim. No application behavior is written outside the model.
3. `checkpoint()` on a session returns `{ address, state }`; `openAt(address, source)` opens a session at it.
4. Every check is made before an instance exists: the label is a BLAKE3 kappa label, the bytes hash to it, and they fit the declared state maximum.
5. Resumption is exact: the same requests after a checkpoint give the same responses, from the original session and from any session opened at it.

### Non-goals

- Histories that start mid-session. A `prism/history/2` session still starts empty; a history that starts at a checkpoint is a later revision of that schema.
- The profile that declares the `@3` world and its bounds in a holo. That is #630's profile; until it lands, `@3` guests load as the reference holos of the tests do.
- A canonical form of the state. The state's bytes are whatever the model's root answers; the model owns their meaning, so two models with equal meanings may have different labels.
- Weights. Large read-only inputs are not state (proposal 630's inputs by digest, and content-addressed pages after it).

## Proposal

### The world

`sdk/npm/spec/worlds/core-wasm-3.wit`, package `hologram:guest@3.0.0`, world `core-wasm`:

```wit
export holo-alloc: func(length: u32) -> u32;
export holo-step: func(offset: u32, length: u32) -> u64;
export holo-state: func() -> u64;
export holo-restore: func(length: u32) -> u32;
```

plus the exported `memory`, which WIT cannot name.

### The shim

`prismpm::session_guest` takes `checkpoint: bool` in its spec and renders `session_guest/checkpoint.rs.in` before the panic handler when it is set; the manifest's `contract` is then `@3`.

- `holo_state()` returns `heap_base << 32 | state_length`. The state is always at the start of the heap after a step (629's compaction), so this reads nothing and moves nothing.
- `holo_restore(n)` requires a fresh instance: the arena's bump pointer is still zero and no state is resident. It reserves `n` bytes at the start of the heap as the state and returns their offset. It traps when `n` is over the state maximum, after any `holo_alloc`, after any step and on a second call, because each of those leaves bytes the state would cover.

### The runtime

- `Session.checkpoint()` reads the state through `holo_state` and returns `{ address: kappa(state), state }`, a copy.
- `Application.openAt(address, source)` takes the bytes or a store with `get(address)`, checks them (`checkpoint.address`, `checkpoint.state`), and opens a session whose instance is restored before its first step. The instantiate, dispatch and record middleware steps run as for `open()`.
- `checkpoint` and `openAt` outside `@3` fail `checkpoint.unsupported`.

## Trusted base

BLAKE3 decides whether bytes are the state a label names. Nothing else is added.

## Test plan

- `crates/prismpm/src/session_guest/tests.rs`: the `@3` source is the `@2` source with exactly the added block; the manifest names `@3` with the same bounds; the `@2` output is unchanged; the committed checkpoint probe is the generator's shim around the session probe's entry.
- `sdk/npm/prism-code/test/checkpoint.test.mjs`, against the checkpoint probe (eight tests): `holo_state` after three steps and a step after it; `holo_restore` and its four traps; a checkpoint's label; exact resumption from bytes and from a store; a flipped byte refused before any instance; malformed labels; the state maximum, on the host and in the shim; `checkpoint.unsupported` on `@2` and `@1`.
- `sdk/npm/spec/test/world.test.mjs`: the `@3` row's digests and exports equal its WIT file's.

## Alternatives

- Export the state through the step's answer instead of a new export. Rejected: every step would pay for a copy only checkpoints need, and `@2` responses would change shape.
- Let the guest restore from a request. Rejected: the bytes would pass through the request bound, and the guest, not the host, would decide what a label means.
- SHA-256 labels. Rejected: BLAKE3 is the content hash of kappa labels and of Hologram AI's inputs.

## Unresolved questions

1. Should a history record the checkpoint a session starts at, so a replay can start mid-session (629's question 3, second half)?
2. Should `openAt` also bind the guest, refusing a state checkpointed under another guest? Today the model's root decides what foreign bytes mean.
