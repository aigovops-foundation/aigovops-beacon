# AiGovOps Beacon: notes for Claude

Beacon is the runtime that signs a receipt for each AI decision (Ed25519, append-only audit log).
It implements the OVERT 1.0 open standard. Public repo, Apache-2.0.

## Layout

- `server/`: the Node service. Its tests live in `server/test`.
- `src/`, `tests/`, `pyproject.toml`: the Python package and its tests.
- `docs/`: the public site. GitHub Pages serves `main` `/docs` directly, so a merge to `main`
  that touches `docs/` is a publish.
- `lab-service/`, `deploy/`, `mcp/`, `extension/`: separate deployables. Read each one's own
  README before changing it.

## Checks to run before a pull request

```bash
cd server && npm install --no-audit --no-fund && npm test
pip install -e ".[dev]" && python -m pytest -v
python -m pytest -m scale tests/scale -v
```

These are the commands `.github/workflows/ci.yml` runs.

## Things that are easy to get wrong

- `main` is protected: a pull request, one maintainer review and green CI. No force-push.
- `.github/workflows/sync-from-backend.yml` copies content in on a schedule. Before hand-editing a
  file, check whether that workflow owns it, or the next sync will overwrite the edit.
- Receipts, canonicalization and signature verification are the product. A change there needs a
  test that fails before the change and passes after.

## Rules for an agent

- Agents propose, humans approve. Open a pull request; do not merge it, and do not push to `main`.
- Never sign, approve or rule on anything in a human's name.
- Secrets live in 1Password. Never print, paste or commit a key, token or private key.
- A check that was not run is reported as not run. Do not write "passes" from memory.
- Read `CONTRIBUTING.md` where there is one. It wins over this file where they differ.
