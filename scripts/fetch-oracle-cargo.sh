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
f4f509d4944c26b80cd193f34c8540ce947f32fddde21086f7a8b0ee0226f6fb  tests/holo-primary-component/driver/Cargo.toml
1d134cffda1ede9a482bab8dfdfb2c5bdc5dbe519d23199e2c256d772f5af5d0  tests/holo-primary-component/driver/Cargo.lock
f10516f4dadd400a2ebfe3dba12a864d955b7d74d9a42d31440cfe9f1d1a06d5  tests/browser-pkce/driver/Cargo.toml
5f3a4bab05b15c00d2184025693e9058c3531e23a095572846538b1eb034a4f7  tests/browser-pkce/driver/Cargo.lock
ba7c379fbd1bec12820138025a40d18a8d78438cb7f28bd62a4b10e17aa6e6b6  tests/browser-session-operation/driver/Cargo.toml
780405b6e1b1ed3099ee4a0b00cf005e125b31dab3103f74c8145113f525f319  tests/browser-session-operation/driver/Cargo.lock
4b081a50b4fb7ed3123b9614973266cdcd80c1b80805bb9af7d763628aa2082a  tests/browser-signed-context/driver/Cargo.toml
865146c5bb52eb1e8254446cb9533bec7a18dadbbb56f8645c050e0de381d70a  tests/browser-signed-context/driver/Cargo.lock
ef0863c074b3ddfccbd3fbf6610f50a60934e71af94ce6173c62be90e7303454  tests/browser-workspace/Cargo.toml
e0760aabe262c5faf7adf184e9abc6e9518084530ffe4df7b1850ce8fa6dbe92  tests/browser-workspace/Cargo.lock
d82e387edc5ebc0e7c871ba0f8872b3f2649d55cffee661dfc81bb15bb8a5dfb  tests/browser-envelope/driver/Cargo.toml
433ec59245cd0967420e916fb78dd9bf55f8956483d725749296a99fd51195f9  tests/browser-envelope/driver/Cargo.lock
29400c9e41ff4bdd38c076162ec58c7c86ed385dfa2e8ea6214b9e60435644b1  tests/browser-journal/driver/Cargo.toml
c51adee95d62abeb95ec604f6586239089d3cd3f9c20a69006af3b09d1e8c05f  tests/browser-journal/driver/Cargo.lock
caf5c34ef2b21d58c1aa12acf81cb13ace1adaffb3c69a641f54f490ed61cf66  crates/prismpm/vendor/hologram-live.tar
2fbac4abadf6e829388cfa30f58898f8b39daa547a03cd184395315b6e1b5484  tests/browser-command/driver/Cargo.toml
ae1f4a9598a079d13170b44de0d3720b0a9b97f6a8c4e3a2c15be2f4d631e296  tests/browser-command/driver/Cargo.lock
7a94f169b4dfafcbdf60bc937e5010fa54294e4877734356abc2dd63b707f31c  tests/browser-query/driver/Cargo.toml
66c14292fdc2f104e93bbdc066eccc0b40e1c6b60c922b7dabf066c9be798c34  tests/browser-query/driver/Cargo.lock
31a14e80b87945140ec3c894627621ab1b8fdf52a0b13c63bf0ffcc8648ec814  tests/browser-view/driver/Cargo.toml
b7411e31c95754cabaf6dbc8c5c098a35c34d5dff04c9464f53b64ff0c1c9334  tests/browser-view/driver/Cargo.lock
142eae324d5056c0a735399914fcd0a7c644d400ce81a4fd98630f09c76d6935  tests/browser-effects/driver/Cargo.toml
fb5e3fc3ddf0638ba0cddae01dacee044e2c5c8073853c539b5123866a6bfc8c  tests/browser-effects/driver/Cargo.lock
4e552c9f767cccf6e5218d41839db5d6817943b9f590ec2f5332e082b5f5f198  tests/browser-presentation/driver/Cargo.toml
8b5da0f26acb2f0e6469b1391c9b9aeef064f3f78d07b9e493d00a665f39737a  tests/browser-presentation/driver/Cargo.lock
452fe74652146b6d53ae18f39e59fd0bb87a3f572b59bc201fe5fb2a13525bfc  tests/browser-p256/driver/Cargo.toml
481af8f15985ddd499ea766f2321852622f9e1ce916ba491133f6dd2358f37de  tests/browser-p256/driver/Cargo.lock
9231c4aed5d035efa24f350998412fd7c2245c94e133eba361f70d9170468aba  tests/browser-account-genesis/driver/Cargo.toml
88d2036ac4e3604b23d2001708297b8f08721bf3632a6436945b0a1a8b24f975  tests/browser-account-genesis/driver/Cargo.lock
7a718d1826fed8d9bf03c66a955181709bfa0841be7b8405563e1e847ce8e3dc  tests/browser-session/driver/Cargo.toml
4b055d94b20e4dc5d6ac75e37b4aa7537feb0237519b23c0063c318b25dfcc1b  tests/browser-session/driver/Cargo.lock
09358667234a3bd05ca3a3ae0c652fe1bac3b0647002cae781f3faffc887e769  tests/browser-custody/driver/Cargo.toml
7f11c2e6d0d932ea640a5f951aead7a48938273e1974cc73d0a978ee7c998a6e  tests/browser-custody/driver/Cargo.lock
0818395d9e8997a0ee0b4a2eea4b1b2c884743d89d690b5b2536b4a5f6dd4a3c  tests/browser-operation-journal/driver/Cargo.toml
09bf968b39c494375885e670502ae46896e54eb1cc5e5a2f10d3ecffd3af4553  tests/browser-operation-journal/driver/Cargo.lock
b6434d4dfbd8f30fc15332fc2aa5cec524dbea2e7fe5e8bccf11910d00ac9b11  tests/publication-admission/driver/Cargo.toml
daabfe8f9dc97d9f535912d2b4d7b98d16c966faedcfe813891498071235643e  tests/publication-admission/driver/Cargo.lock
f7cdb135602bc50a7eb7004f92dcad4964038bdd25ab112eb156df494fdd1d7a  tests/browser-budget/driver/Cargo.toml
86c85fbf193ade5ddc093726c65d3eba275a1c055dfabbd94b219b807a295634  tests/browser-budget/driver/Cargo.lock
daf7f338bc60de1c7ad7c2330cc8f1698573933c0ca0ee730eb4c5bac0d29d8e  tests/browser-dynamic-choice/driver/Cargo.toml
fb26a3adecae838da4829336eadfab60ab789f6879acf5dab991052c7e2deab7  tests/browser-dynamic-choice/driver/Cargo.lock
53e67644ca16396d3a55f7edf0c482bf2fad82110409498c62af45a9636ee42f  tests/browser-semantic-presentation/driver/Cargo.toml
7723437c99a108aa122764cc4f2650fb3f4df31c93d6751b8ca9b94e173f2394  tests/browser-semantic-presentation/driver/Cargo.lock
2171d8140dbce6f6c33f51b54e24b407ad05e1c97df1987d3fb1922daaa1a409  tests/browser-session-journal/driver/Cargo.toml
58c3c659106ba6a867a53c3242d0ddf779f4efa6a77723e6cd8561aa89228808  tests/browser-session-journal/driver/Cargo.lock
2171d8140dbce6f6c33f51b54e24b407ad05e1c97df1987d3fb1922daaa1a409  tests/browser-session-journal/reservation-driver/Cargo.toml
58c3c659106ba6a867a53c3242d0ddf779f4efa6a77723e6cd8561aa89228808  tests/browser-session-journal/reservation-driver/Cargo.lock
38359e1db950f30f83521b8ae76b39ad2ba7a8e302c3830034a73875fb1a7864  tests/browser-session-journal-retention/driver/Cargo.toml
5763b92744d084940eddaa7615259c33c6c0433dbc3c4d6030c128e4e30de694  tests/browser-session-journal-retention/driver/Cargo.lock
712f5e4b465fd89ad0ec62726f86db266cc5c2cefa6bf076f8347dd19f5e6949  tests/browser-session-journal-recovery/driver/Cargo.toml
87c364a090c2e8ba71d6ea1d609dc7e4964bf2c97a31952e7812511f4e1ea9c5  tests/browser-session-journal-recovery/driver/Cargo.lock
690934d62c16c241c92e294697454e6188ba0f20fa73967ff7c67fc2a31e2a34  tests/browser-session-payloads/driver/Cargo.toml
4a3480072a33c7f41262ea5580bd02875ba131db20d5b7e589666261f89b9436  tests/browser-session-payloads/driver/Cargo.lock
7c0d97fc4688766f7928670b1857442882c4937458d3bd1a3e00e31c91b9940a  tests/browser-session-recovery-frames/driver/Cargo.toml
928c20878b0b8998c5724c466f0da8171314596b18e2f513ad989a7b4d5ea4b7  tests/browser-session-recovery-frames/driver/Cargo.lock
d9e72b04fc5c6d3db7a078fd871aa0cabf48b1f0d7ac5f650253ba640f9a5903  tests/publication-context-linkage/driver/Cargo.toml
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
