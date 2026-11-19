// node test/model/timeline.mjs SEAL PORT [engine...]: one fresh profile per engine, a first visit, and its timeline.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import * as pw from "playwright";
const [seal, port, ...engines] = process.argv.slice(2);
const exe = process.env.PW_EXECUTABLES ? JSON.parse(process.env.PW_EXECUTABLES) : {};
for (const name of engines.length ? engines : ["chromium", "firefox", "webkit"]) {
  const ctx = await pw[name].launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "tl-")), { headless: true, executablePath: exe[name] });
  for (const visit of ["cold", "warm-store", "recheck"]) {
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/sealed.html?seal=${seal}${visit === "recheck" ? "&recheck=1" : ""}${visit === "warm-store" ? "&recheck=1&fresh=" + Date.now() : ""}${process.env.JUDGES ? "&judges=" + process.env.JUDGES : ""}`);
    await page.waitForFunction(() => window.result && window.result.done, null, { timeout: 300000 });
    const r = await page.evaluate(() => ({ total: window.result.totalMs, t: window.result.timings, err: window.result.error }));
    console.log(`${name} ${visit}: ${r.total} ms ${r.err ?? ""}\n  ${JSON.stringify({ ...r.t, timeline: undefined })}\n  timeline ${JSON.stringify(r.t?.timeline)}`);
    await page.close();
  }
  await ctx.close();
}
