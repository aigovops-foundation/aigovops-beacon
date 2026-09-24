// Every JS canonicalizer must reproduce the published vectors byte for byte.
//
// Beacon signs canonical BYTES. Two implementations that disagree by one byte
// produce signatures that will not verify against each other — and the failure
// surfaces at the auditor, on evidence that is actually intact.
//
// tests/vectors/canonicalization.json is the shared artifact; the Python suite
// (tests/unit/test_canonicalization_vectors.py) asserts the same file against
// beacons/_common.py and src/beacon_verify.py. One file, every language.
//
// lab-service/shared/canonical.js is checked here too. It is a vendored copy
// that tests/unit/test_vendored_lab_components.py already pins byte-identical to
// the reference — but that test would still pass if BOTH files were wrong
// together, and this one would not.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize } from "../../src/lib/canonical.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const doc = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "tests", "vectors", "canonicalization.json"),
    "utf8"
  )
);
const VECTORS = doc.vectors;

// Loaded dynamically: lab-service is a separate project and may not be present
// in every checkout, but when it is there it must agree.
let labCanonicalize = null;
const labPath = path.join(REPO_ROOT, "lab-service", "shared", "canonical.js");
if (fs.existsSync(labPath)) {
  ({ canonicalize: labCanonicalize } = await import(labPath));
}

test("the vector file is populated", () => {
  // A test that silently iterates zero cases is worse than no test.
  assert.ok(VECTORS.length >= 20, `only ${VECTORS.length} vectors`);
  assert.equal(doc.canonical_form, "json/c14n-rfc8785");
});

for (const v of VECTORS) {
  test(`server/src/lib/canonical.js: ${v.name}`, () => {
    assert.equal(canonicalize(v.input), v.canonical);
  });
}

test("lab-service/shared/canonical.js agrees on every vector", (t) => {
  if (!labCanonicalize) {
    t.skip("lab-service/shared/canonical.js not present in this checkout");
    return;
  }
  for (const v of VECTORS) {
    assert.equal(labCanonicalize(v.input), v.canonical, v.name);
  }
});

test("key order in the input cannot change the output", () => {
  const a = { b: 1, a: { d: 2, c: 3 }, z: [1, 2] };
  const b = { z: [1, 2], a: { c: 3, d: 2 }, b: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
});
