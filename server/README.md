# beacon-server

The runtime. Node 20+ and SQLite, nothing else.

## Quick start

```bash
cd server
npm install       # no compiler needed on Node 22.13+
npm run init      # creates ~/.beacon and the first Ed25519 key
npm run seed      # optional: insert example inventory and receipts
npm start         # serves on http://127.0.0.1:8787
```

Open the Studio at `http://localhost:5173` after `cd ../studio && npm run dev`.

### Which SQLite

`src/services/db.js` picks a driver at open time:

| Node | Driver | Compiler needed |
|---|---|---|
| 22.13+ | built-in `node:sqlite` | no |
| 20 | `better-sqlite3` (optional dependency) | only if npm has no prebuilt for your platform |

`better-sqlite3` is an **optional** dependency on purpose. On Node 24/26 it has
no prebuilt binary and will not compile against a newer V8, so `npm install`
used to fail outright — the first command of the quickstart. Optional means that
build failure is a warning, and the built-in driver takes over.

Pin one with `BEACON_SQLITE_DRIVER=node` or `BEACON_SQLITE_DRIVER=better-sqlite3`
— `test/unit/db-driver.test.js` uses it to run the same assertions against both
so the two cannot silently drift.

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
