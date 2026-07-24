# Changelog

All notable changes to AiGovOps Beacon are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Test pyramid** across both runtimes (Node server and Python beacons/SDK):
  - **Unit** — canonicalization (RFC 8785), Ed25519 sign/verify, receipt
    building and capture modes.
  - **E2E** — every HTTP route exercised against a live server, with responses
    asserted to conform to the published receipt schema.
  - **Chaos** — fuzzed/malformed input (Hypothesis on Python, fast-check on
    Node) proving the server answers with a structured `4xx` and never a `5xx`,
    plus I/O fault injection (`EACCES`, `ENOSPC`, broken pipe) proving the write
    path surfaces real errors instead of corrupting state.
  - **Scale** — 10k+ synthetic receipts signed and bundled within a wall-clock
    and memory budget; gated behind the `scale` marker and run on demand and on
    a weekly schedule.
  - All randomized tests are deterministic via seeds with environment-variable
    overrides.
- **Complete API documentation** under `docs/api/`:
  - `openapi.yaml` — OpenAPI 3.1 spec for every endpoint (methods, paths,
    request/response schemas for success and error classes, auth, idempotency).
  - `flows.md` — receipt creation → signing → bundle assembly → anchoring →
    consumption by Lantern, with Mermaid sequence diagrams.
  - `actions.md` — every action verb with semantics, required fields, examples.
- `dev` optional-dependency group in `pyproject.toml` (pytest, hypothesis,
  httpx) and a `pytest.ini` wiring the test markers.
- README **Testing** and **API** sections; `CONTRIBUTING.md` **Testing
  expectations** describing what each pyramid layer expects from a PR.

### Fixed

- `server/src/services/checklists.js`: `countItems` iterated a generator with
  `.length` and always returned `undefined`; it now counts items correctly.
- `server/src/routes/index.js`: `/receipts` and `/inventory` now validate that
  required identity fields are non-empty strings, rejecting malformed payloads
  with a structured `4xx` instead of failing deep in the storage layer. Found by
  the new chaos fuzz tests.
- `server/package.json`: the server test script now uses `node --test`
  auto-discovery, which runs on both Node 20 and Node 22 (the previous
  directory-argument form broke on Node 22). Addresses the server-side half of
  issue #8.

### Notes

- Issue #9 (`sync-from-backend` DNS resolution) is unrelated to these changes
  and is intentionally left untouched.
