# aigovops-beacon-agent

A **restricted** AI agent that can call exactly six tools — the six AiGovOps
Beacon governance tools — and nothing else. Deployable to Cloudflare Workers
free tier.

## Why it exists

Most "do anything" agents fail enterprise procurement at the same step:
*"what can it actually do, and can you prove it?"*. We flip the question.

This agent's tool universe is **closed and audited**:

```
record_decision      verify_receipt        query_inventory
score_framework      bundle_for_auditor    replay_case
```

It cannot browse the web. It cannot call your CRM. It cannot exfiltrate
data. Every tool call produces a signed Beacon receipt, in Ed25519, that
your auditor can verify offline. See [`../SUPERAGENT.md`](../SUPERAGENT.md)
for why this matters.

## What you get

- A Cloudflare Worker (`worker.js`) that:
  - Serves a single static HTML chat UI at `/`.
  - Accepts `POST /chat` with `{ messages, apiKey, provider }`.
  - Talks to Anthropic Claude **or** OpenAI with a strict system prompt
    and a tool list pulled from the hosted Beacon MCP `tools/list`.
  - On a tool-use response, calls the hosted Beacon MCP `/messages`
    endpoint, feeds the result back to the model, and loops until the
    model produces a final answer (max 6 hops).
- `wrangler.toml` for one-command deploy.
- `index.html` — a 5KB chat UI, same Hydra Teal palette as the walkthrough.

## Bring-your-own-key

The Worker never holds an LLM API key. Users paste their own Anthropic
or OpenAI key into the UI; the Worker forwards it on each request and
forgets it. The key never touches storage. This is on purpose:

1. We don't want the bill.
2. Compliance reviewers like it: no third-party model contract for
   the demo.
3. It maps to how Beacon expects to be deployed — bring your own
   model, bring your own data, Beacon governs the boundary.

## Deploy

```bash
cd agent
npm install -g wrangler            # if not already
wrangler login                     # opens browser
# Edit wrangler.toml → set MCP_URL to your Render MCP URL
wrangler deploy
```

You will get a `https://aigovops-beacon-agent.<your-subdomain>.workers.dev`
URL. Open it. Paste your Anthropic or OpenAI key. Try:

> Show me the AI inventory and bundle the last 30 days for an EU AI Act audit.

The agent will: `query_inventory` → `bundle_for_auditor` → return a
manifest sha256.

## Local dev

```bash
cd agent
npx wrangler dev
# open http://127.0.0.1:8787
```

`wrangler dev` proxies a real Worker runtime locally so this is the same
binary you ship.

## Architecture

```
 browser (chat UI)
      │
      │ POST /chat  { messages, apiKey, provider }
      ▼
 ┌─────────────────────────────────────┐
 │  Cloudflare Worker                  │
 │  - system prompt (restrictive)      │
 │  - tools = Beacon MCP tools/list    │
 │  - LLM call (Anthropic OR OpenAI)   │
 │  - if tool_use → call MCP, loop     │
 └─────────────────────────────────────┘
      │
      │ MCP-SSE (initialize, tools/call)
      ▼
 hosted Beacon MCP  (Render)  ←── embedded Beacon core
```

## Tool restriction is enforced in two places

1. **System prompt**: explicit list, plus "do not invent tools".
2. **Worker code**: only the names returned by Beacon MCP `tools/list`
   are allowed; any other tool name in the model output is rejected.

If a future model hallucinates `web_search` or `shell_exec`, the Worker
refuses the call, logs it as a Beacon receipt
(`event_type=tool_refusal`), and asks the model to try again.

## License

Apache-2.0.
