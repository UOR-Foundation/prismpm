// The axiom audit, as `lexlean verify`'s stage 11 applies it (LexLean SPEC §22.6, LLV7005), over the policy rows
// `lexlean lean-modules` prints with each module: { declaration, kind, axioms, rule, members? }.
//
// A policy kind permits an observed set O against its axioms A: `none` iff O is empty, `allow` iff O ⊆ A, `exact`
// iff O = A (sorted, deduplicated). The rule says how a row is checked:
//   document  the kind permits O; a name the audit did not report counts as empty;
//   core      the kind permits O; a name the audit did not report is skipped;
//   semantic  O = A;
//   model     each name in `members` observes a subset of A and their union is A; the model's own name is not
//             audited;
//   runtime   the kind is exact and O = A.
// An unreported semantic, model or runtime name is a failure.
// Prism adds one rule of its own: no observed axiom outside Lean's three standard ones, so `sorryAx` and
// `Lean.ofReduceBool` are refused whatever a policy says.

export const STANDARD_AXIOMS = Object.freeze(["Classical.choice", "Quot.sound", "propext"]);

const sorted = (names) => [...new Set(names)].sort();
const subset = (a, b) => a.every((x) => b.includes(x));
const equal = (a, b) => a.length === b.length && subset(a, b);

/** Whether a policy kind permits observed set `o` against axioms `a`; null for an unknown kind. */
export function permits(kind, o, a) {
  if (kind === "none") return o.length === 0;
  if (kind === "allow") return subset(o, a);
  if (kind === "exact") return equal(o, a);
  return null;
}

/**
 * rows: the policy rows of every module. observed: Map of Lean declaration name to its observed axioms.
 * Returns one result per row: { declaration, rule, kind, allowed, observed, holds, skipped, why }.
 */
export function auditPolicies(rows, observed) {
  return rows.map((row) => {
    const allowed = sorted(row.axioms ?? []);
    const result = { declaration: row.declaration, rule: row.rule, kind: row.kind, allowed, observed: [], holds: false, skipped: false, why: null };
    const fail = (why) => ({ ...result, holds: false, why });
    const seen = (name) => (observed.has(name) ? sorted(observed.get(name)) : null);
    const held = (holds, o) => ({ ...result, observed: o, holds, why: holds ? null : `observed [${o.join(", ")}] against ${row.rule} ${row.kind} [${allowed.join(", ")}]` });
    if (!["none", "allow", "exact"].includes(row.kind)) return fail(`unknown policy kind ${row.kind}`);
    switch (row.rule) {
      case "document": {
        const o = seen(row.declaration) ?? [];
        return held(permits(row.kind, o, allowed), o);
      }
      case "core": {
        const o = seen(row.declaration);
        if (o === null) return { ...result, holds: true, skipped: true };
        return held(permits(row.kind, o, allowed), o);
      }
      case "semantic": {
        const o = seen(row.declaration);
        if (o === null) return fail(`${row.declaration} was not observed`);
        return held(equal(o, allowed), o);
      }
      case "model": {
        const members = row.members ?? [];
        if (members.length === 0) return fail(`${row.declaration} names no generated declarations`);
        const per = members.map(seen);
        const missing = members.filter((_, i) => per[i] === null);
        if (missing.length) return fail(`${missing.join(", ")} was not observed`);
        const union = sorted(per.flat());
        return held(per.every((o) => subset(o, allowed)) && equal(union, allowed), union);
      }
      case "runtime": {
        if (row.kind !== "exact") return fail(`runtime ${row.declaration} has policy ${row.kind}, not exact`);
        const o = seen(row.declaration);
        if (o === null) return fail(`${row.declaration} was not observed`);
        return held(equal(o, allowed), o);
      }
      default:
        return fail(`unknown policy rule ${row.rule}`);
    }
  });
}

/** Axioms outside Lean's standard three, in sorted order. */
export function nonstandard(axioms) {
  return sorted(axioms).filter((a) => !STANDARD_AXIOMS.includes(a));
}
