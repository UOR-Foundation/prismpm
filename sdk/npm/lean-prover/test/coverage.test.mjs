import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "../src/verdict.mjs";
import { ENTRYPOINTS, goodAnswers, renderedProject } from "./helpers.mjs";

test("every entrypoint module appears in prove's verdict, or the project is refused", () => {
  const v = judge({ rendered: renderedProject(), answers: goodAnswers(), entrypoints: ENTRYPOINTS });
  assert.deepEqual(v.modules.map((m) => m.source), ENTRYPOINTS);
  const extra = judge({ rendered: renderedProject(), answers: goodAnswers(), entrypoints: [...ENTRYPOINTS, "src/Other.lex.tex"] });
  assert.equal(extra.accepted, false);
  assert.equal(extra.refusal.code, "lean-prover.entrypoint-uncovered");
  assert.match(extra.refusal.diagnostics, /src\/Other\.lex\.tex/);
});

test("a render with no project module is refused", () => {
  const rendered = renderedProject();
  rendered.modules = rendered.modules.filter((m) => m.kind !== "project");
  const v = judge({ rendered, answers: goodAnswers(), entrypoints: [] });
  assert.equal(v.accepted, false);
  assert.equal(v.refusal.code, "lean-prover.front-end-refused");
});
