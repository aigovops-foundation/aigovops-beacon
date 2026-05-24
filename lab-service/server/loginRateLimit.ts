// Login brute-force protection shared between the rate-limit middleware
// (registered in index.ts) and the login route (in routes.ts).
//
// Strategy: we're behind the pplx.app proxy which collapses many real
// clients into one upstream IP, so per-IP limiting can't safely distinguish
// real users. Instead, we count GLOBAL failed login attempts and reset on
// any successful login. A real admin who knows the password is never
// locked out; a brute-force bot still hits the cap.

const state = { failures: 0, firstFailure: 0 };

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 30;

export function recordLoginFailure(): void {
  const now = Date.now();
  if (now - state.firstFailure > LOGIN_WINDOW_MS) {
    state.failures = 1;
    state.firstFailure = now;
  } else {
    state.failures += 1;
  }
}

export function resetLoginFailures(): void {
  state.failures = 0;
  state.firstFailure = 0;
}

export function loginIsLockedOut(): { locked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  if (state.failures < LOGIN_MAX_FAILURES) return { locked: false };
  const elapsed = now - state.firstFailure;
  if (elapsed > LOGIN_WINDOW_MS) {
    state.failures = 0;
    state.firstFailure = 0;
    return { locked: false };
  }
  return { locked: true, retryAfterSec: Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000) };
}
