import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const spec = new URL("../spec/", import.meta.url);

test("the specs are a LexLean project at Lean 4.32.2, checked by LexLean like PrismPM's other models", () => {
  assert.deepEqual(readdirSync(new URL("src/", spec)).sort(), ["BlobLabel.lex.tex", "InTabElaborator.lex.tex", "InTabKernel.lex.tex", "InTabProver.lex.tex", "NpmShard.lex.tex"]);
  const project = readFileSync(new URL("lexlean.toml", spec), "utf8");
  assert.match(project, /lean_toolchain = "leanprover\/lean4:v4\.32\.2"/);
  for (const e of ["BlobLabel", "InTabElaborator", "InTabProver", "NpmShard"]) assert.match(project, new RegExp(`src/${e}\\.lex\\.tex`));
  assert.match(readFileSync(new URL("lexlean.lock", spec), "utf8"), /^spec = "lexlean\/lock\/2"/);
});

test("the specs and the package's prose say BLAKE3 label", () => {
  const texts = [
    ...readdirSync(new URL("src/", spec)).map((f) => readFileSync(new URL(`src/${f}`, spec), "utf8")),
    readFileSync(new URL("../README.md", spec), "utf8"),
  ];
  for (const t of texts) assert.doesNotMatch(t, /κ|Kappa|\bUOR\b/);
});
