# Groth16 ceremony (Warrant)

## What this is

Warrant’s product circuit (`circuits/warrant.circom`) is proven with **Groth16** over BN254.
That requires a circuit-specific proving key (`.zkey`) derived from a Powers-of-Tau transcript. The live forest circuit is **101,781 constraints**, so this host uses **pot17**. Hermez GCS/S3 returned 403 for `powersOfTau28_hez_final_17.ptau`; the transcript on disk is PSE perpetual Powers of Tau `ppot_0080_17.ptau` (same 2^17 size, prepared for phase 2). pot16 only covers &lt; 2^16.

## Local / testnet setup

```bash
export WARRANT_CEREMONY_ENTROPY="$(openssl rand -hex 32)"
# optional: public beacon (hex); default derives from warrant/<name>/ceremony/v2
# export WARRANT_CEREMONY_BEACON=0x...
./scripts/setup-groth16 warrant
./scripts/export-verifier
unset WARRANT_CEREMONY_ENTROPY
```

Pipeline:

1. Download a pot17 transcript (via `scripts/setup-groth16`; PSE `ppot_0080_17` first, Hermez mirrors after; pot16 if a lean circuit still fits).
2. `snarkjs groth16 setup` → intermediate `*_0000.zkey`.
3. Operator contribution with **required** entropy (`WARRANT_CEREMONY_ENTROPY`, ≥32 chars).
4. Public **beacon** finalize (`zkey beacon`) so the last phase-2 step has no private trapdoor.
5. `zkey verify` against r1cs + ptau; export verification key (must be non-empty).
6. Export Solidity verifier (`scripts/export-verifier`).

Intermediates `*_0000.zkey` / `*_0001.zkey` are deleted after finalize. **You must still discard operator entropy** (shell history, env, notes). If that entropy leaks, proofs for this circuit can be forged — beacon finalize does not heal a leaked prior contribution.

## Production (mainnet)

A solo operator ceremony is **not** production-grade MPC. For mainnet:

1. Run a multi-party phase-2 (Semaphore-style) with independent contributors.
2. Publish contribution attestations + final `zkey` / `vkey` checksums on a GitHub Release.
3. Consumers fetch via `WARRANT_ZKEY_URL` / `WARRANT_VKEY_URL` (`scripts/download-zkey.sh`).
4. Prefer migrating the `IVerifier` port to a transparent setup (e.g. Honk) when pairing-based trust is unacceptable.

This stack (Groth16 + Baby Jubjub EdDSA) is **not post-quantum**.

## Artifacts (never commit proving keys)

| Artifact | Location | Notes |
|---|---|---|
| pot16 / pot17 | `circuits/ptau/*.ptau` | gitignored (`*.ptau`). Forest is pot17. |
| zkey | `circuits/build/warrant_final.zkey` | ~46 MB; gitignored via `circuits/build/` |
| vkey | `circuits/build/warrant_vkey.json` | derived; rebuildable; must be non-empty |
| verifier | `contracts/src/WarrantVerifier.sol` | **committed**; regenerate only |

## Release download

Demo / testnet artifacts (solo ceremony — **not** mainnet MPC):

| File | SHA-256 |
|---|---|
| `warrant_final.zkey` | `3efdd40992956931c94aac290417768cac499d8d81b7ac2323c1b61411392e84` |
| `warrant_vkey.json` | `6bc2262231fe7aa0bb8563860f3bf95cc60524b155527f48c7855ba6c473ce0d` |
| `warrant.wasm` | `4952f1cf1097ea39c19d89853acfffdcef7d7296a663442f38773cf3e12229d6` |

```bash
# Defaults to artifacts-groth16-v2 release URLs
./scripts/download-zkey.sh

# Or local ceremony:
WARRANT_ZKEY_URL=local WARRANT_CEREMONY_ENTROPY="$(openssl rand -hex 32)" ./scripts/download-zkey.sh
```

Release: https://github.com/ronnakamoto/warrant/releases/tag/artifacts-groth16-v2

## Regenerate verifier

```bash
./scripts/compile-circuit warrant
./scripts/download-zkey.sh
./scripts/export-verifier
```

Hand-editing `WarrantVerifier.sol` is a defect.

## Circuit hash domains

| Domain string | Use |
|---|---|
| `warrant/leaf` | Merkle leaf |
| `warrant/mandate` | Signed mandate message (includes tag commitment + parentHash) |
| `warrant/tag` | `Poseidon(tag, humanTag)` bound into every mandate |
| `warrant/nullifier` | `Poseidon(nullifier, humanTag, contextHash)` |

Constants live in `circuits/lib/domains.circom` and `circuits/test/lib/hashes.mjs`.
