#!/usr/bin/env bash
# Bind a second local root identity so the anonymity-set demo is not “tree of 1”.
# Does NOT call on-chain bind for bob (operator must bind separately if live).
# Usage: WARRANT_STORE=/tmp/warrant-live/state.json ./scripts/demo-multileaf-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STORE="${WARRANT_STORE:?set WARRANT_STORE}"

pnpm --filter @warrant/agent exec tsx src/cli.ts keygen --name bob --store "$STORE" || true
# Local leaf only (tier=0) — expands the LeanIMT mirror for dashboard / prove membership size.
pnpm --filter @warrant/agent exec tsx src/cli.ts bind-root \
  --name bob \
  --wallet 0x00000000000000000000000000000000000000b0 \
  --tier 0 \
  --local \
  --store "$STORE"

echo "Local members now include bob. For live chain anonymity set, operator-bind a second real wallet."
echo "Store: $STORE"
