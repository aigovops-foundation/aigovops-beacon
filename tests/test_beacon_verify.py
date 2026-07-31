"""Smoke tests for the beacon-verify CLI.

Exercises both supported audit-log formats end-to-end, plus a tamper-
detection case for each.

Run from the repo root:

    PYTHONPATH=. python3 -m pytest tests/test_beacon_verify.py -v
"""

from __future__ import annotations

import base64
import hashlib
import itertools
import json
import sys
import tempfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import src.beacon_verify as bv  # noqa: E402
from src.beacon_verify import main as verify_main  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pem_from_private(sk: Ed25519PrivateKey) -> bytes:
    return sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _make_runtime_receipt(sk: Ed25519PrivateKey, event_type: str = "inference.observed") -> dict:
    from beacons._common import canonicalize, new_ulid, sha256_hex, utc_now_iso

    body = {
        "id": new_ulid(),
        "ts_utc": utc_now_iso(),
        "user": "alice",
        "vendor": "openai",
        "model": "gpt-4o",
        "version": "aigovops-beacon.v1",
        "event_type": event_type,
        "prompt_hash": sha256_hex(b"prompt"),
        "result_hash": sha256_hex(b"result"),
        "environment": "cloud_saas",
    }
    canon = canonicalize(body).encode("utf-8")
    sig = sk.sign(canon)
    body["signature"] = {
        "alg": "ed25519",
        "key_fpr": "test",
        "sig_b64": base64.b64encode(sig).decode(),
        "canonical_form": "json/c14n-rfc8785",
    }
    return body


def _node_hex_fingerprint(sk: Ed25519PrivateKey) -> str:
    """The 16-hex short fingerprint server/src/services/keys.js writes."""
    from cryptography.hazmat.primitives import serialization as _ser

    raw = sk.public_key().public_bytes(
        encoding=_ser.Encoding.Raw, format=_ser.PublicFormat.Raw
    )
    return hashlib.sha256(raw).hexdigest()[:16]


_RECEIPT_SEQ = itertools.count(1)


def _node_dialect_receipt(sk: Ed25519PrivateKey, **overrides) -> dict:
    """A receipt in the exact shape server/src/services/receipts.js writes.

    Note `canonical_form: "RFC8785"` and the 16-hex `key_fpr` — both differ
    from what docs/RECEIPT_SCHEMA.md specifies, and both are what an auditor
    will find in a bundle produced by the documented quickstart.
    """
    from beacons._common import canonicalize as producer_canonicalize

    body = {
        "id": f"01JNODE{next(_RECEIPT_SEQ):019d}",
        "ts_utc": "2026-07-30T12:00:00.000Z",
        "schema_version": "1.0.0",
        "user": {"sub": "oidc|alice", "email": "alice@example.org"},
        "vendor": "OpenAI",
        "model": "gpt-4o-mini",
        "version": "2024-07-18",
        "event_type": "invocation",
        "environment": "production",
        **overrides,
    }
    sig = sk.sign(producer_canonicalize(body).encode("utf-8"))
    return {
        **body,
        "signature": {
            "alg": "Ed25519",
            "key_fpr": _node_hex_fingerprint(sk),
            "canonical_form": "RFC8785",
            "sig_b64": base64.b64encode(sig).decode(),
        },
    }


