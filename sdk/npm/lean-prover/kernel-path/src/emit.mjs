// Term emitter prototype: writes Lean kernel proof terms for a generated LexLean module with no Lean in the loop.
// Input: the pruned library export (constant types only are read) and the module's generated Lean text.
// Output: export-format lines that continue the library's file, one `thm` per theorem.
// Proof forms covered: rfl, exact, constructor (And), rw, and linear arithmetic by reflection.
// Anything else throws "unsupported".

// ---------- levels ----------
const L = {
  zero: { k: "zero", key: "z" },
  succ: (l) => ({ k: "succ", l, key: `s(${l.key})` }),
  max: (a, b) => ({ k: "max", a, b, key: `m(${a.key},${b.key})` }),
  imax: (a, b) => ({ k: "imax", a, b, key: `i(${a.key},${b.key})` }),
  param: (name) => ({ k: "param", name, key: `p(${name})` }),
};
let fresh = 0;
const lmvar = () => { const id = ++fresh; return { k: "lmvar", id, key: `?l${id}` }; };

// ---------- expressions, hash-consed so equal terms are the same object ----------
const table = new Map();
let uids = 0;
function mk(node) { const hit = table.get(node.key); if (hit) return hit; node.uid = ++uids; table.set(node.key, node); return node; }
const E = {
  bvar: (i) => mk({ k: "bvar", i, key: `b${i}` }),
  sort: (l) => mk({ k: "sort", l, key: `S(${l.key})` }),
  const: (name, us) => mk({ k: "const", name, us, key: `C(${name};${us.map((u) => u.key).join(",")})` }),
  app: (fn, arg) => mk({ k: "app", fn, arg, key: `A${fn.uid},${arg.uid}` }),
  lam: (name, type, body, bi = "default") => mk({ k: "lam", name, type, body, bi, key: `L${name};${bi};${type.uid};${body.uid}` }),
  pi: (name, type, body, bi = "default") => mk({ k: "pi", name, type, body, bi, key: `P${name};${bi};${type.uid};${body.uid}` }),
  nat: (n) => mk({ k: "nat", n: String(n), key: `N${n}` }),
  fvar: (name, type) => { const id = ++fresh; return mk({ k: "fvar", name, type, id, key: `F${id}` }); },
  mvar: (type) => { const id = ++fresh; return mk({ k: "mvar", type, id, key: `?${id}` }); },
  let: (name, type, value, body) => mk({ k: "let", name, type, value, body, key: `T${name};${type.uid};${value.uid};${body.uid}` }),
  proj: (typeName, idx, struct) => mk({ k: "proj", typeName, idx, struct, key: `J${typeName};${idx};${struct.uid}` }),
  opaque: (ie) => mk({ k: "opaque", key: `O${ie}` }),
};
const Prop = () => E.sort(L.zero);
const apps = (f, ...args) => args.reduce((acc, a) => E.app(acc, a), f);

// ---------- the library: names, levels, expressions, constant types ----------
export function loadLibrary(text) {
  const lib = { names: [""], nameIx: new Map([["", 0]]), levels: [L.zero], levelIx: new Map([[L.zero.key, 0]]), exprs: [], exprIx: new Map(), decls: new Map(), maxIn: 0, maxIl: 0, maxIe: -1 };
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if ("name" in o && "type" in o && "levelParams" in o) lib.decls.set(lib.names[o.name], { levelParams: o.levelParams.map((n) => lib.names[n]), type: lib.exprs[o.type], value: "value" in o ? lib.exprs[o.value] : null });
      Object.values(o).forEach(walk);
    }
  };
  for (const line of text.split("\n")) {
    if (!line) continue;
    const o = JSON.parse(line);
    if ("in" in o) {
      const pre = lib.names[(o.str || o.num).pre];
      const part = o.str ? o.str.str : String(o.num.i);
      const full = pre ? `${pre}.${part}` : part;
      lib.names[o.in] = full; lib.nameIx.set(full, o.in); lib.maxIn = Math.max(lib.maxIn, o.in);
    } else if ("il" in o) {
      const g = (i) => lib.levels[i];
      const l = "succ" in o ? L.succ(g(o.succ)) : "max" in o ? L.max(g(o.max[0]), g(o.max[1])) : "imax" in o ? L.imax(g(o.imax[0]), g(o.imax[1])) : L.param(lib.names[o.param]);
      lib.levels[o.il] = l; lib.levelIx.set(l.key, o.il); lib.maxIl = Math.max(lib.maxIl, o.il);
    } else if ("ie" in o) {
      const g = (i) => lib.exprs[i];
      let e;
      if ("bvar" in o) e = E.bvar(o.bvar);
      else if ("sort" in o) e = E.sort(lib.levels[o.sort]);
      else if ("const" in o) e = E.const(lib.names[o.const.name], o.const.us.map((u) => lib.levels[u]));
      else if ("app" in o) e = E.app(g(o.app.fn), g(o.app.arg));
      else if ("lam" in o) e = E.lam(lib.names[o.lam.name], g(o.lam.type), g(o.lam.body), o.lam.binderInfo);
      else if ("forallE" in o) e = E.pi(lib.names[o.forallE.name], g(o.forallE.type), g(o.forallE.body), o.forallE.binderInfo);
      else if ("natVal" in o) e = E.nat(o.natVal);
      else if ("proj" in o) e = E.proj(lib.names[o.proj.typeName], o.proj.idx, g(o.proj.struct));
      else if ("letE" in o) e = E.let(lib.names[o.letE.name], g(o.letE.type), g(o.letE.value), g(o.letE.body));
      else e = E.opaque(o.ie); // letE, proj, strVal, mdata: carried, never rebuilt
      lib.exprs[o.ie] = e; if (!lib.exprIx.has(e.key)) lib.exprIx.set(e.key, o.ie); lib.maxIe = Math.max(lib.maxIe, o.ie);
    } else walk(o);
  }
  return lib;
}

// ---------- term operations ----------
const lassign = new Map(), eassign = new Map();
function instL(l) {
  switch (l.k) {
    case "lmvar": return lassign.has(l.id) ? instL(lassign.get(l.id)) : l;
    case "succ": return L.succ(instL(l.l));
    case "max": return L.max(instL(l.a), instL(l.b));
    case "imax": return L.imax(instL(l.a), instL(l.b));
    default: return l;
  }
}
function map(e, f, depth = 0, memo = new Map()) { // rebuilds e; f(node, depth) may return a replacement
  const r = f(e, depth); if (r) return r;
  if (e.k !== "app" && e.k !== "lam" && e.k !== "pi" && e.k !== "let" && e.k !== "proj") return e;
  const mkey = e.uid * 4096 + depth, hit = memo.get(mkey); if (hit) return hit;
  const out = mapNode(e, f, depth, memo); memo.set(mkey, out); return out;
}
function mapNode(e, f, depth, memo) {
  switch (e.k) {
    case "app": return E.app(map(e.fn, f, depth, memo), map(e.arg, f, depth, memo));
    case "lam": return E.lam(e.name, map(e.type, f, depth, memo), map(e.body, f, depth + 1, memo), e.bi);
    case "pi": return E.pi(e.name, map(e.type, f, depth, memo), map(e.body, f, depth + 1, memo), e.bi);
    case "proj": return E.proj(e.typeName, e.idx, map(e.struct, f, depth, memo));
    case "let": return E.let(e.name, map(e.type, f, depth, memo), map(e.value, f, depth, memo), map(e.body, f, depth + 1, memo));
    default: return e;
  }
}
const inst = (e) => map(e, (n) => n.k === "mvar" && eassign.has(n.id) ? inst(eassign.get(n.id)) : n.k === "const" ? E.const(n.name, n.us.map(instL)) : n.k === "sort" ? E.sort(instL(n.l)) : null);
const instantiate = (body, v) => map(body, (n, d) => n.k === "bvar" ? (n.i === d ? v : n) : null);
const abstract = (e, target) => map(e, (n, d) => n === target ? E.bvar(d) : null);
const substLevels = (e, m) => {
  const sl = (l) => l.k === "param" ? (m.get(l.name) || l) : l.k === "succ" ? L.succ(sl(l.l)) : l.k === "max" ? L.max(sl(l.a), sl(l.b)) : l.k === "imax" ? L.imax(sl(l.a), sl(l.b)) : l;
  return map(e, (n) => n.k === "const" ? E.const(n.name, n.us.map(sl)) : n.k === "sort" ? E.sort(sl(n.l)) : null);
};
function beta(e) { // head beta only
  const args = []; let h = e;
  while (h.k === "app") { args.unshift(h.arg); h = h.fn; }
  if (h.k !== "lam" || !args.length) return e;
  while (h.k === "lam" && args.length) h = instantiate(h.body, args.shift());
  return beta(apps(h, ...args));
}
const fail = (m) => { throw new Error(m); };

