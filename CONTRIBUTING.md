# Contributing to AIGovOps Beacon

Thank you for considering a contribution. Beacon is a Foundation project — every change passes through the same governance pipeline it advocates for others. That's the point.

## The short version

1. Open an issue describing the change. For anything user-visible, include a sketch or the exact copy.
2. Fork. Branch from `main` as `feat/<short-name>` or `fix/<short-name>`.
3. Run `npm test` and `npm run lint` (server) and `npm run typecheck` (studio).
4. Open a PR. Reference the issue. Fill in the PR template.
5. A maintainer will run the production-readiness gate. If green, a human approver merges.

## What we expect

- **Plain language wins.** Beacon's Studio is read by non-technical auditors. If a label needs a footnote, the label is wrong.
- **Evidence by default.** Every new feature must produce a receipt or explain why none is needed.
- **No PDF theater.** Specs in markdown, schemas in YAML/JSON, examples that run.
- **Accessibility is non-negotiable.** WCAG AA. Keyboard navigation. Screen-reader labels. Color is never the only signal.

## What needs a human approver (per the Foundation constitution)

Agents may draft anything. A human approver must ratify:

- Changes to checklist packs that affect regulatory mapping
- New gate definitions or Rego rules
- Changes to the receipt schema or signing flow
- Anything affecting trust-tier promotion logic

The PR template lists these explicitly. If your change touches any of them, expect Steward Council review.

## Trust tiers for contributors

- **T0** — first PR. Welcome. We'll pair-review.
- **T1** — three merged PRs. Triage rights on issues.
- **T2** — six merged PRs + signed CLA. Review rights.
- **T3** — invited by Steward Council. Merge rights on policy/ and checklists/.

## Reporting security issues

Do **not** open a public issue. Email `security@aigovopsfoundation.org` with details. We'll respond within 48 hours.

---

By contributing, you agree your work is licensed under Apache-2.0 and you grant the Foundation a perpetual license to use, modify, and redistribute it.
