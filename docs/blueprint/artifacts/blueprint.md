# AIGovOps Beacon — Reference Architecture Blueprint v1.0

> **Authority of this document:** advisory under the AIGovOps Foundation.
> The [OVERT 1.0 specification](https://overt.is/) is normative for the
> evidence envelope. Where this blueprint diverges, OVERT wins.
> _Agents do the bureaucracy; humans hold moral legitimacy._

## Purpose

A reference architecture for embedding AI governance — automated evidence
collection, cryptographic audit logging, data and model lineage, and
Policy-as-Code guardrails — into a modern GitHub-native CI/CD pipeline.
One shared evidence model that policy and engineering teams both write
against. Auditor-ready by construction.

## Six principles

1. **Evidence is the product.** Every governance decision emits a signed receipt.
2. **One shared schema.** Policy and engineering write against the same OVERT envelope.
3. **Policy lives in the repo.** Rego, gate YAML, and crosswalks are committed code.
4. **Pipelines are the perimeter.** The only path to production is the signed pipeline.
5. **Lineage is automatic.** Datasets, prompts, models, and outputs are linked by hash.
6. **Humans hold legitimacy.** Exceptions and key rotations require a named human approver.

## Three lifecycle stages

### 1. Design

- Use-case intake (YAML manifest, risk classification via OPA)
- Data sheet + model card (Markdown, hashed)
- Threat model + red-team plan (auto-generated from risk tier)
- Design review (named approvers sign `design.approved`)

Controls satisfied: **NIST AI RMF** MAP-1.1, MAP-2.1, MAP-3.4, MAP-4.1, GOVERN-1.2 ·
**ISO/IEC 42001** 6.1.2, 6.1.4, A.6.2.2 ·
**EU AI Act** Art. 9, Art. 11 + Annex IV, Art. 27.

### 2. Deployment

```
commit → build + SBOM → eval suite → policy gate → cosign sign → admission
```

- Commit: gitsign + Sigstore
- Build: GitHub Actions, OIDC to cloud, SLSA v1.0 provenance
- SBOM: Syft / cdxgen, CycloneDX 1.6
- Eval: pytest + DeepEval + Garak + OWASP LLM red-team
- Gate: OPA / Conftest + Beacon checklist runner (emits `gate.evaluated`)
- Sign: cosign keyless (Fulcio + Rekor)
- Admit: Kyverno / Gatekeeper / Connaisseur

Controls satisfied: **NIST AI RMF** MEASURE-2.3, MEASURE-2.7, MEASURE-2.11, MANAGE-1.3, MANAGE-2.2 ·
**ISO/IEC 42001** 8.2, 8.3, A.6.2.5, A.8.2 ·
**EU AI Act** Art. 15, 17, 18, 43 · **SLSA v1.0** Build L2–L3.

### 3. Operations

- OVERT-shaped `inference.observed` receipts per call
- Hourly Merkle anchor to Rekor (or internal transparency log)
- Drift + safety monitors emit `monitor.threshold.breached`
- Incident + kill switch are themselves signed receipts
- Continuous re-evaluation against deployment policy

Controls satisfied: **NIST AI RMF** MEASURE-2.8, MEASURE-3.1, MEASURE-4.1, MANAGE-2.3, MANAGE-4.1, MANAGE-4.3 ·
**ISO/IEC 42001** 9.1, 10.2, A.6.2.7 ·
**EU AI Act** Art. 14, 19, 26, 72, 73.

## Shared evidence model

Beacon receipts are **OVERT 1.0 envelopes** with the `aigovops-beacon.v1`
profile. Required envelope fields: `id`, `ts_utc`, `user`, `vendor`,
`model`, `version`, `prompt_hash`, `result_hash`, `event_type`,
`environment`, `signature`. Signature is Ed25519 over RFC 8785 JCS form.

Profile extensions add `control_refs` (cross-framework IDs), `subject`
(what was governed, by content hash), `lineage` (OpenLineage run + parent
datasets/models), and `decision` (gate verdict).

Receipts chain by `parent_receipt_id`:

```
design.approved
  └─ build.completed
       └─ eval.completed
            └─ gate.evaluated (pass)
                 └─ bundle.signed
                      └─ admission.allowed
                           └─ inference.observed × N
                                └─ monitor.drift.detected
                                     └─ gate.evaluated (re-eval)
```

## Infrastructure requirements

### Tier 1 — minimum viable

- **Source:** GitHub org, branch protection, required reviews, signed commits.
- **Build:** GitHub-hosted runners, OIDC to cloud (no long-lived secrets).
- **Signing:** Sigstore keyless or cloud KMS (AWS/GCP/Azure).
- **Artifact registry:** GHCR or any OCI registry with referrers.
- **Evidence store:** S3 / GCS with object lock + NDJSON receipts.
- **Policy engine:** OPA / Conftest in CI; Kyverno or Gatekeeper at admission.
- **Lineage:** OpenLineage → self-hosted Marquez on a single VM.
- **Transparency:** Public Rekor or self-hosted; anchors to S3.

### Tier 2 — scaled enterprise

- Self-hosted ARC runners in isolated VPC; reproducible builds.
- HSM-backed KMS with split-key custody; private Fulcio CA.
- Harbor / Artifactory with vulnerability scanning.
- WORM bucket per business unit + cross-region replication; 7-year retention.
- Centralized OPA cluster + bundle service.
- Managed OpenLineage backend (DataHub / Astronomer).
- Private Rekor + dual anchoring for high-risk systems.
- Receipt stream feeds SIEM/SOAR for EU AI Act Art. 73 incident reporting.

## Repository layout

```
aigovops-beacon/
├── crosswalks/             # policy team owns
│   ├── nist-ai-rmf.yaml
│   ├── iso-42001.yaml
│   └── eu-ai-act.yaml
├── policies/               # joint ownership
│   ├── gates/              # YAML (policy team)
│   └── rego/               # Rego (eng team)
├── usecases/               # product owners
├── modelcards/             # ML team
├── datasheets/             # data team
├── attestations/           # generated, signed
└── .github/workflows/
    ├── design-review.yml
    ├── build-sign-attest.yml
    └── evidence-bundle.yml
```

## Collaboration rituals

1. **Crosswalk PRs.** Policy team maps regulatory clauses to receipt fields. CI fails if a clause references a field that does not exist.
2. **Matched-pair commits.** Every gate YAML ships in the same PR as its Rego counterpart. Conftest verifies they agree.
3. **Exception receipts.** When a gate fails and business needs release, a named approver signs an `exception.granted` receipt with TTL.
4. **Quarterly bundle review.** Policy and eng leads jointly export the quarter's bundle and verify with the auditor CLI.

## Auditor-ready outputs

- **`bundle.tar.gz`** — all receipts for a system over a window, the crosswalk used, the policies that ran, model + data cards, manifest with Merkle roots.
- **`beacon-verify`** — a 200-line Go binary the auditor runs themselves. Re-hashes, checks signatures, walks Merkle tree, prints pass/fail per control.
- **`crosswalk-report.html`** — per-control table with links to the exact receipts that satisfy each clause.

Total time from "give me your evidence" to first auditor opinion: hours.

## Files in this artifacts folder

| File | Purpose |
|------|---------|
| `govern.yml` | Drop-in GitHub Actions workflow |
| `receipt.schema.json` | JSON Schema for the shared evidence model |
| `example.rego` | Sample Rego policy enforcing the baseline gate |
| `gate.example.yaml` | Matched-pair YAML for the Rego policy |
| `crosswalk.nist-ai-rmf.yaml` | NIST AI RMF control → receipt mapping |
| `blueprint.md` | This document |
