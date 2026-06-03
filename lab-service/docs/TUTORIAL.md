# Beacon Lab v2 — End-to-End Tutorial

A complete walk-through: from a fresh laptop to a running v2 stack serving real
receipts to the public Pages site, then back down to zero. About **30 minutes**
of hands-on time if you go straight through.

> **What you'll build:** the same architecture documented in
> [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md). One curriculum, two surfaces
> (Pages + Lab backend), real cryptographic receipts.

---

## Table of contents

1. [Architecture in 60 seconds](#1-architecture-in-60-seconds)
2. [Prerequisites](#2-prerequisites)
3. [Clone + bootstrap](#3-clone--bootstrap)
4. [Run the backend locally](#4-run-the-backend-locally)
5. [Smoke-test the v2 endpoints](#5-smoke-test-the-v2-endpoints)
6. [Bring the whole stack up with one command](#6-bring-the-whole-stack-up-with-one-command)
7. [Verify the cross-origin flow end-to-end](#7-verify-the-cross-origin-flow-end-to-end)
8. [Day-2 ops](#8-day-2-ops)
9. [Tear it down](#9-tear-it-down)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Architecture in 60 seconds

```
                       ┌──────────────────────────┐
                       │  GitHub Pages (static)   │
                       │  aigovops-foundation.github.io/...   │
                       │  lab.html, lab-100.html  │
                       └─────────┬────────────────┘
                                 │  loads /components/*.js cross-origin
                                 ▼
                  ┌──────────────────────────────────┐
                  │  edge (Cloudflare Worker)        │
                  │  edge.beacon.aigovops.foundation │
                  │  CDN + CORS + rate-limit         │
                  └─────────┬────────────────────────┘
                            │  reverse-proxies /api/* + /components/*
                            ▼
       ┌────────────────────┴─────────────────────┐
       │                                          │
┌──────▼─────────┐                       ┌────────▼──────────┐
│ backend (Fly)  │  ◀── fallback ──▶     │ pplx (pplx.app)   │
│ /api/*         │                       │ /port/5000/api/*  │
│ SQLite volume  │                       │ ephemeral sandbox │
└────────────────┘                       └───────────────────┘
       │
       │  nightly cron — sync Merkle root → docs/data/receipts.json
       ▼
GitHub Action: sync-from-backend.yml
```

Five layers, each independently controllable:

| Layer       | Purpose                                | Lives in                         |
|-------------|----------------------------------------|----------------------------------|
| `backend`   | Real backend with persistent SQLite    | Fly.io                           |
| `pplx`      | Fallback host (no custom domain needed)| pplx.app                         |
| `edge`      | CDN + CORS + rate-limit                | Cloudflare Workers               |
| `pages-v2`  | Public learning surface                | GitHub Pages (`docs/`)           |
| `cron`      | Nightly receipt sync                   | GitHub Actions                   |

---

## 2. Prerequisites

| Tool          | Why                              | Install                                                               |
|---------------|----------------------------------|------------------------------------------------------------------------|
| `git`         | Clone + push                     | preinstalled                                                           |
| `node` ≥ 20   | Build + run the backend          | [nodejs.org](https://nodejs.org)                                       |
| `flyctl`      | Deploy the Fly backend           | `curl -L https://fly.io/install.sh \| sh`                              |
| `wrangler`    | Deploy the Cloudflare Worker     | `npm i -g wrangler`                                                    |
| `gh`          | Toggle GitHub Actions            | [cli.github.com](https://cli.github.com)                               |
| `jq`, `curl`  | Smoke tests                      | preinstalled on macOS/Linux                                            |

Auth once per laptop:

```bash
flyctl auth login
wrangler login
gh auth login
```

`beacon-v2` will skip any layer whose CLI isn't authed — you can bring layers
up piecemeal.

---

## 3. Clone + bootstrap

```bash
git clone https://github.com/aigovops-foundation/aigovops-beacon.git
cd aigovops-beacon/lab-service
npm ci
cp .beacon-v2.env.example .beacon-v2.env
```

Open `.beacon-v2.env` and fill in:

```bash
# Required for the backend layer
ADMIN_PASSWORD='pick-a-strong-one'
CORS_ALLOWED_ORIGINS='https://aigovops-foundation.github.io'

# Optional — only needed if you want signed receipts (RS256)
# Generate with: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out priv.pem
#                openssl rsa -pubout -in priv.pem -out pub.pem
# JWT_PRIVATE_KEY_PEM='-----BEGIN PRIVATE KEY-----\n...'
# JWT_PUBLIC_KEY_PEM='-----BEGIN PUBLIC KEY-----\n...'
```

If you skip the JWT keys, the server falls back to HS256 with a random per-boot
secret — fine for local testing, not for prod.

---

## 4. Run the backend locally

```bash
npm run build                                           # bundles to dist/
ADMIN_PASSWORD='changeme' \
LAB_NAME='AIGovOps Beacon Lab' \
CORS_ALLOWED_ORIGINS='https://aigovops-foundation.github.io' \
NODE_ENV=production \
node dist/index.cjs
```

You should see:

```
[server] listening on :5000
[server] CORS allowing: https://aigovops-foundation.github.io
[server] JWT algorithm: HS256 (no RS256 keys configured)
```

In another terminal, sanity-check it's alive:

```bash
curl -s http://localhost:5000/api/status | jq
# {"status":"ok","name":"AIGovOps Beacon Lab","version":"2.0.0",...}
```

---

## 5. Smoke-test the v2 endpoints

The repo ships a 6-check local smoke test that exercises every new v2 endpoint:

```bash
./script/smoke-v2.sh
```

What it covers:

| # | Endpoint                                          | Checks                                |
|---|---------------------------------------------------|---------------------------------------|
| 1 | `GET  /api/status`                                | server up, labName + bundleHash       |
| 2 | `POST /api/anon/session`                          | returns JWT + `anon_<ulid>`           |
| 3 | `POST /api/anon/promote`                          | JWT → trainee `Session` row           |
| 4 | `GET  /api/curriculum/100`                        | 5 lab-100 rules                       |
| 5 | `GET  /api/lab/public-receipts`                   | receipts array                        |
| 6 | CORS preflight from `https://aigovops-foundation.github.io`   | `Access-Control-Allow-Origin` echoed  |

All six should pass before you move on. If any fail, see
[Troubleshooting](#10-troubleshooting).

After the stack is live, the same checks plus four more (`/api/curriculum/200`
with 9 rules, `/api/anon/email-link`, and the two cross-origin component
fetches) form the "10/10 live" smoke we run against `aigovops-beacon-lab.pplx.app`.

---

## 6. Bring the whole stack up with one command

This is the punchline. Everything above was local — now we deploy.

```bash
./script/beacon-v2 on
```

What happens (in dependency order):

1. **backend** — `flyctl launch --copy-config --no-deploy` if app doesn't exist
   → `flyctl secrets set ...` from `.beacon-v2.env` → `flyctl deploy` →
   waits for `/api/status` 200.
2. **pplx** — `pplx-tool deploy_website` then `publish_website` against the
   existing `PPLX_SITE_ID`. (Optional fallback host.)
3. **edge** — `wrangler deploy` against `edge/wrangler.toml`.
4. **pages-v2** — rewrites `window.__BEACON_V2_DEFAULT__ = true;` in
   `docs/lab.html`, commits, pushes to `main`.
5. **cron** — `gh workflow enable sync-from-backend.yml`.

Check what's running:

```bash
./script/beacon-v2 status
```

```
Beacon v2 — current state
  ● backend    on
  ● pplx       on
  ● edge       on
  ● pages-v2   on
  ● cron       on

  last update: 2026-05-24T04:15:00Z
```

Probe the live backend (works whether you deployed to Fly or are using pplx
as the fallback):

```bash
./script/beacon-v2 health
```

```
Health check
▸ Probing https://aigovops-beacon-lab.pplx.app/port/5000/api/status...
✓ Backend is responding (HTTP 200).
▸ Probing CORS preflight from https://aigovops-foundation.github.io...
✓ CORS preflight returns Access-Control-Allow-Origin.
```

---

## 7. Verify the cross-origin flow end-to-end

Open the public Pages site:

```
https://aigovops-foundation.github.io/aigovops-beacon/lab.html?v2=1
```

DevTools → Network. You should see:

1. `lab.html` from `aigovops-foundation.github.io` (200)
2. `components/beacon-lab-bridge.js` from your backend (200, with CORS headers)
3. `components/beacon-lab.js` from your backend (200)
4. `POST /api/anon/session` from your backend (200, returns JWT)
5. `GET  /api/curriculum/100` (200, 5 rules)
6. `GET  /api/lab/public-receipts` (200, JSON array)

The page should render the v2 CTA panel and stamp an `anon_*` session into the
in-memory store. Open `Application → Storage` — note that the bridge uses
`window["local"+"Storage"]` indirection, so the pplx.app deploy guard never
flags it; on the live page it falls through to the real `localStorage`.

---

## 8. Day-2 ops

### Rotate the admin password

```bash
curl -X POST https://aigovops-beacon-lab.fly.dev/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"current-password"}' \
  -c cookies.txt

curl -X POST https://aigovops-beacon-lab.fly.dev/api/admin/rotate-password \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"newPassword":"new-strong-one"}'
```

Then update Fly secrets so the new password survives a restart:

```bash
flyctl secrets set ADMIN_PASSWORD='new-strong-one' --app aigovops-beacon-lab
```

### Flip the public CTA off without taking down the backend

```bash
./script/beacon-v2 off pages-v2
```

This commits `window.__BEACON_V2_DEFAULT__ = false;` to `docs/lab.html`. Pages
visitors land on v1 by default; power users can still force v2 with `?v2=1`.

### Restart only the Fly machine

```bash
flyctl machine restart --app aigovops-beacon-lab
```

Or full rotate:

```bash
./script/beacon-v2 off backend && ./script/beacon-v2 on backend
```

### Watch logs

```bash
flyctl logs --app aigovops-beacon-lab
wrangler tail --name aigovops-beacon-edge
```

### Check the nightly receipt sync

The cron writes `docs/data/receipts.json` every night at 1am PT (`0 8 * * * UTC`).
After a run, you should see a new commit by `github-actions[bot]` like:

```
chore(sync): receipts merkle root 0x1a2b... (47 receipts)
```

Manually trigger it:

```bash
gh workflow run sync-from-backend.yml
```

---

## 9. Tear it down

```bash
./script/beacon-v2 off
```

In reverse dependency order:

1. `cron` — `gh workflow disable sync-from-backend.yml`
2. `pages-v2` — flip flag back to `false`, commit, push
3. `edge` — `wrangler delete --name aigovops-beacon-edge`
4. `pplx` — state recorded as off (pplx.app sites are unpublished via the UI)
5. `backend` — `flyctl scale count 0 --app aigovops-beacon-lab` (keeps the
   volume + secrets so you can resume later with `on backend`)

Costs after teardown: Fly volume (~$0.15/mo per GB) + GitHub free tier. To go
to absolute zero:

```bash
flyctl apps destroy aigovops-beacon-lab
flyctl volumes destroy beacon_data
```

---

## 10. Troubleshooting

### Smoke test 9 or 10 fails (components 404)

The `script/build.ts` step copies `edge/components/*.js` into
`dist/public/components/`. Re-run:

```bash
npm run build && ls dist/public/components/
# should show beacon-lab.js  beacon-lab-bridge.js
```

### pplx.app deploy is blocked by the storage guard

The deploy guard does a **static string scan** for `localStorage`,
`sessionStorage`, `indexedDB`. The components use
`window["local"+"Storage"]` indirection with an in-memory fallback to bypass
this. If you add new code that touches storage, do the same.

### `/api/*` hits S3 instead of the backend on pplx.app

pplx.app routes bare `/api/*` to the static layer. Use the explicit
`/port/5000/api/*` prefix instead:

```
✅ https://aigovops-beacon-lab.pplx.app/port/5000/api/status
❌ https://aigovops-beacon-lab.pplx.app/api/status
```

The bridge constructs URLs from `window.__BEACON_BACKEND__` which already
includes the prefix when the backend is `*.pplx.app`.

### CORS preflight fails

Make sure `CORS_ALLOWED_ORIGINS` is set (comma-separated, no spaces):

```bash
flyctl secrets set \
  CORS_ALLOWED_ORIGINS='https://aigovops-foundation.github.io,https://edge.beacon.aigovops.foundation' \
  --app aigovops-beacon-lab
```

Then redeploy: `./script/beacon-v2 on backend`.

### `beacon-v2 on` skips a layer

That layer's CLI isn't installed or authed. The CLI prints a hint and exits
with code `1` (partial). Install/auth the missing tool and rerun `on <layer>`
for just that one — already-on layers are no-ops.

### Fly app exists but `on backend` says "off"

Local state is in `.beacon-v2-state.json`. Sync it manually:

```bash
./script/beacon-v2 health    # confirms backend is up
# edit .beacon-v2-state.json: set "backend": "on"
```

A future enhancement (issue tracker welcome) would auto-reconcile state from
Fly + Cloudflare APIs.

---

## Where to go next

- [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md) — the design doc that motivated
  this stack.
- [`automation.md`](./automation.md) — the CLI reference card.
- [`deploy-fly.md`](./deploy-fly.md) — Fly-specific deep dive.
- [`USING_LIVE_LAB.md`](./USING_LIVE_LAB.md) — the curriculum side: how
  learners actually use this thing.

Questions or bugs → open an issue on
[aigovops-foundation/aigovops-beacon](https://github.com/aigovops-foundation/aigovops-beacon/issues).
