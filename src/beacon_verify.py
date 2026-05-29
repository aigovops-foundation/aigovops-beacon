"""beacon-verify — the auditor-facing receipt verifier.

This is the *only* CLI a third-party auditor, regulator, or downstream
consumer needs to verify a Beacon audit log. It depends on no Foundation
project beyond Beacon itself, and it will never call out to umbrella-govops,
the Foundation policy server, or any networked service.

Usage
-----

    beacon-verify path/to/audit-log.jsonl
    beacon-verify --format=runtime path/to/receipts.ndjson
    beacon-verify --json path/to/log.jsonl       # machine-readable output

Exit codes
----------

    0   verification succeeded for all entries
    1   one or more verification failures
    2   usage error (file missing, format unrecognised)
    3   key material missing or unreadable

Two audit-log formats are supported and auto-detected:

  * ``foundation`` — the chained audit log produced by ``src/audit_log.py``.
    Each entry has ``seq``, ``prev_entry_sha256``, ``entry_sha256``,
    ``signature_ed25519``. The public key is read from ``audit/keys/``.

  * ``runtime`` — OVERT runtime receipts produced by ``beacons/_common.py``.
    Each entry has ``id`` (ULID), ``signature.alg``,
    ``signature.canonical_form``, ``signature.sig_b64``, and
    ``signature.key_fpr``. The public key is loaded from the path given by
    ``--public-key`` or the ``BEACON_PUBLIC_KEY`` environment variable.

Both formats are verified entry-by-entry; the chained format additionally
verifies the hash chain.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
except ImportError as e:  # pragma: no cover
    print(
        "beacon-verify: the `cryptography` package is required.\n"
        "  pip install cryptography",
        file=sys.stderr,
    )
    raise SystemExit(3) from e


# Format detection ---------------------------------------------------------


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
    if isinstance(e.get("signature"), dict) and e["signature"].get("alg") == "ed25519":
        return "runtime"
    raise ValueError(
        "beacon-verify: cannot detect log format. "
        "Expected either 'foundation' (signature_ed25519 + entry_sha256) or "
        "'runtime' (signature.alg=ed25519). First entry keys: "
        f"{sorted(e.keys())}"
    )


# Foundation log ------------------------------------------------------------


def _verify_foundation(
    entries: list[dict[str, Any]],
    *,
    public_key_path: Path | None = None,
) -> dict[str, Any]:
    """Verify the chained audit log produced by src/audit_log.py."""
    # Default key location matches src/audit_log.py
    if public_key_path is None:
        public_key_path = Path("audit/keys/public-key.pem")
    if not public_key_path.exists():
        raise FileNotFoundError(
            f"public key not found at {public_key_path}. "
            f"Pass --public-key or set BEACON_PUBLIC_KEY."
        )
    pub = serialization.load_pem_public_key(public_key_path.read_bytes())
    if not isinstance(pub, Ed25519PublicKey):
        raise ValueError("public key is not Ed25519")

    # Replicate the canonicalization from src/audit_log.py exactly.
    # NOTE: keep this aligned with `canonical_json` in src/audit_log.py.
    def _canonical_json(obj: Any) -> bytes:
        return json.dumps(
            obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")

    # These three fields are excluded from the hash payload, matching
    # HASH_EXCLUDED_FIELDS in src/audit_log.py.
    HASH_EXCLUDED = {"entry_sha256", "signature_ed25519", "key_fingerprint"}
    GENESIS = "GENESIS"  # literal token used for the first entry
    errors: list[str] = []
    prev = GENESIS

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
        body = {k: v for k, v in entry.items() if k not in HASH_EXCLUDED}
        cbytes = _canonical_json(body)
        import hashlib

        digest = hashlib.sha256(cbytes).hexdigest()
        if digest != entry.get("entry_sha256"):
            errors.append(f"hash mismatch at seq {entry.get('seq')}")
        try:
            sig_b64 = entry["signature_ed25519"]
            # src/audit_log.py uses base64url without padding
            sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
            pub.verify(sig, cbytes)
        except KeyError:
            errors.append(f"missing signature_ed25519 at seq {entry.get('seq')}")
        except Exception as exc:
            errors.append(f"signature failure at seq {entry.get('seq')}: {exc}")
        prev = entry.get("entry_sha256", GENESIS)

    return {
        "format": "foundation",
        "ok": not errors,
        "count": len(entries),
        "errors": errors,
    }


# Runtime log ---------------------------------------------------------------


def _verify_runtime(
    entries: list[dict[str, Any]],
    *,
    public_key_path: Path | None = None,
) -> dict[str, Any]:
    """Verify OVERT runtime receipts produced by beacons/_common.py."""
    if public_key_path is None:
        env = os.environ.get("BEACON_PUBLIC_KEY")
        if env:
            public_key_path = Path(env)
        else:
            # Beacons default
            public_key_path = Path(".beacon-keys/public-key.pem")
    if not public_key_path.exists():
        raise FileNotFoundError(
            f"public key not found at {public_key_path}. "
            f"Pass --public-key or set BEACON_PUBLIC_KEY."
        )
    pub = serialization.load_pem_public_key(public_key_path.read_bytes())
    if not isinstance(pub, Ed25519PublicKey):
        raise ValueError("public key is not Ed25519")

    # Use the same canonicalize as runtime — import locally so beacon-verify
    # works even if `beacons` isn't on the path (small fallback below).
    try:
        from beacons._common import canonicalize  # type: ignore
    except ImportError:
        canonicalize = _fallback_canonicalize  # noqa

    errors: list[str] = []
    seen_ids: set[str] = set()

    for i, entry in enumerate(entries):
        sig_block = entry.get("signature")
        if not isinstance(sig_block, dict):
            errors.append(f"entry {i}: missing signature block")
            continue
        if sig_block.get("alg") != "ed25519":
            errors.append(f"entry {i}: unsupported alg {sig_block.get('alg')!r}")
            continue
        if sig_block.get("canonical_form") not in ("json/c14n-rfc8785", None):
            errors.append(
                f"entry {i}: unsupported canonical_form "
                f"{sig_block.get('canonical_form')!r}"
            )
            continue
        body = {k: v for k, v in entry.items() if k != "signature"}
        canon = canonicalize(body).encode("utf-8")
        try:
            sig = base64.b64decode(sig_block["sig_b64"])
            pub.verify(sig, canon)
        except Exception as exc:
            errors.append(f"entry {i} (id={entry.get('id')!r}): signature failure: {exc}")
            continue
        # ULID uniqueness within the file (cheap dup-check)
        rid = entry.get("id")
        if rid and rid in seen_ids:
            errors.append(f"duplicate receipt id {rid!r} at index {i}")
        if rid:
            seen_ids.add(rid)

    return {
        "format": "runtime",
        "ok": not errors,
        "count": len(entries),
        "errors": errors,
    }


def _fallback_canonicalize(value: Any) -> str:
    """Minimal RFC 8785 JCS implementation for environments where `beacons` isn't importable."""
    # NOTE: this is a reduced reimplementation kept in sync with beacons/_common.py.
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            raise ValueError("non-finite number")
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(_fallback_canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        return (
            "{"
            + ",".join(json.dumps(k) + ":" + _fallback_canonicalize(value[k]) for k in keys)
            + "}"
        )
    raise TypeError(f"unsupported type: {type(value).__name__}")


# CLI -----------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="beacon-verify",
        description=(
            "Verify a Beacon audit log. Auto-detects 'foundation' (chained) "
            "or 'runtime' (OVERT) format. Auditor-facing: depends on no "
            "Foundation project beyond Beacon."
        ),
    )
    p.add_argument("log", help="Path to a .jsonl or .ndjson audit log")
    p.add_argument(
        "--format",
        choices=("auto", "foundation", "runtime"),
        default="auto",
        help="Force a specific log format (default: auto-detect).",
    )
    p.add_argument(
        "--public-key",
        type=Path,
        default=None,
        help=(
            "Path to the Ed25519 public key (PEM). Defaults: "
            "audit/keys/public-key.pem for foundation, "
            "$BEACON_PUBLIC_KEY or .beacon-keys/public-key.pem for runtime."
        ),
    )
    p.add_argument(
        "--json", action="store_true", help="Emit a machine-readable JSON report."
    )
    p.add_argument("--quiet", action="store_true", help="Suppress per-error output.")
    args = p.parse_args(argv)

    log_path = Path(args.log)
    if not log_path.exists():
        print(f"beacon-verify: {log_path}: no such file", file=sys.stderr)
        return 2

    try:
        entries = _read_jsonl(log_path)
    except ValueError as e:
        print(f"beacon-verify: {e}", file=sys.stderr)
        return 2

    fmt = args.format if args.format != "auto" else _detect_format(entries)

    try:
        if fmt == "foundation":
            result = _verify_foundation(entries, public_key_path=args.public_key)
        else:
            result = _verify_runtime(entries, public_key_path=args.public_key)
    except FileNotFoundError as e:
        print(f"beacon-verify: {e}", file=sys.stderr)
        return 3

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result["ok"]:
            print(
                f"beacon-verify: OK — {result['count']} entries verified "
                f"({result['format']} format)"
            )
        else:
            print(
                f"beacon-verify: FAILED — {len(result['errors'])} errors in "
                f"{result['count']} entries ({result['format']} format)"
            )
            if not args.quiet:
                for e in result["errors"]:
                    print(f"  ! {e}", file=sys.stderr)

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
