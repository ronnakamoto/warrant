// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {InternalLeanIMT, LeanIMTData} from "lean-imt/InternalLeanIMT.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

/// @title MandateRegistry
/// @notice LeanIMT of Poseidon5(DST_leaf, pkX, pkY, tier, epoch). Bind inserts epoch 0; revoke bumps epoch.
/// @dev No Groth16. AgentBook / personhood is checked **off-chain** at bind time by the
///      operator (or documented `tier=0`); this contract does not call World Chain.
///
/// Demo revoke semantics: resource servers must require `merkleRoot == currentRoot`
/// (`isCurrentRoot`). `isKnownRoot` keeps a 1h history window for optional non-demo
/// adapters — do not use it in the v1 x402 demo hook (mixed revoke = defect).
contract MandateRegistry {
    using InternalLeanIMT for LeanIMTData;

    uint256 public constant ROOT_HISTORY_WINDOW = 1 hours;

    /// @dev UTF-8 "warrant/leaf" as a field element — lockstep with circuits/lib/domains.circom.
    uint256 public constant DOMAIN_LEAF = 36946522432971230366786740582;

    struct RootBinding {
        uint256 pkX;
        uint256 pkY;
        uint8 tier;
        uint32 epoch;
        bool exists;
    }

    LeanIMTData internal tree;
    mapping(uint256 => uint256) public rootTimestamp;
    mapping(address => RootBinding) public bindings;

    uint256 public currentRoot;

    event Bound(address indexed wallet, uint256 leaf, uint256 root, uint8 tier);
    event Revoked(address indexed wallet, uint256 oldLeaf, uint256 newLeaf, uint256 root, uint32 epoch);

    function size() external view returns (uint256) {
        return tree.size;
    }

    function depth() external view returns (uint256) {
        return tree.depth;
    }

    function _leaf(uint256 pkX, uint256 pkY, uint256 tier, uint256 epoch) internal pure returns (uint256) {
        return PoseidonT6.hash([DOMAIN_LEAF, pkX, pkY, tier, epoch]);
    }

    function leafOf(address wallet) public view returns (uint256) {
        RootBinding memory b = bindings[wallet];
        require(b.exists, "unbound");
        return _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch));
    }

    /// @notice Insert a personhood-backed (or documented tier=0) root leaf at epoch 0.
    function bindRoot(uint256 pkX, uint256 pkY, uint8 tier) external returns (uint256 leaf, uint256 root) {
        require(!bindings[msg.sender].exists, "already bound");
        require(pkX != 0 && pkY != 0, "bad pk");
        leaf = _leaf(pkX, pkY, uint256(tier), uint256(0));
        root = tree._insert(leaf);
        currentRoot = root;
        rootTimestamp[root] = block.timestamp;
        bindings[msg.sender] = RootBinding({pkX: pkX, pkY: pkY, tier: tier, epoch: 0, exists: true});
        emit Bound(msg.sender, leaf, root, tier);
    }

    /// @notice Bump epoch and replace the leaf (cascade for currentRoot checkers).
    /// @param siblings LeanIMT Merkle siblings for the current leaf (from off-chain tree mirror).
    function revoke(uint256[] calldata siblings) external returns (uint256 root) {
        RootBinding storage b = bindings[msg.sender];
        require(b.exists, "unbound");
        uint256 oldLeaf = _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch));
        uint32 newEpoch = b.epoch + 1;
        uint256 newLeaf = _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(newEpoch));
        root = tree._update(oldLeaf, newLeaf, siblings);
        currentRoot = root;
        rootTimestamp[root] = block.timestamp;
        b.epoch = newEpoch;
        emit Revoked(msg.sender, oldLeaf, newLeaf, root, newEpoch);
    }

    function isCurrentRoot(uint256 root) public view returns (bool) {
        return root != 0 && root == currentRoot;
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint256 ts = rootTimestamp[root];
        if (ts == 0) return false;
        return block.timestamp <= ts + ROOT_HISTORY_WINDOW;
    }
}
