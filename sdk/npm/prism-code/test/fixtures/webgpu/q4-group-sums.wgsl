// Kernel 1 of Hologram AI's integer engine, q4_group_sums with zero point 8, written by hand in the layout LexLean's
// WGSL backend emits, until its rendered text is published. All arithmetic is u32 and wraps, which is i32 arithmetic
// in two's complement. b0: activation codes, i16 sign-extended, index unit*32+k. b1: 4-bit weights packed little
// endian, nibble g = (b1[g>>3] >> 4*(g&7)) & 15, g = row*K + unit*32 + k. b2: packed zero points (unused).
// b3: one i32 sum per (row, unit), index row*units+unit = global_invocation_id.x.
@group(0) @binding(0) var<storage, read> b0: array<u32>;
@group(0) @binding(1) var<storage, read> b1: array<u32>;
@group(0) @binding(2) var<storage, read> b2: array<u32>;
@group(0) @binding(3) var<storage, read_write> b3: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&b3)) { return; }
  let units = arrayLength(&b0) / 32u;
  let row = i / units;
  let unit = i % units;
  var sum = 0u;
  for (var k = 0u; k < 32u; k = k + 1u) {
    let g = row * units * 32u + unit * 32u + k;
    let nibble = (b1[g >> 3u] >> (4u * (g & 7u))) & 15u;
    sum = sum + b0[unit * 32u + k] * (nibble - 8u);
  }
  b3[i] = sum;
}
