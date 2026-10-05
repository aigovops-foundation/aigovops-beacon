// Signing-key lifecycle.
//
// One active key at a time. Older keys are kept on disk so that
// historical receipts remain verifiable.
//
// A key has TWO names for the same SHA-256 digest of its raw public key, and
// the split is deliberate:
//
//   fingerprint  first 16 hex chars — the STORAGE id. It names the key file on
//                disk (ed25519-<fingerprint>.json) and the PEM in a bundle
//                (public_keys/<fingerprint>.pem).
//   keyFpr       SSH-style "SHA256:<base64>" — the WIRE id, embedded in
//                receipts as signature.key_fpr, per docs/RECEIPT_SCHEMA.md.
//
// They cannot be the same string: the SSH-style form is base64 and can contain
// `/`, which is not a filename. Before schema_version 1.1.0 the wire form was
// the hex one, which is what docs/RECEIPT_SCHEMA.md recorded as a known
// divergence from the spec.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import nacl from "tweetnacl";

const KEY_FILE_PREFIX = "ed25519-";

export async function loadOrCreateActiveKey(config) {
  const keyDir = path.join(config.dataDir, "keys");
  const existing = listKeyFiles(keyDir);
  if (existing.length === 0) {
    return generateAndPersistKey(config);
  }

  // Pick the newest by created_at in the file.
  const records = existing
    .map((p) => readKeyFile(p))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const newest = records[0];

  const ageDays =
    (Date.now() - Date.parse(newest.createdAt)) / 86_400_000;
  if (ageDays > config.signing.rotationDays) {
    // We do not auto-rotate; we just warn loudly.
    // eslint-disable-next-line no-console
    console.warn(
      `Beacon: active key is ${ageDays.toFixed(
        1
      )}d old (policy ${config.signing.rotationDays}d). ` +
        "Run `beacon keygen --rotate` and have a T3 human sign the rotation."
    );
  }
  return newest;
}

export function generateAndPersistKey(config) {
  const pair = nacl.sign.keyPair();
  const createdAt = new Date().toISOString();
  const publicKeyHex = Buffer.from(pair.publicKey).toString("hex");
  const fingerprint = sha256Hex(Buffer.from(pair.publicKey)).slice(0, 16);

  const record = {
    fingerprint,
    algorithm: "Ed25519",
    createdAt,
    publicKeyHex,
    secretKeyHex: Buffer.from(pair.secretKey).toString("hex"),
  };

  const outPath = path.join(
    config.dataDir,
    "keys",
    `${KEY_FILE_PREFIX}${fingerprint}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2), { mode: 0o600 });

  return materialize(record);
}

function listKeyFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(KEY_FILE_PREFIX) && f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

// Every key we have ever signed with, newest first — public halves only.
//
// An audit bundle has to carry all of them, not just the active one. A bundle
// whose range spans a rotation contains receipts signed by a key that is no
// longer active; ship only the active public key and those receipts cannot be
// verified by anyone, including us.
export function listPublicKeys(config) {
  const keyDir = path.join(config.dataDir, "keys");
  return listKeyFiles(keyDir)
    .map((p) => {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      return {
        fingerprint: raw.fingerprint,
        algorithm: raw.algorithm,
        createdAt: raw.createdAt,
        publicKey: Buffer.from(raw.publicKeyHex, "hex"),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function readKeyFile(p) {
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return materialize(raw);
}

function materialize(record) {
  const publicKey = Buffer.from(record.publicKeyHex, "hex");
  return {
    fingerprint: record.fingerprint,
    keyFpr: sshFingerprint(publicKey),
    algorithm: record.algorithm,
    createdAt: record.createdAt,
    publicKeyHex: record.publicKeyHex,
    publicKey,
    secretKey: Buffer.from(record.secretKeyHex, "hex"),
  };
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// The wire form: `ssh-keygen -lf` compatible, as docs/RECEIPT_SCHEMA.md
// specifies. Derived from the public key, never stored — so existing key files
// written before schema_version 1.1.0 gain it with no migration.
export function sshFingerprint(publicKey) {
  const digest = crypto.createHash("sha256").update(publicKey).digest();
  return "SHA256:" + digest.toString("base64").replace(/=+$/, "");
}

// Every spelling of a key's fingerprint that some Beacon receipt might name.
//
// A verifier has to index all of them at once. Receipts written before
// schema_version 1.1.0 carry the hex form; receipts written after carry the
// SSH-style form; both must resolve to the same key, or a bundle spanning the
// upgrade fails to verify for a reason that has nothing to do with its
// signatures.
export function fingerprintSpellings(publicKey) {
  const digest = crypto.createHash("sha256").update(publicKey).digest();
  const hex = digest.toString("hex");
  return [sshFingerprint(publicKey), hex.slice(0, 16), hex];
}

export function sign(secretKey, messageBytes) {
  return Buffer.from(
    nacl.sign.detached(messageBytes, secretKey)
  ).toString("base64");
}

export function verify(publicKey, messageBytes, signatureB64) {
  const sig = Buffer.from(signatureB64, "base64");
  return nacl.sign.detached.verify(messageBytes, sig, publicKey);
}
