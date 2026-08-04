#!/usr/bin/env bash
# smoke-v2.sh — Smoke test for Beacon Lab v2 server endpoints.
#
# Boots the server locally, waits for /api/status, runs 6 checks, then
# kills the server.  Exits 1 if any check fails.
#
# Usage:
#   cd /home/user/workspace/lab-service
#   chmod +x script/smoke-v2.sh && ./script/smoke-v2.sh
#
# Environment:
#   PORT defaults to 5050 to avoid conflicting with a running dev server.
#   ADMIN_PASSWORD and JWT_SECRET are set to test values inline.

set -euo pipefail

PORT=5050
BASE="http://localhost:${PORT}"
PASS=0
FAIL=0
SERVER_PID=""

# ── Cleanup ────────────────────────────────────────────────────────────────────
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Helpers ────────────────────────────────────────────────────────────────────
check() {
  local name="$1"
  local result="$2"   # "ok" or anything else = fail
  local detail="${3:-}"
  if [ "$result" = "ok" ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name${detail:+  →  $detail}"
    FAIL=$((FAIL + 1))
  fi
}

# ── Build ──────────────────────────────────────────────────────────────────────
echo "==> Building..."
npm run build 2>&1 | tail -5

# ── Start server ───────────────────────────────────────────────────────────────
echo "==> Starting server on port ${PORT}..."
PORT="${PORT}" \
  ADMIN_PASSWORD="test" \
  JWT_SECRET="test-secret-do-not-use-in-prod" \
  node dist/index.cjs &
SERVER_PID=$!

# Wait up to 15s for the server to respond on /api/status.
echo "==> Waiting for server to be ready..."
READY=0
for i in $(seq 1 30); do
  if curl -sf "${BASE}/api/status" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -eq 0 ]; then
  echo "  FAIL  Server never became ready"
  exit 1
fi
echo "==> Server is up."

# ── Check 1: GET /api/status returns labName and bundleHash ───────────────────
echo ""
echo "--- Running smoke checks ---"

STATUS_JSON=$(curl -sf "${BASE}/api/status")
LAB_NAME=$(echo "$STATUS_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(j.labName||'');" 2>/dev/null || echo "")
BUNDLE_HASH=$(echo "$STATUS_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(String(j.bundleHash===undefined?'MISSING':'present'));" 2>/dev/null || echo "")
if [ -n "$LAB_NAME" ] && [ "$BUNDLE_HASH" = "present" ]; then
  check "GET /api/status returns labName+bundleHash" "ok"
else
  check "GET /api/status returns labName+bundleHash" "fail" "labName='${LAB_NAME}' bundleHash='${BUNDLE_HASH}'"
fi

# ── Check 2: POST /api/anon/session returns a JWT ─────────────────────────────
ANON_RESP=$(curl -sf -X POST "${BASE}/api/anon/session" \
  -H "Content-Type: application/json" \
  -d '{}')
ANON_TOKEN=$(echo "$ANON_RESP" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(j.token||'');" 2>/dev/null || echo "")
# A JWT has three dot-separated base64url segments.
if echo "$ANON_TOKEN" | grep -qE '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'; then
  check "POST /api/anon/session returns JWT" "ok"
else
  check "POST /api/anon/session returns JWT" "fail" "token='${ANON_TOKEN}'"
fi

# ── Check 3: POST /api/anon/promote returns trainee session ───────────────────
if [ -n "$ANON_TOKEN" ]; then
  PROMOTE_RESP=$(curl -sf -X POST "${BASE}/api/anon/promote" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ANON_TOKEN}" \
    -d '{"mode":"demo"}')
  PROMOTE_JWT=$(echo "$PROMOTE_RESP" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(j.jwt||j.token||'');" 2>/dev/null || echo "")
  PROMOTE_ROLE=$(echo "$PROMOTE_RESP" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write((j.session&&j.session.role)||'');" 2>/dev/null || echo "")
  if [ "$PROMOTE_ROLE" = "trainee" ]; then
    check "POST /api/anon/promote returns trainee session" "ok"
  else
    check "POST /api/anon/promote returns trainee session" "fail" "role='${PROMOTE_ROLE}'"
  fi
else
  check "POST /api/anon/promote returns trainee session" "fail" "skipped (no anon token)"
fi

# ── Check 4: GET /api/curriculum/100 returns 5 rules ─────────────────────────
CURR_RESP=$(curl -sf "${BASE}/api/curriculum/100")
RULE_COUNT=$(echo "$CURR_RESP" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(String(Array.isArray(j)?j.length:'NaN'));" 2>/dev/null || echo "0")
if [ "$RULE_COUNT" = "5" ]; then
  check "GET /api/curriculum/100 returns 5 rules" "ok"
else
  check "GET /api/curriculum/100 returns 5 rules" "fail" "count=${RULE_COUNT}"
fi

# ── Check 5: GET /api/lab/public-receipts returns array ──────────────────────
PUB_RESP=$(curl -sf "${BASE}/api/lab/public-receipts")
IS_ARRAY=$(echo "$PUB_RESP" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); process.stdout.write(Array.isArray(j.receipts)?'yes':'no');" 2>/dev/null || echo "no")
if [ "$IS_ARRAY" = "yes" ]; then
  check "GET /api/lab/public-receipts returns array" "ok"
else
  check "GET /api/lab/public-receipts returns array" "fail" "not an array"
fi

# ── Check 6: CORS preflight shows Access-Control-Allow-Origin ─────────────────
PREFLIGHT=$(curl -s -i -X OPTIONS "${BASE}/api/status" \
  -H "Origin: https://aigovops-foundation.github.io" \
  -H "Access-Control-Request-Method: GET")
if echo "$PREFLIGHT" | grep -qi "access-control-allow-origin"; then
  check "CORS preflight returns Access-Control-Allow-Origin" "ok"
else
  check "CORS preflight returns Access-Control-Allow-Origin" "fail" "header missing"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  echo "SMOKE TEST FAILED"
  exit 1
else
  echo "SMOKE TEST PASSED"
  exit 0
fi
