#!/usr/bin/env python3
"""
prompt_beacon.py — Log-tail beacon for AI API call metadata.

Watches a configurable directory of access logs / SIEM exports. Parses
lines matching common AI API patterns (OpenAI, Anthropic, Bedrock,
Azure OpenAI, Vertex AI), extracts model name, token count, and route,
then emits a signed receipt per call.

**The beacon never stores prompt or response payloads — metadata only.**

The `--tls-proxy` flag is a stub. TLS MITM is intentionally not enabled
by default; the privacy posture is: see the metadata you can see at the
network or log boundary, not the bodies.

Usage:
    python prompt_beacon.py --log-dir /var/log/proxy --pattern "*.log"
    python prompt_beacon.py --log-dir ./demo-logs --once
    python prompt_beacon.py --tls-proxy
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

from _common import append_receipt, make_receipt, sign_receipt

# Reasonable defaults: parse a common reverse-proxy / SIEM log line shape.
#   <ts> <host> <method> <path> <status> tokens_in=N tokens_out=N model=foo
PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?P<host>api\.openai\.com|api\.anthropic\.com|.*\.openai\.azure\.com|generativelanguage\.googleapis\.com|bedrock-runtime[\w.-]+\.amazonaws\.com|api\.cohere\.\w+|api\.mistral\.ai|api\.groq\.com|api\.perplexity\.ai|api\.deepseek\.com|api\.together\.xyz)"
        r".*?(?P<path>/[\w/.-]+)"
        r".*?(?:model[=:\"]+(?P<model>[\w.-]+))?"
        r".*?(?:tokens_in[=:](?P<tokens_in>\d+))?"
        r".*?(?:tokens_out[=:](?P<tokens_out>\d+))?",
        re.IGNORECASE,
    ),
]

VENDOR_FROM_HOST = {
    "openai.com": "openai",
    "openai.azure.com": "microsoft",
    "anthropic.com": "anthropic",
    "googleapis.com": "google",
    "amazonaws.com": "aws",
    "cohere": "cohere",
    "mistral.ai": "mistral",
    "groq.com": "groq",
    "perplexity.ai": "perplexity",
    "deepseek.com": "deepseek",
    "together.xyz": "together",
}


def vendor_for(host: str) -> str:
    for needle, vendor in VENDOR_FROM_HOST.items():
        if needle in host:
            return vendor
    return "other"


def parse_line(line: str) -> dict[str, str] | None:
    for pat in PATTERNS:
        m = pat.search(line)
        if m:
            d = m.groupdict()
            if d.get("host"):
                return d
    return None


def emit_receipt(parsed: dict[str, str], source_file: str) -> None:
    host = parsed["host"]
    model = parsed.get("model") or "unspecified"
    receipt = make_receipt(
        event_type="inference.observed",
        subject=f"call://{host}{parsed.get('path') or ''}",
        action="prompt_beacon.observed_call",
        vendor=vendor_for(host),
        model=model,
        version=model,  # callers should pin; record what we saw
        evidence={
            "host": host,
            "route": parsed.get("path"),
            "tokens_in": int(parsed["tokens_in"]) if parsed.get("tokens_in") else None,
            "tokens_out": int(parsed["tokens_out"]) if parsed.get("tokens_out") else None,
            "source_log": source_file,
            "captured_payload": False,  # privacy default
        },
        environment="cloud_saas",
    )
    sign_receipt(receipt)
    append_receipt(receipt)


def tail_files(log_dir: Path, pattern: str, once: bool, interval: float) -> int:
    """Tail every file matching `pattern` in `log_dir`. Returns receipt count."""
    offsets: dict[Path, int] = {}
    total = 0
    while True:
        for path in sorted(log_dir.glob(pattern)):
            try:
                size = path.stat().st_size
            except OSError:
                continue
            start = offsets.get(path, 0)
            if start > size:
                start = 0  # rotation
            if start == size:
                continue
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                fh.seek(start)
                for line in fh:
                    parsed = parse_line(line)
                    if parsed:
                        emit_receipt(parsed, str(path))
                        total += 1
                offsets[path] = fh.tell()
        if once:
            return total
        time.sleep(interval)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--log-dir", type=Path, default=Path("./logs"), help="Directory containing access/SIEM logs")
    p.add_argument("--pattern", default="*.log", help="Glob pattern for log files (default *.log)")
    p.add_argument("--interval", type=float, default=5.0, help="Tail poll interval (s)")
    p.add_argument("--once", action="store_true", help="Single pass, then exit")
    p.add_argument("--tls-proxy", action="store_true", help="Stub for future TLS proxy mode")
    args = p.parse_args(argv)

    if args.tls_proxy:
        print("TLS-MITM mode not enabled (privacy default). Run with a real proxy to feed --log-dir instead.")
        return 0

    if not args.log_dir.exists():
        print(f"[prompt_beacon] log dir {args.log_dir} not found; nothing to tail")
        return 0

    print(f"[prompt_beacon] tailing {args.log_dir}/{args.pattern}")
    n = tail_files(args.log_dir, args.pattern, args.once, args.interval)
    if args.once:
        print(f"[prompt_beacon] {n} receipt(s) emitted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
