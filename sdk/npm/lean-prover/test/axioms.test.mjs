import assert from "node:assert/strict";
import test from "node:test";
import { auditPolicies, nonstandard, permits } from "../src/axioms.mjs";

const observed = new Map([
  ["A.t", ["propext", "Quot.sound"]],
  ["A.d", []],
  ["A.m1", ["propext"]],
  ["A.m2", ["Quot.sound"]],
]);
const holds = (row) => auditPolicies([row], observed)[0].holds;
const row = (declaration, rule, kind, axioms, members) => ({ declaration, rule, kind, axioms, ...(members ? { members } : {}) });

test("a policy kind permits as lexlean verify's stage 11 does: none empty, allow subset, exact equal", () => {
  assert.equal(permits("none", [], []), true);
  assert.equal(permits("none", ["propext"], ["propext"]), false);
  assert.equal(permits("allow", ["propext"], ["Classical.choice", "propext"]), true);
  assert.equal(permits("allow", ["Quot.sound"], ["propext"]), false);
  assert.equal(permits("exact", ["Quot.sound", "propext"], ["Quot.sound", "propext"]), true);
  assert.equal(permits("exact", ["propext"], ["Quot.sound", "propext"]), false);
  assert.equal(permits("other", [], []), null);
});

test("document, core, semantic and runtime rows are judged by their rule (LLV7005)", () => {
  assert.equal(holds(row("A.t", "document", "allow", ["Classical.choice", "Quot.sound", "propext"])), true);
  assert.equal(holds(row("A.t", "document", "allow", ["propext"])), false);
  assert.equal(holds(row("A.unreported", "document", "none", [])), true, "an unreported document name counts as empty");
  assert.equal(holds(row("A.unreported", "document", "exact", ["propext"])), false);
  const skipped = auditPolicies([row("A.unreported", "core", "exact", ["propext"])], observed)[0];
  assert.equal(skipped.holds, true, "an unreported core name is skipped");
  assert.equal(skipped.skipped, true);
  assert.equal(holds(row("A.t", "core", "none", [])), false);
  assert.equal(holds(row("A.t", "semantic", "exact", ["Quot.sound", "propext"])), true);
  assert.equal(holds(row("A.t", "semantic", "allow", ["Classical.choice", "Quot.sound", "propext"])), false, "semantic is equality");
  assert.equal(holds(row("A.unreported", "semantic", "none", [])), false, "an unreported semantic name fails");
  assert.equal(holds(row("A.t", "runtime", "exact", ["Quot.sound", "propext"])), true);
  assert.equal(holds(row("A.t", "runtime", "allow", ["Quot.sound", "propext"])), false, "a runtime row must be exact");
  assert.equal(holds(row("A.unreported", "runtime", "exact", [])), false);
  assert.equal(holds(row("A.t", "other", "exact", [])), false, "an unknown rule fails");
});

test("a model row is met by its generated declarations: each within its set, and their union equal to it", () => {
  assert.equal(holds(row("A.owner", "model", "exact", ["propext", "Quot.sound"], ["A.m1", "A.m2"])), true);
  assert.equal(holds(row("A.owner", "model", "exact", ["propext", "Quot.sound"], ["A.m1"])), false, "the union is short");
  assert.equal(holds(row("A.owner", "model", "exact", ["propext"], ["A.m1", "A.m2"])), false, "a member outside the set");
  assert.equal(holds(row("A.owner", "model", "exact", ["propext"], ["A.m1", "A.unreported"])), false, "an unreported member fails");
  assert.equal(holds(row("A.unreported", "model", "exact", ["propext"], ["A.m1"])), true, "the model's own name is not audited");
});

test("only Lean's three standard axioms are admitted", () => {
  assert.deepEqual(nonstandard(["propext", "Quot.sound", "Classical.choice"]), []);
  assert.deepEqual(nonstandard(["propext", "sorryAx", "Lean.ofReduceBool"]), ["Lean.ofReduceBool", "sorryAx"]);
});
