# Checkpoint ABI probe

A test input for the runtime's handling of the checkpoint world `hologram:guest/core-wasm@3` (HO-47, HO-48).
It is never packaged in a holo and is not an application.

- `src/lib.rs` is the generated @3 shim of `crates/prismpm/src/session_guest` around `entry.rs`, with the bounds of the session probe: request 64, state 256, response 256, response count 4, pages 2 and stack 16384. The Rust test `the_checkpoint_probe_is_the_generated_shim_around_the_same_entry` requires it to be byte for byte what the generator renders, `.cargo/config.toml` and `Cargo.toml` to be the generator's, and `entry.rs` to equal the session probe's.
- `probe.wasm` is built from this directory alone, so Cargo finds no enclosing workspace:

```bash
cp -r . /tmp/checkpoint-probe-src && rm /tmp/checkpoint-probe-src/probe.wasm && (cd /tmp/checkpoint-probe-src && CARGO_TARGET_DIR=/tmp/checkpoint-probe cargo +1.97.1 build --locked --offline --release) && cp /tmp/checkpoint-probe/wasm32-unknown-unknown/release/prism_checkpoint_probe_core_wasm.wasm probe.wasm
```

The session probe rebuilt the same way with Rust 1.97.1 is byte for byte its committed probe.wasm (measured 2026-11-18).
