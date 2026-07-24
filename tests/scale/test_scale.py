"""Scale tests — push 10k+ synthetic receipts through Beacon's
sign → bundle → verify path and assert a wall-clock and memory budget.

These are marked `scale` and excluded from the default run (see
pytest.ini `addopts = -m "not scale"`). The dedicated CI job runs them
with `-m scale`. Run locally with:

    RUN_SCALE=1 PYTHONPATH=. python3 -m pytest tests/scale -m scale -v

Budgets (override via env for slower runners):
    SCALE_COUNT       number of receipts        (default 10000)
    SCALE_TIME_BUDGET wall-clock seconds        (default 30.0)
    SCALE_MEM_BUDGET  peak heap MB              (default 512)

Determinism: the synthetic corpus is seeded from SCALE_SEED (default 1337)
so two runs build byte-identical bodies before signing.
"""

from __future__ import annotations

import base64
import os
import random
import time
import tracemalloc
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from beacons._common import canonicalize, new_ulid, sha256_hex

pytestmark = pytest.mark.scale

COUNT = int(os.environ.get("SCALE_COUNT", "10000"))
TIME_BUDGET = float(os.environ.get("SCALE_TIME_BUDGET", "30.0"))
MEM_BUDGET_MB = float(os.environ.get("SCALE_MEM_BUDGET", "512"))
SEED = int(os.environ.get("SCALE_SEED", "1337"))

VENDORS = ["openai", "anthropic", "google", "meta", "in-house"]
ENVS = ["cloud_saas", "private_cloud", "on_prem", "edge", "hybrid"]
EVENTS = ["inference.observed", "gate.evaluated", "bundle.signed", "admission.allowed"]


def _build_receipt(rng: random.Random, idx: int) -> dict:
    """Build one synthetic, schema-shaped receipt body (unsigned)."""
    return {
        "id": new_ulid(),
        "ts_utc": "2026-06-01T00:00:00.000Z",
        "user": {"sub": f"user-{idx % 97}", "oidc_issuer": "https://issuer.example.org"},
        "vendor": rng.choice(VENDORS),
        "model": f"model-{idx % 13}",
        "version": f"2026.{idx % 12 + 1}.0",
        "prompt_hash": sha256_hex(f"prompt-{idx}".encode()),
        "result_hash": sha256_hex(f"result-{idx}".encode()),
        "event_type": rng.choice(EVENTS),
        "environment": rng.choice(ENVS),
    }


def _sign(priv: Ed25519PrivateKey, body: dict) -> dict:
    canon = canonicalize(body).encode("utf-8")
    sig = priv.sign(canon)
    body = dict(body)
    body["signature"] = {
        "alg": "Ed25519",
        "key_fpr": "scale-test",
        "sig_b64": base64.b64encode(sig).decode("ascii"),
        "canonical_form": "json/c14n-rfc8785",
    }
    return body


@pytest.mark.scale
def test_sign_and_bundle_10k_within_budget(tmp_path: Path):
    rng = random.Random(SEED)
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()

    bundle = tmp_path / "receipts.ndjson"

    tracemalloc.start()
    start = time.perf_counter()

    signed_count = 0
    with bundle.open("w", encoding="utf-8") as fh:
        for i in range(COUNT):
            body = _build_receipt(rng, i)
            receipt = _sign(priv, body)
            fh.write(canonicalize(receipt))  # canonical NDJSON line
            fh.write("\n")
            signed_count += 1

    elapsed = time.perf_counter() - start
    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_mb = peak / (1024 * 1024)

    assert signed_count == COUNT
    assert elapsed < TIME_BUDGET, (
        f"signing {COUNT} receipts took {elapsed:.2f}s, budget {TIME_BUDGET}s"
    )
    assert peak_mb < MEM_BUDGET_MB, (
        f"peak heap {peak_mb:.1f}MB exceeded budget {MEM_BUDGET_MB}MB"
    )

    # Sanity: a sampled subset of the bundle still verifies. We never hold
    # the whole corpus in memory — verify by streaming the file.
    verified = 0
    sample_every = max(1, COUNT // 500)
    with bundle.open("r", encoding="utf-8") as fh:
        for n, line in enumerate(fh):
            if n % sample_every:
                continue
            import json

            rec = json.loads(line)
            sig = rec.pop("signature")
            pub.verify(
                base64.b64decode(sig["sig_b64"]),
                canonicalize(rec).encode("utf-8"),
            )
            verified += 1
    assert verified > 0


@pytest.mark.scale
def test_bundle_throughput_floor(tmp_path: Path):
    """A coarse throughput floor: at least 1000 signed receipts/second."""
    rng = random.Random(SEED)
    priv = Ed25519PrivateKey.generate()
    n = min(COUNT, 5000)

    start = time.perf_counter()
    for i in range(n):
        _sign(priv, _build_receipt(rng, i))
    elapsed = time.perf_counter() - start

    rate = n / elapsed if elapsed else float("inf")
    assert rate > 1000, f"signing throughput {rate:.0f}/s below 1000/s floor"
