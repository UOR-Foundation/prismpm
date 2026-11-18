import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { admit, readAdmitted } from "../src/blob.mjs";
import { enc, entry } from "./helpers.mjs";

test("a blob is admitted only when it decodes to bytes with the manifest's BLAKE3 label", () => {
  const bytes = enc.encode("Init.olean bytes");
  const e = entry(bytes);
  assert.deepEqual(admit(e, gzipSync(bytes)), bytes);
  assert.deepEqual(admit({ ...e, encoding: "identity" }, bytes), bytes);
  const changed = bytes.slice(); changed[3] ^= 1;
  assert.equal(admit(e, gzipSync(changed)), null, "a changed byte is a miss");
  assert.equal(admit(e, bytes), null, "bytes that do not decode are a miss");
  assert.equal(admit({ ...e, bytes: e.bytes + 1 }, gzipSync(bytes)), null, "a wrong length is a miss");
  assert.equal(admit(e, null), null);
});

test("a miss is read again once, then refused with lean-prover.blob", async () => {
  const bytes = enc.encode("library file");
  const e = entry(bytes);
  const asked = [];
  const good = gzipSync(bytes), bad = gzipSync(enc.encode("other"));
  const out = await readAdmitted((label, o) => { asked.push(o.refetch); return o.refetch ? good : bad; }, e, "x");
  assert.deepEqual(out, bytes);
  assert.deepEqual(asked, [false, true]);
  await assert.rejects(readAdmitted(() => bad, e, "x"), (err) => err.code === "lean-prover.blob");
});

test("the encoding never changes admission or the bytes the prover reads", () => {
  const bytes = enc.encode("same bytes, two encodings");
  const e = entry(bytes);
  assert.deepEqual(admit(e, gzipSync(bytes, { level: 1 })), admit({ ...e, encoding: "identity" }, bytes));
});