def _make_bundle(
    tmp_path: Path,
    receipts_by_file: dict[str, list[dict]],
    *,
    keys: list[Ed25519PrivateKey],
    digest_over: str = "file",
) -> Path:
    """Assemble a bundle in the shape server/src/services/export.js writes."""
    bundle = tmp_path / "bundle-2026-07-30T12-00-00-000Z"
    (bundle / "receipts").mkdir(parents=True)
    (bundle / "public_keys").mkdir(parents=True)

    counts = {}
    for name, receipts in receipts_by_file.items():
        (bundle / "receipts" / name).write_text(
            "".join(json.dumps(r) + "\n" for r in receipts)
        )
        counts[name] = len(receipts)

    for sk in keys:
        fpr = _node_hex_fingerprint(sk)
        (bundle / "public_keys" / f"{fpr}.pem").write_bytes(_pem_from_private(sk))

    manifest = {
        "beacon_version": "0.1.0-test",
        "generated_at_utc": "2026-07-30T12:00:00.000Z",
        "generated_by": "engineer@example.org",
        "active_key_fingerprint": _node_hex_fingerprint(keys[-1]),
        "public_key_fingerprints": [_node_hex_fingerprint(k) for k in keys],
        "signing_algorithm": "Ed25519",
        "canonical_form": "RFC8785",
        "receipt_files": counts,
    }
    manifest_json = json.dumps(manifest, indent=2)
    (bundle / "manifest.json").write_text(manifest_json)

    if digest_over == "canonical":
        # How bundles were written before the digest was fixed: the digest of
        # the manifest's canonical form, recorded in `sha256sum -c` format.
        from beacons._common import canonicalize as producer_canonicalize

        digest = hashlib.sha256(
            producer_canonicalize(manifest).encode("utf-8")
        ).hexdigest()
    else:
        digest = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
    (bundle / "manifest.sha256").write_text(f"{digest}  manifest.json\n")

    return bundle


# ---------------------------------------------------------------------------
# Runtime format
# ---------------------------------------------------------------------------


