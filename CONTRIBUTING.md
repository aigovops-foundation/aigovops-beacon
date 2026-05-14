# Contributing

Thanks for being here. This project is built by people who care about shipping AI safely, and we'd love to build it with you.

## The shortest version

- Use it. Break it. Tell us what you found.
- Open an issue first if you're not sure.
- Send a small PR. Small PRs get merged.
- Be kind. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## What "use it" means

Stand Beacon up against your environment. The walkthrough at [bobrapp.github.io/aigovops-beacon/walkthrough](https://bobrapp.github.io/aigovops-beacon/walkthrough/) takes about an afternoon. When you hit something confusing, open an issue. When something works that surprised you, tell us in the discussions tab — that helps everyone.

## Sending a PR

1. Fork the repo.
2. Make a branch with a name that describes what you're doing: `add-checklist-soc2`, `fix-receipt-canonicalization`, etc.
3. Keep the diff small. If it grows, split it.
4. Write a commit message that future-you will thank you for.
5. Open the PR. In the description, tell us: what changed, why, anything you weren't sure about.
6. A maintainer will review. Reviews are a gift; please return them.

## What's likely to get merged

- Bug fixes with a clear reproduction.
- Doc fixes — typos, broken links, anything that made you confused.
- New checklist packs for frameworks not yet covered.
- New crosswalk entries that map Beacon controls to standards we haven't yet listed.
- Test coverage anywhere.

## What's likely to get a "let's talk first"

- Big architectural changes.
- Anything that changes the receipt schema. Receipts are wire-compatible with [`aigovops-Replay`](https://github.com/bobrapp/aigovops-Replay) and must stay aligned with [OVERT](https://overt.is/) — talk to the steward and the review circle first.
- New top-level documents.
- Anything that touches the profile registration (see [`docs/PROFILE_REGISTRATION.md`](docs/PROFILE_REGISTRATION.md)) — the steward signs off on these.

## Becoming a maintainer

You don't apply. You earn it. The path looks like this:

1. **Contributor.** You've sent a PR. Welcome.
2. **Trusted contributor.** You've sent several. You review other people's PRs. You answer questions in issues. Maintainers start asking your opinion before merging.
3. **Maintainer.** A maintainer nominates you. The other maintainers say yes. You're added to `MAINTAINERS.md` (per project).
4. **Review circle.** Self-nominate or get nominated. The steward picks two maintainers and one or two rotating community seats for the review circle. See [`STEWARD.md`](STEWARD.md).

No interviews. No quotas. The work is the resume.

## Good first issues

We tag them `good first issue` in the issue queue. They are real problems with bounded scope. If you pick one up, drop a comment so we don't duplicate effort.

## Style

- Code: whatever the existing file uses. We're not religious. If you change the style, do it in a separate PR.
- Docs: plain language, short sentences, kindness. If a sentence reads like it would survive in a contract, rewrite it.
- Commit messages: imperative mood ("Add", "Fix", "Refactor"). One line summary, blank line, paragraph if needed.

## How we say no

Kindly, with reasons, in the PR. If we say "let's not merge this," we'll tell you why and what we'd merge instead. If we never reply, that's a bug — please ping the PR.

## Questions

- Issues: [github.com/bobrapp/aigovops-beacon/issues](https://github.com/bobrapp/aigovops-beacon/issues)
- Community: [aigovopsfoundation.org](https://www.aigovopsfoundation.org/)
- Email: [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community), [ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community)
