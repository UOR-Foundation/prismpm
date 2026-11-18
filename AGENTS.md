# Agent Guidelines for PrismPM

- SPEC.md is normative; README prose is explanatory.
- No handwritten PrismPM `.lean` source or `lakefile.lean` may be committed. All PrismPM Lean code is generated from `.lex.tex` by LexLean. The only upstream-source exception is the exact 4-file compiler-authority closure in SPEC §9 and `LEXLEAN_AUTHORITY_SOURCES` (`language/preservation-1.2/modules/LexLeanTarget/{RustSemantics,RustSyntax,TargetSemantics,TargetSyntax}.lean`), admitted only from the pinned LexLean revision `fa271080652887976ae25d0aef84edc7472b0276` (the commit the annotated `v0.4.3` tag names, from which the LexLean v0.4.3 release was cut) through the registered package, complete dependency/tree checksums, matching clean package VCS provenance, and exact archive-member/tree byte equality. The extraction adapter and preservation library are `.lex.tex` notation in that package. This does not admit other vendored Lean or any PrismPM model, proof, or replacement application behavior.
- Do not introduce placeholder URLs, wildcards in internal dependencies, unpinned toolchains, or unstaged modifications.
- Every public capability and diagnostic is registered in `model/*.toml` and covered by conformance fixtures.

