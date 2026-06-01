# Beacon Actions Reference

Every receipt carries an `event_type` — the *action verb* that says what
happened. This page catalogues the full vocabulary, what each verb means, which
fields it expects, and a worked example.

The authoritative list of verbs is the `event_type` enum in the published
[`receipt.schema.json`](../blueprint/artifacts/receipt.schema.json). This page
explains the semantics behind that enum.

## Common fields

Unless noted otherwise, every receipt includes these required fields (see the
schema for full rules):

| Field | Meaning |
| --- | --- |
| `id` | ULID — sortable, globally unique, encodes creation time. |
| `ts_utc` | RFC 3339 UTC timestamp, millisecond precision. |
| `user` | Acting identity: `sub` + `oidc_issuer` (required), `email` (optional). |
| `vendor` | Model vendor enum (`openai`, `anthropic`, …, `in-house`, `other`). |
| `model` | Model name. |
| `version` | Pinned version. Never the literal string `latest`. |
| `event_type` | The action verb — one of the values below. |
| `environment` | Where it ran: `cloud_saas`, `private_cloud`, `on_prem`, `edge`, `hybrid`. |
| `signature` | Ed25519 block: `alg`, `key_fpr`, `sig_b64`, `canonical_form`. |

Some verbs populate optional extension blocks defined by the
`aigovops-beacon.v1` profile:

- **`decision`** — `result` (`pass` / `review` / `fail`), `rules_evaluated`,
  `rules_failed`, `exception_id`. Populated for gate and admission verbs.
- **`control_refs`** — cross-framework control IDs satisfied by the receipt
  (e.g. `nist-ai-rmf:MEASURE-2.7`).
- **`subject`** / **`lineage`** — what the receipt is about and where it came
  from.
- **`prompt_hash`** / **`result_hash`** — `sha256:<64 hex>` digests recorded in
  redacted capture mode instead of raw `prompt` / `result`.

---

## Discovery

Verbs emitted while finding models already in use across an environment.

### `discovery.session.started`
A discovery run began. Marks the start of a correlated set of findings.
*Expects:* common fields. *Often pairs with:* a later `discovery.session.completed`.

### `discovery.session.completed`
A discovery run finished. Useful as a checkpoint for how many models were seen.
*Expects:* common fields; optionally `evidence_id` referencing the run summary.

### `discovery.model.found`
A specific model was identified in the environment.
*Expects:* common fields with `vendor` / `model` / `version` describing the find;
optional `subject`.

```json
{
  "event_type": "discovery.model.found",
  "vendor": "openai",
  "model": "gpt-4o",
  "version": "2024-08-06",
  "environment": "cloud_saas",
  "subject": { "name": "billing-assistant" }
}
```

---

## Inventory

Verbs that record the curated catalogue of governed models.

### `inventory.model.added`
A model was added to the inventory under governance.
*Expects:* common fields; optional `control_refs`.

### `inventory.trust.changed`
A model's trust tier was reassessed (e.g. promoted to *trusted* or flagged).
*Expects:* common fields; the new tier is carried in `evidence` / `subject`.

```json
{
  "event_type": "inventory.trust.changed",
  "vendor": "anthropic",
  "model": "claude-3-5-sonnet",
  "version": "20241022",
  "environment": "private_cloud",
  "subject": { "name": "trust:trusted" }
}
```

---

## Design

Verbs covering the design-time governance artifacts for a use case.

| Verb | Meaning |
| --- | --- |
| `design.usecase.registered` | A use case was registered for governance. |
| `design.risk.classified` | The use case's risk tier was assigned. |
| `design.datasheet.published` | A dataset datasheet was published. |
| `design.modelcard.published` | A model card was published. |
| `design.threatmodel.completed` | A threat model was completed. |
| `design.approved` | Design-stage review approved the use case. |

*Each expects:* common fields; typically `control_refs` linking to the satisfied
framework controls and `evidence_id` pointing at the published artifact.

```json
{
  "event_type": "design.modelcard.published",
  "vendor": "in-house",
  "model": "fraud-scorer",
  "version": "3.2.0",
  "environment": "on_prem",
  "control_refs": ["nist-ai-rmf:MAP-3.4"],
  "evidence_id": "modelcard-fraud-scorer-3.2.0"
}
```

---

## Build & evaluation

### `build.completed`
A model/image build finished and is ready for evaluation.
*Expects:* common fields; optional `subject.digest` pinning the built artifact.

### `eval.completed`
An evaluation run (benchmarks, red-team, safety suite) finished.
*Expects:* common fields; `evidence_id` referencing the eval report.

---

## Gates

Gates are policy checks that must pass before a model is admitted.

### `gate.evaluated`
A gate ran and produced a decision. **Populates `decision`.**
*Expects:* common fields + `decision` (`result`, `rules_evaluated`,
`rules_failed`, optional `exception_id`); usually `control_refs`.

