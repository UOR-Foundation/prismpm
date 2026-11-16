# Proving and building a Prism app with no Docker

Status: draft proposal for #692. No code changes. Read at PrismPM `ddb59378`, `prism-code` 0.9.1.

Every claim below carries one of three marks.

- **Measured**: run in this study, on Windows 11, Lean 4.32.1, Node 22.21.
- **Reported**: taken from the task brief, issue #647, or an external project's own pages. Not re-run here.
- **Inferred**: reasoned from source that was read, not tested.

## 1. Recommendation

Stop building each app. Check it instead.

Today each app is compiled: Lean elaborates the model, a Lean program exports it, Rust compiles it to WebAssembly, and a second Rust program is compiled to test it. Docker exists to hold that compiler chain still. The chain is the cost, not Docker.

The spec language is small and closed: at most 8 fields, 24 rules, eight comparison operators, no arithmetic in conditions (`sdk/npm/prism-code/src/journey/spec-schema.mjs:17-38`). A language that small does not need a compiler per app. It needs three fixed things, made once and named by their hash:

1. **One guest.** A single WebAssembly module that reads the spec as data and answers requests. It is compiled once, in CI, by today's pipeline. An app's guest is those fixed bytes plus the spec bytes.
2. **One lemma.** A decision procedure for the rule language, proved sound once in Lean. An app's theorem is that lemma applied to the spec data. No tactic search runs per app.
3. **One small kernel.** An independent Lean proof checker compiled to WebAssembly, run by Node. It checks the lemma's application on the user's machine.

A build on the user's machine then becomes: read the JSON, write the data, check it with the kernel, pack the holo, replay the acceptance vectors in the existing JavaScript runtime. No Lean, no Rust, no container, no server.

Expected result (inferred from the parts measured or reported below): a first download of a few megabytes in place of 5.5 GB, and a build in about a second in place of ten minutes.

This is design C in section 4. It extends issue #647, which already proposes the kernel half for the browser. This proposal adds the build half and the plan to retire Docker from the user's machine. Docker stays in CI, where the three fixed things are made.

The riskiest assumption was that app theorems can be proved without Lean's tactics. Section 7 tests it. It holds for a real app, and the test also found the limit that the full design must fix.

## 2. Inventory: what the image holds and which step uses it

All Rust paths are at `ddb59378`. Each child process runs under `timeout` with a cleared environment (`crates/prismpm/src/sdk/process.rs:18,339-372`).

| Tool | Version | Used by | Reference | Must it run on the user's machine at build time? |
|---|---|---|---|---|
| Lean, `lake`, `leanchecker` | 4.32.1 | `lexlean verify`; `lake build PrismGenerated`; `lake build prod-export`; `lake exe prod-export` | `sdk/Dockerfile:115-120`; `tools.lock:18-27`; `crates/prismpm/src/application_build.rs:768-795,995-1052` | Today yes: it elaborates the proofs and compiles the model. Under design C no: nothing is elaborated per app. |
| LexLean | 0.4.0 (`e0b74b81`) | `lexlean lock`, `fmt`, `check`, `verify`; also linked into `prismpm` | `sdk/Dockerfile:254,266`; `crates/prismpm/src/verification.rs:2613-2627` | Today yes. Under C only in CI, to produce the pinned library. |
| `prod-export` (lean4-prod, a Lean program) | `991956fe` | Exports compiled Lean as IR for named roots | `crates/prismpm/src/exporter.rs:17`; `application_build.rs:1053-1059` | Today yes, rebuilt by `lake` per build. Under C once, in CI. |
| `prod-ir`, `prod-codegen` (Rust, linked into `prismpm`) | 0.1.0 | Turn the IR into Rust source for the guest | `Cargo.toml:28-29`; `application_build.rs:1061,1187-1190` | Same. |
| Rust `cargo`, `rustc`, `rustfmt` | 1.97.1, target `wasm32-unknown-unknown` | `cargo check`, `cargo package`, `cargo build --locked --offline --release` for the guest; verify-stage package tests | `sdk/Dockerfile:3,101-108`; `application_build.rs:1100-1126,1196-1256`; `verification.rs:2153-2182,2304-2358` | Today yes: the guest is compiled per app. Under C no. |
| `wasm-bindgen-cli` | 0.2.122 | Browser view adapter | `application_build.rs:1267-1279` | Today yes. Under C the adapter is also fixed bytes. |
| `wasm-tools` | 1.258.0 | Validates the guest: no imports, three exports | `verification.rs:2236-2272` | Verify only. `prism-code` already checks the same exports in JavaScript (`src/core.mjs:14-38`). |
| `hologram-oracle` (Rust test program) | Hologram Live `d8208266` | Compiled per project, then replays every acceptance vector through an independent runtime | `verification.rs:117-123,475-609` | Verify only. This is the 1.4 GB per project: its build directory is `<project>/target/hologram-oracle` (`verification.rs:486`). |
| Node, Playwright, Chromium | 22.23.2, 1.62.1, 157 | The oracle's browser pass | `crates/prismpm/src/browser_oracle.rs:9-11` | Verify only. |
| `timeout` (coreutils) | 9.4 | Wraps every child | `verification.rs:455` | Only because children are spawned. |
| Docker CLI, buildx, compose | 28.4.0 | Standards oracles, deploy, image scan | `crates/prismpm/src/authority.rs:1935-2124` | No. Not on the app build path. |
| cosign, oras, kind, kubectl, slsa-verifier, osv-scanner, just, cargo-deny and others | pinned in `tools.lock:98-116` | Release, deploy, conformance | `sdk/Dockerfile:129-205` | No. |

