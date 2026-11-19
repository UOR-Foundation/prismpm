@group(0) @binding(0) var<storage, read> b0: array<u32>;
fn rd0(i: u32) -> u32 { if (i < arrayLength(&b0)) { return b0[i]; } return 0u; }
@group(0) @binding(1) var<storage, read> b1: array<u32>;
fn rd1(i: u32) -> u32 { if (i < arrayLength(&b1)) { return b1[i]; } return 0u; }
@group(0) @binding(2) var<storage, read_write> b2: array<u32>;
fn rd2(i: u32) -> u32 { if (i < arrayLength(&b2)) { return b2[i]; } return 0u; }
override invocations: u32;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
let k = gid.x;
if (k >= invocations) { return; }
var l: array<u32, 7>;
l[0] = k;
l[1] = rd0(l[0]);
l[2] = rd1((l[1] & 255u));
l[3] = (l[1] >> (8u & 31u));
l[4] = (l[2] >> (l[3] & 31u));
l[5] = (l[2] - (l[4] << (l[3] & 31u)));
l[6] = (1u << ((l[3] - 1u) & 31u));
{ let at = l[0]; let put = select(l[2], select(0u, (l[4] + select(select((l[4] & 1u), 0u, (l[5] - l[6]) != 0u), 1u, select(0u, 1u, l[6] < l[5]) != 0u)), select(0u, 1u, l[3] < 32u) != 0u), l[3] != 0u); if (at < arrayLength(&b2)) { b2[at] = put; } }
}
