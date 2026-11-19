# How the kernel path joins `@prism-code/lean-prover`

This folder is not yet wired into the package's `prove`. It runs and is tested on its own. This note says how the two
become one prover, and what this folder does not yet satisfy.

## One `prove`, four ways to an answer

`prove` already renders the project (`lexlean lean-modules`), which yields exactly what the kernel path takes: the
generated Lean of each module, and the table of declared axiom policies. With that, each theorem can be answered by
the cheapest way that works, and the judge is the same kernel every time:

| | Way | Needs |
| --- | --- | --- |
| 1 | **reused**: found by its label in the result store | a hash |
| 2 | **found**: a proof found in place, judged by the kernel alone | this folder: 2 MB |
| 3 | **published**: Lean's own proof term, from a pack found by its label, judged by the kernel alone | this folder, and the pack |
| 4 | **elaborated**: Lean's elaborator, as today | the engine: about 22 MB and the library |

Ways 1 to 3 never start the engine. A module all of whose theorems are answered by them is finished in milliseconds;
only what is left goes to way 4. Way 4 is what makes coverage complete for anything a person writes; ways 2 and 3 are
what make the common case small and fast.

The answers map onto the existing result: one row per declaration, `{ name, kind, accepted, axioms }`, with `axioms`
read from the kernel's own environment in every case, and judged against the declared policy by `src/verdict.mjs`
as today. This folder's own rule (a proof found in place counts only on exactly the declared axioms) is a special
case of that table and should be replaced by it.

## What is the same already

- **Labels.** `src/vendor/blake3.mjs` and the labels here are the same function: byte-identical on every input tried.
- **Encoding.** Large blobs here are gzipped and labelled by their decoded bytes, as `src/blob.mjs` requires.
- **Lean.** 4.32.2 at `f3b06c70`, the same commit `engine.lock.json` pins.
- **Reuse rule.** A verdict is reused only under the label of everything that produced it.

## What has to change before this is one implementation

1. **Statements.** The kernel path finds proofs; it takes each statement as Lean elaborated it
   (recorded in the library as `LexStmt.*`). In the package the statement must come from the render, or from a statement-only
   elaboration by the engine. This is the real seam, and it is open.
2. **One manifest.** `pin.json` here should become entries of the `lean-wasm-prover/1` manifest (kernel, loader,
   library, emitter), admitted by `readAdmitted`, with the corpus gate attesting the kernel as it does the engine.
3. **One store and one hasher.** Use `src/store.mjs` and `src/vendor/blake3.mjs`; keep Hologram's OPFS store only as a
   browser backend.
4. **The kernel build.** Build it in CI from `engine.lock.json`, under a label, like the engine. The copy here was
   built by hand ([kernel/BUILD.md](kernel/BUILD.md)).
5. **The library and the lemmas.** The lemma library (`LexReflect.lean`, about 700 lines of handwritten Lean) is not in this folder, because this repository carries no handwritten Lean. It belongs in LexLean, as a source package verified by its own
   pipeline, with the export a release asset found by label (UOR-Foundation/lexlean#580).
6. **Registration.** No `LP-` row, scenario, spec or diagnostic code exists for any of this. Nothing here has been
   through this repository's gates.

## What was measured

See [README.md](README.md). In short, on LexLean's `fold-laws` example: all 31 theorems judged proved by the kernel,
29 found in place on Lean's exact axioms and 2 by Lean's own proof; 2 to 4.6 s on a first visit in three browser
engines, 20 to 50 ms on a later one with no kernel started; native Lean 4.32.2 accepts the same files.
