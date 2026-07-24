# AiGovOps Beacon — example Rego policy
# Pairs with policies/gates/example.yaml.
#
# Purpose: enforce that any container deployed for a high-risk AI use case
#   1. has a SLSA v1.0 build provenance attestation,
#   2. has an eval attestation showing all suites passed,
#   3. has a fresh signed model card,
#   4. references a valid design approval receipt as its lineage parent.
#
# Inputs (provided by Conftest):
#   data.evals      — content of evals.json
#   data.sbom       — content of sbom.cdx.json
#   data.receipts   — array of Beacon receipts for this build
#   data.usecase    — content of usecases/<name>.yaml
#
# Conftest convention: any rule under `deny[msg]` that produces a message
# fails the gate.

package aigovops.gate

import future.keywords.if
import future.keywords.in

# ----- helpers -----

risk_tier := data.usecase.risk_tier

high_risk if risk_tier == "high"

receipt_of_type(t) := r if {
    some r in data.receipts
    r.event_type == t
}

# ----- rules -----

deny[msg] {
    high_risk
    not receipt_of_type("design.approved")
    msg := sprintf("high-risk use case '%s' has no design.approved receipt", [data.usecase.id])
}

deny[msg] {
    not receipt_of_type("build.completed")
    msg := "missing build.completed receipt (no SLSA provenance attached)"
}

deny[msg] {
    r := receipt_of_type("eval.completed")
    some suite in ["safety","bias","perf"]
    suite_result := data.evals.suites[suite].result
    suite_result != "pass"
    msg := sprintf("eval suite '%s' did not pass: %s", [suite, suite_result])
}

deny[msg] {
    high_risk
    not receipt_of_type("eval.completed")
    redteam_result := data.evals.suites.redteam.result
    redteam_result != "pass"
    msg := sprintf("high-risk system requires passing red-team eval; got: %s", [redteam_result])
}

deny[msg] {
    not data.usecase.model_card
    msg := "use-case manifest does not reference a model card"
}

deny[msg] {
    not data.usecase.data_sheet
    msg := "use-case manifest does not reference a data sheet"
}

# Lineage: every receipt must chain to the design approval
deny[msg] {
    r := receipt_of_type("gate.evaluated")
    not r.parent_receipt_id
    msg := "gate.evaluated receipt has no parent_receipt_id — lineage broken"
}

# Signature canonical form must be RFC 8785 JCS
deny[msg] {
    some r in data.receipts
    r.signature.canonical_form != "json/c14n-rfc8785"
    msg := sprintf("receipt %s uses non-canonical form '%s'", [r.id, r.signature.canonical_form])
}

# Signing algorithm must be Ed25519 (profile requirement)
deny[msg] {
    some r in data.receipts
    r.signature.alg != "Ed25519"
    msg := sprintf("receipt %s uses non-Ed25519 algorithm '%s'", [r.id, r.signature.alg])
}

# Never deploy with model version 'latest'
deny[msg] {
    some r in data.receipts
    r.event_type == "inference.observed"
    r.version == "latest"
    msg := "receipts reference model version 'latest' — must pin a version"
}
