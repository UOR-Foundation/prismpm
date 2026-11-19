// One of the sealed prover's judges: Lean 4.32.2's kernel (WebAssembly) with the base library resident, judging the
// files the coordinator writes (kernel-path/src/plan.mjs). Several judge side by side, each in its own worker.
//
// A kernel that has loaded the base library is suspended to a κ: its whole linear memory, filed under the BLAKE3 label
// of those bytes, with a pointer from the labels of the kernel, its loader and the library. A judge resumes from that
// image (a fresh instance, the memory copied in) instead of reading the library again: tens of milliseconds in place
// of hundreds. The image is used only when it re-hashes to its label, and only this kernel, from this library, made it.
//
//   { op: "init", hologramJs, hologramWasm, seal, image?, wantImage? } -> { ok, resumed, ms, image? }
// `image` is a sibling judge's image, handed over by the page: a judge started beside another resumes from it at once,
// with no storage between them. `wantImage` asks for this judge's image back, to hand to the next.
//   { op: "judge", text }                          -> { exit, axioms: { name: [axiom] }, output, ms }
import { admitted, keep, openDir, point, pointer, recall } from "./sealed-store.mjs";

const now = () => performance.now();
let holo = null, kernel = null;

async function init(data) {
  const { hologramJs, hologramWasm, seal } = data;
  const t = now();
  holo = await import(hologramJs);
  holo.initSync({ module: hologramWasm });
  const dir = await openDir("lean-sealed");
  const [glue, wasm] = await Promise.all([admitted(holo, dir, seal.kernel.loader), admitted(holo, dir, seal.kernel.wasm)]);
  const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
  let factory;
  try { factory = (await import(url)).default; } finally { URL.revokeObjectURL(url); }
  const module = await WebAssembly.compile(wasm);
  const said = [];
  const m = await factory({ instantiateWasm: (imports, ok) => { WebAssembly.instantiate(module, imports).then((i) => ok(i, module)); return {}; }, print: (x) => said.push(x), printErr: (x) => said.push(x) });
  if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("Lean's kernel did not start");
  const call = (entry, text) => {
    m.FS.writeFile("/f.ndjson", text); said.length = 0;
    let exit; try { exit = m.ccall(entry, "number", ["string"], ["/f.ndjson"]); } catch (e) { exit = 3; said.push("trap: " + (e?.message ?? e)); }
    try { m.FS.unlink("/f.ndjson"); } catch {}
    return { exit, said: [...said] };
  };
  // The image's pointer: named by the labels it was made from.
  const name = holo.address(new TextEncoder().encode(["lean-prover/kernel-image/1", seal.kernel.loader.kappa, seal.kernel.wasm.kappa, seal.base.kappa].join("\n"))).slice(7);
  let image = data.image ?? null;
  if (!image) { const label = await pointer(dir, name); image = label ? await recall(holo, dir, label) : null; }
  let resumed = false;
  if (image) {
    const need = image.length - m.HEAPU8.length;
    if (need > 0 && !m._malloc(need)) throw new Error("the kernel could not grow to its image");
    m.HEAPU8.set(image);
    if (m.HEAPU8.length > image.length) m.HEAPU8.fill(0, image.length);
    resumed = true;
  } else {
    const base = await admitted(holo, dir, seal.base);
    const loaded = call("load_library", new TextDecoder().decode(base));
    if (loaded.exit !== 0) throw new Error("the base library was refused: " + loaded.said.slice(-2).join(" "));
    // Suspended here, for the judges beside this one and, once filed, for every later visit. Filing does not hold up
    // this judge: it is ready as soon as the library is loaded.
    image = m.HEAPU8.slice();
    const kept = image.slice();
    keep(holo, dir, kept).then((label) => point(dir, name, label)).catch(() => {});
  }
  kernel = { call, heapMB: () => Math.round(m.HEAPU8.length / 1048576) };
  const out = { ok: true, resumed, ms: Math.round(now() - t), heapMB: kernel.heapMB() };
  if (data.wantImage) { out.image = image; out.transfer = [image.buffer]; }
  return out;
}

function judge(text) {
  const t = now(), r = kernel.call("check_suffix", text);
  const axioms = {}, rest = [];
  for (const line of r.said) { const a = /^axioms (\S+): ?(.*)$/.exec(line); if (a) axioms[a[1]] = a[2] ? a[2].split(", ").sort() : []; else rest.push(line); }
  return { exit: r.exit, axioms: r.exit === 0 ? axioms : {}, output: rest.join("\n").slice(-600), ms: Math.round(now() - t) };
}

self.onmessage = async ({ data }) => {
  const reply = ({ transfer = [], ...r }) => self.postMessage({ id: data.id, ...r }, transfer);
  try {
    if (data.op === "init") return reply(await init(data));
    if (!kernel) return reply({ error: "the judge is not initialized" });
    if (data.op === "judge") return reply(judge(data.text));
    reply({ error: `unknown op ${data.op}` });
  } catch (e) { reply({ error: "the judge failed: " + (e?.message ?? e) }); }
};
