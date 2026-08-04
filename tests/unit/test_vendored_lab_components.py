"""The Lab web components are vendored into docs/js/ — keep the copies in lock-step.

`docs/lab.html` and `docs/lab-100.html` used to load these two modules from
`aigovops-beacon-lab.pplx.app`. That host sends no `Access-Control-Allow-Origin`, so from the
GitHub Pages origin both modules were CORS-blocked and never executed — which meant the
`<beacon-lab-step>` elements that ARE the Lab 100 curriculum stayed undefined and the page
rendered nothing. They are now served from our own origin out of `docs/js/`.

Serving our own copy costs one thing: two files that can drift apart. That is not theoretical —
it is exactly what happened to the pplx-hosted build, which still shipped Beacon's retired teal
long after the garden-warm rebrand (#27), because nothing was checking. This test is the check.

If it fails, copy the source of truth over the vendored copy:

    cp lab-service/edge/components/beacon-lab.js docs/js/beacon-lab.js

Run from the repo root:

    PYTHONPATH=. python3 -m pytest tests/unit -v
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO / "lab-service" / "edge" / "components"
VENDORED_DIR = REPO / "docs" / "js"

# The modules docs/lab.html and docs/lab-100.html load from our own origin.
COMPONENTS = ["beacon-lab-bridge.js", "beacon-lab.js"]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize("name", COMPONENTS)
def test_vendored_copy_matches_source(name: str) -> None:
    """docs/js/<name> is byte-identical to lab-service/edge/components/<name>."""
    source, vendored = SOURCE_DIR / name, VENDORED_DIR / name
    assert source.exists(), f"source of truth missing: {source.relative_to(REPO)}"
    assert vendored.exists(), f"vendored copy missing: {vendored.relative_to(REPO)}"
    assert _sha256(vendored) == _sha256(source), (
        f"{name} has drifted from lab-service/edge/components/.\n"
        f"Fix with:  cp {source.relative_to(REPO)} {vendored.relative_to(REPO)}"
    )


@pytest.mark.parametrize("page", ["lab.html", "lab-100.html"])
def test_lab_pages_do_not_load_scripts_from_pplx(page: str) -> None:
    """No lab page may fetch executable code from pplx.app.

    The API base is deliberately NOT covered here — the backend still lives on pplx.app until
    lab-service can be deployed (see lab-service/docs/deploy-fly.md). This guards the narrower
    and already-fixed thing: code delivery must come from an origin we control.
    """
    html = (REPO / "docs" / page).read_text(encoding="utf-8")
    offenders = [
        line.strip()
        for line in html.splitlines()
        if "pplx.app" in line and ("<script" in line or "/components/" in line)
    ]
    assert not offenders, (
        f"{page} loads executable code from pplx.app:\n  " + "\n  ".join(offenders)
    )
