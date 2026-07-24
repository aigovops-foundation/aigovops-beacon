/**
 * server/jwt.ts — JWT sign/verify using Node's built-in `crypto` (no new dep).
 *
 * Strategy:
 *   - RS256 when JWT_PRIVATE_KEY + JWT_PUBLIC_KEY PEM env vars are present.
 *   - Falls back to HS256 with a shared secret (JWT_SECRET env) when RS keys
 *     are missing.  If JWT_SECRET is also absent we auto-generate one, persist
 *     it to /data/jwt-secret.txt so it survives process restarts, and log a
 *     warning — this is fine for dev/demo but not for production.
 *
 * JWT structure: standard three-part base64url(header).base64url(payload).sig
 * All tokens carry `iat` (issued-at) and `exp` (expiry) claims.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── Key resolution ────────────────────────────────────────────────────────────

type KeyMode = "rs256" | "hs256";

let _mode: KeyMode | null = null;
let _privateKey: crypto.KeyObject | null = null;
let _publicKey: crypto.KeyObject | null = null;
let _hmacSecret: Buffer | null = null;

function getMode(): KeyMode {
  if (_mode) return _mode;

  const privPem = process.env.JWT_PRIVATE_KEY;
  const pubPem = process.env.JWT_PUBLIC_KEY;

  if (privPem && pubPem) {
    try {
      _privateKey = crypto.createPrivateKey({ key: privPem, format: "pem" });
      _publicKey = crypto.createPublicKey({ key: pubPem, format: "pem" });
      _mode = "rs256";
      return _mode;
    } catch (e) {
      console.warn("[jwt] RS256 key parse failed, falling back to HS256:", (e as Error).message);
    }
  } else {
    // No RS keys — warn so operators know to set them in production.
    console.warn("[jwt] JWT_PRIVATE_KEY / JWT_PUBLIC_KEY not set — using HS256 fallback. " +
      "Set RS256 keys via env for production use.");
  }

  // HS256 path — load or generate shared secret.
  const envSecret = process.env.JWT_SECRET;
  if (envSecret) {
    _hmacSecret = Buffer.from(envSecret, "utf8");
  } else {
    // Persist a generated secret to /data so it survives restarts.
    // /data is the Fly.io persistent volume; fall back to CWD in dev.
    const secretFile = fs.existsSync("/data")
      ? "/data/jwt-secret.txt"
      : path.resolve(process.cwd(), "jwt-secret.txt");

    if (fs.existsSync(secretFile)) {
      _hmacSecret = Buffer.from(fs.readFileSync(secretFile, "utf8").trim(), "hex");
    } else {
      const generated = crypto.randomBytes(32);
      fs.writeFileSync(secretFile, generated.toString("hex"), "utf8");
      _hmacSecret = generated;
      console.warn(`[jwt] Generated HS256 secret saved to ${secretFile}. ` +
        "Set JWT_SECRET env or JWT_PRIVATE_KEY/JWT_PUBLIC_KEY to fix this.");
    }
  }

  _mode = "hs256";
  return _mode;
}

// ── Base64url helpers (no Buffer.from shorthand for browser-compat parity) ───

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str: string): Buffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// ── Core sign/verify ──────────────────────────────────────────────────────────

const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h

/**
 * Sign a JWT carrying `payload` with an `iat` and `exp` claim.
 * @param payload  Arbitrary JSON-serialisable claims (sub, role, etc.)
 * @param ttlSec   Token lifetime in seconds (default 24h).
 */
export function signJWT(payload: object, ttlSec = DEFAULT_TTL_SEC): string {
  const mode = getMode();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: mode === "rs256" ? "RS256" : "HS256", typ: "JWT" };
  const claims = {
    ...payload,
    iat: now,
    exp: now + ttlSec,
  };

  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  let signature: Buffer;
  if (mode === "rs256" && _privateKey) {
    // RS256 — asymmetric, verifiable without the private key.
    signature = crypto.sign("sha256", Buffer.from(signingInput), _privateKey);
  } else {
    // HS256 — symmetric HMAC-SHA256.
    signature = crypto.createHmac("sha256", _hmacSecret!).update(signingInput).digest();
  }

  return `${signingInput}.${b64urlEncode(signature)}`;
}

/**
 * Verify a JWT.  Returns { ok: true, payload } or { ok: false, reason }.
 * Does NOT rely on exceptions for the normal "expired / invalid sig" path —
 * callers can branch cleanly without try/catch.
 */
export function verifyJWT(
  token: string,
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "Malformed JWT (expected 3 parts)" };

  const [headerB64, payloadB64, sigB64] = parts;

  // Decode header to confirm algorithm.
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "Header decode failed" };
  }

  const mode = getMode();
  const expectedAlg = mode === "rs256" ? "RS256" : "HS256";
  if (header.alg !== expectedAlg) {
    return { ok: false, reason: `Unexpected algorithm: ${header.alg}` };
  }

  // Verify signature.
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBuf = b64urlDecode(sigB64);

  let sigValid: boolean;
  try {
    if (mode === "rs256" && _publicKey) {
      sigValid = crypto.verify("sha256", Buffer.from(signingInput), _publicKey, sigBuf);
    } else {
      const expected = crypto.createHmac("sha256", _hmacSecret!).update(signingInput).digest();
      // Use timingSafeEqual to avoid timing attacks on the secret comparison.
      sigValid = expected.length === sigBuf.length &&
        crypto.timingSafeEqual(expected, sigBuf);
    }
  } catch {
    return { ok: false, reason: "Signature verification threw" };
  }

  if (!sigValid) return { ok: false, reason: "Invalid signature" };

  // Decode payload claims.
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "Payload decode failed" };
  }

  // Check expiry.
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    return { ok: false, reason: "Token expired" };
  }

  return { ok: true, payload: claims };
}
