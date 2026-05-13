#!/usr/bin/env python3
"""
casb_poll.py — Pull AI-service events from a CASB and emit Beacon events.

Supports a vendor-neutral JSON shape; ship per-vendor adapters in v2.3.
Apache-2.0.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main() -> int:
    base = os.environ.get("CASB_API_BASE")
    key = os.environ.get("CASB_API_KEY")
    beacon = os.environ.get("BEACON_URL", "http://localhost:8787")
    if not base or not key:
        sys.stderr.write("[casb_poll] CASB_API_BASE or CASB_API_KEY missing — running in dry-run mode\n")
        return 0

    req = urllib.request.Request(
        base.rstrip("/") + "/events?category=ai&limit=500",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        sys.stderr.write(f"[casb_poll] CASB fetch failed: {e}\n")
        return 1

    events = data.get("events", []) if isinstance(data, dict) else []
    sent = 0
    for ev in events:
        host = ev.get("destination_host") or ev.get("hostname") or ev.get("app_url")
        if not host:
            continue
        payload = {
            "schema_version": "2.0",
            "ts": ev.get("ts") or now(),
            "source": "casb.v2.2.0",
            "host": host,
            "host_hash": None,
            "content_hash": None,
            "user_opaque": ev.get("user_id"),
            "action": ev.get("action"),
            "sig": "casb:unsigned",
        }
        try:
            req2 = urllib.request.Request(
                beacon.rstrip("/") + "/api/events",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req2, timeout=2.0):
                sent += 1
        except Exception:
            pass

    sys.stderr.write(f"[casb_poll] forwarded={sent} of fetched={len(events)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
