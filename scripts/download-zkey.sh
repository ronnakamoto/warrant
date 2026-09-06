#!/usr/bin/env bash
# Fetch the released warrant_final.zkey (~28 MB). Never commit zkeys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${ROOT}/circuits/build"
mkdir -p "$BUILD" "${BUILD}/warrant_js"
OUT="${BUILD}/warrant_final.zkey"
VK="${BUILD}/warrant_vkey.json"
WASM="${BUILD}/warrant_js/warrant.wasm"

# Default: demo/testnet artifacts release (not multi-party MPC — see CEREMONY.md).
DEFAULT_ZKEY_URL="https://github.com/ronnakamoto/warrant/releases/download/artifacts-groth16-v1/warrant_final.zkey"
DEFAULT_VKEY_URL="https://github.com/ronnakamoto/warrant/releases/download/artifacts-groth16-v1/warrant_vkey.json"
DEFAULT_WASM_URL="https://github.com/ronnakamoto/warrant/releases/download/artifacts-groth16-v1/warrant.wasm"

WARRANT_ZKEY_URL="${WARRANT_ZKEY_URL:-$DEFAULT_ZKEY_URL}"
WARRANT_VKEY_URL="${WARRANT_VKEY_URL:-$DEFAULT_VKEY_URL}"
WARRANT_WASM_URL="${WARRANT_WASM_URL:-$DEFAULT_WASM_URL}"

if [[ -f "$OUT" && -s "$VK" && -s "$WASM" ]]; then
  echo "already present: $OUT ($(wc -c < "$OUT") bytes), vkey $(wc -c < "$VK") bytes, wasm $(wc -c < "$WASM") bytes"
  exit 0
fi

if [[ "${WARRANT_ZKEY_URL}" == "local" ]]; then
  echo "WARRANT_ZKEY_URL=local — running local ceremony via scripts/setup-groth16"
  exec "${ROOT}/scripts/setup-groth16" warrant
fi

echo "Downloading zkey from WARRANT_ZKEY_URL..."
curl -L --fail -o "$OUT" "$WARRANT_ZKEY_URL"
if [[ -n "${WARRANT_VKEY_URL}" ]]; then
  curl -L --fail -o "$VK" "$WARRANT_VKEY_URL"
else
  node "${ROOT}/node_modules/snarkjs/cli.js" zkey export verificationkey "$OUT" "$VK"
fi
if [[ ! -s "$WASM" ]]; then
  echo "Downloading wasm from WARRANT_WASM_URL..."
  curl -L --fail -o "$WASM" "$WARRANT_WASM_URL"
fi
echo "wrote $OUT"
echo "vkey → $VK ($(wc -c < "$VK") bytes)"
echo "wasm → $WASM ($(wc -c < "$WASM") bytes)"
