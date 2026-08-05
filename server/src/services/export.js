// Audit export — produces a self-contained tarball your auditor can
// verify without Beacon installed.
//
// Contents:
//   manifest.json                 inventory, packs, range, key fingerprints
//   manifest.sha256               sha256sum-format digest of manifest.json
//   receipts/YYYY-MM-DD.ndjson    raw receipts (copies)
//   public_keys/<fpr>.pem         PEM-encoded public keys — all of them, not
//                                 just the active one, so a bundle spanning a
//                                 key rotation stays verifiable
//   policies/                     copies of policy + rego
//   checklists/                   copies of pack YAMLs
//   verify_bundle.py              the verifier itself, so the auditor needs
//                                 nothing but a Python 3 interpreter
//   VERIFY.md                     human-readable verification steps

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalize } from "../lib/canonical.js";
import { verify, listPublicKeys, fingerprintSpellings } from "./keys.js";

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

      // Public keys — every key on disk, not only the active one.
      const keys = dedupeKeys([
        {
          fingerprint: activeKey.fingerprint,
          publicKey: activeKey.publicKey,
        },
        ...listPublicKeys(config),
      ]);
      for (const k of keys) {
        fs.writeFileSync(
          path.join(bundleDir, "public_keys", `${k.fingerprint}.pem`),
          toPem(k.publicKey)
        );
      }

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
      const verifyReport = verifyBundle(bundleDir, keys);

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
        public_key_fingerprints: keys.map((k) => k.fingerprint),
        signing_algorithm: activeKey.algorithm,
        canonical_form: config.signing.canonicalForm,
        receipt_files: receiptCounts,
        verification: verifyReport,
        note:
          "Verify independently with the steps in VERIFY.md. " +
          "Beacon's self-verification is convenience, not proof.",
      };

      // The digest goes over the bytes we actually write. It is recorded in
      // `sha256sum -c` format, so it has to be the digest of the file — an
      // earlier version hashed the manifest's canonical form instead, which
      // made `sha256sum -c manifest.sha256` fail on every bundle.
      const manifestJson = JSON.stringify(manifest, null, 2);
      const manifestSha = sha256Hex(Buffer.from(manifestJson, "utf8"));
      fs.writeFileSync(path.join(bundleDir, "manifest.json"), manifestJson);
      fs.writeFileSync(
        path.join(bundleDir, "manifest.sha256"),
        `${manifestSha}  manifest.json\n`
      );

      // Ship the verifier with the evidence. `src/beacon_verify.py` is a
      // single self-contained file by design: stdlib only, with `cryptography`
      // used when present and a pure-Python Ed25519 fallback when it is not.
      const verifierBundled = copyVerifier(config, bundleDir);
      fs.writeFileSync(
        path.join(bundleDir, "VERIFY.md"),
        verifierBundled ? VERIFY_MD : VERIFY_MD_NO_VERIFIER
      );

      return {
        bundle_path: bundleDir,
        manifest_sha256: manifestSha,
        verifier_included: verifierBundled,
        public_key_fingerprints: keys.map((k) => k.fingerprint),
        verification: verifyReport,
      };
    },
  };
}

// Each receipt is checked against the key named by its own
// `signature.key_fpr`, not against whichever key happens to be active. A
// bundle whose range spans a rotation is the normal case, not an edge case.
function verifyBundle(bundleDir, keys) {
  // Index under EVERY spelling. Receipts written before schema_version 1.1.0
  // name the key by its 16-hex fingerprint; receipts written after name it by
  // the SSH-style one. A bundle whose range spans that upgrade contains both,
  // and indexing only one silently falls through to the single-key path — or,
  // in a bundle that also spans a key rotation, to a verification failure that
  // has nothing to do with its signatures.
  const byFingerprint = new Map();
  for (const k of keys) {
    for (const spelling of fingerprintSpellings(k.publicKey)) {
      byFingerprint.set(spelling, k.publicKey);
    }
  }
  const onlyKey = keys.length === 1 ? keys[0].publicKey : null;
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
      const publicKey =
        byFingerprint.get(signature?.key_fpr) || onlyKey || null;
      const canonicalBytes = Buffer.from(canonicalize(rest), "utf8");
      const v =
        publicKey != null &&
        verify(publicKey, canonicalBytes, signature.sig_b64);
      if (v) ok++;
      else {
        bad++;
        if (failures.length < 10) failures.push(r.id);
      }
    }
  }
  return { receipts_verified: ok, receipts_failed: bad, failures };
}

