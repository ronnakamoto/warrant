# `@warrant/dashboard`

Next.js (React 19) + **Astryx** runtime with an editable **Carbon g10 / g100** theme (`theme/carbon-g10.ts`). One page: load the live MandateRegistry list from **The Graph** (Studio subgraph + Agent0 ERC-8004 composition), hydrate Baby Jubjub keys via RPC, **Revoke this root** → `MandateRegistry.revoke(siblings)`, activity log, Base Sepolia explorer links. A local `dashboard-mirror.json` remains a fallback.

## Run

```bash
# from repo root
pnpm --filter @warrant/dashboard theme:build
pnpm --filter @warrant/dashboard dev
```

Env (optional):

- `NEXT_PUBLIC_RPC_URL` — default `https://sepolia.base.org`
- `NEXT_PUBLIC_REGISTRY_ADDRESS` — `MandateRegistry` on Base Sepolia
- `GRAPH_API_KEY` / `GRAPH_WARRANT_QUERY_URL` — Subgraph Studio (server-side; see `subgraphs/mandate-registry`)
- `GRAPH_AGENT0_SUBGRAPH_ID` — defaults to Agent0 Base Sepolia

**Load live list from The Graph**, **Confirm on Base Sepolia**, then **Revoke**. Revoke stays off until that check. The flow preflights `leafOf` / `currentRoot`, requires a successful receipt before updating the local LeanIMT, and clears the private key from memory afterward. Next `warrant.fetch` using the old root must receive **403** `root_revoked`.

## Boundaries

No `snarkjs`, `circomlib*`, `spikes/`, or `circuits/` imports. Sibling math is `@zk-kit/lean-imt` + `poseidon-lite` only.
