"""
beacons/_common.py — Shared signing, canonicalization, and receipt I/O.

Every beacon (model, prompt, artifact) emits Ed25519-signed receipts in
NDJSON format under ~/.beacon/receipts/YYYY-MM-DD.ndjson. This module
provides:

  • load_or_create_keypair()         — Ed25519 keypair in ~/.beacon/keys/
  • canonicalize(value)              — RFC 8785 JSON Canonicalization Scheme
                                       (Python port of server/src/lib/canonical.js)
  • sign_receipt(payload)            — returns a dict with a `signature` block
  • append_receipt(receipt)          — atomic line-append to today's NDJSON
  • new_ulid()                       — Crockford Base32 ULID
  • key_fingerprint(public_key)      — SSH-style SHA256 fingerprint

The receipt schema matches docs/RECEIPT_SCHEMA.md.
"""

from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BEACON_HOME = Path(os.environ.get("BEACON_HOME", Path.home() / ".beacon"))
KEYS_DIR = BEACON_HOME / "keys"
RECEIPTS_DIR = BEACON_HOME / "receipts"
PRIVATE_KEY_PATH = KEYS_DIR / "ed25519.key"
PUBLIC_KEY_PATH = KEYS_DIR / "ed25519.pub"


# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------

def _ensure_dirs() -> None:
    KEYS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    RECEIPTS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)


def load_or_create_keypair() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """Load Ed25519 keypair from ~/.beacon/keys/, generating it if missing."""
    _ensure_dirs()
    if PRIVATE_KEY_PATH.exists():
        priv_bytes = PRIVATE_KEY_PATH.read_bytes()
        priv = serialization.load_pem_private_key(priv_bytes, password=None)
        assert isinstance(priv, Ed25519PrivateKey)
    else:
        priv = Ed25519PrivateKey.generate()
        PRIVATE_KEY_PATH.write_bytes(
            priv.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        try:
            PRIVATE_KEY_PATH.chmod(0o600)
        except OSError:
            pass
    pub = priv.public_key()
    if not PUBLIC_KEY_PATH.exists():
        PUBLIC_KEY_PATH.write_bytes(
            pub.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
    return priv, pub


def key_fingerprint(pub: Ed25519PublicKey) -> str:
    """SSH-style SHA256 fingerprint of the raw public key."""
    raw = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    digest = hashlib.sha256(raw).digest()
    return "SHA256:" + base64.b64encode(digest).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------
# RFC 8785 JCS — Python port of server/src/lib/canonical.js
# ---------------------------------------------------------------------------

_HEX = "0123456789abcdef"


def canonicalize(value: Any) -> str:
    """Return the RFC 8785 canonical JSON string for `value`."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return _encode_string(value)
    if isinstance(value, bool):  # pragma: no cover — handled above
        return "true" if value else "false"
    if isinstance(value, int):
        return _encode_number(value)
    if isinstance(value, float):
        return _encode_number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        return (
            "{"
            + ",".join(_encode_string(k) + ":" + canonicalize(value[k]) for k in keys)
            + "}"
        )
    raise TypeError(f"canonicalize: unsupported type {type(value).__name__}")


def _encode_number(n: float | int) -> str:
    if isinstance(n, float):
        if n != n or n in (float("inf"), float("-inf")):
            raise ValueError("canonicalize: non-finite number rejected")
        if n == 0:
            return "0"
        if n.is_integer() and abs(n) < 1e21:
            return str(int(n))
        return repr(n)
    if n == 0:
        return "0"
    return str(n)


def _encode_string(s: str) -> str:
    out = ['"']
    for ch in s:
        c = ord(ch)
        if c == 0x22:
            out.append('\\"')
        elif c == 0x5C:
            out.append("\\\\")
        elif c == 0x08:
            out.append("\\b")
        elif c == 0x09:
            out.append("\\t")
        elif c == 0x0A:
            out.append("\\n")
        elif c == 0x0C:
            out.append("\\f")
        elif c == 0x0D:
            out.append("\\r")
        elif c < 0x20:
            out.append("\\u00" + _HEX[(c >> 4) & 0xF] + _HEX[c & 0xF])
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


# ---------------------------------------------------------------------------
# Receipt helpers
# ---------------------------------------------------------------------------

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_ulid() -> str:
    """Generate a Crockford Base32 ULID."""
    ts_ms = int(time.time() * 1000)
    ts_bytes = ts_ms.to_bytes(6, "big")
    rand_bytes = secrets.token_bytes(10)
    raw = ts_bytes + rand_bytes  # 16 bytes
    # Encode 128 bits in 26 Crockford chars
    n = int.from_bytes(raw, "big")
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[n & 0x1F])
        n >>= 5
    return "".join(reversed(chars))


def utc_now_iso() -> str:
    """RFC 3339, UTC, millisecond precision."""
    now = _dt.datetime.now(_dt.timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return "sha256:" + hashlib.sha256(data).hexdigest()


def sign_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    """Add a `signature` block. Mutates and returns `payload`."""
    priv, pub = load_or_create_keypair()
    body = {k: v for k, v in payload.items() if k != "signature"}
    canonical = canonicalize(body).encode("utf-8")
    sig = priv.sign(canonical)
    payload["signature"] = {
        "alg": "Ed25519",
        "key_fpr": key_fingerprint(pub),
        "sig_b64": base64.b64encode(sig).decode("ascii"),
        "canonical_form": "json/c14n-rfc8785",
    }
    return payload


def append_receipt(receipt: dict[str, Any]) -> Path:
    """Append a signed receipt to today's NDJSON. Returns the file path."""
    _ensure_dirs()
    day = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    path = RECEIPTS_DIR / f"{day}.ndjson"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(receipt, ensure_ascii=False, sort_keys=False) + "\n")
    return path


def make_receipt(
    *,
    event_type: str,
    subject: str,
    action: str,
    evidence: dict[str, Any],
    user: dict[str, str] | None = None,
    environment: str = "on_prem",
    vendor: str = "in-house",
    model: str = "n/a",
    version: str = "n/a",
    parent_receipt_id: str | None = None,
) -> dict[str, Any]:
    """Construct a base receipt that conforms to docs/RECEIPT_SCHEMA.md.

    `evidence` is hashed in canonical form and stored only as a hash by default;
    beacons never record raw payloads.
    """
    evidence_canonical = canonicalize(evidence).encode("utf-8")
    receipt: dict[str, Any] = {
        "id": new_ulid(),
        "ts_utc": utc_now_iso(),
        "user": user or {"sub": "beacon-agent", "email": "beacon@localhost", "oidc_issuer": "local"},
        "vendor": vendor,
        "model": model,
        "version": version,
        "prompt": None,
        "prompt_hash": sha256_hex(""),
        "result": None,
        "result_hash": sha256_hex(""),
        "event_type": event_type,
        "environment": environment,
        "subject": subject,
        "action": action,
        "evidence_sha256": sha256_hex(evidence_canonical),
        "evidence_meta": evidence,  # metadata only — no payloads
    }
    if parent_receipt_id:
        receipt["parent_receipt_id"] = parent_receipt_id
    return receipt
