// One of the sealed prover's judges: Lean 4.32.2's kernel (WebAssembly) with the base library resident, judging the
// files the coordinator writes (kernel-path/src/plan.mjs). Several judge side by side, each in its own worker.
//
// A kernel that has loaded the base library is suspended to a κ: its whole linear memory, filed under the BLAKE3 label
// of those bytes, with a pointer from the labels of the kernel, its loader and the library. A judge resumes from that
// image (a fresh instance, the memory copied in) instead of reading the library again: tens of milliseconds in place
// of hundreds. The image is used only when it re-hashes to its label, and only this kernel, from this library, made it;
// a resumed kernel must then answer, or the image is set aside (`setAside` says why) and the library read again.
//
//   { op: "init", hologramJs, hologramWasm, seal, image?, wantImage? } -> { ok, resumed, setAside?, ms, image? }
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
  // A kernel, and its memory, taken from the instance: a view of memory made after it grows always reaches its end,
  // where a view kept from before the growth does not.
  const start = async () => {
    let memory = null;
    const made = await factory({
      instantiateWasm: (imports, ok) => {
        WebAssembly.instantiate(module, imports).then((i) => { memory = Object.values(i.exports).find((x) => x instanceof WebAssembly.Memory) ?? null; ok(i, module); });
        return {};
      },
      print: (x) => said.push(x), printErr: (x) => said.push(x),
    });
    if (made.ccall("checker_ready", "number", [], []) !== 0) throw new Error("Lean's kernel did not start");
    return { made, heap: () => (memory ? new Uint8Array(memory.buffer) : made.HEAPU8) };
  };
  let { made: m, heap } = await start();
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
  // The image only saves time: when resuming from it fails for any reason, a fresh kernel reads the library and a new
  // image is kept, so a cache never fails a proof.
  let resumed = false, setAside = null;
  if (image) {
    try {
      // The image is the whole memory of a kernel that loaded its library, which can be larger than a fresh kernel's
      // (80.5 MB against 64 MB measured). malloc of only the difference can be met from free space inside the current
      // memory, which then never grows; asking for the image's whole size makes the runtime grow memory past it.
      if (image.length > heap().length && !m._malloc(image.length)) throw new Error("the kernel could not grow to its image");
      const view = heap();
      if (view.length < image.length) throw new Error(`the kernel grew to ${view.length} bytes, not its image's ${image.length}`);
      view.set(image);
      if (view.length > image.length) view.fill(0, image.length);
      // The resumed kernel must answer as a kernel over its library: checking nothing is accepted, or it is not resumed.
      const probe = call("check_suffix", "");
      if (probe.exit !== 0) throw new Error(`the resumed kernel did not answer (${probe.said.join(" ").slice(0, 120)})`);
      resumed = true;
    } catch (e) {
      // Why the image was set aside, said with the judge, so a slow start is never a mystery.
      setAside = String(e?.message ?? e);
      ({ made: m, heap } = await start());
    }
  }
  if (!resumed) {
    const base = await admitted(holo, dir, seal.base);
    const loaded = call("load_library", new TextDecoder().decode(base));
    if (loaded.exit !== 0) throw new Error("the base library was refused: " + loaded.said.slice(-2).join(" "));
    // Suspended here, for the judges beside this one and, once filed, for every later visit. Filing does not hold up
    // this judge: it is ready as soon as the library is loaded.
    image = heap().slice();
    const kept = image.slice();
    keep(holo, dir, kept).then((label) => point(dir, name, label)).catch(() => {});
  }
  kernel = { call, heapMB: () => Math.round(heap().length / 1048576) };
  const out = { ok: true, resumed, ...(setAside ? { setAside } : {}), ms: Math.round(now() - t), heapMB: kernel.heapMB() };
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
