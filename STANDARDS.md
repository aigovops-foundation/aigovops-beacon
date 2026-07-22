# Standards alignment

The AiGovOps Foundation does **not** issue standards. We implement them, adopt them, teach them, and build community around them.

## The standard Beacon implements

Beacon implements [**OVERT 1.0**](https://overt.is/) — the Open Standard for Observable Verification Evidence at the AI runtime boundary, published 25 March 2026 by [Glacis Technologies, Inc](https://www.glacis.io/) and made available under a royalty-free patent covenant at [overt.is/ipr-policy](https://overt.is/ipr-policy).

OVERT specifies:

- What a conformant runtime control system must **prove**.
- What an Independent Attestation Provider must **verify**.
- What a qualified assessor must **examine** when a conformance claim is made.

Beacon is being registered as an OVERT Protocol Profile under that covenant. See [`docs/PROFILE_REGISTRATION.md`](docs/PROFILE_REGISTRATION.md) for status.

## Why this matters

There is not oxygen in this category for two adjacent standards. The category needs one common vocabulary, one common conformance bar, and many implementations.

The AiGovOps Foundation's role is to be one of those implementations *and* the community on-ramp — not a parallel standards-issuing body.

If you are looking for the normative source of truth on receipts, envelopes, attestation assurance levels, agentic governance controls, or auditor verification procedures, **read OVERT first**. Our crosswalks (NIST AI RMF / EU AI Act / ISO 42001 / HIPAA / Human Flourishing) are advisory. OVERT's crosswalks are normative.

## What "downstream of OVERT" means for this repo

| Layer | Owner | Authority |
|---|---|---|
| **Standard** | Glacis Technologies (steward of OVERT) | Normative |
| **Profile** (`aigovops-beacon.v1`) | AiGovOps Foundation (this repo) | Conformant implementation under OVERT IPR policy |
| **Sector packs / training / community materials** | AiGovOps Foundation | Advisory, non-normative |
| **Foundation governance** | AiGovOps Foundation 501(c)(6) Board | Business governance only |
| **Technical quality bar for Foundation OSS projects** | OVERT-aligned, set by the Foundation Steward Partner | Technical governance |

See [`GOVERNANCE.md`](GOVERNANCE.md) for the business-vs-technical split, and [`STEWARD.md`](STEWARD.md) for the Steward Partner role.

## How to register a new Foundation OSS project

The AiGovOps Foundation will not accept a new open-source project into its program unless:

1. It implements a published version of OVERT (or another open standard the Foundation has explicitly adopted).
2. It carries clear attribution to that standard in its README and homepage.
3. It commits to a profile registration path under the relevant IPR policy.
4. It passes a pre-release review by the Foundation Steward Partner (see [`ENGAGEMENT.md`](ENGAGEMENT.md)).

This rule exists to prevent the very situation that prompted this document.

## Acknowledgment

The structure of this repo's standards posture — and the lesson that informed it — came from a direct, in-good-faith conversation initiated by Joe Braidwood at Glacis in May 2026. We are publishing this document because the lesson is worth publishing.
