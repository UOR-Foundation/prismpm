# LexLean prover: the kernel path

Proves LexLean modules where the reader is: in a browser tab or in Node, with no server. The judge is Lean's own
kernel, version 4.32.2, as WebAssembly. Nothing is reported proved that this kernel did not accept.

```js
const result = await prover.prove(moduleText);
// { theorems, proved, failed: [{ name, why }], reused, found, published, ms }
```

Every theorem ends in one of three ways:

| | What happens | Cost |
| --- | --- | --- |
| **reused** | It was judged before under this exact environment, and is found by its label. | a hash |
| **found** | A proof is found here with no Lean running, and the kernel accepts it on the declared axioms. | about 1 ms to find, 1 to 10 ms to judge |
| **published** | Lean's own proof term, from a pack found by its label, is judged here and bound to its statement. | a fetch, then the kernel |

Otherwise it is in `failed`, with the reason.

## What it rests on

- **One judge.** `kernel/lean-kernel.wasm` is Lean 4.32.2's C++ kernel, built from a clean checkout with nothing under
  `src/kernel` changed ([kernel/BUILD.md](kernel/BUILD.md)).
- **One label for the environment.** `pin.json` names the kernel, the library, and this code by their UOR κ-labels
  (BLAKE3). The pin's own label is the environment, and every memo address includes it. Change a byte and nothing is
  reused.
- **Nothing runs unverified.** The page's boot script only verifies: the hashing code against SHA-256 with the
  browser's own `crypto.subtle`, then every other file against its label. Modules and workers are built from those
  checked bytes. Node does the same (`src/node.mjs`).
- **The library is judged where it is used.** The first kernel a session starts checks the whole library once, and
  remembers that under its label.
- **Any storage.** Objects are found by the label of their own bytes, so the store needs no trust: Hologram's
  `KappaStore` on OPFS, else IndexedDB, else memory; in Node, a folder.

## How a proof is found here

The trusted part is small: `LexReflect.soundT`, a checker for integer
inequalities with conditionals, proved sound once. A certificate is a list of cuts and a final combination; the
kernel evaluates the checker on it. Around that core, lemmas proved once turn each statement form into those
inequalities or back: Boolean comparisons, equalities, division and remainder by a constant, naturals, bytes, pairs.
Laws about folds are reduced by fusion lemmas, where induction is done once, to two obligations with no fold in them.
A Boolean goal `b = false` is refuted from `b = true`: `&&` and `!` are taken apart, `Nat.blt`, `Nat.ble` and
`Nat.beq` become inequalities, and a disequality or an `if c = true` is split both ways only when the search needs it.
That is the shape of a Prism app's guarantees: `examples/loan-approval` has three, all proved here with no elaborator.

The search (`src/emit.mjs`) is not trusted. A bug in it can fail to find a proof; it cannot make the kernel accept a
false one.

A proof found here counts only if it rests on exactly the axioms declared for the theorem. If it would rest on
others, Lean's own proof is used instead.

## Run it

```
npm test                 # everything: what is proved, what must be refused, nothing judged twice
node serve.mjs           # then open http://localhost:8787/web/index.html
node test/browsers.mjs firefox webkit iphone     # needs Playwright and its browsers
```

Rebuilding the library, the published proofs and the pin is the only step that runs Lean
and is not in this folder. The lemma library is a LexLean source package (`reflect-library`, UOR-Foundation/lexlean#587), verified by `lexlean verify`; the library here is exported from that verified build (see [INTEGRATION.md](INTEGRATION.md)).

## One prover for every build

In a browser, `openShared` (src/shared.mjs) gives every tab of the origin the same prover. A Web Lock named by the
environment's label decides which tab owns it; the others ask it over a BroadcastChannel and start nothing: no kernel,
no library, no memo. The kernel and the library are fetched only by the owner, at the first request. Kernels with
nothing to do for 30 seconds are let go, and the next request starts them again without judging the library twice.
The same module asked for twice at once is judged once. When the owner's tab closes, another tab takes over. A tab
whose owner does not answer (a frozen background tab) proves alone rather than wait.

## Measured

On one desktop, Lean 4.32.2 kernel, the `fold-laws` example (31 theorems across three modules):

| | Result |
| --- | --- |
| Download | 1.8 MB gzipped: library 1.29 MB, kernel 0.43 MB, the rest 0.1 MB |
| Coverage | 31 of 31 judged proved: 29 found here on Lean's exact axioms, 2 by Lean's own proof |
| First visit | 2.2 s Chromium, 4.6 s Firefox, 2.3 s WebKit, of which about 1 s is judging the library once |
| Returning visit | 20 to 48 ms, no kernel started |
| 3,000 generated theorems, Node, 8 kernels | 6.1 s first time, 0.3 ms again, 20 ms after one edit |
| Native Lean 4.32.2 | accepts the same files, and refuses an altered proof |

## Limits

- **Statements come from Lean.** The library records each theorem's statement as Lean elaborated it; the
  emitter finds proofs, it does not yet write statements for every form.
- **One example.** Coverage is measured on `fold-laws` only.
- **A new theorem of a form not covered** needs Lean to run once somewhere, to publish its proof.
- **Heavy proofs stay heavy.** An Atlas module took 379 s and 2 GB in this kernel, and about the same natively.
- **Browsers.** Run in Chromium, Firefox and WebKit builds on a desktop, and with a phone's screen and user agent
  emulated. Not run on Safari itself or on a real phone.
- **Not reproducible yet.** The kernel build is not shown to be byte-reproducible, and the toolchain's files are not
  checked against the release archive's hashes.

## Layout

```
src/emit.mjs      finds proofs; reads a module, writes kernel terms          (untrusted)
src/prover.mjs    the prover: labels, memo, kernels, published proofs        (one implementation)
src/shared.mjs    one prover for the origin: every tab and build is served by one set of kernels
src/worker.mjs    one kernel per worker, in a browser or in Node
src/store.mjs     κ-stores: OPFS, IndexedDB, memory, a folder
src/node.mjs      open() for Node          web/           the page
(the Lean sources and the export step are kept with LexLean, not here)
kernel/  hologram/  library/               the pinned kernel, the hashing code, the resident library
examples/fold-laws/   generated modules, declared axioms, Lean's own proofs for the two that need them
pin.json          what this prover is
```
