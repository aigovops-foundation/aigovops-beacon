#!/usr/bin/env python3
"""
synth-traffic.py — Replay the 100-case dataset as fake DNS/SNI events.

For workshops, beta dry-runs, and end-to-end regression tests. Posts signed
events to a Beacon ingest endpoint at the speed you want. Zero external deps.

Usage:
  python3 scripts/synth-traffic.py
  python3 scripts/synth-traffic.py --beacon http://localhost:8787 --rate 5
  python3 scripts/synth-traffic.py --once --rate 50  # blast all 100 then stop

Apache-2.0.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import random
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATASET = ROOT / "docs" / "data" / "ai_failures_top100.json"

# Curated set of AI service hostnames each failure case might plausibly touch.
# Synth-traffic picks 1-3 per case at random to simulate browser/CLI/server use.
AI_HOSTS = [
    "chatgpt.com",
    "api.openai.com",
    "claude.ai",
    "api.anthropic.com",
    "gemini.google.com",
    "generativelanguage.googleapis.com",
    "copilot.microsoft.com",
    "api.cohere.ai",
    "huggingface.co",
    "replicate.com",
    "api.mistral.ai",
    "perplexity.ai",
    "api.perplexity.ai",
    "you.com",
    "groq.com",
    "api.groq.com",
    "bedrock.us-east-1.amazonaws.com",
    "aiplatform.googleapis.com",
    "openai.azure.com",
    "api.together.xyz",
]

SOURCES = ["ext.chrome.v2.2.0", "dns.tail.v2.2.0", "casb.netskope.v2.2.0"]


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def load_cases() -> list[dict]:
    if not DATASET.exists():
        sys.stderr.write(
            f"[synth-traffic] dataset not found: {DATASET}\n"
            f"[synth-traffic] using built-in 12-case fallback\n"
        )
        return [
            {"id": i, "title": f"synthetic-case-{i}", "classification": "YES-Steady"}
            for i in range(1, 13)
        ]
    raw = json.loads(DATASET.read_text(encoding="utf-8"))
    # Normalize: dataset uses `incident` + `ship_recommendation` keys.
    cases = []
    for i, item in enumerate(raw, start=1):
        cases.append({
            "id": item.get("id", i),
            "title": item.get("title") or item.get("incident") or f"case-{i}",
            "classification": (
                item.get("classification")
                or item.get("act")  # dataset uses 'act': YES-Ship AI / YES-Steady AI / YES-Recover AI
                or item.get("ship_recommendation")
                or "YES-Steady AI"
            ),
            "sector": item.get("sector"),
        })
    return cases


def build_event(case: dict, salt: str) -> dict:
    host = random.choice(AI_HOSTS)
    source = random.choice(SOURCES)
    ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )
    content_hash = sha256_hex(f"{case.get('id')}::{case.get('title','')}")
    host_hash = sha256_hex(f"{salt}::{host}")
    return {
        "schema_version": "2.0",
        "ts": ts,
        "source": source,
        "host": host,  # cleartext only because this is the lab; prod hashes
        "host_hash": f"sha256:{host_hash}",
        "content_hash": f"sha256:{content_hash}",
        "case_id": case.get("id"),
        "case_title": case.get("title"),
        "classification": case.get("classification"),
        # Signature elided in lab mode; real beacons add ed25519 sig.
        "sig": "lab:unsigned",
    }


def post(url: str, payload: dict, timeout: float = 2.0) -> tuple[bool, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "aigovops-synth/2.2"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return True, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:200]}"
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return False, f"transport: {e}"


def main() -> int:
    p = argparse.ArgumentParser(description="Replay 100-case dataset as Beacon events.")
    p.add_argument("--beacon", default=os.environ.get("BEACON_URL", "http://localhost:8787"))
    p.add_argument("--path", default="/api/events", help="Ingest path (default /api/events)")
    p.add_argument("--rate", type=float, default=2.0, help="Events per second (default 2)")
    p.add_argument("--once", action="store_true", help="Replay all cases once and exit")
    p.add_argument("--salt", default=os.environ.get("BEACON_SALT", "lab-default-salt"))
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--dry-run", action="store_true", help="Print events; do not POST")
    args = p.parse_args()

    cases = load_cases()
    if not cases:
        sys.stderr.write("[synth-traffic] no cases loaded; exiting\n")
        return 2

    url = args.beacon.rstrip("/") + args.path
    if not args.quiet:
        sys.stderr.write(
            f"[synth-traffic] target={url} rate={args.rate}/s cases={len(cases)} "
            f"mode={'once' if args.once else 'loop'} "
            f"dry_run={args.dry_run}\n"
        )

    sent = 0
    ok = 0
    sleep_s = 1.0 / args.rate if args.rate > 0 else 0
    queue = list(cases)
    random.shuffle(queue)

    try:
        while True:
            for case in queue:
                event = build_event(case, args.salt)
                if args.dry_run:
                    sys.stdout.write(json.dumps(event) + "\n")
                    success, body = True, "dry-run"
                else:
                    success, body = post(url, event)
                sent += 1
                ok += 1 if success else 0
                if not args.quiet and sent % 10 == 0:
                    sys.stderr.write(
                        f"[synth-traffic] sent={sent} ok={ok} last={event['source']} host={event['host']}\n"
                    )
                if sleep_s:
                    time.sleep(sleep_s)
            if args.once:
                break
            random.shuffle(queue)
    except KeyboardInterrupt:
        sys.stderr.write(f"\n[synth-traffic] stopped after sent={sent} ok={ok}\n")
        return 0

    sys.stderr.write(f"[synth-traffic] done sent={sent} ok={ok}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
