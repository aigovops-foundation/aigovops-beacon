# Checklist wizard — manual-first AI governance

The wizard is the **entry point** for any organisation that doesn't yet
have observability tooling deployed. You sit down, you answer
[y/n/skip/notes] one control at a time, and the wizard turns every
answer into a signed receipt — the *same* receipt format the network
beacons produce.

That is the whole point: a small team with one hour can produce a
bundle that looks structurally identical to a fully-instrumented
deployment's bundle. Audit-grade evidence is not gated on instrumentation.

---

## Manual-first → beacon-augmented progression

```
   ┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
   │  1. Manual mode    │ ──> │  2. Beacon-augmented│ ──> │  3. Full Studio    │
   │  checklist/wizard  │     │  beacons/ + manual │     │  React app + APIs  │
   │  ~1 hour, 23 fw    │     │  beacons fill gaps │     │  full team UX      │
   └────────────────────┘     └────────────────────┘     └────────────────────┘
              │                          │                          │
              ▼                          ▼                          ▼
        ~/.beacon/receipts/YYYY-MM-DD.ndjson   (same wire format across all 3)
```

Receipts from the wizard and from the beacons co-exist in the same
NDJSON file. The scoring engine doesn't know or care which one produced
which receipt — it cares about `evidence_types` and signatures.

## Quick start

```bash
# Walk every framework, answer interactively
python checklist/wizard.py

# Just one framework (handy for a 15-minute drill)
python checklist/wizard.py --framework nist-ai-rmf

# Smoke test (auto-yes, no prompts) — used by CI
python checklist/wizard.py --non-interactive --max-controls 3
```

At the end of every run the wizard invokes `scoring/engine.py` and
prints the updated `org_ai_risk_index`. Subsequent runs are additive —
the index trends down as you accumulate evidence.

## What's a receipt look like

Every answer becomes one entry in `~/.beacon/receipts/<date>.ndjson`:

```json
{
  "id": "01HXYZ…",
  "ts_utc": "2026-05-13T15:04:22.318Z",
  "event_type": "gate.evaluated",
  "subject": "control://nist-ai-rmf/GOVERN-1.1",
  "action": "checklist.answered",
  "evidence_meta": {
    "framework_id": "nist-ai-rmf",
    "control_id": "GOVERN-1.1",
    "evidence_types": ["governance_charter", "board_minutes"],
    "answer": "yes",
    "weight": 8,
    "notes": ""
  },
  "signature": {"alg": "Ed25519", "key_fpr": "SHA256:…", "sig_b64": "…", "canonical_form": "json/c14n-rfc8785"}
}
```

A "no" or "skip" answer is still signed and still appended — the bundle
records gaps, not just wins.

## Reset / inspect

The receipts file is human-readable NDJSON, one receipt per line. To
start over, archive or delete `~/.beacon/receipts/<date>.ndjson`. The
key in `~/.beacon/keys/` should be preserved across runs so existing
signatures remain verifiable.
---

## Contact & community

**Tagline:** YES-Ship AI · YES-Steady AI · YES-Recover AI

- Bob Rapp — [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community)
- Ken Johnston — [ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community)
- Foundation — [aigovopsfoundation.org](https://www.aigovopsfoundation.org/)

*Verifiable AI governance — Apache-2.0, no SaaS lock-in.*
