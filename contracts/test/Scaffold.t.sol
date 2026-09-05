// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {WarrantGate} from "../src/WarrantGate.sol";
import {WarrantVerifier} from "../src/WarrantVerifier.sol";

contract ScaffoldTest is Test {
    function test_contractsExist() public {
        MandateRegistry registry = new MandateRegistry();
        WarrantVerifier verifier = new WarrantVerifier();
        WarrantGate gate = new WarrantGate();
        assertTrue(address(registry) != address(0));
        assertTrue(address(verifier) != address(0));
        assertTrue(address(gate) != address(0));
    }
}
