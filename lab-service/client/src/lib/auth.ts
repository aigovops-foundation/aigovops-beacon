/**
 * Auth — session token store.
 *
 * Storage strategy chosen to survive the published preview iframe, which
 * blocks localStorage, sessionStorage, and IndexedDB:
 *
 *   1. The token lives in a module-level variable for fast synchronous reads.
 *   2. It is mirrored into `window.name`, which:
 *        - Survives page refreshes and hash-route navigations in the same tab
 *        - Dies when the tab/window is closed (no cross-tab leakage)
 *        - Is not blocked by the iframe sandbox or by sandboxed-iframe CSP
 *        - Is read/written synchronously and never sent over the wire
 *      window.name is per-browsing-context and ideal for a per-tab session.
 *   3. The token is also mirrored into a non-HttpOnly cookie as a secondary
 *      fallback so that some edge cases (e.g. an opened-in-new-tab link that
 *      doesn't inherit window.name) still pick up the session.
 *   4. Any API response with HTTP 401 clears the token automatically so a
 *      stale or revoked session sends the user back to /login instead of a
 *      blank admin/lab page that silently bounces to /.
 */
import { useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "beacon_tok=";
const COOKIE_NAME = "beacon_session";

function encodeNamePayload(t: string | null): string {
  // Preserve any existing window.name from the host page (we just prefix our
  // own key/value). Strip any prior beacon_tok= segment first.
  const cur = typeof window !== "undefined" && typeof window.name === "string" ? window.name : "";
  const cleaned = cur.replace(new RegExp(`(^|\\|)${TOKEN_KEY}[^|]*`), "").replace(/^\|/, "");
  if (!t) return cleaned;
  return cleaned ? `${TOKEN_KEY}${t}|${cleaned}` : `${TOKEN_KEY}${t}`;
}
function readFromWindowName(): string | null {
  try {
    if (typeof window === "undefined" || typeof window.name !== "string") return null;
    const m = window.name.match(new RegExp(`(?:^|\\|)${TOKEN_KEY}([^|]+)`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
function writeToWindowName(t: string | null): void {
  try {
    if (typeof window === "undefined") return;
    window.name = encodeNamePayload(t);
  } catch {
    /* ignore */
  }
}
function readFromCookie(): string | null {
  try {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}
function writeToCookie(t: string | null): void {
  try {
    if (typeof document === "undefined") return;
    if (t) {
      // Session cookie (no Max-Age / Expires) so it dies with the browser.
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(t)}; Path=/; SameSite=Strict`;
    } else {
      document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Strict`;
    }
  } catch {
    /* ignore */
  }
}
function hydrateToken(): string | null {
  return readFromWindowName() ?? readFromCookie();
}

// API base prefix — rewritten at publish time by the deploy pipeline.
// In dev / preview this string starts with "__", so we use a relative path.
// In published sandboxes the literal is rewritten to "/port/5000" (or similar).
export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();
// Hydrate from window.name / cookie on module load so a refresh keeps the session.
let currentToken: string | null = hydrateToken();

export function getToken(): string | null {
  return currentToken;
}

export function setToken(t: string | null) {
  currentToken = t;
  writeToWindowName(t);
  writeToCookie(t);
  listeners.forEach((l) => l(t));
}

export function useAuthToken() {
  const [tok, setTok] = useState<string | null>(currentToken);
  useEffect(() => {
    const l: Listener = (t) => setTok(t);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return tok;
}

// Wrap fetch with bearer token automatically
export async function api(method: string, url: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const tok = currentToken;
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(apiUrl(url), {
    method,
    headers,
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
    // 401 = the token is no longer valid (expired, revoked, server restart).
    // Clear local state so the next render shows the login screen instead
    // of a blank admin/lab page that silently bounces to /.
    if (res.status === 401 && currentToken) setToken(null);
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
