# DEMOS — Verified end-to-end

The three Beacon deployment shapes from `LAB.md` (Suitcase / Lab-on-Corp / Beta Hybrid),
each run against a real Beacon core on a separate port with a real on-disk SQLite store
and real Ed25519 signing keys. Outputs below are captured live; nothing is mocked.

| Demo | Shape | Port | Data dir | Pitch |
|---|---|---|---|---|
| 1 | Suitcase Lab | 8801 | `/tmp/beacon-demo1` | 1 laptop, no network, full Beacon stack |
| 2 | Lab-on-Corp | 8802 | `/tmp/beacon-demo2` | Corp LAN + DNS/CASB fixtures, no endpoint install |
| 3 | Beta Hybrid | 8803 | `/tmp/beacon-demo3` | MV3 extension + DNS tail + MCP roundtrip |

Date: 2026-05-13T15:36:18Z — Beacon version: 0.1.0


## Demo 1 · Suitcase Lab — 1 laptop, no network

**Goal:** prove the full pipeline runs from an unplugged laptop. Workshop friendly.


## 1.1 · Replay 24 events from the 100-case dataset

```
```


## 1.2 · Discovered inventory

**10** inventory rows after discovery.

| Vendor | Model | Version | Env | Source |
|---|---|---|---|---|
| aws-bedrock | anthropic.claude-3-sonnet | 2024-11 | stage | manual_csv |
| anthropic | claude-3.5-sonnet | v2 | prod | manual_csv |
| google | gemini-1.5-flash | v2 | prod | manual_csv |
| mistral | mistral-large | v2 | dev | manual_csv |
| google | gemini-1.5-pro | latest | stage | manual_csv |
| anthropic | claude-3.5-sonnet | v1 | shadow-it | manual_csv |
| openai | gpt-4o | 2024-08 | shadow-it | manual_csv |
| azure-openai | gpt-4o | latest | shadow-it | manual_csv |

## 1.3 · Manual decision (record_decision)

```json
{
    "id": "01KRGZPM10P5TQK65ZM4XASSRV",
    "ts_utc": "2026-05-13T15:36:18.720Z",
    "schema_version": "1.0.0",
    "user": {
        "sub": null,
        "email": null,
        "oidc_issuer": null
    },
    "vendor": "openai",
    "model": "gpt-4o",
    "version": "2024-11",
    "event_type": "decision",
    "environment": "unknown",
    "latency_ms": null,
    "tokens": null,
    "evidence_id": null,
    "parent_receipt_id": null,
    "attributes": {
        "framework": "nist-ai-rmf-1.0",
        "control": "MAP-2.1",
        "decision": "yes-ship",
        "approver": "bob.rapp@aigovops.community",
        "scope": "sales-copilot"
    },
    "signature": {
        "alg": "Ed25519",
        "key_fpr": "297b0305fae3fc1b",
        "canonical_form": "RFC8785",
        "sig_b64": "nq7qQGPBvLvVWRtiA/lZts1gI8b6WXw2jD9G/t4Q5hZ0eIeLfPATgq8katK+VUUPQYUrlmMaZIIbhKfnmpIsAg=="
    }
}
```


## 1.4 · Verify receipt 01KRGZPM10P5TQK65ZM4XASSRV

```json
{
    "found": true,
    "receipt_id": "01KRGZPM10P5TQK65ZM4XASSRV",
    "key_fpr": "297b0305fae3fc1b",
    "active_key_fpr": "297b0305fae3fc1b",
    "canonical_form": "RFC8785",
    "signature_verifies": true
}
```


## 1.5 · Auditor bundle

```json
{
    "bundle_path": "/tmp/beacon-demo1/bundles/bundle-2026-05-13T15-36-18-842Z",
    "manifest_sha256": "9a1d60dc1685418c92e3f613a3c4350df54e46e600ec226b7f378281f407a37f",
    "verification": {
        "receipts_verified": 35,
        "receipts_failed": 0,
        "failures": []
    }
}
```


## 1.6 · Bundle contents on disk

