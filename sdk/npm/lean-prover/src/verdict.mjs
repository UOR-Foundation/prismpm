// prove's verdict, from what LexLean rendered and what the engine answered. Pure, so every rule is tested without
// the engine. A module is admitted only when LexLean's check and render accepted the project, Lean elaborated it
// without error, the kernel replay accepted every declaration, and each declaration's observed axioms meet its
// declared policy (LP-01), judged by the policy table LexLean prints with each module, the one `lexlean verify`'s
// stage 11 reads. Every entrypoint must appear in the verdict (LP-09), and every declaration reports its observed
// axioms (LP-10). Nothing the kernel refuses is accepted (LP-07).
import { auditPolicies, nonstandard } from "./axioms.mjs";

/** The project's entrypoints, read from lexlean.toml's `entrypoints = [...]`. */
export function entrypointsOf(lexleanToml) {
  const m = /^entrypoints\s*=\s*\[([^\]]*)\]/m.exec(lexleanToml);
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
}

/** The rows prove must answer for: every project module (elaborated) and every runtime module with policies (checked). */
export function judgedRows(rendered) {
  return rendered.modules.filter((m) => m.kind === "project" || (m.kind === "runtime" && m.axiom_policies?.length));
}

/**
 * rendered: the `lexlean/lean-modules/1` object; answers: Map of Lean module to the driver's answer;
 * entrypoints: project-relative source paths. Returns { accepted, modules, policies, refusals, refusal }.
 */
export function judge({ rendered, answers, entrypoints }) {
  const refusals = [];
  const refuse = (code, diagnostics) => refusals.push({ code, diagnostics });
  const projectRows = rendered.modules.filter((m) => m.kind === "project");
  if (projectRows.length === 0) refuse("lean-prover.front-end-refused", "LexLean rendered no project module");
  const observed = new Map();
  const modules = judgedRows(rendered).map((row) => {
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
    return { module: row.lean_module, kind: row.kind, source: row.module ?? null, accepted: kernelAccepted, elaborated, replayRefused: answer.replayRefused ?? null, declarations };
  });

  // The declared policies are LexLean's; a module without its table cannot be judged, so nothing is admitted.
  const untabled = rendered.modules.filter((m) => !Array.isArray(m.axiom_policies));
  let policies = [];
  const failed = new Set();
  if (untabled.length) {
    refuse("lean-prover.axiom-policy", `LexLean's render printed no axiom policies for ${untabled.map((m) => m.lean_module).join(", ")}, so no declaration can be judged against its policy`);
  } else {
    const rows = rendered.modules.flatMap((m) => m.axiom_policies);
    policies = auditPolicies(rows, observed);
    policies.forEach((p, i) => {
      if (p.holds) return;
      refuse("lean-prover.axiom-policy", `LLV7005: ${p.declaration}: ${p.why}`);
      for (const name of [p.declaration, ...(rows[i].members ?? [])]) failed.add(name);
    });
  }
  for (const m of modules) {
    for (const d of m.declarations) {
      const outside = nonstandard(d.axioms);
      if (outside.length) refuse("lean-prover.axiom-policy", `${d.name} uses ${outside.join(", ")}, outside Lean's standard axioms`);
      if (outside.length || failed.has(d.name)) d.accepted = false;
    }
    m.accepted = m.accepted && m.declarations.every((d) => d.accepted);
  }

  const covered = new Set(projectRows.map((r) => r.module).filter(Boolean));
  for (const e of entrypoints) if (!covered.has(e)) refuse("lean-prover.entrypoint-uncovered", `${e} is not in the verdict`);

  const accepted = refusals.length === 0 && modules.every((m) => m.accepted);
  return { accepted, modules, policies, refusals, ...(refusals.length ? { refusal: refusals[0] } : {}) };
}
