"""Shared pytest fixtures for the Beacon test pyramid.

The headline fixture is `beacon_server`: it boots the Node Beacon server as
a subprocess against a throwaway data dir on an ephemeral-ish port, waits
for the health endpoint, yields its base URL, then tears it down. The E2E
and chaos layers use it to exercise the live HTTP surface from Python.

If Node or the server's node_modules are unavailable, the fixture issues a
`pytest.skip` rather than failing — so a pure-Python environment can still
run the unit layer.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = REPO_ROOT / "server"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_health(base_url: str, proc: subprocess.Popen, timeout: float = 25.0) -> None:
    import httpx

    deadline = time.time() + timeout
    last_err: Exception | None = None
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"beacon server exited early with code {proc.returncode}"
            )
        try:
            r = httpx.get(f"{base_url}/api/v1/health", timeout=2.0)
            if r.status_code == 200 and r.json().get("ok") is True:
                return
        except Exception as e:  # noqa: BLE001 — connection refused while booting
            last_err = e
        time.sleep(0.25)
    raise RuntimeError(f"beacon server did not become healthy in time: {last_err}")


@pytest.fixture(scope="session")
def beacon_server():
    """Session-scoped live Beacon server. Yields its base URL."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed; skipping live-server E2E layer")
    if not (SERVER_DIR / "node_modules").exists():
        pytest.skip(
            "server/node_modules missing; run `npm install` in server/ first"
        )

    data_dir = tempfile.mkdtemp(prefix="beacon-pytest-")
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"

    env = {
        **os.environ,
        "BEACON_DATA_DIR": data_dir,
        "BEACON_HOST": "127.0.0.1",
        "BEACON_PORT": str(port),
        "BEACON_CAPTURE_MODE": "redacted",
    }
    proc = subprocess.Popen(
        [node, "src/index.js"],
        cwd=str(SERVER_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for_health(base_url, proc)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Identity headers an upstream OIDC proxy would inject."""
    return {
        "X-Beacon-User-Sub": "py-e2e-sub",
        "X-Beacon-User-Email": "py-e2e@example.org",
        "X-Beacon-OIDC-Issuer": "https://issuer.example.org",
    }


@pytest.fixture(scope="session")
def receipt_schema() -> dict:
    """The published OVERT 1.0 receipt schema."""
    path = REPO_ROOT / "docs" / "blueprint" / "artifacts" / "receipt.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))
