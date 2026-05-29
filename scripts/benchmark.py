#!/usr/bin/env python3
"""benchmark.py — Reproduce the numbers in BENCHMARKS.md.

Run from the repo root:

    PYTHONPATH=. python3 scripts/benchmark.py

The script generates a throw-away Ed25519 keypair and benchmarks:

  1. Sign throughput  (Ed25519PrivateKey.sign over canonicalized bytes)
  2. Verify throughput
  3. Inline overhead per AI call (build + canonicalize + sign)
  4. Chained-append rate (full audit-log write path)

All output is JSON to stdout so it can be diffed in CI.
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import platform
import statistics
import sys
import tempfile
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

# Resolve the repo root so `from beacons._common import ...` works regardless
# of where the script is invoked from.
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from beacons._common import (  # noqa: E402
    canonicalize,
    new_ulid,
    sha256_hex,
    utc_now_iso,
)


def fake_receipt(sk: Ed25519PrivateKey) -> tuple[dict, bytes, bytes]:
    body = {
        "id": new_ulid(),
        "ts_utc": utc_now_iso(),
        "user": "bench",
        "vendor": "openai",
        "model": "gpt-4o",
        "version": "aigovops-beacon.v1",
        "event_type": "inference.observed",
        "prompt_hash": sha256_hex(b"a prompt here"),
        "result_hash": sha256_hex(b"a result here"),
        "environment": "cloud_saas",
    }
    canon = canonicalize(body).encode("utf-8")
    sig = sk.sign(canon)
    body["signature"] = {
        "alg": "ed25519",
        "key_fpr": "bench",
        "sig_b64": base64.b64encode(sig).decode(),
        "canonical_form": "json/c14n-rfc8785",
    }
    return body, canon, sig


def bench_sign(sk: Ed25519PrivateKey, n: int) -> tuple[float, list]:
    t0 = time.perf_counter()
    results = [fake_receipt(sk) for _ in range(n)]
    return time.perf_counter() - t0, results


def bench_verify(pk, results: list) -> float:
    t0 = time.perf_counter()
    for _body, canon, sig in results:
        pk.verify(sig, canon)
    return time.perf_counter() - t0


def bench_inline(sk: Ed25519PrivateKey, n: int) -> list[float]:
    samples = []
    for _ in range(n):
        t = time.perf_counter()
        body = {
            "id": new_ulid(),
            "ts_utc": utc_now_iso(),
            "user": "bench",
            "vendor": "openai",
            "model": "gpt-4o",
            "version": "aigovops-beacon.v1",
            "event_type": "inference.observed",
            "prompt_hash": sha256_hex(b"hello"),
            "result_hash": sha256_hex(b"world"),
            "environment": "cloud_saas",
        }
        canon = canonicalize(body).encode("utf-8")
        sk.sign(canon)
        samples.append((time.perf_counter() - t) * 1e6)
    return samples


def bench_chain(sk: Ed25519PrivateKey, n: int) -> tuple[float, int]:
    log_dir = pathlib.Path(tempfile.mkdtemp(prefix="bench-log-"))
    log_path = log_dir / "log.jsonl"
    prev_hash = "0" * 64
    t0 = time.perf_counter()
    with open(log_path, "w") as f:
        for i in range(n):
            body, _canon, _sig = fake_receipt(sk)
            body["seq"] = i + 1
            body["prev_entry_sha256"] = prev_hash
            canon2 = canonicalize(body).encode("utf-8")
            body["entry_sha256"] = sha256_hex(canon2)
            f.write(json.dumps(body) + "\n")
            prev_hash = body["entry_sha256"]
    elapsed = time.perf_counter() - t0
    size = log_path.stat().st_size
    import shutil
    shutil.rmtree(log_dir)
    return elapsed, size


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sign-n", type=int, default=5000)
    ap.add_argument("--inline-n", type=int, default=2000)
    ap.add_argument("--chain-n", type=int, default=1000)
    args = ap.parse_args()

    sk = Ed25519PrivateKey.generate()
    pk = sk.public_key()

    sign_elapsed, results = bench_sign(sk, args.sign_n)
    verify_elapsed = bench_verify(pk, results)
    inline = bench_inline(sk, args.inline_n)
    chain_elapsed, chain_bytes = bench_chain(sk, args.chain_n)

    import cryptography
    out = {
        "host": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "machine": platform.machine(),
            "cryptography": cryptography.__version__,
        },
        "sign": {
            "n": args.sign_n,
            "elapsed_s": round(sign_elapsed, 4),
            "rate_per_s": round(args.sign_n / sign_elapsed, 1),
            "per_op_us": round(sign_elapsed / args.sign_n * 1e6, 2),
        },
        "verify": {
            "n": args.sign_n,
            "elapsed_s": round(verify_elapsed, 4),
            "rate_per_s": round(args.sign_n / verify_elapsed, 1),
            "per_op_us": round(verify_elapsed / args.sign_n * 1e6, 2),
        },
        "inline_per_call_us": {
            "n": args.inline_n,
            "p50": round(statistics.median(inline), 1),
            "p95": round(statistics.quantiles(inline, n=20)[18], 1),
            "p99": round(statistics.quantiles(inline, n=100)[98], 1),
            "max": round(max(inline), 1),
        },
        "chain_append": {
            "n": args.chain_n,
            "elapsed_s": round(chain_elapsed, 4),
            "rate_per_s": round(args.chain_n / chain_elapsed, 1),
            "bytes_total": chain_bytes,
            "bytes_per_entry": round(chain_bytes / args.chain_n, 1),
        },
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
