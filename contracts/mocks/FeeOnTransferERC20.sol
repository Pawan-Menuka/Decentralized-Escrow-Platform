// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FeeOnTransferERC20
/// @notice Attack/edge-case mock (Phase 10) proving `createJob` rejects fee-on-transfer
///         and rebasing tokens rather than silently under-funding a job.
/// @dev Withholds (burns) 1% of every `transfer`/`transferFrom`, so a caller that sends
///      `amount` only ever delivers `amount * 99 / 100` to the recipient. FreelanceEscrow
///      measures its own balance delta around `safeTransferFrom` in `createJob` and
///      reverts `TokenAmountMismatch` when the delta is short of the expected total.
contract FeeOnTransferERC20 is ERC20 {
    uint256 public constant FEE_BPS = 100; // 1%

    constructor(uint256 initialSupply) ERC20("Fee-On-Transfer Token", "FOT") {
        _mint(msg.sender, initialSupply);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _feeTransfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _feeTransfer(from, to, amount);
        return true;
    }

    /// @dev Moves `amount * 99%` to `to` and burns the remaining 1% from `from`, so the
    ///      recipient always receives strictly less than requested.
    function _feeTransfer(address from, address to, uint256 amount) internal {
        uint256 fee = (amount * FEE_BPS) / 10_000;
        uint256 net = amount - fee;
        _transfer(from, to, net);
        if (fee > 0) _burn(from, fee);
    }
}
