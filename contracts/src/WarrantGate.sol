// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {WarrantVerifier} from "./WarrantVerifier.sol";

/// Minimal registry surface for the gate (currentRoot policy).
interface IMandateRoot {
    function isCurrentRoot(uint256 root) external view returns (bool);
    function currentRoot() external view returns (uint256);
}

/// @title WarrantGate
/// @notice Composes registry root check + WarrantVerifier (Groth16). No tree inserts.
/// @dev Demo policy: merkle root must equal `currentRoot` (instant revoke). Does not use
///      `isKnownRoot`. Caller MUST pass the live challenge `requestHash` (keccak-mod-r);
///      nullifier replay belongs in the resource-server pipeline (WP5), not here.
contract WarrantGate {
    IMandateRoot public immutable registry;
    WarrantVerifier public immutable verifier;

    error RootRejected(uint256 merkleRoot);
    error RequestHashMismatch(uint256 expected, uint256 actual);
    error InvalidProof();

    constructor(IMandateRoot registry_, WarrantVerifier verifier_) {
        registry = registry_;
        verifier = verifier_;
    }

    /// @notice Verify Groth16 proof against live root and the expected request challenge.
    /// @param expectedRequestHash `hashChallenge(...)` for this HTTP/x402 request (publics[7]).
    /// @param pubSignals Order: merkleRoot, contextHash, nullifier, effectiveScope,
    ///        effectiveBudgetCap, minExpiry, tier, requestHash.
    function verify(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[8] calldata pubSignals,
        uint256 expectedRequestHash
    ) external view returns (bool) {
        uint256 merkleRoot = pubSignals[0];
        if (!registry.isCurrentRoot(merkleRoot)) {
            revert RootRejected(merkleRoot);
        }
        if (pubSignals[7] != expectedRequestHash) {
            revert RequestHashMismatch(expectedRequestHash, pubSignals[7]);
        }
        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) {
            revert InvalidProof();
        }
        return true;
    }
}
