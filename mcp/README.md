# MCP server — AIGovOps Beacon

Speaks the [Model Context Protocol](https://modelcontextprotocol.io) so MCP-capable agents (Claude Desktop, Cursor, Continue, Goose, Zed) can read and write Beacon receipts.

## Tools

| Tool | Purpose |
|---|---|
| `record_decision` | Write a signed governance decision receipt |
| `verify_receipt` | Verify a receipt by id or hash |
| `query_inventory` | List discovered AI services |
| `score_framework` | Run a framework checklist + return score and gaps |
| `bundle_for_auditor` | Produce a verifiable receipt bundle |
| `replay_case` | Replay one of the 100 historical failure cases |

## Transports

- **stdio** (default) — used by Claude Desktop, Cursor, Continue, Goose, Zed.
- **SSE** — `MCP_TRANSPORT=sse MCP_PORT=8799 node server.js`. For browser-based or remote agents.

## Use from Claude Desktop

1. Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
2. Paste the snippet from `claude_desktop_config.json` in this folder, replacing the absolute path.
3. Restart Claude Desktop. Six new tools appear.

## Use over SSE

```bash
MCP_TRANSPORT=sse MCP_PORT=8799 node server.js
# Connect SSE clients to http://localhost:8799/sse
# Healthcheck: http://localhost:8799/healthz
```

## Offline tolerance

If Beacon core is unreachable, each tool returns `{ mode: "offline-simulation", ... }` so the agent still gets a structured response. This is the lab-mode default for workshops.

## Observer role (planned for v2.3)

Beyond serving as an MCP server, Beacon will wrap other MCP servers and attest their `tools/call` invocations as receipts. This is the **MCP-audit** layer — there is no equivalent today.

Apache-2.0.
