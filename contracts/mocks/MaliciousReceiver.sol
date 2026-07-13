// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal external surface of FreelanceEscrow needed to act as a freelancer and
///      to attempt a reentrant withdrawal. Kept separate from the real contract so this
///      mock never needs to import (and thus never risks drifting from) the production
///      ABI beyond these three functions.
interface IEscrowAttack {
    function acceptJob(uint256 jobId) external;
    function submitMilestone(uint256 jobId, uint256 mIndex, string calldata deliverableCid) external;
    function withdraw(address token) external;
}

/// @title MaliciousReceiver
/// @notice Attack mock (Phase 4) proving FreelanceEscrow's `withdraw` is reentrancy-safe.
/// @dev Acts as a freelancer via the `doAccept`/`doSubmit` proxies. When paid ETH (i.e.
///      inside the low-level `.call` made by `withdraw`), its `receive()` attempts to
///      re-enter `withdraw` exactly once (guarded by `attempted`, so it can never loop
///      even if the reentrancy guard were somehow absent). Because `withdraw` zeroes
///      `pendingWithdrawals` before the external call (Checks-Effects-Interactions) and
///      is `nonReentrant`, the reentrant call must fail, which makes the inner
///      `.call{value: amount}("")` in the outer `withdraw` return `ok == false`, so the
///      whole `doWithdraw()` transaction reverts with `EthTransferFailed` — the attacker
///      drains nothing beyond its originally credited balance.
contract MaliciousReceiver {
    IEscrowAttack public immutable escrow;

    /// @dev Set true on the first reentrant attempt so `receive()` never recurses twice.
    bool internal attempted;

    constructor(address _escrow) {
        escrow = IEscrowAttack(_escrow);
    }

    /// @notice Proxy: accepts a job as this contract (the freelancer).
    function doAccept(uint256 jobId) external {
        escrow.acceptJob(jobId);
    }

    /// @notice Proxy: submits a milestone deliverable as this contract (the freelancer).
    function doSubmit(uint256 jobId, uint256 mIndex, string calldata cid) external {
        escrow.submitMilestone(jobId, mIndex, cid);
    }

    /// @notice Proxy: triggers this contract's own withdrawal (which will attempt to
    ///         re-enter from `receive()` below).
    function doWithdraw() external {
        escrow.withdraw(address(0));
    }

    /// @dev Re-enters `withdraw` exactly once when paid ETH.
    receive() external payable {
        if (!attempted) {
            attempted = true;
            escrow.withdraw(address(0));
        }
    }
}
