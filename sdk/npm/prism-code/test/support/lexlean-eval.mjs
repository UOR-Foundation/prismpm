// Evaluates a LexLean semantic module's definitions over naturals and booleans: the fragment Prism's models are
// written in. Tests use it to hold JavaScript to the model's own text.
import assert from 'node:assert/strict';


/** The definitions of a module: name, parameter names and the body as written. */
export function definitions(text) {
  const out = new Map();
  for (const m of text.matchAll(/definition\{\s*name: (\w+),\s*parameters: \[([^\]]*)\],\s*result: \w+,\s*body: ([\s\S]*?)\s*\}(?=\n\n|\n\\end|\n$)/g)) {
    out.set(m[1], { parameters: m[2].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean), body: m[3] });
  }
  return out;
}

/** Evaluate a LexLean body over naturals and booleans: the fragment these modules are written in. */
export function evaluator(defs) {
  const tokens = (body) => body.match(/\(|\)|<=\?|<\?|=\?|&&|\|\||\+|[A-Za-z_][\w:]*|\d+/g);
  const parse = (ts) => {
    const t = ts.shift();
    if (t !== '(') return /^\d+$/.test(t) ? { n: Number(t) } : { v: t };
    const items = [];
    while (ts[0] !== ')') items.push(ts[0] === '(' ? parse(ts) : ts.shift());
    ts.shift();
    return { items };
  };
  const call = (name, args) => {
    const d = defs.get(name.split('::').pop());
    assert.ok(d, `the model defines ${name}`);
    assert.equal(args.length, d.parameters.length, name);
    return run(parse(tokens(d.body)), Object.fromEntries(d.parameters.map((p, i) => [p, args[i]])));
  };
  const leaf = (x) => (typeof x === 'string' ? (/^\d+$/.test(x) ? { n: Number(x) } : { v: x }) : x);
  function run(node, env) {
    if ('n' in node) return node.n;
    if ('v' in node) {
      assert.ok(node.v in env, `unbound ${node.v}`);
      return env[node.v];
    }
    const it = node.items;
    const ev = (x) => run(leaf(x), env);
    if (it[0] === 'project') return ev(it[1])[it[2]];
    if (it[0] === 'not') return !ev(it[1]);
    if (it[0] === 'if') {
      assert.deepEqual([it[2], it[4]], ['then', 'else']);
      return ev(it[1]) ? ev(it[3]) : ev(it[5]);
    }
    if (it.length === 3 && typeof it[1] === 'string' && ['=?', '<=?', '<?', '&&', '||', '+'].includes(it[1])) {
      const [a, op, b] = [ev(it[0]), it[1], ev(it[2])];
      return op === '=?' ? a === b : op === '<=?' ? a <= b : op === '<?' ? a < b : op === '&&' ? a && b : op === '||' ? a || b : a + b;
    }
    assert.equal(typeof it[0], 'string');
    return call(it[0], it.slice(1).map(ev));
  }
  return call;
}
