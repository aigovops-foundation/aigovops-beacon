"""Every Python canonicalizer must reproduce the published vectors byte for byte.

Beacon signs canonical BYTES. Two implementations that disagree by one byte
produce signatures that will not verify against each other — and the failure
surfaces at the auditor, on evidence that is actually intact, which is the worst
possible place and time to discover it.

Beacon has three canonicalizers and cannot collapse to one file:

  server/src/lib/canonical.js   the reference (and lab-service/shared/canonical.js,
                                a byte-identical vendored copy already enforced by
                                tests/unit/test_vendored_lab_components.py)
  beacons/_common.py            the Python producer
  src/beacon_verify.py          its own copy ON PURPOSE — it is shipped into every
                                bundle as one self-contained file an auditor can
                                read in full before running it

So the invariant is measured rather than asserted in a comment. The expected
strings in tests/vectors/canonicalization.json were produced by the JS reference,
which makes this a genuine cross-implementation check and not a Python
round-trip that would pass even if both Python copies were wrong together.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from beacons._common import canonicalize as canonicalize_common  # noqa: E402
from src.beacon_verify import canonicalize as canonicalize_verify  # noqa: E402

VECTORS_PATH = REPO_ROOT / "tests" / "vectors" / "canonicalization.json"
DOC = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
VECTORS = DOC["vectors"]

IMPLEMENTATIONS = {
    "beacons/_common.py": canonicalize_common,
    "src/beacon_verify.py": canonicalize_verify,
}


def test_the_vector_file_is_not_empty():
    # A test that silently iterates zero cases is worse than no test.
    assert len(VECTORS) >= 20
    assert DOC["canonical_form"] == "json/c14n-rfc8785"


@pytest.mark.parametrize("impl_name", sorted(IMPLEMENTATIONS))
@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["name"])
def test_matches_the_published_vector(impl_name, vector):
    got = IMPLEMENTATIONS[impl_name](vector["input"])
    assert got == vector["canonical"], (
        f"{impl_name} disagrees with the published canonical form for "
        f"{vector['name']!r}"
    )


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["name"])
def test_the_python_implementations_agree_with_each_other(vector):
    assert canonicalize_common(vector["input"]) == canonicalize_verify(
        vector["input"]
    )


def test_key_order_in_the_input_cannot_change_the_output():
    """The whole point of canonicalization: input order must not matter."""
    a = {"b": 1, "a": {"d": 2, "c": 3}, "z": [1, 2]}
    b = {"z": [1, 2], "a": {"c": 3, "d": 2}, "b": 1}
    for fn in IMPLEMENTATIONS.values():
        assert fn(a) == fn(b)
