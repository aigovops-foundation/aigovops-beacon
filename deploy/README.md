# Deploying Beacon

Beacon is one process and one data directory. Pick the smallest shape
that lets your auditor see what they need to see.

## Local dev (the default)

```bash
cd server && npm install && npm run init && npm start
# in another terminal:
cd studio && npm install && npm run dev
```

## Docker (single VM)

```bash
docker build -f deploy/Dockerfile -t aigovops/beacon:0.1.0 .
docker run -d --name beacon \
  -v beacon_data:/data \
  -p 8787:8787 \
  aigovops/beacon:0.1.0
```

## docker-compose (with optional OIDC)

```bash
cd deploy
docker compose up -d
```

Uncomment the `oauth2-proxy` block to put OIDC in front. Beacon trusts
the `X-Beacon-User-Sub`, `X-Beacon-User-Email`, and
`X-Beacon-OIDC-Issuer` headers — `oauth2-proxy` sets them when configured
with `--pass-user-headers=true`.

## Railway one-click

`deploy/railway.json` declares the Dockerfile build and the healthcheck.
After connecting the repo:

```bash
railway up
railway domain
```

Add a mounted volume named `beacon_data` on `/data`.

## Render

[Render](https://render.com/) reads `deploy/render.yaml` as a blueprint and
provisions a Web Service plus a 1 GB persistent disk mounted at `/data`.
TLS is automatic. After connecting the repo:

```bash
# render-cli (optional — the dashboard works too)
render blueprint apply deploy/render.yaml
```

Set OIDC secrets in the dashboard before exposing the app publicly:

```
OIDC_ISSUER_URL=https://your-idp
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

## DigitalOcean App Platform

`deploy/do-app.yaml` is an App Spec that runs the Docker build with
healthchecks and managed TLS. App Platform doesn't ship a built-in
persistent volume, so the spec points bundle exports at a Spaces bucket
(S3-compatible) for durable storage; `/data` inside the container is a
hot cache.

```bash
doctl apps create --spec deploy/do-app.yaml
# later updates:
doctl apps update <APP_ID> --spec deploy/do-app.yaml
```

Set OIDC + Spaces secrets in the dashboard or via `doctl apps update --spec`
with the encrypted values in place.

If you need a real persistent volume on DO, run the Docker image on a
Droplet and attach a [Block Storage volume](https://docs.digitalocean.com/products/volumes/)
mounted at `/data` — same shape as the local Docker recipe above.

## Sizing

Beacon is small. A `t3.micro`, Render `starter`, or DO `basic-xs` with
512 MB – 1 GB and a 1 GB volume runs Beacon for years for a
department-sized footprint.
The receipt files are the bulk of the disk; rotate them out to S3, DO
Spaces, or Azure Blob with the `bundles/` export and `lifecycle` rules.

## Things to harden before production

- OIDC in front of every endpoint.
- TLS at the edge.
- `BEACON_CAPTURE_MODE=hash_only` unless legal has signed off on full.
- Schedule `beacon keygen --rotate` every 90 days; have a T3 human sign
  the rotation receipt in the Studio.
- Back up `/data` daily. Test restore quarterly.
