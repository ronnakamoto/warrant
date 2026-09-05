# `@warrant/dashboard`

Next.js (React 19) + **Astryx** runtime with an editable **Carbon g10 / g100** theme (`theme/carbon-g10.ts`). One page: load a local LeanIMT mirror, **Revoke this root** → `MandateRegistry.revoke(siblings)`, activity log, Base Sepolia explorer links.

## Run

```bash
# from repo root
pnpm --filter @warrant/dashboard theme:build
pnpm --filter @warrant/dashboard dev
```

Env (optional):

- `NEXT_PUBLIC_RPC_URL` — default `https://sepolia.base.org`
- `NEXT_PUBLIC_REGISTRY_ADDRESS` — `MandateRegistry` on Base Sepolia

Open `dashboard-mirror.json` from the agent store (the local list of who you delegated to). **Confirm on Base Sepolia**, then **Revoke**. Revoke stays off until that check. The flow preflights `leafOf` / `currentRoot`, requires a successful receipt before updating the local LeanIMT, and clears the private key from memory afterward. Next `warrant.fetch` using the old root must receive **403** `root_revoked`.

## Boundaries

No `snarkjs`, `circomlib*`, `spikes/`, or `circuits/` imports. Sibling math is `@zk-kit/lean-imt` + `poseidon-lite` only.