Three findings from the inventory.

**The Docker socket is not used by an app build (inferred).** `prism-code` mounts `/var/run/docker.sock` for the build only (`src/docker.mjs:93-105`, `src/journey/engine.mjs:296`), with the comment "`socket` is for `prismpm verify`" (`src/journey/sdk.mjs:78`). But `crates/prismpm/src/verification.rs` contains no mention of Docker (measured: `git grep -i docker` on that file returns nothing). Docker calls live in `authority.rs`, `lifecycle.rs` and `supply_chain.rs`, which serve `prismpm oracle`, deploy and image scan. The mount gives the container control of the host's Docker for no benefit on this path. Removing it needs one test: a build with the mount removed.

**The pinned-executable check is why the pipeline will not run natively.** Without the image's signed inventory, `prismpm` compares `lake`, `lean`, `rustc`, `rustfmt`, `timeout` and `node` to hard-coded Linux SHA-256 values and stops with "required executable {name} has an unpinned digest" (`crates/prismpm/src/sdk/process.rs:20-28,83-101`).

**The JavaScript runtime already replays acceptance vectors without Rust.** After every build `prism-code` loads the holo and calls `app.acceptance()` (`src/journey/engine.mjs:489-490`), which compares bytes through the guest using only `WebAssembly` (`src/core.mjs:85-103`). The oracle adds an independent runtime, the view path, an allocation probe and a Chromium pass.

## 3. What Docker buys, and the cheapest replacement for each property

| Property | How Docker gives it | Cheapest mechanism without Docker |
|---|---|---|
| A pinned toolchain | One image digest covers every tool | Name each artifact by its hash and check the hash on every read. Better: have no toolchain. Fixed guest bytes and a fixed kernel need three hashes, not an image. |
| Isolation | Linux namespaces. Weakened today by the socket mount | A WebAssembly module with no imports cannot touch files or the network. The guest is already import-free (`src/core.mjs:2-4`). The kernel needs only bytes in and a verdict out. Do not rely on `node:wasi` for isolation: Node's documentation says it is not a secure sandbox (reported, `nodejs.org/api/wasi.html`). |
| A known operating system | Ubuntu in the image | Do not depend on one. WebAssembly integer code gives the same result on every host. Neither the guest nor a proof kernel needs floating point. |
| Reproducible bytes | Same tools, remapped paths, `codegen-units = 1`, a rebuild that must match byte for byte (`application_build.rs:1093-1099`; `verification.rs:2420-2498`) | Delete the steps that can vary. If no compiler runs per app, the output is fixed bytes plus a canonical encoding of the spec. Test it on a CI matrix of three operating systems and three Node versions, each comparing the holo hash to a committed value. |

## 4. Candidate designs

Figures marked "today" come from the task brief (reported): 5.5 GB download, 20.9 GB unpacked, 1.4 GB per project, a first build over ten minutes, a local proof in 75 s.

### A. The same tools, installed natively

**How.** `prism-code` fetches Lean, Rust, LexLean and PrismPM binaries for the host, each by hash, and runs today's pipeline with no container. The digest table gains an entry per platform.

