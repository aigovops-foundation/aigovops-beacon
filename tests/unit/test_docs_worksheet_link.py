"""Regression guard for docs/index.html's worksheet-mode "back to the worksheet" link.

Café Walk run 3 found this anchor pointing at a heading id that no longer existed: the
practice's WORKSHEET.md headings dropped their " — live"/" — fall" release-plumbing suffixes
(practice #12), but this cross-repo hardcoded href was never updated, so the last click of
the level-100 loop landed at the top of the worksheet instead of step 5.

Run from the repo root:

    PYTHONPATH=. python3 -m pytest tests/unit/test_docs_worksheet_link.py -v
"""

from __future__ import annotations

import re
from pathlib import Path

DOCS_INDEX = Path(__file__).resolve().parents[2] / "docs" / "index.html"


def _ws_back_href() -> str:
    html = DOCS_INDEX.read_text(encoding="utf-8")
    m = re.search(r'id="wsBack"[^>]*\bhref="([^"]+)"', html)
    assert m, 'docs/index.html must have an <a id="wsBack" href="..."> — the worksheet-mode return link'
    return m.group(1)


def test_ws_back_targets_the_level_100_worksheet():
    href = _ws_back_href()
    assert href.startswith(
        "https://practice.aigovops-foundation.com/levels/100-begin/WORKSHEET.html#"
    ), f"wsBack should point at the level-100 worksheet, got: {href}"


def test_ws_back_anchor_carries_no_retired_release_suffix():
    href = _ws_back_href()
    fragment = href.split("#", 1)[1]
    for retired in ("--live", "--fall"):
        assert not fragment.endswith(retired), (
            f"wsBack anchor '#{fragment}' still carries the retired '{retired}' suffix — "
            "the worksheet heading it points at no longer has one (practice #12)"
        )
