// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT5} from "poseidon-solidity/PoseidonT5.sol";

/// Test-only Poseidon wrappers (keep out of MandateRegistry).
contract PoseidonCheck {
    function t3(uint256 a, uint256 b) external pure returns (uint256) {
        return PoseidonT3.hash([a, b]);
    }

    function t5(uint256 a, uint256 b, uint256 c, uint256 d) external pure returns (uint256) {
        return PoseidonT5.hash([a, b, c, d]);
    }
}
