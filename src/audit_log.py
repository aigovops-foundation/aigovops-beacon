"""
AiGovOps Foundation cryptokey-receipted audit logger.

Every meaningful action on this repo appends a signed JSON line to
audit/audit-log.jsonl. Each entry includes:
  - seq                : monotonic counter starting at 1
  - timestamp_utc      : ISO 8601 UTC
  - user, user_email   : human operator
  - model, platform    : AI assistant identity (if applicable)
  - thread_id          : conversational session id (if applicable)
  - action             : short verb like "build_lab_100"
  - prompt             : verbatim user request or summary
  - result             : short outcome
  - assets             : list of files touched
  - git_sha            : git commit SHA the entry refers to (if any)
  - prev_entry_sha256  : "GENESIS" for entry 1, else previous entry_sha256
  - entry_sha256       : SHA-256 over canonical JSON of the entry,
                         excluding entry_sha256 / signature_ed25519 / key_fingerprint
  - signature_ed25519  : Ed25519 signature over the canonical bytes (base64-url-no-pad)
  - key_fingerprint    : first 16 bytes of SHA-256(public_key_der) as base64-url-no-pad

Layout:
  audit/keys/public-key.pem    committed
  audit/keys/private-key.pem   gitignored
  audit/audit-log.jsonl        committed

Verify the chain without any non-stdlib deps other than `cryptography`:
  python -m src.audit_log verify

This file is the canonical Foundation pattern. Reuse across Foundation repos.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
except ImportError:  # pragma: no cover
    print(
        "ERROR: `cryptography` is required. Install with: pip install cryptography",
        file=sys.stderr,
    )
    sys.exit(2)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
AUDIT_DIR = REPO_ROOT / "audit"
KEYS_DIR = AUDIT_DIR / "keys"
PRIVATE_KEY_PATH = KEYS_DIR / "private-key.pem"
PUBLIC_KEY_PATH = KEYS_DIR / "public-key.pem"
LOG_PATH = AUDIT_DIR / "audit-log.jsonl"

# Fields excluded from the canonical hash. Their values are produced AFTER
# the hash, so they must not be inputs to it.
HASH_EXCLUDED_FIELDS = {"entry_sha256", "signature_ed25519", "key_fingerprint"}

GENESIS = "GENESIS"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def b64u(data: bytes) -> str:
    """URL-safe base64 with no padding (RFC 4648 section 5)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def canonical_json(obj: Any) -> bytes:
    """Deterministic JSON serialization: sorted keys, no whitespace, UTF-8."""
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_sha_for(path: Path | None = None) -> str | None:
    """Return the current git HEAD SHA, or None if not a git repo."""
    try:
        cmd = ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()
        return out or None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Keys
# ---------------------------------------------------------------------------


def init_keys(force: bool = False) -> dict:
    """Generate a new Ed25519 keypair and write PEM files."""
    KEYS_DIR.mkdir(parents=True, exist_ok=True)

    if PRIVATE_KEY_PATH.exists() and not force:
        raise SystemExit(
            f"Refusing to overwrite existing key at {PRIVATE_KEY_PATH}. "
            "Pass --force to regenerate (this BREAKS the existing chain — "
            "you must archive the prior log first)."
        )

    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()

    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    PRIVATE_KEY_PATH.write_bytes(priv_pem)
    PRIVATE_KEY_PATH.chmod(0o600)
    PUBLIC_KEY_PATH.write_bytes(pub_pem)

    fp = fingerprint_of(pub)
    return {
        "private_key": str(PRIVATE_KEY_PATH),
        "public_key": str(PUBLIC_KEY_PATH),
        "fingerprint": fp,
    }


