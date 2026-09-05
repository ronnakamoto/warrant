# Groth16 ceremony (Warrant)

## What this is

Warrant’s product circuit (`circuits/warrant.circom`) is proven with **Groth16** over BN254.
That requires a circuit-specific proving key (`.zkey`) derived from a Powers-of-Tau transcript (**pot16**, enough for &lt; 2^16 constraints).

## Local / testnet setup

```bash
export WARRANT_CEREMONY_ENTROPY="$(openssl rand -hex 32)"
# optional: public beacon (hex); default derives from warrant/<name>/ceremony/v1
# export WARRANT_CEREMONY_BEACON=0x...
./scripts/setup-groth16 warrant
./scripts/export-verifier
unset WARRANT_CEREMONY_ENTROPY
```

Pipeline:

1. Download Hermez `powersOfTau28_hez_final_16.ptau` (via `scripts/setup-groth16`).
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
| pot16 | `circuits/ptau/*.ptau` | gitignored (`*.ptau`) |
| zkey | `circuits/build/warrant_final.zkey` | ~28 MB; gitignored via `circuits/build/` |
| vkey | `circuits/build/warrant_vkey.json` | derived; rebuildable; must be non-empty |
| verifier | `contracts/src/WarrantVerifier.sol` | **committed**; regenerate only |

## Release download

```bash
WARRANT_ZKEY_URL=https://github.com/<org>/warrant/releases/download/<tag>/warrant_final.zkey \
WARRANT_VKEY_URL=https://github.com/<org>/warrant/releases/download/<tag>/warrant_vkey.json \
  ./scripts/download-zkey.sh
```

If `WARRANT_ZKEY_URL` is unset, `download-zkey.sh` falls back to `setup-groth16` (still requires entropy).

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