export function emitter(lib) {
  const decl = (name) => lib.decls.get(name) || fail(`unknown constant ${name}`);
  const constant = (name) => { const d = decl(name); const us = d.levelParams.map(() => lmvar()); return [E.const(name, us), substLevels(d.type, new Map(d.levelParams.map((p, i) => [p, us[i]])))]; };

  function infer(e) {
    switch (e.k) {
      case "const": { const d = decl(e.name); return substLevels(d.type, new Map(d.levelParams.map((p, i) => [p, e.us[i]]))); }
      case "app": { const ft = beta(inst(infer(e.fn))); return ft.k === "pi" ? instantiate(ft.body, e.arg) : fail("unsupported: function type is not a syntactic pi"); }
      case "fvar": case "mvar": return e.type;
      case "sort": return E.sort(L.succ(e.l));
      case "nat": return E.const("Nat", []);
      case "lam": { const x = E.fvar(e.name, e.type); return E.pi(e.name, e.type, abstract(infer(instantiate(e.body, x)), x), e.bi); }
      default: return fail(`unsupported: infer ${e.k}`);
    }
  }
  function unifyL(a, b) {
    a = instL(a); b = instL(b);
    if (a.key === b.key) return;
    if (a.k === "lmvar") return void lassign.set(a.id, b);
    if (b.k === "lmvar") return void lassign.set(b.id, a);
    if (a.k === "succ" && b.k === "succ") return unifyL(a.l, b.l);
    fail(`level mismatch ${a.key} / ${b.key}`);
  }
  function unify(a, b) {
    a = beta(inst(a)); b = beta(inst(b));
    if (a === b) return;
    if (a.k === "mvar") { eassign.set(a.id, b); return unify(a.type, infer(b)); }
    if (b.k === "mvar") { eassign.set(b.id, a); return unify(b.type, infer(a)); }
    if (a.k !== b.k) fail(`mismatch ${a.k} / ${b.k}`);
    switch (a.k) {
      case "sort": return unifyL(a.l, b.l);
      case "const": if (a.name !== b.name) fail(`mismatch ${a.name} / ${b.name}`); return a.us.forEach((u, i) => unifyL(u, b.us[i]));
      case "app": unify(a.fn, b.fn); return unify(a.arg, b.arg);
      case "lam": case "pi": unify(a.type, b.type); return unify(a.body, b.body);
      default: fail(`mismatch at ${a.k}`);
    }
  }
  // A constant applied to every argument, explicit or not; null stands for an argument to infer.
  function full(name, args) {
    let [f, t] = constant(name);
    for (const given of args) {
      t = beta(inst(t)); if (t.k !== "pi") fail(`${name}: too many arguments`);
      const a = given || E.mvar(t.type);
      if (given) unify(t.type, infer(a));
      f = E.app(f, a); t = instantiate(t.body, a);
    }
    return f;
  }
  const numeral = (n) => apps(E.const("OfNat.ofNat", [L.zero]), E.const("Nat", []), E.nat(n), E.app(E.const("instOfNatNat", []), E.nat(n)));

  // Surface terms of the generated Lean: prefix application, numerals, parentheses.
  function elab(s, locals) {
    if (typeof s === "string") s = [s];
    const [head, ...args] = s;
    let f, t;
    if (Array.isArray(head)) { f = elab(head, locals); t = infer(f); }
    else if (/^\d+$/.test(head)) { f = numeral(head); t = infer(f); }
    else if (locals.has(head)) { f = locals.get(head); t = f.type; }
    else [f, t] = constant(head);
    const rest = [...args];
    for (;;) {
      t = beta(inst(t));
      if (t.k !== "pi") { if (rest.length) fail(`${head}: too many arguments`); break; }
      if (t.bi === "instImplicit") fail("unsupported: instance argument");
      let a;
      if (t.bi !== "default") a = E.mvar(t.type);
      else if (rest.length) { a = elab(rest.shift(), locals); unify(t.type, infer(a)); }
      else break;
      f = E.app(f, a); t = instantiate(t.body, a);
    }
    return f;
  }
  const asEq = (g) => { // @Eq T a b
    const b = g.arg, a = g.fn && g.fn.arg, T = g.fn && g.fn.fn && g.fn.fn.arg, c = g.fn && g.fn.fn && g.fn.fn.fn;
    return c && c.k === "const" && c.name === "Eq" ? { T, a, b } : null;
  };

  // ---------- arithmetic: bridging lemmas around a reflective core ----------
  // The trusted part is small: LexReflect.soundT, whose checker reads integer inequalities with conditionals.
  // Everything else here is untrusted compilation. Each statement form (a Boolean comparison, an equality, a
  // conjunction, division, a natural number, a byte) is turned into integer inequalities by a lemma proved once,
  // and the search only proposes certificates. The kernel judges the whole term.
  const c0 = (n) => E.const(n, []), Int = () => c0("Int"), u1 = L.succ(L.zero), RX = "LexReflect.";
  const binop = (H, inst, base) => (a, b) => apps(E.const(H, [L.zero, L.zero, L.zero]), Int(), Int(), Int(), apps(E.const(inst, [L.zero]), Int(), c0(base)), a, b);
  const T = { add: binop("HAdd.hAdd", "instHAdd", "Int.instAdd"), sub: binop("HSub.hSub", "instHSub", "Int.instSub"), mul: binop("HMul.hMul", "instHMul", "Int.instMul"),
    lit: (n) => apps(E.const("OfNat.ofNat", [L.zero]), Int(), E.nat(n), E.app(c0("instOfNat"), E.nat(n))),
    le: (a, b) => apps(E.const("LE.le", [L.zero]), Int(), c0("Int.instLEInt"), a, b), lt: (a, b) => apps(E.const("LT.lt", [L.zero]), Int(), c0("Int.instLTInt"), a, b) };
  const list = (ty, xs) => xs.reduceRight((tail, x) => apps(E.const("List.cons", [L.zero]), ty, x, tail), E.app(E.const("List.nil", [L.zero]), ty));
  const X = (c) => c0(RX + "Expr." + c), ExprT = () => c0(RX + "Expr"), NatT = () => c0("Nat");
  const spine = (t) => { const args = []; while (t.k === "app") { args.unshift(t.arg); t = t.fn; } return [t, args]; };
  const hasFVar = (t) => { let found = false; map(t, (n) => { if (n.k === "fvar") found = true; return null; }); return found; };

  // The statement as written, for the integer fragment: implications, <=, <, +, -, literal *, (n : Int), f (x).
  function parseInfix(src) {
    const toks = src.match(/->|<=|[()<+\-*:]|[A-Za-z_][\w'.]*|\d+/g) || []; let i = 0;
    if (toks.join("") !== src.replace(/\s+/g, "")) fail("unsupported: statement syntax");
    const eat = (t) => toks[i] === t ? (i++, true) : false;
    const need = (t) => eat(t) || fail("unsupported: statement syntax");
    const atom = () => {
      if (eat("(")) { if (/^\d+$/.test(toks[i]) && toks[i + 1] === ":") { const n = toks[i]; i += 2; need("Int"); need(")"); return { op: "lit", n: BigInt(n) }; } const e = imp(); need(")"); return e; }
      const name = toks[i++];
      if (!name || !/^[A-Za-z_]/.test(name)) fail("unsupported: statement syntax");
      if (toks[i] === "(") { i++; const arg = imp(); need(")"); return { op: "call", name, arg }; }
      return { op: "var", name };
    };
    const prod = () => { let a = atom(); while (eat("*")) a = { op: "mul", a, b: atom() }; return a; };
    const sum = () => { let a = prod(); for (;;) { if (eat("+")) a = { op: "add", a, b: prod() }; else if (eat("-")) a = { op: "sub", a, b: prod() }; else return a; } };
    const cmp = () => { const a = sum(); return eat("<=") ? { op: "le", a, b: sum() } : eat("<") ? { op: "lt", a, b: sum() } : a; };
    const imp = () => { const a = cmp(); return eat("->") ? { op: "imp", a, b: imp() } : a; };
    const e = imp(); if (i !== toks.length) fail("unsupported: statement syntax"); return e;
  }
  function statementFromText(th) {
    for (const [, ty] of th.binders) if (ty.length !== 1 || ty[0] !== "Int") fail("unsupported: statement syntax");
    const ns = th.name.slice(0, th.name.lastIndexOf(".") + 1);
    const locals = new Map(th.binders.map(([x]) => [x, E.fvar(x, Int())]));
    const local = (x) => locals.get(x) || fail(`unknown variable ${x}`);
    const fn = (f) => lib.decls.has(ns + f) ? c0(ns + f) : lib.decls.has(f) ? c0(f) : fail(`unsupported: ${f}`);
    const stmt = (e) => e.op === "imp" ? E.pi("a._@._internal._hyg.0", stmt(e.a), stmt(e.b)) : e.op === "var" ? local(e.name) : e.op === "lit" ? T.lit(e.n)
      : e.op === "call" ? E.app(fn(e.name), stmt(e.arg)) : T[e.op](stmt(e.a), stmt(e.b));
    return closeOver(th, locals, stmt(parseInfix(th.raw)), c0("Int")).type;
  }

  // Reflected terms, on the search side. Mirrors LexReflect.Expr and its functions exactly.
  const R = { v: (i) => ({ op: "var", i }), k: (n) => ({ op: "lit", n }), add: (a, b) => ({ op: "add", a, b }), sub: (a, b) => ({ op: "sub", a, b }), neg: (a) => ({ op: "neg", a }),
    mul: (k, b) => ({ op: "mul", k, b }), mulr: (a, k) => ({ op: "mulr", a, k }), ite: (a, b, t, e) => ({ op: "ite", a, b, t, e }) };
  const inner = (e) => e.op === "mul" ? "b" : (e.op === "neg" || e.op === "mulr") ? "a" : null;
  const firstIte = (e) => e.op === "ite" ? [e.a, e.b] : e.op === "add" || e.op === "sub" ? (firstIte(e.a) || firstIte(e.b)) : inner(e) ? firstIte(e[inner(e)]) : null;
  const resolve = (bit, e) => e.op === "ite" ? (bit ? e.t : e.e) : e.op === "add" || e.op === "sub" ? (firstIte(e.a) ? { ...e, a: resolve(bit, e.a) } : { ...e, b: resolve(bit, e.b) })
    : inner(e) ? { ...e, [inner(e)]: resolve(bit, e[inner(e)]) } : e;
  const pairFirst = (g) => firstIte(g[0]) || firstIte(g[1]);
  const pairResolve = (bit, g) => firstIte(g[0]) ? [resolve(bit, g[0]), g[1]] : [g[0], resolve(bit, g[1])];
  const intLit = (n) => n >= 0n ? E.app(c0("Int.ofNat"), E.nat(n)) : E.app(c0("Int.negSucc"), E.nat(-n - 1n));
  const quote = (e) => e.op === "var" ? E.app(X("var"), E.nat(e.i)) : e.op === "lit" ? E.app(X("const"), intLit(e.n)) : e.op === "mul" ? apps(X("mulc"), intLit(e.k), quote(e.b))
    : e.op === "mulr" ? apps(X("mulr"), quote(e.a), intLit(e.k)) : e.op === "neg" ? E.app(X("neg"), quote(e.a))
    : e.op === "ite" ? apps(X("ite"), quote(e.a), quote(e.b), quote(e.t), quote(e.e)) : apps(X(e.op), quote(e.a), quote(e.b));
  const quotePair = (p) => apps(E.const("Prod.mk", [L.zero, L.zero]), ExprT(), ExprT(), quote(p[0]), quote(p[1]));
  const abs = (x) => x < 0n ? -x : x, gcd = (a, b) => b ? gcd(b, a % b) : a, floorDiv = (a, g) => (a - ((a % g) + g) % g) / g;

  function compile(th, S) {
    const ns = th.name.slice(0, th.name.lastIndexOf(".") + 1);
    // Open the binders: values of a known type are variables, everything else is a hypothesis.
    const fvs = []; let body = S;
    const dataType = (t) => t.k === "const" && ["Int", "Nat", "UInt8", "Int8"].includes(t.name) ? t.name : null;
    const project = th.name.split(".")[0] + ".", z0 = L.zero, NatC = () => c0("Nat");
    const foldl = (acc, elem, f, z, xs) => apps(E.const("List.foldl", [z0, z0]), acc, elem, f, z, xs);
    const asFold = (t) => { const [h, a] = spine(t); return h.k === "const" && h.name === "List.foldl" && a.length === 5 ? { acc: a[0], elem: a[1], f: a[2], z: a[3], xs: a[4] } : null; };
    const pairOf = (t) => { const [h, a] = spine(t); return h.k === "const" && h.name === "Prod" && a.length === 2 ? a : null; };
    const part = (which, ty, p) => norm(apps(E.const(which, [z0, z0]), ty[0], ty[1], p)), eqAt = (ty, a, b) => apps(E.const("Eq", [u1]), ty, a, b);
    const listOf = (t) => { const [h, a] = spine(t); return h.k === "const" && h.name === "List" && a.length === 1 ? a[0] : null; };
    const natLit = (n) => apps(E.const("OfNat.ofNat", [z0]), NatC(), E.nat(n), E.app(c0("instOfNatNat"), E.nat(n)));
    const natAdd = (a, b) => apps(E.const("HAdd.hAdd", [z0, z0, z0]), NatC(), NatC(), NatC(), apps(E.const("instHAdd", [z0]), NatC(), c0("instAddNat")), a, b);
    // The form the kernel reaches by itself: this project's definitions unfolded, LexLean's folds as List.foldl, a
    // fold over a list that starts with an element taken one step. Nothing is done under a binder.
    function norm(t) {
      t = beta(t);
      if (t.k === "let") return norm(instantiate(t.body, t.value));
      if (t.k === "proj" && t.typeName === "Prod") { // the primitive form of p.1 and p.2
        const p = norm(t.struct), [ph, pa] = spine(p);
        if (ph.k === "const" && ph.name === "Prod.mk" && pa.length === 4) return norm(pa[2 + t.idx]);
        const ty = p.k === "fvar" ? pairOf(p.type) : null;
        return ty ? apps(E.const(t.idx === 0 ? "Prod.fst" : "Prod.snd", [z0, z0]), ty[0], ty[1], p) : E.proj(t.typeName, t.idx, p);
      }
      if (t.k !== "app" && t.k !== "const") return t;
      const [h, a] = spine(t);
      if (h.k === "const") {
        if ((h.name === "Prod.fst" || h.name === "Prod.snd") && a.length === 3) {
          const p = norm(a[2]), [ph, pa] = spine(p);
          if (ph.k === "const" && ph.name === "Prod.mk" && pa.length === 4) return norm(pa[h.name === "Prod.fst" ? 2 : 3]);
          return apps(h, a[0], a[1], p);
        }
        const d = lib.decls.get(h.name);
        if (d && d.value && h.name.startsWith(project) && d.levelParams.length === 0) return norm(apps(d.value, ...a));
        if ((h.name === "LexLeanCollections.listFold" || h.name === "LexLeanCollections.setFold") && a.length === 5) return norm(foldl(a[1], a[0], a[2], a[3], a[4]));
        if (h.name === "LexLeanCollections.mapFold" && a.length === 6) {
          const pair = apps(E.const("Prod", [z0, z0]), a[0], a[1]), proj = (p) => apps(E.const(p, [z0, z0]), a[0], a[1], E.bvar(0));
          return norm(foldl(a[2], pair, E.lam("s", a[2], E.lam("e", pair, apps(a[3], E.bvar(1), proj("Prod.fst"), proj("Prod.snd")))), a[4], a[5]));
        }
        if (h.name === "LexLeanRuntime.append" && a.length === 4 && listOf(a[0])) return norm(apps(E.const("List.append", [z0]), listOf(a[0]), a[2], a[3]));
        if (h.name === "LexLeanRuntime.length" && a.length === 3 && listOf(a[0])) return norm(apps(E.const("List.length", [z0]), listOf(a[0]), a[2]));
        if (h.name === "List.foldl" && a.length === 5) {
          const xs = norm(a[4]), [lh, la] = spine(xs);
          if (lh.k === "const" && lh.name === "List.cons" && la.length === 3) return norm(foldl(a[0], a[1], a[2], apps(a[2], a[3], la[1]), la[2]));
          if (lh.k === "const" && lh.name === "List.nil") return norm(a[3]);
          return foldl(a[0], a[1], a[2], norm(a[3]), xs);
        }
      }
      return apps(h, ...a.map(norm));
    }
    while (body.k === "pi") { const fv = E.fvar(body.name, norm(body.type)); fvs.push(fv); body = instantiate(body.body, fv); }
    body = norm(body);
    const pos = new Map(fvs.map((fv, i) => [fv, i]));
    const under = (e, count) => map(e, (n, d) => n.k === "fvar" && pos.has(n) && pos.get(n) < count ? E.bvar(d + count - 1 - pos.get(n)) : null);
    // An obligation that stands on its own: closed over everything in scope, compiled separately, applied back.
    const forall = (vars, prop) => vars.reduceRight((b, v) => E.pi(v.name, v.type, abstract(b, v)), prop);
    const lambda = (vars, term) => vars.reduceRight((b, v) => E.lam(v.name, v.type, abstract(b, v)), term);
    const depth = th.depth || 0;
    const sub = (prop) => {
      if (depth > 3) fail("obligations nested too deep");
      let closed = under(prop, fvs.length); for (let i = fvs.length - 1; i >= 0; i--) closed = E.pi(fvs[i].name, under(fvs[i].type, i), closed);
      return apps(compile({ name: th.name, depth: depth + 1, sub: true }, closed).value, ...fvs);
    };

    // Atoms: integer-valued terms the checker treats as unknowns. Facts: inequalities known about them, each with
    // its proof. Sites: divisions by a constant, whose dividend's sign may have to be taken both ways.
    const atoms = [], atomIx = new Map(), facts = [], sites = new Map(), ranged = new Set();
    const atom = (t) => { if (!atomIx.has(t)) { atomIx.set(t, atoms.length); atoms.push(t); } return R.v(atomIx.get(t)); };
    const fact = (a, b, proof) => facts.push({ pair: [a, b], proof });
    const lemma = (name, ...args) => apps(c0(RX + name), ...args);
    const yes = () => apps(E.const("Eq.refl", [u1]), c0("Bool"), c0("Bool.true")), no = () => apps(E.const("Eq.refl", [u1]), c0("Bool"), c0("Bool.false"));
    const litOf = (t, ty) => { const [h, a] = spine(t); return h.k === "const" && h.name === "OfNat.ofNat" && a.length === 3 && a[0] === c0(ty) && a[1].k === "nat" ? BigInt(a[1].n) : null; };
    const negLitOf = (t, ty) => { const [h, a] = spine(t); return h.k === "const" && h.name === "Neg.neg" && a.length === 3 && a[0] === c0(ty) && litOf(a[2], ty) !== null ? -litOf(a[2], ty) : null; };
    const isType = (t, name) => t === c0(name);
    const ranges = { UInt8: ["u8_lo", 0n, "u8_hi", 255n], Int8: ["i8_lo", -128n, "i8_hi", 127n] };

    // Any integer term, including the integer readings of naturals and bytes.
    function intR(t) {
      t = beta(t);
      if (t.k === "let") return intR(instantiate(t.body, t.value));
      if (atomIx.has(t)) return R.v(atomIx.get(t));
      const [h, a] = spine(t);
      if (h.k === "const") {
        if (litOf(t, "Int") !== null) return R.k(litOf(t, "Int"));
        if (negLitOf(t, "Int") !== null) return R.k(negLitOf(t, "Int"));
        if (h.name === "Int.ofNat" && a.length === 1) { const [g, b] = spine(a[0]); return g.k === "const" && g.name === "UInt8.toNat" && b.length === 1 ? byteR(t, b[0], "UInt8") : natR(t, a[0]); }
        if (h.name === "Int8.toInt" && a.length === 1) return byteR(t, a[0], "Int8");
        const two = (n) => a.length === n + 2 && isType(a[0], "Int");
        if ((h.name === "HAdd.hAdd" && a.length === 6 && isType(a[0], "Int")) ) return R.add(intR(a[4]), intR(a[5]));
        if ((h.name === "HSub.hSub" && a.length === 6 && isType(a[0], "Int")) || (h.name === "LexLeanRuntime.subtract" && two(2))) return R.sub(intR(a[a.length - 2]), intR(a[a.length - 1]));
        if ((h.name === "Neg.neg" && a.length === 3 && isType(a[0], "Int")) || (h.name === "LexLeanRuntime.negate" && two(1))) return R.neg(intR(a[a.length - 1]));
        if ((h.name === "HMul.hMul" && a.length === 6 && isType(a[0], "Int")) || (h.name === "LexLeanRuntime.multiply" && two(2))) {
          const l = intR(a[a.length - 2]), r = intR(a[a.length - 1]);
          if (l.op === "lit") return R.mul(l.n, r); if (r.op === "lit") return R.mulr(l, r.n);
          return atom(t);
        }
        if ((h.name === "LexLeanRuntime.quotient" || h.name === "LexLeanRuntime.remainder") && two(3)) {
          const k = intR(a[3]);
          if (k.op !== "lit") return atom(t);
          if (k.n === 0n) return intR(a[4]); // division by zero returns the fallback; the kernel evaluates that
          const s = site(a[2], a[3], k.n);
          return h.name === "LexLeanRuntime.quotient" ? s.q : s.r;
        }
        if (h.name === "ite" && a.length === 5 && isType(a[0], "Int")) {
          const [eq, ea] = spine(a[1]), [lt, la] = ea.length === 3 ? spine(ea[1]) : [{}, []];
          if (eq.name === "Eq" && ea[2] === c0("Bool.true") && lt.name === "LexLeanCollections.lessThan" && la.length === 4 && isType(la[0], "Int"))
            return R.ite(intR(la[2]), intR(la[3]), intR(a[3]), intR(a[4]));
        }
        const d = lib.decls.get(h.name);
        if (d && d.value && h.name.startsWith(ns) && d.levelParams.length === 0) return intR(apps(d.value, ...a));
        const fo = asFold(t);
        if (fo && isType(fo.acc, "Int") && !atomIx.has(t)) { const v = atom(t); foldFacts(t, fo, "Int"); return v; }
      }
      return atom(t);
    }
    // e = k * q + r with q = e.tdiv k and r = e.tmod k, and r smaller than k in magnitude.
    function site(e, kTerm, k) {
      const id = e.uid + ":" + kTerm.uid;
      if (sites.has(id)) return sites.get(id);
      const qT = apps(c0("Int.tdiv"), e, kTerm), rT = apps(c0("Int.tmod"), e, kTerm);
      const s = { e, kTerm, k, q: atom(qT), r: atom(rT), E: null }; sites.set(id, s);
      s.E = intR(e);
      const kq = R.add(R.mul(k, s.q), s.r), m = abs(k) - 1n;
      fact(s.E, kq, lemma("div_le", e, kTerm)); fact(kq, s.E, lemma("div_ge", e, kTerm));
      fact(R.k(-m), s.r, lemma("rem_lo", e, kTerm, no())); fact(s.r, R.k(m), lemma("rem_hi", e, kTerm, no()));
      return s;
    }
    // A fold used as a number is an unknown, but two things are known about it. Over xs ++ ys it is the fold over ys
    // started from the fold over xs. And if each step only adds to the accumulator, a fold started from z is z plus
    // the fold started from zero; that one is itself proved by fusion, and is dropped if its obligations fail.
    function foldFacts(term, fo, ty) {
      const [lh, la] = spine(fo.xs), eq = (a, b) => apps(E.const("Eq", [u1]), fo.acc, a, b);
      if (lh.k === "const" && lh.name === "List.append" && la.length === 3) {
        const two = norm(foldl(fo.acc, fo.elem, fo.f, foldl(fo.acc, fo.elem, fo.f, fo.z, la[1]), la[2]));
        hypothesis(eq(term, two), lemma("fold_append", fo.elem, fo.acc, fo.f, fo.z, la[1], la[2]));
      }
      const zero = ty === "Nat" ? natLit(0n) : T.lit(0n), isZero = fo.z.k === "nat" ? BigInt(fo.z.n) === 0n : litOf(fo.z, ty) === 0n;
      if (!isZero && depth < 2) {
        const plus = (a, b) => ty === "Nat" ? natAdd(a, b) : T.add(a, b);
        const a = E.fvar("a", fo.acc), b = E.fvar("b", fo.acc), x = E.fvar("x", fo.elem), rel = (p, q) => eq(p, plus(fo.z, q));
        let proof = null;
        try {
          const step = sub(forall([a, b, x], E.pi("h", rel(a, b), rel(apps(fo.f, a, x), apps(fo.f, b, x)))));
          const init = sub(rel(fo.z, zero));
          proof = lemma("fold_rel2", fo.elem, fo.acc, fo.acc, fo.f, fo.f, lambda([a, b], rel(a, b)), step, fo.xs, fo.z, zero, init);
        } catch { /* not an additive fold: nothing is claimed */ }
        if (proof) hypothesis(eq(term, plus(fo.z, foldl(fo.acc, fo.elem, fo.f, zero, fo.xs))), proof);
      }
    }
    // A natural number n, read as Int.ofNat n. `view` is that integer term.
    function natR(view, n) {
      const lit = n.k === "nat" ? BigInt(n.n) : litOf(n, "Nat");
      if (lit !== null) return R.k(lit);
      const [h, a] = spine(n);
      const ofNat = (x) => E.app(c0("Int.ofNat"), x);
      if (h.k === "const" && h.name === "HAdd.hAdd" && a.length === 6 && isType(a[0], "Nat")) return R.add(intR(ofNat(a[4])), intR(ofNat(a[5])));
      if (h.k === "const" && ((h.name === "HMul.hMul" && a.length === 6) || (h.name === "LexLeanRuntime.multiply" && a.length === 4)) && isType(a[0], "Nat")) {
        const l = intR(ofNat(a[a.length - 2])), r = intR(ofNat(a[a.length - 1]));
        if (l.op === "lit") return R.mul(l.n, r); if (r.op === "lit") return R.mulr(l, r.n);
      }
      const fo = asFold(n);
      if (fo && isType(fo.acc, "Nat") && !atomIx.has(view)) { const v = atom(view); fact(R.k(0n), v, lemma("nat_nonneg", n)); foldFacts(n, fo, "Nat"); return v; }
      const isDiv = h.k === "const" && ((h.name === "LexLeanRuntime.quotient" && a.length === 5) || (h.name === "HDiv.hDiv" && a.length === 6)), isMod = h.k === "const" && ((h.name === "LexLeanRuntime.remainder" && a.length === 5) || (h.name === "HMod.hMod" && a.length === 6));
      if ((isDiv || isMod) && isType(a[0], "Nat")) {
        const runtime = a.length === 5, l = runtime ? a[2] : a[4], kT = runtime ? a[3] : a[5], k = intR(ofNat(kT));
        if (k.op === "lit" && k.n === 0n && runtime) return intR(ofNat(a[4]));
        if (k.op === "lit" && k.n > 0n) {
          const id = "N" + l.uid + ":" + kT.uid;
          if (!sites.has(id)) {
            const dT = apps(c0("Nat.div"), l, kT), mT = apps(c0("Nat.mod"), l, kT), q = atom(ofNat(dT)), m = atom(ofNat(mT));
            sites.set(id, { nat: true, q, m });
            const L = intR(ofNat(l)), kq = R.add(R.mul(k.n, q), m);
            fact(R.k(0n), q, lemma("nat_nonneg", dT)); fact(R.k(0n), m, lemma("nat_nonneg", mT));
            fact(L, kq, lemma("nat_divmod_le", l, kT)); fact(kq, L, lemma("nat_divmod_ge", l, kT));
            fact(m, R.k(k.n - 1n), lemma("nat_mod_hi", l, kT, yes()));
          }
          return isDiv ? sites.get(id).q : sites.get(id).m;
        }
      }
      if (!atomIx.has(view)) { const v = atom(view); fact(R.k(0n), v, lemma("nat_nonneg", n)); return v; }
      return atom(view);
    }
    // A byte x, read as an integer: its range is known.
    function byteR(view, x, ty) {
      const [lo, min, hi, max] = ranges[ty];
      let lit = litOf(x, ty); if (lit === null) lit = negLitOf(x, ty);
      if (lit !== null) return lit >= min && lit <= max ? R.k(lit) : fail("unsupported: a literal out of range");
      if (!atomIx.has(view)) { const v = atom(view); fact(R.k(min), v, lemma(lo, x)); fact(v, R.k(max), lemma(hi, x)); return v; }
      return atom(view);
    }
    const views = { Int: (t) => t, Nat: (t) => E.app(c0("Int.ofNat"), t), UInt8: (t) => E.app(c0("Int.ofNat"), E.app(c0("UInt8.toNat"), t)), Int8: (t) => E.app(c0("Int8.toInt"), t) };
    const prefix = { Nat: "nat", UInt8: "u8", Int8: "i8" };
    // A comparison, as the inequality a' <= b' over integers, with the lemma names that carry it there and back.
    function comparison(P) {
      const [h, a] = spine(P);
      if (h.k !== "const") return null;
      if ((h.name === "LE.le" || h.name === "LT.lt") && a.length === 4 && dataType(a[0])) {
        const ty = a[0].name, lt = h.name === "LT.lt", A = intR(views[ty](a[2])), B = intR(views[ty](a[3]));
        const pair = lt ? [R.add(A, R.k(1n)), B] : [A, B];
        return ty === "Int" ? { pair, args: [] } : { pair, args: [a[2], a[3]], mp: `${prefix[ty]}_${lt ? "lt" : "le"}_mp`, mpr: `${prefix[ty]}_${lt ? "lt" : "le"}_mpr` };
      }
      if (h.name === "Eq" && a.length === 3 && isType(a[0], "Bool") && (a[2] === c0("Bool.true") || a[2] === c0("Bool.false"))) {
        const [g, b] = spine(a[1]), truth = a[2] === c0("Bool.true");
        if (g.k === "const" && g.name === "LexLeanCollections.lessThan" && b.length === 4 && (isType(b[0], "Int") || isType(b[0], "Int8"))) {
          const ty = b[0].name, A = intR(views[ty](b[2])), B = intR(views[ty](b[3])), p = ty === "Int" ? "int" : "i8";
          return { pair: truth ? [R.add(A, R.k(1n)), B] : [B, A], args: [b[2], b[3]], mp: `${p}_ltb_${truth}_mp`, mpr: `${p}_ltb_${truth}_mpr` };
        }
      }
      return null;
    }
    function hypothesis(P, h) {
      const c = comparison(P);
      if (c) return fact(c.pair[0], c.pair[1], c.mp ? lemma(c.mp, ...c.args, h) : h);
      const [g, a] = spine(P);
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && (isType(a[0], "Int") || isType(a[0], "Nat"))) {
        const ty = a[0].name, A = intR(views[ty](a[1])), B = intR(views[ty](a[2]));
        fact(A, B, lemma(ty === "Int" ? "le_of_eq'" : "nat_eq_le", a[1], a[2], h)); return fact(B, A, lemma(ty === "Int" ? "ge_of_eq'" : "nat_eq_ge", a[1], a[2], h));
      }
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && isType(a[0], "Bool") && a[2] === c0("Bool.true")) {
        const [e, b] = spine(a[1]);
        if (e.k === "const" && e.name === "LexLeanRuntime.equal" && b.length === 4 && isType(b[0], "UInt8")) {
          const A = intR(views.UInt8(b[2])), B = intR(views.UInt8(b[3]));
          fact(A, B, lemma("u8_eqb_le", b[2], b[3], h)); return fact(B, A, lemma("u8_eqb_ge", b[2], b[3], h));
        }
      }
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && pairOf(a[0])) {
        const ty = pairOf(a[0]);
        hypothesis(eqAt(ty[0], part("Prod.fst", ty, a[1]), part("Prod.fst", ty, a[2])), lemma("pair_fst", ty[0], ty[1], a[1], a[2], h));
        return hypothesis(eqAt(ty[1], part("Prod.snd", ty, a[1]), part("Prod.snd", ty, a[2])), lemma("pair_snd", ty[0], ty[1], a[1], a[2], h));
      }
      fail("unsupported: this form of hypothesis");
    }
    // What the goal needs, before any searching: its inequalities are reified so that every atom is known.
    const plan = (P) => { try { return Object.assign(plan0(P), { P }); } catch (e) { return { deferred: e, P }; } };
    function plan0(P) {
      const [g, a] = spine(P);
      if (g.k === "const" && g.name === "And" && a.length === 2) return { and: [plan(a[0]), plan(a[1])], args: a };
      const c = comparison(P);
      if (c) return { cores: [c.pair], wrap: (p) => c.mpr ? lemma(c.mpr, ...c.args, p[0]) : p[0] };
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && g.us.length === 1 && g.us[0].key === u1.key && !hasFVar(P))
        return { closed: apps(E.const("Eq.refl", [u1]), a[0], a[2]) }; // the kernel evaluates both sides
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && (isType(a[0], "Int") || isType(a[0], "Nat"))) {
        const ty = a[0].name, A = intR(views[ty](a[1])), B = intR(views[ty](a[2]));
        return { cores: [[A, B], [B, A]], wrap: (p) => lemma(ty === "Int" ? "eq_of_le_le" : "nat_eq_of", a[1], a[2], p[0], p[1]) };
      }
      if (g.k === "const" && g.name === "Eq" && a.length === 3 && pairOf(a[0])) {
        const ty = pairOf(a[0]);
        return { parts: [plan(eqAt(ty[0], part("Prod.fst", ty, a[1]), part("Prod.fst", ty, a[2]))), plan(eqAt(ty[1], part("Prod.snd", ty, a[1]), part("Prod.snd", ty, a[2])))], join: (x, y) => lemma("pair_ext", ty[0], ty[1], a[1], a[2], x, y) };
      }
      fail("unsupported: this form of goal");
    }
    const hyps = [];
    const propHeads = ["Eq", "LE.le", "LT.lt", "And", "Or", "Not", "Iff"];
    for (const fv of fvs) if (!dataType(fv.type)) {
      const head = spine(fv.type)[0];
      if (!(head.k === "const" && propHeads.includes(head.name))) continue;
      hyps.push(fv); hypothesis(fv.type, fv);
    }
    const goalPlan = plan(body);
    const signSites = [...sites.values()].filter((s) => !s.nat);

    // ----- search: conditionals taken both ways; a goal without one refuted over the integers -----
    const addTo = (m, k, x) => { const y = (m.get(k) || 0n) + x; if (y === 0n) m.delete(k); else m.set(k, y); };
    const lin = (e, scale = 1n, into = new Map()) => {
      if (e.op === "var") addTo(into, e.i, scale); else if (e.op === "lit") addTo(into, -1, scale * e.n);
      else if (e.op === "ite") fail("unsupported: a conditional inside a hypothesis");
      else if (e.op === "mul") lin(e.b, scale * e.k, into); else if (e.op === "mulr") lin(e.a, scale * e.k, into); else if (e.op === "neg") lin(e.a, -scale, into);
      else { lin(e.a, scale, into); lin(e.b, e.op === "add" ? scale : -scale, into); }
      return into; };
    const gap = ([a, b]) => lin(a, -1n, lin(b));
    const combine = (p, a, q, b) => { const m = new Map(); for (const [k, x] of p) addTo(m, k, a * x); for (const [k, x] of q) addTo(m, k, b * x); return m; };
    // Rows read 0 <= row. Row 0 denies the goal; rows 1..H are the hypotheses. Fourier-Motzkin with each new row
    // divided by the gcd of its coefficients and its constant rounded down: that rounding is what makes it integer.
    function leaf(hs, g) {
      if (th.cert) return th.cert; // a control: a certificate given from outside, right or wrong
      const H = hs.length, steps = [];
      const tighten = (row) => {
        let d = 0n; for (const [x, c] of row.v) if (x >= 0) d = gcd(d, abs(c));
        if (d <= 1n) return row;
        const v = new Map(); for (const [x, c] of row.v) { const y = x >= 0 ? c / d : floorDiv(c, d); if (y !== 0n) v.set(x, y); }
        steps.push({ mult: row.mult, g: d });
        return { v, mult: new Map([[H + steps.length, 1n]]) };
      };
      const deny = combine(gap(g), -1n, new Map(), 0n); addTo(deny, -1, -1n);
      let rows = [{ v: deny, mult: new Map([[0, 1n]]) }, ...hs.map((h, i) => ({ v: gap(h), mult: new Map([[i + 1, 1n]]) }))].map(tighten);
      const refuted = (r) => [...r.v.keys()].every((x) => x < 0) && (r.v.get(-1) || 0n) < 0n;
      const hasVar = (r) => [...r.v.keys()].some((x) => x >= 0);
      // Equalities first. An equality is two opposite rows; where one of its variables has coefficient 1 or -1, that
      // variable is substituted away exactly. Projecting it out instead would forget that the others are integers.
      const sig = (v, sign) => [...v].map(([x, c]) => x + ":" + (sign * c)).sort().join(",");
      for (let again = true; again; ) {
        again = false;
        const seen = new Map(rows.map((r, i) => [sig(r.v, 1n), i]));
        for (let i = 0; i < rows.length && !again; i++) {
          const j = seen.get(sig(rows[i].v, -1n));
          if (j === undefined || j === i) continue;
          const unit = [...rows[i].v].find(([x, c]) => x >= 0 && abs(c) === 1n);
          if (!unit) continue;
          const [x, c] = unit, plus = c === 1n ? rows[i] : rows[j], minus = c === 1n ? rows[j] : rows[i]; // plus has +x
          rows = rows.filter((r, n) => n !== i && n !== j).map((r) => { const d = r.v.get(x) || 0n;
            return d === 0n ? r : tighten({ v: combine(r.v, 1n, d > 0n ? minus.v : plus.v, abs(d)), mult: combine(r.mult, 1n, d > 0n ? minus.mult : plus.mult, abs(d)) }); });
          again = true;
        }
      }
      let hit = rows.find(refuted);
      rows = rows.filter(hasVar);
      while (!hit) {
        const count = new Map();
        for (const r of rows) for (const [x, c] of r.v) if (x >= 0) { const e = count.get(x) || [0, 0, true, true]; e[c > 0n ? 0 : 1]++; if (c > 1n) e[2] = false; if (c < -1n) e[3] = false; count.set(x, e); }
        if (!count.size) break;
        let x = -1, best = Infinity;
        for (const [y, [p, q, unitUp, unitDown]] of count) { const cost = p * q - p - q + (unitUp || unitDown ? 0 : 1e6); if (cost < best) { best = cost; x = y; } }
        const pos = [], neg = [], next = [];
        for (const r of rows) { const c = r.v.get(x) || 0n; (c > 0n ? pos : c < 0n ? neg : next).push(r); }
        for (const p of pos) for (const q of neg) { const a = p.v.get(x), b = -q.v.get(x);
          const row = tighten({ v: combine(p.v, b, q.v, a), mult: combine(p.mult, b, q.mult, a) });
          if (refuted(row)) hit = hit || row; else if ([...row.v.keys()].some((y) => y >= 0)) next.push(row); }
        rows = next;
        if (rows.length > 20000) fail("the search grew too large");
      }
      if (!hit) fail("no certificate found");
      // Keep only the cuts the refutation uses, and write multipliers in the order the checker holds its rows:
      // newest cut first, then the denied goal, then the hypotheses.
      const used = new Set(), mark = (mult) => { for (const id of mult.keys()) if (id > H && !used.has(id)) { used.add(id); mark(steps[id - H - 1].mult); } };
      mark(hit.mult);
      const kept = steps.map((s, j) => ({ ...s, id: H + 1 + j })).filter((s) => used.has(s.id)), rank = new Map(kept.map((s, j) => [s.id, j]));
      const dense = (mult, t) => { const out = []; for (const [id, k] of mult) { const pos = id > H ? t - 1 - rank.get(id) : t + id; while (out.length <= pos) out.push(0n); out[pos] = k; } return out; };
      const usedRows = new Set(); for (const m of [hit.mult, ...kept.map((s) => s.mult)]) for (const id of m.keys()) if (id >= 1 && id <= H) usedRows.add(hs[id - 1]);
      return { steps: kept.map((s, j) => ({ ks: dense(s.mult, j), g: s.g })), fin: dense(hit.mult, kept.length), usedRows };
    }
    function search(hs, g) {
      const c = pairFirst(g);
      if (!c) return { leaf: leaf(hs, g) };
      return { t: search([[R.add(c[0], R.k(1n)), c[1]], ...hs], pairResolve(true, g)), f: search([[c[1], c[0]], ...hs], pairResolve(false, g)) };
    }

    // ----- terms -----
    const pairT = apps(E.const("Prod", [L.zero, L.zero]), ExprT(), ExprT()), natList = E.app(E.const("List", [L.zero]), NatT()), stepT = apps(E.const("Prod", [L.zero, L.zero]), natList, NatT());
    const nats = (ks) => list(NatT(), ks.map((k) => E.nat(k)));
    const quoteCert = (c) => c.leaf
      ? apps(c0(RX + "Cert.leaf"), list(stepT, c.leaf.steps.map((s) => apps(E.const("Prod.mk", [L.zero, L.zero]), natList, NatT(), nats(s.ks), E.nat(s.g)))), nats(c.leaf.fin))
      : apps(c0(RX + "Cert.split"), quoteCert(c.t), quoteCert(c.f));
    const tree = (xs) => { if (!xs.length) return c0(RX + "Env.leaf"); const rest = xs.slice(1); return apps(c0(RX + "Env.node"), tree(rest.filter((_, i) => i % 2 === 0)), xs[0], tree(rest.filter((_, i) => i % 2 === 1))); };
    const rho = tree(atoms);
    const denote = (e) => apps(c0(RX + "Expr.denote"), rho, quote(e));
    // One inequality from the facts in hand. If no certificate is found, the sign of a dividend is taken both ways.
    function core(pair, known, unsplit) {
      let cert;
      try {
        cert = search(known.map((f) => f.pair), pair);
        if (!th.cert) { // keep only the facts some leaf used, then search once more over those
          const used = new Set(), walk = (c) => c.leaf ? c.leaf.usedRows.forEach((p) => used.add(p)) : (walk(c.t), walk(c.f)); walk(cert);
          const fewer = known.filter((f) => used.has(f.pair));
          if (fewer.length < known.length) { known = fewer; cert = search(known.map((f) => f.pair), pair); }
        }
      }
      catch (e) {
        if (!unsplit.length || th.cert) throw e;
        const [s, ...rest] = unsplit, zero = T.lit(0n), P = T.le(zero, s.e), N = T.le(s.e, zero), hp = E.fvar("h", P), hn = E.fvar("h", N);
        const pos = core(pair, [...known, { pair: [R.k(0n), s.E], proof: hp }, { pair: [R.k(0n), s.r], proof: lemma("rem_nonneg", s.e, s.kTerm, hp) }], rest);
        const neg = core(pair, [...known, { pair: [s.E, R.k(0n)], proof: hn }, { pair: [s.r, R.k(0n)], proof: lemma("rem_nonpos", s.e, s.kTerm, hn) }], rest);
        return apps(c0("Or.elim"), P, N, T.le(denote(pair[0]), denote(pair[1])), lemma("sign_cases", s.e), E.lam("h", P, abstract(pos, hp)), E.lam("h", N, abstract(neg, hn)));
      }
      return apps(c0(RX + "soundT"), quoteCert(cert), list(pairT, known.map((f) => quotePair(f.pair))), quotePair(pair), rho, yes(), ...known.map((f) => f.proof));
    }
    function fusion(P, why) {
      const found = new Map(), lens = new Map(); // list variable -> its fold terms, its length terms
      map(P, (n, d) => {
        if (d > 0 || n.k !== "app") return null;
        const fo = asFold(n);
        if (fo && fo.xs.k === "fvar") { if (!found.has(fo.xs)) found.set(fo.xs, new Map()); found.get(fo.xs).set(n, fo); return n; } // not inside it
        const [h, a] = spine(n);
        if (h.k === "const" && h.name === "List.length" && a.length === 2 && a[1].k === "fvar") { lens.set(a[1], n); return n; }
        return null;
      });
      const best = [...found].sort((x, y) => y[1].size - x[1].size)[0];
      if (!best) throw why;
      const [list, sitesHere] = best, terms = [...sitesHere.keys()], fos = [...sitesHere.values()], len = lens.get(list), n = terms.length;
      const name = { "1": "fold_rel1", "2": "fold_rel2", "3": "fold_rel3", "1n": "fold_rel1_len", "2n": "fold_rel2_len" }[n + (len ? "n" : "")];
      if (!name) throw why;
      const svs = fos.map((fo, i) => E.fvar("s" + (i + 1), fo.acc)), nv = E.fvar("n", NatC()), x = E.fvar("x", fos[0].elem);
      const put = (accs, count) => map(P, (node, d) => { if (d > 0) return null; const i = terms.indexOf(node); return i >= 0 ? accs[i] : len && node === len ? count : null; });
      const vars = len ? [...svs, nv] : svs;
      const step = sub(forall([...vars, x], E.pi("h", put(svs, nv), put(fos.map((fo, i) => apps(fo.f, svs[i], x)), natAdd(nv, natLit(1n))))));
      const init = sub(put(fos.map((fo) => fo.z), natLit(0n)));
      return lemma(name, fos[0].elem, ...fos.map((fo) => fo.acc), ...fos.map((fo) => fo.f), lambda(vars, put(svs, nv)), step, list, ...fos.map((fo) => fo.z), init);
    }
    const build = (p) => {
      if (p.closed) return p.closed;
      if (p.and) return apps(c0("And.intro"), p.args[0], p.args[1], build(p.and[0]), build(p.and[1]));
      if (p.deferred) return fusion(p.P, p.deferred);
      if (p.parts) return p.join(build(p.parts[0]), build(p.parts[1]));
      try { return p.wrap(p.cores.map((c) => core(c, facts, signSites))); } catch (e) { if (th.cert) throw e; return fusion(p.P, e); }
    };
    const proof = build(goalPlan);
    let value = under(proof, fvs.length);
    for (let i = fvs.length - 1; i >= 0; i--) value = E.lam(fvs[i].name, under(fvs[i].type, i), value);
    if (!th.sub) lib.decls.set(th.name, { levelParams: [], type: S });
    return { name: th.name, type: S, value };
  }
  // The statement is LexLean's to state. Where the library carries it (as `LexStmt.<name>`, the statement Lean
  // elaborated), it is taken from there; otherwise it is written here from the text, for the integer fragment.
  function linear(th) {
    const given = lib.decls.get("LexStmt." + th.name);
    return compile(th, given && given.value ? given.value : statementFromText(th));
  }

  function closeOver(th, locals, type, value) {
    // Binder i becomes de Bruijn index (count - 1 - i) at the body, one pass for all of them.
    const fvs = th.binders.map(([x]) => locals.get(x)), pos = new Map(fvs.map((fv, i) => [fv, i]));
    const under = (e, count) => map(e, (n, d) => n.k === "fvar" && pos.has(n) && pos.get(n) < count ? E.bvar(d + count - 1 - pos.get(n)) : null);
    type = under(type, fvs.length); value = under(value, fvs.length);
    for (let i = fvs.length - 1; i >= 0; i--) {
      const ty = under(fvs[i].type, i);
      type = E.pi(fvs[i].name, ty, type); value = E.lam(fvs[i].name, ty, value);
    }
    lib.decls.set(th.name, { levelParams: [], type });
    return { name: th.name, type, value };
  }

  function theorem(th) {
    // LexLean lowers its linear_arithmetic form to a fixed script that ends in `all_goals omega`.
    const last = th.script[th.script.length - 1];
    if (lib.decls.has("LexStmt." + th.name) || (last && (last.kind === "linear_arithmetic" || last.kind === "all_goals"))) return linear(th);
    const locals = new Map();
    for (const [x, ty] of th.binders) locals.set(x, E.fvar(x, inst(elab(ty, locals))));
    const statement = inst(elab(th.type, locals));
    const root = E.mvar(statement);
    const goals = [root];
    const close = (g, proof) => eassign.set(g.id, proof);
    for (const tac of th.script) {
      const g = goals.shift() || fail("no goal left");
      const G = inst(g.type);
      if (tac.kind === "rfl") {
        const eq = asEq(G) || fail("rfl: the goal is not an equation");
        close(g, full("Eq.refl", [eq.T, eq.a]));
      } else if (tac.kind === "exact") {
        const p = elab(tac.term, locals);
        try { unify(infer(p), G); } catch { /* the kernel decides */ }
        close(g, p);
      } else if (tac.kind === "constructor") {
        const A = G.fn && G.fn.arg, B = G.arg, c = G.fn && G.fn.fn;
        if (!c || c.name !== "And") fail("unsupported: constructor on a goal that is not And");
        const ga = E.mvar(A), gb = E.mvar(B);
        close(g, full("And.intro", [A, B, ga, gb])); goals.unshift(ga, gb);
      } else if (tac.kind === "rw") {
        let cur = g, curG = G;
        for (const rule of tac.rules) {
          let h = inst(elab(rule.term, locals));
          let { T, a: l, b: r } = asEq(beta(inst(infer(h)))) || fail("rw: the rule is not an equation");
          if (rule.rev) { h = inst(full("Eq.symm", [T, l, r, h])); [l, r] = [r, l]; }
          const body = abstract(curG, l);
          if (body === curG) fail("rw: the pattern does not occur");
          const next = instantiate(body, r), ng = E.mvar(next);
          const step = full("congrArg", [T, Prop(), l, r, E.lam("_a", T, body), h]);
          close(cur, full("Eq.mpr", [curG, next, step, ng]));
          cur = ng; curG = next;
        }
        const eq = asEq(curG);
        if (eq && eq.a === eq.b) close(cur, full("Eq.refl", [eq.T, eq.a])); else goals.unshift(cur);
      } else fail(`unsupported proof form: ${tac.kind}`);
    }
    if (goals.length) fail("goals remain");
    return closeOver(th, locals, statement, inst(root));
  }

  // ---------- writing lines that continue the library's file ----------
  const out = [];
  let nIn = lib.maxIn, nIl = lib.maxIl, nIe = lib.maxIe;
  // The parsed library is read-only while writing: each emitter keeps its own overlay of what it adds.
  const newName = new Map(), newLevel = new Map(), newExpr = new Map();
  function nameIx(full) {
    if (lib.nameIx.has(full)) return lib.nameIx.get(full);
    if (newName.has(full)) return newName.get(full);
    const cut = full.lastIndexOf("."), pre = cut < 0 ? 0 : nameIx(full.slice(0, cut)), ix = ++nIn;
    out.push(JSON.stringify({ in: ix, str: { pre, str: full.slice(cut + 1) } })); newName.set(full, ix); return ix;
  }
  function levelIx(l) {
    if (lib.levelIx.has(l.key)) return lib.levelIx.get(l.key);
    if (newLevel.has(l.key)) return newLevel.get(l.key);
    if (l.k === "lmvar") fail("an unsolved universe level");
    const o = l.k === "succ" ? { succ: levelIx(l.l) } : l.k === "max" ? { max: [levelIx(l.a), levelIx(l.b)] } : l.k === "imax" ? { imax: [levelIx(l.a), levelIx(l.b)] } : { param: nameIx(l.name) };
    const ix = ++nIl; out.push(JSON.stringify({ il: ix, ...o })); newLevel.set(l.key, ix); return ix;
  }
  function exprIx(e) {
    if (lib.exprIx.has(e.key)) return lib.exprIx.get(e.key);
    if (newExpr.has(e)) return newExpr.get(e);
    let o;
    switch (e.k) {
      case "bvar": o = { bvar: e.i }; break;
      case "sort": o = { sort: levelIx(e.l) }; break;
      case "const": o = { const: { name: nameIx(e.name), us: e.us.map(levelIx) } }; break;
      case "app": o = { app: { fn: exprIx(e.fn), arg: exprIx(e.arg) } }; break;
      case "lam": o = { lam: { name: nameIx(e.name), type: exprIx(e.type), body: exprIx(e.body), binderInfo: e.bi } }; break;
      case "pi": o = { forallE: { name: nameIx(e.name), type: exprIx(e.type), body: exprIx(e.body), binderInfo: e.bi } }; break;
      case "nat": o = { natVal: String(e.n) }; break;
      default: fail(`cannot write ${e.k}: an unsolved goal or a local escaped`);
    }
    const ix = ++nIe; out.push(JSON.stringify({ ie: ix, ...o })); newExpr.set(e, ix); return ix;
  }
  function write(t) {
    const name = nameIx(t.name), type = exprIx(t.type), value = exprIx(t.value);
    out.push(JSON.stringify({ thm: { all: [name], levelParams: [], name, type, value } }));
  }
  // A declaration's content, independent of its name, of binder names, and of where it sits in a file:
  // library terms by their index (fixed by the library's address), everything else by local number.
  function canon(t) {
    const local = new Map(), nodes = [];
    const go = (e) => {
      const li = lib.exprIx.get(e.key); if (li !== undefined) return "L" + li;
      if (local.has(e)) return local.get(e);
      let r;
      switch (e.k) {
        case "bvar": r = ["b", e.i]; break;
        case "sort": r = ["s", e.l.key]; break;
        case "const": r = ["c", e.name, e.us.map((u) => u.key)]; break;
        case "app": r = ["a", go(e.fn), go(e.arg)]; break;
        case "lam": r = ["l", e.bi, go(e.type), go(e.body)]; break;
        case "pi": r = ["p", e.bi, go(e.type), go(e.body)]; break;
        case "nat": r = ["n", e.n]; break;
        default: fail("cannot address " + e.k);
      }
      nodes.push(r); local.set(e, nodes.length - 1); return nodes.length - 1;
    };
    return { type: go(t.type), value: go(t.value), nodes };
  }
  // A proof that came from elsewhere is only as good as its statement. This declares, for a theorem `name` already
  // in the file, `LexBind.name : LexStmt.name := name`: the kernel accepts it only if the theorem's type is the
  // statement expected.
  function bind(name) {
    if (!lib.decls.has(name)) fail(`${name} is not in the pack`);
    if (!lib.decls.has("LexStmt." + name)) fail(`no statement is known for ${name}`);
    return { name: "LexBind." + name, type: E.const("LexStmt." + name, []), value: E.const(name, []) };
  }
  return { theorem, write, canon, bind, lines: () => out.join("\n") + "\n" };
}

