# @prism-code/lean-prover

Lean 4.32.2's elaborator and kernel as WebAssembly. A Prism SDK build proves its LexLean model in Node, with no hosted server and no Docker. Every byte it runs is first checked against its BLAKE3 label.

## Why

Proving a model used to need either a hosted prover or the multi-gigabyte SDK image. This package needs neither. It needs only the engine (about 22 MB compressed) and the library elaboration reads (Init and LexLean's runtime, about 125 MB compressed), fetched once by label.

## How

```js
import { open } from "@prism-code/lean-prover";

const prover = await open({
  manifest,   // the manifest's bytes
  pin,        // the BLAKE3 label prism-code pins for them
  read,       // read(label) -> the stored blob's bytes
  gate,       // the corpus gate attestation the manifest names
  official,   // { "lib/lean/Init/...": label } of the official Lean release
});
const result = await prover.prove({ project });     // project: Map of path -> bytes
await prover.close();
```

`open` refuses a manifest that is not the pinned one, an engine its gate did not admit, and a library whose Init files are not the official release's. Every refusal carries one of the registered `lean-prover.*` codes (`model/sdk-diagnostics.toml`, guarantees `LP-01` to `LP-11`).

`prove` does four things:
1. It runs LexLean's WASI build to check the project and render its Lean modules (`lexlean lean-modules`).
2. It elaborates each module with Lean's own frontend.
3. It replays every declaration through a second, fresh kernel environment.
4. It applies the axiom audit as `lexlean verify` does (LLV7005): for each declaration, the observed axioms must match its declared policy. Prism also refuses any axiom outside `propext`, `Quot.sound` and `Classical.choice`.

The declared policies are the table `lexlean lean-modules` prints with each module (LexLean CL-28), the same table `lexlean verify`'s stage 11 reads: rows `{ declaration, kind, axioms, rule, members? }` with the rules document, core, semantic, model and runtime (`src/axioms.mjs`). A runtime module's rows are judged on the axioms the driver's check of that module observes. A render without the table admits nothing: `prove` reports every declaration's observed axioms and refuses with `lean-prover.axiom-policy`.

The answer is `{ accepted, modules: [{ module, accepted, declarations: [{ name, kind, accepted, axioms }] }], policies, evidence }`. A refusal carries `refusal: { code, diagnostics }`.

`evidence` names the engine, library and LexLean by BLAKE3 label, plus the corpus gate and the project's source, semantic and build IDs.

## What is trusted

- **Lean's own source.** The engine is Lean's C++ and the C Lean's compiler emits for Init, Std and Lean, at commit `f3b06c70`, compiled to 64-bit WebAssembly.
- **One pinned patch.** `upstream/lean-wasm-elaborator.patch` adds:
  - Emscripten stubs;
  - a cooperative task manager;
  - C++ signatures that match the C Lean emits;
  - a symbol table in place of `dlsym`.

  It changes exactly one line under Lean's `src/kernel/`, the return type of `lean_kernel_diag_is_enabled`, and `xtask audit` refuses any other kernel change.
- **The driver** (`Elab.lean`, `SymList.lean`). LexLean owns it; it is admitted only as the bytes its release publishes, pinned by BLAKE3 label. No Lean source is committed here.
- **The corpus gate.** An engine counts only when the gate found it equal to native Lean on every corpus declaration and every planted defect was refused. A manifest names that attestation by label in its `gate` field (`src/gate.mjs`).

The rules are proved in Lean in `spec/`:
- `BlobLabel`: a blob is admitted only when its decoded bytes have the manifest's label.
- `InTabProver`: nothing the kernel refuses is accepted.

Not proved, only tested: that gzip and BLAKE3 are implemented correctly, and the gate's agreement, which is evidence about one engine build.

## Blobs and the manifest

The manifest has schema `lean-wasm-prover/1`. Each entry is `{ path, kappa, bytes, encoding: "gzip", encodedBytes }`, where `kappa` is the BLAKE3 label of the decoded bytes. The encoding is transport only. A reader decodes, re-derives the label, and treats any mismatch as a miss. `scripts/make-manifest.mjs` writes the blobs and the manifest.

Module results can be kept in a store keyed by BLAKE3 label (`prove({ project, store })`, `src/store.mjs`). A stored result is reused only after its blobs are relabelled and the kernel checks the module again.

## In a browser

`web/` holds a page and a worker that run the same engine in a tab. The worker fetches the manifest, admits every blob by the BLAKE3 label of its decoded bytes, and caches blobs in the tab's private store (OPFS). The page then elaborates the gate's corpus and compares each module with native Lean, declaration by declaration, with timings.

CI's gate job keeps the two folders the page needs, as artifacts:
- `lean-prover-library`: the manifest and its blobs;
- `lean-prover-browser-corpus`: the rendered modules, their order, and native Lean's answers.

```sh
node web/serve.mjs path/to/lean-prover-library path/to/lean-prover-browser-corpus
```

## Building the engine

```sh
WORK=/tmp/lean-prover bash build/build-engine.sh
```

This needs Linux x86-64. Every input is pinned:
- Lean's commit, the patch, the driver and the dependencies, in `engine.lock.json`;
- Emscripten 6.0.13, by version and checksum in the repository's `tools.lock`.

`build/engine-label.mjs` names a build by the BLAKE3 label of those inputs, and CI rebuilds only when that label changes. Run `upstream/regenerate-patch.sh` to regenerate the patch from its parts for review.

## The gate

```sh
WORK=/tmp/lean-prover bash gate/run-gate.sh
```

The gate runs these steps:
1. It renders the corpus with the release LexLean (0.4.3), and compiles LexLean's runtime with native Lean.
2. It elaborates every corpus module natively and in the engine, then compares each declaration's kind, type hash, value hash and axioms (`gate/agree.mjs`).
3. It plants defects that must each be refused (`gate/defects.mjs`):
   - a changed `.olean` byte;
   - a changed declaration;
   - a wrong axiom;
   - an ungated engine;
   - a broken proof.
4. It writes `gate.json`, which names the engine, library, LexLean and corpus by BLAKE3 label.

The corpus is three LexLean projects:
- `gate/corpus/leap`;
- this package's `spec`;
- LexLean's `examples/fold-laws` at the release commit.
