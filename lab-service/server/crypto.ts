/**
 * server/crypto.ts — tokens, ids, and admin password hashing. Rebuilt 2026-08-04 (phase 2 of 4).
 *
 * Exports exactly what routes.ts imports: `randomToken`, `ulid`, `hashPassword`, `verifyPassword`.
 *
 * ULID IS RE-EXPORTED, NOT REIMPLEMENTED. `server/src/services/{inventory,receipts,checklists}.js`
 * already `import { ulid } from "ulid"`, and `beacons/_common.py:new_ulid` is the Python twin.
 * A third hand-rolled Crockford encoder in the same repo would be a drift risk for no gain — ids
 * from the lab and ids from the engine must sort and parse identically. The live service's
 * `anon_01KZ6HCWECB2JCFC6RK4B2JCFC` is a standard 26-char Crockford ULID, which is what this
 * produces.
 */

import crypto from "node:crypto";
import { monotonicFactory } from "ulid";

/**
 * Lexicographically sortable id. See the note above on why this comes from the `ulid` package.
 *
 * MONOTONIC, not the bare `ulid()`. The plain factory draws a fresh random component on every
 * call, so two ids minted in the SAME MILLISECOND sort in an arbitrary order — and a lab issues
 * receipts in bursts (a checklist run signs its receipt in the same tick it is created). Receipts,
 * bundles and checklist runs all use this as a primary key and are read back in issue order, so
 * "sorts by when it was issued" has to be true rather than usually true. `monotonicFactory`
 * increments the random component within a millisecond instead of redrawing it.
 *
 * The bare factory was in fact non-deterministically failing crypto.test.ts's sortability
 * assertion — roughly whenever two calls landed in the same millisecond.
 */
export const ulid = monotonicFactory();

/**
 * URL-safe opaque token. `routes.ts` calls both `randomToken()` (session ids) and
 * `randomToken(24)` (magic-link tokens), so the length argument is optional.
 *
 * `bytes` is entropy, not output length — base64url expands roughly 4/3. The default of 32 bytes
 * is 256 bits, which is what a session id that doubles as a bearer cookie should carry.
 */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/* ------------------------------------------------------- admin password */

// scrypt cost. N=2^15 keeps a single verify near ~100ms on the Fly shared-cpu-1x this runs on:
// slow enough that the 30-attempt global budget in loginRateLimit is the binding constraint on
// guessing, fast enough that an instructor logging in mid-class does not notice.
const SCRYPT_N = 32768;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;

// Node's default maxmem is 32MB; N=32768 needs ~128*N*r ≈ 32MB and trips it. Raise explicitly
// rather than lowering N — the cost parameter is the security property here.
const SCRYPT_OPTS = { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 128 * SCRYPT_N * SCRYPT_r * 2 };

/**
 * Hash a new admin password. Returns the pair `routes.ts` destructures:
 * `const { hash, salt } = hashPassword(newPassword)`, which it then passes to
 * `storage.updateAdminPassword(hash, salt)` as two columns.
 *
 * Salt is stored separately rather than embedded in a PHC string because the schema and the
 * rotate-password route both treat them as two values. Keeping the storage shape and the crypto
 * API in agreement is worth more here than the marginally tidier single-field encoding.
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS).toString("hex");
  return { hash, salt };
}

/**
 * Verify a password. Argument order matches the call site exactly:
 * `verifyPassword(password, state.passwordSalt, state.passwordHash)`.
 *
 * Two properties this must hold:
 *  - CONSTANT TIME. `timingSafeEqual`, not `===`. A string compare leaks the shared prefix length,
 *    and the admin console is reachable from the public internet.
 *  - NEVER THROWS. It returns false on a malformed or empty stored hash instead. A fresh lab has
 *    `passwordHash: ""` until the first rotate, and the login route calls this before any such
 *    check — an exception there would be a 500 on an unconfigured lab rather than a clean 401.
 */
export function verifyPassword(password: string, salt: string, hash: string): boolean {
  if (!password || !salt || !hash) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LEN) return false;
  try {
    const actual = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
