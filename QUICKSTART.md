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

## Verify a bundle on the command line

```bash
cd server
node src/cli.js verify ~/.beacon/bundles/bundle-2026-05-13T12-30-00-000Z
```

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

See `deploy/README.md`. Docker, docker-compose, Railway, or Fly. Same
runtime, same shape.
