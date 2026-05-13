# Contributing to AIGovOps Beacon

We welcome pull requests, framework additions, beacon adapters, and translations
from auditors, regulators, engineers, and AI program owners.

> **Tagline:** YES-Ship AI · YES-Steady AI · YES-Recover AI

## How the repository is protected

This is a **public open-source project** under Apache-2.0. To keep it useful
and trustworthy for everyone:

- **`main` is protected** — direct pushes are disabled. Every change goes
  through a pull request that requires:
  - at least one approving review from a maintainer,
  - the e2e test suite (`python tests/e2e.py`) to pass,
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
4. **Run the e2e tests locally:** `python tests/e2e.py`
   - The full suite covers framework YAML/XML parse, JSON-Schema validation,
     scoring regression, signature verification, URL liveness, and contact
     metadata presence.
5. **Open a pull request.** Reference any framework or incident IDs you touched.
6. A maintainer will review within a few business days.

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
