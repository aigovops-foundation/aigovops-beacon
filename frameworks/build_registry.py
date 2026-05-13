#!/usr/bin/env python3
"""
build_registry.py — AIGovOps Beacon framework registry builder.

Reads frameworks_data.csv (the research output produced by the AIGovOps
research pipeline) and emits, for every valid row:

  • frameworks/<framework_id>.yaml   — canonical YAML representation
  • frameworks/<framework_id>.xml    — mirror XML representation

Plus three indices and a JSON Schema:

  • frameworks/index.yaml
  • frameworks/index.xml
  • frameworks/index.json
  • frameworks/schema/framework.schema.json   (pre-existing, not rewritten)

The script is idempotent. Blank rows and the header row are skipped.
The `Core Controls` column is a stringified JSON array.

Usage:
    python build_registry.py --csv ../../frameworks_data.csv --out .
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from xml.dom import minidom

import yaml


# ----------------------------------------------------------------------
# Parsing helpers
# ----------------------------------------------------------------------

_STATUS_NORMALIZE = {
    "in force": "in_force",
    "in_force": "in_force",
    "enforced": "in_force",
    "effective": "in_force",
    "active": "in_force",
    "law": "in_force",
    "voluntary": "voluntary",
    "guidance": "voluntary",
    "draft": "draft",
    "proposed": "proposed",
    "consultation": "proposed",
}


def normalize_status(raw: str) -> str:
    """Map free-text statuses from research data into the schema enum."""
    key = (raw or "").strip().lower()
    for needle, value in _STATUS_NORMALIZE.items():
        if needle in key:
            return value
    return "voluntary"


_SOURCE_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_BARE_URL_RE = re.compile(r"https?://[^\s,)\]]+")


def parse_sources(raw: str) -> list[dict[str, str]]:
    """Parse the Sources column. Accepts `[title](url)` markdown or bare URLs."""
    if not raw:
        return []
    matches = _SOURCE_LINK_RE.findall(raw)
    if matches:
        return [{"title": title.strip(), "url": url.strip()} for title, url in matches]
    return [{"title": url, "url": url} for url in _BARE_URL_RE.findall(raw)]


def parse_controls(raw: str) -> list[dict[str, Any]]:
    """Parse the Core Controls column (stringified JSON array)."""
    if not raw or not raw.strip():
        return []
    text = raw.strip()
    # CSV reader already unescapes "" -> " so we can decode directly.
    try:
        controls = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not decode controls JSON: {exc}\nRaw: {text[:200]}")
    cleaned: list[dict[str, Any]] = []
    for c in controls:
        cleaned.append(
            {
                "id": str(c.get("id", "")).strip(),
                "statement": str(c.get("statement", "")).strip(),
                "evidence_types": [str(e).strip() for e in c.get("evidence_types", [])],
                "severity": str(c.get("severity", "medium")).strip().lower(),
                "weight": int(c.get("weight", 5)),
            }
        )
    return cleaned


# ----------------------------------------------------------------------
# Emitters
# ----------------------------------------------------------------------

def row_to_record(row: dict[str, str]) -> dict[str, Any]:
    fid = row["Framework ID"].strip()
    record: dict[str, Any] = {
        "framework_id": fid,
        "full_name": (row.get("Full Name") or "").strip(),
        "short_name": (row.get("Short Name") or "").strip(),
        "issuing_body": (row.get("Issuing Body") or "").strip(),
        "jurisdiction": (row.get("Jurisdiction") or "").strip(),
        "status": normalize_status(row.get("Status", "")),
        "effective_date": (row.get("Effective Date") or "").strip(),
        "scope_summary": (row.get("Scope Summary") or "").strip(),
        "primary_url": (row.get("Primary URL") or "").strip(),
        "applies_to": (row.get("Applies To") or "").strip(),
        "penalties": (row.get("Penalties") or "").strip(),
        "sources": parse_sources(row.get("Sources", "")),
        "controls": parse_controls(
            row.get(
                "Core Controls (JSON array as string: 6-10 controls each with id, statement, evidence_types, severity, weight)",
                "",
            )
        ),
        "lang": "en",
        "translations": {},
    }
    return record


def write_yaml(record: dict[str, Any], path: Path) -> None:
    path.write_text(
        yaml.safe_dump(record, sort_keys=False, allow_unicode=True, width=120),
        encoding="utf-8",
    )


def _xml_text(parent: ET.Element, tag: str, text: str) -> ET.Element:
    el = ET.SubElement(parent, tag)
    el.text = text or ""
    return el


def write_xml(record: dict[str, Any], path: Path) -> None:
    root = ET.Element(
        "framework",
        {
            "framework_id": record["framework_id"],
            "status": record["status"],
            "jurisdiction": record["jurisdiction"],
            "lang": record["lang"],
        },
    )
    _xml_text(root, "name", record["full_name"])
    _xml_text(root, "short_name", record["short_name"])
    _xml_text(root, "issuing_body", record["issuing_body"])
    _xml_text(root, "effective_date", record["effective_date"])
    _xml_text(root, "scope", record["scope_summary"])
    _xml_text(root, "primary_url", record["primary_url"])
    _xml_text(root, "applies_to", record["applies_to"])
    _xml_text(root, "penalties", record["penalties"])

    controls_el = ET.SubElement(root, "controls")
    for c in record["controls"]:
        c_el = ET.SubElement(
            controls_el,
            "control",
            {
                "id": c["id"],
                "severity": c["severity"],
                "weight": str(c["weight"]),
            },
        )
        _xml_text(c_el, "statement", c["statement"])
        et_el = ET.SubElement(c_el, "evidence_types")
        for ev in c["evidence_types"]:
            _xml_text(et_el, "type", ev)

    sources_el = ET.SubElement(root, "sources")
    for s in record["sources"]:
        ET.SubElement(
            sources_el,
            "source",
            {"url": s.get("url", ""), "title": s.get("title", "")},
        )

    # Pretty-print
    raw = ET.tostring(root, encoding="utf-8")
    pretty = minidom.parseString(raw).toprettyxml(indent="  ", encoding="utf-8")
    path.write_bytes(pretty)


def control_weight_total(record: dict[str, Any]) -> int:
    return sum(int(c.get("weight", 0)) for c in record.get("controls", []))


def write_indices(records: list[dict[str, Any]], out_dir: Path) -> None:
    summary = [
        {
            "framework_id": r["framework_id"],
            "short_name": r["short_name"],
            "status": r["status"],
            "jurisdiction": r["jurisdiction"],
            "control_count": len(r["controls"]),
            "max_weight": control_weight_total(r),
        }
        for r in records
    ]

    (out_dir / "index.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out_dir / "index.yaml").write_text(
        yaml.safe_dump(summary, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )

    root = ET.Element("frameworks", {"count": str(len(summary))})
    for item in summary:
        ET.SubElement(root, "framework", {k: str(v) for k, v in item.items()})
    raw = ET.tostring(root, encoding="utf-8")
    pretty = minidom.parseString(raw).toprettyxml(indent="  ", encoding="utf-8")
    (out_dir / "index.xml").write_bytes(pretty)


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def build(csv_path: Path, out_dir: Path) -> tuple[int, list[str]]:
    records: list[dict[str, Any]] = []
    failures: list[str] = []

    with csv_path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            fid = (row.get("Framework ID") or "").strip()
            if not fid:
                continue
            try:
                record = row_to_record(row)
                if not record["controls"]:
                    failures.append(f"{fid}: no controls parsed")
                    continue
                records.append(record)
                write_yaml(record, out_dir / f"{fid}.yaml")
                write_xml(record, out_dir / f"{fid}.xml")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{fid}: {exc}")

    write_indices(records, out_dir)
    return len(records), failures


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--csv", default="../../frameworks_data.csv", help="Path to frameworks_data.csv")
    p.add_argument("--out", default=".", help="Output directory (default: frameworks/)")
    args = p.parse_args(argv)

    csv_path = Path(args.csv).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    n, failures = build(csv_path, out_dir)
    print(f"Wrote {n} frameworks to {out_dir}")
    if failures:
        print("Failures:")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
