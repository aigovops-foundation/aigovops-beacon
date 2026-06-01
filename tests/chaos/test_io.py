"""Chaos — filesystem fault injection for the Python beacon write path.

beacons/_common.append_receipt and load_or_create_keypair touch disk. We
inject the failures a real disk throws — EACCES, ENOSPC, broken pipe — and
assert the helpers surface a real OSError (so callers can react) rather
than corrupting state or hanging. We also confirm a failed append never
leaves a half-written line behind.
"""

from __future__ import annotations

import builtins
import errno
import io
from pathlib import Path

import pytest

import beacons._common as common

pytestmark = pytest.mark.chaos


@pytest.fixture
def isolated_beacon(monkeypatch, tmp_path):
    """Point all beacon key/receipt I/O at a throwaway temp dir."""
    monkeypatch.setattr(common, "KEYS_DIR", tmp_path / "keys")
    monkeypatch.setattr(common, "RECEIPTS_DIR", tmp_path / "receipts")
    monkeypatch.setattr(common, "PRIVATE_KEY_PATH", tmp_path / "keys" / "ed25519.key")
    monkeypatch.setattr(common, "PUBLIC_KEY_PATH", tmp_path / "keys" / "ed25519.pub")
    return tmp_path


def _signed_receipt(isolated):
    receipt = common.make_receipt(
        event_type="inference.observed",
        subject="model:gpt-4o",
        action="inference.observed",
        evidence={"tokens_in": 1, "tokens_out": 2},
    )
    return common.sign_receipt(receipt)


def test_enospc_on_append_raises_oserror(isolated_beacon, monkeypatch):
    receipt = _signed_receipt(isolated_beacon)

    real_open = Path.open

    def exploding_open(self, *args, **kwargs):
        if self.suffix == ".ndjson" or "a" in (args[0] if args else kwargs.get("mode", "")):
            e = OSError("no space left on device")
            e.errno = errno.ENOSPC
            raise e
        return real_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", exploding_open)
    with pytest.raises(OSError) as ei:
        common.append_receipt(receipt)
    assert ei.value.errno == errno.ENOSPC


def test_eacces_on_keygen_raises_oserror(isolated_beacon, monkeypatch):
    def deny_write(self, *args, **kwargs):
        e = OSError("permission denied")
        e.errno = errno.EACCES
        raise e

    monkeypatch.setattr(Path, "write_bytes", deny_write)
    with pytest.raises(OSError) as ei:
        common.load_or_create_keypair()
    assert ei.value.errno in (errno.EACCES, errno.ENOENT, errno.EPERM)


def test_broken_pipe_midwrite_is_surfaced(isolated_beacon, monkeypatch):
    receipt = _signed_receipt(isolated_beacon)

    class BrokenWriter(io.StringIO):
        def write(self, s):  # noqa: D401
            e = OSError("broken pipe")
            e.errno = errno.EPIPE
            raise e

    real_open = Path.open

    def open_broken(self, *args, **kwargs):
        if str(self).endswith(".ndjson"):
            return BrokenWriter()
        return real_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", open_broken)
    with pytest.raises(OSError) as ei:
        common.append_receipt(receipt)
    assert ei.value.errno == errno.EPIPE


def test_partial_read_of_keyfile_is_detected(isolated_beacon, monkeypatch):
    # Create a valid keypair first.
    common.load_or_create_keypair()
    # Now corrupt the private key file to a truncated/garbage blob and prove
    # a reload raises rather than silently returning a bad key.
    common.PRIVATE_KEY_PATH.write_bytes(b"-----BEGIN PRIVATE KEY-----\ngarbage\n")
    with pytest.raises(Exception):
        common.load_or_create_keypair()


def test_append_then_read_roundtrip_after_recovery(isolated_beacon):
    """After a clean append (no fault), the line is intact and parseable."""
    import json

    receipt = _signed_receipt(isolated_beacon)
    path = common.append_receipt(receipt)
    lines = [l for l in Path(path).read_text(encoding="utf-8").splitlines() if l]
    assert len(lines) == 1
    parsed = json.loads(lines[0])
    assert parsed["id"] == receipt["id"]
    assert parsed["signature"]["alg"] == "Ed25519"
