#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != --check ]; }; then
  printf 'usage: %s [--check]\n' "$0" >&2
  exit 64
fi

# Acquisition is separate from the offline verifier and production Cargo graph.
# Browser compiler fixtures are internal gates, not external standards oracles.
# Release packaging also verifies the independently locked upstream compiler.
# Review these pins whenever an independently locked verification graph changes.
sha256sum --check --strict <<'CHECKSUMS'
ec19fdecf241b6e502726c1740bdc962dffc7fc1eaf456468ba0836b8fb2272a  tests/hologram-oracle/Cargo.toml
16e2a6e4ce47c12b3510813b605897a377981b8314d031775a4ec99e89b5c277  tests/hologram-oracle/Cargo.lock
5be0cb25a1bc7ebff4a709c6dd4c724ae787c6d97e4e9b0a9070ca2cafa71f89  tests/holo-codec-oracle/Cargo.toml
8ab0b99efa9ab6f44d9368d026aefadcefae4640cc92c814947609b41aaf0df4  tests/holo-codec-oracle/Cargo.lock
ec81bd62c5874aaea817f464a808a7c573b0333cef7366c72f2d9def2fbf17fc  tests/holo-browser-codec/Cargo.toml
0074e95dc75e42ad8f802da1b5d51aca3b212e6a6cb0970e1907ec9d040dc88c  tests/holo-browser-codec/Cargo.lock
86a4830eb350bd7b8a48ea541ad1076ae2d86bca5242fc60e0c5e0076ececc3f  tests/holo-primary-component/driver/Cargo.toml
1d134cffda1ede9a482bab8dfdfb2c5bdc5dbe519d23199e2c256d772f5af5d0  tests/holo-primary-component/driver/Cargo.lock
d297cffa4ac658e0d8f2a159d992b576612b069e1618b769c81dc3d9df0c60a3  tests/browser-pkce/driver/Cargo.toml
5f3a4bab05b15c00d2184025693e9058c3531e23a095572846538b1eb034a4f7  tests/browser-pkce/driver/Cargo.lock
5f7510fc49d0b38d5103eb604b06beec1d11e02059c0d37b8df43cdae5da00c3  tests/browser-session-operation/driver/Cargo.toml
780405b6e1b1ed3099ee4a0b00cf005e125b31dab3103f74c8145113f525f319  tests/browser-session-operation/driver/Cargo.lock
3825a3e3fa22f4e729edcedab3f0ff8c35e5b10e41403344c2931dd3802c301c  tests/browser-signed-context/driver/Cargo.toml
865146c5bb52eb1e8254446cb9533bec7a18dadbbb56f8645c050e0de381d70a  tests/browser-signed-context/driver/Cargo.lock
f0e917bbbeed1041af1ee4ac5186bfc068391c8f56445234c0b6383c8c85494f  tests/browser-workspace/Cargo.toml
c1042abf3e193d841481bf96e6970ff8f9f9afdadba2c77070a1cec2b1261365  tests/browser-workspace/Cargo.lock
c6efc6e8cd417a71d9bbce3e7feac49ff76bd6bfc149ad4887d1292e83af8fa5  tests/browser-envelope/driver/Cargo.toml
433ec59245cd0967420e916fb78dd9bf55f8956483d725749296a99fd51195f9  tests/browser-envelope/driver/Cargo.lock
5479244eda1844c499dae0eeb7389636a95d2cb963236d69ea73bde5b7944de0  tests/browser-journal/driver/Cargo.toml
c51adee95d62abeb95ec604f6586239089d3cd3f9c20a69006af3b09d1e8c05f  tests/browser-journal/driver/Cargo.lock
caf5c34ef2b21d58c1aa12acf81cb13ace1adaffb3c69a641f54f490ed61cf66  crates/prismpm/vendor/hologram-live.tar
50d30c8e851f93e954ce291a1293178fdf7b05e54c1e2d8656de954e2d1c4286  tests/browser-command/driver/Cargo.toml
ae1f4a9598a079d13170b44de0d3720b0a9b97f6a8c4e3a2c15be2f4d631e296  tests/browser-command/driver/Cargo.lock
2eb490ad6542e9beab2e3ab7b69749105b886d3ffacf3ca4bed8ed15ed522c41  tests/browser-query/driver/Cargo.toml
66c14292fdc2f104e93bbdc066eccc0b40e1c6b60c922b7dabf066c9be798c34  tests/browser-query/driver/Cargo.lock
73b6f38f6888f93067159c3d17aa305711df701c29b3d8174f43e83860e4570e  tests/browser-view/driver/Cargo.toml
b7411e31c95754cabaf6dbc8c5c098a35c34d5dff04c9464f53b64ff0c1c9334  tests/browser-view/driver/Cargo.lock
f4dca0f2a7701b1fc6feb7be8265a14a4e554e54b67b24e9db1315e06c97dae2  tests/browser-effects/driver/Cargo.toml
fb5e3fc3ddf0638ba0cddae01dacee044e2c5c8073853c539b5123866a6bfc8c  tests/browser-effects/driver/Cargo.lock
dc950c22bf48664db608bd8465c4cc09d1fe11c3b2794c0cf814f4074e9e41db  tests/browser-presentation/driver/Cargo.toml
8b5da0f26acb2f0e6469b1391c9b9aeef064f3f78d07b9e493d00a665f39737a  tests/browser-presentation/driver/Cargo.lock
be78f8fdcd0b1d32bddb6b91361354aa039a1fc870e752d0bbdf5176af1e5b0d  tests/browser-p256/driver/Cargo.toml
481af8f15985ddd499ea766f2321852622f9e1ce916ba491133f6dd2358f37de  tests/browser-p256/driver/Cargo.lock
3bb3f581ebdc33a4a1d6f4f32be558ff70fc9a0cfc1f6fe1a36e2d7fc08b347d  tests/browser-account-genesis/driver/Cargo.toml
88d2036ac4e3604b23d2001708297b8f08721bf3632a6436945b0a1a8b24f975  tests/browser-account-genesis/driver/Cargo.lock
e3985612f8ddae1dbf8e649c23c6ed9d35f40b70feb8eab98a78bffd0101fbd2  tests/browser-session/driver/Cargo.toml
4b055d94b20e4dc5d6ac75e37b4aa7537feb0237519b23c0063c318b25dfcc1b  tests/browser-session/driver/Cargo.lock
4d8bc3edde13b2b118bd3abab9865fd8893b3080ad1dc48f3b11a58753526cd7  tests/browser-custody/driver/Cargo.toml
7f11c2e6d0d932ea640a5f951aead7a48938273e1974cc73d0a978ee7c998a6e  tests/browser-custody/driver/Cargo.lock
decdb37cfb832c7dd318a39a3fa3d1b4a5b565cfa185f8426a0672976d7679c6  tests/browser-operation-journal/driver/Cargo.toml
09bf968b39c494375885e670502ae46896e54eb1cc5e5a2f10d3ecffd3af4553  tests/browser-operation-journal/driver/Cargo.lock
82c7cd3972115e7b6450053ea26e95400f4755adda0aaf4bb5f785eca3bffe94  tests/publication-admission/driver/Cargo.toml
daabfe8f9dc97d9f535912d2b4d7b98d16c966faedcfe813891498071235643e  tests/publication-admission/driver/Cargo.lock
e43a097c1681ab92b0103c9ca89a2daf77944be9f42f48e5d8f19d0c73d1ac39  tests/browser-budget/driver/Cargo.toml
86c85fbf193ade5ddc093726c65d3eba275a1c055dfabbd94b219b807a295634  tests/browser-budget/driver/Cargo.lock
e209a9ad42e27f398843bdc495b2c41d9e4df92cc29fffac9bafc91bc46d55f8  tests/browser-dynamic-choice/driver/Cargo.toml
fb26a3adecae838da4829336eadfab60ab789f6879acf5dab991052c7e2deab7  tests/browser-dynamic-choice/driver/Cargo.lock
5ee4ee83f406983e1b0618ead74a531bbf145b98c69e44416f42c8eeebe2a3ef  tests/browser-semantic-presentation/driver/Cargo.toml
7723437c99a108aa122764cc4f2650fb3f4df31c93d6751b8ca9b94e173f2394  tests/browser-semantic-presentation/driver/Cargo.lock
88e5458038c2bb1f5a0751758cb5d067fd2789706f6155ea4223a579d1806d1f  tests/browser-session-journal/driver/Cargo.toml
58c3c659106ba6a867a53c3242d0ddf779f4efa6a77723e6cd8561aa89228808  tests/browser-session-journal/driver/Cargo.lock
88e5458038c2bb1f5a0751758cb5d067fd2789706f6155ea4223a579d1806d1f  tests/browser-session-journal/reservation-driver/Cargo.toml
58c3c659106ba6a867a53c3242d0ddf779f4efa6a77723e6cd8561aa89228808  tests/browser-session-journal/reservation-driver/Cargo.lock
390e0c91a074c251f1421bd235b7337de3ec66b12846ea3c84ed5a44c2d65602  tests/browser-session-journal-retention/driver/Cargo.toml
5763b92744d084940eddaa7615259c33c6c0433dbc3c4d6030c128e4e30de694  tests/browser-session-journal-retention/driver/Cargo.lock
af6eb657ebd7acdcefdba70d75677a4eaa9ba4a1817aed3fca3af92a305b75cd  tests/browser-session-journal-recovery/driver/Cargo.toml
87c364a090c2e8ba71d6ea1d609dc7e4964bf2c97a31952e7812511f4e1ea9c5  tests/browser-session-journal-recovery/driver/Cargo.lock
3cde22db13600774927c886dd9d73fa94b7a00015758e0f73405e39281a9f99b  tests/browser-session-payloads/driver/Cargo.toml
4a3480072a33c7f41262ea5580bd02875ba131db20d5b7e589666261f89b9436  tests/browser-session-payloads/driver/Cargo.lock
34169c97a21ca0991329bd83057a83168daf57ef08406f7196720924caa10457  tests/browser-session-recovery-frames/driver/Cargo.toml
928c20878b0b8998c5724c466f0da8171314596b18e2f513ad989a7b4d5ea4b7  tests/browser-session-recovery-frames/driver/Cargo.lock
afc2eba59a0b71686d03cb30838baaee9df92164f4ca3cf7a234e7adaf835e52  tests/publication-context-linkage/driver/Cargo.toml
12341ba204a1013407cadb89758af6144290623c9d0956d710c04225ae5f4f17  tests/publication-context-linkage/driver/Cargo.lock
2fb0bb8ba645ff99e72007455fbbb9b5ee0716e2182fb061f3a84ae37ffb1379  sdk/oracles/oscal/Cargo.toml
1e33bbf4be333f4f745e976f7b8529c559aea7b7dcc5b7905ca75ce416d5d2e1  sdk/oracles/oscal/Cargo.lock
63e9f1793c48cddffd4c8378fe230ea1972a128ded41a2dda5814e841fefc2f4  vendor/lean4-prod/rust/Cargo.toml
5e16d324b08b942c476099b6c10235f4ddd58bca28aaf69514b8a88c9252c88f  vendor/lean4-prod/rust/Cargo.lock
CHECKSUMS
cmp tests/hologram-oracle/Cargo.toml crates/prismpm/src/embedded/hologram-oracle.Cargo.toml
cmp tests/hologram-oracle/Cargo.lock crates/prismpm/src/embedded/hologram-oracle.Cargo.lock
cmp tests/hologram-oracle/src/main.rs crates/prismpm/src/embedded/hologram-oracle.main.rs
if [ "${1:-}" = --check ]; then
  exit 0
