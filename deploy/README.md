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

## Fly.io

```bash
fly launch --no-deploy --copy-config --config deploy/fly.toml
fly volumes create beacon_data --size 1
fly deploy --remote-only
```

Set OIDC secrets before exposing the app publicly:

```bash
fly secrets set OIDC_ISSUER_URL=https://your-idp \
                OIDC_CLIENT_ID=… OIDC_CLIENT_SECRET=…
```

## Sizing

Beacon is small. A `t3.micro` or Fly `shared-cpu-1x` with 512 MB and a
1 GB volume runs Beacon for years for a department-sized footprint.
The receipt files are the bulk of the disk; rotate them out to S3 or
Azure Blob with the `bundles/` export and `lifecycle` rules.

## Things to harden before production

- OIDC in front of every endpoint.
- TLS at the edge.
- `BEACON_CAPTURE_MODE=hash_only` unless legal has signed off on full.
- Schedule `beacon keygen --rotate` every 90 days; have a T3 human sign
  the rotation receipt in the Studio.
- Back up `/data` daily. Test restore quarterly.
