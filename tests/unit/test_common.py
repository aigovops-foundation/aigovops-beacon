"""Unit tests for beacons/_common.py — the Python receipt builder and signer.

These mirror the Node unit tests in server/test/unit so both
implementations of RFC 8785 canonicalization and Ed25519 signing stay in
lock-step. A receipt signed by one must verify under the other.

Run from the repo root:

    PYTHONPATH=. python3 -m pytest tests/unit -v
"""

from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from beacons._common import (  # noqa: E402
    canonicalize,
    key_fingerprint,
    make_receipt,
    new_ulid,
    sha256_hex,
)

ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


# ── Canonicalization ────────────────────────────────────────────────────


def test_canonicalize_primitives():
    assert canonicalize(None) == "null"
    assert canonicalize(True) == "true"
    assert canonicalize(False) == "false"
    assert canonicalize(0) == "0"
    assert canonicalize(42) == "42"
    assert canonicalize(-7) == "-7"
    assert canonicalize("hi") == '"hi"'


def test_canonicalize_sorts_keys_recursively():
    assert canonicalize({"b": {"d": 1, "c": 2}, "a": 3}) == '{"a":3,"b":{"c":2,"d":1}}'


def test_canonicalize_preserves_array_order():
    assert canonicalize([3, 1, 2]) == "[3,1,2]"


def test_canonicalize_escapes_control_chars():
    assert canonicalize("a\nb\tc") == '"a\\nb\\tc"'
    assert canonicalize("\x01\x1f") == '"\\u0001\\u001f"'


def test_canonicalize_passes_through_unicode():
    assert canonicalize("café — 日本語") == '"café — 日本語"'


def test_canonicalize_rejects_non_finite():
    with pytest.raises(ValueError):
        canonicalize(float("inf"))
    with pytest.raises(ValueError):
        canonicalize(float("nan"))


def test_canonicalize_equal_objects_match():
    x = {"id": "01", "nested": {"z": [1, 2], "a": "v"}, "flag": True}
    y = {"flag": True, "nested": {"a": "v", "z": [1, 2]}, "id": "01"}
    assert canonicalize(x) == canonicalize(y)


def test_canonicalize_matches_known_node_output():
    # Same vector asserted in server/test/unit/canonical.test.js.
    assert canonicalize({"b": 1, "a": 2}) == '{"a":2,"b":1}'


# ── Hashing ─────────────────────────────────────────────────────────────


def test_sha256_hex_is_prefixed_and_stable():
    h = sha256_hex(b"prompt")
    assert h.startswith("sha256:")
    assert len(h) == len("sha256:") + 64
    assert sha256_hex("prompt") == sha256_hex(b"prompt")  # str == bytes
    assert sha256_hex(b"a") != sha256_hex(b"b")


# ── ULID ────────────────────────────────────────────────────────────────


def test_new_ulid_shape_and_uniqueness():
    ids = [new_ulid() for _ in range(100)]
    assert all(ULID_RE.match(i) for i in ids)
    assert len(set(ids)) == 100


def test_new_ulids_are_time_sortable():
    import time

    first = new_ulid()
    time.sleep(0.002)
    second = new_ulid()
    assert first < second


# ── Signing & fingerprint ───────────────────────────────────────────────


def test_key_fingerprint_is_ssh_style():
    sk = Ed25519PrivateKey.generate()
    fpr = key_fingerprint(sk.public_key())
    assert fpr.startswith("SHA256:")
    # base64 body, no padding
    assert "=" not in fpr


def test_sign_receipt_roundtrip(monkeypatch, tmp_path):
    # Point key material at a temp dir so we don't touch the real ~/.beacon.
    import beacons._common as common

    monkeypatch.setattr(common, "KEYS_DIR", tmp_path / "keys")
    monkeypatch.setattr(common, "RECEIPTS_DIR", tmp_path / "receipts")
    monkeypatch.setattr(common, "PRIVATE_KEY_PATH", tmp_path / "keys" / "ed25519.key")
    monkeypatch.setattr(common, "PUBLIC_KEY_PATH", tmp_path / "keys" / "ed25519.pub")

    receipt = make_receipt(
        event_type="inference.observed",
        subject="model:gpt-4o",
        action="inference.observed",
        evidence={"tokens_in": 10, "tokens_out": 20},
    )
    signed = common.sign_receipt(dict(receipt))
    assert "signature" in signed
    sig = signed["signature"]
    assert sig["alg"] == "Ed25519"
    assert sig["canonical_form"] == "json/c14n-rfc8785"

    # Verify against the freshly written public key.
    from cryptography.hazmat.primitives import serialization

    pub = serialization.load_pem_public_key(common.PUBLIC_KEY_PATH.read_bytes())
    body = {k: v for k, v in signed.items() if k != "signature"}
    pub.verify(base64.b64decode(sig["sig_b64"]), canonicalize(body).encode("utf-8"))


def test_make_receipt_never_stores_raw_payloads():
    r = make_receipt(
        event_type="inference.observed",
        subject="model:claude",
        action="inference.observed",
        evidence={"secret": "do-not-store-raw"},
    )
    assert r["prompt"] is None
    assert r["result"] is None
    assert r["evidence_sha256"].startswith("sha256:")
    # evidence_meta keeps metadata, but the hash is the integrity anchor.
    assert "evidence_sha256" in r
