// The per-browser record: does the prover run, does every corpus declaration agree with native Lean, how long a
// cold and a warm visit take, and the engine's peak memory. Why: "any browser" is a claim about engines, so each one
// runs the gate's browser corpus (web/index.html) for itself. How: a cold visit starts from an empty profile, so every
// blob is fetched, decoded and hashed; a warm visit reloads the same profile, so blobs come from the tab's store
// (OPFS) and are hashed again. Peak memory is the engine's WebAssembly memory, which never shrinks.
//
//   node gate/browsers.mjs --playwright DIR --url http://localhost:PORT --out browsers.json [--browsers chromium,firefox,webkit]
//   node gate/browsers.mjs --table browsers.json [more.json ...]       (Markdown table of every record given)
// DIR holds an installed `playwright` package. Each browser runs width auto (what a user gets) and, where it has
// 64-bit memory, the 32-bit build as well, so both builds are measured on the same engine.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };

/** One row per record: engine, version, width, works, cold, warm, peak memory. */
export function table(records) {
  const s = (ms) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
  const lines = ["| Browser | Engine version | Width | Works (corpus agrees) | Cold | Warm | Peak engine memory |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const r of records) {
    lines.push(`| ${r.browser} | ${r.version ?? "–"} | ${r.width ?? "–"} | ${r.works ? "yes" : `no${r.why ? ` (${r.why})` : ""}`} | ${s(r.coldMs)} | ${s(r.warmMs)} | ${r.peakHeapMB == null ? "–" : `${r.peakHeapMB} MB`} |`);
  }
  return lines.join("\n");
}

/** A record from a cold and a warm page result (window.result of web/index.html). */
export function record(browser, version, cold, warm) {
  const ok = (r) => r?.opened?.ok === true && r.agree === true;
  const why = !cold ? "no result" : !cold.opened?.ok ? cold.opened?.refusal : !cold.agree ? "a module differs from native" : !ok(warm) ? "warm visit failed" : null;
  return {
    browser, version, width: cold?.opened?.width ?? null, memory64: cold?.opened?.memory64 ?? null,
    works: ok(cold) && ok(warm), why,
    coldMs: cold?.totalMs ?? null, warmMs: warm?.totalMs ?? null,
    coldOpenMs: cold?.opened?.timings ? Object.values(pick(cold.opened.timings)).reduce((a, b) => a + b, 0) : null,
    warmStoreHits: warm?.opened?.timings?.storeHits ?? null,
    peakHeapMB: Math.max(cold?.peakHeapMB ?? 0, warm?.peakHeapMB ?? 0) || null,
    userAgent: cold?.userAgent ?? null,
  };
}
const pick = (t) => ({ engineMs: t.engineMs, libraryMs: t.libraryMs, instantiateMs: t.instantiateMs, initializeMs: t.initializeMs });

const main = process.argv[1]?.replaceAll("\\", "/").endsWith("gate/browsers.mjs");
if (!main) {
  // imported for record and table
} else if (argv.includes("--all-work")) {
  // Exit 1 unless every record given works: the job fails on any browser that does not run or does not agree.
  const records = argv.filter((a) => a !== "--all-work").flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
  const bad = records.filter((r) => !r.works);
  for (const r of bad) console.error(`${r.browser}: ${r.why}`);
  process.exit(records.length && !bad.length ? 0 : 1);
} else if (argv.includes("--table")) {
  const files = argv.filter((a) => a !== "--table");
  console.log(table(files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")))));
} else if (flag("--playwright")) {
  const require = createRequire(join(flag("--playwright"), "noop.js"));
  const playwright = require("playwright");
  const url = flag("--url");
  const names = (flag("--browsers") ?? "chromium,firefox,webkit").split(",");
  const records = [];
  for (const name of names) {
    for (const width of ["auto", "32"]) {
      const dir = mkdtempSync(join(tmpdir(), `lean-prover-${name}-`));
      const context = await playwright[name].launchPersistentContext(dir, { headless: true });
      const version = context.browser()?.version() ?? null;
      const visit = async () => {
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(`${url}/?width=${width}`);
        await page.waitForFunction(() => window.result?.done === true, null, { timeout: 30 * 60 * 1000, polling: 1000 });
        return page.evaluate(() => window.result);
      };
      let cold = null, warm = null;
      try { cold = await visit(); warm = await visit(); } catch (e) { console.error(`${name} ${width}: ${e.message}`); }
      await context.close();
      // The 32-bit build on a browser with 64-bit memory is a measurement, not what its users get.
      if (width === "32" && cold?.opened?.memory64 === false) continue;
      const r = record(width === "32" ? `${name} (32-bit forced)` : name, version, cold, warm);
      records.push(r);
      console.log(JSON.stringify(r));
    }
  }
  writeFileSync(flag("--out"), JSON.stringify(records, null, 1));
  console.log(table(records));
} else {
  console.error("usage: browsers.mjs --playwright DIR --url URL --out FILE [--browsers a,b] | --table FILE ...");
  process.exit(2);
}
