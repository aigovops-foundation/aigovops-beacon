// Unit tests for the audit-bundle exporter.
//
// The bundle is the artifact an auditor receives, so these tests assert the
// properties an auditor depends on and that a previous version got wrong:
//
//   * `manifest.sha256` is the digest of manifest.json's bytes, so the
//     `sha256sum -c` it is formatted for actually passes;
//   * every signing key is shipped, not just the active one, so a bundle whose
//     range spans a key rotation is verifiable at all;
//   * the self-verification pass resolves each receipt's key from its own
//     `key_fpr` rather than assuming the active key signed everything;
//   * the verifier itself is in the bundle, and VERIFY.md names it.
//
// The exporter only ever reads from `db`, so a literal stub stands in for
// SQLite here — these tests are about bundle shape, not storage.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import nacl from "tweetnacl";
import { createExportService } from "../../src/services/export.js";
import { canonicalize } from "../../src/lib/canonical.js";
import { sign } from "../../src/services/keys.js";

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function freshKey() {
  const kp = nacl.sign.keyPair();
  const publicKey = Buffer.from(kp.publicKey);
  return {
    fingerprint: sha256Hex(publicKey).slice(0, 16),
    algorithm: "Ed25519",
    createdAt: new Date().toISOString(),
    publicKey,
    publicKeyHex: publicKey.toString("hex"),
    secretKey: Buffer.from(kp.secretKey),
  };
}