fi

oracle_work=$(mktemp -d)
trap 'rm -r -- "$oracle_work"' EXIT
mkdir -p "$oracle_work/hologram-live" "$oracle_work/harness/src"
tar -xf crates/prismpm/vendor/hologram-live.tar -C "$oracle_work/hologram-live"
cp tests/hologram-oracle/Cargo.toml "$oracle_work/harness/Cargo.toml"
cp tests/hologram-oracle/Cargo.lock "$oracle_work/harness/Cargo.lock"
cp tests/hologram-oracle/src/main.rs "$oracle_work/harness/src/main.rs"

for manifest in "$oracle_work/harness/Cargo.toml" \
  tests/holo-codec-oracle/Cargo.toml \
  tests/holo-browser-codec/Cargo.toml \
  tests/holo-primary-component/driver/Cargo.toml \
  tests/browser-pkce/driver/Cargo.toml \
  tests/browser-session-operation/driver/Cargo.toml \
  tests/browser-signed-context/driver/Cargo.toml \
  tests/browser-workspace/Cargo.toml \
  tests/browser-envelope/driver/Cargo.toml \
  tests/browser-journal/driver/Cargo.toml \
  tests/browser-command/driver/Cargo.toml \
  tests/browser-query/driver/Cargo.toml \
  tests/browser-view/driver/Cargo.toml \
  tests/browser-effects/driver/Cargo.toml \
  tests/browser-presentation/driver/Cargo.toml \
  tests/browser-p256/driver/Cargo.toml \
  tests/browser-account-genesis/driver/Cargo.toml \
  tests/browser-session/driver/Cargo.toml \
  tests/browser-custody/driver/Cargo.toml \
  tests/browser-operation-journal/driver/Cargo.toml \
  tests/publication-admission/driver/Cargo.toml \
  tests/browser-budget/driver/Cargo.toml \
  tests/browser-dynamic-choice/driver/Cargo.toml \
  tests/browser-semantic-presentation/driver/Cargo.toml \
  tests/browser-session-journal/driver/Cargo.toml \
  tests/browser-session-journal/reservation-driver/Cargo.toml \
  tests/browser-session-journal-retention/driver/Cargo.toml \
  tests/browser-session-journal-recovery/driver/Cargo.toml \
  tests/browser-session-payloads/driver/Cargo.toml \
  tests/browser-session-recovery-frames/driver/Cargo.toml \
  tests/publication-context-linkage/driver/Cargo.toml \
  sdk/oracles/oscal/Cargo.toml \
  vendor/lean4-prod/rust/Cargo.toml; do
  cargo fetch --locked --manifest-path "$manifest"
  cargo metadata --locked --offline --format-version 1 --manifest-path "$manifest" >/dev/null
done