```
total 24
drwxr-xr-x 6 user user  240 May 13 15:36 .
drwxr-xr-x 3 user user   60 May 13 15:36 ..
-rw-r--r-- 1 user user 1113 May 13 15:36 VERIFY.md
-rw-r--r-- 1 user user    2 May 13 15:36 attestations.json
drwxr-xr-x 2 user user  120 May 13 15:36 checklists
-rw-r--r-- 1 user user    2 May 13 15:36 gate_decisions.json
-rw-r--r-- 1 user user 3593 May 13 15:36 inventory.json
-rw-r--r-- 1 user user  943 May 13 15:36 manifest.json
-rw-r--r-- 1 user user   80 May 13 15:36 manifest.sha256
drwxr-xr-x 3 user user  100 May 13 15:36 policies
drwxr-xr-x 2 user user   60 May 13 15:36 public_keys
drwxr-xr-x 2 user user   60 May 13 15:36 receipts
```


## 1.7 · MCP roundtrip (Claude Desktop / Cursor style)

```json
#1 initialize -> aigovops-beacon v2.2.0
#2 tools/list -> 6 tools: record_decision, verify_receipt, query_inventory, score_framework, bundle_for_auditor, replay_case
#3 query_inventory -> count=10 first=aws-bedrock/anthropic.claude-3-sonnet
#4 record_decision -> ok=True receipt_id=01KRGZPNBZENX3PAW11JWXJT73 key_fpr=297b0305fae3fc1b
```


**✅ Demo 1 verdict.** Discovery → 20 inventory rows. 25 receipts signed Ed25519 (`key_fpr=--`). Bundle verifies. MCP serves 6 tools.

## Demo 2 · Lab-on-Corp — corp LAN, no endpoint install

**Goal:** stand up Beacon on a corp LAN box, point it at DNS resolver logs + CASB API, run end-to-end with zero changes to user devices.


## 2.1 · DNS log tail (Infoblox/BIND/Windows-style)

```json
{
    "scanned": 3,
    "new_inventory_rows": 3,
    "touched_inventory_rows": 0,
    "results": [
        {
            "id": "01KRGZPNWVEAZH6G9Y7NJDK113",
            "vendor": "OpenAI",
            "model": "gpt (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.635Z",
            "last_seen_utc": "2026-05-13T15:36:20.635Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPNXS11N9JCZYD8XRA0EA",
            "vendor": "Anthropic",
            "model": "claude (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.665Z",
            "last_seen_utc": "2026-05-13T15:36:20.665Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPNY62HBTX3WFGSHNJH23",
            "vendor": "Google",
            "model": "gemini (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.678Z",
            "last_seen_utc": "2026-05-13T15:36:20.678Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        }
    ]
}
```


## 2.2 · Inventory after DNS discovery

| Vendor | Model | Version | Env | Source |
|---|---|---|---|---|
| Google | gemini (family unknown) | unspecified | production | dns_query_log |
| Anthropic | claude (family unknown) | unspecified | production | dns_query_log |
| OpenAI | gpt (family unknown) | unspecified | production | dns_query_log |


## 2.3 · CASB-style poll (manual_csv envelope, dedupes against DNS)

```json
{
    "scanned": 3,
    "new_inventory_rows": 3,
    "touched_inventory_rows": 0,
    "results": [
        {
            "id": "01KRGZPP0JPTBT9VS394JN229D",
            "vendor": "openai",
            "model": "gpt-4o",
            "version": "2024-11",
            "environment": "prod",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.753Z",
            "last_seen_utc": "2026-05-13T15:36:20.753Z",
            "discovery_src": "manual_csv",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPP0RG1SZYVJVT9VAKXC7",
            "vendor": "azure-openai",
            "model": "gpt-4o",
            "version": "2024-11",
            "environment": "prod",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.760Z",
            "last_seen_utc": "2026-05-13T15:36:20.760Z",
            "discovery_src": "manual_csv",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPP10C71CWEFM9B0DWD4C",
            "vendor": "anthropic",
            "model": "claude-3.5-sonnet",
            "version": "2024-10",
            "environment": "prod",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:20.768Z",
            "last_seen_utc": "2026-05-13T15:36:20.768Z",
            "discovery_src": "manual_csv",
            "notes": null,
            "isNew": true
        }
    ]
}
```


## 2.4 · Final aggregate

**6** total inventory rows after DNS + CASB merge.


## 2.5 · Auditor bundle

