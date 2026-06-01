// Unit tests for RFC 8785 canonicalization — the foundation every
// signature rests on. These are pure-function tests: no server, no disk.

import test from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "../../src/lib/canonical.js";

test("primitives serialize per JCS", () => {
  assert.equal(canonicalize(null), "null");
  assert.equal(canonicalize(true), "true");
  assert.equal(canonicalize(false), "false");
  assert.equal(canonicalize(0), "0");
  assert.equal(canonicalize(-0), "0"); // negative zero collapses
  assert.equal(canonicalize(42), "42");
  assert.equal(canonicalize(-7), "-7");
  assert.equal(canonicalize("hi"), '"hi"');
});

test("object keys sort by code point, recursively", () => {
  const a = canonicalize({ b: { d: 1, c: 2 }, a: 3 });
  assert.equal(a, '{"a":3,"b":{"c":2,"d":1}}');
});

test("array order is preserved", () => {
  assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
});

test("control characters are escaped, printable kept", () => {
  assert.equal(canonicalize("a\nb\tc"), '"a\\nb\\tc"');
  assert.equal(canonicalize(""), '"\\u0001\\u001f"');
  assert.equal(canonicalize("quote\"and\\slash"), '"quote\\"and\\\\slash"');
});

test("unicode above 0x1f is passed through unescaped", () => {
  assert.equal(canonicalize("café — 日本語"), '"café — 日本語"');
});

test("non-finite numbers are rejected", () => {
  assert.throws(() => canonicalize(Infinity), /non-finite/);
  assert.throws(() => canonicalize(-Infinity), /non-finite/);
  assert.throws(() => canonicalize(NaN), /non-finite/);
});

test("undefined is rejected (only explicit null is encodable)", () => {
  assert.throws(() => canonicalize(undefined), /unsupported value/);
});

test("two logically-equal objects canonicalize identically", () => {
  const x = { id: "01", nested: { z: [1, 2], a: "v" }, flag: true };
  const y = { flag: true, nested: { a: "v", z: [1, 2] }, id: "01" };
  assert.equal(canonicalize(x), canonicalize(y));
});
