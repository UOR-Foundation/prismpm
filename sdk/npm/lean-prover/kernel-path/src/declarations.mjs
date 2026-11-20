// LexLean's kernel declarations (`lexlean/kernel-declarations/1`), read into the kernel's own input. LexLean writes
// every type, definition and theorem statement of a model from its linked IR, so what each construct means is decided
// in one place, LexLean. This file only translates its term DAG (`CoreNode`, as `lexlean/core-module/2` writes it) into
// expressions and hands them to the emitter: it decides nothing about meaning.
//
//   const p = planDeclarations(declarations, library, { hash })   // the same interface as plan.mjs
import { E, L } from "./emit.mjs";
import { emitter } from "./emit.mjs";
import { COVERED } from "./plan.mjs";

export const SPEC = "lexlean/kernel-declarations/1";
const BINDER = { e: "default", i: "implicit", s: "strictImplicit", c: "instImplicit" };

// Levels are tagged `{ k, a }`: a successor's argument, a maximum's pair, a parameter's name.
function level(l) {
  switch (l.k) {
    case "z": return L.zero;
    case "s": return L.succ(level(l.a));
    case "m": return L.max(level(l.a[0]), level(l.a[1]));
    case "i": return L.imax(level(l.a[0]), level(l.a[1]));
    case "p": return L.param(l.a);
    default: throw new Error(`declarations: level ${JSON.stringify(l)}`);
  }
}

/** The DAG's nodes as expressions, each built once. */
export function terms(nodes) {
  const out = new Array(nodes.length);
  const at = (i) => out[i] ?? fail(`node ${i} is used before it is built`);
  const fail = (m) => { throw new Error("declarations: " + m); };
  nodes.forEach((n, i) => {
    switch (n.k) {
      case "b": out[i] = E.bvar(n.i); break;
      case "s": out[i] = E.sort(level(n.l)); break;
      case "c": out[i] = E.const(n.n, (n.u ?? []).map(level)); break;
      case "a": out[i] = E.app(at(n.f), at(n.x)); break;
      case "l": out[i] = E.lam(n.n, at(n.t), at(n.v), BINDER[n.b] ?? "default"); break;
      case "p": out[i] = E.pi(n.n, at(n.t), at(n.v), BINDER[n.b] ?? "default"); break;
      case "e": out[i] = E.let(n.n, at(n.t), at(n.v), at(n.body)); break;
      case "n": out[i] = E.nat(n.v); break;
      case "t": out[i] = E.str(String.fromCodePoint(...n.v)); break;
      case "j": out[i] = E.proj(n.s, n.i, at(n.x)); break;
      case "d": out[i] = at(n.x); break; // an annotation: kernel-irrelevant
      default: fail(`node kind ${n.k}`);
    }
  });
  return out;
}

/**
 * The plan of a model given as LexLean's kernel declarations. Its theorems carry the Merkle keys LexLean's statement
 * reaches through the declarations' own content (`hash` over each statement's term), so the same theorem over the same
 * definitions has the same key.
 */