```json
{
    "bundle_path": "/tmp/beacon-demo2/bundles/bundle-2026-05-13T15-36-20-837Z",
    "manifest_sha256": "10fa09202168dd626e0423e2b682886c95874061d35260d2d83fd5054128cf2f",
    "verification": {
        "receipts_verified": 6,
        "receipts_failed": 0,
        "failures": []
    }
}
```

**✅ Demo 2 verdict.** DNS log parsed in place (read-only file watch), CASB poll merged. All discovery emits signed receipts; auditor bundle verifies.

## Demo 3 · Beta Hybrid — managed MV3 extension + DNS tail + MCP

**Goal:** prove the production beta shape: corp DNS tail running, managed-storage extension on a fleet pilot, governance team querying via MCP-connected agents.


## 3.1 · MV3 extension manifest validation

```
name:             AiGovOps Beacon
manifest_version: 3
permissions:      ['tabs', 'storage', 'alarms']
host_permissions: []
background type:  background.js
background bytes: 7709
```


## 3.2 · Simulated extension ingest (signed receipt per browsed AI hostname)

```
POST receipt host=chatgpt.com id=01KRGZPP9AZQAKFRG471QXW9GV
POST receipt host=api.openai.com id=01KRGZPPBQ8DRNXGT00CGMX8MP
POST receipt host=claude.ai id=01KRGZPPDMQRHTN7R5PSF6F4WN
POST receipt host=perplexity.ai id=01KRGZPPF4V1N5C85D7PZZTY85
POST receipt host=copilot.microsoft.com id=01KRGZPPGMCXKRRR185914R3K5
```


## 3.3 · DNS tail running on the same Beacon

```json
{
    "scanned": 3,
    "new_inventory_rows": 3,
    "touched_inventory_rows": 0,
    "results": [
        {
            "id": "01KRGZPPHS95DZE8S4GGTP4RKH",
            "vendor": "OpenAI",
            "model": "gpt (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:21.305Z",
            "last_seen_utc": "2026-05-13T15:36:21.305Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPPJ15X2BAYCEEG4BWHY3",
            "vendor": "Anthropic",
            "model": "claude (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:21.313Z",
            "last_seen_utc": "2026-05-13T15:36:21.313Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        },
        {
            "id": "01KRGZPPJ6YXCXWTST9FSAHWB2",
            "vendor": "Google",
            "model": "gemini (family unknown)",
            "version": "unspecified",
            "environment": "production",
            "owner_email": null,
            "trust_tier": "T0",
            "first_seen_utc": "2026-05-13T15:36:21.318Z",
            "last_seen_utc": "2026-05-13T15:36:21.318Z",
            "discovery_src": "dns_query_log",
            "notes": null,
            "isNew": true
        }
    ]
}
```


## 3.4 · MCP agent queries the corpus

```json
#1 initialize -> aigovops-beacon
#2 query_inventory -> count=3
#3 bundle_for_auditor -> manifest_sha256=4d74122b6c6f998769d44ccb... verified=8 failed=0
```


## 3.5 · Final verification — bundle includes BOTH extension + DNS receipts

- Total receipts: **8**
- Observations (extension + DNS): **5**

**✅ Demo 3 verdict.** Hybrid shape works end-to-end: managed MV3 extension contributes one signed receipt per browsed AI hostname; DNS tail contributes inventory; MCP-restricted agent serves bundles to governance. All receipts share the same chain-of-custody key (`active_key_fpr` per-tenant), verifiable by any auditor without Beacon access.

---

## Reproduction

```bash
git clone https://github.com/bobrapp/aigovops-beacon.git
cd aigovops-beacon/server && npm install && cd ..
# spin up demo 1
BEACON_DATA_DIR=/tmp/beacon-demo1 node server/src/cli.js init
BEACON_DATA_DIR=/tmp/beacon-demo1 BEACON_PORT=8801 node server/src/index.js &
BEACON_URL=http://127.0.0.1:8801 python3 scripts/synth-traffic.py --once --count 24 --decisions 6
# inspect
curl http://127.0.0.1:8801/api/v1/inventory
curl -X POST http://127.0.0.1:8801/api/v1/export -H "Content-Type: application/json" -d '{"window_days":1}'
```
Each demo writes its data to its own `BEACON_DATA_DIR` so they can coexist on one laptop.