function dedupeKeys(keys) {
  const seen = new Map();
  for (const k of keys) {
    if (k?.fingerprint && !seen.has(k.fingerprint)) seen.set(k.fingerprint, k);
  }
  return [...seen.values()];
}

// Returns true when the verifier was copied in. It lives in the repo, and an
// export can legitimately run from an install that does not carry it — in that
// case the bundle is still valid, VERIFY.md just points elsewhere for the tool.
function copyVerifier(config, bundleDir) {
  const src = path.join(config.repoRoot, "src", "beacon_verify.py");
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, path.join(bundleDir, "verify_bundle.py"));
  return true;
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

const VERIFY_STEPS_TAIL = `## What the verifier checked

1. **The manifest is intact** — \`manifest.sha256\` matches \`manifest.json\`.
2. **Every receipt signature is valid** — for each line of every
   \`receipts/*.ndjson\`: the \`signature\` block is removed, the remainder is
   canonicalized per RFC 8785 (JCS), and the Ed25519 signature in
   \`signature.sig_b64\` is checked against the public key named by that
   receipt's own \`signature.key_fpr\` in \`public_keys/\`.
3. **Nothing was dropped** — the receipt counts declared in the manifest match
   the files actually present.
4. **No duplicate receipt IDs.**

Anything it could not check, it says out loud rather than passing quietly.

## If it fails

A non-zero exit means at least one of those checks failed, and the specific
failures are printed. Stop and contact the system owner. Do not accept the
bundle on the strength of the manifest's own \`verification\` block — that was
written by the system that produced the bundle, and is convenience, not proof.

## Spot-check the rest by hand

\`inventory.json\`, \`attestations.json\`, and \`gate_decisions.json\` are the
indexed views. Every row references a \`receipt_id\` you can find in the NDJSON
files above.

\`policies/\` and \`checklists/\` contain the rules in force when this bundle was
generated. Read them. Disagree on paper if you disagree in person.

## Verifying without our tool at all

Nothing here is proprietary. The receipts are NDJSON, the canonical form is
RFC 8785, the signatures are Ed25519, and the public keys are PEM
SubjectPublicKeyInfo. Any library in any language that does those three things
will reproduce the same answer, and \`verify_bundle.py\` is short enough to read
in full before you run it.

— The AiGovOps Foundation
`;

const VERIFY_MD = `# Verifying a Beacon Audit Bundle

You do not need Beacon, an account, or a network connection to verify this
bundle. The verifier is in the bundle. From this directory:

\`\`\`bash
python3 verify_bundle.py .
\`\`\`

A clean bundle prints \`beacon-verify: OK — <n> receipts verified\` and exits 0.
Any failure exits non-zero and names what failed.

Python 3.10 or newer is the only requirement. If the \`cryptography\` package
happens to be installed it is used; if not, the verifier falls back to a
pure-Python Ed25519 implementation included in the same file, so an air-gapped
machine with a bare Python still works. It is slower, and that is all.

For a machine-readable report:

\`\`\`bash
python3 verify_bundle.py . --json
\`\`\`

${VERIFY_STEPS_TAIL}`;

// Used when the export ran from an install that does not carry the verifier
// source. The bundle is unaffected; only the "run this" line changes.
const VERIFY_MD_NO_VERIFIER = `# Verifying a Beacon Audit Bundle

You do not need Beacon or an account to verify this bundle, but this copy did
not ship with the verifier itself. Get it — a single self-contained file, no
dependencies beyond Python 3 — and point it at this directory:

\`\`\`bash
curl -O https://raw.githubusercontent.com/aigovops-foundation/aigovops-beacon/main/src/beacon_verify.py
python3 beacon_verify.py .
\`\`\`

A clean bundle prints \`beacon-verify: OK — <n> receipts verified\` and exits 0.
Any failure exits non-zero and names what failed.

${VERIFY_STEPS_TAIL}`;
