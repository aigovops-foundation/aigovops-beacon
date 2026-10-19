"""The two published single-file labs must work standalone (no CDN, no docs/ folder beside them).

published-lab.html and published-lab-offline.html are opened from a download folder or a USB
stick as often as from a repo checkout, so the receipt sandbox's libraries (tweetnacl,
tweetnacl-util, JSZip) have to be inlined — a <script src> to a CDN or to docs/vendor/ breaks
them. Beacon #88 moved the CDN loads to docs/vendor/; #91 inlined them. This keeps it that way,
for the committed outputs and for the generator that writes them.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED = ["published-lab.html", "published-lab-offline.html"]
LIBS = ["nacl.min.js", "nacl-util.min.js", "jszip.min.js"]
SCRIPT_SRC = re.compile(r'<script[^>]*\ssrc=["\']([^"\']+)["\']', re.I)


def _html(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_published_labs_load_no_external_or_relative_scripts():
    for name in PUBLISHED:
        srcs = SCRIPT_SRC.findall(_html(name))
        assert srcs == [], f"{name} loads scripts by src (not standalone): {srcs}"


def test_published_labs_inline_the_three_libraries():
    for name in PUBLISHED:
        html = _html(name)
        for lib in LIBS:
            marker = f"<!-- {lib} inlined"
            assert marker in html, f"{name}: {lib} is not inlined"
            vendored = (ROOT / "docs" / "vendor" / lib).read_text(encoding="utf-8").rstrip()
            assert vendored in html, f"{name}: inlined {lib} differs from docs/vendor/{lib}"


def test_generator_inlines_from_docs_vendor_not_a_cdn():
    src = (ROOT / "scripts" / "build_single_page.py").read_text(encoding="utf-8")
    assert "cdn.jsdelivr.net" not in src
    assert "DOCS / 'vendor'" in src or 'DOCS / "vendor"' in src
