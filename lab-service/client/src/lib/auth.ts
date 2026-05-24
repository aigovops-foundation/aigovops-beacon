/**
 * Auth — in-memory session token store.
 * Cannot use localStorage (sandboxed iframe blocks it).
 * Token persists for the page load; trainee can paste their magic-link token if needed.
 */
import { useEffect, useState, useCallback } from "react";

// API base prefix — rewritten at publish time by the deploy pipeline.
// In dev / preview this string starts with "__", so we use a relative path.
// In published sandboxes the literal is rewritten to "/port/5000" (or similar).
export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();
let currentToken: string | null = null;

export function getToken(): string | null {
  return currentToken;
}

export function setToken(t: string | null) {
  currentToken = t;
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
