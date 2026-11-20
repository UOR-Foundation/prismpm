// node test/test.mjs      (npm test)
// One run that checks the whole thing: what is proved, what must be refused, and that nothing is judged twice.
import fs from "node:fs";
import zlib from "node:zlib";
import os from "node:os";
import path from "node:path";
import { open, verified } from "../src/node.mjs";
import { openShared } from "../src/shared.mjs";
import { root, read, kernel, loadLibrary, emitter, readModule, declaredAxioms } from "./harness.mjs";

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) failures++; };
const section = (s) => console.log(`\n${s}`);
const EX = "examples/fold-laws", MODULES = ["Kernels.lean.txt", "Folds.lean.txt", "Main.lean.txt"];
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `lexlean-${name}-`));

// ---------- the emitter and the kernel, directly ----------
section("Proofs found with no Lean running, judged by Lean's kernel");
const k = await kernel();
const emitAll = (text, change) => { const em = emitter(loadLibrary(k.libraryText)), done = [], skipped = []; for (const th of readModule(text)) { if (change) change(th); try { em.write(em.theorem(th)); done.push(th.name); } catch (e) { skipped.push([th.name, e.message]); } } return { suffix: em.lines(), done, skipped }; };
{
  const a = emitAll(read("test/fixtures/Addition.lean.txt")), v = k.judge(a.suffix);
  check(a.done.length === 8 && v.exit === 0, `direct forms (rfl, exact, constructor, rw): ${a.done.length} of 8 emitted, kernel ${v.exit === 0 ? "accepts" : "refuses: " + v.last}`);
  const f = emitAll(read("test/fixtures/Addition.lean.txt").replace("Eq (Nat.add llv0 0) llv0 := by\n  rfl", "Eq (Nat.add llv0 0) (Nat.succ llv0) := by\n  rfl"));
  check(k.judge(f.suffix).exit !== 0, "a false statement with the same script is refused by the kernel");
}
{
  const l = emitAll(read("test/fixtures/Linear.lean.txt")), v = k.judge(l.suffix);
  check(l.done.length === 8 && v.exit === 0, `linear arithmetic, statements written from text: ${l.done.length} of 8 emitted, kernel ${v.exit === 0 ? "accepts" : "refuses: " + v.last}`);
  const falseText = read("test/fixtures/Linear.lean.txt").replace("((x <= y) -> ((y <= z) -> (x <= z)))", "((x <= y) -> ((y <= z) -> (z <= x)))");
  const honest = emitAll(falseText).skipped.find(([n]) => n === "Linear.transitive");
  check(honest && /no certificate/.test(honest[1]), "a false inequality finds no certificate");
  const forged = emitAll(falseText, (th) => { if (th.name === "Linear.transitive") th.cert = { steps: [], fin: [1n, 1n, 1n] }; });
  check(forged.done.includes("Linear.transitive") && k.judge(forged.suffix).exit !== 0, "a false inequality with a forged certificate is refused by the kernel");
  const wrong = emitAll(read("test/fixtures/Linear.lean.txt"), (th) => { if (th.name === "Linear.transitive") th.cert = { steps: [], fin: [1n, 1n] }; });
  check(k.judge(wrong.suffix).exit !== 0, "a true inequality with a wrong certificate is refused by the kernel");
}
{
  const declared = declaredAxioms(read(`${EX}/axioms.txt`)), em = emitter(loadLibrary(k.libraryText)); let n = 0, all = 0;
  for (const f of MODULES) for (const th of readModule(read(`${EX}/${f}`))) { all++; try { em.write(em.theorem(th)); n++; } catch {} }
  const v = k.judge(em.lines()), ax = k.axioms(v.out), same = [...ax].filter(([name, a]) => a.join() === (declared.get(name) || []).join()).length;
  check(n === all && v.exit === 0, `fold-laws: a proof is found here for ${n} of ${all} theorems, kernel ${v.exit === 0 ? "accepts all" : "refuses: " + v.last}`);
  check(same === 29, `${same} of them rest on exactly the axioms of Lean's own proof (the others must fall back)`);
}
{
  // A Prism app: a loan approval's three guarantees, Boolean statements over a record with an if-chain inside.
  const LX = "examples/loan-approval", declared = declaredAxioms(read(`${LX}/axioms.txt`)), text = read(`${LX}/LoanApprovalProofs.lean.txt`);
  const em = emitter(loadLibrary(k.libraryText)); let n = 0, all = 0;
  for (const th of readModule(text)) { all++; try { em.write(em.theorem(th)); n++; } catch {} }
  const v = k.judge(em.lines()), ax = k.axioms(v.out), same = [...ax].filter(([name, a]) => a.join() === (declared.get(name) || []).join()).length;
  check(all === 3 && n === 3 && v.exit === 0 && same === 3, `a Prism loan approval app: ${n} of ${all} guarantees proved here with no elaborator, kernel ${v.exit === 0 ? "accepts" : "refuses: " + v.last}, ${same} on exactly the declared axioms`);
  const forged = emitter(loadLibrary(k.libraryText)), th = readModule(text)[0];
  th.cert = { steps: [], fin: [1n, 1n] };
  let refused = false; try { forged.write(forged.theorem(th)); refused = k.judge(forged.lines()).exit !== 0; } catch { refused = true; }
  check(refused, "a loan guarantee with a forged certificate is refused");
}
{
  const packText = read(`${EX}/proofs.ndjson`), names = read(`${EX}/fallback.txt`).split("\n").filter(Boolean);
  const lib = loadLibrary(k.libraryText + packText), em = emitter(lib), t = em.bind(names[0]);
  em.write({ name: t.name, type: em.bind(names[1]).type, value: t.value });
  check(k.judge(packText + em.lines()).exit !== 0, "Lean's proof of one theorem, offered for another's statement, is refused");
  const i = packText.lastIndexOf('"natVal":"'), j = packText.indexOf('"', i + 10), altered = packText.slice(0, i + 10) + (BigInt(packText.slice(i + 10, j)) + 1n) + packText.slice(j);
  check(k.judge(altered).exit !== 0, "Lean's proof with one number altered is refused");
}