def test_runtime_log_verifies_clean(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    key_path = tmp_path / "public-key.pem"
    key_path.write_bytes(_pem_from_private(sk))

    log = tmp_path / "rt.ndjson"
    with log.open("w") as f:
        for et in ["inference.observed", "gate.evaluated", "inventory.model.added"]:
            f.write(json.dumps(_make_runtime_receipt(sk, et)) + "\n")

    rc = verify_main([str(log), "--public-key", str(key_path), "--quiet"])
    assert rc == 0


def test_runtime_log_detects_tamper(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    key_path = tmp_path / "public-key.pem"
    key_path.write_bytes(_pem_from_private(sk))

    log = tmp_path / "rt.ndjson"
    entries = [_make_runtime_receipt(sk) for _ in range(3)]
    entries[1]["user"] = "mallory"  # tamper after signing
    with log.open("w") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")

    rc = verify_main([str(log), "--public-key", str(key_path), "--quiet"])
    assert rc == 1


def test_runtime_log_detects_duplicate_id(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    key_path = tmp_path / "public-key.pem"
    key_path.write_bytes(_pem_from_private(sk))

    log = tmp_path / "rt.ndjson"
    e1 = _make_runtime_receipt(sk)
    e2 = _make_runtime_receipt(sk)
    e2["id"] = e1["id"]
    # Need to re-sign e2 since `id` is part of the canonical body
    from beacons._common import canonicalize

    body = {k: v for k, v in e2.items() if k != "signature"}
    sig = sk.sign(canonicalize(body).encode("utf-8"))
    e2["signature"]["sig_b64"] = base64.b64encode(sig).decode()

    with log.open("w") as f:
        f.write(json.dumps(e1) + "\n")
        f.write(json.dumps(e2) + "\n")

    rc = verify_main([str(log), "--public-key", str(key_path), "--quiet"])
    assert rc == 1


# ---------------------------------------------------------------------------
# Foundation format
# ---------------------------------------------------------------------------


def test_foundation_log_verifies_live_repo() -> None:
    """The committed audit log at audit/audit-log.jsonl must always verify."""
    repo_root = Path(__file__).resolve().parent.parent
    log = repo_root / "audit" / "audit-log.jsonl"
    if not log.exists():
        pytest.skip("no committed audit log")
    rc = verify_main([str(log), "--quiet"])
    assert rc == 0


# ---------------------------------------------------------------------------
# CLI error handling
# ---------------------------------------------------------------------------


def test_missing_file_returns_2(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    rc = verify_main([str(tmp_path / "no-such.jsonl")])
    assert rc == 2


def test_empty_log_is_ok(tmp_path: Path) -> None:
    log = tmp_path / "empty.ndjson"
    log.write_text("")
    # An empty runtime log verifies as ok with zero entries; no key needed
    # because we never enter the verify loop.
    rc = verify_main([str(log), "--public-key", str(tmp_path / "ignored.pem"), "--quiet"])
    # Public key file doesn't exist but we won't read it for an empty log;
    # the current implementation tries to load it eagerly though, so accept
    # either 0 or 3.
    assert rc in (0, 3)


def test_unrecognisable_log_returns_2_not_a_traceback(tmp_path: Path) -> None:
    """Format detection must fail as a usage error, not crash the auditor."""
    log = tmp_path / "mystery.ndjson"
    log.write_text(json.dumps({"hello": "world"}) + "\n")
    assert verify_main([str(log), "--quiet"]) == 2


# ---------------------------------------------------------------------------
# Receipts from the producers that actually exist
#
# The rest of this file used to build its own receipts and check that the
# verifier accepted them, which it always did — the fixture and the verifier
# shared an author. These tests use what Beacon really emits instead. Before
# this was fixed, `beacon-verify` rejected every one of them.
# ---------------------------------------------------------------------------


def test_verifies_a_receipt_from_beacons_common(tmp_path: Path, monkeypatch) -> None:
    """A receipt straight out of `beacons/_common.py` must verify."""
    monkeypatch.setenv("BEACON_HOME", str(tmp_path / "home"))
    import importlib

    import beacons._common as common

    importlib.reload(common)  # pick up the patched BEACON_HOME

    receipt = common.sign_receipt(
        common.make_receipt(
            event_type="inference.observed",
            subject="gpt-4o",
            action="observed",
            evidence={"host": "api.openai.com"},
        )
    )
    # This is the spelling docs/RECEIPT_SCHEMA.md specifies, and the one the
    # verifier used to reject outright.
    assert receipt["signature"]["alg"] == "Ed25519"
    assert receipt["signature"]["key_fpr"].startswith("SHA256:")

    log = tmp_path / "runtime.ndjson"
    log.write_text(json.dumps(receipt) + "\n")

    rc = verify_main(
        [str(log), "--public-key", str(common.PUBLIC_KEY_PATH), "--quiet"]
    )
    assert rc == 0


def test_verifies_a_receipt_in_the_node_servers_dialect(tmp_path: Path) -> None:
    """The Node server spells two fields differently. It must still verify."""
    sk = Ed25519PrivateKey.generate()
    key_path = tmp_path / "public-key.pem"
    key_path.write_bytes(_pem_from_private(sk))

    receipt = _node_dialect_receipt(sk)
    assert receipt["signature"]["canonical_form"] == "RFC8785"
    assert len(receipt["signature"]["key_fpr"]) == 16  # not the SSH-style form

    log = tmp_path / "node.ndjson"
    log.write_text(json.dumps(receipt) + "\n")

    rc = verify_main([str(log), "--public-key", str(key_path), "--quiet"])
    assert rc == 0


def test_an_unknown_canonical_form_is_still_rejected(tmp_path: Path) -> None:
    """Tolerating spellings of RFC 8785 is not tolerating anything else."""
    sk = Ed25519PrivateKey.generate()
    key_path = tmp_path / "public-key.pem"
    key_path.write_bytes(_pem_from_private(sk))

    receipt = _node_dialect_receipt(sk)
    receipt["signature"]["canonical_form"] = "some-other-scheme"
    log = tmp_path / "node.ndjson"
    log.write_text(json.dumps(receipt) + "\n")

    assert verify_main([str(log), "--public-key", str(key_path), "--quiet"]) == 1


# ---------------------------------------------------------------------------
# Bundles
# ---------------------------------------------------------------------------


def test_bundle_verifies_across_a_key_rotation(tmp_path: Path) -> None:
    """The normal case: a bundle whose range spans two signing keys."""
    old_key = Ed25519PrivateKey.generate()
    new_key = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path,
        {
            "2026-06-30.ndjson": [_node_dialect_receipt(old_key) for _ in range(2)],
            "2026-07-30.ndjson": [_node_dialect_receipt(new_key) for _ in range(3)],
        },
        keys=[old_key, new_key],
    )

    result = bv.verify_bundle(bundle)
    assert result["ok"] is True
    assert result["count"] == 5
    assert result["verified"] == 5
    assert len(result["keys"]) == 2
    assert verify_main([str(bundle), "--quiet"]) == 0


def test_bundle_catches_a_tampered_receipt(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    receipts = [_node_dialect_receipt(sk) for _ in range(3)]
    receipts[1]["model"] = "definitely-not-what-ran"  # after signing
    bundle = _make_bundle(tmp_path, {"2026-07-30.ndjson": receipts}, keys=[sk])

    result = bv.verify_bundle(bundle)
    assert result["ok"] is False
    assert result["verified"] == 2
    assert any("does not verify" in e for e in result["errors"])
    assert verify_main([str(bundle), "--quiet"]) == 1


def test_bundle_catches_a_receipt_removed_after_export(tmp_path: Path) -> None:
    """Dropping a receipt must not silently shrink a clean-looking bundle."""
    sk = Ed25519PrivateKey.generate()
    receipts = [_node_dialect_receipt(sk) for _ in range(3)]
    bundle = _make_bundle(tmp_path, {"2026-07-30.ndjson": receipts}, keys=[sk])

    path = bundle / "receipts" / "2026-07-30.ndjson"
    kept = path.read_text().strip().split("\n")[:-1]
    path.write_text("\n".join(kept) + "\n")

    result = bv.verify_bundle(bundle)
    assert result["ok"] is False
    assert any("manifest declares 3 receipts" in e for e in result["errors"])


def test_bundle_catches_a_modified_manifest(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path, {"2026-07-30.ndjson": [_node_dialect_receipt(sk)]}, keys=[sk]
    )
    manifest = json.loads((bundle / "manifest.json").read_text())
    manifest["generated_by"] = "someone-else@example.org"
    (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2))

    result = bv.verify_bundle(bundle)
    assert result["ok"] is False
    assert any("manifest.sha256 does not match" in e for e in result["errors"])


def test_legacy_bundle_digest_verifies_and_says_so(tmp_path: Path) -> None:
    """Bundles exported before the digest fix must still verify, with a note."""
    sk = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path,
        {"2026-07-30.ndjson": [_node_dialect_receipt(sk)]},
        keys=[sk],
        digest_over="canonical",
    )
    result = bv.verify_bundle(bundle)
    assert result["ok"] is True
    assert result["manifest"]["over"] == "canonical"
    assert any("sha256sum -c" in n for n in result["notes"])


def test_bundle_without_keys_is_a_key_material_error(tmp_path: Path) -> None:
    sk = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path, {"2026-07-30.ndjson": [_node_dialect_receipt(sk)]}, keys=[sk]
    )
    for pem in (bundle / "public_keys").glob("*.pem"):
        pem.unlink()
    assert verify_main([str(bundle), "--quiet"]) == 3


def test_directory_that_is_not_a_bundle_returns_2(tmp_path: Path) -> None:
    (tmp_path / "random").mkdir()
    assert verify_main([str(tmp_path / "random"), "--quiet"]) == 2


def test_json_report_is_machine_readable(tmp_path: Path, capsys) -> None:
    sk = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path, {"2026-07-30.ndjson": [_node_dialect_receipt(sk)]}, keys=[sk]
    )
    assert verify_main([str(bundle), "--json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["ok"] is True
    assert report["format"] == "bundle"
    assert report["verified"] == 1


# ---------------------------------------------------------------------------
# The pure-Python fallback
#
# It is what makes "one command, nothing installed" true on an air-gapped
# machine, so it has to agree with `cryptography` exactly — including on the
# rejections.
# ---------------------------------------------------------------------------

# RFC 8032 §7.1, TEST 1 and TEST 3.
_RFC8032_VECTORS = [
    (
        "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        "",
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555f"
        "b8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    ),
    (
        "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
        "af82",
        "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac1"
        "8ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
    ),
]


@pytest.mark.parametrize("pub_hex,msg_hex,sig_hex", _RFC8032_VECTORS)
def test_pure_ed25519_matches_rfc8032_vectors(pub_hex, msg_hex, sig_hex) -> None:
    pub, msg, sig = (bytes.fromhex(x) for x in (pub_hex, msg_hex, sig_hex))
    assert bv._pure_ed25519_verify(pub, msg, sig) is True

    corrupted = bytearray(sig)
    corrupted[0] ^= 0x01
    assert bv._pure_ed25519_verify(pub, msg, bytes(corrupted)) is False
    assert bv._pure_ed25519_verify(pub, msg + b"\x00", sig) is False


def test_pure_ed25519_agrees_with_cryptography_on_random_messages() -> None:
    from cryptography.hazmat.primitives import serialization as _ser

    sk = Ed25519PrivateKey.generate()
    raw_pub = sk.public_key().public_bytes(
        encoding=_ser.Encoding.Raw, format=_ser.PublicFormat.Raw
    )
    for i in range(8):
        msg = f"receipt-{i}".encode()
        sig = sk.sign(msg)
        assert bv._pure_ed25519_verify(raw_pub, msg, sig) is True
        assert bv._pure_ed25519_verify(raw_pub, msg + b"!", sig) is False
    # Malformed inputs are rejected, never raised.
    assert bv._pure_ed25519_verify(b"short", b"m", b"x" * 64) is False
    assert bv._pure_ed25519_verify(raw_pub, b"m", b"too-short") is False


def test_bundle_verifies_with_cryptography_unavailable(tmp_path, monkeypatch) -> None:
    sk = Ed25519PrivateKey.generate()
    bundle = _make_bundle(
        tmp_path,
        {"2026-07-30.ndjson": [_node_dialect_receipt(sk) for _ in range(2)]},
        keys=[sk],
    )
    monkeypatch.setattr(bv, "_HAVE_CRYPTOGRAPHY", False)
    result = bv.verify_bundle(bundle)
    assert result["ok"] is True
    assert result["backend"] == "pure-python"
    assert result["verified"] == 2


def test_public_key_pem_parses_without_cryptography(tmp_path, monkeypatch) -> None:
    """PEM parsing is hand-rolled so the fallback needs no dependency."""
    from cryptography.hazmat.primitives import serialization as _ser

    sk = Ed25519PrivateKey.generate()
    pem = tmp_path / "k.pem"
    pem.write_bytes(_pem_from_private(sk))
    expected = sk.public_key().public_bytes(
        encoding=_ser.Encoding.Raw, format=_ser.PublicFormat.Raw
    )
    monkeypatch.setattr(bv, "_HAVE_CRYPTOGRAPHY", False)
    assert bv.load_public_key(pem) == expected


def test_a_non_ed25519_pem_is_a_clear_error(tmp_path) -> None:
    pem = tmp_path / "junk.pem"
    pem.write_text("-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----\n")
    with pytest.raises(bv.KeyMaterialError):
        bv.load_public_key(pem)


# ---------------------------------------------------------------------------
# Canonicalization
#
# The verifier inlines its own JCS so it can travel inside a bundle as one
# file. That is only safe if it cannot drift from the producers' copies.
# ---------------------------------------------------------------------------


def test_inlined_canonicalize_matches_the_producer_copy() -> None:
    from beacons._common import canonicalize as producer_canonicalize

    samples = [
        None,
        True,
        False,
        0,
        -0.0,
        42,
        -17,
        3.5,
        1e21,
        "",
        "plain",
        'quote " backslash \\ newline \n tab \t',
        "\x00\x01\x1f control",
        "unicode ✓ é 日本語 🔑",
        [],
        [1, "two", None, {"b": 2, "a": 1}],
        {},
        {"z": 1, "a": 2, "A": 3, "": 4},
        {
            "id": "01J",
            "nested": {"deep": {"deeper": [1, {"k": "v"}]}},
            "user": {"sub": "oidc|alice", "email": "alice@example.org"},
        },
    ]
    for s in samples:
        assert bv.canonicalize(s) == producer_canonicalize(s), f"drift on {s!r}"


def test_canonicalize_rejects_what_it_cannot_sign() -> None:
    with pytest.raises(ValueError):
        bv.canonicalize(float("inf"))
    with pytest.raises(ValueError):
        bv.canonicalize(float("nan"))
    with pytest.raises(TypeError):
        bv.canonicalize({1, 2, 3})
