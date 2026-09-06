#!/usr/bin/env bash
# Local Door 1: translate :8787, prove :8788, dashboard :3001.
# Sources repo-root .env. Does not print secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

unset ALLOW_DEMO_ROOT ALLOW_DEMO_VERIFY FIXED_MERKLE_ROOT
export WARRANT_FREE_CALLS="${WARRANT_FREE_CALLS:-3}"
export WARRANT_MIN_TIER="${WARRANT_MIN_TIER:-0}"
export PORT=8787
export PROVE_PORT="${PROVE_PORT:-8788}"
export PROVE_URL="${PROVE_URL:-http://127.0.0.1:8788}"
export TRANSLATE_URL="${TRANSLATE_URL:-http://127.0.0.1:8787/v1/translate}"

echo "hosted-dev: translate :8787  prove :${PROVE_PORT}  dashboard :3001"

pnpm --filter @warrant/translate start &
TR_PID=$!
pnpm --filter @warrant/prove start &
PR_PID=$!
cleanup() {
  kill "$TR_PID" "$PR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm --filter @warrant/dashboard exec next dev --port 3001
