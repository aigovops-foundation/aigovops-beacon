"""beacon-scan — one command from a clean checkout to a signed evidence bundle.

This is the engineer's front door. It exists because the honest answer to
"how do I get a signed AI inventory?" used to be: install Node, compile a
native SQLite addon, run a server, run a Vite dev server, walk a five-step
wizard, then click Export. That is a good afternoon for a governance lead in a
workshop. It is far too much for an engineer who wants to know whether the
thing works before they commit to it.

    python3 -m src.beacon_scan          # or `beacon-scan` once installed

does the whole loop:

    scan  →  signed receipts  →  audit bundle  →  the command your auditor runs

Deliberately Python, not Node. The Node server's SQLite driver is a native
addon that does not build on current Node, so the documented Node quickstart
could fail before it produced anything. Everything here runs on `cryptography`
— a wheel on every platform Beacon supports, with nothing to compile — and on
the same `beacons/` collectors that are already the supported way to observe AI
activity. Nothing in this path touches the server, the database, or the Studio.

The bundle this writes is byte-compatible with the one
`server/src/services/export.js` produces, and is verified by the same
`src/beacon_verify.py` an auditor runs. That is asserted in
`tests/unit/test_beacon_scan.py`, which builds a bundle here and verifies it
with the auditor's tool — the only check that means anything, because agreeing
with itself would prove nothing.

Usage
-----

    beacon-scan                          # scan the current directory
    beacon-scan --path ./src --path ./docs
    beacon-scan --no-egress              # skip the network-egress scan
    beacon-scan --out /tmp/my-bundle     # choose where the bundle lands
    beacon-scan --json                   # machine-readable summary

Exit codes
----------

    0   a bundle was written and every receipt in it verifies
    1   the bundle was written but self-verification found a problem
    2   usage error, or nothing could be scanned
    3   key material or signing backend unavailable
"""

from __future__ import annotations

import argparse
import base64
import datetime as _dt
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# Beacon's own modules. Imported lazily inside functions where a missing
# optional dependency should degrade rather than kill the run; imported here
# where it is genuinely required.
try:
    from beacons import _common
except ImportError:  # running from a checkout without the package installed
    sys.path.insert(0, str(REPO_ROOT))
    from beacons import _common


BEACON_VERSION = "0.1.0"

# Ed25519 SubjectPublicKeyInfo DER prefix — the same 12 bytes
# server/src/services/export.js prepends, so keys written here and keys written
# there are the same PEM.
_SPKI_ED25519_PREFIX = bytes.fromhex("302a300506032b6570032100")


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------


def scan_artifacts(paths: list[Path], max_depth: int) -> tuple[int, int]:
    """Walk `paths` for AI-provenance markers, emitting a receipt per hit.

    Returns (files_scanned, receipts_emitted). Stdlib only — this is the part
    that always runs.
    """
    from beacons import artifact_beacon

    scanned = 0
    emitted = 0
    for path in artifact_beacon.iter_files(paths, max_depth):
        scanned += 1
        finding = artifact_beacon.scan_file(path)
        if finding:
            artifact_beacon.emit_receipt(path, finding)
            emitted += 1
    return scanned, emitted


def scan_egress() -> tuple[int, str | None]:
    """Observe outbound connections to known AI API hosts.

    Returns (receipts_emitted, skip_reason). This needs `psutil`, which is not
    a hard dependency — a machine without it still produces a bundle, and the
    summary says the egress layer was skipped rather than implying it found
    nothing. "Scanned and found nothing" and "never looked" are different
    claims, and an evidence tool must not blur them.
    """
    try:
        from beacons import model_beacon
    except (ImportError, SystemExit):
        return 0, "psutil is not installed (pip install psutil)"

    # model_beacon imports cleanly without psutil and its scan() then returns an
    # empty list. Importing successfully is NOT the same as being able to look,
    # so check the capability rather than the import.
    if getattr(model_beacon, "psutil", None) is None:
        return 0, "psutil is not installed (pip install psutil)"

    try:
        hosts = model_beacon.load_hosts(None)
        ip_to_host = model_beacon.resolve_hosts(hosts)
        observations = model_beacon.scan(ip_to_host)
        return model_beacon.emit_receipts(observations), None
    except PermissionError:
        # psutil.net_connections() needs elevated privileges on macOS.
        return 0, "listing connections requires elevated privileges on this OS"
    except Exception as exc:  # noqa: BLE001 — a scan layer must not kill the run
        return 0, f"egress scan failed: {type(exc).__name__}: {exc}"


# ---------------------------------------------------------------------------
# Inventory — derived from receipts, never hand-maintained
# ---------------------------------------------------------------------------


