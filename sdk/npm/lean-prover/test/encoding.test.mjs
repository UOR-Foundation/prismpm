import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { admit } from "../src/blob.mjs";
import { enc, entry } from "./helpers.mjs";

test("the encoding never changes admission or the bytes the prover reads", () => {
  const bytes = enc.encode("same bytes, two encodings");
  const e = entry(bytes);
  for (const level of [1, 6, 9]) assert.deepEqual(admit(e, gzipSync(bytes, { level })), bytes);
  assert.deepEqual(admit({ ...e, encoding: "identity", encodedBytes: bytes.length }, bytes), bytes);
  const other = enc.encode("other bytes");
  assert.equal(admit(e, gzipSync(other)), null);
  assert.equal(admit({ ...e, encoding: "identity" }, other), null, "a blob refused in one encoding is refused in the other");
});
