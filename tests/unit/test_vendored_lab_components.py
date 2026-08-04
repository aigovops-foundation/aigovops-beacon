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

# The Lab's signer canonicalizes with a byte-identical copy of the engine's RFC 8785
# implementation. It is copied rather than imported because the Docker build context is
# lab-service/, so server/src/ is unreachable at build time. If these two drift, receipts the Lab
# issues stop verifying for the auditor while still looking valid inside the Lab — silently.
VENDORED_FILES = [
    (REPO / "server" / "src" / "lib" / "canonical.js", REPO / "lab-service" / "shared" / "canonical.js"),
]


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


PPLX_URL = "https://aigovops-beacon-lab.pplx.app"

# Files that must not point a browser at the retired vendor sandbox. The web components are the
# source of truth; docs/js/ holds their vendored copies (guarded above).
CUTOVER_FILES = [
    "docs/lab.html",
    "docs/lab-100.html",
    "docs/js/beacon-lab.js",
    "docs/js/beacon-lab-bridge.js",
    "lab-service/edge/components/beacon-lab.js",
    "lab-service/edge/components/beacon-lab-bridge.js",
]


def _uncommented(path: Path) -> list[str]:
    """Lines with comment-only content stripped out.

    The cutover deliberately KEPT the pplx history in comments — why the /port/5000 suffix
    existed, why the components are vendored, why Web Storage has a fallback. Deleting that
    context to satisfy a substring search would trade real explanation for a green test, so the
    check is on what a browser executes, not on what a reader sees.
    """
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if t.startswith(("//", "*", "/*", "<!--", "#")):
            continue
        out.append(line)
    return out


@pytest.mark.parametrize("rel", CUTOVER_FILES)
def test_no_live_url_points_at_the_retired_pplx_host(rel: str) -> None:
    """Cut over 2026-08-04 to https://beacon-lab.aigovops-foundation.com (Fly).

    The lab backend used to live at aigovops-beacon-lab.pplx.app — a vendor sandbox that was the
    ONLY copy of its source until it had to be rebuilt. Nothing we ship may send a browser back
    there: the host is not ours, sends no Access-Control-Allow-Origin, and is not guaranteed to
    exist tomorrow.

    Note the new base has NO "/port/5000" suffix. That was a pplx routing quirk (backend ports
    were not auto-routed); keeping it would 404 every API call.
    """
    path = REPO / rel
    assert path.exists(), f"missing: {rel}"
    offenders = [ln.strip() for ln in _uncommented(path) if PPLX_URL in ln]
    assert not offenders, (
        f"{rel} still points at the retired pplx host:\n  " + "\n  ".join(offenders)
    )


@pytest.mark.parametrize("page", ["lab.html", "lab-100.html"])
def test_lab_pages_do_not_load_scripts_from_pplx(page: str) -> None:
    """No lab page may fetch executable CODE from pplx.app — narrower than the check above,
    and kept because code delivery from an origin we do not control is its own class of bug."""
    html = (REPO / "docs" / page).read_text(encoding="utf-8")
    offenders = [
        line.strip()
        for line in html.splitlines()
        if "pplx.app" in line and ("<script" in line or "/components/" in line)
    ]
    assert not offenders, (
        f"{page} loads executable code from pplx.app:\n  " + "\n  ".join(offenders)
    )


@pytest.mark.parametrize("source,vendored", VENDORED_FILES, ids=lambda p: getattr(p, "name", str(p)))
def test_vendored_engine_file_matches_source(source, vendored) -> None:
    """lab-service/shared/canonical.js is byte-identical to the engine's copy."""
    assert source.exists(), f"source of truth missing: {source}"
    assert vendored.exists(), f"vendored copy missing: {vendored}"
    assert _sha256(vendored) == _sha256(source), (
        f"{vendored.name} has drifted from {source.relative_to(REPO)}.\n"
        f"Two RFC 8785 implementations that disagree make every Lab receipt unverifiable to the "
        f"auditor while still looking valid inside the Lab.\n"
        f"Fix with:  cp {source.relative_to(REPO)} {vendored.relative_to(REPO)}"
    )
