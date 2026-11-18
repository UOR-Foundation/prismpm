import assert from "node:assert/strict";
import test from "node:test";
import { auditPolicies, nonstandard } from "../src/axioms.mjs";

const observed = new Map([
  ["A.t", ["propext", "Quot.sound"]],
  ["A.d", []],
  ["A.m1", ["propext"]],
  ["A.m2", ["Quot.sound"]],
]);
const holds = (row) => auditPolicies([row], observed)[0].holds;

test("none, allow and exact are applied as lexlean verify applies them (LLV7005)", () => {
  assert.equal(holds({ declaration: "A.d", policy: "none", axioms: [] }), true);
  assert.equal(holds({ declaration: "A.t", policy: "none", axioms: [] }), false);
  assert.equal(holds({ declaration: "A.t", policy: "allow", axioms: ["propext", "Quot.sound", "Classical.choice"] }), true);
  assert.equal(holds({ declaration: "A.t", policy: "allow", axioms: ["propext"] }), false);
  assert.equal(holds({ declaration: "A.t", policy: "exact", axioms: ["Quot.sound", "propext"] }), true);
  assert.equal(holds({ declaration: "A.t", policy: "exact", axioms: ["Classical.choice", "Quot.sound", "propext"] }), false);
  assert.equal(holds({ declaration: "A.t", policy: "exact", axioms: ["propext"] }), false);
});

test("an exact owner is met by the union of its generated declarations, each within its set", () => {
  assert.equal(holds({ declaration: "A.owner", policy: "exact", axioms: ["propext", "Quot.sound"], members: ["A.m1", "A.m2"] }), true);
  assert.equal(holds({ declaration: "A.owner", policy: "exact", axioms: ["propext", "Quot.sound"], members: ["A.m1"] }), false);
  assert.equal(holds({ declaration: "A.owner", policy: "exact", axioms: ["propext"], members: ["A.m1", "A.m2"] }), false);
  const [missing] = auditPolicies([{ declaration: "A.x", policy: "exact", axioms: [] }], observed);
  assert.equal(missing.holds, false);
  assert.match(missing.why, /no observed axioms/);
});

test("only Lean's three standard axioms are admitted", () => {
  assert.deepEqual(nonstandard(["propext", "Quot.sound", "Classical.choice"]), []);
  assert.deepEqual(nonstandard(["propext", "sorryAx", "Lean.ofReduceBool"]), ["Lean.ofReduceBool", "sorryAx"]);
});
