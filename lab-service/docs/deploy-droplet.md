# Deploying Beacon Lab on the Omni droplet (the Foundation's live instance)

Since 2026-10-26 the Foundation's live lab, `https://beacon-lab.aigovops-foundation.com`, runs on the
Omni DigitalOcean droplet next to the Community platform. One hosting bill, one tunnel, no Fly.

## Layout on the droplet

| Piece | Where |
|---|---|
| Compose project | `/opt/beacon-lab/compose.yml` (mode 600; holds the env, including `ADMIN_PASSWORD`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`) |
| Source checkout | `/opt/beacon-lab/aigovops-beacon/` (shallow clone of this repo; image built from `lab-service/`) |
| Data | `/opt/beacon-lab/data/` → mounted at `/data` in the container (`lab.db` + `-wal`/`-shm`, copied from the Fly volume at the move) |
| Listener | container port 5000 published on `127.0.0.1:5000` only |
| Ingress | `/etc/cloudflared/config.yml` (tunnel `omni`): `hostname: beacon-lab.aigovops-foundation.com → http://127.0.0.1:5000`. **Not** `/root/.cloudflared/config.yml` — that file is a stale copy the service never reads. |
| DNS | `beacon-lab` CNAME → the `omni` tunnel (`cloudflared tunnel route dns omni beacon-lab.aigovops-foundation.com`) |

## Day-to-day

```bash
ssh root@178.128.146.152
cd /opt/beacon-lab
docker compose ps                      # healthy?
docker compose logs --tail 50          # what happened
curl -s http://127.0.0.1:5000/api/status | head -c 300
```

Upgrade to the current `main`:

```bash
cd /opt/beacon-lab/aigovops-beacon && git pull --ff-only
cd /opt/beacon-lab && docker compose build && docker compose up -d
```

Rotate the admin password: edit `ADMIN_PASSWORD` in `compose.yml`, then `docker compose up -d`
(the service reads it at start; existing sessions stay valid until the JWT expires).

## Checks that prove it is up

- `curl -sI https://beacon-lab.aigovops-foundation.com/api/status` → `HTTP/2 200`, `server: cloudflare`.
- `GET /` returns 404 — the Express app has no root route; that is normal, not an outage.
- CORS preflight from `https://aigovops-foundation.github.io` → 204 with `access-control-allow-origin` set
  (the public `docs/lab.html` talks to this API cross-origin).
- The Library's estate uptime lane probes `/api/status` every 30 minutes and opens an issue on a flip.

## Rollback / history

The Fly app `aigovops-beacon-lab` (volume `beacon_data`) was left running at the move and is scaled
down later; while it exists, rollback is re-pointing the `beacon-lab` CNAME to
`le39ylr.aigovops-beacon-lab.fly.dev` in the Cloudflare dashboard. `deploy-fly.md` documents that
hosting as a recipe for your own copy.
