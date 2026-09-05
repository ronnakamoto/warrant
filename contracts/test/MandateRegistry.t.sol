// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PoseidonCheck} from "./PoseidonCheck.sol";

contract MandateRegistryTest is Test {
    using stdJson for string;

    MandateRegistry internal registry;
    PoseidonCheck internal poseidon;
    string internal json;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA201);
    address internal operator = address(0xB17D);

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/registry.json"));
        // Permissionless tier-0 mode for fixture-driven tree tests (tier forced to 0 below).
        registry = new MandateRegistry(address(0));
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
        uint256 dst = _u(".domainLeaf");
        assertEq(poseidon.t6(dst, _u(".alice.pkX"), _u(".alice.pkY"), 2, 0), _u(".alice.leaf0"));
        assertEq(poseidon.t6(dst, _u(".alice.pkX"), _u(".alice.pkY"), 2, 1), _u(".alice.leaf1"));
    }

    /// Fixture leaves used tier=2; rebuild tree under operator mode so tiers match fixtures.
    function testBindThreeThenRevokeAlice() public {
        MandateRegistry opReg = new MandateRegistry(operator);
        vm.startPrank(operator);
        (uint256 leafA, uint256 rootA) = opReg.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 2);
        assertEq(leafA, _u(".alice.leaf0"));
        assertEq(rootA, _u(".rootAfterAlice"));
        assertTrue(opReg.isCurrentRoot(rootA));

        (uint256 leafB, uint256 rootB) = opReg.bindRoot(bob, _u(".bob.pkX"), _u(".bob.pkY"), 2);
        assertEq(leafB, _u(".bob.leaf0"));
        assertEq(rootB, _u(".rootAfterBob"));

        (uint256 leafC, uint256 rootC) = opReg.bindRoot(carol, _u(".carol.pkX"), _u(".carol.pkY"), 2);
        assertEq(leafC, _u(".carol.leaf0"));
        assertEq(rootC, _u(".rootAfterCarol"));
        assertEq(opReg.size(), 3);
        assertTrue(opReg.isCurrentRoot(rootC));
        vm.stopPrank();

        uint256[] memory siblings = _siblings(".revokeSiblings");
        vm.prank(alice);
        uint256 rootRevoked = opReg.revoke(siblings);
        assertEq(rootRevoked, _u(".rootAfterRevoke"));
        assertEq(opReg.leafOf(alice), _u(".alice.leaf1"));
        assertTrue(opReg.isCurrentRoot(rootRevoked));
        assertFalse(opReg.isCurrentRoot(rootC));
        assertTrue(opReg.isKnownRoot(rootC));

        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(opReg.isKnownRoot(rootC));
        assertTrue(opReg.isCurrentRoot(rootRevoked));
    }

    function testZeroRootNeverCurrentOrKnown() public view {
        assertFalse(registry.isCurrentRoot(0));
        assertFalse(registry.isKnownRoot(0));
    }

    function testRevokeWithoutBindReverts() public {
        uint256[] memory empty;
        vm.expectRevert(MandateRegistry.Unbound.selector);
        registry.revoke(empty);
    }

    function testPermissionlessRejectsTierAboveZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.TierRequiresOperator.selector, uint8(2)));
        registry.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 2);
    }

    function testPermissionlessSelfBindTierZero() public {
        vm.prank(alice);
        (uint256 leaf,) = registry.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 0);
        assertEq(registry.walletOfLeaf(leaf), alice);
    }

    function testOperatorRequiredForNonSelfWallet() public {
        vm.prank(alice);
        vm.expectRevert(MandateRegistry.NotOperator.selector);
        registry.bindRoot(bob, _u(".bob.pkX"), _u(".bob.pkY"), 0);
    }

    function testLeafClaimedPreventsSquattingSamePk() public {
        vm.prank(alice);
        registry.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.LeafClaimed.selector, alice));
        registry.bindRoot(bob, _u(".alice.pkX"), _u(".alice.pkY"), 0);
    }

    function testDoubleBindReverts() public {
        vm.prank(alice);
        registry.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 0);
        vm.prank(alice);
        vm.expectRevert(MandateRegistry.AlreadyBound.selector);
        registry.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 0);
    }

    function testNonOperatorCannotBindWhenOperatorSet() public {
        MandateRegistry opReg = new MandateRegistry(operator);
        vm.prank(alice);
        vm.expectRevert(MandateRegistry.NotOperator.selector);
        opReg.bindRoot(alice, _u(".alice.pkX"), _u(".alice.pkY"), 2);
    }
}
