// node test/prefix-keys.mjs BASE.ndjson SNAPSHOT.json
// The same model under another project's module prefix: every theorem key must be the same, so a verdict found in one
// project serves the other; and the renamed model must still be accepted by the kernel on its own.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadLibrary } from "../src/emit.mjs";
import { plan } from "../src/plan.mjs";
const [baseFile, snapFile] = process.argv.slice(2);
const lib = loadLibrary(fs.readFileSync(baseFile, "utf8"));
const snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));
const renamed = JSON.parse(JSON.stringify(snap));
const prefix = snap.modules[0].lean_module.split(".")[0];
for (const m of renamed.modules) m.lean_module = m.lean_module.replace(prefix, "SomeOtherApp");
const hash = (s) => "k:" + createHash("sha256").update(s).digest("hex");
const a = plan(snap, lib, { hash }), b = plan(renamed, lib, { hash });
const same = a.theorems.every((t, i) => t.key === b.theorems[i].key && t.name !== b.theorems[i].name);
console.log(`${a.theorems.length} theorems; names differ, keys equal: ${same}`);
// A model whose declaration would take a base library name is refused, not keyed.
const clash = { spec: snap.spec, modules: [{ name: "M", lean_module: "Nat", imports: [], semantic: { declarations: [
  { kind: "definition", name: "add", parameters: [], result: { kind: "nat" }, body: { kind: "nat", value: "1" } },
  { kind: "theorem", name: "t", parameters: [], axioms: [], proof: { kind: "decide" },
    statement: { kind: "eq", left: { kind: "call", function: { name: "add" }, arguments: [] }, right: { kind: "nat", value: "1" } } }] } }] };
let refused = null;
try { plan(clash, lib, { hash }); } catch (e) { refused = e.message; }
console.log(`a prefix that lands on a base name: ${refused ?? "NOT refused"}`);
process.exit(same && refused ? 0 : 1);
