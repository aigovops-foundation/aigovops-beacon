#!/usr/bin/env python3
"""
checklist/wizard.py — Interactive manual-mode CLI.

Loads the 23 frameworks from the registry, walks the operator through
every control with `[y/n/skip/notes]` prompts, and turns every answer
into a signed receipt appended to ~/.beacon/receipts/.

At the end, runs scoring/engine.py against the new receipts and prints
the resulting org_ai_risk_index — closing the loop between manual mode
and the beacon-augmented mode.

Usage:
    python wizard.py                           # walk every framework
    python wizard.py --framework nist-ai-rmf   # one framework only
    python wizard.py --non-interactive         # smoke test (auto-yes)
    python wizard.py --no-score                # skip the scoring pass
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from pathlib import Path
from typing import Any

import yaml

# Make sibling packages importable
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "beacons"))
sys.path.insert(0, str(ROOT / "scoring"))

from _common import append_receipt, make_receipt, sign_receipt  # noqa: E402
import engine as scoring_engine  # noqa: E402


def load_frameworks(frameworks_dir: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path in sorted(glob.glob(str(frameworks_dir / "*.yaml"))):
        if os.path.basename(path) == "index.yaml":
            continue
        out.append(yaml.safe_load(Path(path).read_text(encoding="utf-8")))
    return out


def prompt(text: str, auto: str | None) -> str:
    if auto is not None:
        return auto
    try:
        return input(text).strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return "skip"


def ask_one_control(
    framework: dict[str, Any],
    control: dict[str, Any],
    auto: str | None,
) -> dict[str, Any] | None:
    fid = framework["framework_id"]
    cid = control["id"]
    sev = control.get("severity", "medium")
    weight = control.get("weight", 5)

    print("─" * 78)
    print(f"  {fid} :: {cid}   [severity={sev}, weight={weight}]")
    print(f"  {control['statement']}")
    if control.get("evidence_types"):
        print(f"  Suggested evidence: {', '.join(control['evidence_types'][:5])}")
    while True:
        answer = prompt("  [y/n/skip/notes] > ", auto)
        if answer in ("y", "yes"):
            mapped = "yes"; break
        if answer in ("n", "no"):
            mapped = "no"; break
        if answer in ("s", "skip", ""):
            mapped = "skip"; break
        if answer in ("notes", "note"):
            note = prompt("  notes > ", "" if auto is not None else None)
            mapped = "notes"
            break
        print("  (use y, n, skip, or notes)")
    if mapped == "skip":
        return None
    notes_text = ""
    if mapped == "notes":
        notes_text = prompt("  add a note > ", "auto-yes (smoke test)" if auto is not None else None)
        mapped = "yes"  # notes implies present

    receipt = make_receipt(
        event_type="gate.evaluated" if mapped == "yes" else "gate.failed",
        subject=f"control://{fid}/{cid}",
        action="checklist.answered",
        evidence={
            "framework_id": fid,
            "control_id": cid,
            "evidence_types": control.get("evidence_types", []),
            "answer": mapped,
            "severity": sev,
            "weight": weight,
            "notes": notes_text,
        },
    )
    receipt["answer"] = mapped  # surfaced for the scoring engine
    sign_receipt(receipt)
    append_receipt(receipt)
    return receipt


def run_wizard(
    frameworks_dir: Path,
    only: str | None,
    non_interactive: bool,
    max_controls: int | None,
) -> int:
    frameworks = load_frameworks(frameworks_dir)
    if only:
        frameworks = [f for f in frameworks if f["framework_id"] == only]
        if not frameworks:
            print(f"No such framework: {only}", file=sys.stderr)
            return 2
    auto = "y" if non_interactive else None

    asked = 0
    for f in frameworks:
        print()
        print("═" * 78)
        print(f"  {f['short_name']}  —  {f['full_name']}")
        print(f"  {f['jurisdiction']}  ·  {f['status']}")
        print("═" * 78)
        for c in f.get("controls", []):
            ask_one_control(f, c, auto)
            asked += 1
            if max_controls and asked >= max_controls:
                print(f"\n[wizard] stopped after {asked} controls (--max-controls)")
                return asked
    return asked


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--frameworks", type=Path, default=ROOT / "frameworks")
    p.add_argument("--framework", help="Restrict to one framework_id")
    p.add_argument("--non-interactive", action="store_true",
                   help="Auto-answer 'yes' (smoke test only)")
    p.add_argument("--max-controls", type=int, help="Stop after N controls (smoke test)")
    p.add_argument("--no-score", action="store_true", help="Skip the final scoring pass")
    args = p.parse_args(argv)

    print("AIGovOps Beacon — manual checklist wizard")
    print("Receipts will be appended to ~/.beacon/receipts/<date>.ndjson")
    print()

    asked = run_wizard(args.frameworks, args.framework, args.non_interactive, args.max_controls)
    print(f"\n[wizard] {asked} controls reviewed.")
    if args.no_score:
        return 0

    receipts_dir = Path.home() / ".beacon" / "receipts"
    mapping = ROOT / "scoring" / "mapping.yaml"
    report = scoring_engine.run(receipts_dir, args.frameworks, mapping)
    print(f"\n[wizard] org_ai_risk_index = {report['org_ai_risk_index']}")
    print(f"[wizard] receipts in bundle: {report['receipt_count']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
