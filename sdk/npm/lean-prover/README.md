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
  - a symbol table in place of `dlsym`;
  - full-width pointers from JavaScript in the 64-bit build (`EM_ASM_PTR` where Lean's `io.cpp` used `EM_ASM_INT`), so environment variables read above 4 GiB of heap are not truncated.

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

## From npm

An agent's sandbox often reaches only the npm registry, so the same blobs also ship as npm packages (`src/npm.mjs`, specified in `spec/src/NpmShard.lex.tex`):
- **Shard packages**, `@prism-code/lean-shard-<hex>@1.0.0`. Each holds blobs as `b/<hex>.gz`: gzip-encoded, as in the manifest folder and the host store, and named by the BLAKE3 label of the decoded bytes. The package itself is named by the label of its listing, and its `package.json` (`prismLeanShard`) lists every blob's file, label and sizes.
- **One library package**, `@prism-code/lean-library-<hex>@1.0.0`. `<hex>` is the BLAKE3 label of the `manifest.json` it carries. It also carries the gate's attestation and the official Init listing, and depends on every shard at exactly `1.0.0`.

Because each name is a label, a package never changes. npm checks each tarball's integrity, and the prover still re-derives each blob's label on read. Shards are capped at 64 MiB packed: npm publishes no tarball limit, and this stays well under the per-file limits other registries document.

A host can fetch the registry tarballs itself: `shardsFor(manifest)` gives each shard's name, version and blobs, and `open({ manifest, pin, read, gate, official })` then reads from the host's own store. prism-code does this. Or a host can let npm install the library package and open the prover from one pinned label:

```js
import { openInstalled } from "@prism-code/lean-prover/npm";
// after: npm install @prism-code/lean-library-<hex>@1.0.0
const prover = await openInstalled({ pin, from: "/path/to/project/package.json" });
```

The gate packs these packages (`gate/npm-pack.sh`) and holds each tarball to the cap. It never publishes them.

## In a browser

`web/sealed.html` proves a whole LexLean project in a tab with no Lean elaborator, no server and no install. It runs the kernel path (`kernel-path/`), in a worker:

1. LexLean's WASI build checks the project and gives its semantic model (`lexlean snapshot --all`).
2. `kernel-path/src/lower.mjs` lowers the model to Lean kernel declarations: structures, inductives, definitions (structural recursion through the kernel's own recursors) and each theorem's statement.
3. `kernel-path/src/emit.mjs` finds a proof of each theorem (proof kinds `linear_arithmetic`, `decide`, `reflexivity`; any other is refused by name).
4. Lean 4.32.2's kernel (WebAssembly, 2.2 MB) judges every declaration and proof over a small base library (`kernel-path/library/base.ndjson.gz`, 1.2 MB), and reports each theorem's axioms.

The project is accepted only if every theorem is proved and uses only axioms it declared, all among Lean's three standard ones. A proof found here may use fewer axioms than LexLean's own Lean text (an arithmetic proof without `Classical.choice`); that is accepted and shown.

Every byte is named by the seal, `web/seal.json` (`lean-prover-seal/2`, written by `scripts/make-seal.mjs`): code, kernel, base library and LexLean, by BLAKE3 label (Hologram's WebAssembly BLAKE3), and the hasher itself by SHA-256. `?seal=LABEL` pins it. A verdict is kept in the origin's private storage (the file system, or IndexedDB where that does not work) under the label of the seal and every project file, and a returning visit is answered from it after re-hashing.

```sh
node scripts/make-seal.mjs --lexlean path/to/lexlean.wasm --lexlean-url /corpus/lexlean.wasm
node web/serve.mjs LIBDIR CORPUSDIR 8794 path/to/project     # then open /sealed.html?seal=LABEL
```

Measured in Chromium, Firefox and WebKit (Playwright, Windows): a loan app and a seat-booking app built with the Prism SDK, and verdant-engine (1,031 declarations, 72 theorems), each proved on a first visit in 2 to 6 s with at most 111 MiB of kernel memory, and answered from the store in under 0.1 s of work on a returning visit. The elaborator in a tab overflowed the stack on the last two in every browser.

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

The corpus is fixed in `engine.lock.json`:
- foundry's `Spike.Tactics` (`simp`, `omega`, `decide`, `split`, `induction`). It is handwritten Lean, so CI fetches it and admits it by its BLAKE3 label; it is never committed here.
- `gate/corpus/leap`.
- This package's `spec`, including `InTabKernel`.
- LexLean's `examples/fold-laws` at the release commit.
- prism-code's rule app, `model/rule-app`, relocked to Lean 4.32.2 in a work copy.

The engine runs the corpus three ways, and each run must agree with native Lean on every declaration:
- **cold:** an empty module store, under Node 24;
- **warm:** the store the cold run filled, so each module is checked again by the kernel instead of elaborated;
- **cold inside a 4 GiB memory cap:** a cgroup on the CI runner, the cloud-sandbox profile, under Node 24. The engine restarts before every module there. Node 22 cannot instantiate the 64-bit engine.

`speed.json` records total, open and per-module time and peak memory for native Lean and each engine run. Times are recorded, never compared.
