// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Re-export Chainlink's MockV3Aggregator so Hardhat compiles it and tests can deploy it
// by name (`ethers.getContractFactory("MockV3Aggregator")`). No custom mock needed.
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol";
