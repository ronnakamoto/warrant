# Contracts

## Layout

| Contract | Role |
|---|---|
| `MandateRegistry` | LeanIMT leaves, epochs, `currentRoot`, root history timestamps. **No Groth16.** |
| `WarrantVerifier` | snarkjs-generated pairing check. **DO NOT EDIT** — regenerate via `scripts/export-verifier`. |
| `WarrantGate` | `verify` = current-root check + `WarrantVerifier.verifyProof`. No tree writes. |

## Personhood (AgentBook) — honest boundary

`bindRoot` does **not** call World Chain / AgentBook. The binder (CLI, dashboard, or operator script) must look up the human off-chain (`IPersonhood`) and only submit `bindRoot` when the wallet is registered — or deliberately use documented `tier=0` for demos when World App is unavailable.

## Demo revoke

Resource servers and `WarrantGate` use **`currentRoot` only**. `isKnownRoot` exists for optional non-demo adapters; mixing it into the v1 x402 hook is a defect.

## Local gate

```bash
cd contracts
forge test
anvil &
# in another shell, after deploy script or forge create:
cast call <registry> "currentRoot()(uint256)" --rpc-url http://127.0.0.1:8545
```
