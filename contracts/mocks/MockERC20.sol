// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal 6-decimal ERC-20 (mirrors USDC) for Phase 10 ERC-20 lifecycle tests.
/// @dev Mints an initial supply to the deployer at construction and exposes a public
///      `mint` so tests can fund arbitrary accounts (e.g. the client) directly.
contract MockERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("Mock USD Coin", "mUSDC") {
        _mint(msg.sender, initialSupply);
    }

    /// @notice USDC uses 6 decimals; override OZ's default of 18.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Test-only faucet: mints `amount` to `to`.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
