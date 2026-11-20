// Runs test/model/check.html in each engine and prints each app's result.
import * as pw from "playwright";

// PW_EXECUTABLES='{"chromium":"…","firefox":"…","webkit":"…"}' runs browsers already installed elsewhere, when the
// installed Playwright wants builds it has not downloaded.
const exe = process.env.PW_EXECUTABLES ? JSON.parse(process.env.PW_EXECUTABLES) : {};
const url = "http://localhost:8787/test/model/check.html";
let bad = 0;
for (const name of ["chromium", "firefox", "webkit"]) {
  const b = await pw[name].launch({ headless: true, executablePath: exe[name] }), page = await b.newPage(), errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const t = Date.now();
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.results, null, { timeout: 300000 });
    const rs = await page.evaluate(() => window.results);
    console.log(`=== ${name} ${b.version()} (${((Date.now() - t) / 1000).toFixed(1)} s wall)`);
    for (const r of rs) { if (!r.ok) bad++; console.log("  " + JSON.stringify(r)); }
  } catch (e) { bad++; console.log(`=== ${name}: ${e.message.split("\n")[0]}`); }
  if (errs.length) console.log("  errors: " + errs.join(" | ").slice(0, 300));
  await b.close();
}
process.exit(bad ? 1 : 0);
