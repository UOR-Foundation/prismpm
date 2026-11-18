import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "../src/verdict.mjs";
import { ENTRYPOINTS, goodAnswers, renderedProject } from "./helpers.mjs";

test("prove reports each declaration's observed axioms, sorted, accepted or not", () => {
  const v = judge({ rendered: renderedProject(), answers: goodAnswers(), entrypoints: ENTRYPOINTS });
  const all = Object.fromEntries(v.modules.flatMap((m) => m.declarations.map((d) => [d.name, d.axioms])));
  assert.deepEqual(all, { "Leap.isLeap": [], "Leap.leapRule": ["propext"], "Leap.Main.main": ["Quot.sound", "propext"] });
  const refused = goodAnswers();
  refused.get("Leap.Leap").replayRefused = "(kernel) declaration type mismatch";
  const r = judge({ rendered: renderedProject(), answers: refused, entrypoints: ENTRYPOINTS });
  assert.deepEqual(r.modules[0].declarations.map((d) => d.axioms), [[], ["propext"]]);
});
