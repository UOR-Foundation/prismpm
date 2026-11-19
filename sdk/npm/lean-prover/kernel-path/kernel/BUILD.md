# The kernel

`lean-kernel.wasm` is Lean 4.32.2's own C++ kernel as single-threaded WebAssembly, with `lean-kernel.mjs`, the
loader Emscripten writes for it.

| | |
| --- | --- |
| Source | `leanprover/lean4` at `f3b06c705e6c85f5314019d5d3baab0fec5b580c` (v4.32.2), clean checkout |
| Changes | none under `src/kernel`; one patch to two files of `src/runtime/uv` so the Emscripten stubs compile |
| Driver | Foundry `v2/in-tab-kernel/driver/Checker.lean`: `Lean.Environment.replay`, every declaration to `addDecl` |
| Reader | `lean4export` at `86e4a339507466921dc8c5417c8cb1de1ce7df60` |
| Build | Foundry `v2/in-tab-kernel/gen-c.sh` then `build-wasm.sh`, Emscripten 6.0.13, `-O2`, no threads |
| Size | 2,235,146 bytes; 420,831 gzipped |
| SHA-256 | `49cdfae03dad56ad4deab5845890152bdbcae44fc8e96964f5c049134611dcb6` |

The build carries the commit hash in its bytes, and `publish.mjs pin` refuses a kernel that does not.

It exports three calls, each returning 0 accepted, 1 refused, 2 failed:
`check_whole(path)` judges every declaration of an export file; `load_library(path)` holds a library resident
without re-checking it; `check_suffix(path)` judges a file that continues the resident library's, and reports the
axioms each theorem rests on. `Lean.reduceBool` is refused: no compiled code is trusted.

Not shown: that the build is byte-reproducible.
