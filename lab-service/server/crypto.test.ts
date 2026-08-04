/**
 * crypto.test.ts + loginRateLimit — phase 2 of the lab-service rebuild.
 *
 * These test the properties the ROUTES depend on, not the implementation:
 *   - verifyPassword must be constant-time and must never throw on an unconfigured lab
 *   - ulid must match the format the live service issued (`anon_01KZ6HCWECB2JCFC6RK4B2JCFC`)
 *   - the lockout window must actually slide, and a success must clear it
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { randomToken, ulid, hashPassword, verifyPassword } from "./crypto.js";
import {
  loginIsLockedOut,
  recordLoginFailure,
  resetLoginFailures,
  _internal as rl,
} from "./loginRateLimit.js";

/* ------------------------------------------------------------------ crypto */

test("randomToken is url-safe, unique, and honours the optional length", () => {
  const a = randomToken();
  const b = randomToken();
  assert.notEqual(a, b);
  // It lands in a cookie and a URL, so it must contain no +, / or =.
  assert.match(a, /^[A-Za-z0-9_-]+$/, "must be base64url — it is used as a cookie value");
  // routes.ts calls randomToken(24) for magic links; fewer bytes must still produce a shorter token.
  assert.ok(randomToken(24).length < a.length, "length argument must take effect");
});

test("ulid matches the format the live service issued", () => {
  const id = ulid();
  // Live sample: anon_01KZ6HCWECB2JCFC6RK4B2JCFC → 26 chars, Crockford base32 (no I, L, O, U).
  assert.equal(id.length, 26, "ULID is 26 characters");
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/, "Crockford base32 alphabet — excludes I, L, O, U");
});

test("ULIDs minted in the SAME millisecond still sort in issue order", () => {
  // Lexicographic sortability is why receipts, bundles and checklist runs use this as a primary
  // key. A tight loop is the case that matters and the case that used to break: a lab signs a
  // receipt in the same tick it creates the checklist run, and the non-monotonic factory redraws
  // its random component each call, so the pair sorted arbitrarily. Two calls caught that only
  // about half the time; a thousand in one burst catch it every time.
  const ids = Array.from({ length: 1000 }, () => ulid());
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted, "ids must already be in sorted order when issued in a burst");
  assert.equal(new Set(ids).size, ids.length, "and must be unique");
});

test("hashPassword / verifyPassword round-trip, with a fresh salt each time", () => {
  const { hash, salt } = hashPassword("correct horse battery staple");
  assert.ok(hash.length > 0 && salt.length > 0);
  assert.equal(verifyPassword("correct horse battery staple", salt, hash), true);
  assert.equal(verifyPassword("wrong password", salt, hash), false);

  // Same password, different salt → different hash. Otherwise two labs sharing a password would
  // share a hash, and one leak would compromise both.
  const second = hashPassword("correct horse battery staple");
  assert.notEqual(second.salt, salt, "salt must be random per call");
  assert.notEqual(second.hash, hash, "hash must differ when the salt differs");
});

test("verifyPassword NEVER throws on an unconfigured or malformed lab", () => {
  // A fresh lab has passwordHash: "" until the first rotate, and the login route calls this
  // before any such check. Throwing here would be a 500 on an unconfigured lab, not a clean 401.
  assert.equal(verifyPassword("anything", "", ""), false, "empty stored credentials → false");
  assert.equal(verifyPassword("", "salt", "abcd"), false, "empty password → false");
  assert.equal(verifyPassword("pw", "salt", "not-hex-!!"), false, "malformed hash → false");
  assert.equal(verifyPassword("pw", "salt", "aabb"), false, "wrong-length hash → false");
});

/* --------------------------------------------------------- loginRateLimit */

beforeEach(() => resetLoginFailures());

test("a fresh lab is not locked out", () => {
  const lock = loginIsLockedOut();
  assert.equal(lock.locked, false);
  assert.equal(lock.retryAfterSec, 0);
});

test("lockout engages at exactly the documented budget, not before", () => {
  // USING_LIVE_LAB.md: 30 failures per 15-minute window, globally.
  for (let i = 0; i < rl.MAX_FAILURES - 1; i++) recordLoginFailure();
  assert.equal(loginIsLockedOut().locked, false, `${rl.MAX_FAILURES - 1} failures must NOT lock`);

  recordLoginFailure();
  const lock = loginIsLockedOut();
  assert.equal(lock.locked, true, `${rl.MAX_FAILURES} failures must lock`);
  assert.ok(lock.retryAfterSec > 0, "a locked response must tell the caller when to retry");
  assert.ok(lock.retryAfterSec <= rl.WINDOW_MS / 1000, "retry-after cannot exceed the window");
});

test("a successful login clears the budget immediately", () => {
  for (let i = 0; i < rl.MAX_FAILURES; i++) recordLoginFailure();
  assert.equal(loginIsLockedOut().locked, true);
  // "A successful login from anyone resets the counter immediately." — USING_LIVE_LAB.md
  resetLoginFailures();
  assert.equal(loginIsLockedOut().locked, false, "whoever holds the real password ends the lockout");
});

test("the window SLIDES — old failures expire without a restart", () => {
  // Seeded at explicit timestamps so this does not need a 15-minute wait. Without this the
  // expiry path would be untested, which is how a lockout becomes permanent in production.
  const old = Date.now() - rl.WINDOW_MS - 1000;
  for (let i = 0; i < rl.MAX_FAILURES; i++) rl.seedFailureAt(old);
  assert.equal(loginIsLockedOut().locked, false, "failures older than the window must not count");
  assert.equal(rl.count(), 0, "and must be trimmed, so the array cannot grow without bound");
});

test("retryAfterSec counts from the OLDEST failure, not a full fresh window", () => {
  // A slot frees when the window slides past the oldest failure. Reporting the full 15 minutes
  // would tell a locked-out instructor to wait far longer than they actually need to.
  const nearlyExpired = Date.now() - rl.WINDOW_MS + 5000; // ~5s of life left
  for (let i = 0; i < rl.MAX_FAILURES; i++) rl.seedFailureAt(nearlyExpired);
  const lock = loginIsLockedOut();
  assert.equal(lock.locked, true);
  assert.ok(lock.retryAfterSec <= 6, `expected ~5s, got ${lock.retryAfterSec}s`);
});
