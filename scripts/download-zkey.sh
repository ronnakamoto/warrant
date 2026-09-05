#!/usr/bin/env bash
# Fetch the released warrant_final.zkey (~28 MB). Never commit zkeys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${ROOT}/circuits/build"
mkdir -p "$BUILD"
OUT="${BUILD}/warrant_final.zkey"
VK="${BUILD}/warrant_vkey.json"

WARRANT_ZKEY_URL="${WARRANT_ZKEY_URL:-}"

if [[ -f "$OUT" && -s "$VK" ]]; then
  echo "already present: $OUT ($(wc -c < "$OUT") bytes), vkey $(wc -c < "$VK") bytes"
  exit 0
fi

if [[ -n "$WARRANT_ZKEY_URL" ]]; then
  echo "Downloading zkey from WARRANT_ZKEY_URL..."
  curl -L --fail -o "$OUT" "$WARRANT_ZKEY_URL"
  if [[ -n "${WARRANT_VKEY_URL:-}" ]]; then
    curl -L --fail -o "$VK" "$WARRANT_VKEY_URL"
  else
    node "${ROOT}/node_modules/snarkjs/cli.js" zkey export verificationkey "$OUT" "$VK"
  fi
  echo "wrote $OUT"
  exit 0
fi

echo "No WARRANT_ZKEY_URL set — running local ceremony via scripts/setup-groth16"
exec "${ROOT}/scripts/setup-groth16" warrant
