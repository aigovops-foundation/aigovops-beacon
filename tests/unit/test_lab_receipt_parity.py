"""A receipt the Lab signs in Node must verify in Python. That is the whole point.

`src/beacon_verify.py` — the auditor's one command — states the contract: the signature must
verify over the RFC 8785 canonical bytes of the receipt *with its signature block removed*. If the
Lab's canonicalization drifts from `beacons/_common.py` by so much as a key order or a number
format, every receipt it issues becomes unverifiable to the auditor while still looking perfectly
valid inside the Lab. That failure would be silent, which is exactly the kind this estate keeps
finding.

So this test does not check the Lab against itself. It signs in Node and verifies in Python, using
the Python canonicalizer, against a keypair generated in Python. Nothing but genuine agreement
passes it.

Skips (rather than fails) when Node or the lab-service dependencies are absent, so the Python-only
CI lane stays honest about what it did not run.

Run from the repo root:

    PYTHONPATH=. python3 -m pytest tests/unit/test_lab_receipt_parity.py -v
"""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
LAB = REPO / "lab-service"

sys.path.insert(0, str(REPO))
from beacons._common import canonicalize  # noqa: E402

cryptography = pytest.importorskip("cryptography", reason="cryptography is needed to verify Ed25519")
from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.exceptions import InvalidSignature  # noqa: E402

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (LAB / "node_modules").exists(),
    reason="needs node + `npm install` in lab-service/ (skipped, not passed)",
)


def _sign_in_node(private_pkcs8_b64: str, public_spki_b64: str, fingerprint: str) -> dict:
    """Drive the Lab's own signer and return the receipt envelope it produced."""
    script = f"""
      // argv[2], not argv[1] — with `tsx script.ts arg`, argv[1] is the script itself.
      process.env.BEACON_DATA_DIR = process.argv[2];
      process.env.BEACON_DB_PATH  = process.argv[2] + "/parity.db";
      const {{ storage, db, _internal }} = await import("./server/storage.js");
      const {{ buildAndSignReceipt }}    = await import("./server/beacon.js");
      db.insert(_internal.tables.tenants).values({{
        id: "t1", name: "Parity Tenant", description: "", ein: "",
        keyFingerprint: {json.dumps(fingerprint)},
        signingPublicKey: {json.dumps(public_spki_b64)},
        signingPrivateKey: {json.dumps(private_pkcs8_b64)},
        createdAt: new Date(),
      }}).onConflictDoNothing().run();

      const r = buildAndSignReceipt({{
        tenantId: "t1", sessionId: "sess-parity", userSub: "sess-parity",
        userEmail: "anon@trainee.lab", eventType: "gate.evaluated",
        controlRefs: ["NIST-AI-RMF:MAP-1.1", "EU-AI-Act:Art.5"],
        subject: {{ name: "checklist-100", data: JSON.stringify({{ a: 1, b: [2, 3] }}) }},
        decision: {{ result: "fail", rulesEvaluated: ["L100.R1", "L100.R2"], rulesFailed: ["L100.R2"] }},
        // Deliberately awkward: unicode, a nested object, and unsorted keys — the cases where two
        // canonicalizers most often disagree.
        extra: {{ "z": 1, "a": {{ "nested": true }}, "unicode": "café ✓", "num": 1.5 }},
      }});
      process.stdout.write(r.envelope);
    """
    import tempfile

    # Written to a real .ts file rather than passed via `tsx --eval`: eval compiles to CJS, which
    # cannot do top-level await, and the Lab's modules are ESM.
    with tempfile.TemporaryDirectory() as tmp:
        driver = LAB / "._parity_driver.ts"
        driver.write_text(script, encoding="utf-8")
        try:
            proc = subprocess.run(
                ["npx", "tsx", str(driver), tmp],
                cwd=LAB, capture_output=True, text=True, timeout=180,
            )
        finally:
            driver.unlink(missing_ok=True)
    if proc.returncode != 0:
        pytest.fail(f"node signer failed:\n{proc.stderr[-2000:]}")
    return json.loads(proc.stdout.strip())


@pytest.fixture(scope="module")
def signed() -> tuple[dict, Ed25519PublicKey]:
    key = Ed25519PrivateKey.generate()
    priv = base64.b64encode(
        key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    ).decode()
    pub_der = key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    envelope = _sign_in_node(priv, base64.b64encode(pub_der).decode(), "ed25519:paritytest000000")
    return envelope, key.public_key()


def test_node_signed_receipt_verifies_in_python(signed) -> None:
    """The load-bearing assertion: Node signs, Python verifies, over Python's canonical bytes."""
    envelope, public_key = signed
    # Work on a copy — `signed` is module-scoped and shared with the other tests. Mutating it here
    # is what broke test_signature_covers_the_decision on the first run.
    envelope = json.loads(json.dumps(envelope))

    sig_block = envelope.pop("signature")
    assert sig_block["alg"] == "Ed25519"
    assert "rfc8785" in sig_block["canonical_form"].lower().replace("-", "")

    # Canonicalize with the PYTHON implementation — if the two disagree, this raises.
    canonical_bytes = canonicalize(envelope).encode("utf-8")
    signature = base64.b64decode(sig_block["signature_ed25519"])

    try:
        public_key.verify(signature, canonical_bytes)
    except InvalidSignature:  # pragma: no cover - the failure we exist to catch
        pytest.fail(
            "A receipt signed by the Lab does NOT verify under the Python canonicalizer. "
            "The two RFC 8785 implementations have drifted — every receipt the Lab issues would be "
            "unverifiable to the auditor while looking valid inside the Lab."
        )


def test_signature_covers_the_decision(signed) -> None:
    """Flipping the verdict must invalidate the signature, checked from the Python side."""
    envelope, public_key = signed
    tampered = json.loads(json.dumps(envelope))
    sig_block = tampered.pop("signature")
    tampered["decision"]["result"] = "pass"  # flip the verdict — what an attacker would change

    signature = base64.b64decode(sig_block["signature_ed25519"])
    with pytest.raises(InvalidSignature):
        public_key.verify(signature, canonicalize(tampered).encode("utf-8"))


def test_subject_is_hashed_not_embedded(signed) -> None:
    """'beacons never record raw payloads' — beacons/_common.py. Enforced across the boundary too."""
    envelope, _ = signed
    assert envelope["subject"]["digest"].startswith("sha256:")
    assert "data" not in envelope["subject"], "the raw subject must never reach the envelope"
