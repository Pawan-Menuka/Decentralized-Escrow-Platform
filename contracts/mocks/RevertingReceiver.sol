// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal external surface of FreelanceEscrow needed to act as a freelancer.
interface IEscrowAttack {
    function acceptJob(uint256 jobId) external;
    function submitMilestone(uint256 jobId, uint256 mIndex, string calldata deliverableCid) external;
    function withdraw(address token) external;
}

/// @title RevertingReceiver
/// @notice Attack mock (Phase 4) proving the pull-payment thesis: a client's
///         `approveMilestone` (and `claimTimelockRelease`/`resolveDispute`) must NOT be
///         brickable by a freelancer that refuses to accept ETH. Funds are only ever
///         credited to `pendingWithdrawals` during approval — no external call is made
///         there — so approval succeeds regardless of what the recipient does. The
///         failure is isolated entirely to this contract's OWN `withdraw` call, which
///         reverts `EthTransferFailed` once it actually tries to push ETH out.
contract RevertingReceiver {
    IEscrowAttack public immutable escrow;

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

    /// @notice Proxy: attempts this contract's own withdrawal; always fails downstream
    ///         because `receive()` below unconditionally reverts.
    function doWithdraw() external {
        escrow.withdraw(address(0));
    }

    /// @dev Always reverts — this contract can never accept plain ETH transfers.
    receive() external payable {
        revert("RevertingReceiver: refuses ETH");
    }
}
