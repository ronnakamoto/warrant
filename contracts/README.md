# Contracts

## Layout

| Contract | Role |
|---|---|
| `MandateRegistry` | LeanIMT leaves, epochs, `currentRoot`, root history. **No Groth16.** |
| `WarrantVerifier` | snarkjs-generated pairing check. **DO NOT EDIT** — regenerate via `scripts/export-verifier`. |
| `WarrantGate` | `verify` = `isCurrentRoot` + `pubSignals[7] == expectedRequestHash` + `WarrantVerifier.verifyProof`. No tree writes. |

## Binding policy (PK squatting / personhood)

| Mode | Constructor | Who can bind | Tier |
|---|---|---|---|
| **Operator** (recommended) | `new MandateRegistry(operator)` | Only `operator` | Any; AgentBook/PoP **off-chain** before submit |
| **Permissionless test** | `new MandateRegistry(address(0))` | `msg.sender` only for self | **`tier == 0` only** |

Permissionless mode still allows an attacker to claim *your* BabyJubjub public key at tier 0 before you do (`LeafClaimed`). Do **not** deploy `operator=0` on a public mempool. Operator mode closes that class of DoS for production-shaped demos.

Personhood is **never** enforced on-chain. Resource servers must not treat ZK `tier` alone as World ID attestation.

## Challenge binding

`WarrantGate.verify(..., expectedRequestHash)` rejects proofs whose public `requestHash` does not match the live `hashChallenge(...)`. Nullifier replay sealing stays in the x402 pipeline (WP5) via `INullifierStore.takeRequest`.

## Demo revoke

Use **`currentRoot` only**. `isKnownRoot` is for optional non-demo adapters.

## Local gate

```bash
cd contracts
forge test
# Operator bind (set WARRANT_BIND_OPERATOR) or permissionless tier-0:
anvil &
WARRANT_BIND_OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  forge script script/DeployRegistry.s.sol:DeployRegistry \
  --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil-0>
cast call <registry> "currentRoot()(uint256)" --rpc-url http://127.0.0.1:8545
```
