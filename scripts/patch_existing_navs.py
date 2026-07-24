"""
Group D — surgical edits to existing Beacon pages.

Adds a "Framework Lab" link to each existing page's nav. Also adds a Framework
Lab section to docs/index.html footer.

Idempotent: re-running over already-patched files yields no changes (with a
warning on stdout).

Run from the staged tree (docs/* must already be copies of the live repo):
  python3 scripts/patch_existing_navs.py
"""

from __future__ import annotations
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

PATCHES = [
    {
        "path": DOCS / "index.html",
        "label": "docs/index.html — main nav + footer",
        "edits": [
            (
                # 1) Nav link
                '        <a href="./quiz.html" class="btn-ghost btn-sm desktop-only">Practitioner Quiz</a>\n'
                '        <a href="./downloads/aigovops-beacon-starter.zip" class="btn-primary btn-sm" download>Get the zip</a>',
                '        <a href="./quiz.html" class="btn-ghost btn-sm desktop-only">Practitioner Quiz</a>\n'
                '        <a href="./lab.html" class="btn-ghost btn-sm desktop-only">Framework Lab</a>\n'
                '        <a href="./downloads/aigovops-beacon-starter.zip" class="btn-primary btn-sm" download>Get the zip</a>',
            ),
            (
                # 2) Footer — add Framework Lab section after Framework section
                '        <div>\n'
                '          <strong>Framework</strong>\n'
                '          <ul>\n'
                '            <li><a href="./downloads/aigovops-audit-framework.pdf" download>Combined PDF</a></li>\n'
                '            <li><a href="./downloads/AI_Model_Inventory_Template.xlsx" download>Inventory template</a></li>\n'
                '            <li><a href="https://github.com/bobrapp/aigovops-beacon/tree/main/checklists" target="_blank" rel="noopener">YAML checklists ↗</a></li>\n'
                '          </ul>\n'
                '        </div>',
                '        <div>\n'
                '          <strong>Framework</strong>\n'
                '          <ul>\n'
                '            <li><a href="./downloads/aigovops-audit-framework.pdf" download>Combined PDF</a></li>\n'
                '            <li><a href="./downloads/AI_Model_Inventory_Template.xlsx" download>Inventory template</a></li>\n'
                '            <li><a href="https://github.com/bobrapp/aigovops-beacon/tree/main/checklists" target="_blank" rel="noopener">YAML checklists ↗</a></li>\n'
                '          </ul>\n'
                '        </div>\n'
                '        <div>\n'
                '          <strong>Framework Lab</strong>\n'
                '          <ul>\n'
                '            <li><a href="./lab.html">Lab hub</a></li>\n'
                '            <li><a href="./lab-100.html">Level 100 — 30-min flow</a></li>\n'
                '            <li><a href="./lab-200.html">Level 200 — Suitcase + deep-dive</a></li>\n'
                '            <li><a href="./downloads/lab-worksheet-100.pdf" download>Worksheet 100 (PDF)</a></li>\n'
                '            <li><a href="./downloads/lab-worksheet-200.pdf" download>Worksheet 200 (PDF)</a></li>\n'
                '            <li><a href="./howibuilt.html">How I Built This</a></li>\n'
                '          </ul>\n'
                '        </div>',
            ),
        ],
    },
    {
        "path": DOCS / "video" / "index.html",
        "label": "docs/video/index.html — nav",
        "edits": [
            (
                '        <a href="../index.html#run" class="btn-ghost btn-sm desktop-only">Run it</a>\n'
                '        <a href="../downloads/aigovops-beacon-starter.zip" class="btn-primary btn-sm" download>Get the zip</a>',
                '        <a href="../index.html#run" class="btn-ghost btn-sm desktop-only">Run it</a>\n'
                '        <a href="../lab.html" class="btn-ghost btn-sm desktop-only">Framework Lab</a>\n'
                '        <a href="../downloads/aigovops-beacon-starter.zip" class="btn-primary btn-sm" download>Get the zip</a>',
            ),
        ],
    },
    {
        "path": DOCS / "quiz.html",
        "label": "docs/quiz.html — header back-link area",
        "edits": [
            (
                '  <div class="hdr-right"><a href="./index.html" style="font-size:12px;color:#64748b;text-decoration:none;font-weight:600;letter-spacing:.02em;padding:4px 10px;border:1px solid #1f2d45;border-radius:6px;display:inline-flex;align-items:center;gap:5px">← Beacon</a>',
                '  <div class="hdr-right"><a href="./index.html" style="font-size:12px;color:#64748b;text-decoration:none;font-weight:600;letter-spacing:.02em;padding:4px 10px;border:1px solid #1f2d45;border-radius:6px;display:inline-flex;align-items:center;gap:5px">← Beacon</a><a href="./lab.html" style="font-size:12px;color:#01696f;text-decoration:none;font-weight:600;letter-spacing:.02em;padding:4px 10px;border:1px solid #01696f;border-radius:6px;display:inline-flex;align-items:center;gap:5px;margin-left:8px">Framework Lab</a>',
            ),
        ],
    },
    {
        "path": DOCS / "walkthrough" / "index.html",
        "label": "docs/walkthrough/index.html — meta line",
        "edits": [
            (
                '  <div class="meta">\n'
                '    <span id="step-counter">step 1 / 12</span>\n'
                '    &nbsp;·&nbsp;\n'
                '    <span>YES-Ship AI · YES-Steady AI · YES-Recover AI</span>\n'
                '  </div>\n'
                '</header>',
                '  <div class="meta">\n'
                '    <span id="step-counter">step 1 / 12</span>\n'
                '    &nbsp;·&nbsp;\n'
                '    <span>YES-Ship AI · YES-Steady AI · YES-Recover AI</span>\n'
                '    &nbsp;·&nbsp;\n'
                '    <a href="../lab.html" style="color:inherit;text-decoration:underline;text-underline-offset:3px;">Framework Lab ↗</a>\n'
                '  </div>\n'
                '</header>',
            ),
        ],
    },
]


def main() -> int:
    rc = 0
    for spec in PATCHES:
        path = spec["path"]
        if not path.exists():
            print(f"  ! MISSING: {path}", file=sys.stderr)
            rc = 1
            continue
        text = path.read_text(encoding="utf-8")
        before = text
        for old, new in spec["edits"]:
            if old in text:
                text = text.replace(old, new, 1)
            elif new in text:
                print(f"  ~ already patched: {spec['label']}")
            else:
                print(f"  ! could not locate patch target in {spec['label']}", file=sys.stderr)
                rc = 1
        if text != before:
            path.write_text(text, encoding="utf-8")
            print(f"  + patched: {spec['label']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
