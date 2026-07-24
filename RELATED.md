# Related Projects

Beacon is a standalone OVERT 1.0–conformant runtime. **It does not require any of the projects listed here to operate, conform to OVERT, or produce verifiable receipts.**

This page exists so that operators, auditors, and contributors can find the broader context if they want it. If you're here to deploy Beacon, the only document you need is the [main README](README.md).

## Under the AiGovOps Foundation

| Project | Role | How it relates to Beacon |
| --- | --- | --- |
| [umbrella-govops](https://github.com/bobrapp/umbrella-govops) | Policy-as-code companion. Compiles AI laws (NIST AI RMF, EU AI Act, ISO 42001, sector regs) into versioned, citable controls and binds runtime evidence to them. | Umbrella **consumes** Beacon receipts as evidence. Beacon does **not** depend on Umbrella's vocabulary or schemas. Auditors who want a single bundle covering "what must be true" and "is it true right now" use both. |
| [aigovops-Replay](https://github.com/bobrapp/aigovops-Replay) | Receipt-verification tooling. | Reads Beacon's NDJSON audit logs and replays them against captured fixtures. |
| [aigovops-foundation-os](https://github.com/bobrapp/aigovops-foundation-os) | Policy + Gate-Decision-Record schemas. | Gate schema is wire-compatible with Beacon's `gate.evaluated` event. |
| [aigovops-prompt-studio](https://github.com/bobrapp/aigovops-prompt-studio) | Prompt-level audit and curation. | Emits Beacon-compatible receipts for prompt evaluations. |
| [webhook-sentinel](https://github.com/bobrapp/webhook-sentinel) | PR-review trust gating. | Consumes Beacon receipts to gate code-review approvals. |

## External standards Beacon implements

| Standard | Role |
| --- | --- |
| [OVERT 1.0](https://overt.is/) | Normative. Beacon is registering as profile `aigovops-beacon.v1`. |
| [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) | Normative. Every signed payload is canonicalized via JCS before signing. |
| RFC 8032 — EdDSA (Ed25519) | Normative. Signature algorithm. |
| [DSSE v1](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md) + [in-toto Statement v1](https://github.com/in-toto/attestation) | Optional outer envelope when Beacon receipts are shipped as attestations. |

## External standards Beacon helps you produce evidence for

These are frameworks Beacon is **not** trying to be — it just generates the kind of evidence they expect:

- NIST AI Risk Management Framework (AI RMF 1.0)
- ISO/IEC 42001:2023 — AI Management Systems
- ISO/IEC 23894:2023 — AI Risk Management
- EU AI Act (Regulation 2024/1689)
- NYC Local Law 144 (employment AI bias audits)
- Colorado SB 205 (consumer AI)
- HIPAA, GLBA, SOX (where AI touches regulated data)

The framework mappings themselves are advisory and live in [`crosswalks/overt-mapping.yaml`](crosswalks/overt-mapping.yaml). For canonical, versioned, citable framework mappings, see [umbrella-govops](https://github.com/bobrapp/umbrella-govops) — that project is the Foundation's policy-as-code registry.

## What Beacon is not

So that the boundary is clear:

- **Beacon is not a policy engine.** It records what happened; it does not decide what should happen. Pair it with a policy engine if you need one.
- **Beacon is not a SIEM.** It produces tamper-evident receipts, not real-time security analytics. Ship the receipts to your SIEM of choice.
- **Beacon is not a compliance framework.** It is the substrate auditors can verify *under* any framework you choose.
- **Beacon is not a Foundation marketing surface.** OVERT 1.0 is the normative authority for Beacon; the Foundation operates Beacon as one conformant profile among potentially many.

## Contributing related-project pointers

If you build something on top of Beacon — receipt analytics, sector-specific dashboards, a different policy companion — open a PR adding it to the table above. The bar is: (a) it consumes or produces OVERT 1.0–compliant receipts, and (b) it has a working public release.
