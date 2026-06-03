# LAB.md — AIGovOps Beacon Workshop Playbook

> *Run Beacon on a laptop, on a corp network with no admin rights, or in production. Same code, three shapes. This file is the playbook.*

**Audience:** Workshop attendees, beta-corp pilot leads, security architects, and anyone who needs to **see** Beacon emit a verifiable receipt for an AI decision in under five minutes.

**License:** Apache-2.0. Datasets and receipts are yours.
**Contact:** [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community), [ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community)
**Foundation:** [aigovopsfoundation.org](https://www.aigovopsfoundation.org/)

---

## 0. The 60-second pitch

Beacon never sees your prompts, your model outputs, or your documents. It only ever sees a tuple:

```
{ ts, source, host, content_hash, signature }
```

That tuple — the **receipt** — is enough to prove *what* an AI system did, *when*, and *who* approved it. Without ever leaving the edge with the payload.

This playbook teaches you to run that loop end-to-end on whatever network you have.

---

## 1. The three shapes (pick one)

| Shape | Network | Admin rights | Time to first receipt | Use case |
|---|---|---|---|---|
| **A. Suitcase Lab** | Laptop, no internet required | Local | 60 seconds | Workshops, demos, tabletop exercises |
| **B. Beta Corp** | Corp LAN + roaming laptops | None on endpoints, one small DMZ VM | 1 day | Pilot with real traffic, no SPAN, no agent on endpoints |
| **C. Production** | HA, OIDC, KMS, SIEM | Full | 1 week | Shipping to a paying customer |

Same git repo, same beacons, same receipt format. Different envelopes.

---

## 2. Suitcase Lab — laptop, 60 seconds

```
┌──────────────────── your laptop ────────────────────┐
│                                                     │
│  ┌─────────────┐    ┌──────────┐    ┌────────────┐ │
│  │ synth-      │───▶│  Beacon  │◀───│  Studio    │ │
│  │ traffic.py  │    │  core    │    │  (web UI)  │ │
│  └─────────────┘    │  :8787   │    │  :8788     │ │
│                     └────┬─────┘    └────────────┘ │
│  ┌─────────────┐         │                          │
│  │ MV3 browser │─────────┘                          │
│  │ extension   │   signed receipts only             │
│  └─────────────┘                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.1 One-liner

```bash
git clone https://github.com/aigovops-foundation/aigovops-beacon
cd aigovops-beacon
docker compose -f deploy/lab.yml up -d
open http://localhost:8788
```

That's it. Studio is now showing receipts from the synth-traffic replay of the 100 real AI failure cases.

### 2.2 What's actually running

| Container | Port | Role |
|---|---|---|
| `beacon` | 8787 | Receipt ingest, signing key, inventory |
| `studio` | 8788 | Web UI — see receipts, score frameworks, export bundles |
| `synth-traffic` | — | Replays `docs/data/ai_failures_top100.json` as DNS/SNI events |
| `mock-dns` | 5353/udp | Optional. Pretends to be a corp resolver; logs queries |

### 2.3 Sanity check

```bash
curl -s http://localhost:8787/healthz
# {"ok":true,"version":"2.2.0","receipts":47,"keys":1}
```

Open Studio → **Receipts** tab → you should see the synth feed populating live. Click any receipt → **Verify** → green check.

---

## 3. Seven lab variants (the 90-minute workshop)

Each variant is a **20-minute block**. Pick four and you've got a workshop. Pick all seven and you've got a half-day.

### Lab 1 — *First receipt* (15 min)

1. `docker compose up -d` (Lab A above)
2. In Studio, click **Make a decision** → fill in *Approve fine-tune of GPT-4o-mini on internal tickets*
3. Watch the receipt land. Hash it. Verify the signature with the public key under `keys/` in the repo.
4. **Discussion:** what would a regulator do with this artifact?

### Lab 2 — *Discover models running in your browser* (20 min)

1. Load the unpacked extension from `extension/` into Chrome (`chrome://extensions` → Developer mode → Load unpacked)
2. Visit `chatgpt.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`
3. Studio → **Discovery** tab shows hostnames + first-seen timestamps
4. **Discussion:** which of these is your company OK with? Which needs a beacon?

### Lab 3 — *Tail a DNS log* (15 min)

1. Drop `samples/dns_query_log.csv` into the watched folder
2. Run `scripts/tail_dns.py --watch /var/log/dns/ --beacon http://localhost:8787`
3. See AI hostnames lit up in Studio's **Discovery** tab
4. **Discussion:** would your DNS team give you read-only access to query logs? (Spoiler: usually yes.)

### Lab 4 — *Score a framework* (20 min)

1. Studio → **Frameworks** → pick `nist-ai-rmf-1.0`
2. Walk the 23-control checklist; mark each as ✓ / ✗ / N/A
3. Export the receipt bundle. Open the PDF.
4. **Discussion:** hand this to your auditor. Could they reproduce your decisions from this file alone?

### Lab 5 — *Replay a failure* (15 min)

1. Studio → **Failures** → pick *iTutor Group hiring discrimination* (case #4)
2. Click **Replay as decision** → what controls would have caught this in production?
3. Beacon emits a receipt as if you'd reviewed it pre-deploy
4. **Discussion:** YES-Ship, YES-Steady, or YES-Recover?

### Lab 6 — *MCP attest* (20 min)

1. Add `mcp/claude_desktop_config.json` snippet to Claude Desktop
2. Restart Claude Desktop. New tools appear: `record_decision`, `verify_receipt`, `query_inventory`, `score_framework`, `bundle_for_auditor`, `replay_case`
3. Ask Claude: *"Record a decision: I approve deploying the resume screener with controls A1, A4, B2"*
4. Watch the receipt arrive in Studio. The MCP call is itself receipted — observer role.
5. **Discussion:** every agent action now has an audit trail. What changes?

### Lab 7 — *Bundle for auditor* (15 min)

1. Studio → **Bundle** → date range, framework, scope
2. Download the tarball
3. Hand it to a partner team. They run `beacon verify bundle.tar.gz` with no other access to your network
4. Green check. **Discussion:** does this change your relationship with audit?

### Lab 8 — *Offline walkthrough on a USB stick* (10 min, v2.3)

1. Copy `docs/walkthrough/` to a USB stick (or any folder)
2. Open `index.html` in any browser — no network, no install
3. Twelve screens animate the full flow: discover → DNS tail → MV3 extension → record_decision via MCP → verify → score_framework → replay_case → bundle_for_auditor → super-agent governance
4. Use `←`/`→`/`Space` to step, `P` to play, `Home`/`End` to jump. Click progress dots to scrub.
5. For an event with no projector laptop access, hand attendees [`docs/downloads/beacon-walkthrough.mp4`](./docs/downloads/beacon-walkthrough.mp4) — same flow, ~70 seconds.
6. **Discussion:** what's the smallest unit of governance evidence you can hand someone in one click?

### Lab 9 — *Hosted MCP + restricted agent* (20 min, v2.3)

1. Read [`mcp-public/README.md`](./mcp-public/README.md) — same six MCP tools, internet-facing, free Render dyno
2. Read [`agent/README.md`](./agent/README.md) — a Cloudflare Worker whose tool universe is **exactly** the six Beacon tools; any other tool name is refused before the LLM sees it
3. Connect Claude Desktop or Cursor to your Render MCP URL (`/sse`)
4. From the Worker UI: *"Show me the inventory, then bundle the last 30 days for an EU AI Act audit."*
5. Watch the trace — `query_inventory` then `bundle_for_auditor` — and the signed manifest sha256 come back
6. **Discussion:** see [SUPERAGENT.md](./SUPERAGENT.md). What does it take for an autonomous agent to be procurable?

---

## 4. Beta Corp — running on a live corp network with no agent on endpoints

The hard problem isn't the laptop. It's the corp network.

> *No, you cannot install an agent on every endpoint. No, you cannot get a SPAN port this quarter. No, you cannot have read access to the proxy. Yes, you still need an answer by Friday.*

Here's the answer.

```
┌─────────────── corp perimeter ──────────────────────────────┐
│                                                             │
│  managed laptops              ┌────────────────┐            │
│  (in or out of office)        │  DMZ Beacon VM │            │
│                               │  (8 vCPU, 16G) │            │
│   ┌─────────┐ HTTPS receipts  │                │            │
│   │ MV3 ext │─────────────────▶ Beacon core    │            │
│   └─────────┘  (signed)       │  Studio        │            │
│        ▲                      │  receipts.db   │            │
│        │ enterprise policy    │                │            │
│  Intune / JAMF /              │                │            │
│  Chrome ExtensionInstall      │                │            │
│  Forcelist                    └────┬───────────┘            │
│                                    ▲                        │
│   DNS query logs ───────tail───────┤                        │
│   CASB API ─────────poll───────────┤                        │
│   (eBPF / VPC mirror later)        │                        │
│                                    │                        │
└────────────────────────────────────┴────────────────────────┘
```

### 4.1 What you need from IT (the realistic list)

- One VM in the DMZ. 8 vCPU, 16 GB RAM, 100 GB disk. Docker.
- One TLS cert for `beacon.corp.example.com`
- Permission to publish a managed Chrome/Edge extension via your existing MDM
- Read-only tail of *one* DNS log file (BIND/Infoblox query log, or Windows DNS Analytical)
- Read-only API key to *one* CASB tenant (Netskope / Zscaler / Defender for Cloud Apps)

That's it. No SPAN port, no agent on endpoints, no kernel modules, no firewall changes beyond opening 443 inbound to the Beacon VM from your managed laptop subnets.

### 4.2 Why the browser extension is the unlock

A laptop at a coffee shop is not on your network. A laptop on Wi-Fi at a hotel is not on your network. A laptop at home is *probably* on your VPN, but you can't count on it.

**The browser extension follows the user.** Anywhere they open a tab — corp net, hotel, home, coffee shop, conference Wi-Fi — the extension watches `tabs.onUpdated`, extracts the hostname (never the URL, never the page content), hashes it, signs it, and ships it to Beacon over HTTPS.

This is the only honest answer to "discover AI usage outside the firewall." Net-level probes can't follow the laptop. The browser can.

The extension is **deployable via MDM** (`ExtensionInstallForcelist` for Chrome/Edge, MCX/JAMF for Safari later) so users can't disable it and admins can audit installs.

### 4.3 What's in scope on day 1

| Source | Mechanism | What you see |
|---|---|---|
| Browser tabs (all networks) | MV3 extension via MDM | hostname-only, signed receipts |
| Corp DNS | log tail (read-only) | every AI hostname resolved by any device |
| CASB | API poll, 5-min interval | sanctioned + shadow IT, with user mapping |

### 4.4 What's *not* in scope on day 1

- eBPF probes on endpoints (week 3+, opt-in, dev fleet only)
- VPC mirroring (cloud team conversation, separate budget)
- Proxy log integration (security team conversation, separate budget)
- DLP integration (legal conversation, much later)

Beta means **honest minimum**. Add layers as trust accrues.

### 4.5 Deploying

```bash
# on the DMZ VM
git clone https://github.com/aigovops-foundation/aigovops-beacon
cd aigovops-beacon
cp deploy/.env.beta.example .env
# edit .env: DNS_LOG_PATH, CASB_API_KEY, OIDC_*, BEACON_PUBLIC_URL
docker compose -f deploy/beta.yml up -d
```

Browser extension is published via your MDM with a force-install policy pointing at the corp Chrome Web Store entry (private listing). The extension's manifest includes the Beacon public URL as a managed-storage policy, so it auto-configures.

### 4.6 What success looks like at week 4

- 80% of managed laptops reporting (the rest are sleeping or have the extension blocked — investigate)
- DNS tail finding ~3× more AI hostnames than the extension alone (because of CLI tools, system services, scripts)
- CASB finding ~1.5× more shadow IT than DNS alone (because of user-identity mapping)
- Studio shows a deduplicated inventory of every AI service touched by any user on any network
- Auditor can pull a bundle for any 30-day window and verify it offline

---

## 5. Production — shipping to a paying customer

```
┌──── load balancer + TLS termination + WAF ────┐
│                                                │
│            ┌── Beacon A ──┐                    │
│  oauth2 ───┤              │── Postgres (HA) ── S3 + KMS receipts
│  proxy     │              │                    │
│            └── Beacon B ──┘── KMS signer ── SIEM (OCSF / CEF)
│                                                │
└────────────────────────────────────────────────┘
```

Production adds:

- OIDC via oauth2-proxy (Okta, Entra, Auth0, Google)
- HA Beacon pair behind LB, sticky sessions for Studio only
- Postgres for receipts, with row-level encryption on `subject` and `actor`
- S3 + KMS for receipt bundles, lifecycle policy → Glacier at 90 days
- KMS-backed signing key (AWS KMS / Azure Key Vault / GCP KMS)
- SIEM forwarder (OCSF format default, CEF available) — every receipt also goes to Splunk/Sentinel/Chronicle/etc.
- Render or DigitalOcean App Platform blueprints in `deploy/` (Fly.io deprecated)

See [ARCHITECTURE-BETA.md](./ARCHITECTURE-BETA.md) for the full diagram and threat model.

---

## 6. The browser-session discovery problem, in detail

This is the question every CISO asks. Here is the layered answer.

| Layer | Where it runs | What it sees | What it misses | When to add |
|---|---|---|---|---|
| **L1 Managed browser extension** | Endpoint, in browser | Every tab hostname, on any network | CLI tools, system services, non-browser apps | Day 1 |
| **L2 Corp DNS log tail** | DMZ Beacon VM | Every DNS query from any corp-network device | Devices off corp DNS, DoH-using browsers | Day 1 |
| **L3 CASB API** | DMZ Beacon VM | Sanctioned + shadow SaaS, with user attribution | Self-hosted models, on-prem traffic | Day 1 |
| **L4 eBPF probe** | Endpoint (opt-in fleet) | Every TCP connect, every TLS SNI | Requires endpoint cooperation | Week 3+ |
| **L5 VPC / cloud mirror** | Cloud network | Server-side AI calls (Bedrock, Vertex, Azure OpenAI) | On-prem | Week 4+ |

L1+L2+L3 covers ~90% of real corp AI usage with zero invasive deployment. L4 and L5 are for the last 10% and arrive after the org has lived with Beacon for a month and trusts the receipt model.

---

## 7. Threat model — the short version

| Threat | Mitigation |
|---|---|
| Insider tampers with receipts | All receipts signed by per-instance Ed25519 key; bundles include the public key and Merkle root |
| Beacon VM is compromised | Receipts already shipped to SIEM by the time they're queryable; tamper detected on next bundle verify |
| Extension is uninstalled | Extension install is force-managed; uninstall events are themselves receipted by MDM |
| Receipt floods (DoS) | Per-source rate limit (default 50/sec), drops with a receipt of the drop |
| Replay attack | Receipts include a monotonic per-source counter; gaps logged |
| Side channel via hostname leak | Hostnames are SHA-256 hashed with a per-tenant salt before storage; only allowlisted domains are stored cleartext |

Full threat model in [ARCHITECTURE-BETA.md](./ARCHITECTURE-BETA.md).

---

## 8. Beta-to-ship transitions

The same docker compose can run all three shapes. The transitions are:

```
Suitcase Lab ──── add OIDC ────▶  Beta Corp ──── add HA + KMS + SIEM ────▶  Production
              ──── add MDM policy ──▶
              ──── add DNS tail ────▶
              ──── add CASB ────────▶
```

No rewrite. No data migration. The same receipts.db from beta can be carried into production as the seed corpus.

---

## 9. Cost sanity (back of envelope)

| Shape | Monthly cost | Notes |
|---|---|---|
| Suitcase Lab | $0 | Runs on a laptop |
| Beta Corp | ~$120 | One small VM, one TLS cert |
| Production (mid) | ~$800 | HA pair + Postgres + S3 + KMS calls |
| Production (large) | ~$3.5k | Multi-region, 10M receipts/month |

This is **Apache-2.0**. There is no per-seat fee. The cost is infrastructure only.

---

## 10. What to bring to the workshop

- A laptop with Docker installed
- Chrome or Edge (for the extension lab)
- Optional: a real DNS query log from your env (anonymized) for Lab 3
- Optional: a CASB API key (read-only) for Lab 4 stretch goal
- The 23-framework registry (already in repo at `frameworks/`) — pick one to score in Lab 4

---

## 11. Files referenced

```
deploy/lab.yml              # Suitcase Lab docker-compose
deploy/beta.yml             # Beta Corp docker-compose
deploy/render.yaml          # Production on Render
deploy/do-app.yaml          # Production on DigitalOcean
extension/                  # MV3 browser extension (Chrome+Edge)
mcp/                        # MCP server (stdio + SSE) + Claude Desktop config
scripts/synth-traffic.py    # Replays the 100-case dataset as DNS/SNI events
scripts/tail_dns.py         # Watches DNS log file, posts to Beacon
docs/data/ai_failures_top100.json   # 100 real AI failure cases
frameworks/index.yaml       # 23-framework registry
ARCHITECTURE-BETA.md        # Formal architecture doc with threat model
```

---

## 12. One last thing

Beacon is built on a single conviction: **the auditor's job should be reproducible from a tarball, not a meeting.**

If, at the end of the workshop, you can hand a teammate a bundle and they can verify it without your help, the lab worked.

— Bob & Ken