- **Download and disk.** Lean 4.32.1 is 1.02 GB unpacked on Windows and a Rust toolchain about 0.9 GB (measured, local installs). Add PrismPM, LexLean, Node and Chromium. About 2 to 3 GB (inferred). Still 1.4 GB per project.
- **Time.** Unchanged: minutes. The same steps run.
- **Platforms.** Five builds of PrismPM and LexLean to make and sign. `timeout` and a POSIX shell do not exist on Windows.
- **Trusted base.** As today, minus Docker, plus one binary set per platform in place of one image.
- **What breaks.** Byte identity across platforms. `rustc` on different hosts is not promised to emit the same bytes (inferred; not tested). The oracle's Chromium is platform specific.
- **Work.** Medium. It speeds nothing up and deletes nothing.

### B. The same tools, compiled to WebAssembly

**How.** Ship Lean and `rustc` as WebAssembly modules and run them under Node.

- **Lean.** The last official WebAssembly build was v4.15.0, a 190 MB archive. Releases v4.22.0 and v4.35.0 have none. A Lean maintainer wrote in February 2026 that such builds "do not currently exist, and are not on the FRO roadmap" (reported, release assets and Lean Zulip archive).
- **Rust.** `rubrc` runs `rustc` in a browser. It is pre-release and supports no external crates (reported, `github.com/oligamiq/rubrc`). The guest build needs an offline registry of crates.
- **Time.** Slower than native. One WebAssembly kernel is 2.1 to 3.5 times slower than its native build (reported, Lean Kernel Arena, kefir).
- **What breaks.** It depends on two builds nobody maintains.
- **Verdict.** Not viable now. It also keeps every step.

### C. Check, do not build (recommended)

**How.**

1. The agent writes `spec.json`. `prism_spec` checks it. Unchanged.
2. `prism-code` encodes the spec in one canonical byte form and computes its hash.
3. Guest: fixed interpreter bytes with the spec bytes placed in one data segment. The existing guest interface (`memory`, `holo_alloc`, `holo_run`) is unchanged, so the existing runtime runs it.
4. Proof: for each property, a term of the shape `sound n constants formula (Eq.refl true) request`. `sound` lives in a pinned Lean library. The term is data plus one fixed lemma name.
5. Check: a kernel compiled to WebAssembly checks the term against the pinned library, in the Node process.
6. Pack the holo and replay the acceptance vectors in JavaScript, as `engine.mjs:489-490` does now.

Made once in CI, in today's SDK image: the interpreter guest, the pinned library, and the kernel module. Each is built twice on separate runners and must match byte for byte. Lean's own kernel checks the library there.

