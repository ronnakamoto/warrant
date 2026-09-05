#!/usr/bin/env bash
# Append a second local leaf without bind-root (does not rotate tags or clear mandates).
# Usage: WARRANT_STORE=/tmp/warrant-live/state.json ./scripts/demo-multileaf-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STORE="${WARRANT_STORE:?set WARRANT_STORE}"
export WARRANT_STORE="$STORE"

pnpm --filter @warrant/agent exec tsx <<'TS'
import { hashLeaf } from "@warrant/core";
import { appendLeaf, ensureIdentity, loadState, saveState } from "./src/store.ts";

const path = process.env.WARRANT_STORE!;
const state = loadState(path);
const bob = ensureIdentity(state, "bob");
const leaf = hashLeaf(bob.publicKey[0], bob.publicKey[1], 0n, 0n);
const already = state.members.includes(leaf.toString());
if (!already) appendLeaf(state, leaf);
saveState(state, path);
console.log(
  JSON.stringify(
    {
      added: already ? "bob (already present)" : "bob",
      leaf: leaf.toString(),
      members: state.members.length,
      rootName: state.rootName ?? null,
      mandatesKept: state.mandates.length,
    },
    null,
    2,
  ),
);
TS
