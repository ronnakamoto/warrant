# Spike evidence

Raw JSON from the live spikes that back `docs/05-implementation-plan.md`.

| Spike | Script | Result file | Verdict |
|---|---|---|---|
| 1 ZK circuit | `zk/run.mjs`, `zk/prove.mjs` | `zk/results.json`, `zk/prove-results.json` | PASS — core circuit 10,917 constraints, Groth16 prove 838 ms, JS verify 298 ms, Solidity verifier compiles (2,003 bytes deployed) |
| 2 x402 extension | `x402/extension_shape.mjs` | `x402/results.json` | PASS — Blocky402 testnet live; `registerExtension("warrant")` appears in `PaymentRequired.extensions` |
| 3 AgentBook | `world/agentbook.mjs` | `world/results.json` | PASS — World Chain 480, `lookupHuman` + SDK, unregistered → null |
| 4 ENSv2 Sepolia | `ens/ensv2.mjs` | `ens/results.json` | PASS — ensjs 2026-07-30 addresses have bytecode; ETHRegistry is ERC-1155; RootRegistry → ETHRegistry |
| 5 Poseidon/LeanIMT JS | `leanimt/poseidon_compat.mjs` | `leanimt/results.json` | PASS — poseidon-lite === circomlibjs for t=2, t=4, and t=5; Semaphore Group/Identity construct |
| 6 Hedera mirror | `hedera/mirror.mjs` | `hedera/results.json` | PASS reads — HCS messages in latest txs; REST `POST /topics` is 404 |
| 11 HCS signed | `hedera/hcs.mjs` | `hedera/hcs-results.json` | PASS — operator `0.0.10311260` (~998 HBAR), key derives matching EVM address, topic **`0.0.10336558`** created + nameless message submitted |
| 7 LeanIMT circuit | `leanimt/circuit.mjs` | `leanimt/circuit-results.json`, `zk/artifacts/warrant-lean-prove-results.json` | PASS — `BinaryMerkleRoot@2.0.0` MAX_DEPTH=20 matches Semaphore Group proofs; WarrantLean **13,018** constraints, prove **857 ms**; wrong root and widened scope rejected |
| 8 EdDSA live | `zk/eddsa_live.mjs` | `zk/artifacts/eddsa-live-results.json` | PASS — `Identity.signMessage` verifies in circomlib `EdDSAPoseidonVerifier`; tampered M rejected; `enabled=0` padding accepted |
| 9 Full circuit | `zk/warrant_full.mjs` | `zk/artifacts/warrant-full-results.json` | PASS — 2-hop signed chain **56,794** constraints, prove **2,247 ms**, zkey **27.9 MB**; widened scope and tampered request sig rejected |
| 10 x402 grantAccess | `x402/grant_access.mjs` | `x402/grant-access-results.json` | PASS — missing header → 402; `{ grantAccess: true }` → no payment; revoked → 403 `root_revoked` |
| 12 Cascade revoke | `zk/cascade.mjs` | `zk/artifacts/cascade-results.json` | PASS — epoch bump drops old leaf from the new root; old 2-hop signatures still verify after re-membership; budget/expiry widening rejected |
| 13+14 MandateRegistry + Groth16 gas | `zk/onchain.mjs` | `zk/artifacts/onchain-results.json` | PASS — PoseidonT3/T5 match JS; bind 3 / revoke Alice on anvil; `verifyProof` **235,451** gas; tampered public input fails |
| 15 Blocky402 settle | `hedera/blocky402_settle.mjs` | `hedera/blocky402-settle-results.json` | PASS — live `/verify`+`/settle`, 1000 tinybars to `0.0.98`, mirror `CRYPTOTRANSFER SUCCESS` |
| 16 requestHash ↔ 402 | `x402/bound_request.mjs` | `x402/bound-request-results.json` | PASS — challenge hash is Groth16 public[7]; leaf signs it; wrong nonce 403; stale root 403 |

Re-run (after `pnpm install` in `spikes/`). Foundry tests also need `forge install foundry-rs/forge-std --no-commit` inside `zk/foundry` (gitignored). Circom 2.2.3 and Foundry 1.8.1 on PATH.

```bash
export PATH="$PATH:$HOME/.foundry/bin:$HOME/.local/bin"
node zk/run.mjs
node zk/eddsa_live.mjs
node leanimt/poseidon_compat.mjs
node leanimt/circuit.mjs
node world/agentbook.mjs
node ens/ensv2.mjs
node hedera/mirror.mjs
node hedera/hcs.mjs
node x402/extension_shape.mjs
node zk/warrant_full.mjs
node x402/grant_access.mjs
node zk/cascade.mjs
node zk/onchain.mjs
node x402/bound_request.mjs
# spends a tiny amount of testnet HBAR:
node hedera/blocky402_settle.mjs
```

Circom 2.2.3 and Foundry 1.8.1 were installed for the ZK spike; they are not committed.
