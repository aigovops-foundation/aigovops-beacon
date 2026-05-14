# OVERT Protocol Profile registration — `aigovops-beacon.v1`

This document tracks Beacon's registration as an OVERT Protocol Profile under the royalty-free patent covenant at [overt.is/ipr-policy](https://overt.is/ipr-policy).

## Profile metadata (proposed)

| Field | Value |
|---|---|
| **Profile name** | `aigovops-beacon.v1` |
| **Implements** | OVERT 1.0 |
| **Steward of OVERT** | [Glacis Technologies, Inc](https://www.glacis.io/) |
| **Implementer** | AIGovOps Foundation (501(c)(6)) |
| **Target conformance** | AAL-1 (self-declared) at registration; roadmap to AAL-2 with an Independent Attestation Provider |
| **Scope designators** | Discovery · Inventory · Transaction tracking · Checklist evaluation · Policy-as-code emission · Auditor bundle |
| **Patent covenant** | Royalty-free under overt.is/ipr-policy |
| **License** | Apache 2.0 |

## OVERT envelope mapping

Beacon receipts (see [`RECEIPT_SCHEMA.md`](RECEIPT_SCHEMA.md)) are the wire format for an OVERT attestation envelope. Profile-specific extensions are tagged `[profile]` in the schema. Required envelope fields conform to OVERT 1.0 §Architecture.

See [`crosswalks/overt-mapping.yaml`](../crosswalks/overt-mapping.yaml) for the full mapping of Beacon controls to OVERT's six governance domains (Govern · Identify · Protect · Attest · Measure · Respond).

## Status

| Step | Status | Owner | Notes |
|---|---|---|---|
| 1. Public intent to register | ✅ Declared (this document) | AIGovOps Foundation | May 2026 |
| 2. Steward Partner sign-off on profile metadata | ⏳ Pending | Glacis (Joe Braidwood) | To be confirmed on the call of 14 May 2026 |
| 3. Self-declared AAL-1 conformance review | ⏳ Pending | TRC | Awaiting TRC formation |
| 4. Submission to OVERT Protocol Profile registry | ⏳ Pending | AIGovOps Foundation | After step 3 |
| 5. Public listing in registry | ⏳ Pending | OVERT registry maintainer (Glacis) | Co-announcement planned |
| 6. AAL-2 roadmap with IAP | 📅 Planned | TRC + IAP TBD | 6–12 month horizon |

## What we are asking the Steward to confirm

1. The proposed profile name (`aigovops-beacon.v1`).
2. The scope designators.
3. The target conformance level at registration (AAL-1 self-declared).
4. The submission procedure and timeline.
5. The co-announcement plan.

## What we commit to

1. Not making **Level 3 or Level 4 conformance claims** under a self-declared profile (per OVERT IPR §Conformance Limitation).
2. Updating this document with every status change.
3. Treating any deviation from OVERT 1.0 normative requirements as a bug, tracked in our issue queue.
4. Submitting to the TRC's pre-release review for every public release that touches the profile surface.

## Disclosure

This profile registration is being undertaken at the direct invitation of Glacis Technologies, Inc, following correspondence dated 13 May 2026. The AIGovOps Foundation is registering as a community implementer; Glacis remains the standard's steward. The Foundation makes no claim of authority over OVERT itself.
