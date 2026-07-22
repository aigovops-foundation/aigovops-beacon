# Governance

This document defines how decisions get made in the AiGovOps Foundation's open-source program. It is modeled on the patterns the [Linux Foundation](https://www.linuxfoundation.org/projects/hosting), [CNCF](https://github.com/cncf/foundation/blob/main/charter.md), and [FinOps Foundation](https://www.finops.org/about/governing-board/) use, adapted to the AI governance space.

The single most important sentence in this document:

> **The body that pays for the project does not decide what the project is.**

## The two-track split

Open-source projects fail when business priorities override technical judgment, and they fail when technical purity ignores commercial reality. The fix is to separate the two tracks and make both legible.

| Track | Who | What they decide | What they do **not** decide |
|---|---|---|---|
| **Business governance** | AiGovOps Foundation Governing Board (501(c)(6)) | Budget, membership tiers, events, brand, legal, fundraising, partnerships | Technical roadmap, conformance bar, what gets merged, what gets released |
| **Technical governance** | Foundation Steward Partner + Technical Review Committee (TRC) | Conformance bar, profile registration eligibility, release readiness, pre-release review, contribution standards | Pricing, membership, board composition, partnerships |

Neither track can override the other. Conflicts are resolved by a published escalation procedure (see [`ENGAGEMENT.md`](ENGAGEMENT.md), to be finalized by the Steward Partner).

## Principles

These are non-negotiable in this repo and in any project the Foundation accepts:

1. **Neutral asset ownership.** Trademarks, domains, GitHub orgs, and project marks are owned by the Foundation as a neutral container. No member company — including the Steward Partner — can "take the project away."
2. **Do-ocracy.** Those who do the work make the technical decisions, under the published charter. Sponsors do not get extra votes.
3. **Not pay-to-play.** Anyone can contribute, file issues, propose changes, and earn maintainer status on merit. Sponsorship buys visibility and reach, not technical authority.
4. **Standards downstream.** The Foundation implements open standards; it does not issue them. See [`STANDARDS.md`](STANDARDS.md).
5. **Pre-release review.** No Foundation-affiliated implementation ships publicly without a Steward-Partner-led review against the registered profile. This rule exists to prevent the Beacon launch pattern from recurring.
6. **Public minutes, public charter.** Every governance decision that affects the community is published.
7. **Conflict-of-interest disclosure.** Every TRC member declares commercial interests in writing, kept current.

## Roles

### Governing Board (business track)
- Composition: 5–9 directors, mix of practitioners, member companies, and at-large community seats.
- Term: 2 years, staggered.
- Authority: budget, brand, legal, partnerships, membership.
- Quorum: simple majority.
- Public: yes. Names, affiliations, COI disclosures, voting record.

### Foundation Steward Partner (technical track)
- Founding Steward: **Glacis Technologies, Inc** — by virtue of OVERT stewardship and inaugural-event sponsorship.
- Role: see [`STEWARD.md`](STEWARD.md) (the Steward Partner writes the final version of that doc).
- Tenure: indefinite, reviewed every 24 months by the Governing Board.
- Removable by: 2/3 Governing Board vote with cause, or by Steward resignation.

### Technical Review Committee (TRC)
- Composition: Steward representative (chair), 2 community maintainers, 1 independent academic, 1 practitioner from a non-steward member company.
- Term: 1 year, renewable.
- Authority: pre-release review, profile registration recommendation, conformance verdicts.
- Decisions: simple majority. Steward has tie-breaking vote.
- Reports to: Governing Board (business decisions) and the community (technical decisions).

### Maintainers
- Earned through contribution. Documented in `MAINTAINERS.md` per project.
- Authority: merge PRs, cut releases, set sub-project direction.
- Accountable to: TRC for conformance; community for everything else.

## Why this shape

We picked this shape because it answers four questions at once:

1. **How do we keep the standard and the implementation honest?** Steward sets the bar; Foundation runs the project; TRC reviews before release.
2. **How do we keep one company from dominating?** Neutral asset ownership + do-ocracy + non-pay-to-play.
3. **How do we make it worth a company's investment anyway?** Co-marketing, pre-release coordination, regulatory voice, real seat in profile evolution.
4. **How do we make sure this never happens again?** Pre-release review is a rule, not a courtesy.

## Adoption status

This document is **v0.1**, drafted in May 2026 by Bob Rapp and Ken Johnston with the explicit invitation to Glacis (as Founding Steward Partner) to revise, replace, or supersede any section. The Foundation does not consider this document final until the Steward Partner has signed off in writing.

If you are reading this before that sign-off, treat every section as **proposed**.