- **Download.** Kernel: 252 KB compressed (reported, #647, nanoda). Library: 4.06 MB compressed today, about 1 MB once pruned (reported, #647). The decision procedure of section 7 compiles to a 0.97 MB object file (measured). Interpreter guest: not built yet, so unknown. A few megabytes in total (inferred).
- **Disk.** The same few megabytes, once. Nothing per project beyond the holo.
- **Time to prove.** A whole app checked in about 0.5 s in a browser tab (reported, #647). The three parking-fee theorems checked in 0.1 to 1.1 s by native Lean (measured, section 7).
- **Time to build.** No compile step remains. Encoding and packing are byte copies. Under a second (inferred).
- **Platforms.** Anywhere Node 22 or later runs. A browser too, which #647 needs.
- **Trusted base.** See section 6.
- **What breaks.**
  - The holo of an existing spec changes once, because the guest bytes change. Old holos still run.
  - The interpreter is slower per request than compiled code. Requests are at most 512 bytes, so this is unlikely to matter (inferred, not measured).
  - The simple decision procedure does not scale past about three fields. Section 7 measures this and names the fix.
  - Stateful apps (`prism/spec/2`) add `set`, `add` and `subtract` (`src/journey/stateful.mjs:36,312-342`). The lemma must cover them. Not yet designed.
  - The independent oracle no longer runs on the user's machine. It moves to CI, run once against the interpreter.
- **Work.** Large, but each stage in section 5 ships alone.

### D. Search anywhere, check locally

**How.** Keep Lean's tactics, but run them on any machine and publish the resulting proof by the hash of its inputs. The user's machine only runs the small kernel on the published proof. This is the interim state of #647.

- **Download, disk, time.** As C for the proof. The build still needs Rust, so it still needs Docker or GitHub Actions.
- **What breaks.** A new theorem needs a server once. A user offline with a new spec cannot prove.
- **Trusted base.** The server is not trusted, because its output is checked. Availability depends on it.
- **Work.** Small. Useful as stage 2a if the lemma of C is late.

### E. Prism building Prism

**How.** Package steps 2 to 6 of design C as a holo: request is `spec.json`, response is the app's holo. The existing runtime runs it.

- **What must be proved about it.**
  1. The guest in the output is the pinned interpreter bytes, with a data segment equal to the canonical encoding of the input spec.
  2. Every theorem in the output states the property written in the input, over that same encoding.
  3. It refuses any spec the checker refuses.
  Determinism needs no proof. A module with no imports is a function of its input.
- **Trusted base.** As C, with the JavaScript packer replaced by a proved one.
- **Bootstrap.** The first builder is built in CI by today's SDK image, twice, with matching bytes. The builder packs data. It does not compile Lean. So it cannot rebuild itself or the interpreter, and there is no regress to resolve: the heavy toolchain stays in CI for those two artifacts. That also means this is not self-hosting in the strict sense, and the proposal should not claim it is.
- **What breaks.** A text app's response is capped at 64 bytes today (`src/journey/spec.mjs:380-383`). A builder needs a response of tens of kilobytes, so a new application profile.
- **Verdict.** A good last stage. It adds proof to a step that C already makes small. It is not what removes Docker.

## 5. Why C, and what it costs

**Reasons.**

1. It deletes steps. A, B and D keep the compiler chain and move it. C removes elaboration, export, Rust compilation and the per-project test program from the user's machine.
2. Determinism stops being a property to defend. With no compiler per app there is nothing host-dependent left to vary.
3. It closes a gap #647 names. Today a JavaScript evaluator computes the acceptance vectors while Lean proves a separately generated model (#647, D3). Under C the guest and the theorems read the same spec bytes.
4. The fragile parts go away. The stalled container output, the missing exit code and the orphaned build all come from a long child process. A one-second in-process check has no such state.
5. The evidence supports it: independent kernels in WebAssembly exist and pass the public test suite (section 8), and section 7 shows a real app's theorems proved with no tactic search.

**Trade-offs.**

1. The interpreter becomes the most important program in the system. A bug in it is a bug in every app. Today a compiler bug has the same reach, but the interpreter is new code.
2. The spec language and the lemma must grow together. A new operator needs a proof before it ships. That is a real brake on features. It is also the point.
3. Users lose the local independent oracle. They keep the JavaScript replay.
4. Lean's own kernel no longer runs on the user's machine. A second, independent kernel does. #647 calls these two verdicts "kernel-checked" and "proved", and that wording should carry over.
5. The work is larger than A.

## 6. Trusted base, before and after

"Trusted" means: if it is wrong, a false claim can pass.

| | Today (Docker) | Design C |
|---|---|---|
| Statement says what the spec says | `render.mjs` and `render-stateful.mjs`, unverified JavaScript | The emitter of the data form. Smaller, and it can be checked by printing the data back as JSON and comparing bytes (#647, D1). |
| Proof is valid | Lean elaborator output, checked by Lean's kernel | An independent kernel on the user's machine. Lean's kernel on the pinned library, in CI. |
| Guest matches the model | `prod-export`, `prod-codegen`, `rustc`, LLVM, run per app | The same chain, run once for the interpreter and reproduced by two builders. |
| Tools are the right tools | Image digest, registry, Docker | Three hashes, checked on every read. |
| Packing | `prismpm`, then a byte-identical rebuild | JavaScript packer, checked by recomputing every hash. Proved, under E. |
| Runs correctly | Wasmtime in the oracle, Chromium, Node | Node's WebAssembly engine. |

**What a third party checks, without trusting the builder's machine (design C).**

1. Recompute the hash of the spec from its bytes.
2. Compare the guest to the published interpreter hash, and its data segment to the spec bytes.
3. Run any kernel on the proof bundle. The Lean Kernel Arena lists fifteen that pass all its tests (reported).
4. Read the statement of `sound`, once. It is one line (section 7).
5. Replay the acceptance vectors.

None of these steps needs Lean, Rust or Docker. Today step 3 needs the 20.9 GB image.

## 7. Experiment: can an app be proved with no tactic search?

**Assumption tested.** Design C needs each app theorem to be one fixed lemma applied to data, so that the user's machine runs a kernel and nothing else. Today every theorem uses `linear_arithmetic` (`render.mjs:314`), which LexLean lowers to `simp only`, `split` and `omega` (`vendor/lexlean/src/backend/semantic.rs:1441-1471`). Those are tactics. They need Lean's elaborator.

**What was built.** A 276-line Lean file, using only Lean's core library:

- a data type for conditions, rule chains and properties;
- an evaluator written with the same operations LexLean emits (`Nat.ble`, `Nat.blt`, `Nat.beq`, an `if` chain), read from a real generated module;
- `check`, which evaluates a property at a finite set of representative requests: for each constant `c` in the spec, the values `0`, `c` and `c + 1`;
- one theorem, proved once:

```lean
theorem sound (n : Nat) (cs : List Nat) (f : F) (h : check n cs f = true) (env : Nat → Nat) :
    f.eval env = false
```

Then the parking-fee demo app (2 fields, 4 rules, 3 properties) was written twice: as the definitions LexLean generates, and as data. Each of its three theorems is then:

```lean
theorem inv001Holds (request : Request) : breaksInv001 request = false :=
  sound 2 cs inv001F (by decide +kernel) (env request)
```

`decide +kernel` asks the kernel to evaluate `check` and does nothing else. The statement is about the LexLean-shaped definition, not about the data. The kernel accepts the two as equal by unfolding.

**Results (measured).**

| Measurement | Result |
|---|---|
| Soundness proof compiles | Yes, 2.6 to 4.9 s, once |
| Three app theorems accepted by Lean 4.32.1 | Yes |
| Time for the app file | 1.9 to 2.9 s, against 1.8 s for a file that only imports the library. So 0.1 to 1.1 s of checking. Three runs, noisy. |
| Axioms | `propext`, `Classical.choice`, `Quot.sound` |
| Planted defect: rule 2 answers `premium` | Refused. "`decide` proved that the proposition `check 2 cs inv001F = true` is false". The other two theorems still pass, as they should. |
| App-specific source | 2.7 KB, 45 lines, no tactic but `decide +kernel` |
| Scaling: 2 fields, 12 constants (625 requests) | 5.2 s |
| Scaling: 3 fields (15,625 requests) | 24.2 s |
| Scaling: 4 fields (390,625 requests) | Not finished after 10 minutes. Stopped. |
| `leanchecker` replay of the app module | 17.2 s wall time. Not broken down; most is likely start-up. |

**What it shows.**

1. The assumption holds. A real Prism app's theorems can be proved by one lemma applied to data, with no tactic search, and stated over the definitions LexLean already generates.
2. The simple procedure is not the final one. It tries every combination of representative values, so its cost grows as (2 × constants + 1) to the power of the field count. It is fine for two fields and unusable at four. The spec allows eight.
3. The fix is known in shape. Let untrusted JavaScript find a case split, and have the proved checker only confirm it. Cost then follows the number of cases that matter, not the product. `render.mjs` already holds a search of this kind for finding witnesses. This is design work, and it is the main risk left.

**Not covered.**

- Conditions that compare two fields (`value: {field}`). The spec allows them; the lemma here does not.
- Stateful apps.
- The exact axiom list. Today each theorem declares `[Quot.sound, propext]`. This proof also uses `Classical.choice`, through `omega`. It is on the allowed list (`src/journey/sdk.mjs:159`), but the declared set would change.

**The second half was not run.** The plan was to export the proof with `lean4export` and check it with two independent kernels, nanoda and kefir, natively and as WebAssembly under Node. The three repositories were cloned. Building them was refused by this session's permission policy, which blocks compiling and running freshly downloaded third-party code. So this study has no measurement of its own for a WebAssembly kernel. The figures used are reported ones: #647's prototype (nanoda, 252 KB, 0.5 s per app) and the Lean Kernel Arena's kefir-wasm entry. To finish it: build `lean4export` at tag `v4.32.2`, export `Reflect.App`, and run kefir's `wasm32-wasip1` build on the output under Node.

The experiment source is not in this pull request, because `AGENTS.md` forbids committing handwritten Lean. It is kept outside the repository and can be attached to the issue.

## 8. Lean kernels that can run as WebAssembly

Two different jobs are often confused.

- **Elaboration** turns Lean source and tactics into proof terms. It needs Lean itself. No maintained WebAssembly build of Lean exists.
- **Kernel checking** type-checks finished proof terms from an export file. It is small and has been rewritten many times.

All figures here are reported, read from each project's pages through a summarising fetcher. They were not verified byte for byte.

| Project | Checks | Language | WebAssembly | Speed and size | Licence | Maintained |
|---|---|---|---|---|---|---|
| kefir | Kernel only. Rebuilds recursors itself | Rust | Yes: `wasm32-wasip1` under Node 24, one thread | All of Mathlib in 9.23 min as WebAssembly, 6.18 min native. Passes all arena tests. Binary size not stated | Apache-2.0 | New: first commit 2026-10-24, one author |
| nanoda_lib | Kernel only | Rust | Not stated upstream. #647 reports a 252 KB build | Mathlib in 15.3 min on 4 threads. Fails 2 of 138 accept tests | Apache-2.0 | Yes, last commit 2026-11-07 |
| nano-lean | Kernel only | Rust | Not stated | Mathlib in 64.4 s, fastest listed | MIT | Unconfirmed |
| pestka | Kernel only | Aver | Yes, about 0.6 MB, needs wasm-gc | Mathlib in 18.5 min as WebAssembly | Unconfirmed | Unconfirmed |
| lean4lean | Kernel only | Lean | No | Mathlib in 38.8 min | Apache-2.0 | Yes |
| `leanchecker` | Lean's own kernel, replayed. Not independent | Lean | No | Ships in every toolchain since v4.28.0 | Apache-2.0 | Yes |
| Lean official build | Everything | C++ and Lean | Last at v4.15.0, 190 MB | "Slower than native" (2021) | Apache-2.0 | WebAssembly build dropped |
| lean4export | Checks nothing. Writes the export | Lean | Needs Lean | Format 3.1.0. The arena calls it "still in flux" | Apache-2.0 | Yes |

Work in this repository's vendored code:

- `vendor/lean4-prod` is a compiler path, not a checker. `prod-export` is a Lean program, so it needs Lean. `prod-ir` and `prod-codegen` are Rust and turn its output into guest source.
- `vendor/lexlean` generates Lean and drives `lean` and `leanchecker`. It contains no kernel. #647 notes that its `src/backend/core_v2.rs` already builds Lean terms from JSON, which is the natural home for the emitter of design C.

Kernel features an independent checker needs for these proofs: fast arithmetic on number literals (`Nat.ble`, `Nat.blt`, `Nat.beq` are among the operations Lean's kernel overrides), and nothing else unusual. nanoda, kefir and lean4lean are reported to have it. Proofs must not use `native_decide`: its axiom cannot be checked externally, and `prism-code` already refuses it (`src/journey/sdk.mjs:152-165`).

## 9. Servers

| Dependency | Reference | Avoidable offline after first install? | What is lost without it |
|---|---|---|---|
| npm registry | implicit in `npx` | Yes, once cached. `npx prism-code@latest` asks the registry each time; a pinned version does not | Updates |
| Image registry `ghcr.io` | `src/journey/sdk.mjs:18` | Yes once pulled today. Under C it is not used at all | Nothing, under C |
| Hosted verifier `mcp.uor.foundation` | `src/hosted.mjs:42,147`; `src/journey/engine.mjs:42-44` | Yes. It is used only with `PRISM_CODE_TIER=hosted` | A proof route for users with no Docker. C makes it unnecessary. It stores models unlisted, not private |
| GitHub Actions and Pages | `src/remote-github.mjs:51,129`; `src/journey/github.mjs:235-238` | Yes for building. No for publishing | A public place to host the app and an independent rebuild |
| Template repository `raw.githubusercontent.com` | `src/journey/github.mjs:24-33,44` | Yes for a local build: templates ship in the package | The remote build route |
| Telemetry | `src/gaps.mjs:52-54`; rides hosted requests (`src/hosted.mjs:175`) | Yes. Off with `PRISM_TELEMETRY=0` or `DO_NOT_TRACK` | Gap reports to the maintainers |
| Sigstore | `src/attest.mjs:37-46,84-86` | Yes. Optional packages | Proof of who built it. A hash says which bytes, not who made them |

A local prove and build already make no network call from inside `prismpm`: cargo runs offline from an embedded registry (`application_build.rs:1087-1092`). Under C the only first-install fetches are the npm package and the three fixed artifacts, which can ship inside the package.

## 10. Staged plan

Each stage ships alone. Docker stays the default until the stage that replaces it has been measured against it on the same specs.

**Stage 0. Make today's route cheaper and safer.** Days.
- Remove the Docker socket mount from the build, after one test confirms the build passes without it.
- Share the oracle's build directory across projects, keyed by image digest, in the cache volume that `/tmp` already uses. Saves 1.4 GB per project after the first.
- Report a child that ends with no exit code as its own typed failure, with the last step reached. Adopt a build that outlived its server.
- Ships: lower disk use, a smaller attack surface, honest errors.

**Stage 1. Finish the experiment.** Days.
- Run the exported proof through kefir and nanoda as WebAssembly under Node on Windows, macOS and Linux. Record size, time and memory.
- Gate: the same verdict on all three, and the planted defect refused by both kernels.

**Stage 2. Prove without Lean on the user's machine.** Weeks.
- 2a: publish proofs by input hash and check them locally with the kernel (design D). Works for any theorem at once.
- 2b: the pinned library with a certificate-checking lemma that covers field-to-field conditions and scales to 8 fields and 24 rules. Then stateful apps.
- Gate: for every example spec, the local verdict equals the Docker verdict, and the worst-case spec checks in under 2 s.
- Ships: `prism_prove` in about a second, offline, with no Docker and no hosted verifier.

**Stage 3. Build without Rust on the user's machine.** Weeks.
- The interpreter, written once in the pinned library and compiled in CI. The JavaScript packer.
- Gate: for every example spec, the interpreter guest and today's compiled guest give the same response bytes for every acceptance vector and for a large random sample of requests. The holo hash is equal across the three-system CI matrix.
- Ships: `prism_build` in about a second. Docker becomes optional for users.

**Stage 4. The builder as a holo.** Later.
- Design E, with its three proof obligations. Remove Docker from the default install path.

## 11. How determinism is kept and tested

The same spec must give the same holo on every platform.

- **How it is kept.** The holo is a function of four byte strings: the spec in canonical form, the interpreter, the library, and the format version. No clock, path, locale or host tool enters. #647 (D7) already notes one clock to remove: the commit time in the Security module.
- **How it is tested.** A CI matrix (Windows, macOS on ARM, Linux; Node 22, 24, 26) builds a fixed set of specs and compares each holo's SHA-256 to a committed value. Stage 3 also compares against the holo the Docker route produces, vector by vector.
- **Planted defect.** Add `Date.now()` to the packer on a test branch. The matrix must fail.

## 12. Not verified, and open questions

**Not verified.**

1. That `DEFAULT_SDK_IMAGE` (`sha256:cd3b47d7…`) was built from `sdk/Dockerfile` at the commit read. The inventory describes the image family.
2. That a build passes with the Docker socket removed. Inferred from source only.
3. Any WebAssembly kernel measurement of my own (section 7).
4. The brief's cost and fragility figures. They are quoted, not re-measured.
5. External project figures. They came through a summarising fetcher.
6. The size and speed of an interpreter guest. None exists.
7. Whether `rustc` emits identical guest bytes across host platforms (design A).
8. What `prismpm check` and `lexlean lock`, `fmt` and `check` spawn.
9. That `omega` and `simp` always produce terms an external kernel accepts. Expected, not confirmed from a primary source.

**Open questions.**

1. Where does the pinned library live? `AGENTS.md` forbids handwritten Lean in PrismPM, and the soundness proof needs induction. #647 says LexLean has no induction proof form. Either LexLean gains one, or the library lives in LexLean under its own rules. This decides the schedule of stage 2b.
2. Which kernel? kefir passes every arena test and already targets WASI, but it is three weeks old with one author. nanoda is established but fails two accept tests. #647 already lists this comparison as a task.
3. Lean 4.32.1 has a known soundness bug, fixed in 4.33.1 (#647, D9). The library should be pinned to a fixed version before its hash is published.
4. How is the spec placed in the guest: a patched data segment, or passed by the host on each call? A data segment keeps the runtime unchanged. The host route is simpler but moves trust to the host.
5. Is the one-time change of every app's holo hash acceptable, and how is it announced?
6. Does the independent oracle still have to run per app for any conformance claim in `CONFORMANCE.md`? If so, that claim needs a new owner in CI.
7. `node:wasi` is still marked experimental in Node 26 (reported). A kernel that needs no system calls avoids it. Does kefir's build need WASI for anything but reading its input?
