// The axiom audit, as `lexlean verify` applies it (LexLean SPEC §22.6, LLV7005).
//
// For observed set O and configured set A: `none` holds iff O is empty, `allow` iff O ⊆ A, `exact` iff O = A.
// A model declaration is audited through the Lean declarations it generates (`members`): each member is held to
// `allow` over the owner's set, and for an `exact` owner the union of the members' observed sets must equal it.
// Prism adds one rule of its own: no observed axiom outside Lean's three standard ones, so `sorryAx` and
// `Lean.ofReduceBool` are refused whatever a policy says.

export const STANDARD_AXIOMS = Object.freeze(["Classical.choice", "Quot.sound", "propext"]);

const sorted = (names) => [...new Set(names)].sort();
const subset = (a, b) => a.every((x) => b.includes(x));
const equal = (a, b) => a.length === b.length && subset(a, b);

/**
 * policies: [{ declaration, policy: "none" | "allow" | "exact", axioms: [...], members?: [...] }]
 * observed: Map of Lean declaration name to its observed axioms.
 * Returns one row per policy: { declaration, policy, allowed, observed, holds, why }.
 */
export function auditPolicies(policies, observed) {
  return policies.map((row) => {
    const allowed = sorted(row.axioms ?? []);
    const members = row.members?.length ? row.members : [row.declaration];
    const missing = members.filter((m) => !observed.has(m));
    const result = { declaration: row.declaration, policy: row.policy, allowed, observed: [], holds: false, why: null };
    if (missing.length) return { ...result, why: `no observed axioms for ${missing.join(", ")}` };
    const perMember = members.map((m) => sorted(observed.get(m)));
    const union = sorted(perMember.flat());
    result.observed = union;
    if (row.policy === "none") result.holds = union.length === 0;
    else if (row.policy === "allow") result.holds = perMember.every((o) => subset(o, allowed));
    else if (row.policy === "exact") result.holds = perMember.every((o) => subset(o, allowed)) && equal(union, allowed);
    else return { ...result, why: `unknown policy ${row.policy}` };
    if (!result.holds) result.why = `observed [${union.join(", ")}] against ${row.policy} [${allowed.join(", ")}]`;
    return result;
  });
}

/** Axioms outside Lean's standard three, in sorted order. */
export function nonstandard(axioms) {
  return sorted(axioms).filter((a) => !STANDARD_AXIOMS.includes(a));
}
