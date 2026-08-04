/**
 * server/loginRateLimit.ts — the admin-login brute-force budget. Rebuilt 2026-08-04 (phase 2 of 4).
 *
 * Exports exactly what index.ts and routes.ts import: `loginIsLockedOut`, `recordLoginFailure`,
 * `resetLoginFailures`.
 *
 * THE COUNTER IS GLOBAL, NOT PER-IP — AND THAT IS DELIBERATE.
 * From docs/USING_LIVE_LAB.md, written against the original service:
 *
 *   "The global anti-brute-force counter caps at 30 failed admin login attempts per 15-minute
 *    window across all clients (the pplx.app proxy collapses many real clients into one upstream
 *    IP, so per-IP limits aren't safe). A successful login from anyone resets the counter
 *    immediately."
 *
 * Per-IP limiting behind a proxy that collapses clients is worse than useless: it either locks out
 * everybody at once (if the proxy IP is the key) or nobody at all (if a spoofable
 * X-Forwarded-For is). A single global budget is honest about what the service can actually
 * observe. It stays global after the move to Fly + Cloudflare for the same reason — Cloudflare
 * also fronts every client — and the cost is understood: one attacker can lock out the instructor.
 * That trade is acceptable for a training lab whose admin console is a convenience, and is the
 * kind of decision that must not be "tidied up" into per-IP without re-reading this paragraph.
 *
 * IN-MEMORY ON PURPOSE. A restart clears the budget. Persisting it would mean an attacker could
 * lock the instructor out across deploys, and the window is 15 minutes — the blast radius of
 * losing it is one window.
 */

const MAX_FAILURES = 30;
const WINDOW_MS = 15 * 60 * 1000;

/** Timestamps of failures inside the current window. Trimmed on every read. */
let failures: number[] = [];

function trim(now: number): void {
  const cutoff = now - WINDOW_MS;
  // Cheap because the array is capped by MAX_FAILURES in practice — once the budget is spent the
  // route stops calling recordLoginFailure(), since index.ts rejects before reaching it.
  failures = failures.filter((t) => t > cutoff);
}

/**
 * Is admin login currently locked out?
 *
 * Shape matches the call site in index.ts, which reads BOTH fields:
 *   const lock = loginIsLockedOut();
 *   if (lock.locked) { res.setHeader("Retry-After", String(lock.retryAfterSec)); ... 429 }
 *
 * `retryAfterSec` is measured from the OLDEST failure in the window — that is the moment the
 * window slides and a slot frees. Reporting the full 15 minutes instead would tell a locked-out
 * instructor to wait longer than they actually need to.
 */
export function loginIsLockedOut(): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  trim(now);
  if (failures.length < MAX_FAILURES) return { locked: false, retryAfterSec: 0 };
  const oldest = failures[0];
  const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
  return { locked: true, retryAfterSec };
}

/** Record one failed admin login. Called by routes.ts on a bad password. */
export function recordLoginFailure(): void {
  const now = Date.now();
  trim(now);
  failures.push(now);
}

/**
 * Clear the budget. Called by routes.ts on a SUCCESSFUL login — "a successful login from anyone
 * resets the counter immediately" (USING_LIVE_LAB.md). Whoever holds the real password is
 * evidence the traffic is not an attack.
 */
export function resetLoginFailures(): void {
  failures = [];
}

/** Test-only view of the internal state. Not imported by any route. */
export const _internal = {
  MAX_FAILURES,
  WINDOW_MS,
  count: () => failures.length,
  /** Seed a failure at an explicit timestamp so window expiry is testable without waiting. */
  seedFailureAt: (ts: number) => { failures.push(ts); failures.sort((a, b) => a - b); },
};
