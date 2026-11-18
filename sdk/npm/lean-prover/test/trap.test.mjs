import assert from "node:assert/strict";
import test from "node:test";
import { ProverError, proveWith } from "../src/prover.mjs";
import { ENTRYPOINTS, fixture, renderedProject } from "./helpers.mjs";

const project = { "lexlean.toml": `entrypoints = [${ENTRYPOINTS.map((e) => JSON.stringify(e)).join(", ")}]\n` };
const run = (engine) => {
  const { manifest } = fixture();
  return proveWith({ engine, render: () => ({ ok: true, rendered: renderedProject() }), manifest, evidence: {}, project });
};

test("a missed extern reported by the engine refuses the run with lean-prover.engine-trap", async () => {
  const engine = { call: async (m) => (m.op === "request" ? { answer: { error: "could not find native implementation of external declaration" } } : { ok: true }) };
  const v = await run(engine);
  assert.equal(v.accepted, false);
  assert.equal(v.refusal.code, "lean-prover.engine-trap");
});

test("a wait nothing can answer, a trap or an engine exit ends the run as a refusal, never a hang or a pass", async () => {
  const engine = {
    call: async (m) => {
      if (m.op === "request") throw new ProverError("lean-prover.engine-trap", "panic: a task waited on a promise nothing can resolve");
      return { ok: true };
    },
  };
  const v = await Promise.race([run(engine), new Promise((_, reject) => setTimeout(() => reject(new Error("prove hung")), 5000))]);
  assert.equal(v.accepted, false);
  assert.equal(v.refusal.code, "lean-prover.engine-trap");
  const crashed = { call: async () => { throw new Error("RuntimeError: unreachable"); } };
  assert.equal((await run(crashed)).refusal.code, "lean-prover.engine-trap");
});
