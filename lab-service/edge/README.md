# Beacon Lab — Cloudflare Edge Worker

One-page deploy guide for the CORS + caching edge worker that sits in front of
the Fly.io backend.

---

## What it does

- Handles CORS preflight (`OPTIONS`) at the edge — no roundtrip to origin.
- Edge-caches `/api/status`, `/api/curriculum/*`, `/api/lab/public-receipts`
  with a 5-minute fallback TTL (respects `Cache-Control` from origin).
- Verifies RS256 JWT signatures locally via `SubtleCrypto` — short-circuits
  malformed or expired tokens before they reach the backend.
- Proxies all other `/api/*` requests to the Fly.io backend with
  `Access-Control-Allow-Origin` echoed from the allowlist.

---

## Prerequisites

```bash
npm install -g wrangler   # Cloudflare Wrangler CLI
wrangler login            # authenticate with your Cloudflare account
```

---

## First-time deploy

```bash
# 1. Set the JWT public key as a secret (PEM RSA public key from jwt.pub)
wrangler secret put JWT_PUBLIC_KEY < jwt.pub

# 2. Edit wrangler.toml to set your actual BACKEND_URL and CORS_ALLOWED_ORIGINS.

# 3. Deploy
wrangler deploy
```

---

## Configuration

| Setting | Where | Description |
|---|---|---|
| `BACKEND_URL` | `wrangler.toml [vars]` | Fly.io app URL (e.g. `https://aigovops-beacon-lab.fly.dev`) |
| `CORS_ALLOWED_ORIGINS` | `wrangler.toml [vars]` | Comma-separated allowed origins |
| `JWT_PUBLIC_KEY` | `wrangler secret` | PEM RSA-2048 public key for RS256 JWT verification |

---

## Custom domain: edge.beacon.aigovops.foundation

1. In your DNS provider, add a CNAME pointing the custom domain to your
   Cloudflare Workers zone:
   ```
   edge.beacon.aigovops.foundation  →  beacon-lab-edge.<your-subdomain>.workers.dev
   ```
2. In the Cloudflare dashboard → Workers & Pages → beacon-lab-edge → Settings
   → Triggers, add the custom domain.
3. Or update `routes` in `wrangler.toml` and re-deploy:
   ```toml
   routes = [
     { pattern = "edge.beacon.aigovops.foundation/*", zone_name = "aigovops.foundation" }
   ]
   ```

---

## Local dev

```bash
wrangler dev
```

Point `window.__BEACON_API_BASE__` to `http://localhost:8787` in your browser
for local testing without deploying.

---

## Rolling back

```bash
# List deployments
wrangler deployments list

# Roll back to a specific version
wrangler rollback <deployment-id>
```
