// node test/model/sealed-browsers.mjs SEAL loan=PORT seat=PORT verdant=PORT
// Opens PrismPM's sealed prover page (web/sealed.html, pinned by ?seal=) for each app in each engine: a first visit
// on an empty profile, then a returning visit that must be answered from the origin's store.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pw from "playwright";

// PW_EXECUTABLES='{"chromium":"…","firefox":"…","webkit":"…"}' runs browsers already installed elsewhere, when the
// installed Playwright wants builds it has not downloaded.
const exe = process.env.PW_EXECUTABLES ? JSON.parse(process.env.PW_EXECUTABLES) : {};

const [seal, ...apps] = process.argv.slice(2);
let bad = 0;
for (const name of ["chromium", "firefox", "webkit"]) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sealed-${name}-`));
  const ctx = await pw[name].launchPersistentContext(profile, { headless: true, executablePath: exe[name] });
  console.log(`=== ${name}`);
  for (const [app, port] of apps.map((x) => x.split("="))) {
    for (const visit of ["first", "returning"]) {
      const page = await ctx.newPage(), errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      const t = Date.now();
      try {
        await page.goto(`http://localhost:${port}/sealed.html?seal=${seal}`);
        await page.waitForFunction(() => window.result && window.result.done, null, { timeout: 300000 });
        const r = await page.evaluate(() => ({ ...window.result, theorems: undefined, log: window.sealLog, verdict: document.getElementById("verdict").textContent }));
        const ok = r.accepted && (visit === "first" ? !r.remembered : r.remembered);
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
