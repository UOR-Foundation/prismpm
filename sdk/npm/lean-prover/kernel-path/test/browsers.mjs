// node test/browsers.mjs [firefox webkit chromium iphone android]
// Runs the page in each browser engine Playwright has installed, against the local server (node serve.mjs).
// "iphone" and "android" emulate a phone's screen, touch and user agent on the desktop's engine: they test the
// page's behaviour for a phone, not a phone's speed or memory.
// Each run keeps its own profile folder, so the second visit is a real returning session.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pw from "playwright";

const base = process.env.BASE || "http://localhost:8787/web/index.html";
const targets = { firefox: ["firefox", {}], webkit: ["webkit", {}], chromium: ["chromium", {}], iphone: ["webkit", pw.devices["iPhone 15"]], android: ["chromium", pw.devices["Pixel 7"]] };
const visits = [["first visit, the example", "?auto=example&fresh=1"], ["returning visit", "?auto=example"], ["2,000 generated theorems", "?auto=bench&n=2000&fresh=1"]];
let failed = 0;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["firefox", "webkit", "iphone"]) {
  const [engine, device] = targets[name], profile = fs.mkdtempSync(path.join(os.tmpdir(), `lexlean-${name}-`));
  const { defaultBrowserType, ...options } = device; // a persistent context takes the device's options, not its engine
  let ctx;
  try { ctx = await pw[engine].launchPersistentContext(profile, { headless: true, ...options }); }
  catch (e) { console.log(`\n=== ${name}: could not start: ${String(e.message).split("\n")[0]}`); failed++; continue; }
  console.log(`\n=== ${name} (${engine} ${ctx.browser() ? ctx.browser().version() : ""})`);
  for (const [label, query] of visits) {
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).split("\n")[0]));
    try {
      await page.goto(base + query);
      await page.waitForFunction(() => window.__results && window.__results.done, null, { timeout: 240000 });
      const lines = await page.evaluate(() => window.__results.lines), verdict = await page.evaluate(() => document.getElementById("verdict") ? document.getElementById("verdict").textContent : "");
      console.log(`--- ${label}`);
      for (const l of lines) if (/^(store|ready|example|first|same|one theorem|FAILED)/.test(l)) console.log("  " + l.slice(0, 260));
      if (verdict) console.log("  page says: " + verdict);
      if (lines.some((l) => l.startsWith("FAILED"))) failed++;
    } catch (e) { failed++; console.log(`--- ${label}: ${String(e.message).split("\n")[0]}`); }
    if (errors.length) console.log("  page errors: " + errors.slice(0, 3).join(" | ").slice(0, 300));
    await page.close();
  }
  await ctx.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(failed ? 1 : 0);
