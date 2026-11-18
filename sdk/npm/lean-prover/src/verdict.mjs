// prove's verdict, from what LexLean rendered and what the engine answered. Pure, so every rule is tested without
// the engine. A module is admitted only when LexLean's check and render accepted the project, Lean elaborated it
// without error, the kernel replay accepted every declaration, and each declaration's observed axioms meet its
// declared policy (LP-01). Every entrypoint must appear in the verdict (LP-09), and every declaration reports its
// observed axioms (LP-10). Nothing the kernel refuses is accepted (LP-07).
import { auditPolicies, nonstandard } from "./axioms.mjs";

/** The project's entrypoints, read from lexlean.toml's `entrypoints = [...]`. */
export function entrypointsOf(lexleanToml) {
  const m = /^entrypoints\s*=\s*\[([^\]]*)\]/m.exec(lexleanToml);
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
}

/**
 * rendered: the `lexlean/lean-modules/1` object; answers: Map of Lean module to the driver's answer;
 * entrypoints: project-relative source paths. Returns { accepted, modules, policies, refusals, refusal }.
 */
export function judge({ rendered, answers, entrypoints }) {
  const refusals = [];
  const refuse = (code, diagnostics) => refusals.push({ code, diagnostics });
  const rows = rendered.modules.filter((m) => m.kind === "project");
  if (rows.length === 0) refuse("lean-prover.front-end-refused", "LexLean rendered no project module");
  const observed = new Map();
  const modules = rows.map((row) => {
    const answer = answers.get(row.lean_module) ?? { elaborated: false };
    const elaborated = answer.elaborated === true;
    const kernelAccepted = elaborated && (answer.replayRefused ?? null) === null;
    if (!elaborated) refuse("lean-prover.elaboration-error", `${row.lean_module}: Lean reported an error`);
    else if (!kernelAccepted) refuse("lean-prover.kernel-refused", `${row.lean_module}: ${answer.replayRefused}`);
    const declarations = (answer.decls ?? []).map((d) => {
      const axioms = [...d.axioms].sort();
      observed.set(d.name, axioms);
      return { name: d.name, kind: d.kind, accepted: kernelAccepted, axioms };
    });
    return { module: row.lean_module, source: row.module ?? null, accepted: kernelAccepted, elaborated, replayRefused: answer.replayRefused ?? null, declarations };
  });

  // The declared policies are LexLean's (`axiom_policies`); without them no declaration can be judged against its
  // policy, so nothing is admitted.
  let policies = [];
  if (!Array.isArray(rendered.axiom_policies)) {
    refuse("lean-prover.axiom-policy", "LexLean's render named no axiom policies, so no declaration can be judged against its policy");
  } else {
    policies = auditPolicies(rendered.axiom_policies, observed);
    for (const p of policies.filter((p) => !p.holds)) refuse("lean-prover.axiom-policy", `LLV7005: ${p.declaration}: ${p.why}`);
  }
  const failed = new Set(policies.filter((p) => !p.holds).flatMap((p) => [p.declaration, ...(rendered.axiom_policies.find((r) => r.declaration === p.declaration)?.members ?? [])]));
  for (const m of modules) {
    for (const d of m.declarations) {
      const outside = nonstandard(d.axioms);
      if (outside.length) refuse("lean-prover.axiom-policy", `${d.name} uses ${outside.join(", ")}, outside Lean's standard axioms`);
      if (outside.length || failed.has(d.name)) d.accepted = false;
    }
    m.accepted = m.accepted && m.declarations.every((d) => d.accepted);
  }

  const covered = new Set(rows.map((r) => r.module).filter(Boolean));
  for (const e of entrypoints) if (!covered.has(e)) refuse("lean-prover.entrypoint-uncovered", `${e} is not in the verdict`);

  const accepted = refusals.length === 0 && modules.every((m) => m.accepted);
  return { accepted, modules, policies, refusals, ...(refusals.length ? { refusal: refusals[0] } : {}) };
}
