"""Receipts written before schema_version 1.1.0 must stay verifiable forever.

`tests/fixtures/bundle-schema-1.0.0/` is a FROZEN bundle in the old wire format:
`canonical_form: "RFC8785"` and a 16-hex-character `key_fpr`. It is checked in,
never regenerated, and signed by a fixed key — so it keeps testing the past even
as the producer moves on.

This is the whole compatibility promise of the 1.1.0 bump. The bytes being
signed never changed; only the labels around the signature did. If that is true,
this fixture verifies unchanged forever. If this test ever goes red, evidence
that real organisations already hold has stopped verifying, and the change that
did it must be reverted rather than the fixture updated.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from src.beacon_verify import verify_bundle  # noqa: E402

FIXTURE = REPO_ROOT / "tests" / "fixtures" / "bundle-schema-1.0.0"


def test_the_fixture_really_is_the_old_format():
    """Guard the guard: if someone regenerates it, this test must notice."""
    manifest = json.loads((FIXTURE / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["canonical_form"] == "RFC8785"

    ndjson = next((FIXTURE / "receipts").glob("*.ndjson"))
    receipts = [json.loads(x) for x in ndjson.read_text().splitlines() if x.strip()]
    assert receipts, "fixture has no receipts"
    for r in receipts:
        assert r["schema_version"] == "1.0.0"
        assert r["signature"]["canonical_form"] == "RFC8785"
        # The old spelling: 16 hex characters, not SHA256:<base64>.
        assert len(r["signature"]["key_fpr"]) == 16
        assert not r["signature"]["key_fpr"].startswith("SHA256:")


def test_a_1_0_0_bundle_still_verifies():
    result = verify_bundle(FIXTURE)
    assert result["ok"], result["errors"]
    assert result["verified"] == result["count"] > 0


def test_it_verifies_through_the_cli_the_auditor_actually_runs():
    r = subprocess.run(
        [sys.executable, str(REPO_ROOT / "src" / "beacon_verify.py"), str(FIXTURE)],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    assert "beacon-verify: OK" in r.stdout


def test_tampering_with_the_old_format_is_still_caught(tmp_path):
    """Backwards compatibility must not become backwards credulity."""
    import shutil

    copy = tmp_path / "bundle"
    shutil.copytree(FIXTURE, copy)
    ndjson = next((copy / "receipts").glob("*.ndjson"))
    entries = [json.loads(x) for x in ndjson.read_text().splitlines() if x.strip()]
    entries[0]["environment"] = "tampered"
    ndjson.write_text(
        "\n".join(json.dumps(e) for e in entries) + "\n", encoding="utf-8"
    )

    result = verify_bundle(copy)
    assert not result["ok"]
    assert result["errors"]
