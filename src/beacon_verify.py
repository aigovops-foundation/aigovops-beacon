"""beacon-verify — the auditor-facing evidence verifier.

This is the *only* CLI a third-party auditor, regulator, or downstream
consumer needs to verify Beacon evidence. It depends on no Foundation
project beyond Beacon itself, it will never call out to umbrella-govops,
the Foundation policy server, or any networked service, and it is a single
self-contained file: a copy of it is dropped into every audit bundle, so
the bundle can be verified by someone who has never installed Beacon.

If ``cryptography`` is importable it is used. If it is not, a pure-Python
RFC 8032 Ed25519 verifier in this file is used instead, so the only hard
requirement is a Python 3.10 interpreter.

Usage
-----

    beacon-verify path/to/bundle/               # whole audit bundle
    beacon-verify path/to/audit-log.jsonl       # a single log file
    beacon-verify --format=runtime path/to/receipts.ndjson
    beacon-verify --json path/to/bundle/        # machine-readable output

Exit codes
----------

    0   verification succeeded for everything checked
    1   one or more verification failures
    2   usage error (file missing, format unrecognised)
    3   key material missing or unreadable

Inputs
------

**A bundle directory** — as produced by ``POST /api/v1/export`` or
``beacon verify``'s sibling ``server/src/services/export.js``. Contains
``manifest.json``, ``manifest.sha256``, ``receipts/*.ndjson`` and
``public_keys/<fingerprint>.pem``. Every receipt is verified against the
key named by its own ``signature.key_fpr``, so bundles that span a key
rotation verify correctly.

**A single log file**, in either of two formats, auto-detected:

  * ``foundation`` — the chained audit log produced by ``src/audit_log.py``.
    Each entry has ``seq``, ``prev_entry_sha256``, ``entry_sha256``,
    ``signature_ed25519``. The public key is read from ``audit/keys/``.

  * ``runtime`` — OVERT receipts as specified in ``docs/RECEIPT_SCHEMA.md``
    and produced by ``beacons/_common.py`` and by the Node server. Each
    entry has ``id`` (ULID) and a ``signature`` block. The public key comes
    from ``--public-key`` or ``$BEACON_PUBLIC_KEY``.

Dialect tolerance
-----------------

Beacon's producers do not agree on how to spell the fields *around* the
signature. ``docs/RECEIPT_SCHEMA.md`` says ``alg: "Ed25519"`` and
``canonical_form: "json/c14n-rfc8785"``; the Node server emits
``canonical_form: "RFC8785"`` and a 16-hex-character key fingerprint where
the schema calls for an SSH-style ``SHA256:`` one. An auditor should not be
handed an error message about a spelling difference, so this verifier
accepts every spelling any Beacon producer emits and normalises them.

What it will *not* do is relax the check that matters: the Ed25519
signature must verify over the RFC 8785 canonical bytes of the receipt with
its ``signature`` block removed. That is the whole point.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Ed25519 verification backend
#
# Preferred: `cryptography`. Fallback: the pure-Python implementation below,
# so a bundle stays verifiable on a machine with a bare Python and no network
# to install anything from.
# ---------------------------------------------------------------------------

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    _HAVE_CRYPTOGRAPHY = True
except ImportError:  # pragma: no cover — exercised by forcing the fallback
    _HAVE_CRYPTOGRAPHY = False


# --- pure-Python Ed25519 (RFC 8032 §6 reference construction) --------------
#
# Verification only; this file never signs anything. Kept deliberately close
# to the reference code in RFC 8032 so it can be read and checked against the
# spec line by line. It is slower than `cryptography` by roughly two orders of
# magnitude, which is irrelevant for the bundle sizes an auditor reviews and
# is the price of having no dependencies at all.

_P = 2**255 - 19
_Q = 2**252 + 27742317777372353535851937790883648493


def _modp_inv(x: int) -> int:
    return pow(x, _P - 2, _P)


_D = -121665 * _modp_inv(121666) % _P
_MODP_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _sha512_modq(s: bytes) -> int:
    return int.from_bytes(hashlib.sha512(s).digest(), "little") % _Q


# Points are (X, Y, Z, T) in extended coordinates: x = X/Z, y = Y/Z, xy = T/Z.


def _point_add(p: tuple, q: tuple) -> tuple:
    a = (p[1] - p[0]) * (q[1] - q[0]) % _P
    b = (p[1] + p[0]) * (q[1] + q[0]) % _P
    c = 2 * p[3] * q[3] * _D % _P
    d = 2 * p[2] * q[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _point_mul(s: int, p: tuple) -> tuple:
    out = (0, 1, 1, 0)  # neutral element
    while s > 0:
        if s & 1:
            out = _point_add(out, p)
        p = _point_add(p, p)
        s >>= 1
    return out


def _point_equal(p: tuple, q: tuple) -> bool:
    if (p[0] * q[2] - q[0] * p[2]) % _P != 0:
        return False
    return (p[1] * q[2] - q[1] * p[2]) % _P == 0


def _recover_x(y: int, sign: int) -> int | None:
    if y >= _P:
        return None
    x2 = (y * y - 1) * _modp_inv(_D * y * y + 1) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _MODP_SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_G_Y = 4 * _modp_inv(5) % _P
_G_X = _recover_x(_G_Y, 0)
assert _G_X is not None
_G = (_G_X, _G_Y, 1, _G_X * _G_Y % _P)


def _point_decompress(s: bytes) -> tuple | None:
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def _pure_ed25519_verify(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """Return True iff `signature` is a valid Ed25519 signature. Never raises."""
    if len(public_key) != 32 or len(signature) != 64:
        return False
    a = _point_decompress(public_key)
    if a is None:
        return False
    r_bytes = signature[:32]
    r = _point_decompress(r_bytes)
    if r is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= _Q:
        return False
    h = _sha512_modq(r_bytes + public_key + message)
    return _point_equal(_point_mul(s, _G), _point_add(r, _point_mul(h, a)))


def _verify_signature(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """Verify an Ed25519 signature over `message` with a raw 32-byte key."""
    if _HAVE_CRYPTOGRAPHY:
        try:
            Ed25519PublicKey.from_public_bytes(public_key).verify(signature, message)
            return True
        except Exception:
            return False
    return _pure_ed25519_verify(public_key, message, signature)


def backend_name() -> str:
    return "cryptography" if _HAVE_CRYPTOGRAPHY else "pure-python"


# ---------------------------------------------------------------------------
# RFC 8785 JSON Canonicalization Scheme
#
# Kept byte-identical to `beacons/_common.canonicalize` and
# `server/src/lib/canonical.js`; `tests/test_beacon_verify.py` asserts the
# equivalence so the three cannot drift apart silently. Inlined rather than
# imported because this file has to stand alone inside a bundle.
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
    if isinstance(value, (int, float)):
        return _encode_number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        return (
            "{"
            + ",".join(
                _encode_string(k) + ":" + canonicalize(value[k])
                for k in sorted(value.keys())
            )
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
# Key material
# ---------------------------------------------------------------------------

# DER SubjectPublicKeyInfo prefix for an Ed25519 key: the 32 raw bytes follow.
_SPKI_ED25519_PREFIX = binascii.unhexlify("302a300506032b6570032100")


class KeyMaterialError(Exception):
    """Raised when a public key cannot be read or is not Ed25519."""


def load_public_key(path: Path) -> bytes:
    """Load a PEM SubjectPublicKeyInfo Ed25519 key as its 32 raw bytes.

    Parsed without `cryptography` so the fallback path needs no dependency.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise KeyMaterialError(f"{path}: {exc}") from exc

    body = "".join(
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.startswith("-----")
    )
    try:
        der = base64.b64decode(body, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise KeyMaterialError(f"{path}: not valid PEM base64") from exc

    if len(der) == 32:
        # Already raw — tolerated, though no Beacon producer writes this.
        return der
    if not der.startswith(_SPKI_ED25519_PREFIX) or len(der) != 44:
        raise KeyMaterialError(
            f"{path}: not an Ed25519 SubjectPublicKeyInfo key "
            f"({len(der)} DER bytes)"
        )
    return der[-32:]


def fingerprints(raw_public_key: bytes) -> list[str]:
    """Every fingerprint spelling a Beacon producer might use for this key.

    ``docs/RECEIPT_SCHEMA.md`` specifies the SSH-style form; the Node server
    emits the first 16 hex characters of the same digest instead. Both are
    derived here so a receipt can be matched to a key either way.
    """
    digest = hashlib.sha256(raw_public_key).digest()
    ssh_style = "SHA256:" + base64.b64encode(digest).rstrip(b"=").decode("ascii")
    hex_short = digest.hex()[:16]
    return [ssh_style, hex_short, digest.hex()]


class KeyRing:
    """The public keys available for verification, indexed by fingerprint."""

    def __init__(self) -> None:
        self._by_fpr: dict[str, bytes] = {}
        self._order: list[tuple[str, bytes]] = []

    def add(self, raw: bytes, *, label: str | None = None) -> None:
        fprs = fingerprints(raw)
        for f in fprs:
            self._by_fpr[f] = raw
        if label:
            self._by_fpr[label] = raw
        # Report the key by the name the auditor can see on disk when there is
        # one, falling back to the schema's SSH-style fingerprint.
        self._order.append((label or fprs[0], raw))

    def get(self, key_fpr: str | None) -> tuple[bytes | None, str | None]:
        """Resolve a receipt's `key_fpr` to a raw key.

        Returns ``(key, note)``. ``note`` is set when the key was resolved by
        something other than an exact fingerprint match, so the report can say
        so out loud rather than quietly papering over a mismatch.
        """
        if key_fpr and key_fpr in self._by_fpr:
            return self._by_fpr[key_fpr], None
        if len(self._order) == 1:
            # One key in the bundle and an unrecognised fingerprint spelling.
            # Try it anyway: the signature check below is what decides, and a
            # spelling difference should not read as a verification failure.
            only_fpr, only_key = self._order[0]
            return only_key, (
                f"key_fpr {key_fpr!r} not indexed; used the bundle's only key "
                f"({only_fpr})"
            )
        return None, None

    def __len__(self) -> int:
        return len(self._order)

    @property
    def labels(self) -> list[str]:
        return [f for f, _ in self._order]


def _load_keyring_from_dir(directory: Path) -> KeyRing:
    ring = KeyRing()
    for pem in sorted(directory.glob("*.pem")):
        ring.add(load_public_key(pem), label=pem.stem)
    return ring


# ---------------------------------------------------------------------------
# Reading logs
# ---------------------------------------------------------------------------


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}:{n}: invalid JSON: {e}") from e
    return entries


