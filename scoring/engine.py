#!/usr/bin/env python3
"""
scoring/engine.py — Risk scoring engine for AIGovOps Beacon.

Reads NDJSON receipts, maps their subjects/evidence_types to controls
via mapping.yaml, then computes:

    framework_score(F) = 100 * Σ_{c ∈ F} (w_c · present_c) / Σ_{c ∈ F} w_c

    org_ai_risk_index = 100 - weighted_mean(framework_scores,
                                            weights = control_count)

A control is `present` if any receipt's `evidence_types` (or
`evidence_meta.evidence_type`, or its bare `action` token) resolves to
that control via the mapping.

Usage:
    python engine.py --receipts ~/.beacon/receipts --frameworks ../frameworks \
        --mapping mapping.yaml --out report.json
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

import yaml


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_frameworks(frameworks_dir: Path) -> dict[str, dict[str, Any]]:
    """Return framework_id -> framework record."""
    out: dict[str, dict[str, Any]] = {}
    for path in glob.glob(str(frameworks_dir / "*.yaml")):
        if os.path.basename(path) == "index.yaml":
            continue
        rec = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        out[rec["framework_id"]] = rec
    return out


def load_mapping(mapping_path: Path) -> dict[str, list[str]]:
    return yaml.safe_load(mapping_path.read_text(encoding="utf-8")) or {}


def iter_receipts(receipts_path: Path) -> Iterable[dict[str, Any]]:
    if receipts_path.is_dir():
        files = sorted(receipts_path.glob("*.ndjson"))
    else:
        files = [receipts_path]
    for f in files:
        with f.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


# ---------------------------------------------------------------------------
# Evidence extraction
# ---------------------------------------------------------------------------

def evidence_types_from_receipt(receipt: dict[str, Any]) -> list[str]:
    """Pull the set of evidence_type strings a single receipt asserts.

    Receipts produced by the checklist wizard carry an explicit
    `evidence_meta.evidence_types` list. Beacon receipts may carry a
    single inferred type in `evidence_meta.evidence_type`. We also
    accept a bare `evidence_types` field on the receipt root.
    """
    meta = receipt.get("evidence_meta") or {}
    types: set[str] = set()
    for key in ("evidence_types", "evidence_type"):
        v = meta.get(key)
        if isinstance(v, list):
            types.update(str(x) for x in v)
        elif isinstance(v, str):
            types.add(v)
    v = receipt.get("evidence_types")
    if isinstance(v, list):
        types.update(str(x) for x in v)
    return sorted(types)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def compute_present_controls(
    receipts: Iterable[dict[str, Any]],
    mapping: dict[str, list[str]],
) -> set[str]:
    present: set[str] = set()
    for r in receipts:
        # Negative receipts (manual "no" answers) do not count as present
        if r.get("answer") == "no" or (r.get("evidence_meta") or {}).get("answer") == "no":
            continue
        for ev in evidence_types_from_receipt(r):
            for fc in mapping.get(ev, []):
                present.add(fc)
    return present


def score_framework(framework: dict[str, Any], present: set[str]) -> dict[str, Any]:
    fid = framework["framework_id"]
    controls = framework.get("controls", [])
    total_w = sum(int(c.get("weight", 0)) for c in controls)
    if total_w == 0:
        return {
            "framework_id": fid,
            "short_name": framework.get("short_name", fid),
            "score": 0.0,
            "covered": 0,
            "total": len(controls),
            "max_weight": 0,
            "gaps": [],
        }
    covered_w = 0
    covered = 0
    gaps: list[dict[str, Any]] = []
    for c in controls:
        key = f"{fid}.{c['id']}"
        w = int(c.get("weight", 0))
        if key in present:
            covered_w += w
            covered += 1
        else:
            gaps.append(
                {
                    "control_id": c["id"],
                    "statement": c["statement"][:160],
                    "severity": c.get("severity", "medium"),
                    "weight": w,
                }
            )
    return {
        "framework_id": fid,
        "short_name": framework.get("short_name", fid),
        "score": round(100.0 * covered_w / total_w, 2),
        "covered": covered,
        "total": len(controls),
        "max_weight": total_w,
        "covered_weight": covered_w,
        "gaps": gaps,
    }


def org_ai_risk_index(framework_scores: list[dict[str, Any]]) -> float:
    total = sum(fs["total"] for fs in framework_scores)
    if total == 0:
        return 100.0
    weighted = sum(fs["score"] * fs["total"] for fs in framework_scores)
    weighted_mean_score = weighted / total
    return round(100.0 - weighted_mean_score, 2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(
    receipts_path: Path,
    frameworks_dir: Path,
    mapping_path: Path,
) -> dict[str, Any]:
    frameworks = load_frameworks(frameworks_dir)
    mapping = load_mapping(mapping_path)
    receipts = list(iter_receipts(receipts_path))
    present = compute_present_controls(receipts, mapping)

    scores = [score_framework(f, present) for f in sorted(frameworks.values(), key=lambda x: x["framework_id"])]
    risk = org_ai_risk_index(scores)
    return {
        "receipt_count": len(receipts),
        "evidence_type_count": len({ev for r in receipts for ev in evidence_types_from_receipt(r)}),
        "controls_present": len(present),
        "frameworks": scores,
        "org_ai_risk_index": risk,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--receipts", type=Path, default=Path.home() / ".beacon" / "receipts")
    p.add_argument("--frameworks", type=Path, default=Path(__file__).parent.parent / "frameworks")
    p.add_argument("--mapping", type=Path, default=Path(__file__).parent / "mapping.yaml")
    p.add_argument("--out", type=Path, help="Write JSON report to this path")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = run(args.receipts, args.frameworks, args.mapping)
    if args.out:
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not args.quiet:
        print(f"Receipts            : {report['receipt_count']}")
        print(f"Distinct evidence   : {report['evidence_type_count']}")
        print(f"Controls present    : {report['controls_present']}")
        print(f"org_ai_risk_index   : {report['org_ai_risk_index']}")
        print()
        print(f"{'framework_id':30}  {'score':>6}  {'covered':>9}  {'gaps':>5}")
        for fs in report["frameworks"]:
            print(f"{fs['framework_id']:30}  {fs['score']:>6.2f}  {fs['covered']:>3}/{fs['total']:<5}  {len(fs['gaps']):>5}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
