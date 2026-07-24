# Beacon Lab v2 — Automation (`beacon-v2`)

A single bash CLI that brings the entire v2 stack up or down with one command.

```bash
./script/beacon-v2 on        # everything on
./script/beacon-v2 off       # everything off
./script/beacon-v2 status    # what's running
./script/beacon-v2 health    # probe the live backend
```

## Layers (dependency order)

| Layer        | Tech                       | Default host                                        |
|--------------|----------------------------|------------------------------------------------------|
| `backend`    | Fly.io app                 | `api.beacon-lab.aigovops.foundation`                 |
| `pplx`       | pplx.app published site    | `aigovops-beacon-lab.pplx.app` (current host)        |
| `edge`       | Cloudflare Worker          | `edge.beacon.aigovops.foundation`                    |
| `pages-v2`   | GitHub Pages flag flip     | `docs/lab.html` (sets `window.__BEACON_V2_DEFAULT__`)|
| `cron`       | GitHub Action              | `.github/workflows/sync-from-backend.yml`            |

`on` walks the table top-down; `off` walks bottom-up. Each layer is independently
controllable: `beacon-v2 on backend`, `beacon-v2 off cron`, etc.

## What it does per layer

- **backend** — checks `flyctl auth` → `flyctl launch --copy-config --no-deploy` if
  the app doesn't exist → `flyctl secrets set` from `.beacon-v2.env` → `flyctl deploy`
  → waits for the `/api/status` 200 → records to state.
- **pplx** — `pplx-tool deploy_website` then `pplx-tool publish_website` against the
  existing `PPLX_SITE_ID`. Republishes in place; no preview-URL drift.
- **edge** — `wrangler deploy` against `edge/wrangler.toml`. `off` runs
  `wrangler delete --name $CF_WORKER_NAME`.
- **pages-v2** — rewrites the `window.__BEACON_V2_DEFAULT__` script tag in
  `docs/lab.html`, commits, and pushes to `main`.
- **cron** — enables / disables the `sync-from-backend.yml` workflow via
  `gh workflow enable/disable`. State-only fallback when `gh` is unavailable.

## What only **you** can do

The CLI handles the commands but needs interactive auth once per machine:

```bash
flyctl auth login        # for backend layer
wrangler login           # for edge layer
gh auth login            # for cron workflow enable/disable
```

For custom domains (`api.beacon-lab.*`, `edge.beacon.*`), point DNS once and the
CLI handles certs via flyctl + Cloudflare.

## State + config

- `.beacon-v2-state.json` — current on/off of every layer (gitignored).
- `.beacon-v2.env` — optional per-machine overrides (gitignored).
- Copy `.beacon-v2.env.example` → `.beacon-v2.env` to customize.

## Exit codes

| Code | Meaning                                                   |
|------|-----------------------------------------------------------|
| `0`  | All requested layers succeeded.                           |
| `1`  | Partial — at least one layer was skipped (missing creds). |
| `2`  | Hard failure — at least one layer errored out.            |
| `3`  | Bad usage / unknown layer / unknown command.              |

## Examples

```bash
# Fresh laptop, full bring-up
flyctl auth login && wrangler login && gh auth login
cp .beacon-v2.env.example .beacon-v2.env  # edit secrets
./script/beacon-v2 on

# Demo over — keep code, kill costs
./script/beacon-v2 off

# Just rotate the Fly app
./script/beacon-v2 off backend && ./script/beacon-v2 on backend

# Flip the Pages CTA off without touching anything else
./script/beacon-v2 off pages-v2
```
