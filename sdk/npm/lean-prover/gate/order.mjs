// The modules of rendered builds in elaboration order: every module after the modules it imports, ties by name.
//   node gate/order.mjs BUILD_MODULES_DIR ...      prints `Module=path` per line
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function ordered(roots) {
  const mods = new Map();
  for (const root of roots) {
    for (const f of readdirSync(root, { recursive: true }).map(String)) {
      const p = join(root, f);
      if (!f.endsWith(".lean") || !statSync(p).isFile()) continue;
      const name = relative(root, p).replaceAll("\\", "/").slice(0, -5).replaceAll("/", ".");
      const imports = [...readFileSync(p, "utf8").matchAll(/^(?:public\s+|private\s+)?import\s+(?:all\s+)?([\w.]+)/gm)].map((m) => m[1]);
      mods.set(name, { path: p, imports });
    }
  }
  const out = [], done = new Set(), busy = new Set();
  const visit = (name) => {
    if (done.has(name) || !mods.has(name)) return;
    if (busy.has(name)) throw new Error(`import cycle through ${name}`);
    busy.add(name);
    for (const i of [...mods.get(name).imports].sort()) visit(i);
    busy.delete(name); done.add(name); out.push([name, mods.get(name).path]);
  };
  for (const name of [...mods.keys()].sort()) visit(name);
  return out;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("gate/order.mjs")) {
  for (const [m, p] of ordered(process.argv.slice(2))) console.log(`${m}=${p}`);
}
