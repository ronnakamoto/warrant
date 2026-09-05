---
name: warrant
description: Bind personhood-backed roots, delegate attenuated mandates, and call x402 resources with warrant proofs via warrant.fetch / the warrant CLI.
---

# Warrant agent skill

## Commands

```bash
pnpm --filter @warrant/agent cli -- keygen --name alice
pnpm --filter @warrant/agent cli -- bind-root --name alice --wallet 0x... --tier 0 --local
pnpm --filter @warrant/agent cli -- delegate --from alice --to orchestrator --scope translate --budget 2000000 --ttl 24h
pnpm --filter @warrant/agent cli -- delegate --from orchestrator --to translator --scope translate --budget 200000 --ttl 1h
pnpm --filter @warrant/agent cli -- fetch --as translator --url http://127.0.0.1:8787/v1/translate --body '{"text":"hi"}'
```

## Rules

- Attenuate scope/budget/TTL on every hop. Widening fails client-side and in-circuit.
- Free path uses `warrant` header after a 402 challenge — never skip payment verify hooks.
- Server audit logs show **nullifier only** (no names, addresses, or tree).
- `bind-root --tier 0` mints a **session** `humanTag` (free quota is per bind, not per human). `tier > 0` requires AgentBook `lookupHuman` and uses that id as `humanTag`.
- Do not share static tags. On-chain `tier > 0` without a live AgentBook lookup fails.
- Store path: `$WARRANT_STORE` or `~/.warrant/state.json` (mode `0600`).
- Demo-only: `FIXED_MERKLE_ROOT` requires `ALLOW_DEMO_ROOT=1`. Production uses `REGISTRY_ADDRESS` + `BASE_SEPOLIA_RPC`.
