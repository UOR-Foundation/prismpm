// The page, run from verified bytes. It opens the store and the prover, and proves what it is given.
// One control for a person: pick or paste a module, press Prove.
// For tests, the address can ask for a run with no one pressing anything:
//   ?auto=example        the bundled example, all three modules
//   ?auto=bench&n=20000  a generated module of n theorems, then again, then with one theorem edited
//   &fresh=1             start from an empty store          &store=opfs|idb|memory   force a backend
//   &kernels=4           at most this many kernels          &alone=1   do not share a prover with other tabs
import { browser as openStore } from "../src/store.mjs";
import { openProver } from "../src/prover.mjs";
import { openShared } from "../src/shared.mjs";

const EXAMPLE = "examples/fold-laws", MODULES = ["Kernels.lean.txt", "Folds.lean.txt", "Main.lean.txt"];
const shapes = [
  (k) => [["x", "y", "z"], `((x <= y) -> ((y <= z) -> (x + (${k} : Int) <= z + (${k + 1} : Int))))`],
  (k) => [["x", "y"], `((x + (2 : Int) * y <= (${10 + k} : Int)) -> (((3 : Int) <= y) -> (x <= (${4 + k} : Int))))`],
  (k) => [["x", "y", "z"], `((x < y) -> ((y < z) -> (x + (2 : Int) <= z + (${k} : Int))))`],
  (k) => [["x"], `((${k} : Int) <= requantize (x) + (${k} : Int))`],
  (k) => [["x"], `(requantize (x) <= (${255 + k} : Int))`],
  (k) => [["a", "b", "c", "d"], `((a <= b) -> ((b <= c) -> ((c <= d) -> ((3 : Int) * a <= b + c + d + (${k} : Int)))))`],
];
const generated = (n) => "namespace FoldLaws.Kernels\n\n" + Array.from({ length: n }, (_, i) => { const [vs, s] = shapes[i % shapes.length](i); return `theorem t${i} ${vs.map((v) => `(${v} : Int)`).join(" ")} : ${s} := by\n  linear_arithmetic\n`; }).join("\n");

