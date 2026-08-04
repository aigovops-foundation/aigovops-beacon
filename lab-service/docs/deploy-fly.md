# Deploying Beacon Lab to Fly.io

> ## ⛔ STATUS 2026-08-04 — this cannot be deployed from this repo yet
>
> **The service source is incomplete here.** `flyctl deploy` fails on the Dockerfile's very
> first build step, `COPY package.json package-lock.json ./`, because neither file exists.
> `lab-service/package.json` has **never been committed on any branch** in this repo's history
> (checked all six branches and the full log) — it is not a `.gitignore` accident, it was
> simply never pushed.
>
> Even with a manifest, the build would still fail: `server/index.ts` and `server/routes.ts`
> import six sibling modules that are not here —
> `./storage`, `./seed`, `./beacon`, `./crypto`, `./static`, `./loginRateLimit` — plus the
> `@shared/schema` alias. Only `index.ts`, `jwt.ts` and `routes.ts` are tracked. Third-party
> deps (`express`, `drizzle-orm`, `vite`, `esbuild`) are undeclared.
>
> What IS committed is the deployment scaffolding: this runbook, `Dockerfile`, `fly.toml`,
> the Cloudflare worker + `wrangler.toml`, the edge components, and the smoke script.
>
> **Risk worth naming:** the only known complete copy of this backend is the running
> `aigovops-beacon-lab.pplx.app` instance. If that preview app is torn down, the lab backend
> is gone. Recovering the source from there is the prerequisite for everything below.
>
> **DNS is no longer a blocker** (decided 2026-08-04). The target moved off
> `aigovops.foundation` — that zone is registered at **Name.com**, so the estate's headless
> `cloudflare-token` could not touch it — onto **`aigovops-foundation.com`**, which is active
> in Cloudflare and manageable by that token with no human in the loop. The record does not
> exist yet on purpose: pointing it at a Fly app that has not been deployed would just create
> a dangling CNAME. Create it as part of the deploy, per "Custom domain" below.
>
> **Why a single-label host** (`beacon-lab.…` and not `api.beacon-lab.…`): every record in
> this zone is proxied through Cloudflare, and Cloudflare's Universal SSL covers only
> `aigovops-foundation.com` and `*.aigovops-foundation.com` — one level. A two-label host like
> `api.beacon-lab.aigovops-foundation.com` is NOT covered and would need paid Advanced
> Certificate Manager. It also matches the zone's existing convention (`www`, `community`).
>
> So the remaining prerequisite is exactly one thing: **recover the missing source.**

One-page operator runbook. Assumes `flyctl` is installed (`brew install flyctl`
or https://fly.io/docs/hands-on/install-flyctl/).

---

## First-time setup

```bash
# 1. Authenticate
flyctl auth login

# 2. Launch without immediately deploying (reads fly.toml from this repo)
flyctl launch --no-deploy

# 3. Create the persistent SQLite volume (1 GB is plenty for lab use)
flyctl volumes create beacon_data --size 1 --region sjc

# 4. Generate RS256 key pair for JWT signing
openssl genrsa -out jwt.key 2048
openssl rsa -in jwt.key -pubout -out jwt.pub

# 5. Set runtime secrets
flyctl secrets set \
  ADMIN_PASSWORD="<your-strong-password>" \
  JWT_PRIVATE_KEY="$(cat jwt.key)" \
  JWT_PUBLIC_KEY="$(cat jwt.pub)" \
  CORS_ALLOWED_ORIGINS="https://aigovops-foundation.github.io"

# 6. Deploy
flyctl deploy
```

---

## Subsequent deploys

```bash
flyctl deploy
```

That's it — Fly builds the Docker image, runs the health check
(`GET /api/status`), and does a rolling replace with zero downtime.

---

## Custom domain: beacon-lab.aigovops-foundation.com

The zone is on Cloudflare and the estate's `cloudflare-token` can create this record headlessly
(`core.secrets.BROKER.resolve("cloudflare-token")` → Cloudflare API). No registrar login needed.

**Order matters here.** Create the record *grey-clouded* (`proxied: false`) first. While a record
is proxied, Cloudflare terminates TLS itself and Fly's ACME validation cannot see the origin, so
`flyctl certs add` will sit unvalidated. Issue the Fly cert first, then turn the proxy on if you
want it — which the rest of this zone does.

1. Create the CNAME, DNS-only to start:
   ```bash
   # proxied=false  ← important; flip to true only after step 3 reports Ready
   curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
     -d '{"type":"CNAME","name":"beacon-lab","content":"aigovops-beacon-lab.fly.dev",
          "ttl":300,"proxied":false}'
   ```
2. Add the certificate in Fly:
   ```bash
   flyctl certs add beacon-lab.aigovops-foundation.com
   ```
3. Wait for validation, then confirm:
   ```bash
   flyctl certs show beacon-lab.aigovops-foundation.com   # want: Status = Ready
   ```
4. Optionally set `proxied: true` (PATCH the record) so it matches `www` and `community`. Use
   Cloudflare SSL mode **Full (strict)** — Fly now has a real cert, so there is no reason to
   accept anything weaker.
5. Point the page at it — `docs/lab.html` sets `window.__BEACON_API_BASE__`, which still defaults
   to the pplx.app host. Switch it only once step 3 is Ready, or the v2 experiment breaks for
   testers with nothing gained.
6. `CORS_ALLOWED_ORIGINS` must list the *callers*, not this host — i.e. where `lab.html` is
   served from:
   ```bash
   flyctl secrets set CORS_ALLOWED_ORIGINS="https://aigovops-foundation.github.io"
   ```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Admin console password |
| `JWT_PRIVATE_KEY` | recommended | PEM RSA private key for RS256 JWTs |
| `JWT_PUBLIC_KEY` | recommended | PEM RSA public key for RS256 JWTs |
| `JWT_SECRET` | fallback | Shared secret for HS256 (used if RS keys absent) |
| `CORS_ALLOWED_ORIGINS` | yes (for Pages) | Comma-separated allowed Origins |
| `PORT` | no | Defaults to 5000 |
| `LAB_NAME` | no | Displayed in /api/status |

---

## Scaling

The app is configured for auto-start/stop (single machine, ~256 MB RAM).
If you need higher availability:

```bash
flyctl scale count 2
```

SQLite is fine for the workshop scale; Litestream-to-S3 replication is the
next step if you need durability guarantees beyond Fly volume snapshots.

---

## Logs

```bash
flyctl logs
```