```json
{
  "event_type": "gate.evaluated",
  "vendor": "openai",
  "model": "gpt-4o",
  "version": "2024-08-06",
  "environment": "cloud_saas",
  "decision": { "result": "pass", "rules_evaluated": 12, "rules_failed": 0 },
  "control_refs": ["nist-ai-rmf:MEASURE-2.7"]
}
```

### `gate.failed`
A gate produced a failing decision. **Populates `decision`** with
`result: "fail"` and `rules_failed > 0`.
*Expects:* common fields + `decision`.

### `exception.granted`
An explicit, time-bound exception was granted for a failing or risky gate.
*Expects:* common fields; the granted exception is referenced by
`decision.exception_id` on the related gate receipt.

---

## Bundles

### `bundle.signed`
A bundle of receipts was assembled and signed as a single portable artifact.
*Expects:* common fields; `evidence_id` (the bundle digest) and the included
receipt set described in `evidence`.

### `bundle.anchored`
A bundle digest was published to an external anchor (transparency log /
timestamping authority).
*Expects:* common fields; `evidence_id` (bundle digest) plus the anchor
reference / inclusion proof in `evidence`.

```json
{
  "event_type": "bundle.anchored",
  "vendor": "in-house",
  "model": "beacon",
  "version": "1.0.0",
  "environment": "private_cloud",
  "evidence_id": "sha256:9f2c…",
  "parent_receipt_id": "01J9Z…"
}
```

---

## Admission

Admission verbs record the runtime allow/deny decision at the edge.

### `admission.allowed`
A request to run a model was admitted. **Populates `decision`** with
`result: "pass"`.
*Expects:* common fields + `decision`.

### `admission.denied`
A request was refused by policy. **Populates `decision`** with
`result: "fail"` (or `review`).
*Expects:* common fields + `decision`; often `decision.exception_id` is `null`.

```json
{
  "event_type": "admission.denied",
  "vendor": "meta",
  "model": "llama-3.1-70b",
  "version": "1.0",
  "environment": "edge",
  "decision": { "result": "fail", "rules_evaluated": 5, "rules_failed": 2, "exception_id": null }
}
```

---

## Runtime observations

Verbs emitted as governed models actually run.

| Verb | Meaning | Notable fields |
| --- | --- | --- |
| `inference.observed` | A single inference happened. | `prompt_hash`, `result_hash`, `tokens_in`, `tokens_out`, `latency_ms` |
| `agent.tool.called` | An agent invoked a tool. | `evidence_id` (tool call detail) |
| `agent.retrieval.hit` | An agent retrieved context (RAG). | `lineage.parent_datasets` |

```json
{
  "event_type": "inference.observed",
  "vendor": "anthropic",
  "model": "claude-3-5-sonnet",
  "version": "20241022",
  "environment": "cloud_saas",
  "prompt_hash": "sha256:3b1f…",
  "result_hash": "sha256:7c9a…",
  "tokens_in": 412,
  "tokens_out": 188,
  "latency_ms": 1304
}
```

---

## Monitoring & safety

| Verb | Meaning |
| --- | --- |
| `monitor.drift.detected` | A drift detector fired against a baseline. |
| `monitor.threshold.breached` | A monitored metric crossed its threshold. |
| `guardrail.violated` | A guardrail (content / policy) was violated. |
| `incident.killswitch.fired` | An emergency stop was triggered for a model. |

*Each expects:* common fields; `evidence_id` referencing the detector output or
incident record. `incident.killswitch.fired` is the highest-severity verb and
should always carry enough `evidence` to reconstruct why the stop fired.

```json
{
  "event_type": "monitor.threshold.breached",
  "vendor": "google",
  "model": "gemini-1.5-pro",
  "version": "002",
  "environment": "hybrid",
  "evidence_id": "alert-2026-06-01-hallucination-rate"
}
```

---

## Lifecycle

### `checklist.published`
A governance checklist (e.g. a NIST AI RMF pack) was published or versioned.
*Expects:* common fields; `control_refs` for the controls the checklist covers.

### `key.rotated`
Beacon's signing key was rotated. The receipt is signed by the **new** key and
references the retired key fingerprint in `evidence`, so verifiers can chain
trust across the rotation.
*Expects:* common fields; previous `key_fpr` recorded in `evidence`.

```json
{
  "event_type": "key.rotated",
  "vendor": "in-house",
  "model": "beacon",
  "version": "1.0.0",
  "environment": "private_cloud",
  "evidence_id": "rotation-2026-06-01"
}
```

---

## Choosing the right verb

- Recording *what a model did* at runtime → `inference.observed`,
  `agent.*`.
- Recording *a governance decision* → `gate.evaluated` / `gate.failed`,
  `admission.allowed` / `admission.denied` (always set `decision`).
- Recording *an artifact or milestone* → `design.*`, `build.completed`,
  `eval.completed`, `checklist.published`.
- Recording *evidence packaging* → `bundle.signed`, `bundle.anchored`.
- Recording *something going wrong* → `monitor.*`, `guardrail.violated`,
  `incident.killswitch.fired`.

When in doubt, prefer the most specific verb; verifiers and Lantern group and
render receipts by `event_type`, so accurate verbs produce a clearer timeline.
