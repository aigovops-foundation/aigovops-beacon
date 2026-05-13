// Audit export — produces a self-contained tarball your auditor can
// verify without Beacon installed.
//
// Contents:
//   manifest.json                 inventory, packs, range, key fingerprints
//   receipts/YYYY-MM-DD.ndjson    raw receipts (copies)
//   public_keys/<fpr>.pem         PEM-encoded public keys
//   policies/                     copies of policy + rego
//   checklists/                   copies of pack YAMLs
//   VERIFY.md                     human-readable verification steps

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalize } from "../lib/canonical.js";
import { verify } from "./keys.js";

export function createExportService(ctx) {
  const { config, db, activeKey } = ctx;

  return {
    build({ inventoryId, fromDate, toDate, user }) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const bundleDir = path.join(
        config.dataDir,
        "bundles",
        `bundle-${stamp}`
      );
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.mkdirSync(path.join(bundleDir, "receipts"), { recursive: true });
      fs.mkdirSync(path.join(bundleDir, "public_keys"), { recursive: true });
      fs.mkdirSync(path.join(bundleDir, "policies"), { recursive: true });
      fs.mkdirSync(path.join(bundleDir, "checklists"), { recursive: true });

      // Receipt files in range.
      const ndjsonFiles = listReceiptFiles(
        path.join(config.dataDir, "receipts"),
        fromDate,
        toDate
      );
      const receiptCounts = {};
      for (const f of ndjsonFiles) {
        const dest = path.join(bundleDir, "receipts", path.basename(f));
        fs.copyFileSync(f, dest);
        receiptCounts[path.basename(f)] = countLines(dest);
      }

      // Public key.
      const pem = toPem(activeKey.publicKey);
      fs.writeFileSync(
        path.join(bundleDir, "public_keys", `${activeKey.fingerprint}.pem`),
        pem
      );

      // Policies + checklists.
      copyDir(
        path.join(config.repoRoot, "policy"),
        path.join(bundleDir, "policies")
      );
      copyDir(
        path.join(config.repoRoot, "checklists"),
        path.join(bundleDir, "checklists")
      );

      // Inventory + attestations + gate decisions for the scope.
      const invRows = inventoryId
        ? [db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId)].filter(Boolean)
        : db.prepare("SELECT * FROM inventory").all();
      const inventoryIds = invRows.map((r) => r.id);
      const attests = inventoryIds.length
        ? db
            .prepare(
              `SELECT * FROM attestations WHERE inventory_id IN (${qmarks(
                inventoryIds.length
              )}) ORDER BY attested_at_utc`
            )
            .all(...inventoryIds)
        : [];
      const gates = inventoryIds.length
        ? db
            .prepare(
              `SELECT * FROM gate_decisions WHERE inventory_id IN (${qmarks(
                inventoryIds.length
              )}) ORDER BY decided_at_utc`
            )
            .all(...inventoryIds)
        : [];
      fs.writeFileSync(
        path.join(bundleDir, "inventory.json"),
        JSON.stringify(invRows, null, 2)
      );
      fs.writeFileSync(
        path.join(bundleDir, "attestations.json"),
        JSON.stringify(attests, null, 2)
      );
      fs.writeFileSync(
        path.join(bundleDir, "gate_decisions.json"),
        JSON.stringify(gates, null, 2)
      );

      // Verify pass — confirm every receipt in the bundle still verifies.
      const verifyReport = verifyBundle(bundleDir, activeKey);

      // Manifest.
      const manifest = {
        beacon_version: config.beaconVersion,
        generated_at_utc: new Date().toISOString(),
        generated_by: user?.email || user?.sub || "unknown",
        scope: {
          inventory_ids: inventoryIds,
          from_date: fromDate || null,
          to_date: toDate || null,
        },
        active_key_fingerprint: activeKey.fingerprint,
        signing_algorithm: activeKey.algorithm,
        canonical_form: config.signing.canonicalForm,
        receipt_files: receiptCounts,
        verification: verifyReport,
        note:
          "Verify independently with the steps in VERIFY.md. " +
          "Beacon's self-verification is convenience, not proof.",
      };
      const manifestBytes = Buffer.from(canonicalize(manifest), "utf8");
      const manifestSha = sha256Hex(manifestBytes);
      fs.writeFileSync(
        path.join(bundleDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );
      fs.writeFileSync(
        path.join(bundleDir, "manifest.sha256"),
        `${manifestSha}  manifest.json\n`
      );
      fs.writeFileSync(path.join(bundleDir, "VERIFY.md"), VERIFY_MD);

      return {
        bundle_path: bundleDir,
        manifest_sha256: manifestSha,
        verification: verifyReport,
      };
    },
  };
}

function verifyBundle(bundleDir, activeKey) {
  const receiptDir = path.join(bundleDir, "receipts");
  let ok = 0;
  let bad = 0;
  const failures = [];
  for (const f of fs.readdirSync(receiptDir)) {
    const lines = fs
      .readFileSync(path.join(receiptDir, f), "utf8")
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      const r = JSON.parse(line);
      const { signature, ...rest } = r;
      const canonicalBytes = Buffer.from(canonicalize(rest), "utf8");
      const v = verify(activeKey.publicKey, canonicalBytes, signature.sig_b64);
      if (v) ok++;
      else {
        bad++;
        if (failures.length < 10) failures.push(r.id);
      }
    }
  }
  return { receipts_verified: ok, receipts_failed: bad, failures };
}

function listReceiptFiles(dir, fromDate, toDate) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ndjson"))
    .filter((f) => {
      const day = f.replace(".ndjson", "");
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    })
    .map((f) => path.join(dir, f));
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function countLines(p) {
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
}

function qmarks(n) {
  return new Array(n).fill("?").join(",");
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function toPem(publicKey) {
  // Wrap raw 32-byte Ed25519 public key as a PEM-encoded
  // SubjectPublicKeyInfo. Node's KeyObject handles the DER for us.
  const k = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"), // SPKI prefix for Ed25519
      Buffer.from(publicKey),
    ]),
    format: "der",
    type: "spki",
  });
  return k.export({ format: "pem", type: "spki" });
}

const VERIFY_MD = `# Verifying a Beacon Audit Bundle

You do not need Beacon to verify this bundle. Any tool that can do
Ed25519 verification and RFC 8785 JSON Canonicalization will work.
The steps below use \`openssl\` and a small Node script.

## 1. Confirm the manifest

\`\`\`bash
sha256sum -c manifest.sha256
\`\`\`

## 2. Confirm every receipt signature

For each line in \`receipts/YYYY-MM-DD.ndjson\`:

  1. Parse the JSON.
  2. Remove the \`signature\` field.
  3. Canonicalize the remainder per RFC 8785 (JCS).
  4. Verify the Ed25519 signature in \`signature.sig_b64\` against the
     public key in \`public_keys/<signature.key_fpr>.pem\`.

If any signature fails, the bundle is suspect. Stop and contact the
system owner.

## 3. Spot-check inventory and attestations

\`inventory.json\`, \`attestations.json\`, and \`gate_decisions.json\`
are the indexed views. Every row references a \`receipt_id\` you can
find in the NDJSON files above.

## 4. Read the human parts

\`policies/\` and \`checklists/\` contain the rules in force when this
bundle was generated. Read them. Disagree on paper if you disagree in
person.

— The AIGovOps Foundation
`;
