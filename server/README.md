# beacon-server

The runtime. Node 20+ and SQLite, nothing else.

## Quick start

```bash
cd server
npm install
npm run init      # creates ~/.beacon and the first Ed25519 key
npm run seed      # optional: insert example inventory and receipts
npm start         # serves on http://127.0.0.1:8787
```

Open the Studio at `http://localhost:5173` after `cd ../studio && npm run dev`.

## What lives on disk

```
~/.beacon/
  beacon.sqlite                index of inventory, attestations, gates
  keys/ed25519-<fpr>.json      signing keys (0600)
  receipts/YYYY-MM-DD.ndjson   append-only signed receipts
  anchors.ndjson               hourly Merkle anchors
  bundles/bundle-<ts>/         exported audit packages
  config.yaml                  optional overrides
```

## Endpoints

See `../docs/CONTROL_PLANE.md` for the full list. Highlights:

- `POST /api/v1/discover` — feed a proxy/DNS log or CSV.
- `POST /api/v1/inventory/:id/trust` — change Trust Tier.
- `POST /api/v1/receipts` — write a signed receipt.
- `GET  /api/v1/receipts/:id/verify` — check a signature.
- `POST /api/v1/gate/production-readiness` — run the gate.
- `POST /api/v1/export` — produce a verifiable audit bundle.

## Identity

Beacon expects an OIDC-proxy in front of it. The proxy must set:

- `X-Beacon-User-Sub`
- `X-Beacon-User-Email`
- `X-Beacon-OIDC-Issuer`

Without these headers receipts will be rejected by the
`transaction_signing` policy.

## Verify a bundle without Beacon

```bash
node src/cli.js verify /path/to/bundle
```

The same logic is documented in plain English inside every bundle's
`VERIFY.md`. Auditors should run it themselves, not trust Beacon's
self-report.
