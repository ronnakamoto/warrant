// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {WarrantGate, IMandateRoot} from "../src/WarrantGate.sol";
import {WarrantVerifier} from "../src/WarrantVerifier.sol";

/// Sets a fixed currentRoot for gate accept-path tests.
contract FixedRoot is IMandateRoot {
    uint256 private _root;

    constructor(uint256 root_) {
        _root = root_;
    }

    function currentRoot() external view returns (uint256) {
        return _root;
    }

    function isCurrentRoot(uint256 root) external view returns (bool) {
        return root != 0 && root == _root;
    }
}

contract WarrantGateTest is Test {
    using stdJson for string;

    MandateRegistry internal registry;
    WarrantVerifier internal verifier;
    WarrantGate internal gate;
    string internal proofJson;
    bool internal hasProof;

    address internal alice = address(0xA11CE);

    function setUp() public {
        registry = new MandateRegistry(address(0));
        verifier = new WarrantVerifier();
        gate = new WarrantGate(IMandateRoot(address(registry)), verifier);
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/proof.json");
        try vm.readFile(path) returns (string memory j) {
            proofJson = j;
            hasProof = true;
        } catch {
            hasProof = false;
        }
    }

    function testZeroRootRejectedByGate() public {
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        uint256[8] memory pubs;
        vm.expectRevert(abi.encodeWithSelector(WarrantGate.RootRejected.selector, uint256(0)));
        gate.verify(pA, pB, pC, pubs, 0);
    }

    function testStaleRootRejected() public {
        string memory reg = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/registry.json"));
        uint256 pkX = vm.parseUint(stdJson.readString(reg, ".alice.pkX"));
        uint256 pkY = vm.parseUint(stdJson.readString(reg, ".alice.pkY"));
        vm.prank(alice);
        (, uint256 root) = registry.bindRoot(alice, pkX, pkY, 0);
        assertTrue(registry.isCurrentRoot(root));

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        uint256[8] memory pubs;
        pubs[0] = root + 1;
        vm.expectRevert(abi.encodeWithSelector(WarrantGate.RootRejected.selector, root + 1));
        gate.verify(pA, pB, pC, pubs, 0);
    }

    function testRequestHashMismatchRejected() public {
        vm.skip(!hasProof);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs) =
            _loadProof();
        FixedRoot fixedRoot = new FixedRoot(pubs[0]);
        WarrantGate g2 = new WarrantGate(IMandateRoot(address(fixedRoot)), verifier);
        uint256 wrong = pubs[7] + 1;
        vm.expectRevert(abi.encodeWithSelector(WarrantGate.RequestHashMismatch.selector, wrong, pubs[7]));
        g2.verify(pA, pB, pC, pubs, wrong);
    }

    function testValidProofVerifies() public {
        vm.skip(!hasProof);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs) =
            _loadProof();
        assertTrue(verifier.verifyProof(pA, pB, pC, pubs));
    }

    function testTamperedPublicInputFails() public {
        vm.skip(!hasProof);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs) =
            _loadProof();
        pubs[3] = 15;
        assertFalse(verifier.verifyProof(pA, pB, pC, pubs));
    }

    function testVerifyProofGas() public {
        vm.skip(!hasProof);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs) =
            _loadProof();
        uint256 g = gasleft();
        bool ok = verifier.verifyProof(pA, pB, pC, pubs);
        uint256 used = g - gasleft();
        assertTrue(ok);
        emit log_named_uint("verifyProof_gas", used);
        assertLt(used, 400_000);
        assertGt(used, 150_000);
    }

    function testGateAcceptsWhenRootAndRequestHashMatch() public {
        vm.skip(!hasProof);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs) =
            _loadProof();
        FixedRoot fixedRoot = new FixedRoot(pubs[0]);
        WarrantGate g2 = new WarrantGate(IMandateRoot(address(fixedRoot)), verifier);
        assertTrue(g2.verify(pA, pB, pC, pubs, pubs[7]));
    }

    function _loadProof()
        internal
        view
        returns (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[8] memory pubs)
    {
        pA[0] = vm.parseUint(proofJson.readString(".pA[0]"));
        pA[1] = vm.parseUint(proofJson.readString(".pA[1]"));
        pB[0][0] = vm.parseUint(proofJson.readString(".pB[0][0]"));
        pB[0][1] = vm.parseUint(proofJson.readString(".pB[0][1]"));
        pB[1][0] = vm.parseUint(proofJson.readString(".pB[1][0]"));
        pB[1][1] = vm.parseUint(proofJson.readString(".pB[1][1]"));
        pC[0] = vm.parseUint(proofJson.readString(".pC[0]"));
        pC[1] = vm.parseUint(proofJson.readString(".pC[1]"));
        for (uint256 i = 0; i < 8; i++) {
            pubs[i] = vm.parseUint(proofJson.readString(string.concat(".pubs[", vm.toString(i), "]")));
        }
    }
}
