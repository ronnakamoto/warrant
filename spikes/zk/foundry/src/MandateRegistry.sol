// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {InternalLeanIMT, LeanIMTData} from "lean-imt/InternalLeanIMT.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT5} from "poseidon-solidity/PoseidonT5.sol";

/// Spike of WP3 MandateRegistry: LeanIMT of Poseidon4(pkX, pkY, tier, epoch).
/// bindRoot inserts epoch 0. revoke bumps epoch and replaces the leaf.
/// Instant cascade for the demo: verifiers should require merkleRoot == currentRoot.
/// isKnownRoot keeps a 1-hour Semaphore-style window so someone-else's insert does not
/// kill in-flight proofs — that window also lets a *revoked* identity prove against an
/// old root until it expires. Product code must pick one: currentRoot (instant revoke)
/// or known-root window (in-flight survival).
contract MandateRegistry {
    using InternalLeanIMT for LeanIMTData;

    uint256 public constant ROOT_HISTORY_WINDOW = 1 hours;

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

    function leafOf(address wallet) public view returns (uint256) {
        RootBinding memory b = bindings[wallet];
        require(b.exists, "unbound");
        return PoseidonT5.hash([b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch)]);
    }

    function bindRoot(uint256 pkX, uint256 pkY, uint8 tier) external returns (uint256 leaf, uint256 root) {
        require(!bindings[msg.sender].exists, "already bound");
        require(pkX != 0 && pkY != 0, "bad pk");
        leaf = PoseidonT5.hash([pkX, pkY, uint256(tier), uint256(0)]);
        root = tree._insert(leaf);
        currentRoot = root;
        rootTimestamp[root] = block.timestamp;
        bindings[msg.sender] = RootBinding({pkX: pkX, pkY: pkY, tier: tier, epoch: 0, exists: true});
        emit Bound(msg.sender, leaf, root, tier);
    }

    function revoke(uint256[] calldata siblings) external returns (uint256 root) {
        RootBinding storage b = bindings[msg.sender];
        require(b.exists, "unbound");
        uint256 oldLeaf = PoseidonT5.hash([b.pkX, b.pkY, uint256(b.tier), uint256(b.epoch)]);
        uint32 newEpoch = b.epoch + 1;
        uint256 newLeaf = PoseidonT5.hash([b.pkX, b.pkY, uint256(b.tier), uint256(newEpoch)]);
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

/// Thin wrappers so the spike can compare poseidon-solidity against poseidon-lite.
contract PoseidonCheck {
    function t3(uint256 a, uint256 b) external pure returns (uint256) {
        return PoseidonT3.hash([a, b]);
    }

    function t5(uint256 a, uint256 b, uint256 c, uint256 d) external pure returns (uint256) {
        return PoseidonT5.hash([a, b, c, d]);
    }
}