export function planDeclarations(declarations, library, { hash = null } = {}) {
  if (declarations.spec !== SPEC) throw new Error(`declarations: not a ${SPEC}: ${declarations.spec}`);
  const em = emitter(library), t = terms(declarations.nodes);
  const refused = new Map(declarations.refused.map((r) => [r.name, r.reason]));
  // Only what the theorems' statements reach is written: the kernel needs nothing else, and a declaration no theorem
  // uses cannot keep a theorem from being judged.
  const owner = new Map();
  for (const d of declarations.declarations) {
    owner.set(d.name, d);
    if (d.kind === "inductive") { owner.set(`${d.name}.rec`, d); for (const c of d.constructors) owner.set(c.name, d); }
  }
  const constsOf = (roots) => {
    const names = new Set(), seen = new Set(), stack = [...roots];
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const n = declarations.nodes[i];
      if (n.k === "c") names.add(n.n);
      if (n.k === "j") names.add(n.s);
      for (const k of ["f", "x", "t", "v", "body"]) if (typeof n[k] === "number") stack.push(n[k]);
    }
    return names;
  };
  const rootsOf = (d) => d.kind === "inductive" ? [d.type, ...d.constructors.map((c) => c.type)] : [d.type, d.value];
  // What each theorem's statement reaches: the declarations it needs, and the first refused one it would need.
  const reach = new Map();
  const closure = (start) => {
    const names = new Set(), stack = [start];
    let missing = null;
    while (stack.length) {
      const d = stack.pop();
      if (names.has(d.name)) continue;
      names.add(d.name);
      for (const c of constsOf(rootsOf(d))) {
        const o = owner.get(c);
        if (o) { if (!names.has(o.name)) stack.push(o); }
        else if (!missing) {
          // A name LexLean did not write, or a part of one (`T.casesOn`, a model's `M.initial`): its refused owner.
          for (let p = c; p; p = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "") if (refused.has(p)) { missing = { name: c, reason: refused.get(p) }; break; }
        }
      }
    }
    return { names, missing };
  };
  const needed = new Set();
  for (const th of declarations.theorems) {
    const d = owner.get(th.statement);
    if (!d) continue;
    const c = closure(d);
    reach.set(th.name, c);
    if (!c.missing) for (const n of c.names) needed.add(n);
  }
  // A proof by cases names the type's own eliminator, which no statement reaches.
  for (const d of declarations.declarations) if (d.kind === "inductive" && needed.has(d.name) && owner.has(`${d.name}.casesOn`)) needed.add(`${d.name}.casesOn`);
  for (const d of declarations.declarations) {
    if (!needed.has(d.name)) continue;
    if (d.kind === "inductive") em.writeInductive({ name: d.name, type: t[d.type], numParams: d.params ?? 0, isRec: d.recursive, ctors: d.constructors.map((c) => ({ name: c.name, type: t[c.type], numFields: c.fields })) });
    else em.writeDef({ name: d.name, type: t[d.type], value: t[d.value], levelParams: d.levels ?? [], hints: d.name.startsWith("LexStmt.") ? "abbrev" : { regular: d.height } });
  }
  const text = em.lines(), mark = em.checkpoint();
  const theorems = declarations.theorems.map((th) => {
    const kind = th.proof?.kind ?? null;
    const statement = em.lib.decls.get(th.statement), missing = reach.get(th.name)?.missing;
    return {
      name: th.name, proof: kind, declared: [...th.axioms].sort(),
      key: hash && statement ? hash(JSON.stringify(["lexlean-kernel-declarations/theorem/1", th.statement, canon(statement.value)])) : null,
      status: missing ? `not proved: it reaches ${missing.name}, which LexLean did not write (${missing.reason})`
        : !statement ? `not proved: its statement was not written (${refused.get(th.name) ?? refused.get(th.statement) ?? "unknown"})`
        : COVERED[kind] || em.STRUCTURED.has(kind) ? null : `not proved: the proof kind ${kind} is not covered here yet`,
      proofJson: th.proof,
    };
  });
  // A proof LexLean gives by its shape is built from that shape; the others are found. `apply` names the theorems a
  // proof rests on, which are written before it.
  const byName = new Map(theorems.map((t) => [t.name, t]));
  const proofOf = (th) => em.STRUCTURED.has(th.proof) ? em.structured(th.name, th.proofJson) : em.theorem(script(th));
  for (const th of theorems) {
    if (th.status) continue;
    try { th.deps = proofOf(th).deps ?? []; } catch (e) { th.status = `not proved: no proof found (${e.message})`; }
    em.rollback(mark);
  }
  // Theorems are tried in order: one whose dependency is not proved here is not provable here either.
  for (let changed = true; changed; ) {
    changed = false;
    for (const th of theorems) if (!th.status && th.deps.some((d) => !byName.get(d) || byName.get(d).status)) { th.status = `not proved: it applies ${th.deps.find((d) => !byName.get(d) || byName.get(d).status)}, which is not proved here`; changed = true; }
  }
  return {
    theorems, declarations: declarations.declarations.length, refused: declarations.refused, bytes: text.length,
    batches(names, n) {
      const groups = Array.from({ length: Math.max(1, Math.min(n, names.length)) }, () => []);
      names.forEach((name, i) => groups[i % groups.length].push(name));
      return groups.filter((g) => g.length);
    },
    file(names) {
      // Dependencies first, each once.
      const order = [], seen = new Set(), visit = (n) => { if (seen.has(n)) return; seen.add(n); const th = byName.get(n); for (const d of th.deps ?? []) visit(d); order.push(th); };
      for (const n of names) visit(n);
      for (const th of order) { const r = proofOf(th); em.write(r); }
      const proofs = em.since(mark), out = text + (proofs.length ? proofs.join("\n") + "\n" : "");
      em.rollback(mark);
      return out;
    },
  };
}

// A statement's content, independent of the emitter's numbering: what its key is computed over.
function canon(e, seen = new Map()) {
  if (seen.has(e)) return seen.get(e);
  let r;
  switch (e.k) {
    case "app": r = ["a", canon(e.fn, seen), canon(e.arg, seen)]; break;
    case "lam": case "pi": r = [e.k, e.bi, canon(e.type, seen), canon(e.body, seen)]; break;
    case "let": r = ["t", canon(e.type, seen), canon(e.value, seen), canon(e.body, seen)]; break;
    case "proj": r = ["j", e.typeName, e.idx, canon(e.struct, seen)]; break;
    default: r = e.key;
  }
  seen.set(e, r);
  return r;
}

const script = (th) => ({ name: th.name, ns: th.name.slice(0, th.name.lastIndexOf(".")), script: [{ kind: COVERED[th.proof] }], binders: [], raw: "", text: "" });
