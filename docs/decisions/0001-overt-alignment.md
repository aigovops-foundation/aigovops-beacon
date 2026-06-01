# ADR 0001 — Align Beacon with OVERT 1.0; name Glacis the founding steward

**Status:** accepted
**Date:** 14 May 2026
**Authors:** Bob Rapp, Ken Johnston
**Steward sign-off:** pending (Glacis Technologies)

## Context

Beacon shipped in April 2026 as the AIGovOps Foundation's first open-source project. It implements the load-bearing shapes of [OVERT 1.0](https://overt.is/) — signed runtime receipts, Ed25519, canonical JCS, append-only log, Merkle anchoring, framework crosswalks, the auditor-bundle pattern — but launched without any attribution to OVERT or to its steward, [Glacis Technologies](https://www.glacis.io/).

OVERT 1.0 was published 25 March 2026 by Glacis. Glacis was an inaugural-event sponsor of the Foundation and had multiple direct conversations with the Foundation co-founders before Beacon shipped.

On 13 May 2026, Joe Braidwood (Glacis CEO) wrote a direct, in-good-faith letter pointing this out, and asked the Foundation to:

1. Register Beacon as an OVERT Protocol Profile under the [royalty-free patent covenant](https://overt.is/ipr-policy).
2. Add OVERT and Glacis attribution to Beacon's README and homepage.
3. Position the Foundation downstream of OVERT — as community and adoption — rather than as a parallel standards-issuing body.

## Decision

Accept all three of Joe's asks. Go further by inviting Glacis to be the **founding Project Steward** of the AIGovOps Foundation's open-source program — modeled on the FinOps / CNCF / Linux Foundation pattern of separating business governance from technical stewardship.

Specifically:

- Register Beacon as `aigovops-beacon.v1` under OVERT — AAL-1 self-declared at registration, roadmap to AAL-2 with an Independent Attestation Provider.
- Add standards-alignment attribution to README, homepage, receipt schema, and footer.
- Publish a top-level [`STANDARDS.md`](../../STANDARDS.md) saying the Foundation does not issue standards.
- Publish [`GOVERNANCE.md`](../../GOVERNANCE.md), [`STEWARD.md`](../../STEWARD.md), [`ENGAGEMENT.md`](../../ENGAGEMENT.md) as v0.1 placeholders, with explicit invitation to Glacis to rewrite them.
- Retire the phrase "AIGovOps Foundation Protocol" (which had been used as a fact-check appendix name) — it sounded too close to standards-issuing language.

## Consequences

- The Foundation publicly aligns with OVERT and Glacis. Story arc: implementer and steward, not adjacent voices.
- Beacon's receipt schema is reframed as the wire format for an OVERT envelope. Profile-specific extensions are explicit.
- A second open-source project under the Foundation will follow the same pattern from day one.
- Every Foundation-affiliated implementation gets reviewed by the steward and a small review circle before public release. This is a habit, not a rule we enforce.
- The Foundation explicitly does not pursue a standards-issuing path, a certification program, or a commercial product.

## Alternatives considered

- **"Convergent evolution" defense.** Reject the framing. Decided against — the timing, sponsorship, and prior conversations make it untenable in good faith.
- **Light attribution only.** Add a footer line, keep the rest of the framing parallel. Decided against — it does not solve the structural question of "how does this not happen again."
- **Cease and desist.** Park or rename Beacon. Decided against — it discards real community work without serving anyone, and it does not address the underlying need (one common vocabulary, many implementations).
- **Quiet attribution + private apology.** Decided against — the structural answer needs to be public, because the structural lesson is also public.

## References

- Joe Braidwood letter, 13 May 2026 ("Being OVERT about Beacon")
- [OVERT 1.0 specification](https://overt.is/)
- [OVERT IPR policy](https://overt.is/ipr-policy)
- [STANDARDS.md](../../STANDARDS.md), [GOVERNANCE.md](../../GOVERNANCE.md), [STEWARD.md](../../STEWARD.md)
- Commit [`1913613`](https://github.com/bobrapp/aigovops-beacon/commit/1913613)
