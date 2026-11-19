// node test/model/sealed-browsers.mjs SEAL loan=PORT seat=PORT verdant=PORT
// Opens PrismPM's sealed prover page (web/sealed.html, pinned by ?seal=) for each app in each engine: a first visit
// on an empty profile, a returning visit that must be answered from the origin's store, and a recheck (?recheck=1)
// that skips the project's verdict and must find every theorem's verdict by its key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pw from "playwright";

const [seal, ...apps] = process.argv.slice(2);
// PW_EXECUTABLES='{"chromium":"…","firefox":"…","webkit":"…"}' runs browsers already installed elsewhere.
const exe = process.env.PW_EXECUTABLES ? JSON.parse(process.env.PW_EXECUTABLES) : {};
let bad = 0;
for (const name of ["chromium", "firefox", "webkit"]) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sealed-${name}-`));
  const ctx = await pw[name].launchPersistentContext(profile, { headless: true, executablePath: exe[name] });
  console.log(`=== ${name}`);
  for (const [app, port] of apps.map((x) => x.split("="))) {
    for (const visit of ["first", "returning", "recheck"]) {
      const page = await ctx.newPage(), errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      const t = Date.now();
      try {
        await page.goto(`http://localhost:${port}/sealed.html?seal=${seal}${visit === "recheck" ? "&recheck=1" : ""}${process.env.JUDGES ? "&judges=" + process.env.JUDGES : ""}`);
        await page.waitForFunction(() => window.result && window.result.done, null, { timeout: 300000 });
        const r = await page.evaluate(() => ({ ...window.result, theorems: window.result.theorems?.map((t) => t.name), log: window.sealLog, verdict: document.getElementById("verdict").textContent }));
        const ok = r.accepted && (visit === "returning" ? r.remembered : !r.remembered) && (visit !== "recheck" || r.timings?.reused === r.theorems?.length);
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
