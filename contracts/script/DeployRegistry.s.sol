// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {WarrantVerifier} from "../src/WarrantVerifier.sol";
import {WarrantGate, IMandateRoot} from "../src/WarrantGate.sol";

/// Deploy registry (+ optional gate) for local anvil / testnets.
contract DeployRegistry is Script {
    function run() external {
        vm.startBroadcast();
        MandateRegistry registry = new MandateRegistry();
        WarrantVerifier verifier = new WarrantVerifier();
        WarrantGate gate = new WarrantGate(IMandateRoot(address(registry)), verifier);
        vm.stopBroadcast();
        console2.log("MandateRegistry", address(registry));
        console2.log("WarrantVerifier", address(verifier));
        console2.log("WarrantGate", address(gate));
        console2.log("currentRoot", registry.currentRoot());
    }
}
