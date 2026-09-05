// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MandateRegistry, PoseidonCheck} from "../src/MandateRegistry.sol";

contract MandateRegistryTest is Test {
    using stdJson for string;

    MandateRegistry internal registry;
    PoseidonCheck internal poseidon;
    string internal json;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA201);

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/registry.json"));
        registry = new MandateRegistry();
        poseidon = new PoseidonCheck();
    }

    function _u(string memory key) internal view returns (uint256) {
        return vm.parseUint(json.readString(key));
    }

    function _siblings(string memory key) internal view returns (uint256[] memory siblings) {
        string[] memory raw = json.readStringArray(key);
        siblings = new uint256[](raw.length);
        for (uint256 i = 0; i < raw.length; i++) {
            siblings[i] = vm.parseUint(raw[i]);
        }
    }

    function testPoseidonMatchesJsLite() public view {
        assertEq(poseidon.t3(3, 5), _u(".poseidon2_35"));
        assertEq(poseidon.t5(1, 2, 3, 4), _u(".poseidon4_1234"));
        assertEq(
            poseidon.t5(_u(".alice.pkX"), _u(".alice.pkY"), 2, 0),
            _u(".alice.leaf0")
        );
        assertEq(
            poseidon.t5(_u(".alice.pkX"), _u(".alice.pkY"), 2, 1),
            _u(".alice.leaf1")
        );
    }

    function testBindThreeThenRevokeAlice() public {
        vm.prank(alice);
        (uint256 leafA, uint256 rootA) = registry.bindRoot(_u(".alice.pkX"), _u(".alice.pkY"), 2);
        assertEq(leafA, _u(".alice.leaf0"));
        assertEq(rootA, _u(".rootAfterAlice"));
        assertTrue(registry.isCurrentRoot(rootA));

        vm.prank(bob);
        (uint256 leafB, uint256 rootB) = registry.bindRoot(_u(".bob.pkX"), _u(".bob.pkY"), 2);
        assertEq(leafB, _u(".bob.leaf0"));
        assertEq(rootB, _u(".rootAfterBob"));

        vm.prank(carol);
        (uint256 leafC, uint256 rootC) = registry.bindRoot(_u(".carol.pkX"), _u(".carol.pkY"), 2);
        assertEq(leafC, _u(".carol.leaf0"));
        assertEq(rootC, _u(".rootAfterCarol"));
        assertEq(registry.size(), 3);
        assertTrue(registry.isCurrentRoot(rootC));
        assertTrue(registry.isKnownRoot(rootC));
        // Prior roots stay in the 1h window (this test does not warp).
        assertTrue(registry.isKnownRoot(rootA));
        assertTrue(registry.isKnownRoot(rootB));

        uint256[] memory siblings = _siblings(".revokeSiblings");
        vm.prank(alice);
        uint256 rootRevoked = registry.revoke(siblings);
        assertEq(rootRevoked, _u(".rootAfterRevoke"));
        assertEq(registry.leafOf(alice), _u(".alice.leaf1"));
        assertTrue(registry.isCurrentRoot(rootRevoked));
        assertFalse(registry.isCurrentRoot(rootC));
        // History window still knows the pre-revoke root.
        assertTrue(registry.isKnownRoot(rootC));

        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(registry.isKnownRoot(rootC));
        assertTrue(registry.isCurrentRoot(rootRevoked));
    }

    function testRevokeWithoutBindReverts() public {
        uint256[] memory empty;
        vm.expectRevert(bytes("unbound"));
        registry.revoke(empty);
    }

    function testDoubleBindReverts() public {
        vm.prank(alice);
        registry.bindRoot(_u(".alice.pkX"), _u(".alice.pkY"), 2);
        vm.prank(alice);
        vm.expectRevert(bytes("already bound"));
        registry.bindRoot(_u(".alice.pkX"), _u(".alice.pkY"), 2);
    }
}
