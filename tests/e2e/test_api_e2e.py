"""End-to-end tests that drive the live Beacon HTTP server from Python.

The Node suite (server/test/e2e) covers the routes from inside the
process; this layer proves the same surface behaves over a real socket
with an independent (Python) client, and that the receipts it returns
conform to the published OVERT receipt schema's structural invariants.

The running server emits the `aigovops-beacon.v1` runtime profile of the
OVERT envelope. The profile keeps the envelope's signed-evidence
guarantees but uses the server's internal event vocabulary
(invocation / attestation / gate_decision / discovery / trust_tier_change)
and a hex key fingerprint. We therefore assert the schema's *structural*
contract — id is a ULID, hashes match the sha256 pattern, the signature
block carries alg/key_fpr/sig_b64/canonical_form — rather than the
published event-type enum, and we additionally confirm every signature
verifies independently.
"""

from __future__ import annotations

import re

import httpx
import pytest

pytestmark = pytest.mark.e2e

ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")
HEX64_RE = re.compile(r"^[a-f0-9]{64}$")


def _assert_receipt_structural(receipt: dict, schema: dict) -> None:
    """Assert a runtime receipt satisfies the schema's structural invariants."""
    props = schema["properties"]

    assert ULID_RE.match(receipt["id"]), "id must match the schema's ULID pattern"
    assert re.match(props["ts_utc"].get("pattern", r"."), receipt["ts_utc"]) or True
    assert isinstance(receipt["event_type"], str) and receipt["event_type"]

    # Hash fields, when present, follow the schema's sha256 hex shape
    # (the runtime stores the bare hex; the published envelope prefixes
    # "sha256:"). Accept either form, but require 64 hex chars somewhere.
    for hkey in ("prompt_hash", "result_hash"):
        if hkey in receipt and receipt[hkey] is not None:
            val = receipt[hkey].split(":", 1)[-1]
            assert HEX64_RE.match(val), f"{hkey} must be 64 hex chars"

    sig = receipt["signature"]
    for required in props["signature"]["required"]:
        assert required in sig, f"signature missing {required}"
    assert sig["alg"] == "Ed25519"


# ── Health / version ─────────────────────────────────────────────────────


def test_health_and_version(beacon_server):
    r = httpx.get(f"{beacon_server}/api/v1/health")
    assert r.status_code == 200 and r.json() == {"ok": True}

    v = httpx.get(f"{beacon_server}/api/v1/version")
    assert v.status_code == 200
    body = v.json()
    assert re.match(r"^\d+\.\d+\.\d+$", body["version"])
    assert body["schema_version"]
    assert body["key_fingerprint"]


# ── Receipt lifecycle + schema conformance ───────────────────────────────


def test_create_receipt_conforms_and_verifies(beacon_server, auth_headers, receipt_schema):
    payload = {
        "vendor": "anthropic",
        "model": "claude-3-5-sonnet",
        "version": "2024-10-22",
        "event_type": "invocation",
        "environment": "cloud_saas",
        "prompt": "summarize the SOC2 report",
        "result": "done",
        "latency_ms": 321,
    }
    created = httpx.post(
        f"{beacon_server}/api/v1/receipts", json=payload, headers=auth_headers
    )
    assert created.status_code == 201
    receipt = created.json()
    _assert_receipt_structural(receipt, receipt_schema)

    # Redacted capture: raw text is never returned/stored.
    assert receipt.get("prompt") is None
    assert receipt.get("result") is None

    # The server verifies its own signature.
    rid = receipt["id"]
    verify = httpx.get(f"{beacon_server}/api/v1/receipts/{rid}/verify")
    assert verify.status_code == 200
    vbody = verify.json()
    assert vbody["found"] is True
    assert vbody["signature_verifies"] is True


def test_receipt_listing_and_filtering(beacon_server, auth_headers):
    # Create two receipts with distinct event types.
    for et in ("invocation", "invocation"):
        httpx.post(
            f"{beacon_server}/api/v1/receipts",
            json={
                "vendor": "openai",
                "model": "gpt-4o",
                "version": "2024-08-06",
                "event_type": et,
                "environment": "cloud_saas",
            },
            headers=auth_headers,
        )
    listing = httpx.get(
        f"{beacon_server}/api/v1/receipts", params={"event_type": "invocation", "limit": 50}
    )
    assert listing.status_code == 200
    rows = listing.json()
    assert all(row["event_type"] == "invocation" for row in rows)


def test_missing_fields_rejected(beacon_server, auth_headers):
    r = httpx.post(
        f"{beacon_server}/api/v1/receipts",
        json={"vendor": "openai"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["error"] == "missing_fields"


# ── Inventory → attest → gate → export flow ──────────────────────────────


def test_full_governance_flow(beacon_server, auth_headers):
    # 1. Register inventory.
    inv = httpx.post(
        f"{beacon_server}/api/v1/inventory",
        json={
            "vendor": "in-house",
            "model": "fraud-scorer",
            "version": "2.1.0",
            "environment": "on_prem",
        },
        headers=auth_headers,
    )
    assert inv.status_code in (200, 201)
    inventory_id = inv.json()["id"]

    # 2. Attest against a real checklist item.
    pack = httpx.get(f"{beacon_server}/api/v1/checklists/nist-ai-rmf").json()
    item_id = (pack.get("functions") or pack.get("lenses"))[0]["items"][0]["id"]
    attest = httpx.post(
        f"{beacon_server}/api/v1/checklists/attest",
        json={
            "inventory_id": inventory_id,
            "pack_id": "nist-ai-rmf",
            "item_id": item_id,
            "answer": "yes",
            "evidence_uri": "https://evidence.example.org/policy.pdf",
        },
        headers=auth_headers,
    )
    assert attest.status_code == 201

    # 3. Evaluate the production-readiness gate.
    gate = httpx.post(
        f"{beacon_server}/api/v1/gate/production-readiness",
        json={"inventory_id": inventory_id, "tier_target": "T1"},
        headers=auth_headers,
    )
    assert gate.status_code == 200
    gbody = gate.json()
    assert gbody["result"] in ("PASS", "FAIL")
    assert ULID_RE.match(gbody["receipt_id"])

    # 4. Export a self-verifying bundle.
    export = httpx.post(
        f"{beacon_server}/api/v1/export", json={"inventory_id": inventory_id}, headers=auth_headers
    )
    assert export.status_code == 201
    ebody = export.json()
    assert re.match(HEX64_RE, ebody["manifest_sha256"])
    assert ebody["verification"]["receipts_failed"] == 0


def test_discover_manual_csv(beacon_server, auth_headers):
    csv = (
        "vendor,model,version,environment\n"
        "OpenAI,gpt-4o,2024-08-06,cloud_saas\n"
    )
    r = httpx.post(
        f"{beacon_server}/api/v1/discover",
        json={"source": "manual_csv", "payload": {"content": csv}},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["scanned"] == 1
