import assert from "node:assert/strict";
import test from "node:test";
import { entrypointsOf, judge } from "../src/verdict.mjs";
import { ENTRYPOINTS, goodAnswers, renderedProject } from "./helpers.mjs";

const codes = (v) => v.refusals.map((r) => r.code);

test("a project is admitted when every module elaborates, replays and meets its declared axiom policies", () => {
  const v = judge({ rendered: renderedProject(), answers: goodAnswers(), entrypoints: ENTRYPOINTS });
  assert.equal(v.accepted, true, JSON.stringify(v.refusals));
  assert.deepEqual(v.modules.map((m) => [m.module, m.accepted]), [["Leap.Leap", true], ["Leap.Main", true]]);
  assert.equal(v.refusal, undefined);
});

test("an elaboration error refuses the module with lean-prover.elaboration-error", () => {
  const answers = goodAnswers();
  answers.set("Leap.Main", { elaborated: false });
  const v = judge({ rendered: renderedProject(), answers, entrypoints: ENTRYPOINTS });
  assert.equal(v.accepted, false);
  assert.ok(codes(v).includes("lean-prover.elaboration-error"));
});

test("observed axioms that differ from the declared policy refuse with lean-prover.axiom-policy (LLV7005)", () => {
  const rendered = renderedProject({ leap: [{ declaration: "Leap.leapRule", kind: "exact", axioms: ["Quot.sound", "propext"], rule: "semantic" }] });
  const v = judge({ rendered, answers: goodAnswers(), entrypoints: ENTRYPOINTS });
  assert.equal(v.accepted, false);
  assert.deepEqual([...new Set(codes(v))], ["lean-prover.axiom-policy"]);
  assert.equal(v.modules[0].declarations.find((d) => d.name === "Leap.leapRule").accepted, false);
  const sorry = goodAnswers();
  sorry.get("Leap.Leap").decls[0].axioms = ["sorryAx"];
  assert.ok(codes(judge({ rendered: renderedProject(), answers: sorry, entrypoints: ENTRYPOINTS })).includes("lean-prover.axiom-policy"));
});

test("without LexLean's declared policies nothing is admitted", () => {
  const v = judge({ rendered: renderedProject({ tables: false }), answers: goodAnswers(), entrypoints: ENTRYPOINTS });
  assert.equal(v.accepted, false);
  assert.equal(v.refusal.code, "lean-prover.axiom-policy");
});

test("a runtime module's policy rows are judged on the axioms the driver's check of that module observed", () => {
  const rendered = renderedProject();
  rendered.modules[1].axiom_policies = [{ declaration: "LexLeanRuntime.Portable.law", kind: "exact", axioms: ["propext"], rule: "runtime" }];
  const answers = goodAnswers();
  answers.set("LexLeanRuntime.Portable", { elaborated: true, checked: true, replayRefused: null, decls: [{ name: "LexLeanRuntime.Portable.law", kind: "theorem", type: "1", value: "2", axioms: ["propext"] }] });
  assert.equal(judge({ rendered, answers, entrypoints: ENTRYPOINTS }).accepted, true);
  answers.get("LexLeanRuntime.Portable").decls[0].axioms = [];
  assert.equal(judge({ rendered, answers, entrypoints: ENTRYPOINTS }).refusal.code, "lean-prover.axiom-policy");
  answers.delete("LexLeanRuntime.Portable");
  assert.equal(judge({ rendered, answers, entrypoints: ENTRYPOINTS }).accepted, false, "an unchecked runtime module");
});

test("the entrypoints are read from lexlean.toml", () => {
  assert.deepEqual(entrypointsOf('name = "x"\nentrypoints = ["src/Leap.lex.tex", "src/Main.lex.tex"]\n'), ENTRYPOINTS);
  assert.deepEqual(entrypointsOf('name = "x"\n'), []);
});
