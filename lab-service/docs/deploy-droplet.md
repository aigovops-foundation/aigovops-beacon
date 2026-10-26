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

Rotate the admin password: the stored hash wins over the environment after first boot
(`server/seed.ts` keeps it), so editing `ADMIN_PASSWORD` in `compose.yml` alone changes nothing.
Rotate through the API, then update `compose.yml` so a fresh database would bootstrap the same value:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/admin/login -H 'content-type: application/json' \
  -d '{"password":"<current>"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:5000/api/admin/rotate-password -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"newPassword":"<new-strong-one>"}'
```

## Checks that prove it is up

- `curl -sI https://beacon-lab.aigovops-foundation.com/api/status` → `HTTP/2 200`, `server: cloudflare`.
- `GET /` returns 404 — the Express app has no root route; that is normal, not an outage.
- CORS preflight from `https://aigovops-foundation.github.io` → 204 with `access-control-allow-origin` set
  (the public `docs/lab.html` talks to this API cross-origin).
- The Library's estate uptime lane probes `/api/status` every 30 minutes and opens an issue on a flip.

## Rollback / history

The Fly app `aigovops-beacon-lab` (volume `beacon_data`) was left running at the move and is scaled
down later. Its database is frozen at the moment of the copy (2026-10-26): anything learners do on the
droplet afterwards — tenants, magic links, receipts — exists only in `/opt/beacon-lab/data`. So
re-pointing the `beacon-lab` CNAME back to `le39ylr.aigovops-beacon-lab.fly.dev` is a same-day
rollback only. Later, move the data back with both sides quiet — `docker compose stop` on the droplet
(the WAL is checkpointed on close), `flyctl machine stop` on Fly, then copy `lab.db`, `lab.db-wal` and
`lab.db-shm` together to the Fly volume (`flyctl ssh sftp shell`) and start Fly again — or accept the
split. Never copy while either process is running: SQLite files from two different moments make an
inconsistent database. `deploy-fly.md` documents that hosting as a recipe for your own copy.