// ---------- reading the generated Lean ----------
function term(src) {
  const toks = src.match(/[()\[\],]|←|[^\s()\[\],←]+/g) || [];
  let i = 0;
  const atom = () => { const t = toks[i++]; if (t !== "(") return t; const inner = app(); i++; return inner; };
  const app = () => { const xs = []; while (i < toks.length && toks[i] !== ")") xs.push(atom()); return xs.length === 1 && !Array.isArray(xs[0]) ? [xs[0]] : xs.length === 1 ? xs[0] : xs; };
  return app();
}
export function readModule(text) {
  const ns = /^namespace (\S+)/m.exec(text)[1];
  const theorems = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:public )?theorem (\S+) (.*) := by$/.exec(lines[i]);
    if (!m) continue;
    let sig = m[2]; const binders = [];
    for (let b; (b = /^\((\S+) : ([^()]+)\) /.exec(sig)); sig = sig.slice(b[0].length)) binders.push([b[1], term(b[2])]);
    const script = [], body = [];
    for (i++; i < lines.length && lines[i].startsWith("  "); i++) {
      const l = lines[i].trim(); body.push(l);
      if (l === "rfl" || l === "constructor") script.push({ kind: l });
      else if (l.startsWith("exact ")) script.push({ kind: "exact", term: term(l.slice(6)) });
      else if (l.startsWith("rw [")) script.push({ kind: "rw", rules: l.slice(4, -1).split(", ").map((r) => ({ rev: r.startsWith("←"), term: term(r.replace(/^←\s*/, "")) })) });
      else script.push({ kind: l.split(" ")[0] });
    }
    const raw = sig.replace(/^: /, "");
    // `text` is everything that decides the proof except the theorem's own name.
    theorems.push({ name: `${ns}.${m[1]}`, ns, text: m[2] + "\n" + body.join("\n"), binders, raw, get type() { return term(raw); }, script });
  }
  return theorems;
}

/** A theorem record that crossed a thread boundary lost its lazy `type`; this puts it back. */
export function revive(th) { return Object.defineProperty(th, "type", { get() { return term(th.raw); }, configurable: true }); }
