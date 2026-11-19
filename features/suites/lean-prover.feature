Feature: lean-prover

  @LP-01 @build
  Scenario: prove admits a module only when LexLean's check and render accept it, Lean elaborates it without error, the kernel replay accepts every declaration, and each declaration's observed axioms equal its declared policy.
    Given the verdict over a rendered project and the engine's answers, and the axiom audit over observed sets
    When prove judges a module
    Then it is admitted only with no elaboration error, no kernel refusal and every declared policy met
    And a project without LexLean's declared policies is refused with lean-prover.axiom-policy

  @LP-02 @build
  Scenario: A blob is admitted only when it decodes and the BLAKE3 label of the decoded bytes equals its manifest label; any other blob is refetched, and prove refuses a manifest whose label is not the pinned one.
    Given a manifest pinned by its BLAKE3 label and blobs stored gzip-encoded
    When a blob is read with a changed byte, as undecodable bytes, or not at all, and the manifest is edited
    Then the blob is read once more and then refused with lean-prover.blob-kappa, blob-undecodable or blob-missing
    And the edited manifest is refused with lean-prover.manifest-unpinned

  @LP-03 @build
  Scenario: The encoding changes neither which blobs are admitted nor the bytes the prover reads.
    Given the same bytes stored at several gzip levels and as identity
    When each is admitted
    Then each yields the same decoded bytes
    And bytes refused in one encoding are refused in every other

  @LP-04 @build
  Scenario: prove refuses an engine whose label the manifest's gate attestation does not name.
    Given a corpus gate attestation for one engine
    When a manifest names it with another engine label, or names no gate
    Then the manifest is refused with lean-prover.engine-ungated
    And the manifest whose engine the gate admitted is accepted

  @LP-05 @build
  Scenario: prove refuses a library any of whose Init files differs by label from the official Lean release.
    Given the official release's Init files by BLAKE3 label
    When a manifest lists an Init file with another label
    Then the library is refused with lean-prover.library-unofficial
    And a library of official Init files is accepted

  @LP-06 @build
  Scenario: A missed extern or a wait nothing can answer refuses the run; it never hangs or passes.
    Given an engine that reports a missed extern, panics on an unanswerable wait, or traps
    When prove runs a project on it
    Then the run ends within its bound as a refusal with lean-prover.engine-trap
    And no module of that run is admitted

  @LP-07 @build
  Scenario: No declaration the in-tab kernel refuses is accepted, and no proof comes from a refused elaborator run.
    Given the engine's answers for a project
    When the kernel replay refuses a module, or elaboration of a module fails
    Then no declaration of that module is accepted
    And the project is refused

  @LP-08 @build
  Scenario: The gate attestation names the engine, library, LexLean and corpus labels, and passes only when WASM equals native on every corpus declaration.
    Given native Lean's and the engine's answers over a corpus, and the planted defects
    When the gate attests
    Then the attestation names the engine, library, LexLean and corpus labels and is written only when every declaration agrees and every defect is refused
    And the pinned patch changes no kernel line but the one diagnostics declaration

  @LP-09 @build
  Scenario: Every entrypoint module appears in prove's verdict.
    Given a rendered project and its lexlean.toml entrypoints
    When an entrypoint has no module in the verdict
    Then the project is refused with lean-prover.entrypoint-uncovered
    And every entrypoint of an admitted project appears in the verdict

  @LP-10 @build
  Scenario: prove reports each declaration's observed axioms.
    Given the engine's answers for a project
    When prove gives its verdict
    Then each declaration carries its observed axioms, sorted
    And a refused declaration still reports them

  @LP-11 @build
  Scenario: Blob collection keeps exactly the blobs a pinned manifest names.
    Given a store of blobs and the manifests pinned now
    When the store is collected
    Then exactly the blobs some pinned manifest names are kept
    And every other blob is removed