// ---------- the prover ----------
section("The prover: full coverage, and nothing judged twice");
const dir = tmp("store"), proofs = path.join(root, EX, "proofs.json");
{
  const p = await open({ storeDir: dir, proofs, kernels: 4 }); let sum = { theorems: 0, proved: 0, found: 0, published: 0, reused: 0, failed: 0 }; const t = performance.now();
  for (const f of MODULES) { const r = await p.prove(read(`${EX}/${f}`)); for (const key of ["theorems", "proved", "found", "published", "reused"]) sum[key] += r[key]; sum.failed += r.failed.length; }
  const ms = performance.now() - t;
  check(sum.theorems === 31 && sum.proved === 31 && sum.failed === 0, `fold-laws, first time: ${sum.proved} of ${sum.theorems} proved in ${ms.toFixed(0)} ms (found here ${sum.found}, Lean's published proof ${sum.published})`);
  check(sum.found === 29 && sum.published === 2, "29 found here on the declared axioms, 2 by Lean's own proof");
  await p.close();
}
{
  const p = await open({ storeDir: dir, proofs, kernels: 4 }); let reused = 0; const t = performance.now();
  for (const f of MODULES) reused += (await p.prove(read(`${EX}/${f}`))).reused;
  check(reused === 31 && p.kernels() === 0, `a new session on the same store: ${reused} of 31 found by label in ${(performance.now() - t).toFixed(1)} ms, ${p.kernels()} kernels started`);
  await p.close();
}
{
  const head = fs.readFileSync(path.join(dir, "lexlean-memo-head"), "utf8"), file = path.join(dir, head.replace(":", "_")), b = fs.readFileSync(file);
  b[20] ^= 1; fs.writeFileSync(file, b);
  const p = await open({ storeDir: dir, proofs, kernels: 2 }), r = await p.prove(read(`${EX}/Folds.lean.txt`));
  check(/label/.test(p.memo.refused || "") && r.reused === 0 && r.proved === 9, "a memo segment altered on disk is refused, and the module is judged again");
  await p.close();
}
{
  const p = await open({ kernels: 2 });
  const r = await p.prove(read(`${EX}/Kernels.lean.txt`).replace("theorem requantize_low (x : Int) : ((0 : Int) <= requantize (x))", "theorem requantize_low_false (x : Int) : ((1 : Int) <= requantize (x))"));
  check(r.failed.length === 1 && r.failed[0].name.endsWith("requantize_low_false") && r.proved === 15, `one false theorem among 16 fails alone: "${r.failed[0] && r.failed[0].why}"`);
  await p.close();
  // The declared axioms, but no published proofs to fall back on.
  const bare = path.join(tmp("index"), "proofs.json");
  fs.writeFileSync(bare, JSON.stringify({ packs: [], axioms: JSON.parse(read(`${EX}/proofs.json`)).axioms }));
  const p2 = await open({ kernels: 2, proofs: bare }), r2 = await p2.prove(read(`${EX}/Main.lean.txt`));
  check(r2.failed.length === 2 && r2.failed.every((f) => /declared/.test(f.why)), "with no published proof to fall back on, a proof found on other axioms than declared is not accepted");
  await p2.close();
}
{
  const copy = tmp("pin"); fs.cpSync(root, copy, { recursive: true, filter: (s) => !/node_modules|\.git$|test[\\/]reports/.test(s) });
  fs.appendFileSync(path.join(copy, "src/emit.mjs"), "\n// altered\n");
  let refused = ""; try { verified(copy); } catch (e) { refused = e.message; }
  check(/refused src\/emit\.mjs/.test(refused), "a pinned file altered on disk is refused before anything runs");
  fs.rmSync(copy, { recursive: true, force: true });
}

