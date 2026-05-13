#!/usr/bin/env python3
"""
tail_dns.py — Tail a corp DNS query log and emit Beacon events for AI hostnames.

Supports BIND named-querylog, Windows DNS Analytical (CSV), and Infoblox export.
Format-agnostic: looks for hostnames in every line, filters by an allowlist
regex, and POSTs the matches to Beacon. Apache-2.0.

Usage:
  python3 scripts/tail_dns.py --watch /var/log/dns --beacon http://beacon:8787
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AI_HOST_RE = re.compile(
    r"\b("
    r"(?:[a-z0-9-]+\.)*"
    r"(?:openai\.com|chatgpt\.com|anthropic\.com|claude\.ai|gemini\.google\.com|"
    r"generativelanguage\.googleapis\.com|copilot\.microsoft\.com|cohere\.ai|"
    r"huggingface\.co|replicate\.com|mistral\.ai|perplexity\.ai|you\.com|"
    r"groq\.com|together\.xyz|bedrock\.amazonaws\.com|aiplatform\.googleapis\.com|"
    r"openai\.azure\.com)"
    r")\b",
    re.IGNORECASE,
)

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def post_event(beacon_url: str, host: str) -> bool:
    payload = {
        "schema_version": "2.0",
        "ts": now(),
        "source": "dns.tail.v2.2.0",
        "host": host,
        "host_hash": None,  # Beacon will salt+hash on ingest
        "content_hash": None,
        "sig": "dns:unsigned",
    }
    req = urllib.request.Request(
        beacon_url.rstrip("/") + "/api/events",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=2.0) as r:
            return r.status < 400
    except Exception:
        return False


def iter_new_lines(path: Path, offset: int):
    """Yield (line, new_offset) for any lines past `offset`. Handles rotation."""
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return
    if size < offset:
        offset = 0  # rotated
    with path.open("r", errors="replace") as f:
        f.seek(offset)
        for line in f:
            yield line.rstrip("\n"), f.tell()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--watch", required=True, help="Directory containing DNS log files")
    p.add_argument("--beacon", default=os.environ.get("BEACON_URL", "http://localhost:8787"))
    p.add_argument("--interval", type=float, default=2.0)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args()

    watch = Path(args.watch)
    if not watch.exists():
        sys.stderr.write(f"[tail_dns] watch dir not found: {watch}\n")
        return 2

    offsets: dict[str, int] = {}
    seen_hosts: set[str] = set()
    matched = 0

    if not args.quiet:
        sys.stderr.write(f"[tail_dns] watching {watch} → {args.beacon}\n")

    while True:
        for path in watch.glob("*"):
            if not path.is_file():
                continue
            off = offsets.get(str(path), 0)
            new_off = off
            for line, new_off in iter_new_lines(path, off):
                m = AI_HOST_RE.search(line)
                if not m:
                    continue
                host = m.group(1).lower()
                seen_hosts.add(host)
                ok = post_event(args.beacon, host)
                matched += 1 if ok else 0
                if not args.quiet and matched % 10 == 0:
                    sys.stderr.write(
                        f"[tail_dns] matched={matched} unique_hosts={len(seen_hosts)} last={host}\n"
                    )
            offsets[str(path)] = new_off
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
