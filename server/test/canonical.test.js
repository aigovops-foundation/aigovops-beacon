// Sanity tests for canonicalization and Ed25519 signing.
// Run with: node --test test/

import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { canonicalize } from "../src/lib/canonical.js";
import { sign, verify } from "../src/services/keys.js";

test("canonicalize sorts object keys", () => {
  const a = canonicalize({ b: 1, a: 2 });
  const b = canonicalize({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1}');
});

test("canonicalize escapes control characters", () => {
  const s = canonicalize({ s: "a\nb\tc" });
  assert.equal(s, '{"s":"a\\nb\\tc"}');
});

test("canonicalize handles nested structures deterministically", () => {
  const v1 = canonicalize({ outer: { z: 1, a: [3, 2, 1] } });
  const v2 = canonicalize({ outer: { a: [3, 2, 1], z: 1 } });
  assert.equal(v1, v2);
});

test("Ed25519 sign and verify roundtrip on canonical bytes", () => {
  const kp = nacl.sign.keyPair();
  const payload = { id: "01", value: "hello" };
  const bytes = Buffer.from(canonicalize(payload), "utf8");
  const sigB64 = sign(Buffer.from(kp.secretKey), bytes);
  assert.equal(verify(Buffer.from(kp.publicKey), bytes, sigB64), true);

  const tampered = Buffer.from(canonicalize({ ...payload, value: "bye" }), "utf8");
  assert.equal(verify(Buffer.from(kp.publicKey), tampered, sigB64), false);
});
