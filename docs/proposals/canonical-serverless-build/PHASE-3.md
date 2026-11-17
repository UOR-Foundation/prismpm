# Phase 3: LexLean's front end as WebAssembly, verification record

Machine: Windows 11 Home 10.0.26200, Node v22.21.0, x64; LexLean built in WSL Ubuntu (Linux x86-64), Rust 1.97.1.

## What exists upstream already

LexLean `main` (0.4.3, `a74b1f99`) builds `lexlean` for `wasm32-wasip1` without its production data (LexLean SPEC §8.3, §8.4, `CL-25`). Its CLI had no `snapshot` command, though `Engine::snapshot` and `SemanticSnapshot::canonical_bytes` exist.

## The upstream change: UOR-Foundation/lexlean#566 (draft)

`lexlean snapshot [--all | INPUT...]` (SPEC §23.4, `CL-26`):

- In human mode, stdout is exactly the snapshot's canonical file bytes, whose SHA-256 is the snapshot ID.
- In JSON mode, it writes `check`'s command result named `snapshot`.
- A project `check` refuses exits and reports as `check` does, and prints no snapshot.
- It writes nothing.
- Under WASI it prints the native bytes.

R3 evidence. Green: `conformance_cl_26` passes in 769 s on Linux x86-64. `validate-model` reports 498 ids and 87 codes, clean, and `fmt` and `clippy` are clean. Red first: CL-26 run against the tree without the CLI change fails with `CL-26: …/examples/collections: snapshot exits 0: error[LLC0001]: unrecognized subcommand 'snapshot'`.

## Measured

| Measure | Target | Result |
| --- | --- | --- |
| `lexlean.wasm`, check-only build | part of under 10 MB | 19,133,367 bytes raw, 4,112,161 gzipped |
| Native vs WASI snapshot, LexLean `examples/nat-add-zero` | byte-identical | identical, `d8497a00…` |
| Native vs in-memory host snapshot, rule-app starter at Lean 4.32.2 | byte-identical | identical, `fab15803…` |
| Module compile, in process | | 96 to 108 ms |
| `check`, warm, Linux | under 1 s | 360 to 460 ms |
| `snapshot`, warm, Linux | | 170 to 300 ms |
| `check` on Windows, rule-app starter, compile included | under 1 s | 239 ms |
| `snapshot` on Windows, same project | | 87 ms |
| Lean's kernel, 3 guarantees, warm | | 132 to 226 ms |
| Edit to verdict, rule app, warm kernel | under 500 ms | about 220 to 320 ms |
| Kernel open, once per process | | 1.1 s |

On Windows, Node's `node:wasi` does not implement `fd_readdir` ("os error 52"), and LexLean lists its language folders. So prism-code carries `wasi-memory.mjs`, a read-only WASI preview-1 host over the project's files held in memory. It imports nothing, so the same host serves a browser. LexLean refuses `fmt` on it with `LLV7010`.

The rule-table reader read a snapshot LexLean itself exported for the first time: 3 guarantees, all proved by Lean's kernel. The built app answers `0 car` with free, `3 car` with standard, `10 truck` with premium, `3 motorcycle` with free and `25 car` with invalid; 2 of 2 vectors pass.

## Pin

prism-code pins the module by its UOR κ-label, `blake3:4f302c18e02a46b0d015c57bd389a0754b301ec876aa7a637f786c4562274ecb`. That is lexlean commit `9ba600d0`, the tree of #566. Its SHA-256 `f76fa2aa…` is kept only as a secondary digest. Two release builds from clean target directories gave the same bytes.

BLAKE3 in prism-code's JavaScript takes 744 ms on the 19 MB module, against 11 ms for Node's SHA-256. So the module is verified once per process, and again whenever its size or change time moves. A BLAKE3 compiled to WebAssembly, the next phase's `uor-addr`, removes that cost.

## Decided

- LexLean 0.4.3 and Lean 4.32.2: option A, for Prism, its kernel and its SDK image.
- The module is to be served as a pre-release asset on UOR-Foundation/lexlean, which the user approved. Publishing it from this session was refused by the permission check, because the approval reached it through another session; it is published once the user confirms here.
