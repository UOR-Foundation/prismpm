// node test/peek.mjs LIBRARY.ndjson NAME... | --find SUBSTRING [LIMIT]
// Prints declarations of an exported library as terms: to see how Lean's elaborator wrote a construct.
import fs from "node:fs";
import { loadLibrary } from "../src/emit.mjs";

const [file, ...rest] = process.argv.slice(2);
const lib = loadLibrary(fs.readFileSync(file, "utf8"));
const show = (e, d = 0) => {
  if (d > 40) return "…";
  switch (e.k) {
    case "const": return e.name + (e.us.length ? `.{${e.us.map((u) => u.key).join(",")}}` : "");
    case "app": { const xs = []; let t = e; while (t.k === "app") { xs.unshift(t.arg); t = t.fn; } return "(" + [show(t, d + 1), ...xs.map((x) => show(x, d + 1))].join(" ") + ")"; }
    case "lam": return `(λ ${e.name}:${show(e.type, d + 1)}. ${show(e.body, d + 1)})`;
    case "pi": return `(Π ${e.name}:${show(e.type, d + 1)}. ${show(e.body, d + 1)})`;
    case "let": return `(let ${e.name} := ${show(e.value, d + 1)}; ${show(e.body, d + 1)})`;
    case "bvar": return "#" + e.i;
    case "nat": return e.n;
    case "proj": return show(e.struct, d + 1) + "." + e.typeName + "#" + e.idx;
    default: return e.k;
  }
};
const print = (n) => { const d = lib.decls.get(n); console.log(`${n}\n  : ${d ? show(d.type).slice(0, 600) : "missing"}\n  := ${d && d.value ? show(d.value).slice(0, 1200) : "(no value)"}`); };
if (rest[0] === "--find") {
  let left = Number(rest[2] ?? 3);
  for (const [n, d] of lib.decls) if (left > 0 && d.value && show(d.value).includes(rest[1])) { print(n); left--; }
} else rest.forEach(print);
