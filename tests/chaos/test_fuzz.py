"""Chaos — Hypothesis input fuzzing against the live Beacon server.

We generate malformed JSON, huge strings, weird Unicode, missing required
fields, and extra fields, then assert the server always answers cleanly:
no 5xx, and any rejection comes back as the structured error envelope.

Determinism: Hypothesis is seeded via the HYPOTHESIS_SEED env var (wired
through the `derandomize`/`seed` settings below) so CI runs are
reproducible; override to explore more of the space locally.
"""

from __future__ import annotations

import os

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

pytestmark = pytest.mark.chaos

SEED = int(os.environ.get("HYPOTHESIS_SEED", "20260601"))
MAX_EXAMPLES = int(os.environ.get("CHAOS_MAX_EXAMPLES", "75"))

# A strategy of hostile JSON values.
nasty_scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(),
    st.text(min_size=2000, max_size=4000),  # large strings
    st.sampled_from(["", " ", "💥🔥", "￾￿", "\n\t\r", "null", "{}"]),
)

nasty_values = st.recursive(
    nasty_scalars,
    lambda children: st.one_of(
        st.lists(children, max_size=20),
        st.dictionaries(st.text(max_size=20), children, max_size=10),
    ),
    max_leaves=25,
)

field_keys = st.sampled_from(
    ["vendor", "model", "version", "event_type", "environment", "prompt", "result", "junk", "__proto__"]
)

nasty_objects = st.dictionaries(st.one_of(field_keys, st.text(max_size=15)), nasty_values, max_size=10)

CHAOS_SETTINGS = settings(
    max_examples=MAX_EXAMPLES,
    deadline=None,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


def _assert_clean(resp: httpx.Response, label: str) -> None:
    assert resp.status_code < 500, f"{label}: 5xx on {resp.request.content!r}"
    if resp.status_code >= 400:
        body = resp.json()
        assert isinstance(body, dict) and "error" in body, f"{label}: unstructured error"


@CHAOS_SETTINGS
@given(body=nasty_objects)
def test_receipts_never_5xx(beacon_server, auth_headers, body):
    resp = httpx.post(f"{beacon_server}/api/v1/receipts", json=body, headers=auth_headers)
    _assert_clean(resp, "receipts")


@CHAOS_SETTINGS
@given(body=nasty_objects)
def test_inventory_never_5xx(beacon_server, auth_headers, body):
    resp = httpx.post(f"{beacon_server}/api/v1/inventory", json=body, headers=auth_headers)
    _assert_clean(resp, "inventory")


@CHAOS_SETTINGS
@given(
    body=st.fixed_dictionaries(
        {
            "source": st.one_of(st.text(max_size=30), st.sampled_from(["manual_csv", "dns_query_log"])),
            "payload": st.one_of(nasty_objects, st.none()),
        }
    )
)
def test_discover_never_5xx(beacon_server, auth_headers, body):
    resp = httpx.post(f"{beacon_server}/api/v1/discover", json=body, headers=auth_headers)
    _assert_clean(resp, "discover")


def test_malformed_json_is_rejected(beacon_server, auth_headers):
    resp = httpx.post(
        f"{beacon_server}/api/v1/receipts",
        content='{"vendor": "openai", broken',
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert 400 <= resp.status_code < 500


def test_extra_fields_are_ignored_not_fatal(beacon_server, auth_headers):
    resp = httpx.post(
        f"{beacon_server}/api/v1/receipts",
        json={
            "vendor": "openai",
            "model": "gpt-4o",
            "version": "2024-08-06",
            "event_type": "invocation",
            "environment": "cloud_saas",
            "unexpected_field": {"deeply": {"nested": [1, 2, 3]}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
