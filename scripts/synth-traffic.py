#!/usr/bin/env python3
"""
synth-traffic.py — Replay the 100-case dataset against a live Beacon.

Drives the real Beacon HTTP API:
  POST /api/v1/discover   (source=manual_csv) → creates inventory rows
  POST /api/v1/receipts   (event_type=observation|decision) → writes receipts

For workshops, beta dry-runs, and end-to-end regression tests. Zero external
dependencies — stdlib only.

Usage:
  python3 scripts/synth-traffic.py --once
  python3 scripts/synth-traffic.py --beacon http://localhost:8787 --rate 5
  python3 scripts/synth-traffic.py --once --count 25 --decisions 5

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

# (vendor, model_family) tuples chosen so the discovery upserts feel realistic.
AI_VENDORS = [
    ("openai", "gpt-4o"),
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-3.5-sonnet"),
    ("anthropic", "claude-3-haiku"),
    ("google", "gemini-1.5-pro"),
    ("google", "gemini-1.5-flash"),
    ("mistral", "mistral-large"),
    ("cohere", "command-r-plus"),
    ("perplexity", "sonar-large"),
    ("aws-bedrock", "anthropic.claude-3-sonnet"),
    ("azure-openai", "gpt-4o"),
    ("huggingface", "meta-llama-3-70b"),
]

ENVS = ["prod", "stage", "dev", "shadow-it"]

DECISIONS = ["yes-ship", "yes-steady", "yes-recover", "hold"]


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def load_cases() -> list[dict]:
    if not DATASET.exists():
        sys.stderr.write(
            f"[synth-traffic] dataset not found: {DATASET}\n"
            f"[synth-traffic] using built-in 12-case fallback\n"
        )
        return [
            {"id": i, "title": f"synthetic-case-{i}", "classification": "YES-Steady AI"}
            for i in range(1, 13)
        ]
    raw = json.loads(DATASET.read_text(encoding="utf-8"))
    cases = []
    for i, item in enumerate(raw, start=1):
        cases.append(
            {
                "id": item.get("id", i),
                "title": item.get("title") or item.get("incident") or f"case-{i}",
                "classification": (
                    item.get("classification")
                    or item.get("act")
                    or item.get("ship_recommendation")
                    or "YES-Steady AI"
                ),
                "sector": item.get("sector"),
            }
        )
    return cases


def post_json(url: str, payload: dict, timeout: float = 4.0) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "aigovops-synth/2.3",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")[:400]
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return -1, f"transport: {e}"


def build_csv_payload(n: int) -> str:
    """Build a manual_csv payload with n discovered services."""
    out = ["vendor,model,version,environment"]
    for _ in range(n):
        v, m = random.choice(AI_VENDORS)
        ver = random.choice(["2024-08", "2024-11", "v1", "v2", "latest"])
        env = random.choice(ENVS)
        out.append(f"{v},{m},{ver},{env}")
    return "\n".join(out)


def discover(beacon_url: str, n: int) -> tuple[bool, str]:
    code, body = post_json(
        beacon_url.rstrip("/") + "/api/v1/discover",
        {"source": "manual_csv", "payload": {"content": build_csv_payload(n)}},
    )
    return 200 <= code < 300, body


def receipt_observation(beacon_url: str, case: dict) -> tuple[bool, str]:
    """Emit an observation-class receipt for a case replay."""
    vendor, model = random.choice(AI_VENDORS)
    ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )
    code, body = post_json(
        beacon_url.rstrip("/") + "/api/v1/receipts",
        {
            "vendor": vendor,
            "model": model,
            "version": "latest",
            "event_type": "observation",
            "attributes": {
                "case_id": case.get("id"),
                "case_title": case.get("title"),
                "classification": case.get("classification"),
                "content_hash": "sha256:"
                + sha256_hex(f"{case.get('id')}::{case.get('title','')}"),
                "ts": ts,
            },
        },
    )
    return 200 <= code < 300, body


def receipt_decision(beacon_url: str, case: dict) -> tuple[bool, str]:
    """Emit a decision-class receipt mapped from the case classification."""
    vendor, model = random.choice(AI_VENDORS)
    classification = (case.get("classification") or "").lower()
    if "ship" in classification:
        decision = "yes-ship"
    elif "steady" in classification:
        decision = "yes-steady"
    elif "recover" in classification:
        decision = "yes-recover"
    else:
        decision = random.choice(DECISIONS)
    code, body = post_json(
        beacon_url.rstrip("/") + "/api/v1/receipts",
        {
            "vendor": vendor,
            "model": model,
            "version": "latest",
            "event_type": "decision",
            "attributes": {
                "framework": "nist-ai-rmf-1.0",
                "control": "MAP-2.1",
                "decision": decision,
                "approver": "bob.rapp@aigovops.community",
                "case_id": case.get("id"),
                "case_title": case.get("title"),
            },
        },
    )
    return 200 <= code < 300, body


def main() -> int:
    p = argparse.ArgumentParser(description="Replay 100-case dataset as Beacon events.")
    p.add_argument(
        "--beacon", default=os.environ.get("BEACON_URL", "http://localhost:8787")
    )
    p.add_argument("--rate", type=float, default=4.0, help="Receipts per second")
    p.add_argument(
        "--count",
        type=int,
        default=0,
        help="If >0, send exactly N receipts then exit (implies --once).",
    )
    p.add_argument(
        "--decisions",
        type=int,
        default=4,
        help="Number of decision receipts to emit (rest are observations).",
    )
    p.add_argument("--once", action="store_true", help="Replay all cases once and exit")
    p.add_argument(
        "--discover-count",
        type=int,
        default=10,
        help="Number of inventory rows to discover up-front (manual_csv).",
    )
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--dry-run", action="store_true", help="Print events; do not POST")
    args = p.parse_args()

    cases = load_cases()
    if not cases:
        sys.stderr.write("[synth-traffic] no cases loaded; exiting\n")
        return 2

    if args.count > 0:
        args.once = True

    if not args.quiet:
        sys.stderr.write(
            f"[synth-traffic] beacon={args.beacon} cases={len(cases)} "
            f"rate={args.rate}/s once={args.once} count={args.count} "
            f"decisions={args.decisions} dry_run={args.dry_run}\n"
        )

    # 1) Discovery pass — only when actually talking to a server.
    if not args.dry_run and args.discover_count > 0:
        ok, body = discover(args.beacon, args.discover_count)
        if not args.quiet:
            tag = "ok" if ok else "FAIL"
            sys.stderr.write(
                f"[synth-traffic] discover {tag}: {body[:140]}\n"
            )

    sent = 0
    ok_count = 0
    sleep_s = 1.0 / args.rate if args.rate > 0 else 0
    queue = list(cases)
    random.shuffle(queue)

    target = args.count if args.count > 0 else None
    decisions_left = args.decisions

    try:
        while True:
            for case in queue:
                if target is not None and sent >= target:
                    break
                if decisions_left > 0:
                    fn = receipt_decision
                    decisions_left -= 1
                else:
                    fn = receipt_observation
                if args.dry_run:
                    sent += 1
                    ok_count += 1
                    sys.stdout.write(
                        json.dumps({"case": case.get("id"), "kind": fn.__name__}) + "\n"
                    )
                else:
                    ok, body = fn(args.beacon, case)
                    sent += 1
                    if ok:
                        ok_count += 1
                    elif not args.quiet:
                        sys.stderr.write(
                            f"[synth-traffic] receipt FAIL: {body[:200]}\n"
                        )
                if not args.quiet and sent % 10 == 0:
                    sys.stderr.write(
                        f"[synth-traffic] sent={sent} ok={ok_count}\n"
                    )
                if sleep_s:
                    time.sleep(sleep_s)
            if args.once:
                break
            random.shuffle(queue)
            decisions_left = args.decisions
    except KeyboardInterrupt:
        sys.stderr.write(f"\n[synth-traffic] stopped after sent={sent} ok={ok_count}\n")
        return 0

    sys.stderr.write(f"[synth-traffic] done sent={sent} ok={ok_count}\n")
    return 0 if ok_count == sent else 1


if __name__ == "__main__":
    sys.exit(main())
