# Contributing to AiGovOps Beacon

We welcome pull requests, framework additions, beacon adapters, and translations
from auditors, regulators, engineers, and AI program owners.

> **Tagline:** YES-Ship AI · YES-Steady AI · YES-Recover AI

## How the repository is protected

This is a **public open-source project** under Apache-2.0. To keep it useful
and trustworthy for everyone:

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

## How to contribute

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

- New national / sectoral framework YAMLs (use `frameworks/schema/framework.schema.json`).
- Beacon adapters for additional CASB / SIEM / cloud sources.
- Translations of control text (see `frameworks/translations/`).
- New entries for the AI failures dataset with primary-source URLs.
- Bug fixes, doc improvements, accessibility tweaks.

## What needs maintainer approval

- Changes to the receipt schema (`docs/RECEIPT_SCHEMA.md`).
- Changes to the scoring weights (`scoring/mapping.yaml`).
- Removing or renaming a framework.

## Reporting security issues

Email **[security@aigovopsfoundation.org](mailto:security@aigovopsfoundation.org)**
or message the maintainers directly. Please do **not** open a public issue
for vulnerabilities.

## Maintainers

- **Bob Rapp** — [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community)
- **Ken Johnston** — [ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community)
- Foundation — [aigovopsfoundation.org](https://www.aigovopsfoundation.org/)

Apache-2.0 · fork it · sign with your own keys · run it your way.
