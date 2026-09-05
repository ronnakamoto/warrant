// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {WarrantVerifier} from "../src/WarrantVerifier.sol";
import {WarrantGate, IMandateRoot} from "../src/WarrantGate.sol";

/// Deploy registry (+ gate). Set env WARRANT_BIND_OPERATOR to an address for operator mode.
contract DeployRegistry is Script {
    function run() external {
        address operator = address(0);
        try vm.envAddress("WARRANT_BIND_OPERATOR") returns (address a) {
            operator = a;
        } catch {}
        vm.startBroadcast();
        MandateRegistry registry = new MandateRegistry(operator);
        WarrantVerifier verifier = new WarrantVerifier();
        WarrantGate gate = new WarrantGate(IMandateRoot(address(registry)), verifier);
        vm.stopBroadcast();
        console2.log("MandateRegistry", address(registry));
        console2.log("WarrantVerifier", address(verifier));
        console2.log("WarrantGate", address(gate));
        console2.log("operator", registry.operator());
        console2.log("currentRoot", registry.currentRoot());
    }
}