// ---------- one prover for every build and every tab ----------
section("One prover serves every build and every tab");
{
  // Web Locks as a browser gives them, for one origin: one holder per name, the rest wait in order.
  const held = new Map(), locks = { request: (name, a, b) => { const opts = b ? a : {}, cb = b || a; return new Promise((done) => {
    const run = () => { held.set(name, held.get(name) || []); Promise.resolve(cb({ name })).then(() => { const next = held.get(name).shift(); if (next) next(); else held.delete(name); }).then(done); };
    if (!held.has(name)) run(); else if (opts.ifAvailable) Promise.resolve(cb(null)).then(done); else held.get(name).push(run); }); } };
  const text = read(`${EX}/Kernels.lean.txt`), sdir = tmp("shared"); let opened = 0;
  const tab = () => openShared({ env: "test-env", locks, open: () => { opened++; return open({ storeDir: sdir, proofs, kernels: 2, idleMs: 300 }); } });
  const a = await tab(), b = await tab(), c = await tab();
  const [rb, rc, ra] = await Promise.all([b.prove(text), c.prove(text), a.prove(text)]);
  check(a.role() === "owner" && b.role() === "client" && c.role() === "client" && opened === 1, `three tabs, one prover opened: roles ${a.role()}, ${b.role()}, ${c.role()}`);
  check(rb.proved === 16 && rc.proved === 16 && ra.proved === 16 && rb.shared && (await b.kernels()) === 0 && (await c.kernels()) === 0, `two builds in other tabs are answered by the owner (${rb.proved} of ${rb.theorems} each), and start no kernel of their own`);
  check(ra.found + rb.found + rc.found === 3 * ra.found && ra.found > 0 && ra.ms === rb.ms, "the same module asked for three times at once is judged once");
  await new Promise((r) => setTimeout(r, 700));
  check((await a.kernels()) === 0, "kernels with nothing to do are let go");
  const again = await b.prove(read(`${EX}/Folds.lean.txt`));
  check(again.proved === 9 && !again.libraryJudgedMs, `the next build starts them again without judging the library a second time (${again.ms.toFixed(0)} ms)`);
  await a.close(); await new Promise((r) => setTimeout(r, 50));
  const after = await c.prove(read(`${EX}/Main.lean.txt`));
  check([b.role(), c.role()].filter((x) => x === "owner").length === 1 && after.proved === 6 && opened === 2, `the owner's tab closes: another tab takes over and answers (${after.proved} of ${after.theorems})`);
  await b.close(); await c.close(); fs.rmSync(sdir, { recursive: true, force: true });
}

// ---------- throughput ----------
section("Throughput");
{
  const shapes = [(i) => [["x", "y", "z"], `((x <= y) -> ((y <= z) -> (x + (${i} : Int) <= z + (${i + 1} : Int))))`], (i) => [["x"], `(requantize (x) <= (${255 + i} : Int))`], (i) => [["a", "b", "c", "d"], `((a <= b) -> ((b <= c) -> ((c <= d) -> ((3 : Int) * a <= b + c + d + (${i} : Int)))))`]];
  const n = Number(process.env.N || 3000), text = "namespace FoldLaws.Kernels\n\n" + Array.from({ length: n }, (_, i) => { const [vs, s] = shapes[i % 3](i); return `theorem t${i} ${vs.map((v) => `(${v} : Int)`).join(" ")} : ${s} := by\n  linear_arithmetic\n`; }).join("\n");
  const p = await open({ kernels: Math.max(1, Math.min(8, os.cpus().length - 2)) });
  const a = await p.prove(text), b = await p.prove(text), c = await p.prove(text.replace("(x + (0 : Int) <= z + (1 : Int))", "(x + (0 : Int) <= z + (2 : Int))"));
  check(a.proved === n && a.found === n, `${n} theorems, first time: ${a.ms.toFixed(0)} ms on ${a.kernels} kernels (${Math.round(n / (a.ms / 1000))} a second, library judged once in ${(a.libraryJudgedMs || 0).toFixed(0)} ms)`);
  check(b.reused === n, `same module again: ${b.ms.toFixed(1)} ms, nothing judged`);
  check(c.reused === n - 1 && c.found === 1, `one theorem edited: ${c.ms.toFixed(0)} ms, one judged`);
  await p.close();
}
fs.rmSync(dir, { recursive: true, force: true });

