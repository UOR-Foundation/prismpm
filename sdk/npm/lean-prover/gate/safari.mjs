// Safari on macOS and Mobile Safari in the iOS Simulator, which Playwright cannot drive: each opens the gate's
// browser corpus page by URL, and the page posts its result to the server (web/serve.mjs --reports). A cold visit is
// the first in the profile, a warm one the second, served from the tab's store. Rows as gate/browsers.mjs writes them.
//   node gate/safari.mjs --url http://localhost:PORT --reports DIR --out safari.json [--ios]
// The simulator shares the Mac's network, so localhost is the same server. Its memory limits are the Mac's, not a
// phone's: a device's tab budget is not measured here.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { record, table } from "./browsers.mjs";

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
const url = flag("--url"), reports = flag("--reports"), ios = argv.includes("--ios");
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

async function visit(name, open) {
  const file = join(reports, `${name}.json`);
  open(`${url}/?width=auto&run=${name}`);
  const deadline = Date.now() + 30 * 60 * 1000;
  while (!existsSync(file)) {
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const records = [];
if (!ios) {
  const version = sh("defaults", ["read", "/Applications/Safari.app/Contents/Info", "CFBundleShortVersionString"]);
  const open = (u) => sh("open", ["-a", "Safari", u]);
  const cold = await visit("safari-cold", open), warm = await visit("safari-warm", open);
  records.push(record("Safari (macOS)", version, cold, warm));
} else {
  const devices = JSON.parse(sh("xcrun", ["simctl", "list", "devices", "available", "--json"])).devices;
  const [runtime, list] = Object.entries(devices).filter(([k, v]) => /iOS/.test(k) && v.some((d) => /iPhone/.test(d.name))).sort().at(-1);
  const device = list.find((d) => /iPhone/.test(d.name));
  try { sh("xcrun", ["simctl", "boot", device.udid]); } catch {}
  sh("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
  const open = (u) => sh("xcrun", ["simctl", "openurl", device.udid, u]);
  const cold = await visit("ios-cold", open), warm = await visit("ios-warm", open);
  records.push(record(`Mobile Safari (${device.name} simulator)`, runtime.replace(/.*SimRuntime\./, ""), cold, warm));
}
writeFileSync(flag("--out"), JSON.stringify(records, null, 1));
console.log(JSON.stringify(records));
console.log(table(records));
