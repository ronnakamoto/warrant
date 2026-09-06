#!/usr/bin/env bash
# Dry-run the solo demo video beats (prove → pay).
# Restarts translate on :8787 so quota is fresh. Does not record video.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "missing .env — copy .env.example" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

STORE="${WARRANT_STORE:-/tmp/warrant-live/state.json}"
export WARRANT_STORE="$STORE"
export TRANSLATE_URL="${TRANSLATE_URL:-http://127.0.0.1:8787/v1/translate}"
PORT="${PORT:-8787}"

if [[ ! -f "$STORE" ]]; then
  echo "missing store $STORE — bind + delegate first (see docs/08-demo-runbook.md)" >&2
  exit 1
fi

if [[ ! -f circuits/build/warrant_final.zkey ]]; then
  echo "missing zkey — run ./scripts/download-zkey.sh" >&2
  exit 1
fi

if [[ -z "${HEDERA_PAY_TO:-}" || "${HEDERA_PAY_TO}" == "${HEDERA_ACCOUNT_ID:-}" ]]; then
  echo "set HEDERA_PAY_TO to a merchant account distinct from HEDERA_ACCOUNT_ID" >&2
  exit 1
fi

health() {
  curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1
}

echo "restarting translate on :${PORT} (real vkey, fresh in-memory quota)…"
lsof -i ":${PORT}" -t 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
export ALLOW_DEMO_ROOT=1
export WARRANT_MIN_TIER="${WARRANT_MIN_TIER:-0}"
export WARRANT_FREE_CALLS="${WARRANT_FREE_CALLS:-0}"
export WARRANT_VKEY_PATH="${WARRANT_VKEY_PATH:-$ROOT/circuits/build/warrant_vkey.json}"
unset FIXED_MERKLE_ROOT ALLOW_DEMO_VERIFY || true
pnpm --filter @warrant/translate dev &
TRANSLATE_PID=$!
trap 'kill "$TRANSLATE_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  health && break
  sleep 0.5
done
health || { echo "translate failed to start" >&2; exit 1; }

call() {
  local label=$1
  shift
  echo ""
  echo "=== $label ==="
  "$@"
}

call "prove + pay (Blocky402)" env WARRANT_PAY=1 pnpm --filter @warrant/agent exec tsx demo/live-call.ts

echo ""
echo "Dry-run complete. Revoke beat: dashboard Revoke or cast send revoke, then live-call → 403 root_revoked."
echo "Recover: warrant sync-root && re-delegate. Shot list: docs/08-demo-runbook.md"
