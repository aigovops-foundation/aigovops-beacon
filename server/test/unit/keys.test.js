// Unit tests for the Ed25519 sign/verify primitives.

import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { sign, verify } from "../../src/services/keys.js";

function freshKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    secretKey: Buffer.from(kp.secretKey),
    publicKey: Buffer.from(kp.publicKey),
  };
}

test("sign then verify is a clean round-trip", () => {
  const { secretKey, publicKey } = freshKeypair();
  const msg = Buffer.from("the message", "utf8");
  const sig = sign(secretKey, msg);
  assert.equal(typeof sig, "string");
  assert.equal(verify(publicKey, msg, sig), true);
});

test("a tampered message fails verification", () => {
  const { secretKey, publicKey } = freshKeypair();
  const sig = sign(secretKey, Buffer.from("original", "utf8"));
  assert.equal(verify(publicKey, Buffer.from("tampered", "utf8"), sig), false);
});

test("a signature from a different key fails verification", () => {
  const a = freshKeypair();
  const b = freshKeypair();
  const msg = Buffer.from("shared message", "utf8");
  const sig = sign(a.secretKey, msg);
  assert.equal(verify(b.publicKey, msg, sig), false);
});

test("a corrupted signature fails verification, not throws", () => {
  const { secretKey, publicKey } = freshKeypair();
  const msg = Buffer.from("data", "utf8");
  const sig = sign(secretKey, msg);
  const corrupted = Buffer.from(sig, "base64");
  corrupted[0] ^= 0xff;
  const result = verify(publicKey, msg, corrupted.toString("base64"));
  assert.equal(result, false);
});
