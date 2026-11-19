// How deep WebAssembly may recurse here: called directly, and through WebAssembly.promising (JSPI), which runs the
// call on a separate stack. Each frame carries 32 live i64 locals, roughly like Lean's compiled code.
// Returns { direct, promising, jspi } as the deepest recursion that completed, by doubling then bisecting.
export async function probe() {
  // (func $f (param i32) (result i64) (local i64 x32) ... if n==0: 0 else: f(n-1) + sum(locals)) exported "f"
  const L = 32, body = [];
  body.push(0x01, L, 0x7e); // 32 locals of i64
  for (let i = 0; i < L; i++) body.push(0x20, 0x00, 0xad, 0x21, 1 + i); // local[i] = i64(n)
  body.push(0x20, 0x00, 0x45, 0x04, 0x7e, 0x42, 0x00, 0x05); // if n == 0 then 0 else
  body.push(0x20, 0x00, 0x41, 0x01, 0x6b, 0x10, 0x00); // f(n - 1)
  for (let i = 0; i < L; i++) body.push(0x20, 1 + i, 0x7c); // + local[i]
  body.push(0x0b, 0x0b); // end if, end func
  const leb = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };
  const sec = (id, bytes) => [id, ...leb(bytes.length), ...bytes];
  const code = [0x01, ...leb(body.length), ...body];
  const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...sec(1, [0x01, 0x60, 0x01, 0x7f, 0x01, 0x7e]), ...sec(3, [0x01, 0x00]),
    ...sec(7, [0x01, 0x01, 0x66, 0x00, 0x00]), ...sec(10, code)]);
  const { instance } = await WebAssembly.instantiate(bytes);
  const f = instance.exports.f;
  const deepest = async (call) => {
    let ok = 0, bad = 1;
    while (bad <= 1 << 24) { try { await call(bad); ok = bad; bad *= 2; } catch { break; } }
    while (bad - ok > Math.max(16, ok >> 6)) { const mid = (ok + bad) >> 1; try { await call(mid); ok = mid; } catch { bad = mid; } }
    return ok;
  };
  const jspi = typeof WebAssembly.promising === "function";
  return { direct: await deepest(async (n) => f(n)), promising: jspi ? await deepest((n) => WebAssembly.promising(f)(n)) : null, jspi };
}
