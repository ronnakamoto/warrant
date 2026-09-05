// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {InternalLeanIMT, LeanIMTData} from "lean-imt/InternalLeanIMT.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

/// @title MandateRegistry
/// @notice LeanIMT of Poseidon5(DST_leaf, pkX, pkY, tier, epoch). Bind inserts epoch 0; revoke bumps epoch.
/// @dev No Groth16. Personhood (AgentBook) is **never** checked on-chain.
///
/// Binding policy:
/// - If `operator != address(0)`: only `operator` may bind (after off-chain PoP + AgentBook).
///   This closes permissionless public-key squatting on a public mempool.
/// - If `operator == address(0)`: permissionless self-bind, **tier must be 0** (test/demo only).
///   Still vulnerable to PK squatting — do not use on a public chain without an operator.
///
/// Demo revoke: resource servers require `merkleRoot == currentRoot`. Do not use `isKnownRoot`
/// in the v1 x402 hook.
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

    /// @notice When non-zero, only this address may call `bindRoot`.
    address public immutable operator;

    LeanIMTData internal tree;
    mapping(uint256 => uint256) public rootTimestamp;
    mapping(address => RootBinding) public bindings;
    /// @dev Prevents the same leaf from being claimed under a second wallet.
    mapping(uint256 => address) public walletOfLeaf;

    uint256 public currentRoot;

    event Bound(address indexed wallet, uint256 leaf, uint256 root, uint8 tier);
    event Revoked(address indexed wallet, uint256 oldLeaf, uint256 newLeaf, uint256 root, uint32 epoch);

    error NotOperator();
    error TierRequiresOperator(uint8 tier);
    error AlreadyBound();
    error LeafClaimed(address by);
    error BadPublicKey();
    error Unbound();

    /// @param operator_ Bind authority. Use `address(0)` only for local tests (tier=0 self-bind).
    constructor(address operator_) {
        operator = operator_;
    }

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
        if (!b.exists) revert Unbound();
        return _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch));
    }

    /// @notice Insert a root leaf at epoch 0 for `wallet`.
    /// @dev Operator mode: caller must be `operator` (PoP/AgentBook off-chain).
    ///      Permissionless mode (`operator==0`): `wallet` must be `msg.sender` and `tier==0`.
    function bindRoot(address wallet, uint256 pkX, uint256 pkY, uint8 tier)
        external
        returns (uint256 leaf, uint256 root)
    {
        if (operator != address(0)) {
            if (msg.sender != operator) revert NotOperator();
        } else {
            if (tier != 0) revert TierRequiresOperator(tier);
            if (wallet != msg.sender) revert NotOperator();
        }
        if (bindings[wallet].exists) revert AlreadyBound();
        if (pkX == 0 || pkY == 0) revert BadPublicKey();

        leaf = _leaf(pkX, pkY, uint256(tier), uint256(0));
        address prior = walletOfLeaf[leaf];
        if (prior != address(0)) revert LeafClaimed(prior);

        root = tree._insert(leaf);
        currentRoot = root;
        rootTimestamp[root] = block.timestamp;
        walletOfLeaf[leaf] = wallet;
        bindings[wallet] = RootBinding({pkX: pkX, pkY: pkY, tier: tier, epoch: 0, exists: true});
        emit Bound(wallet, leaf, root, tier);
    }

    /// @notice Bump epoch and replace the leaf (cascade for currentRoot checkers).
    /// @param siblings LeanIMT Merkle siblings for the current leaf (from off-chain tree mirror).
    function revoke(uint256[] calldata siblings) external returns (uint256 root) {
        RootBinding storage b = bindings[msg.sender];
        if (!b.exists) revert Unbound();
        uint256 oldLeaf = _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch));
        uint32 newEpoch = b.epoch + 1;
        uint256 newLeaf = _leaf(b.pkX, b.pkY, uint256(b.tier), uint256(newEpoch));
        root = tree._update(oldLeaf, newLeaf, siblings);
        currentRoot = root;
        rootTimestamp[root] = block.timestamp;
        b.epoch = newEpoch;
        // Leaf identity moved; release old leaf claim so a later re-bind after full exit is possible.
        // Epoch-bumped leaf is a new value — claim it for this wallet.
        delete walletOfLeaf[oldLeaf];
        walletOfLeaf[newLeaf] = msg.sender;
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
