#!/usr/bin/env python3
"""verify.py — End-to-end verification of the Beacon v2 build."""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent

def header(s):
    print()
    print(f"### {s}")
    print("─" * 78)

def main() -> int:
    failures: list[str] = []

    header("YAML parse check")
    yamls = sorted(glob.glob(str(ROOT / "frameworks" / "*.yaml")))
    yamls += sorted(glob.glob(str(ROOT / "frameworks" / "translations" / "*" / "*.yaml")))
    yamls += sorted(glob.glob(str(ROOT / "scoring" / "*.yaml")))
    for p in yamls:
        try:
            yaml.safe_load(open(p, encoding="utf-8"))
        except yaml.YAMLError as e:
            failures.append(f"YAML parse failed: {p}: {e}")
    print(f"  parsed {len(yamls)} YAML files")

    header("XML parse check")
    xmls = sorted(glob.glob(str(ROOT / "frameworks" / "*.xml")))
    for p in xmls:
        try:
            ET.parse(p)
        except ET.ParseError as e:
            failures.append(f"XML parse failed: {p}: {e}")
    print(f"  parsed {len(xmls)} XML files")

    header("JSON parse check")
    jsons = sorted(glob.glob(str(ROOT / "frameworks" / "*.json")))
    jsons += sorted(glob.glob(str(ROOT / "frameworks" / "schema" / "*.json")))
    for p in jsons:
        try:
            json.load(open(p, encoding="utf-8"))
        except json.JSONDecodeError as e:
            failures.append(f"JSON parse failed: {p}: {e}")
    print(f"  parsed {len(jsons)} JSON files")

    header("frameworks/index.json must have 23 entries")
    idx = json.load(open(ROOT / "frameworks" / "index.json", encoding="utf-8"))
    print(f"  index.json count = {len(idx)}")
    if len(idx) != 23:
        failures.append(f"index.json has {len(idx)} entries, expected 23")

    header("Scoring engine end-to-end")
    sample = ROOT / "scoring" / "sample_receipts.ndjson"
    out = ROOT / "scoring" / "verify_report.json"
    subprocess.run([
        sys.executable, str(ROOT / "scoring" / "engine.py"),
        "--receipts", str(sample),
        "--frameworks", str(ROOT / "frameworks"),
        "--mapping", str(ROOT / "scoring" / "mapping.yaml"),
        "--out", str(out),
        "--quiet",
    ], check=True)
    report = json.load(open(out, encoding="utf-8"))
    print(f"  org_ai_risk_index = {report['org_ai_risk_index']}")
    print(f"  receipts ingested = {report['receipt_count']}")
    print(f"  frameworks scored = {len(report['frameworks'])}")

    header("Checklist wizard smoke test (non-interactive)")
    res = subprocess.run([
        sys.executable, str(ROOT / "checklist" / "wizard.py"),
        "--non-interactive", "--max-controls", "1", "--no-score",
    ], capture_output=True, text=True)
    if res.returncode != 0:
        failures.append(f"wizard smoke test failed: {res.stderr}")
    else:
        print(f"  wizard returncode={res.returncode}, accepted 1 answer")

    header("File counts by directory")
    counts: dict[str, int] = {}
    for sub in ("frameworks", "frameworks/schema", "frameworks/translations/es",
                "frameworks/translations/ar", "beacons", "beacons/systemd",
                "scoring", "checklist", "i18n"):
        files = [p for p in (ROOT / sub).glob("*") if p.is_file()]
        counts[sub] = len(files)
        for f in sorted(files):
            print(f"  {sub}/{f.name}")
    print()
    print("--- summary ---")
    total = 0
    for k, v in counts.items():
        print(f"  {k:35} {v} files")
        total += v
    print(f"  {'TOTAL':35} {total} files")

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
