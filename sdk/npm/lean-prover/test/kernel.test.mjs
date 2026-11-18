import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "../src/verdict.mjs";
import { ENTRYPOINTS, goodAnswers, renderedProject } from "./helpers.mjs";

test("no declaration the kernel replay refuses is accepted, whatever its axioms", () => {
  const answers = goodAnswers();
  answers.get("Leap.Leap").replayRefused = "(kernel) declaration type mismatch";
  const v = judge({ rendered: renderedProject(), answers, entrypoints: ENTRYPOINTS });
  assert.equal(v.accepted, false);
  assert.equal(v.refusal.code, "lean-prover.kernel-refused");
  const leap = v.modules.find((m) => m.module === "Leap.Leap");
  assert.equal(leap.accepted, false);
  assert.ok(leap.declarations.every((d) => !d.accepted));
});

test("no proof comes from a refused elaborator run", () => {
  const answers = goodAnswers();
  answers.set("Leap.Leap", { ...answers.get("Leap.Leap"), elaborated: false });
  const v = judge({ rendered: renderedProject(), answers, entrypoints: ENTRYPOINTS });
  const leap = v.modules.find((m) => m.module === "Leap.Leap");
  assert.equal(v.accepted, false);
  assert.ok(leap.declarations.every((d) => !d.accepted));
  const missing = goodAnswers();
  missing.delete("Leap.Main");
  assert.equal(judge({ rendered: renderedProject(), answers: missing, entrypoints: ENTRYPOINTS }).accepted, false, "an unanswered module");
});