def load_private_key() -> Ed25519PrivateKey:
    if not PRIVATE_KEY_PATH.exists():
        raise SystemExit(
            f"Private key not found at {PRIVATE_KEY_PATH}. "
            "Run: python -m src.audit_log init-keys"
        )
    pem = PRIVATE_KEY_PATH.read_bytes()
    key = serialization.load_pem_private_key(pem, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit("Private key is not Ed25519.")
    return key


def load_public_key() -> Ed25519PublicKey:
    if not PUBLIC_KEY_PATH.exists():
        raise SystemExit(
            f"Public key not found at {PUBLIC_KEY_PATH}. "
            "Run: python -m src.audit_log init-keys"
        )
    pem = PUBLIC_KEY_PATH.read_bytes()
    key = serialization.load_pem_public_key(pem)
    if not isinstance(key, Ed25519PublicKey):
        raise SystemExit("Public key is not Ed25519.")
    return key


def fingerprint_of(pub: Ed25519PublicKey) -> str:
    """First 16 bytes of SHA-256(public_key_DER) as URL-safe base64 no-pad."""
    der = pub.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    digest = hashlib.sha256(der).digest()
    return b64u(digest[:16])


# ---------------------------------------------------------------------------
# Chain
# ---------------------------------------------------------------------------


def read_log() -> list[dict]:
    if not LOG_PATH.exists():
        return []
    entries: list[dict] = []
    with LOG_PATH.open("r", encoding="utf-8") as f:
        for line_no, raw in enumerate(f, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                entries.append(json.loads(raw))
            except json.JSONDecodeError as e:
                raise SystemExit(f"Corrupt log at line {line_no}: {e}")
    return entries


def hash_of_canonical(entry: dict) -> tuple[str, bytes]:
    """Return (hex_digest, canonical_bytes) excluding hash/sig/key fields."""
    clean = {k: v for k, v in entry.items() if k not in HASH_EXCLUDED_FIELDS}
    cbytes = canonical_json(clean)
    digest = hashlib.sha256(cbytes).hexdigest()
    return digest, cbytes


def append_entry(
    *,
    action: str,
    user: str,
    user_email: str,
    prompt: str,
    result: str,
    model: str | None = None,
    platform: str | None = None,
    thread_id: str | None = None,
    assets: list[str] | None = None,
    git_sha: str | None = None,
) -> dict:
    """Append one signed entry. Returns the entry as written."""
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    existing = read_log()
    seq = (existing[-1]["seq"] + 1) if existing else 1
    prev = existing[-1]["entry_sha256"] if existing else GENESIS

    priv = load_private_key()
    pub = priv.public_key()
    fp = fingerprint_of(pub)

    entry: dict[str, Any] = {
        "seq": seq,
        "timestamp_utc": now_iso_utc(),
        "user": user,
        "user_email": user_email,
        "model": model,
        "platform": platform,
        "thread_id": thread_id,
        "action": action,
        "prompt": prompt,
        "result": result,
        "assets": assets or [],
        "git_sha": git_sha if git_sha is not None else git_sha_for(),
        "prev_entry_sha256": prev,
    }

    digest, cbytes = hash_of_canonical(entry)
    sig = priv.sign(cbytes)

    entry["entry_sha256"] = digest
    entry["signature_ed25519"] = b64u(sig)
    entry["key_fingerprint"] = fp

    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return entry


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------


def verify(strict: bool = True) -> dict:
    entries = read_log()
    if not entries:
        return {"ok": True, "count": 0, "message": "Empty log."}

    pub = load_public_key()

    errors: list[str] = []
    prev = GENESIS

    for i, entry in enumerate(entries):
        expected_seq = i + 1
        if entry.get("seq") != expected_seq:
            errors.append(f"seq mismatch at index {i}: got {entry.get('seq')}, want {expected_seq}")

        if entry.get("prev_entry_sha256") != prev:
            errors.append(
                f"chain break at seq {entry.get('seq')}: "
                f"prev_entry_sha256={entry.get('prev_entry_sha256')!r}, expected {prev!r}"
            )

        digest, cbytes = hash_of_canonical(entry)
        if digest != entry.get("entry_sha256"):
            errors.append(f"hash mismatch at seq {entry.get('seq')}")

        try:
            sig = base64.urlsafe_b64decode(entry["signature_ed25519"] + "==")
            pub.verify(sig, cbytes)
        except Exception as e:
            errors.append(f"signature failure at seq {entry.get('seq')}: {e}")

        prev = entry.get("entry_sha256", GENESIS)

    if errors and strict:
        for e in errors:
            print(f"  ! {e}", file=sys.stderr)
        return {"ok": False, "count": len(entries), "errors": errors}

    return {"ok": True, "count": len(entries), "fingerprint": fingerprint_of(pub)}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _cmd_init_keys(args: argparse.Namespace) -> int:
    info = init_keys(force=args.force)
    print(json.dumps(info, indent=2))
    return 0


def _cmd_append(args: argparse.Namespace) -> int:
    entry = append_entry(
        action=args.action,
        user=args.user,
        user_email=args.user_email,
        prompt=args.prompt,
        result=args.result,
        model=args.model,
        platform=args.platform,
        thread_id=args.thread_id,
        assets=args.assets or [],
        git_sha=args.git_sha,
    )
    print(json.dumps({"seq": entry["seq"], "entry_sha256": entry["entry_sha256"]}, indent=2))
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    result = verify()
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


def _cmd_fingerprint(args: argparse.Namespace) -> int:
    pub = load_public_key()
    print(fingerprint_of(pub))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="audit_log", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("init-keys", help="Generate a new Ed25519 keypair")
    sp.add_argument("--force", action="store_true", help="Overwrite existing keys")
    sp.set_defaults(func=_cmd_init_keys)

    sp = sub.add_parser("append", help="Append a signed entry")
    sp.add_argument("--action", required=True)
    sp.add_argument("--user", required=True)
    sp.add_argument("--user-email", required=True)
    sp.add_argument("--prompt", required=True)
    sp.add_argument("--result", required=True)
    sp.add_argument("--model", default=None)
    sp.add_argument("--platform", default=None)
    sp.add_argument("--thread-id", default=None)
    sp.add_argument("--assets", nargs="*", default=None)
    sp.add_argument("--git-sha", default=None)
    sp.set_defaults(func=_cmd_append)

    sp = sub.add_parser("verify", help="Verify chain and signatures")
    sp.set_defaults(func=_cmd_verify)

    sp = sub.add_parser("fingerprint", help="Print public key fingerprint")
    sp.set_defaults(func=_cmd_fingerprint)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
