# Lean's kernel, as WebAssembly

These files are copied byte for byte from UOR-Foundation/foundry at commit
`7755331`, directory `studio/shell/kernel/lean/`. `manifest.json` names each by
the SHA-256 of its bytes, and `kernel-prove.mjs` checks every address before
the kernel runs. Do not edit them: a changed byte is refused.

| File | What it is |
| --- | --- |
| `lean-kernel.wasm.gz` | Lean 4.32.1's C++ kernel (`src/kernel`, `src/runtime`, `src/util` at `f054605a`), built single-threaded with Emscripten, with libuv 1.48.0 linked for the runtime. |
| `lean-kernel.mjs` | The loader Emscripten generated for that module. Shipped unpacked so Node can import it. |
| `library.ndjson.gz` | The lean4export (format 3.1.0) export of `PrismLive.Kernel.ruleJudge_sound` and what it depends on, from foundry's `studio/proof`. |
| `manifest.json` | The addresses, and the record that this kernel judged this library whole. |
| `kernel.holo` | The Forge kernel: a holo built and verified once by the SDK, whose guest carries the rule judge (foundry `app/src/RuleJudge.lex.tex`). Copied from `studio/shell/kernel/kernel.holo`; `rule-app.mjs` names it by SHA-256 and checks it before it answers. |

How they are built: foundry `v2/in-tab-kernel/` (`build-wasm.sh`, `bind-library.mjs`, `make-dist.mjs`).

## Licences

- Lean 4: Apache License 2.0. https://github.com/leanprover/lean4
- lean4export: Apache License 2.0. https://github.com/leanprover/lean4export
- libuv: MIT License. https://github.com/libuv/libuv
- Emscripten runtime support in the loader: MIT License. https://github.com/emscripten-core/emscripten
- The lemma library and the build: UOR-Foundation/foundry, MIT or Apache License 2.0.