def derive_inventory(receipts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse receipts into inventory rows.

    Same columns as the server's `inventory` table and the same uniqueness key
    (vendor, model, version, environment), so `inventory.json` here and
    `inventory.json` from a server export describe the same thing. The row is
    DERIVED, so it cannot drift from the evidence: every field traces to
    receipts that are individually signed.
    """
    rows: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for r in receipts:
        key = (
            r.get("vendor") or "unknown",
            r.get("model") or "n/a",
            r.get("version") or "n/a",
            r.get("environment") or "unknown",
        )
        ts = r.get("ts_utc") or ""
        row = rows.get(key)
        if row is None:
            rows[key] = {
                "id": r.get("id"),
                "vendor": key[0],
                "model": key[1],
                "version": key[2],
                "environment": key[3],
                "owner_email": None,
                "trust_tier": "T0",
                "first_seen_utc": ts,
                "last_seen_utc": ts,
                "discovery_src": "beacon-scan",
                "notes": None,
                "receipt_count": 1,
            }
        else:
            row["receipt_count"] += 1
            if ts and ts < row["first_seen_utc"]:
                row["first_seen_utc"] = ts
            if ts and ts > row["last_seen_utc"]:
                row["last_seen_utc"] = ts
    return sorted(rows.values(), key=lambda r: (r["vendor"], r["model"], r["version"]))


# ---------------------------------------------------------------------------
# Bundle
# ---------------------------------------------------------------------------


def _read_ndjson(path: Path) -> list[dict[str, Any]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.append(json.loads(line))
    return out


def _public_key_pem(raw: bytes) -> bytes:
    body = base64.b64encode(_SPKI_ED25519_PREFIX + raw)
    lines = [body[i : i + 64] for i in range(0, len(body), 64)]
    return (
        b"-----BEGIN PUBLIC KEY-----\n"
        + b"\n".join(lines)
        + b"\n-----END PUBLIC KEY-----\n"
    )


def _self_verify(receipts: list[dict[str, Any]], raw_public_key: bytes) -> dict[str, Any]:
    """Check every receipt we just wrote actually verifies.

    Convenience, not proof — it is the same process that signed them. The
    manifest says so in as many words, and VERIFY.md tells the auditor to run
    the bundled verifier instead of trusting this block.
    """
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    pub = Ed25519PublicKey.from_public_bytes(raw_public_key)
    ok = 0
    failures: list[str] = []
    for r in receipts:
        body = {k: v for k, v in r.items() if k != "signature"}
        canonical = _common.canonicalize(body).encode("utf-8")
        sig = base64.b64decode(r.get("signature", {}).get("sig_b64", ""))
        try:
            pub.verify(sig, canonical)
            ok += 1
        except (InvalidSignature, ValueError):
            if len(failures) < 10:
                failures.append(r.get("id", "<no id>"))
    return {
        "receipts_verified": ok,
        "receipts_failed": len(receipts) - ok,
        "failures": failures,
    }


def build_bundle(out_dir: Path | None = None) -> dict[str, Any]:
    """Assemble an audit bundle from everything in the local receipt store.

    Layout matches server/src/services/export.js exactly — manifest.json,
    manifest.sha256, receipts/, public_keys/, policies/, checklists/,
    inventory.json, verify_bundle.py, VERIFY.md — so an auditor cannot tell
    which producer wrote it, and does not have to care.
    """
    from cryptography.hazmat.primitives import serialization

    stamp = _dt.datetime.now(_dt.timezone.utc).isoformat().replace(":", "-").replace(".", "-")
    bundle = out_dir or (_common.BEACON_HOME / "bundles" / f"bundle-{stamp}")
    bundle.mkdir(parents=True, exist_ok=True)
    (bundle / "receipts").mkdir(exist_ok=True)
    (bundle / "public_keys").mkdir(exist_ok=True)

    # Receipts — copied verbatim. The signature covers the bytes, so a
    # re-serialisation here would be a way to invalidate evidence for free.
    receipt_counts: dict[str, int] = {}
    all_receipts: list[dict[str, Any]] = []
    src_dir = _common.RECEIPTS_DIR
    if src_dir.is_dir():
        for f in sorted(src_dir.glob("*.ndjson")):
            shutil.copyfile(f, bundle / "receipts" / f.name)
            entries = _read_ndjson(f)
            receipt_counts[f.name] = len(entries)
            all_receipts.extend(entries)

    # Public key. Named with the 16-hex-character fingerprint, not the SSH-style
    # one from docs/RECEIPT_SCHEMA.md — the SSH form is base64 and can contain
    # `/`, which is not a filename. beacon_verify indexes a key under every
    # spelling plus its filename stem, so receipts carrying the SSH-style
    # `key_fpr` still resolve to this file.
    _priv, pub = _common.load_or_create_keypair()
    raw_pub = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    hex_fpr = hashlib.sha256(raw_pub).hexdigest()[:16]
    (bundle / "public_keys" / f"{hex_fpr}.pem").write_bytes(_public_key_pem(raw_pub))

    # The rules in force, so the auditor reads what we were held to.
    for name, dest in (("policy", "policies"), ("checklists", "checklists")):
        src = REPO_ROOT / name
        if src.is_dir():
            shutil.copytree(src, bundle / dest, dirs_exist_ok=True)

    inventory = derive_inventory(all_receipts)
    (bundle / "inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n", encoding="utf-8"
    )

    verification = _self_verify(all_receipts, raw_pub)

    manifest = {
        "beacon_version": BEACON_VERSION,
        "generated_at_utc": _common.utc_now_iso(),
        "generated_by": "beacon-scan",
        "scope": {
            "inventory_ids": [row["id"] for row in inventory],
            "from_date": None,
            "to_date": None,
        },
        "active_key_fingerprint": _common.key_fingerprint(pub),
        "public_key_fingerprints": [hex_fpr],
        "signing_algorithm": "Ed25519",
        "canonical_form": "json/c14n-rfc8785",
        "receipt_files": receipt_counts,
        "verification": verification,
        "note": (
            "Verify independently with the steps in VERIFY.md. "
            "Beacon's self-verification is convenience, not proof."
        ),
    }

    # The digest goes over the bytes actually written, in `sha256sum -c` format.
    manifest_json = json.dumps(manifest, indent=2)
    (bundle / "manifest.json").write_text(manifest_json, encoding="utf-8")
    manifest_sha = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
    (bundle / "manifest.sha256").write_text(
        f"{manifest_sha}  manifest.json\n", encoding="utf-8"
    )

    verifier_src = REPO_ROOT / "src" / "beacon_verify.py"
    verifier_included = verifier_src.is_file()
    if verifier_included:
        shutil.copyfile(verifier_src, bundle / "verify_bundle.py")
    (bundle / "VERIFY.md").write_text(
        _VERIFY_MD if verifier_included else _VERIFY_MD_NO_VERIFIER, encoding="utf-8"
    )

    return {
        "bundle_path": str(bundle),
        "manifest_sha256": manifest_sha,
        "verifier_included": verifier_included,
        "public_key_fingerprints": [hex_fpr],
        "receipt_count": len(all_receipts),
        "inventory_rows": len(inventory),
        "verification": verification,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="beacon-scan",
        description="Scan for AI activity and produce a signed audit bundle.",
    )
    p.add_argument(
        "--path",
        action="append",
        type=Path,
        default=[],
        help="Directory to scan for AI-provenance markers (repeatable; default: .)",
    )
    p.add_argument("--max-depth", type=int, default=8, help="Directory recursion depth (default 8)")
    p.add_argument("--no-egress", action="store_true", help="Skip the network-egress scan")
    p.add_argument("--out", type=Path, help="Where to write the bundle (default ~/.beacon/bundles/)")
    p.add_argument("--json", action="store_true", dest="as_json", help="Machine-readable summary")
    args = p.parse_args(argv)

    paths = args.path or [Path(".")]
    for path in paths:
        if not path.exists():
            print(f"beacon-scan: {path}: no such path", file=sys.stderr)
            return 2

    try:
        _common.load_or_create_keypair()
    except Exception as exc:  # noqa: BLE001
        print(f"beacon-scan: cannot load or create a signing key: {exc}", file=sys.stderr)
        return 3

    if not args.as_json:
        print("beacon-scan: scanning…")

    scanned, artifact_receipts = scan_artifacts(paths, args.max_depth)
    egress_receipts, egress_skipped = (0, "skipped by --no-egress")
    if not args.no_egress:
        egress_receipts, egress_skipped = scan_egress()

    result = build_bundle(args.out)
    result["files_scanned"] = scanned
    result["artifact_receipts"] = artifact_receipts
    result["egress_receipts"] = egress_receipts
    result["egress_skipped"] = egress_skipped

    ok = result["verification"]["receipts_failed"] == 0

    if args.as_json:
        print(json.dumps({**result, "ok": ok}, indent=2))
        return 0 if ok else 1

    bundle = Path(result["bundle_path"])
    print(f"  {scanned} files scanned, {artifact_receipts} provenance marker(s)")
    if egress_skipped:
        print(f"  egress scan: SKIPPED — {egress_skipped}")
    else:
        print(f"  egress scan: {egress_receipts} receipt(s)")
    print(
        f"  {result['receipt_count']} receipt(s) in the bundle, "
        f"{result['inventory_rows']} inventory row(s)"
    )
    print(f"\nbundle: {bundle}")

    if result["receipt_count"] == 0:
        # An empty bundle is a real, valid answer — say so plainly rather than
        # letting it read as a successful discovery.
        print(
            "\nNo AI activity was observed. The bundle is valid and empty: that is "
            "evidence of a clean scan, not evidence of coverage. Point --path at "
            "the trees you care about, and install psutil for the egress layer."
        )

    if not ok:
        print(
            f"\nSelf-verification FAILED for "
            f"{result['verification']['receipts_failed']} receipt(s). "
            "Do not send this bundle to an auditor.",
            file=sys.stderr,
        )
        return 1

    print("\nWhat your auditor runs — nothing installed, no network, no account:\n")
    if result["verifier_included"]:
        print(f"  cd {bundle}")
        print("  python3 verify_bundle.py .")
    else:
        print(f"  cd {bundle}")
        print(
            "  curl -O https://raw.githubusercontent.com/aigovops-foundation/"
            "aigovops-beacon/main/src/beacon_verify.py"
        )
        print("  python3 beacon_verify.py .")
    print("\nRead VERIFY.md in the bundle for what that command checks.")
    return 0


_VERIFY_STEPS_TAIL = """## What the verifier checked

1. **The manifest is intact** — `manifest.sha256` matches `manifest.json`.
2. **Every receipt signature is valid** — for each line of every
   `receipts/*.ndjson`: the `signature` block is removed, the remainder is
   canonicalized per RFC 8785 (JCS), and the Ed25519 signature in
   `signature.sig_b64` is checked against the public key named by that
   receipt's own `signature.key_fpr` in `public_keys/`.
3. **Nothing was dropped** — the receipt counts declared in the manifest match
   the files actually present.
4. **No duplicate receipt IDs.**

Anything it could not check, it says out loud rather than passing quietly.

## If it fails

A non-zero exit means at least one of those checks failed, and the specific
failures are printed. Stop and contact the system owner. Do not accept the
bundle on the strength of the manifest's own `verification` block — that was
written by the system that produced the bundle, and is convenience, not proof.

## What this bundle does and does not claim

`inventory.json` is DERIVED from the receipts in this bundle — every row traces
to signed evidence, and no row was typed by hand. It is a record of what the
scan **observed**, which is not the same as everything that **exists**. A scan
that looked at one directory can only speak for that directory, and the
`generated_by` field says which producer ran.

`policies/` and `checklists/` contain the rules in force when this bundle was
generated. Read them. Disagree on paper if you disagree in person.

## Verifying without our tool at all

Nothing here is proprietary. The receipts are NDJSON, the canonical form is
RFC 8785, the signatures are Ed25519, and the public keys are PEM
SubjectPublicKeyInfo. Any library in any language that does those three things
will reproduce the same answer, and `verify_bundle.py` is short enough to read
in full before you run it.

— The AiGovOps Foundation
"""

_VERIFY_MD = f"""# Verifying a Beacon Audit Bundle

You do not need Beacon, an account, or a network connection to verify this
bundle. The verifier is in the bundle. From this directory:

```bash
python3 verify_bundle.py .
```

A clean bundle prints `beacon-verify: OK — <n> receipts verified` and exits 0.
Any failure exits non-zero and names what failed.

Python 3.10 or newer is the only requirement. If the `cryptography` package
happens to be installed it is used; if not, the verifier falls back to a
pure-Python Ed25519 implementation included in the same file, so an air-gapped
machine with a bare Python still works. It is slower, and that is all.

For a machine-readable report:

```bash
python3 verify_bundle.py . --json
```

{_VERIFY_STEPS_TAIL}"""

_VERIFY_MD_NO_VERIFIER = f"""# Verifying a Beacon Audit Bundle

You do not need Beacon or an account to verify this bundle, but this copy did
not ship with the verifier itself. Get it — a single self-contained file, no
dependencies beyond Python 3 — and point it at this directory:

```bash
curl -O https://raw.githubusercontent.com/aigovops-foundation/aigovops-beacon/main/src/beacon_verify.py
python3 beacon_verify.py .
```

A clean bundle prints `beacon-verify: OK — <n> receipts verified` and exits 0.
Any failure exits non-zero and names what failed.

{_VERIFY_STEPS_TAIL}"""


if __name__ == "__main__":
    sys.exit(main())
