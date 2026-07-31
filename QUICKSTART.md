# Quickstart

Three terminals, ten minutes, one signed audit bundle on disk.

## 1. Run the server

```bash
cd server
npm install
npm run init           # creates ~/.beacon and the first Ed25519 key
npm run seed           # optional: insert four example models + receipts
npm start              # http://127.0.0.1:8787
```

You should see:

```
Beacon 0.1.0 listening on http://127.0.0.1:8787
  data root: /Users/you/.beacon
  active key fingerprint: ab12cd34ef56…
```

## 2. Run the Studio

```bash
cd studio
npm install
npm run dev            # http://localhost:5173
```

## 3. Walk the wizard

1. **What network** — type a label, anything will do.
2. **What's running** — paste a CSV or use the seed inventory.
3. **What matters** — pick one model.
4. **Pick guardrails** — leave NIST AI RMF and Human Flourishing on.
5. **Your audit** — see the gate decision. Click "Generate audit bundle."

Open `~/.beacon/bundles/bundle-<timestamp>/` and read `VERIFY.md`.
That's what your auditor gets. They verify it without Beacon.

## What your auditor does — one command, nothing installed

The bundle carries its own verifier. Send them the directory (or a zip of it);
from inside it they run:

```bash
python3 verify_bundle.py .
```

```
beacon-verify: OK — 47 receipts verified (bundle format)
  manifest: intact (sha256 df9708e7aa774938…, over file)
  keys:     2 (ab12cd34ef561234, 9f81be22c7a40d55)
  receipts: 2026-07-29.ndjson (12)
  receipts: 2026-07-30.ndjson (35)
```

Exit code 0 means every signature verified against the key that signed it,
the manifest is intact, and no receipt went missing. Non-zero names what
failed. Python 3.10+ is the only requirement — `cryptography` is used when
present, and a pure-Python Ed25519 fallback in the same file covers the
air-gapped case.

Same check, run from a checkout instead of from inside a bundle:

```bash
python3 src/beacon_verify.py ~/.beacon/bundles/bundle-2026-05-13T12-30-00-000Z
```

A single receipt log, rather than a whole bundle, works the same way:

```bash
python3 src/beacon_verify.py --public-key ~/.beacon/keys/ed25519.pub \
  ~/.beacon/receipts/2026-05-13.ndjson
```

## Verify a bundle from the Node CLI

```bash
cd server
node src/cli.js verify ~/.beacon/bundles/bundle-2026-05-13T12-30-00-000Z
```

This is the same check from the server side. It is for operators — an auditor
should use `verify_bundle.py`, which needs no Node, no npm install, and no
native modules.

## Wire a real model into receipts

Send a POST every time your app calls an LLM:

```bash
curl -s http://127.0.0.1:8787/api/v1/receipts \
  -H "Content-Type: application/json" \
  -H "X-Beacon-User-Sub: oidc|alice" \
  -H "X-Beacon-User-Email: alice@example.org" \
  -H "X-Beacon-OIDC-Issuer: https://accounts.example.org" \
  -d '{
    "vendor": "OpenAI",
    "model": "gpt-4o-mini",
    "version": "2024-07-18",
    "environment": "production",
    "event_type": "invocation",
    "prompt": "summarize the policy",
    "result": "…",
    "latency_ms": 312,
    "tokens": {"in": 21, "out": 47}
  }'
```

The receipt comes back signed. Verify it any time with
`GET /api/v1/receipts/<id>/verify`.

## Want it on a server?

See `deploy/README.md`. Docker, docker-compose, Railway, Render, or
DigitalOcean App Platform. Same runtime, same shape.
