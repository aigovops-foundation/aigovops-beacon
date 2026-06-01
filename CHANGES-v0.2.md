# v0.2-Glacis-as-steward-of-the-open-source-approach — Change Plan

**Status:** proposed · drafted 14 May 2026 by Bob Rapp & Ken Johnston
**Supersedes:** v0.1 (committed 14 May 2026 as `1913613`)
**Awaits:** Joe Braidwood / Glacis review before any of this becomes canonical

---

## Why v0.2

v0.1 (this morning) did the right substantive thing — named Glacis as Founding Steward, attributed OVERT everywhere, positioned the Foundation downstream of the standard. But v0.1 was written in the voice of a board memo: terms, tenure, quorum, ratification, 2/3 votes, charter vetoes. That voice is wrong for what we're trying to build. We are not negotiating a contract. We are inviting a steward to shape an open-source community.

v0.2 strips every word that sounds like a legal instrument and rewrites the same intent as community plain-speak. It also adds the things v0.1 was missing: contributor norms, a meeting cadence, a public roadmap doc, and a "how to join" entry point.

The principle for the rewrite: **if a sentence sounds like it would survive in a contract, it does not belong in this repo.** The Foundation's lawyers can write the contract separately, off-repo. The repo should read like a working community.

---

## The full v0.2 change set, file by file

### Files to edit (legal-language strip)

