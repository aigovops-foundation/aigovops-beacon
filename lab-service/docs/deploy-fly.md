# Deploying Beacon Lab to Fly.io

> ## ✅ STATUS 2026-08-04 — DEPLOYED AND LIVE
>
> **https://beacon-lab.aigovops-foundation.com** — Fly app `aigovops-beacon-lab`, region `sjc`,
> 1 GB encrypted volume `beacon_data`, ~80 MB image. The public lab (`docs/lab.html`,
> `docs/lab-100.html`) was cut over to it the same day.
>
> This page previously opened with a ⛔ saying the service could not be deployed from this repo:
> `package.json` and six server modules had never been committed anywhere, and the only complete
> copy was the running `aigovops-beacon-lab.pplx.app` sandbox. That is history now — the service
> was **rebuilt** from what was committed (`routes.ts`/`index.ts`/`jwt.ts` define the API surface;
> the 22 `storage.*` call sites constrain the schema) and the recovery hunt is CLOSED. Don't re-run
> it.
>
> **Two consequences that never go away:** the signing private keys were lost with the sandbox, so
> receipts issued by the OLD deployment can never verify against this one; and the
> `beacon-foundation-inc` inventory was unrecoverable, so those rows are authored for the rebuild
> and labelled as such in `seed.ts`.
>
> **`ADMIN_PASSWORD` is deliberately UNSET**, so the admin console is disabled (login 401s) rather
> than shipping the literal `"beacon"` that used to be the fallback in `routes.ts`. Set it and
> restart; bootstrap adopts it because no hash exists yet.
>
> **Why a single-label host** (`beacon-lab.…`, not `api.beacon-lab.…`): every record in this zone is
> proxied, and Cloudflare Universal SSL covers only `aigovops-foundation.com` and
> `*.aigovops-foundation.com` — one level. A two-label host would need paid Advanced Certificate
> Manager. It also matches the zone's convention (`www`, `community`).
>
> **Read "Traps" below before deploying anything new here.** Four things in this stack fail only at
> deploy time, and one of them makes a perfectly healthy setup look like a DNS problem for half an
> hour.

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

---

## Traps — every one of these cost real time on 2026-08-04

**1. `force_https` blocks the FIRST certificate.** Fly's edge 301s everything on port 80 including
`/.well-known/acme-challenge`, so the HTTP-01 challenge can never be answered. The cert sits at
`Awaiting certificates` while `flyctl certs show` reports `dns_configured`, `alpn_configured`,
`http_configured` and `ownership_txt_configured` **all true**, and `flyctl certs list` says
**"Issued"** while `certs show --json` has `certificates: []`. Every signal points at DNS. DNS is
fine. Set `force_https = false`, deploy, wait for `Ready`, set it back, deploy again. **Do not go
hunting through DNS.**

**2. The `_acme-challenge` CNAME is load-bearing — never tidy it away.** Fly documents it as "only
needed if you want to generate the certificate before directing traffic", and it serves NO TXT while
an order is in flight, so it looks like dead scaffolding. Fly provisions the TXT afterwards. With
`force_https` on it is the only validation path Fly can use unattended, so deleting it breaks
**renewal** silently — you find out when the certificate expires. All three records are listed in
`fly.toml`.

**3. better-sqlite3 will compile from source, and the base image has no toolchain.** There is no musl
prebuild (so alpine fails), and 13.0.2 had none matching `node:22-slim` either — `prebuild-install`
falls back to `node-gyp` *silently*, ending in `find Python … could not be run`. The Dockerfile
installs `python3/make/g++` in the BUILDER only, compiles once, prunes to production, and the runtime
stage copies `node_modules`. Don't add a second `npm ci` to the runtime stage; that compiles twice and
puts a compiler in the shipped image.

**4. `[http_service.checks.alive]` is invalid.** It must be `[[http_service.checks]]`. Written as a
named sub-table, flyctl rejects the entire file with *"cannot unmarshal object into Go struct field
HTTPService.http_service.checks"* — which only ever appears at deploy time.

**Also:** the region is `sjc`. `sea` no longer exists (`region sea not found`), and the API is served
at the ROOT — there is no `/port/5000` prefix here; that was a pplx routing quirk.
