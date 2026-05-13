#!/usr/bin/env python3
"""
model_beacon.py — Passive egress sniffer for known AI API hosts.

Cross-references `psutil.net_connections()` against a hostname list and
emits one signed receipt per unique (host, process) pair per scan. The
beacon never inspects payloads; only the destination, the originating
PID, and the resolved process name.

Usage:
    python model_beacon.py --interval 30          # poll every 30s
    python model_beacon.py --once                 # single scan and exit
    python model_beacon.py --hosts-file hosts.txt # custom host list
"""

from __future__ import annotations

import argparse
import socket
import sys
import time
from pathlib import Path

try:
    import psutil  # type: ignore
except ImportError:  # pragma: no cover
    psutil = None  # noqa: N816

from _common import append_receipt, make_receipt, sign_receipt

DEFAULT_HOSTS: list[str] = [
    "api.openai.com",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "bedrock-runtime.us-east-1.amazonaws.com",
    "bedrock-runtime.us-west-2.amazonaws.com",
    "bedrock-runtime.eu-west-1.amazonaws.com",
    "openai.azure.com",
    "api.cohere.ai",
    "api.cohere.com",
    "api.mistral.ai",
    "api.together.xyz",
    "api.groq.com",
    "api.perplexity.ai",
    "api.deepseek.com",
    "api.fireworks.ai",
    "api.replicate.com",
    "api.x.ai",
    "api.runwayml.com",
    "api.stability.ai",
    "api.elevenlabs.io",
]

VENDOR_MAP = {
    "openai.com": "openai",
    "openai.azure.com": "microsoft",
    "anthropic.com": "anthropic",
    "googleapis.com": "google",
    "amazonaws.com": "aws",
    "cohere.ai": "cohere",
    "cohere.com": "cohere",
    "mistral.ai": "mistral",
    "together.xyz": "together",
    "groq.com": "groq",
    "perplexity.ai": "perplexity",
    "deepseek.com": "deepseek",
    "fireworks.ai": "fireworks",
    "replicate.com": "replicate",
    "x.ai": "xai",
    "runwayml.com": "runway",
    "stability.ai": "stability",
    "elevenlabs.io": "elevenlabs",
}


def load_hosts(path: Path | None) -> list[str]:
    if path is None:
        return DEFAULT_HOSTS
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]


def resolve_hosts(hosts: list[str]) -> dict[str, str]:
    """Resolve hostnames to IPs. Returns IP -> hostname."""
    ip_to_host: dict[str, str] = {}
    for h in hosts:
        try:
            infos = socket.getaddrinfo(h, 443, type=socket.SOCK_STREAM)
            for fam, _stype, _proto, _can, sa in infos:
                ip = sa[0]
                ip_to_host.setdefault(ip, h)
        except (socket.gaierror, OSError):
            continue
    return ip_to_host


def vendor_for(host: str) -> str:
    for needle, vendor in VENDOR_MAP.items():
        if needle in host:
            return vendor
    return "other"


def scan(ip_to_host: dict[str, str]) -> list[dict[str, str]]:
    """Return a list of (host, pid, process_name) observations."""
    if psutil is None:
        print("[model_beacon] psutil not installed; cannot enumerate connections", file=sys.stderr)
        return []
    seen: set[tuple[str, int, str]] = set()
    observations: list[dict[str, str]] = []
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError):
        print("[model_beacon] permission denied for net_connections (try sudo)", file=sys.stderr)
        return []
    for c in conns:
        if not c.raddr:
            continue
        host = ip_to_host.get(c.raddr.ip)
        if not host:
            continue
        pid = c.pid or 0
        pname = "<unknown>"
        if pid:
            try:
                pname = psutil.Process(pid).name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        key = (host, pid, pname)
        if key in seen:
            continue
        seen.add(key)
        observations.append({"host": host, "pid": str(pid), "process": pname})
    return observations


def emit_receipts(observations: list[dict[str, str]]) -> int:
    count = 0
    for obs in observations:
        host = obs["host"]
        receipt = make_receipt(
            event_type="discovery.model.found",
            subject=f"egress://{host}",
            action="model_beacon.observed_egress",
            vendor=vendor_for(host),
            evidence={
                "host": host,
                "pid": int(obs["pid"]),
                "process": obs["process"],
                "method": "psutil.net_connections",
            },
            environment="on_prem",
        )
        sign_receipt(receipt)
        append_receipt(receipt)
        count += 1
    return count


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--hosts-file", type=Path, help="File with one hostname per line (overrides defaults)")
    p.add_argument("--interval", type=float, default=30.0, help="Seconds between scans (default 30)")
    p.add_argument("--once", action="store_true", help="Run a single scan and exit")
    args = p.parse_args(argv)

    hosts = load_hosts(args.hosts_file)
    print(f"[model_beacon] watching {len(hosts)} hosts")

    while True:
        ip_to_host = resolve_hosts(hosts)
        observations = scan(ip_to_host)
        n = emit_receipts(observations)
        print(f"[model_beacon] scan complete: {n} receipt(s) emitted, {len(ip_to_host)} IPs tracked")
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