| File | What changes |
|---|---|
| `STANDARDS.md` | Drop "501(c)(6)" reference in the layer table. Keep OVERT/Glacis attribution and IPR-policy link (those describe Glacis's own published policy, not Foundation legal terms). |
| `GOVERNANCE.md` | Replace with a plain-language "how we make decisions" doc. Drop: 2/3 votes, quorum, tenure, "Removable by," "501(c)(6)," "legal," "ratified." Keep: the separation of business vs. technical decisions, do-ocracy, neutral asset ownership, not pay-to-play, pre-release review as a habit. |
| `STEWARD.md` | Drop: "charter veto," "ratifies," "Removal and succession," "2/3 vote with cause," "60 days' notice," "indefinite term, reviewed every 24 months." Replace with: what good stewardship looks like, what we ask the steward to do, how either side walks away kindly if it stops working. |
| `ENGAGEMENT.md` | Drop "ratified," "Governing Board" language. Keep the open questions to Joe — those are the heart of the doc. Add: a contributor norms section that reads like a code of conduct, not a license. |
| `docs/PROFILE_REGISTRATION.md` | Drop "501(c)(6)." Keep "Patent covenant: royalty-free under overt.is/ipr-policy" — that's Glacis's published language, not ours. |

### Files to add

| File | Purpose |
|---|---|
| `CONTRIBUTING.md` | How anyone contributes — issues, PRs, discussions, maintainer ladder. Plain-language, no CLA talk. |
| `CODE_OF_CONDUCT.md` | Standard Contributor Covenant-style doc, lightly edited. |
| `ROADMAP.md` | The first six months as a community. Public. Editable by anyone via PR. |
| `MEETINGS.md` | Where and when we meet in public. Joint Foundation × Steward office hours, monthly community call, weekly TRC working sessions once the TRC stands up. |
| `JOIN.md` | The one-page entry point: how to use Beacon, how to contribute, how to sponsor, how to nominate yourself for the TRC. |
| `docs/decisions/0001-overt-alignment.md` | First Architecture Decision Record (ADR). Captures the decision to align with OVERT and name Glacis steward, with context and consequences. Lightweight ADR pattern. |
| `docs/decisions/0002-steward-led-governance.md` | ADR for the steward-led open-source approach itself. |

### Files to retitle / consolidate

- Rename the section "Foundation Steward Partner" → "**Project Steward**" throughout. "Partner" reads transactional. "Project Steward" reads communal.
- Drop the "Technical Review Committee" name in favor of "**Review Circle**" — same function, less corporate-committee, more open-source.
- Drop "Governing Board" inside this repo. Whatever the Foundation board does, it does outside this repo. Inside this repo, decisions are made by maintainers and the steward in the open.

### Files NOT changing

- `README.md` standards-alignment section — already clean, no legal language, keep as-is.
- `docs/index.html` hero + footer attribution — already clean.
- `docs/RECEIPT_SCHEMA.md` opener — already clean.
- `crosswalks/overt-mapping.yaml` — already clean.
- `aigovops-fact-check.md` retitle — already clean.

---

## The voice rewrite — examples

Below is what changes in plain terms.

### Before (v0.1, GOVERNANCE.md)
> Composition: 5–9 directors, mix of practitioners, member companies, and at-large community seats.
> Term: 2 years, staggered.
> Authority: budget, brand, legal, partnerships, membership.
> Quorum: simple majority.

### After (v0.2)
> The Foundation board handles money, the name, events, and partnerships. It does not decide what the project is, what gets merged, or what gets released. Those calls live with the steward and the maintainers, in the open, in this repo.

---

### Before (v0.1, STEWARD.md)
> **Charter veto.** The Steward Partner can object to any Governing Board decision that materially affects the technical track. Objections are public, written, and trigger a 30-day pause.

### After (v0.2)
> If the steward thinks the Foundation is about to do something that hurts the project, the steward says so in the open. We pause, we listen, we work it out. There is no formal veto because there is no formal contest — we are building this together or we are not building it at all.

---

### Before (v0.1, STEWARD.md)
> ## Removal and succession
> The Steward Partner may resign at any time with 60 days' notice. The Governing Board may remove the Steward Partner only by a 2/3 vote with cause. Succession is by Governing Board appointment from within the standards community, prioritizing continuity with the standard then in use.

### After (v0.2)
> ## If it stops working
> Either side can walk away. We hope it never comes to that. If the steward decides this is no longer a good use of their time, we thank them in public, write down what we learned, and find another steward who is closer to the standard the project then implements. If the project decides the stewardship is no longer serving the community, we say so in the open and have the same conversation. No theatrics, no contracts, no surprises.

---

### Before (v0.1, ENGAGEMENT.md)
> ## How this document graduates from placeholder to canonical
> 1. Joe and Glacis revise this document on their letterhead.
> 2. The revised document is reviewed jointly by Bob, Ken, and Joe.
> 3. The reviewed document is ratified by the Governing Board.
> 4. The ratified document supersedes this placeholder.

### After (v0.2)
> ## How this becomes the real thing
> Joe and Glacis write the version that's actually theirs. We talk it through with the community on a public call. When the steward is happy, we replace this file. Git keeps the history.

---

## The new content v0.2 adds

### `CONTRIBUTING.md` — outline
- "Open an issue first if you're not sure" norm.
- PR template (what changed, why, who reviewed).
- Maintainer ladder: contributor → trusted contributor → maintainer → steward-circle. Earned, not appointed.
- How to claim a "good first issue."
- Style: small PRs, helpful commit messages, kindness.

### `MEETINGS.md` — outline
- Monthly community call (first Wednesday, 10am PT, public link). Open to all.
- Bi-weekly review circle (steward + 2 maintainers + rotating community seat). Public agenda, public notes.
- Quarterly "shipping safe / staying safe / getting back to safe" retrospective with the broader Foundation community.
- One annual joint event with the steward's commercial team to talk about what the standard needs next.

### `ROADMAP.md` — outline
- **Next 30 days:** profile registration submitted; first review-circle meeting; first community call; ROADMAP and CONTRIBUTING ratified-by-PR.
- **Next 90 days:** AAL-1 self-declared conformance review; gaps in `crosswalks/overt-mapping.yaml` closed (drift detection, delegation chains, CIs in scoring); second member organization joins the program.
- **Next 6 months:** AAL-2 with an IAP; a second open-source project hosted under the Foundation's program, also OVERT-aligned, also steward-reviewed before release; first joint Foundation × Steward field report.

### `JOIN.md` — outline
- Three doors: **use it** (try Beacon), **build it** (contribute), **back it** (sponsor or steward).
- Self-nomination form for the review circle.
- Clear "who not to invite" line — no exclusive integrations, no preferred-vendor games.

### `docs/decisions/0001-overt-alignment.md` — outline (ADR shape)
- **Context:** Beacon launched in April 2026 without OVERT attribution.
- **Decision:** Align Beacon with OVERT 1.0; register as a profile; name Glacis steward.
- **Status:** accepted 14 May 2026.
- **Consequences:** new attribution everywhere; new governance docs; profile registration in progress; the Foundation does not issue standards.

### `docs/decisions/0002-steward-led-governance.md` — outline
- **Context:** v0.1 governance read like a contract.
- **Decision:** Strip legal language; hand the canonical pen to the steward; keep the repo readable.
- **Status:** proposed 14 May 2026.
- **Consequences:** v0.1 governance docs replaced by v0.2 plain-language versions; legal instruments (if any are needed) live elsewhere.

---

## Sequence of work

1. Land this plan (`CHANGES-v0.2.md`) on a working branch named `v0.2-Glacis-as-steward-of-the-open-source-approach`.
2. Strip legal-shaped language from the four v0.1 docs.
3. Add the seven new files.
4. Push the branch. Open a PR. Do **not** merge until Joe has reviewed.
5. Walk Joe through the diff live on the call.
6. Merge after the call with whatever revisions Joe wants — or replace the branch entirely with one Joe authors.

---

## What this plan deliberately does not do

- It does not write the Foundation's bylaws. That is a separate, lawyer-led job, and it lives off-repo.
- It does not promise Glacis anything in writing that would survive a contract review. The promises live in our conduct, not our paperwork.
- It does not pick the membership tiers or dues structure. Those are questions for Joe to answer in his version of `ENGAGEMENT.md`.
- It does not name a second steward, or sketch a path to one. We'll add that when the standards landscape needs it. v0.1 was premature.

---

## One sentence summary

The repo should read like a community we are inviting Joe to shape, not a structure we are inviting Joe to sign.

---

## Addendum — v0.2.1: two new titles

Added 14 May 2026, after Bob and Ken agreed on naming.

v0.2 introduced one structural role — **Project Steward**. v0.2.1 names the people and companies who actually fill the seats around it.

### Founding Open-Source Curator — Glacis Technologies

- **Company-level title.** Warmer than "Steward Partner," honest about the standing it carries: Glacis is the first, and they are curating, not just hosting.
- **Relationship to Project Steward.** Two names, one seat. "Founding Open-Source Curator" is who Glacis is in our story. "Project Steward" is the structural role they fill in the repo's bylaws-style docs.
- **Where it appears.** Hero, stewardship section, footer of `docs/index.html`; opener of `STEWARD.md`; the new `docs/draft-v0.2-glacis.html` public announcement page.

### Launch Advisor — Joe Braidwood

- **Personal title, time-scoped.** Runs from now through the Beacon v1 release window. After v1 ships, Joe transitions into the steady-state Review Circle convened by the Project Steward.
- **Why personal, not corporate.** The company seat carries the standing-thing. The advisor seat carries the *get-v1-out-the-door* thing. Keeping them separate means each one can be honest about its own timeline.
- **Where it appears.** Hero, stewardship section, footer of `docs/index.html`; new section in `STEWARD.md`; the announcement page.

### Files touched in v0.2.1

- **`docs/index.html`** — banner, hero lede, stewardship section third card, and footer all name the two new titles.
- **`docs/draft-v0.2-glacis.html`** (new) — public announcement of the v0.2 approach and the two new titles. Linked from the banner and the footer.
- **`STEWARD.md`** — opener reframed around "Founding Open-Source Curator," with a clear "two names, one seat" note. New "Launch Advisor — Joe Braidwood" section. Contact list updated.
- **`docs/decisions/0002-steward-led-governance.md`** — addendum recording the v0.2.1 naming decision.
- **`CHANGES-v0.2.md`** — this addendum.

### Naming rule, locked in

Project Steward → structural role. Founding Open-Source Curator → the company filling it. Launch Advisor → the person helping us ship v1.

Anywhere a doc says *Project Steward*, read *the Founding Open-Source Curator — Glacis Technologies*. Anywhere a doc names a personal seat for the v1 window, that is the Launch Advisor.

