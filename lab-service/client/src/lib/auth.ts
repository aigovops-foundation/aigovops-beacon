/**
 * Auth — session lives in an HttpOnly server-set cookie.
 *
 * The server sets a `__Host-beacon_session` cookie on POST /api/admin/login
 * and POST /api/login. The pplx.app proxy preserves cookies that use the
 * `__Host-` prefix. Every fetch goes out with `credentials: "include"` so
 * the cookie travels automatically — no client-side storage required.
 *
 * We also keep an in-memory copy of the token (returned by the login
 * response body) so existing call sites that read `getToken()` synchronously
 * still work for the lifetime of the page. The cookie is the persistence
 * mechanism; the in-memory token is just a render-time hint.
 *
 * On page load, hydrate() probes /api/me — if the cookie is valid the call
 * succeeds and we know we are logged in even though the in-memory token is
 * null (which is why we use `hasSession` rather than the raw token for
 * route guards).
 */
import { useEffect, useState, useCallback } from "react";

// API base prefix — rewritten at publish time by the deploy pipeline.
// In dev / preview this string starts with "__", so we use a relative path.
// In published sandboxes the literal is rewritten to "port/5000" (or similar).
export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

type Listener = (hasSession: boolean) => void;
const listeners = new Set<Listener>();

// In-memory token returned by the login response body. May be null even when
// the user is authenticated (e.g. after a page refresh, the cookie is valid
// but we haven't seen the response body). Always check `hasSession` for
// route-guard decisions.
let currentToken: string | null = null;
let sessionKnown = false; // true once we've called hydrate() and learned the cookie's state
let sessionValid = false; // result of the most recent /api/me probe

export function getToken(): string | null {
  return currentToken;
}

/**
 * Returns true if the browser currently has a valid session cookie.
 * Use this for route guards instead of getToken() — the cookie may be
 * present even when the in-memory token is null.
 */
export function hasSession(): boolean {
  return sessionValid;
}

export function setToken(t: string | null) {
  currentToken = t;
  sessionValid = !!t;
  sessionKnown = true;
  listeners.forEach((l) => l(sessionValid));
}

function markSessionState(valid: boolean) {
  sessionValid = valid;
  sessionKnown = true;
  if (!valid) currentToken = null;
  listeners.forEach((l) => l(sessionValid));
}

/**
 * Probe the server for an existing session cookie. Call once at app startup
 * (and after any place that might invalidate the cookie). Returns true if
 * the cookie is valid.
 */
export async function hydrateSession(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/me"), { credentials: "include" });
    if (res.ok) {
      markSessionState(true);
      return true;
    }
  } catch {
    /* network error — treat as no session */
  }
  markSessionState(false);
  return false;
}

export function useAuthToken(): boolean {
  // Subscribers receive a boolean "has session" so they don't depend on the
  // in-memory token (which is null after a refresh even when authed).
  const [v, setV] = useState<boolean>(sessionValid);
  useEffect(() => {
    const l: Listener = (valid) => setV(valid);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

/**
 * Wrap fetch. Sends:
 *   - credentials: "include" so the __Host-beacon_session cookie travels
 *   - Authorization: Bearer <token> if we have an in-memory token (no-op
 *     for cookie-only sessions; this just keeps the curl-style flow
 *     working for API clients that don't carry cookies)
 *
 * On HTTP 401, marks the session invalid so route guards bounce the user
 * to /login instead of leaving them on a blank admin/lab page.
 */
export async function api(method: string, url: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const tok = currentToken;
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(apiUrl(url), {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401) markSessionState(false);
    const err = new Error(data?.error || res.statusText) as any;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function useApiCall<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload };
}