def _detect_format(entries: list[dict[str, Any]]) -> str:
    """Return 'foundation' or 'runtime' based on the first entry's shape."""
    if not entries:
        return "runtime"  # treat empty as runtime; we just say "ok, 0 entries"
    e = entries[0]
    if "signature_ed25519" in e and "entry_sha256" in e and "seq" in e:
        return "foundation"
    if isinstance(e.get("signature"), dict):
        return "runtime"
    raise ValueError(
        "beacon-verify: cannot detect log format. "
        "Expected either 'foundation' (signature_ed25519 + entry_sha256) or "
        "'runtime' (a `signature` object). First entry keys: "
        f"{sorted(e.keys())}"
    )


# ---------------------------------------------------------------------------
# Foundation (chained) log
# ---------------------------------------------------------------------------

# Excluded from the hash payload, matching HASH_EXCLUDED_FIELDS in
# src/audit_log.py.
_HASH_EXCLUDED = {"entry_sha256", "signature_ed25519", "key_fingerprint"}
_GENESIS = "GENESIS"


def _canonical_json_compact(obj: Any) -> bytes:
    """The canonicalization used by src/audit_log.py. Keep the two aligned."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def _verify_foundation(
    entries: list[dict[str, Any]],
    *,
    public_key_path: Path | None = None,
) -> dict[str, Any]:
    """Verify the chained audit log produced by src/audit_log.py."""
    if public_key_path is None:
        public_key_path = Path("audit/keys/public-key.pem")
    if not public_key_path.exists():
        raise KeyMaterialError(
            f"public key not found at {public_key_path}. "
            f"Pass --public-key or set BEACON_PUBLIC_KEY."
        )
    pub = load_public_key(public_key_path)

    errors: list[str] = []
    prev = _GENESIS

    for i, entry in enumerate(entries):
        expected_seq = i + 1
        if entry.get("seq") != expected_seq:
            errors.append(
                f"seq mismatch at index {i}: got {entry.get('seq')}, want {expected_seq}"
            )
        if entry.get("prev_entry_sha256") != prev:
            errors.append(
                f"chain break at seq {entry.get('seq')}: "
                f"prev_entry_sha256={entry.get('prev_entry_sha256')!r}, expected {prev!r}"
            )
        body = {k: v for k, v in entry.items() if k not in _HASH_EXCLUDED}
        cbytes = _canonical_json_compact(body)
        if hashlib.sha256(cbytes).hexdigest() != entry.get("entry_sha256"):
            errors.append(f"hash mismatch at seq {entry.get('seq')}")
        sig_b64 = entry.get("signature_ed25519")
        if not sig_b64:
            errors.append(f"missing signature_ed25519 at seq {entry.get('seq')}")
        else:
            # src/audit_log.py uses base64url without padding.
            try:
                sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
            except (binascii.Error, ValueError):
                errors.append(f"undecodable signature at seq {entry.get('seq')}")
            else:
                if not _verify_signature(pub, cbytes, sig):
                    errors.append(f"signature failure at seq {entry.get('seq')}")
        prev = entry.get("entry_sha256", _GENESIS)

    return {
        "format": "foundation",
        "ok": not errors,
        "count": len(entries),
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Runtime (OVERT receipt) log
# ---------------------------------------------------------------------------

# The schema says `Ed25519`; comparison is case-insensitive so every producer
# spelling is accepted.
_ACCEPTED_ALGS = {"ed25519"}

# `docs/RECEIPT_SCHEMA.md` specifies `json/c14n-rfc8785`. The Node server
# writes `RFC8785` for the identical canonicalization. Both name RFC 8785, and
# RFC 8785 is the only canonical form Beacon has ever signed under.
_ACCEPTED_CANONICAL_FORMS = {"json/c14n-rfc8785", "rfc8785", "json/rfc8785", ""}


def _verify_receipts(
    entries: list[dict[str, Any]],
    keyring: KeyRing,
    *,
    source: str = "",
    seen_ids: set[str] | None = None,
) -> tuple[int, list[str], list[str]]:
    """Verify OVERT receipts. Returns (verified_count, errors, notes)."""
    errors: list[str] = []
    notes: list[str] = []
    if seen_ids is None:
        seen_ids = set()
    verified = 0
    where = f"{source}:" if source else "entry "

    for i, entry in enumerate(entries):
        label = f"{where}{i}" if source else f"entry {i}"
        sig_block = entry.get("signature")
        if not isinstance(sig_block, dict):
            errors.append(f"{label}: missing signature block")
            continue

        alg = str(sig_block.get("alg", "")).lower()
        if alg not in _ACCEPTED_ALGS:
            errors.append(f"{label}: unsupported alg {sig_block.get('alg')!r}")
            continue

        canon_form = str(sig_block.get("canonical_form") or "").lower()
        if canon_form not in _ACCEPTED_CANONICAL_FORMS:
            errors.append(
                f"{label}: unsupported canonical_form "
                f"{sig_block.get('canonical_form')!r}"
            )
            continue

        key_fpr = sig_block.get("key_fpr")
        pub, note = keyring.get(key_fpr)
        if pub is None:
            errors.append(
                f"{label}: no public key for key_fpr {key_fpr!r} "
                f"(bundle carries {len(keyring)}: {', '.join(keyring.labels)})"
            )
            continue
        if note and note not in notes:
            notes.append(note)

        try:
            sig = base64.b64decode(str(sig_block.get("sig_b64", "")), validate=True)
        except (binascii.Error, ValueError):
            errors.append(f"{label}: sig_b64 is not valid base64")
            continue

        body = {k: v for k, v in entry.items() if k != "signature"}
        try:
            canon = canonicalize(body).encode("utf-8")
        except (TypeError, ValueError) as exc:
            errors.append(f"{label}: cannot canonicalize: {exc}")
            continue

        if not _verify_signature(pub, canon, sig):
            errors.append(
                f"{label} (id={entry.get('id')!r}): signature does not verify"
            )
            continue

        rid = entry.get("id")
        if rid:
            if rid in seen_ids:
                errors.append(f"{label}: duplicate receipt id {rid!r}")
            seen_ids.add(rid)
        verified += 1

    return verified, errors, notes


def _verify_runtime(
    entries: list[dict[str, Any]],
    *,
    public_key_path: Path | None = None,
) -> dict[str, Any]:
    """Verify OVERT receipts from a single log file."""
    if public_key_path is None:
        env = os.environ.get("BEACON_PUBLIC_KEY")
        public_key_path = Path(env) if env else Path(".beacon-keys/public-key.pem")
    if not public_key_path.exists():
        raise KeyMaterialError(
            f"public key not found at {public_key_path}. "
            f"Pass --public-key or set BEACON_PUBLIC_KEY."
        )
    ring = KeyRing()
    ring.add(load_public_key(public_key_path), label=public_key_path.stem)

    verified, errors, notes = _verify_receipts(entries, ring)
    return {
        "format": "runtime",
        "ok": not errors,
        "count": len(entries),
        "verified": verified,
        "errors": errors,
        "notes": notes,
        "backend": backend_name(),
    }


# ---------------------------------------------------------------------------
# Bundle
# ---------------------------------------------------------------------------


def looks_like_bundle(path: Path) -> bool:
    return path.is_dir() and (path / "manifest.json").is_file()


def _check_manifest_digest(bundle: Path) -> dict[str, Any]:
    """Check `manifest.sha256` against `manifest.json`.

    Two digests are accepted. `sha256sum -c` semantics means the digest of the
    file's bytes, which is what a bundle should carry. Bundles exported before
    that was fixed recorded the digest of the manifest's *canonical* form
    instead; those still verify, and the report says which one matched.
    """
    manifest_path = bundle / "manifest.json"
    digest_path = bundle / "manifest.sha256"
    raw = manifest_path.read_bytes()
    file_digest = hashlib.sha256(raw).hexdigest()

    try:
        canonical_digest = hashlib.sha256(
            canonicalize(json.loads(raw)).encode("utf-8")
        ).hexdigest()
    except (json.JSONDecodeError, TypeError, ValueError):
        canonical_digest = None

    if not digest_path.exists():
        return {"present": False, "ok": None, "note": "manifest.sha256 not present"}

    recorded = digest_path.read_text(encoding="utf-8").split()
    recorded_digest = recorded[0].lower() if recorded else ""

    if recorded_digest == file_digest:
        return {"present": True, "ok": True, "over": "file", "sha256": file_digest}
    if canonical_digest and recorded_digest == canonical_digest:
        return {
            "present": True,
            "ok": True,
            "over": "canonical",
            "sha256": canonical_digest,
            "note": (
                "manifest.sha256 records the digest of the manifest's canonical "
                "form, not of manifest.json's bytes — `sha256sum -c` will report "
                "a mismatch on this bundle even though it is intact"
            ),
        }
    return {
        "present": True,
        "ok": False,
        "recorded": recorded_digest,
        "file_sha256": file_digest,
        "canonical_sha256": canonical_digest,
    }


def verify_bundle(bundle: Path, *, extra_key: Path | None = None) -> dict[str, Any]:
    """Verify a whole audit bundle directory."""
    manifest_path = bundle / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"{bundle}: no manifest.json — not a Beacon audit bundle")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{manifest_path}: invalid JSON: {exc}") from exc

    manifest_check = _check_manifest_digest(bundle)

    key_dir = bundle / "public_keys"
    ring = _load_keyring_from_dir(key_dir) if key_dir.is_dir() else KeyRing()
    if extra_key is not None:
        ring.add(load_public_key(extra_key), label=extra_key.stem)
    if len(ring) == 0:
        raise KeyMaterialError(
            f"{bundle}: no public keys found in {key_dir}. "
            f"Pass --public-key to supply one out of band."
        )

    receipt_dir = bundle / "receipts"
    files = sorted(receipt_dir.glob("*.ndjson")) if receipt_dir.is_dir() else []

    errors: list[str] = []
    notes: list[str] = []
    seen_ids: set[str] = set()
    per_file: dict[str, int] = {}
    total = 0
    verified = 0

    for f in files:
        try:
            entries = _read_jsonl(f)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        n_ok, errs, file_notes = _verify_receipts(
            entries, ring, source=f"receipts/{f.name}", seen_ids=seen_ids
        )
        per_file[f.name] = len(entries)
        total += len(entries)
        verified += n_ok
        errors.extend(errs)
        for note in file_notes:
            if note not in notes:
                notes.append(note)

    if not files:
        notes.append("bundle contains no receipts/*.ndjson files")

    # Cross-check the manifest's own claim about how many receipts it carries.
    declared = manifest.get("receipt_files")
    if isinstance(declared, dict):
        for name, count in declared.items():
            actual = per_file.get(name)
            if actual is None:
                errors.append(
                    f"manifest declares receipt file {name!r}, which is not in the bundle"
                )
            elif actual != count:
                errors.append(
                    f"{name}: manifest declares {count} receipts, file holds {actual}"
                )

    if manifest_check.get("ok") is False:
        errors.append(
            "manifest.sha256 does not match manifest.json "
            f"(recorded {manifest_check.get('recorded')!r})"
        )
    if manifest_check.get("note"):
        notes.append(manifest_check["note"])

    return {
        "format": "bundle",
        "ok": not errors,
        "bundle": str(bundle),
        "count": total,
        "verified": verified,
        "files": per_file,
        "keys": ring.labels,
        "manifest": manifest_check,
        "generated_at_utc": manifest.get("generated_at_utc"),
        "beacon_version": manifest.get("beacon_version"),
        "errors": errors,
        "notes": notes,
        "backend": backend_name(),
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_report(result: dict[str, Any], *, quiet: bool, out: Callable[[str], None]) -> None:
    fmt = result["format"]
    if result["ok"]:
        n = result.get("verified", result["count"])
        out(f"beacon-verify: OK — {n} receipts verified ({fmt} format)")
    else:
        out(
            f"beacon-verify: FAILED — {len(result['errors'])} problems in "
            f"{result['count']} entries ({fmt} format)"
        )

    if fmt == "bundle":
        out(f"  bundle:   {result['bundle']}")
        m = result["manifest"]
        if m.get("ok") is True:
            out(f"  manifest: intact (sha256 {m['sha256'][:16]}…, over {m['over']})")
        elif m.get("ok") is False:
            out("  manifest: MISMATCH")
        else:
            out("  manifest: no manifest.sha256 to check")
        out(f"  keys:     {len(result['keys'])} ({', '.join(result['keys'])})")
        for name, count in result["files"].items():
            out(f"  receipts: {name} ({count})")
        if result.get("generated_at_utc"):
            out(f"  exported: {result['generated_at_utc']}")
    out(f"  backend:  {result.get('backend', backend_name())}")

    for note in result.get("notes", []):
        out(f"  note:     {note}")

    if not result["ok"] and not quiet:
        for e in result["errors"]:
            print(f"  ! {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="beacon-verify",
        description=(
            "Verify Beacon evidence. Give it an audit bundle directory, or a "
            "single audit log ('foundation' chained or 'runtime' OVERT receipts, "
            "auto-detected). Auditor-facing: no network, no install of Beacon, "
            "and no dependency beyond Python 3 itself."
        ),
    )
    p.add_argument(
        "target",
        metavar="BUNDLE_DIR|LOG_FILE",
        help="Path to an audit bundle directory, or a .jsonl/.ndjson audit log",
    )
    p.add_argument(
        "--format",
        choices=("auto", "bundle", "foundation", "runtime"),
        default="auto",
        help="Force a specific input format (default: auto-detect).",
    )
    p.add_argument(
        "--public-key",
        type=Path,
        default=None,
        help=(
            "Path to an Ed25519 public key (PEM). For a bundle this is an "
            "addition to the keys the bundle already carries. Defaults for a "
            "single log: audit/keys/public-key.pem for foundation, "
            "$BEACON_PUBLIC_KEY or .beacon-keys/public-key.pem for runtime."
        ),
    )
    p.add_argument(
        "--json", action="store_true", help="Emit a machine-readable JSON report."
    )
    p.add_argument("--quiet", action="store_true", help="Suppress per-error output.")
    args = p.parse_args(argv)

    target = Path(args.target)
    if not target.exists():
        print(f"beacon-verify: {target}: no such file or directory", file=sys.stderr)
        return 2

    fmt = args.format
    if fmt == "auto" and (target.is_dir() or looks_like_bundle(target)):
        fmt = "bundle"

    try:
        if fmt == "bundle":
            result = verify_bundle(target, extra_key=args.public_key)
        else:
            if target.is_dir():
                print(
                    f"beacon-verify: {target} is a directory; "
                    f"--format={fmt} expects a single log file",
                    file=sys.stderr,
                )
                return 2
            entries = _read_jsonl(target)
            if fmt == "auto":
                fmt = _detect_format(entries)
            if fmt == "foundation":
                result = _verify_foundation(entries, public_key_path=args.public_key)
            else:
                result = _verify_runtime(entries, public_key_path=args.public_key)
    except ValueError as exc:
        print(f"beacon-verify: {exc}", file=sys.stderr)
        return 2
    except (KeyMaterialError, FileNotFoundError) as exc:
        print(f"beacon-verify: {exc}", file=sys.stderr)
        return 3
    except OSError as exc:
        print(f"beacon-verify: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        _print_report(result, quiet=args.quiet, out=print)

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
