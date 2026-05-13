// Signing-key lifecycle.
//
// One active key at a time. Older keys are kept on disk so that
// historical receipts remain verifiable. Each key has a fingerprint
// (first 16 hex chars of SHA-256 over the raw public key), which is
// what gets embedded in receipts.

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

function readKeyFile(p) {
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return materialize(raw);
}

function materialize(record) {
  return {
    fingerprint: record.fingerprint,
    algorithm: record.algorithm,
    createdAt: record.createdAt,
    publicKeyHex: record.publicKeyHex,
    publicKey: Buffer.from(record.publicKeyHex, "hex"),
    secretKey: Buffer.from(record.secretKeyHex, "hex"),
  };
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
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
