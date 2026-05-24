/**
 * beacon-lab-bridge.js — Anon session manager + invite-token capture.
 *
 * Loaded as <script type="module"> from Pages.  Manages the anonymous JWT
 * in localStorage, exposes window.beaconLabBridge with methods for the
 * page to call, and handles invite tokens arriving in location.hash.
 *
 * API base is configurable:
 *   window.__BEACON_API_BASE__ = "http://localhost:5050"   // local dev override
 *
 * No bundler needed — pure ES module, no imports.
 */

(function initBridge() {
  // Read API base before the module fires (set in page <script> before this).
  const API_BASE =
    (typeof window !== "undefined" && window.__BEACON_API_BASE__) ||
    "https://api.beacon-lab.aigovops.foundation";

  const STORAGE_KEY = "beacon.jwt";

  // ── JWT helpers (browser-side, no crypto verify — server verified on issue) ─

  function parseJWTPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
      return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return null;
    }
  }

  function isExpired(token) {
    const payload = parseJWTPayload(token);
    if (!payload || typeof payload.exp !== "number") return true;
    // Treat as expired 30s early to avoid edge-case races.
    return payload.exp < Math.floor(Date.now() / 1000) + 30;
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  function loadStoredJWT() {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      if (t && !isExpired(t)) return t;
      if (t) localStorage.removeItem(STORAGE_KEY); // prune expired
      return null;
    } catch {
      return null; // localStorage blocked (private mode, etc.)
    }
  }

  function saveJWT(token) {
    try { localStorage.setItem(STORAGE_KEY, token); } catch { /* ignore */ }
  }

  function clearJWT() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  async function apiFetch(path, opts = {}) {
    const token = bridge.getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    };
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      credentials: "include", // send __Host-beacon_session cookie when same-origin
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(body.error || res.statusText), { status: res.status, body });
    }
    return res.json();
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let _jwt = loadStoredJWT();
  let _anonId = _jwt ? (parseJWTPayload(_jwt)?.anonId ?? parseJWTPayload(_jwt)?.sub) : null;
  let _initialized = false;

  // ── Public bridge API ─────────────────────────────────────────────────────

  const bridge = {
    /** Return the current JWT string, or null if no session. */
    getToken() { return _jwt; },

    /** Return the anon ID from the current JWT payload. */
    getAnonId() { return _anonId; },

    /**
     * promoteToDemo — promotes the current anon session to a demo trainee.
     * Returns { token, session, tenant, jwt }.
     */
    async promoteToDemo() {
      const data = await apiFetch("/api/anon/promote", {
        method: "POST",
        body: JSON.stringify({ mode: "demo" }),
      });
      // Replace stored JWT with the new trainee JWT.
      if (data.jwt) {
        _jwt = data.jwt;
        saveJWT(data.jwt);
        _anonId = parseJWTPayload(data.jwt)?.anonId ?? _anonId;
      }
      return data;
    },

    /**
     * requestEmailLink — request a magic link for the given email address.
     * Requires a valid JWT already in storage (anon or trainee).
     */
    async requestEmailLink(email) {
      return apiFetch("/api/anon/email-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    /** signOut — clear stored JWT. */
    signOut() {
      _jwt = null;
      _anonId = null;
      clearJWT();
    },
  };

  // ── Initialization ─────────────────────────────────────────────────────────

  async function init() {
    // 1. Handle invite token in fragment: lab.html#invite=<token>
    //    Exchange the magic link token for a JWT and drop the hash.
    const hash = location.hash;
    const inviteMatch = hash.match(/[#&]invite=([^&]+)/);
    if (inviteMatch) {
      try {
        const linkToken = inviteMatch[1];
        const data = await fetch(`${API_BASE}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token: linkToken }),
        }).then((r) => r.json());

        if (data.token) {
          // Mint a JWT for cross-origin use from the returned opaque session token.
          // The bridge uses the anon/session flow to get a JWT; here we have a
          // real session ID, so we issue an anon JWT and let the page continue.
          // A full "session → JWT" endpoint is day-2 work.
          //
          // For now: store the opaque token as a pseudo-JWT (server will accept
          // it via the opaque-session path in getBearerToken).
          _jwt = data.token;
          saveJWT(data.token);
          _anonId = null;
        }
      } catch (e) {
        console.warn("[beacon-bridge] invite token exchange failed:", e.message);
      }
      // Clean the fragment so the token doesn't persist in history.
      history.replaceState(null, "", location.pathname + location.search);
    }

    // 2. If no JWT yet, issue an anonymous session.
    if (!_jwt) {
      try {
        const data = await fetch(`${API_BASE}/api/anon/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).then((r) => r.json());
        _jwt = data.token;
        _anonId = data.anonId;
        saveJWT(_jwt);
      } catch (e) {
        console.warn("[beacon-bridge] anon session failed:", e.message);
      }
    }

    _initialized = true;
    // Signal to the page that the bridge is ready and the token is available.
    window.dispatchEvent(new CustomEvent("beacon-bridge-ready", {
      detail: { anonId: _anonId, hasToken: !!_jwt },
    }));
  }

  // Expose synchronously so components can call getToken() even before init.
  window.beaconLabBridge = bridge;

  // Initialize async (does not block page render).
  init().catch((e) => console.error("[beacon-bridge] init error:", e));
})();
