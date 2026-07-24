# Contributing to AiGovOps Beacon

Thanks for being here. This project is built by people who care about shipping AI safely, and we'd love to build it with you.

## The shortest version

- Use it. Break it. Tell us what you found.
- Open an issue first if you're not sure.
- Send a small PR. Small PRs get merged.
- Be kind. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## What "use it" means

Stand Beacon up against your environment. The walkthrough at [aigovops-foundation.github.io/aigovops-beacon/walkthrough](https://aigovops-foundation.github.io/aigovops-beacon/walkthrough/) takes about an afternoon. When you hit something confusing, open an issue. When something works that surprised you, tell us in the discussions tab — that helps everyone.

## How changes land

- **`main` is protected** — direct pushes are disabled. Every change goes
  through a pull request that requires:
  - at least one approving review from a maintainer,
  - the CI test suite (see **Testing expectations** below) to pass,
  - signed commits where possible.
- **Force-pushes and branch deletions are blocked** on `main`.
- **Repository deletion** requires both maintainers to approve and is
  guarded by the GitHub repository "Restrict deletions" setting.
- **Issues and discussions are open** — anyone can read, comment, and
  propose changes. Collaborators with write access can be added on request
  for sustained contributors.

## Sending a PR

1. **Fork** the repository (or request collaborator access for sustained work).
2. **Create a topic branch** off `main`: `git checkout -b add-jp-aiba`.
3. **Make focused commits** that explain *why* in the body.
4. **Run the tests locally** (see **Testing expectations** below):
   `cd server && npm test` and `python3 -m pytest`.
   - Together these cover canonicalization and signing, schema-conforming
     route responses, fuzzed/faulty-input resilience, and signature
     verification.
5. **Open a pull request.** Reference any framework or incident IDs you touched.
6. A maintainer will review within a few business days.

## Testing expectations

Beacon keeps a four-layer test pyramid across the Node server and the Python
beacons/SDK. New PRs are expected to keep it green and to add coverage at the
layer that matches the change. Tests must be **deterministic** — seed anything
random or fuzz-driven and expose an environment-variable override.

| Layer | Add a test here when you… | How to run |
| --- | --- | --- |
| **Unit** | change a pure function (canonicalization, signing, receipt building). | `cd server && npm test` · `pytest tests/unit` |
| **E2E** | add or change an HTTP route or its response shape. | `npm run test:e2e` · `pytest tests/e2e` |
| **Chaos** | touch input parsing or the disk write path. | `npm run test:chaos` · `pytest tests/chaos` |
| **Scale** | change the sign/bundle hot path. | `pytest -m scale tests/scale` |

Guidelines:

- **Unit** tests cover behavior in isolation — no network, no live server.
- **E2E** tests run against a live server and assert responses conform to the
  published receipt schema.
- **Chaos** tests come in two flavors: fuzzed/malformed input (the server must
  answer with a `4xx` structured error, never a `5xx` or a crash) and injected
  I/O faults (`EACCES`, `ENOSPC`, broken pipe — the helpers must surface a real
  error rather than corrupt state).
- **Scale** tests are gated (excluded from the default run) and live behind the
  `scale` marker; they run on demand and on a weekly CI schedule.

The full HTTP surface is specified in [`docs/api/openapi.yaml`](docs/api/openapi.yaml);
keep it in sync when you change a route.

## What we love receiving

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

- Issues: [github.com/aigovops-foundation/aigovops-beacon/issues](https://github.com/aigovops-foundation/aigovops-beacon/issues)
- Community: [aigovopsfoundation.org](https://www.aigovopsfoundation.org/)
- Email: [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community), [ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community)
