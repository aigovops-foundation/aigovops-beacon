/**
 * Beacon Lab — Cryptography
 * Ed25519 signing + RFC 8785 (JCS) canonicalization + SHA-256 hashing.
 * Uses Node's built-in crypto (no external deps).
 */
import {
  createHash,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  randomBytes,
  KeyObject,
  createPrivateKey,
  createPublicKey,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

// ----------------------------------------------------------------------------
// RFC 8785 — JSON Canonicalization Scheme (JCS)
// Sorts object keys lexicographically, normalizes numbers, escapes strings.
// ----------------------------------------------------------------------------

export function canonicalize(value: unknown): string {
  return _serialize(value);
}

function _serialize(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("Non-finite number");
    if (Number.isInteger(v)) return v.toString();
    return v.toString();
  }
  if (typeof v === "string") return _jsonString(v);
  if (Array.isArray(v)) {
    return "[" + v.map(_serialize).join(",") + "]";
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return (
      "{" +
      keys.map((k) => _jsonString(k) + ":" + _serialize(obj[k])).join(",") +
      "}"
    );
  }
  throw new Error(`Cannot canonicalize value of type ${typeof v}`);
}

function _jsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

// ----------------------------------------------------------------------------
// Hashing
// ----------------------------------------------------------------------------

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Multibase(input: string | Buffer): string {
  // Multibase b16 = "f" prefix per Beacon convention.
  return "sha256:" + sha256Hex(input);
}

// ----------------------------------------------------------------------------
// Ed25519
// ----------------------------------------------------------------------------

export interface EdKeyPair {
  publicKeyB64: string;
  privateKeyB64: string;
  fingerprint: string;
}

export function generateEd25519(): EdKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  const publicKeyB64 = pubDer.toString("base64");
  const privateKeyB64 = privDer.toString("base64");
  const fingerprint = "ed25519:" + sha256Hex(pubDer).slice(0, 16);
  return { publicKeyB64, privateKeyB64, fingerprint };
}

export function loadPrivateKey(b64: string): KeyObject {
  return createPrivateKey({
    key: Buffer.from(b64, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

export function loadPublicKey(b64: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(b64, "base64"),
    format: "der",
    type: "spki",
  });
}

export function signEd25519(privateKeyB64: string, data: string): string {
  const key = loadPrivateKey(privateKeyB64);
  return nodeSign(null, Buffer.from(data, "utf8"), key).toString("base64");
}

export function verifyEd25519(
  publicKeyB64: string,
  data: string,
  signatureB64: string,
): boolean {
  try {
    const key = loadPublicKey(publicKeyB64);
    return nodeVerify(
      null,
      Buffer.from(data, "utf8"),
      key,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Tokens / ULIDs / random IDs
// ----------------------------------------------------------------------------

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// Simple ULID-like ID: timestamp prefix + random
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(): string {
  const ts = Date.now();
  let tsPart = "";
  let n = ts;
  for (let i = 0; i < 10; i++) {
    tsPart = CROCKFORD[n % 32] + tsPart;
    n = Math.floor(n / 32);
  }
  let randPart = "";
  const rb = randomBytes(10);
  for (let i = 0; i < 16; i++) {
    randPart += CROCKFORD[rb[i % 10] % 32];
  }
  return tsPart + randPart;
}

// ----------------------------------------------------------------------------
// Password hashing (scrypt)
// ----------------------------------------------------------------------------

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, useSalt, 64).toString("hex");
  return { hash: derived, salt: useSalt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ----------------------------------------------------------------------------
// Merkle root (binary, SHA-256, duplicate-last for odd counts)
// ----------------------------------------------------------------------------

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");
  let level = leaves.map((l) => Buffer.from(l, "hex"));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(createHash("sha256").update(Buffer.concat([a, b])).digest());
    }
    level = next;
  }
  return level[0].toString("hex");
}
