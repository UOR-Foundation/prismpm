// A test, not part of the prover: in a browser worker, a LexLean model's semantic snapshot is lowered to kernel
// declarations (src/lower.mjs), every theorem is proved by the kernel path (src/emit.mjs), and Lean's kernel
// (WebAssembly, 4.32.2) judges all of it. No Lean elaborator, no Lean build, no server.
import { loadLibrary, emitter } from "../../src/emit.mjs";
import { lower } from "../../src/lower.mjs";

const now = () => performance.now();
const gunzip = async (url) => new Uint8Array(await new Response((await fetch(url)).body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
const kinds = { linear_arithmetic: "linear_arithmetic", decide: "decide", reflexivity: "rfl" };
let kernel = null, baseText = null;

self.onmessage = async ({ data: { app } }) => {
  try {
    const t0 = now();
    if (!kernel) {
      const wasm = await gunzip("../../kernel/lean-kernel.wasm.gz");
      baseText = new TextDecoder().decode(await gunzip("./base-library.ndjson.gz"));
      const factory = (await import("../../kernel/lean-kernel.mjs")).default, lines = [];
      const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasm, imports).then((r) => ok(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
      if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("kernel not ready");
      const call = (entry, text) => { m.FS.writeFile("/f.ndjson", text); lines.length = 0; const t = now(); const exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); return { exit, ms: now() - t, out: [...lines] }; };
      if (call("load_library", baseText).exit !== 0) throw new Error("base library refused");
      kernel = { call, m };
    }
    const startMs = now() - t0;
    const snap = await (await fetch(`./${app}-snapshot.json`)).json();
    const t1 = now();
    const em = emitter(loadLibrary(baseText)), r = lower(snap, em);
    const lowerMs = now() - t1, t2 = now();
    const missed = [];
    for (const th of r.theorems) {
      try { em.write(em.theorem({ name: th.name, ns: th.name.slice(0, th.name.lastIndexOf(".")), script: [{ kind: kinds[th.proof] ?? th.proof }], binders: [], raw: "", text: "" })); }
      catch (e) { missed.push(th.name + ": " + e.message); }
    }
    const proveMs = now() - t2;
    const v = kernel.call("check_suffix", em.lines());
    const got = new Map(v.out.map((l) => /^axioms (\S+): (.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].split(", ").filter(Boolean).sort().join(",")]));
    // Exact: the axioms the kernel found are the ones LexLean declared. Fewer: a strict subset of them.
    const declared = (th) => [...th.axioms].sort().join(",");
    const exact = r.theorems.filter((th) => got.get(th.name) === declared(th)).length;
    const fewer = r.theorems.filter((th) => got.has(th.name) && got.get(th.name) !== declared(th) && got.get(th.name).split(",").filter(Boolean).every((a) => th.axioms.includes(a))).length;
    self.postMessage({
      ok: v.exit === 0 && missed.length === 0, app, declarations: r.declared.length, theorems: r.theorems.length,
      found: r.theorems.length - missed.length, kernel: v.exit === 0 ? "accepts" : "refuses: " + v.out.slice(-2).join(" | "),
      axiomsExact: exact, axiomsFewer: fewer, startMs: Math.round(startMs), lowerMs: Math.round(lowerMs), proveMs: Math.round(proveMs), judgeMs: Math.round(v.ms),
      totalMs: Math.round(now() - t0), heapMB: Math.round(kernel.m.HEAPU8.length / 1048576), missed: missed.slice(0, 3),
    });
  } catch (e) {
    self.postMessage({ ok: false, app, error: String(e && e.message ? e.message : e) });
  }
};
