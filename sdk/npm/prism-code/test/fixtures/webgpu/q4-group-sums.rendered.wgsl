@group(0) @binding(0) var<storage, read> b0: array<u32>;
fn rd0(i: u32) -> u32 { if (i < arrayLength(&b0)) { return b0[i]; } return 0u; }
@group(0) @binding(1) var<storage, read> b1: array<u32>;
fn rd1(i: u32) -> u32 { if (i < arrayLength(&b1)) { return b1[i]; } return 0u; }
@group(0) @binding(2) var<storage, read> b2: array<u32>;
fn rd2(i: u32) -> u32 { if (i < arrayLength(&b2)) { return b2[i]; } return 0u; }
@group(0) @binding(3) var<storage, read_write> b3: array<u32>;
fn rd3(i: u32) -> u32 { if (i < arrayLength(&b3)) { return b3[i]; } return 0u; }
override invocations: u32;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
let k = gid.x;
if (k >= invocations) { return; }
var l: array<u32, 7>;
l[0] = k;
l[1] = (l[0] / 2u);
l[2] = (l[0] % 2u);
l[6] = 8u;
l[3] = 0u;
for (var i0: u32 = 0u; i0 < 32u; i0 = i0 + 1u) {
l[4] = 0u + i0;
l[5] = ((l[1] * 64u) + ((l[2] * 32u) + l[4]));
l[3] = (l[3] + (rd0(((l[2] * 32u) + l[4])) * (((rd1((l[5] >> (3u & 31u))) >> ((4u * (l[5] & 7u)) & 31u)) & 15u) - l[6])));
}
{ let at = l[0]; let put = l[3]; if (at < arrayLength(&b3)) { b3[at] = put; } }
}
