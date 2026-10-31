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
| 20 | `better-sqlite3` (required dependency, 12.9 ships prebuilt binaries for Node 20–25) | no |

`better-sqlite3` is a **required** dependency (decided 2026-10-30, Beacon #74 review):
when it was optional, a failed native build was only a warning, so on Node 20 —
which has no `node:sqlite` — `npm install` could succeed and `npm run init` then
fail with no driver at all. Version 12 ships prebuilt binaries for Node 20
through 26, so nothing compiles on any supported Node; on 22.13+ the built-in
driver is still preferred.

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
