# aigovops-beacon-mcp-public

Public, internet-facing MCP server for AIGovOps Beacon.

This is the **hosted variant** of [`../mcp`](../mcp). Same six tools, same wire
protocol, but bundled with an embedded Beacon core so a single Render web
service is enough — no separate Beacon to point at.

## What you get

A single Node.js process that exposes, on the same `$PORT`:

- `GET  /`             — service banner
- `GET  /healthz`      — health (200 JSON)
- `GET  /readyz`       — readiness (200 once DB+keys are loaded)
- `GET  /sse`          — MCP SSE endpoint (clients connect here)
- `POST /messages?sid` — MCP JSON-RPC inbox (returned by the SSE handshake)
- `GET  /api/v1/*`     — full Beacon REST API (read-only by default in public mode)

The six MCP tools (`record_decision`, `verify_receipt`, `query_inventory`,
`score_framework`, `bundle_for_auditor`, `replay_case`) all call the embedded
Beacon over `http://127.0.0.1:8787/api/v1/*`. No external dependencies.

## Why a hosted variant exists

Beacon is meant to run *next to* the AI it governs — on a laptop, in a VPC,
in an air-gapped suitcase. That is the **only** posture we recommend for
production. This hosted MCP exists so:

1. Demo audiences can connect a real MCP client (Claude Desktop, Cursor,
   Goose) to a real Beacon without installing anything.
2. The [restricted Cloudflare Worker agent](../agent) has a stable URL to
   point at.
3. People can read the wire format from any browser.

The hosted instance is **demo-scoped**: ephemeral disk, public read,
write-throttled, no PII. Treat it as a sandbox, not a system of record.

## Deploy to Render (free tier)

`render.yaml` is included. From a fresh Render account:

1. Push this repo to GitHub (it already is).
2. Render → **New +** → **Blueprint** → connect the repo.
3. Render reads `mcp-public/render.yaml` and creates a `web` service.
4. Wait for the first deploy. Open the URL it gives you and you should see:

   ```json
   { "name":"aigovops-beacon-mcp-public","ok":true,"transport":"sse","beacon":"embedded" }
   ```

5. In Claude Desktop / Cursor / Goose, point an MCP SSE client at:

   ```
   https://<your-service>.onrender.com/sse
   ```

   You should see `tools/list` return the six Beacon tools.

Free tier dynos sleep after 15 minutes idle. Cold starts take ~30s. For a live
event use a paid dyno or run the suitcase locally.

## Run locally

```bash
cd mcp-public
npm install
PORT=8080 npm start
curl -s localhost:8080/healthz
curl -s localhost:8080/api/v1/health
```

To talk to it as an MCP client:

```bash
# SSE handshake (will hang open — that's the point)
curl -N localhost:8080/sse
```

## Configuration

| Env var          | Default                  | Meaning                                  |
| ---------------- | ------------------------ | ---------------------------------------- |
| `PORT`           | `8080`                   | Public port Render gives us              |
| `BEACON_PORT`    | `8787`                   | Internal Beacon core port (loopback)     |
| `BEACON_DATA_DIR`| `/tmp/beacon-public`     | Ephemeral. Demo posture.                 |
| `PUBLIC_MODE`    | `1`                      | Disables write endpoints not used by MCP |

## Security posture

This server is **public-readable** and **rate-limited**. The MCP write tools
(`record_decision`, `replay_case`) produce signed receipts in the embedded
Beacon — but that Beacon's data directory is ephemeral. Nothing here is
trusted for compliance evidence. For real evidence run the suitcase variant
([`../LAB.md`](../LAB.md), demo 1).

## License

Apache-2.0. Same as the rest of the repository.
