# How we make decisions

This is a working community. The way we decide what to build, what to ship, and what to change is written down here in plain language so anyone can follow along. There is no contract behind this document. There are habits, and we keep them in the open.

If anything here ever has to fight a paragraph in a real legal instrument, the legal instrument wins. But the legal instruments live somewhere else. This repo is for the practice.

## The one rule

> **The people who pay for the project do not decide what the project is.**

That sentence is borrowed from how the FinOps Foundation, CNCF, and the Linux Foundation talk about themselves. We think it is the right one to borrow.

## Two kinds of decisions, kept separate

Open-source projects get into trouble when business pressure overrides technical judgment, and they get into trouble when technical purity ignores commercial reality. The fix is to keep those two kinds of decisions in different hands.

| Kind of decision | Who makes it | Examples |
|---|---|---|
| **About the project** — what to build, what to merge, what to ship, what the bar is | The Project Steward and the maintainers, working in the open | Conformance bar, release readiness, what gets reviewed before release, contribution standards |
| **About the Foundation** — money, the name, partnerships, events, anything off-repo | The Foundation, separately, off-repo | Sponsorships, brand, fundraising, legal arrangements |

The two never decide for each other. If they disagree, we talk about it in the open until we don't.

## Principles we work by

These are not rules we enforce. They are habits we expect of each other:

1. **The repo is the source of truth.** If a decision matters, it is captured in this repo as a PR or an ADR (see [`docs/decisions/`](docs/decisions/)). If it's not in the repo, it didn't happen.
2. **Do-ocracy.** The people doing the work make the calls about the work. Sponsorship buys visibility, not authority.
3. **Neutral asset ownership.** The Foundation holds the trademarks, the domain, and the GitHub org so no single company — including the steward — can take the project away.
4. **Not pay-to-play.** Anyone can open an issue, send a PR, earn maintainer trust. Membership and sponsorship are separate questions, handled off-repo.
5. **Standards are downstream of the spec, not the project.** We implement OVERT. We do not issue standards. See [`STANDARDS.md`](STANDARDS.md).
6. **Pre-release review.** No Foundation project ships publicly without the Project Steward and a small review circle looking at it first. This is a habit, kept because we built the project once without it and don't want to do that again.
7. **In the open.** Meeting notes, decisions, and disagreements all live in this repo. Private side-channels are for kindness, not control.
8. **Conflict-of-interest is normal — undisclosed conflict-of-interest is the problem.** Anyone with a seat at the review circle says, in writing, where their commercial interests live. Updated whenever it changes.

## Roles, kept small on purpose

### Project Steward
Glacis Technologies, founding. See [`STEWARD.md`](STEWARD.md). The steward sets the bar, chairs the review circle, and signs off on profile registration.

### Review Circle
A small standing group that reviews what is about to ship before it ships. Chaired by the steward. Three to five people total, including the steward, two maintainers, and one or two rotating community seats. Agenda public, notes public, in this repo.

### Maintainers
Earned by contribution. Listed in `MAINTAINERS.md` (per project). Maintainers merge PRs, cut releases, set sub-project direction, and own the contributor experience.

### Contributors
Everyone else who has ever opened an issue or sent a PR. The starting point. There is no other gate.

## How a decision gets made

For most things: open a PR, talk it through in the PR, merge when a maintainer says yes.

For bigger things — a new project, a profile bump, a change to one of these governance docs — open a PR that adds an **ADR** (Architecture Decision Record) under [`docs/decisions/`](docs/decisions/). The ADR says: what's the context, what's the decision, what changes, and who agreed. We use the lightweight ADR pattern; no template gymnastics.

For things that affect the standard, not just the implementation: bring it to the steward, and from there to the standard's process. We are not the right venue for changing OVERT itself.

## If we disagree

We talk about it in the open. If we still disagree, the steward and the maintainers each say their piece in writing in the relevant PR or ADR. We take a beat. We come back. We almost always find an answer.

If the disagreement is between the project and the Foundation off-repo, the steward says so in public and we pause until we have worked it out. There is no formal veto because there is no formal contest — we are building this together or we are not building it at all.

## If something stops working

Maintainers can step back at any time. Stewards can step back at any time. The Foundation can decide a steward arrangement is no longer the right fit, and a steward can decide the same.

When that happens, we say so out loud, write down what we learned in an ADR, thank each other in public, and find what comes next. No theatrics, no contracts, no surprises.

## Where this came from

This document is **v0.2**, drafted 14 May 2026 by Bob Rapp and Ken Johnston, with an explicit invitation to the founding Project Steward (Glacis) to rewrite any part of it. We expect Joe Braidwood and the Glacis team to take a pen to this and put their voice on it. We will replace this file when they do, and keep what was here in the git history.

If you are reading this before that happens: treat every line as **proposed**, not policy.
