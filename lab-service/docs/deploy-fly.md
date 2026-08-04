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
> Also note `api.beacon-lab.aigovops.foundation` (and `beacon.aigovops.foundation`) are
> currently **NXDOMAIN**. The `aigovops.foundation` zone is registered at **Name.com**, not
> Cloudflare — so the estate's headless `cloudflare-token` cannot create these records. That
> step needs Name.com access.

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
flyctl volumes create beacon_data --size 1 --region sea

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

## Custom domain: api.beacon-lab.aigovops.foundation

1. In your DNS provider, add a CNAME:
   ```
   api.beacon-lab.aigovops.foundation  →  <app-name>.fly.dev
   ```
2. Add the certificate in Fly:
   ```bash
   flyctl certs add api.beacon-lab.aigovops.foundation
   ```
3. Follow the DNS challenge instructions Fly prints to validate.
4. Update `CORS_ALLOWED_ORIGINS` if you add more allowed origins:
   ```bash
   flyctl secrets set CORS_ALLOWED_ORIGINS="https://aigovops-foundation.github.io,https://aigovops.foundation"
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
