#!/usr/bin/env python3
"""
_synthetic.py — Generate a realistic synthetic receipt batch.

Used to produce scoring/sample_report.md. The batch mimics what a
mid-maturity org might emit in its first month: governance docs are
covered, lifecycle and monitoring are partly covered, incident-response
and post-market-surveillance are mostly gaps.

Usage:
    python _synthetic.py --out sample_receipts.ndjson
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# A curated subset — these are the evidence types a maturing org tends
# to have first. Tuned to produce a believable ~55-70 score range across
# the heavyweight frameworks while leaving room for gaps.
PRESENT_EVIDENCE_TYPES = [
    "governance_policy", "governance_charter", "board_minutes", "code_of_conduct",
    "risk_management_policy", "risk_register", "risk_assessment", "risk_criteria",
    "impact_assessment", "fundamental_rights_impact_assessment",
    "control_framework", "control_matrix", "control_implementation_records",
    "ai_policy", "data_inventory", "data_governance_policy",
    "privacy_notice", "user_notice", "public_disclosure",
    "model_card", "system_description", "context_analysis",
    "training_records", "training_materials",
    "test_plan", "test_results", "validation_records",
    "monitoring_reports", "kpi_dashboards",
    "access_reviews", "change_management_logs", "it_general_controls",
    "audit_trail", "decision_logs",
    "human_oversight_procedure", "human_review_records",
    "stakeholder_register", "consultation_records",
    "documentation", "technical_documentation",
    "RACI_matrix", "owner_assignments",
    "vendor_assessment", "third_party_review",
    "process_maps", "policy_document",
]

# Conspicuously missing so the gaps section reads like a real audit.
MISSING_EVIDENCE_TYPES = [
    "incident_log", "incident_register", "post_market_surveillance_report",
    "regulatory_notification", "appeals_process",
    "redress_mechanism", "bias_audit",
    "conformity_assessment", "ce_marking_evidence",
    "penetration_test_report", "red_team_report",
]


def build(out: Path) -> int:
    receipts: list[dict] = []
    for i, ev in enumerate(PRESENT_EVIDENCE_TYPES):
        receipts.append({
            "id": f"01HXSYN{i:04d}",
            "ts_utc": "2026-05-13T14:00:00.000Z",
            "user": {"sub": "auditor@aigovopsfoundation.org", "email": "auditor@aigovopsfoundation.org", "oidc_issuer": "local"},
            "vendor": "in-house",
            "model": "n/a",
            "version": "n/a",
            "prompt": None,
            "prompt_hash": "sha256:" + "0" * 64,
            "result": None,
            "result_hash": "sha256:" + "0" * 64,
            "event_type": "gate.evaluated",
            "environment": "on_prem",
            "subject": f"evidence://{ev}",
            "action": "checklist.answered",
            "evidence_meta": {"evidence_types": [ev], "answer": "yes"},
            "evidence_sha256": "sha256:" + "0" * 64,
        })
    out.write_text("\n".join(json.dumps(r) for r in receipts) + "\n", encoding="utf-8")
    return len(receipts)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--out", type=Path, default=Path("sample_receipts.ndjson"))
    args = p.parse_args(argv)
    n = build(args.out)
    print(f"Wrote {n} synthetic receipts to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
