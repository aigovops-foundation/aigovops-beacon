# Receipt schema — OVERT envelope, Beacon profile

A Beacon receipt is the wire format for an **OVERT attestation envelope** as specified in [OVERT 1.0](https://overt.is/) (Glacis Technologies, 25 March 2026). It is the atomic unit of evidence: every observed interaction produces exactly one; every governance decision produces exactly one. If something happened and there is no receipt, it did not happen as far as the audit is concerned.

All required envelope fields below are **normative under OVERT**. Fields tagged `[profile]` are extensions of the `aigovops-beacon.v1` profile and are not required for OVERT conformance — see [`PROFILE_REGISTRATION.md`](PROFILE_REGISTRATION.md).

This document is wire-compatible with [`aigovops-Replay`](https://github.com/aigovops/aigovops-Replay).

> **Authority of this document:** advisory under the Foundation; the [OVERT 1.0 specification](https://overt.is/) is normative. Where this document diverges from OVERT, OVERT wins and the divergence is a bug here. Steward review (Glacis Technologies) is pending; see [`../STEWARD.md`](../STEWARD.md).

---

## The fields you asked for

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (ULID) | ✓ | sortable by time, globally unique |
| `ts_utc` | string (RFC 3339) | ✓ | always UTC, millisecond precision |
| `user` | object | ✓ | `{ sub, email, oidc_issuer }` from the OIDC token at observation time |
| `vendor` | string | ✓ | normalized: `openai`, `anthropic`, `google`, `meta`, `microsoft`, `nvidia`, `aws`, `databricks`, `in-house`, `other` |
| `model` | string | ✓ | the vendor's model id, verbatim |
| `version` | string | ✓ | the pinned version string. **Never** `latest` |
| `prompt` | string \| `null` | conditional | full text when capture is on, omitted when off |
| `prompt_hash` | string (sha-256) | ✓ | always present, even when `prompt` is included |
| `result` | string \| `null` | conditional | as above |
| `result_hash` | string (sha-256) | ✓ | always present |
| `event_type` | enum | ✓ | see table below |
| `environment` | enum | ✓ | `cloud_saas`, `private_cloud`, `on_prem`, `edge`, `hybrid` |
| `latency_ms` | integer | optional | observed end-to-end |
| `tokens_in` / `tokens_out` | integer | optional | when known |
| `evidence_id` | string (ULID) | optional | back-reference to the underlying capture |
| `parent_receipt_id` | string (ULID) | optional | chains receipts (e.g., a `gate.evaluated` referencing the `inference.observed` it ran against) |
| `signature` | object | ✓ | see below |

## Event types

| Type | When |
|---|---|
| `discovery.session.started` | Studio Step 1 fired |
| `discovery.session.completed` | scan finished |
| `discovery.model.found` | a model was detected |
| `inventory.model.added` | new row in inventory |
| `inventory.trust.changed` | trust-tier promotion/demotion (requires approver) |
| `inference.observed` | one observed model call |
| `gate.evaluated` | a checklist control was run |
| `gate.failed` | a control failed |
| `exception.granted` | human-approved exception |
| `checklist.published` | the bundle was emitted |
| `bundle.signed` | a signing event |
| `key.rotated` | signing-key rotation |

---

## Signature block

```json
"signature": {
  "alg": "Ed25519",
  "key_fpr": "SHA256:9p2x…",
  "sig_b64": "MEUCIQ…",
  "canonical_form": "json/c14n-rfc8785"
}
```

- **Canonicalization:** [RFC 8785 JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/html/rfc8785). No room for ambiguity about what was signed.
- **Algorithm:** Ed25519. Fast, small signatures (88 bytes b64), excellent library support.
- **Key fingerprint format:** SSH-style SHA-256 of the public key (`ssh-keygen -lf` compatible).

The signature covers every field of the receipt *except* the `signature` object itself.

---

## Example — inference observed

```json
{
  "id": "01HXYZ8K3F2N5Q1R7S9V3W4Y6B",
  "ts_utc": "2026-05-13T15:04:22.318Z",
  "user": {
    "sub": "bob@aigovopsfoundation.org",
    "email": "bob@aigovopsfoundation.org",
    "oidc_issuer": "https://login.microsoftonline.com/.../v2.0"
  },
  "vendor": "openai",
  "model": "gpt-4o",
  "version": "gpt-4o-2024-08-06",
  "prompt": null,
  "prompt_hash": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "result": null,
  "result_hash": "sha256:84a516841ba77a5b4648de2cd0dfcb30ea46dbb4a37cb6e69d6b7c1c0e1d8a9c",
  "event_type": "inference.observed",
  "environment": "cloud_saas",
  "latency_ms": 612,
  "tokens_in": 1240,
  "tokens_out": 318,
  "evidence_id": "01HXYZ8K3F2N5Q1R7S9V3W4Y6B",
  "signature": {
    "alg": "Ed25519",
    "key_fpr": "SHA256:9p2xK7vQ8mN3rL5tY6uA1bC4dE7fG2hJ9kM0pQ3sT8vY",
    "sig_b64": "kP9X4Q==(…)",
    "canonical_form": "json/c14n-rfc8785"
  }
}
```

---

## Example — checklist published

```json
{
  "id": "01HXYZ9K3F2N5Q1R7S9V3W4Y6C",
  "ts_utc": "2026-05-13T16:18:09.044Z",
  "user": { "sub": "auditor@acme.com", "email": "auditor@acme.com", "oidc_issuer": "…" },
  "event_type": "checklist.published",
  "packs": ["nist-ai-rmf.v1", "eu-ai-act-art13.v1", "human-flourishing.v1"],
  "bundle_hash": "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  "destination": "github://acme/governance#pr-payload",
  "signature": { "alg": "Ed25519", "key_fpr": "SHA256:9p2x…", "sig_b64": "MEUCIQ…", "canonical_form": "json/c14n-rfc8785" }
}
```

---

## Append-only stream layout

Receipts are written to daily NDJSON files:

```
~/.beacon/receipts/
├── 2026-05-13.ndjson
├── 2026-05-12.ndjson
└── anchors.ndjson
```

Each line is exactly one receipt, canonicalized per RFC 8785, then `\n`. `fsync` is called after every write. The process holds an exclusive write lock on the active day file.

## Hourly Merkle anchor

Once an hour, Beacon:

1. Reads all receipts written since the previous anchor.
2. Builds a SHA-256 Merkle tree.
3. Writes the root, the previous-anchor reference, and the time range to `anchors.ndjson`.
4. Signs the anchor row with the Ed25519 signing key.
5. Optionally publishes the root to an external timestamping service (RFC 3161) or chain.

The result: any attempt to backdate, modify, or remove a historical receipt invalidates every anchor after it. Verification is offline:

```bash
beacon verify --day 2026-05-13
# → 4,118 receipts · 24 anchors · all signatures OK · merkle chain intact
```

---

## Redaction and capture modes

Operators choose one of three modes per source:

| Mode | `prompt`/`result` | When to use |
|---|---|---|
| **Hash-only** (default) | `null` | Default. Hashes are sufficient to prove unchanged content; the text never lands in Beacon. |
| **Redacted** | hashed → patterns scrubbed (PHI, PII, secrets) → stored | When auditors need text but compliance forbids raw capture. |
| **Full capture** | stored | Only with an `exception.granted` receipt from a human approver, scoped to a single source. |

Mode changes themselves emit receipts.

---

## Verification flow

```
                       beacon verify <receipt-id>
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 1. Load receipt JSON          │
              │ 2. Canonicalize (RFC 8785)    │
              │ 3. Verify Ed25519 signature   │
              │    against trusted pubkey     │
              │ 4. Locate hourly anchor       │
              │ 5. Walk merkle path           │
              │ 6. Compare anchor signature   │
              └───────────────┬───────────────┘
                              │
                              ▼
                         PASS / FAIL
```

Anyone with the public key can run this. No network calls. No phone-home.

---

## Why this set of fields, exactly

Because this is the field set Bob asked for in the brief:

> *logged in user, date, time, model, version, prompt, result of prompt, and cryptographic signature*

…with the additions every real audit will demand: an event type, an environment, a chain reference (`parent_receipt_id`), a content-hash that survives redaction, and a canonical signing format that doesn't depend on JSON key order.

If a field doesn't appear here, ask whether the audit truly needs it. If it does, propose it via PR; the schema is versioned and the version is signed into every receipt.
