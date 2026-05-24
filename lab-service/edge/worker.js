/**
 * Cloudflare Worker — Beacon Lab edge proxy.
 *
 * Responsibilities:
 *   1. Handle CORS preflight at the edge (no roundtrip to origin).
 *   2. Cache cacheable GET endpoints (/api/status, /api/curriculum/*, /api/lab/public-receipts).
 *   3. Verify JWT signature locally before forwarding — short-circuits obviously
 *      malformed tokens without hitting the origin.
 *   4. Proxy everything else to BACKEND_URL with the original body/headers.
 *
 * Configuration (set via wrangler.toml [vars] + wrangler secret):
 *   env.BACKEND_URL           — Fly.io backend base URL
 *   env.CORS_ALLOWED_ORIGINS  — comma-separated allowed origins
 *   env.JWT_PUBLIC_KEY        — PEM RSA public key (optional; skip verify if absent)
 *
 * Stateless — no KV, no Durable Objects.  ≤ 200 lines.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a PEM public key string and import it as a CryptoKey for RS256 verify.
 * Returns null if the env var is missing or the key is malformed.
 */
async function importPublicKey(pem) {
  if (!pem) return null;
  try {
    // Strip PEM headers and decode base64.
    const b64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "spki",
      der.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    // Key parse failure is non-fatal — we skip local JWT verify.
    return null;
  }
}

/**
 * Decode a base64url string to a Uint8Array.
 */
function b64urlDecode(str) {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Local JWT verify using SubtleCrypto (RS256 only — HS256 requires the
 * shared secret which we don't expose to the edge).  Returns true / false.
 * Caller should fall through to origin on false rather than blocking — the
 * origin is the authoritative verifier.
 */
async function localVerifyJWT(token, publicKey) {
  if (!publicKey) return true; // skip if key unavailable
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = b64urlDecode(sigB64);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sig, signingInput);
    if (!ok) return false;
    // Also check exp claim to short-circuit obviously expired tokens.
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// Endpoints we cache at the edge.  Cache-Control from the origin is respected;
// we use 300s as the fallback TTL when the origin doesn't set it.
const CACHEABLE_PATHS = [
  /^\/api\/status$/,
  /^\/api\/curriculum\//,
  /^\/api\/lab\/public-receipts$/,
];

function isCacheable(url) {
  const path = new URL(url).pathname;
  return CACHEABLE_PATHS.some((re) => re.test(path));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") ?? "";

    // Build the CORS origin allowlist from env.
    const allowedOrigins = new Set(
      (env.CORS_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    // Shared CORS headers — echoed only when origin is in the allowlist.
    function corsHeaders(forOrigin) {
      if (!forOrigin || !allowedOrigins.has(forOrigin)) return {};
      return {
        "Access-Control-Allow-Origin": forOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
      };
    }

    // ── 1. OPTIONS preflight — handle at the edge, no roundtrip ──────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Max-Age": "600",
        },
      });
    }

    // ── 2. JWT pre-verification (RS256 only) ─────────────────────────────────
    // Import key lazily and cache on the env object across invocations in the
    // same isolate.  We use a module-level variable for simplicity.
    if (!_publicKey && env.JWT_PUBLIC_KEY) {
      _publicKey = await importPublicKey(env.JWT_PUBLIC_KEY);
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      const token = bearerMatch[1];
      // Only bother with local verify when it looks like a JWT.
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        const valid = await localVerifyJWT(token, _publicKey);
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid or expired JWT" }), {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(origin),
            },
          });
        }
      }
    }

    // ── 3. Edge cache for public cacheable GETs ───────────────────────────────
    const cache = caches.default;
    if (request.method === "GET" && isCacheable(request.url)) {
      const cached = await cache.match(request);
      if (cached) {
        // Re-attach CORS headers — cached response won't have them for this origin.
        const resp = new Response(cached.body, cached);
        for (const [k, v] of Object.entries(corsHeaders(origin))) {
          resp.headers.set(k, v);
        }
        return resp;
      }
    }

    // ── 4. Proxy to origin ────────────────────────────────────────────────────
    const backendUrl = (env.BACKEND_URL ?? "").replace(/\/$/, "");
    const targetUrl = backendUrl + url.pathname + url.search;

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // Cloudflare requires redirect: "manual" to avoid auto-following.
      redirect: "manual",
    });

    const originResponse = await fetch(proxyReq);
    const response = new Response(originResponse.body, originResponse);

    // Attach CORS headers to the proxied response.
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      response.headers.set(k, v);
    }

    // Cache cacheable responses (respect origin Cache-Control or use 300s TTL).
    if (request.method === "GET" && isCacheable(request.url) && originResponse.ok) {
      if (!response.headers.get("cache-control")) {
        response.headers.set("cache-control", "public, max-age=300");
      }
      ctx.waitUntil(cache.put(request, response.clone()));
    }

    return response;
  },
};

// Module-level key cache — survives across requests in the same isolate.
let _publicKey = null;