// A receipt in the shape server/src/services/receipts.js writes.
function signedReceipt(key, overrides = {}) {
  const base = {
    id: overrides.id || `01J${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    ts_utc: new Date().toISOString(),
    schema_version: "1.0.0",
    vendor: "OpenAI",
    model: "gpt-4o-mini",
    version: "2024-07-18",
    event_type: "invocation",
    environment: "production",
    ...overrides,
  };
  return {
    ...base,
    signature: {
      alg: "Ed25519",
      key_fpr: key.fingerprint,
      canonical_form: "RFC8785",
      sig_b64: sign(key.secretKey, Buffer.from(canonicalize(base), "utf8")),
    },
  };
}

// Builds a data dir the exporter can read: keys on disk, receipts in NDJSON.
function makeFixture({ keys, receiptsByDay }) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-export-"));
  fs.mkdirSync(path.join(dataDir, "keys"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "receipts"), { recursive: true });

  for (const k of keys) {
    fs.writeFileSync(
      path.join(dataDir, "keys", `ed25519-${k.fingerprint}.json`),
      JSON.stringify(
        {
          fingerprint: k.fingerprint,
          algorithm: k.algorithm,
          createdAt: k.createdAt,
          publicKeyHex: k.publicKeyHex,
          secretKeyHex: k.secretKey.toString("hex"),
        },
        null,
        2
      )
    );
  }

  for (const [day, receipts] of Object.entries(receiptsByDay)) {
    fs.writeFileSync(
      path.join(dataDir, "receipts", `${day}.ndjson`),
      receipts.map((r) => JSON.stringify(r)).join("\n") + "\n"
    );
  }

  const config = {
    dataDir,
    beaconVersion: "0.1.0-test",
    repoRoot: path.resolve(import.meta.dirname, "..", "..", ".."),
    signing: { canonicalForm: "RFC8785" },
  };

  // The exporter reads inventory/attestations/gate_decisions and nothing else.
  const db = { prepare: () => ({ get: () => undefined, all: () => [] }) };

  return { config, db, dataDir };
}

function readBundle(bundlePath) {
  return {
    manifest: JSON.parse(
      fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf8")
    ),
    manifestRaw: fs.readFileSync(path.join(bundlePath, "manifest.json")),
    digestLine: fs.readFileSync(
      path.join(bundlePath, "manifest.sha256"),
      "utf8"
    ),
    verifyMd: fs.readFileSync(path.join(bundlePath, "VERIFY.md"), "utf8"),
    keyFiles: fs.readdirSync(path.join(bundlePath, "public_keys")).sort(),
  };
}

test("manifest.sha256 is the digest of manifest.json's own bytes", () => {
  const key = freshKey();
  const { config, db } = makeFixture({
    keys: [key],
    receiptsByDay: { "2026-07-30": [signedReceipt(key), signedReceipt(key)] },
  });
  const out = createExportService({ config, db, activeKey: key }).build({});
  const bundle = readBundle(out.bundle_path);

  const [recorded, name] = bundle.digestLine.trim().split(/\s+/);
  assert.equal(name, "manifest.json");
  // This is the property `sha256sum -c manifest.sha256` checks. Hashing the
  // manifest's canonical form instead — as an earlier version did — makes that
  // command fail on a bundle that is perfectly intact.
  assert.equal(recorded, sha256Hex(bundle.manifestRaw));
  assert.notEqual(
    recorded,
    sha256Hex(Buffer.from(canonicalize(bundle.manifest), "utf8"))
  );
  assert.equal(out.manifest_sha256, recorded);
});

test("every signing key ships, so a bundle spanning a rotation verifies", () => {
  const older = freshKey();
  older.createdAt = "2026-01-01T00:00:00.000Z";
  const active = freshKey();

  const { config, db } = makeFixture({
    keys: [older, active],
    receiptsByDay: {
      "2026-07-29": [signedReceipt(older), signedReceipt(older)],
      "2026-07-30": [signedReceipt(active)],
    },
  });

  const out = createExportService({ config, db, activeKey: active }).build({});
  const bundle = readBundle(out.bundle_path);

  assert.deepEqual(
    bundle.keyFiles.sort(),
    [`${active.fingerprint}.pem`, `${older.fingerprint}.pem`].sort()
  );
  assert.deepEqual(
    [...out.public_key_fingerprints].sort(),
    [active.fingerprint, older.fingerprint].sort()
  );
  assert.deepEqual(
    [...bundle.manifest.public_key_fingerprints].sort(),
    [active.fingerprint, older.fingerprint].sort()
  );

  // All three receipts verify, including the two signed by the retired key.
  assert.equal(out.verification.receipts_verified, 3);
  assert.equal(out.verification.receipts_failed, 0);
});

test("self-verification reports a tampered receipt rather than passing it", () => {
  const key = freshKey();
  const good = signedReceipt(key);
  const tampered = signedReceipt(key, { id: "01JTAMPERED" });
  tampered.model = "swapped-after-signing";

  const { config, db } = makeFixture({
    keys: [key],
    receiptsByDay: { "2026-07-30": [good, tampered] },
  });

  const out = createExportService({ config, db, activeKey: key }).build({});
  assert.equal(out.verification.receipts_verified, 1);
  assert.equal(out.verification.receipts_failed, 1);
  assert.deepEqual(out.verification.failures, ["01JTAMPERED"]);
});

test("a receipt naming an unknown key fails when other keys are present", () => {
  const key = freshKey();
  const stranger = freshKey();
  const orphan = signedReceipt(stranger, { id: "01JORPHAN" });

  const { config, db } = makeFixture({
    keys: [key],
    receiptsByDay: { "2026-07-30": [signedReceipt(key), orphan] },
  });
  // Two keys in the bundle means no single-key fallback: the orphan receipt's
  // key_fpr matches neither, and it must not be counted as verified.
  fs.writeFileSync(
    path.join(config.dataDir, "keys", `ed25519-${stranger.fingerprint}.json`),
    JSON.stringify({
      fingerprint: stranger.fingerprint,
      algorithm: "Ed25519",
      createdAt: "2026-02-01T00:00:00.000Z",
      publicKeyHex: freshKey().publicKeyHex, // deliberately the wrong key bytes
      secretKeyHex: stranger.secretKey.toString("hex"),
    })
  );

  const out = createExportService({ config, db, activeKey: key }).build({});
  assert.equal(out.verification.receipts_failed, 1);
  assert.deepEqual(out.verification.failures, ["01JORPHAN"]);
});

test("the bundle carries the verifier and VERIFY.md names the command", () => {
  const key = freshKey();
  const { config, db } = makeFixture({
    keys: [key],
    receiptsByDay: { "2026-07-30": [signedReceipt(key)] },
  });

  const out = createExportService({ config, db, activeKey: key }).build({});
  assert.equal(out.verifier_included, true);

  const verifier = path.join(out.bundle_path, "verify_bundle.py");
  assert.ok(fs.existsSync(verifier), "verify_bundle.py should be in the bundle");
  assert.ok(
    fs.readFileSync(verifier, "utf8").includes("beacon-verify"),
    "the bundled verifier should be src/beacon_verify.py"
  );

  const bundle = readBundle(out.bundle_path);
  assert.match(bundle.verifyMd, /python3 verify_bundle\.py \./);
  // The old text told auditors to use "a small Node script" that was never
  // supplied, and a `sha256sum` invocation that could not have passed.
  assert.doesNotMatch(bundle.verifyMd, /small Node script/);
});

test("VERIFY.md falls back to fetch instructions when the verifier is absent", () => {
  const key = freshKey();
  const { config, db } = makeFixture({
    keys: [key],
    receiptsByDay: { "2026-07-30": [signedReceipt(key)] },
  });
  // An install that carries the server but not the Python source.
  config.repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-noroot-"));

  const out = createExportService({ config, db, activeKey: key }).build({});
  assert.equal(out.verifier_included, false);

  const bundle = readBundle(out.bundle_path);
  assert.match(bundle.verifyMd, /curl -O https:\/\/raw\.githubusercontent\.com/);
  assert.match(bundle.verifyMd, /python3 beacon_verify\.py \./);
});