export async function main({ pin, root, files, need, link, holo, say, bootMs }) {
  const q = new URLSearchParams(location.search), dec = new TextDecoder();
  // A phone has fewer cores to spare and far less memory: each kernel holds about 64 to 77 MB.
  const cores = navigator.hardwareConcurrency || 4, small = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
  const kernels = Number(q.get("kernels")) || Math.max(1, Math.min(small ? 2 : 8, cores - 1));
  const text = async (p) => dec.decode(new Uint8Array(await (await fetch(new URL("../" + p, location.href), { cache: "no-store" })).arrayBuffer()));
  // Published proofs for the example. They are outside the pin and not trusted: a pack's bytes are checked against
  // its label, then the kernel judges every declaration in it.
  const index = JSON.parse(await text(`${EXAMPLE}/proofs.json`)), byTheorem = new Map();
  for (const p of index.packs) for (const n of p.theorems) byTheorem.set(n, p);
  const proofs = { byTheorem, axioms: new Map(Object.entries(index.axioms || {})), fetch: async (p) => { const b = new Uint8Array(await (await fetch(new URL(`../${EXAMPLE}/${p.file}`, location.href), { cache: "no-store" })).arrayBuffer()); if (holo.address(b) !== p.kappa) throw new Error(`refused ${p.file}: it does not match its label`); return dec.decode(b); } };
  const spawn = () => { const w = new Worker(link("src/worker.mjs"), { type: "module" }), h = { post: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null }; w.onmessage = (e) => h.onmessage && h.onmessage(e.data); w.onerror = (e) => h.onerror && h.onerror(e); return h; };
  // One prover for every tab of this origin: the tab that owns it opens the store and the kernels; the others ask it.
  const open = async () => {
    const store = await openStore(holo, q.get("store"));
    if (q.get("fresh")) await store.clear();
    // Fetched and checked when the first kernel starts, and not at all by a session the memo answers.
    const fetched = (path) => async () => { const t = performance.now(), b = await need(path); say(`${path}, ${(b.length / 1048576).toFixed(2)} MB, fetched and verified in ${(performance.now() - t).toFixed(0)} ms`); return b; };
    const p = await openProver({ env: root, library: fetched("library/library.ndjson"), kernel: fetched("kernel/lean-kernel.wasm"), hasher: files.get("hologram/hologram_store_bg.wasm"), address: holo.address, store, spawn, kernels, proofs, idleMs: q.get("idle") ? Number(q.get("idle")) : undefined });
    say(`store: ${store.kind}${store.unavailable.length ? " (not available: " + store.unavailable.join("; ") + ")" : ""}; ${p.memo.entries} remembered${p.memo.refused ? "; the store refused a segment: " + p.memo.refused : ""}`);
    return p;
  };
  const prover = await openShared(q.get("alone") ? { env: root, open, locks: null } : { env: root, open });
  globalThis.lexleanProver = prover; // for tests: role() and kernels()
  say(`ready ${(performance.now()).toFixed(0)} ms after the page started; ${prover.role() === "client" ? "served by the prover another tab owns: nothing is started here" : `this tab owns the prover; up to ${kernels} kernels`}`);
  const line = (label, r) => say(`${label}: ${r.proved} of ${r.theorems} proved in ${r.ms.toFixed(r.ms < 10 ? 1 : 0)} ms (reused ${r.reused}, found here ${r.found}, published proof ${r.published}, failed ${r.failed.length}; ${r.shared ? "judged in the owning tab; its kernels" : "kernels"} ${r.kernels}${r.libraryJudgedMs ? `; library judged here in ${r.libraryJudgedMs.toFixed(0)} ms` : ""})${r.failed.length ? " first failure: " + r.failed[0].name + ": " + r.failed[0].why : ""}`);

  // ----- the interface -----
  const app = document.getElementById("app");
  app.innerHTML = `<div class="row"><select id="pick" aria-label="Module">${MODULES.map((m) => `<option value="${m}">fold-laws / ${m.replace(".lean.txt", "")}</option>`).join("")}<option value="">paste your own</option></select><button id="go">Prove</button></div>
    <textarea id="src" spellcheck="false" aria-label="Module source"></textarea><div id="verdict" role="status"></div><div id="detail"></div>`;
  const pick = app.querySelector("#pick"), src = app.querySelector("#src"), go = app.querySelector("#go"), verdict = app.querySelector("#verdict"), detail = app.querySelector("#detail");
  const load = async () => { if (pick.value) src.value = await text(`${EXAMPLE}/${pick.value}`); };
  pick.onchange = load; await load();
  const show = (r) => {
    const ok = r.failed.length === 0 && r.theorems > 0;
    verdict.className = ok ? "ok" : "bad";
    verdict.textContent = r.theorems === 0 ? "No theorems found in this text." : ok ? `Proved: all ${r.theorems} theorems, judged by Lean's kernel.` : `${r.proved} of ${r.theorems} proved. ${r.failed.length} not proved.`;
    const how = [r.reused && `${r.reused} already judged in this browser`, r.found && `${r.found} proved here`, r.published && `${r.published} by Lean's own published proof`].filter(Boolean).join(", ");
    detail.innerHTML = `<div class="dim">${how ? how + " · " : ""}${r.ms.toFixed(r.ms < 10 ? 1 : 0)} ms</div>` + (r.failed.length ? "<ul>" + r.failed.slice(0, 50).map((f) => `<li><b>${f.name.split(".").pop()}</b>: ${f.why.replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" }[c]))}</li>`).join("") + "</ul>" : "");
  };
  go.onclick = async () => { go.disabled = true; verdict.className = ""; verdict.textContent = "Proving…"; detail.textContent = ""; try { const r = await prover.prove(src.value); show(r); line("module", r); } catch (e) { verdict.className = "bad"; verdict.textContent = "Could not run: " + e.message; } go.disabled = false; };

  // ----- unattended runs -----
  if (q.get("auto") === "example") {
    const t = performance.now(), sum = { theorems: 0, proved: 0, reused: 0, found: 0, published: 0, failed: [], ms: 0, kernels: 0 };
    for (const m of MODULES) { const r = await prover.prove(await text(`${EXAMPLE}/${m}`)); line(m, r); for (const k of ["theorems", "proved", "reused", "found", "published"]) sum[k] += r[k]; sum.failed.push(...r.failed); sum.kernels = r.kernels; if (r.libraryJudgedMs) sum.libraryJudgedMs = r.libraryJudgedMs; }
    sum.ms = performance.now() - t; line("example", sum); show(sum);
  } else if (q.get("auto") === "bench") {
    const n = Number(q.get("n") || 2000), body = generated(n);
    line(`first, ${n} theorems`, await prover.prove(body));
    line("same again", await prover.prove(body));
    line("one theorem edited", await prover.prove(body.replace("(x + (0 : Int) <= z + (1 : Int))", "(x + (0 : Int) <= z + (2 : Int))")));
    const r = await prover.prove(body.replace("theorem t7 (x : Int) (y : Int) : ((x + (2 : Int) * y", "theorem t7 (x : Int) (y : Int) : ((x + (1 : Int) * y"));
    line("one theorem made false", r); show(r);
  }
  try { const est = await navigator.storage.estimate(); say(`origin storage in use: ${(est.usage / 1048576).toFixed(1)} MB`); } catch {}
}
