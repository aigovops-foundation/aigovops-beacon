# ADR 0002 — Steward-led governance, written in community voice

**Status:** proposed
**Date:** 14 May 2026
**Authors:** Bob Rapp, Ken Johnston
**Steward sign-off:** pending (Glacis Technologies)

## Context

ADR 0001 (this morning) named Glacis as the founding Project Steward and committed three governance documents to the repo: [`GOVERNANCE.md`](../../GOVERNANCE.md), [`STEWARD.md`](../../STEWARD.md), and [`ENGAGEMENT.md`](../../ENGAGEMENT.md).

Those v0.1 documents did the right thing substantively — separation of business and technical decisions, neutral asset ownership, do-ocracy, pre-release review, no pay-to-play. But they were written in board-memo voice: 2/3 votes, quorum, tenure, ratification, charter veto, removal and succession.

That voice is wrong for what we are inviting Glacis to do. We are not negotiating a contract; we are inviting a steward to shape a community. The repo should read like a working community.

## Decision

Rewrite the three v0.1 governance documents in plain community voice and strip every legal-shaped phrase. Add the missing community pieces ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md), [`ROADMAP.md`](../../ROADMAP.md), [`MEETINGS.md`](../../MEETINGS.md), [`JOIN.md`](../../JOIN.md)).

Specifically:

- Drop: "Governing Board," "501(c)(6)," "ratified," "tenure," "quorum," "2/3 vote," "charter veto," "removal and succession," "indefinite term," "60 days' notice."
- Rename: "Steward Partner" → **Project Steward**. "Technical Review Committee" → **Review Circle**.
- Replace contract-shaped sentences with the habits they describe.
- Push everything legal off-repo — if any of it ever needs to live in a real instrument, the Foundation's lawyers can write it separately.

The principle: **if a sentence sounds like it would survive in a contract, it does not belong in this repo.**

## Consequences

- The repo reads like a working community, not a corporate charter.
- The steward is invited to rewrite any document on their letterhead. When they do, the Foundation publishes their version as the canonical one.
- The Foundation's actual legal arrangements (board structure, bylaws, IP holding) live off-repo. They are not the community's source of truth.
- The new community-shaped files ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md), [`ROADMAP.md`](../../ROADMAP.md), [`MEETINGS.md`](../../MEETINGS.md), [`JOIN.md`](../../JOIN.md)) give contributors and sponsors three clear doors in.
- The repo is easier to read and harder to misread.

## Alternatives considered

- **Keep v0.1.** Decided against — board-memo voice signals the wrong kind of relationship and would make the steward arrangement feel transactional.
- **Strip the legal language but skip the new community files.** Decided against — without `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `ROADMAP.md`, "in the open" is aspirational. With them, it's the path.
- **Wait for the steward to rewrite everything before publishing v0.2.** Decided against — handing Joe v0.1 (board-memo voice) as the starting point would be worse than handing him v0.2 (community voice) as a draft to improve on.

## References

- ADR 0001 — OVERT alignment
- [CHANGES-v0.2.md](../../CHANGES-v0.2.md) — the full change plan that produced this branch
- Branch: `v0.2-Glacis-as-steward-of-the-open-source-approach`
