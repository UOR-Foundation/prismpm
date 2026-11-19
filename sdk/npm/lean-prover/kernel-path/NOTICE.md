# Notice

This package carries built or exported forms of other projects' work:

- `kernel/` is built from Lean 4 (leanprover/lean4, Apache-2.0), with libuv (MIT) linked.
- `library/library.ndjson` and `examples/fold-laws/proofs.ndjson` are exports, by lean4export (Apache-2.0), of
  declarations from Lean 4's `Init` (Apache-2.0), from LexLean's runtime, and from `lean/` here.
- `hologram/` is built from Hologram's `hologram-store` (MIT OR Apache-2.0).
- `examples/fold-laws/*.lean` is the Lean that LexLean generates for its `fold-laws` example.
