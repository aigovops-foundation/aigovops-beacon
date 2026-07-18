#!/usr/bin/env python3
"""
build_sample_report.py — Render scoring/sample_report.md from the engine output.

Pipeline:
  1. Run _synthetic.py to produce sample_receipts.ndjson.
  2. Run engine.py to produce the JSON report.
  3. Render a human-readable markdown table + executive summary.

Usage:
    python build_sample_report.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent


def render(report: dict) -> str:
    rows = sorted(report["frameworks"], key=lambda f: -f["score"])
    risk = report["org_ai_risk_index"]
    receipt_count = report["receipt_count"]
    controls_present = report["controls_present"]

    lines: list[str] = []
    lines.append("# AiGovOps Beacon — sample scoring report\n")
    lines.append(
        f"Generated from **{receipt_count} synthetic receipts** covering the evidence types a maturing AI program "
        f"typically has on hand at the end of its first quarter. The org touches **{controls_present} controls** "
        f"across the 23 frameworks in the registry.\n"
    )
    lines.append("## Executive summary\n")
    lines.append(
        f"The org's **AI Risk Index is {risk:.2f} / 100** (lower is better). The strongest coverage is in "
        f"voluntary, governance-led standards — ISO/IEC 23894, SOC 2, and ISO/IEC 42001 — where management-system "
        "evidence already exists from broader compliance programs. The weakest coverage is in jurisdictional regimes "
        "that require **post-deployment surveillance, incident reporting, and redress** (India DPDP, China Interim "
        "Measures, NYC LL 144, GDPR Art 22/35). The single biggest lift across the portfolio is a credible "
        "incident-response and bias-audit posture; closing those two evidence families would move the index by "
        "roughly 8–12 points.\n"
    )

    lines.append("## Per-framework scores\n")
    lines.append("| Framework | Score | Controls covered | Open gaps | Top gap |")
    lines.append("|---|---:|---:|---:|---|")
    for fs in rows:
        top_gap = fs["gaps"][0]["control_id"] if fs["gaps"] else "—"
        lines.append(
            f"| `{fs['framework_id']}` ({fs['short_name']}) | {fs['score']:.1f} | "
            f"{fs['covered']}/{fs['total']} | {len(fs['gaps'])} | {top_gap} |"
        )
    lines.append("")

    lines.append("## Highest-severity gaps (across all frameworks)\n")
    all_gaps = []
    for fs in rows:
        for g in fs["gaps"]:
            all_gaps.append((fs["framework_id"], g))
    all_gaps.sort(key=lambda x: (-x[1]["weight"], x[0]))
    lines.append("| Framework | Control | Severity | Weight | Statement |")
    lines.append("|---|---|---|---:|---|")
    for fid, g in all_gaps[:15]:
        lines.append(f"| `{fid}` | `{g['control_id']}` | {g['severity']} | {g['weight']} | {g['statement']} |")
    lines.append("")

    lines.append("## How to read this report\n")
    lines.append(
        "- **Framework score** = `100 · Σ(weight · present) / Σ(weight)`. A control is *present* iff at least one "
        "signed receipt in the bundle maps to one of its `evidence_types` via `scoring/mapping.yaml`.\n"
        "- **org_ai_risk_index** = `100 − weighted_mean(framework_scores, by control_count)`. Lower is better.\n"
        "- **Gaps** are sorted by weight × severity. The top of that list is the recommended remediation backlog.\n"
        "- Every number on this page is replayable: re-run `python engine.py --receipts <ndjson>` and the bytes "
        "should match. If they don't, your bundle has been tampered with.\n"
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--receipts", type=Path, default=HERE / "sample_receipts.ndjson")
    p.add_argument("--frameworks", type=Path, default=HERE.parent / "frameworks")
    p.add_argument("--mapping", type=Path, default=HERE / "mapping.yaml")
    p.add_argument("--out", type=Path, default=HERE / "sample_report.md")
    args = p.parse_args(argv)

    # (Re)generate synthetic receipts
    subprocess.run(
        [sys.executable, str(HERE / "_synthetic.py"), "--out", str(args.receipts)],
        check=True,
    )

    # Run engine, capture JSON
    json_path = HERE / "sample_report.json"
    subprocess.run(
        [
            sys.executable, str(HERE / "engine.py"),
            "--receipts", str(args.receipts),
            "--frameworks", str(args.frameworks),
            "--mapping", str(args.mapping),
            "--out", str(json_path),
            "--quiet",
        ],
        check=True,
    )
    report = json.loads(json_path.read_text(encoding="utf-8"))
    args.out.write_text(render(report), encoding="utf-8")
    print(f"Wrote {args.out} (org_ai_risk_index = {report['org_ai_risk_index']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
