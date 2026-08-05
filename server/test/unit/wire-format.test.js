// schema_version 1.1.0 — the wire format, and the compatibility that has to
// survive it.
//
// docs/RECEIPT_SCHEMA.md specified `canonical_form: "json/c14n-rfc8785"` and an
// SSH-style `key_fpr`; this server wrote `"RFC8785"` and a 16-hex fingerprint.
// The schema recorded that as a bug to be fixed "as its own change with a
// schema_version bump rather than done quietly". This is that change.
//
// The bytes being SIGNED never changed — only the labels around the signature —
// which is why correcting it cannot invalidate anything. The risk is entirely in
// KEY RESOLUTION: a bundle whose range spans this upgrade holds receipts naming
// the same key by two different spellings, and a verifier that indexes only one
// will fail receipts that are perfectly intact. That is what the last test here
// exists to catch.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bootTestServer } from "../helpers/server.js";
import {
  sshFingerprint,
  fingerprintSpellings,
  sign,
  generateAndPersistKey,
} from "../../src/services/keys.js";
import { canonicalize } from "../../src/lib/canonical.js";
import { createExportService } from "../../src/services/export.js";
import { createReceiptService } from "../../src/services/receipts.js";

test("sshFingerprint is ssh-keygen -lf compatible", () => {
  const pub = Buffer.alloc(32, 3);
  const digest = crypto.createHash("sha256").update(pub).digest();
  assert.equal(
    sshFingerprint(pub),
    "SHA256:" + digest.toString("base64").replace(/=+$/, "")
  );
  // No padding, and the prefix the schema asks for.
  assert.ok(sshFingerprint(pub).startsWith("SHA256:"));
  assert.ok(!sshFingerprint(pub).endsWith("="));
});

test("fingerprintSpellings covers both eras of the wire format", () => {
  const pub = Buffer.alloc(32, 3);
  const spellings = fingerprintSpellings(pub);
  const digest = crypto.createHash("sha256").update(pub).digest();
  assert.deepEqual(spellings, [
    sshFingerprint(pub), // 1.1.0+
    digest.toString("hex").slice(0, 16), // 1.0.0
    digest.toString("hex"),
  ]);
});

test("the storage id stays filename-safe while the wire id does not have to be", () => {
  // This is why they are two fields and not one. The SSH-style form is base64
  // and can contain `/`, so it can never name a file — while the hex form is
  // what public_keys/<fpr>.pem and keys/ed25519-<fpr>.json are called.
  const pub = Buffer.from(
    "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    "hex"
  );
  assert.ok(sshFingerprint(pub).includes("/"), "fixture chosen for this case");
  const storageId = fingerprintSpellings(pub)[1];
  assert.match(storageId, /^[0-9a-f]{16}$/);
});

test("a fresh receipt carries the spellings docs/RECEIPT_SCHEMA.md specifies", async () => {
  const ctx = await bootTestServer();
  try {
    // Services are constructed by the router, not hung on ctx.
    const receipt = createReceiptService(ctx.ctx).write({
      event_type: "invocation",
      vendor: "openai",
      model: "gpt-4o",
      version: "2024-08-06",
      environment: "prod",
    });

    assert.equal(receipt.schema_version, "1.1.0");
    assert.equal(receipt.signature.canonical_form, "json/c14n-rfc8785");
    assert.match(receipt.signature.key_fpr, /^SHA256:[A-Za-z0-9+/]+$/);
    assert.equal(receipt.signature.key_fpr, ctx.ctx.activeKey.keyFpr);
    // The storage id is unchanged and still hex — the key file on disk did not
    // have to be renamed for any of this.
    assert.match(ctx.ctx.activeKey.fingerprint, /^[0-9a-f]{16}$/);
  } finally {
    ctx.cleanup();
  }
});

test("a bundle spanning the upgrade verifies — both spellings, one key", async () => {
  // THE test. Write a 1.1.0 receipt through the service, then hand-sign a
  // 1.0.0-style receipt with the SAME key and the OLD key_fpr spelling, append
  // it to the same day's NDJSON, and export. Before export.js indexed every
  // spelling this fell through to the single-key path, which would have hidden
  // the bug here and failed in the field on any bundle that also spans a key
  // rotation.
  const ctx = await bootTestServer();
  try {
    // A SECOND key on disk, so the bundle carries two and export.js's
    // "only one key, try it anyway" fallback cannot rescue a failed lookup.
    // With a single key this test passes even with the bug present — which is
    // precisely how the bug would have reached a real rotated bundle.
    generateAndPersistKey(ctx.ctx.config);

    createReceiptService(ctx.ctx).write({
      event_type: "invocation",
      vendor: "openai",
      model: "gpt-4o",
      version: "2024-08-06",
      environment: "prod",
    });

    const activeKey = ctx.ctx.activeKey;
    const legacyBase = {
      id: "01HXYZ8K3F2N5Q1R7S9V3W4Y6B",
      ts_utc: new Date().toISOString(),
      schema_version: "1.0.0",
      vendor: "anthropic",
      model: "claude",
      version: "1",
      event_type: "invocation",
      environment: "prod",
    };
    const legacy = {
      ...legacyBase,
      signature: {
        alg: "Ed25519",
        // The 1.0.0 spellings, signed by the key that is active now.
        key_fpr: fingerprintSpellings(activeKey.publicKey)[1],
        canonical_form: "RFC8785",
        sig_b64: sign(
          activeKey.secretKey,
          Buffer.from(canonicalize(legacyBase), "utf8")
        ),
      },
    };

    const day = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(
      path.join(ctx.dataDir, "receipts", `${day}.ndjson`),
      JSON.stringify(legacy) + "\n"
    );

    const result = createExportService(ctx.ctx).build({ user: { email: "t@x" } });

    assert.equal(
      result.verification.receipts_failed,
      0,
      `failures: ${JSON.stringify(result.verification.failures)}`
    );
    assert.equal(result.verification.receipts_verified, 2);
    assert.equal(
      result.public_key_fingerprints.length,
      2,
      "the two-key setup is what makes this test able to fail"
    );
  } finally {
    ctx.cleanup();
  }
});