// ---------- every constant the proof finder and the lowering write by name is in the base library ----------
// A term citing a constant the library does not hold is refused by the kernel as an unknown constant, so a theorem
// that needs it is never proved. Init's Bool.or_eq_true was such a constant, and no statement using `||` was proved.
section("The base library holds every constant written by name");
{
  // The base library: the only one the kernel path loads (library/base.sh), not the fold-laws one above.
  const base = zlib.gunzipSync(fs.readFileSync(path.join(root, "library/base.ndjson.gz"))).toString();
  const lib = loadLibrary(base), cited = new Set();
  for (const file of ["src/emit.mjs", "src/lower.mjs"]) {
    const text = read(file);
    for (const m of text.matchAll(/(?:\bc0|E\.const)\(\s*"([A-Z][\w.]*[\w'])"/g)) cited.add(m[1]);
    for (const m of text.matchAll(/\blemma\(\s*"(\w+)"/g)) cited.add(`LexReflect.${m[1]}`);
  }
  const missing = [...cited].filter((n) => !lib.decls.has(n));
  check(cited.size > 50 && missing.length === 0, `${cited.size} constants cited by name, ${missing.length ? `missing: ${missing.join(", ")}` : "every one in the library"}`);
}
// LexLean (main, LN-13/LN-15) produces a `decide` proof of a statement over a variable, which the kernel refuses. The
// suffix used to be judged whole, so that one proof refused every theorem of the project. The fixtures are
// LexLean's own declarations of the decision-app starter with inv001Holds proved by `decide`: once true, once false.
section("A refused proof LexLean produced is set aside, and only it");
{
  const { judgeDeclarations } = await import("../src/declarations.mjs");
  const kb = await kernel("library/base.ndjson.gz");
  const fixture = (n) => {
    const dir = path.join(root, "test/fixtures/declarations", n);
    return { meta: JSON.parse(fs.readFileSync(path.join(dir, "declarations.json"), "utf8")), suffix: zlib.gunzipSync(fs.readFileSync(path.join(dir, "declarations.ndjson.gz"))).toString("utf8") };
  };
  const judgeAll = (j) => {
    const todo = j.plan.theorems.filter((t) => !t.status && !t.produced).map((t) => t.name);
    return { todo, r: todo.length ? kb.judge(j.plan.file(todo)) : { exit: 0 } };
  };
  {
    const { meta, suffix } = fixture("decide-over-variable-true");
    check(kb.judge(suffix).exit !== 0, "LexLean's suffix, judged whole, is refused (its produced decide proof does not type-check)");
    const j = judgeDeclarations(meta, suffix, kb.libraryText, kb.judge);
    check(j.setAside.size === 1 && [...j.setAside.keys()][0].endsWith(".inv001Holds") && j.declarations.exit === 0, `the produced proof alone is set aside, and the kernel accepts the rest: ${[...j.setAside.keys()].join(", ")}`);
    const { todo, r } = judgeAll(j);
    check(todo.length === 3 && r.exit === 0, `all 3 true theorems are then proved, inv001Holds by a proof found here (${todo.length} judged, kernel ${r.exit === 0 ? "accepts" : "refuses: " + r.last})`);
  }
  {
    const { meta, suffix } = fixture("decide-over-variable-false");
    const j = judgeDeclarations(meta, suffix, kb.libraryText, kb.judge);
    const inv1 = j.plan.theorems.find((t) => t.name.endsWith(".inv001Holds"));
    const { todo, r } = judgeAll(j);
    check(j.setAside.size === 1 && inv1.status?.startsWith("not proved") && todo.length === 2 && r.exit === 0, `the false theorem stays not proved, the 2 true ones are proved (${inv1.status?.slice(0, 50)})`);
  }
  {
    // A refused declaration LexLean did not produce as a proof refuses the project, exactly as before.
    const { meta, suffix } = fixture("decide-over-variable-true");
    const stub = () => ({ exit: 1, out: ["Refused: while replaying declaration 'PrismParkingFeeTier.ParkingFeeTier.judge':", "(kernel) declaration type mismatch"] });
    const j = judgeDeclarations(meta, suffix, kb.libraryText, stub);
    check(j.setAside.size === 0 && j.declarations.exit !== 0 && j.suffix === suffix, "a refused definition is never set aside: the project stays refused");
  }
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
