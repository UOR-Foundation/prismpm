// node test/model/sealed-browsers.mjs SEAL loan=PORT seat=PORT verdant=PORT
// Opens PrismPM's sealed prover page (web/sealed.html, pinned by ?seal=) for each app in each engine: a first visit
// on an empty profile, a returning visit that must be answered from the origin's store, and a recheck (?recheck=1)
// that skips the project's verdict and must find every theorem's verdict by its key. Then, for the first app, the
// kernel image the store keeps is replaced by planted ones, each filed under its own label as a real one is:
//   larger   the real image and 16 MiB more, as a kernel whose library load grew its memory keeps: every judge resumes;
//   corrupt  the real image with its first 8 MiB cleared: the judge sets it aside, reads the library, and is accepted;
//   healed   the image that judge kept in its place: every judge resumes again.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pw from "playwright";

const [seal, ...apps] = process.argv.slice(2);
// PW_EXECUTABLES='{"chromium":"…","firefox":"…","webkit":"…"}' runs browsers already installed elsewhere.
const exe = process.env.PW_EXECUTABLES ? JSON.parse(process.env.PW_EXECUTABLES) : {};
let bad = 0;

// Run in a worker of the page's origin, where the judges run, so it reads and writes the store they use.
async function inWorker(page, port, op) {
  return page.evaluate(async ({ port, op }) => {
    const code = `
      import { keep, openDir, point, pointer, recall } from "http://localhost:${port}/sealed-store.mjs";
      import { kappa } from "http://localhost:${port}/blake3.mjs";
      onmessage = async ({ data: op }) => {
        try {
          const holo = { address: kappa }, seal = await (await fetch("http://localhost:${port}/seal.json")).json();
          const dir = await openDir("lean-sealed");
          const name = kappa(new TextEncoder().encode(["lean-prover/kernel-image/1", seal.kernel.loader.kappa, seal.kernel.wasm.kappa, seal.base.kappa].join("\\n"))).slice(7);
          const label = await pointer(dir, name), image = label ? await recall(holo, dir, label) : null;
          if (!image) return postMessage({ error: "no kernel image is kept" });
          let planted = null;
          if (op === "larger") { planted = new Uint8Array(image.length + 16 * 1048576); planted.set(image); }
          if (op === "corrupt") { planted = image.slice(); planted.fill(0, 0, 8 * 1048576); }
          const plantedLabel = planted ? await keep(holo, dir, planted) : null;
          if (planted) await point(dir, name, plantedLabel);
          postMessage({ label, bytes: image.length, planted: planted?.length ?? null, plantedLabel });
        } catch (e) { postMessage({ error: String(e?.message ?? e) }); }
      };`;
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })), { type: "module" });
    const r = await new Promise((ok) => { w.onmessage = ({ data }) => ok(data); w.onerror = (e) => ok({ error: e.message }); w.postMessage(op); });
    w.terminate();
    return r;
  }, { port, op });
}
for (const name of ["chromium", "firefox", "webkit"]) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sealed-${name}-`));
  const ctx = await pw[name].launchPersistentContext(profile, { headless: true, executablePath: exe[name] });
  console.log(`=== ${name}`);
  for (const [i, [app, port]] of apps.map((x) => x.split("=")).entries()) {
    for (const visit of ["first", "returning", "recheck", ...(i === 0 ? ["larger", "corrupt", "healed"] : [])]) {
      const planted = ["larger", "corrupt", "healed"].includes(visit);
      const page = await ctx.newPage(), errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      const t = Date.now();
      try {
        let plant = null;
        if (planted) {
          await page.goto(`http://localhost:${port}/seal.json`);
          plant = await inWorker(page, port, visit);
          if (plant.error) throw new Error(`planting the ${visit} image: ${plant.error}`);
        }
        await page.goto(`http://localhost:${port}/sealed.html?seal=${seal}${visit === "recheck" || planted ? "&recheck=1" : ""}${process.env.JUDGES ? "&judges=" + process.env.JUDGES : ""}`);
        await page.waitForFunction(() => window.result && window.result.done, null, { timeout: 300000 });
        // Every judge has started, whether or not it had a batch to judge.
        if (planted) await page.waitForFunction(() => { const t = window.result.timings; return !t || t.timeline.judges.length >= t.timeline.wanted; }, null, { timeout: 120000 });
        const r = await page.evaluate(() => ({ ...window.result, theorems: window.result.theorems?.map((t) => t.name), log: window.sealLog, verdict: document.getElementById("verdict").textContent }));
        const started = r.timings?.timeline?.judges ?? [];
        const resumedOk = !planted ? true
          : visit === "corrupt" ? !started[0]?.resumed && !!started[0]?.setAside
            : started.length > 0 && started.every((j) => j.resumed && !j.setAside);
        const ok = resumedOk && r.accepted && (visit === "returning" ? r.remembered : !r.remembered) && (visit !== "recheck" || r.timings?.reused === r.theorems?.length);
        if (planted) console.log(`    image ${plant.bytes} bytes${plant.planted ? `, planted ${plant.planted}` : ""}; judges: ${JSON.stringify(started)}`);
        // A judge that read the library files its image without holding up the proof, and a page closed first cuts the
        // filing short: before the images are planted, and after the corrupt one, wait for a working image to be kept.
        if ((i === 0 && visit === "first") || visit === "corrupt") {
          let kept = null;
          for (let n = 0; n < 60 && !(kept?.label && kept.label !== plant?.plantedLabel); n++) { await page.waitForTimeout(500); kept = await inWorker(page, port, "read"); }
          if (!kept?.label || kept.label === plant?.plantedLabel) { bad++; console.log("    the judge did not file a working image"); }
        }
        if (!ok) bad++;
        console.log(`  ${app} ${visit}: ${ok ? "ok" : "FAILED"} in ${((Date.now() - t) / 1000).toFixed(1)} s wall; ${r.error ?? r.verdict}`);
        console.log(`    ${r.log?.slice(-1)[0] ?? ""}`);
      } catch (e) { bad++; console.log(`  ${app} ${visit}: ${e.message.split("\n")[0]}`); }
      if (errs.length) console.log("    errors: " + errs.join(" | ").slice(0, 300));
      await page.close();
    }
  }
  await ctx.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(bad ? 1 : 0);
